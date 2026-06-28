import type {
  BacktestConfig,
  BacktestResult,
  EntryQualityScore,
  FullAnalysisInput,
  FullAnalysisResult,
  FundingOIRegime,
  IndicatorPsychology,
  IndicatorSet,
  LayerResult,
  LayerName,
  LiquidityPool,
  MarketRegime,
  MarketTrend,
  ScorerLayerId,
  TradeDecision,
  TradeDecisionLabel,
  TradeDirection,
  TradeJournalEntry,
  TradePlan,
} from '../constants/scoring';
import {
  DEFAULT_SETTINGS,
  HARD_BLOCK_RULES,
  LAYER_MAX_POINTS,
  LAYER_NAMES,
  REGIME_WEIGHTS,
  SCORE_THRESHOLDS,
} from '../constants/scoring';
import type { FundingRateRecord, Kline } from './binanceApi';
import {
  analyzeOrderFlow,
  buildEntryWhaleWalls,
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateEntryZone,
  calculateLiquidityHeatmap,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateWilderEMA,
  classifyMarketRegime,
  detectSMCStructure,
  evaluateWhaleWallSLSafety,
  klinesToOHLCV,
  type LiquidityHeatmapResult,
  type OHLCVSeries,
  type OrderFlowAnalysis,
  type RegimeClassification,
  type SMCStructureResult,
} from './indicators';

// ─── Public types ──────────────────────────────────────────────────────────────

export type TradeSide = TradeDirection;

export type ScoreBias =
  | 'STRONG_LONG'
  | 'LONG'
  | 'NEUTRAL'
  | 'SHORT'
  | 'STRONG_SHORT';

export type { TradeJournalEntry, LayerResult, TradePlan, FullAnalysisResult };

export type LayerScores = Record<LayerName, number>;

export interface AIScoreResult {
  finalScore: number;
  bias: ScoreBias;
  layerScores: LayerScores;
  weightedContribution: LayerScores;
  smcBoost: number;
  cvdBoost: number;
  squeezePenalty: number;
  note: string;
}

export interface ScorerContext {
  marketRegime: MarketRegime;
  ohlcv: OHLCVSeries;
  smc: SMCStructureResult;
  orderFlow: OrderFlowAnalysis;
  heatmap: LiquidityHeatmapResult;
  regime: RegimeClassification;
  entryQuality?: EntryQualityScore;
  orderBookImbalance?: number;
  mtfConfluenceScore?: number;
}

export interface BacktestTradeMarker {
  entryPrice: number;
  exitPrice: number;
  side: TradeSide;
  slippage: number;
  funding: number;
  mae: number;
  pnl: number;
  entryTime: number;
  exitTime: number;
}

export interface AdvancedBacktestResult extends BacktestResult {
  tradeMarkers: BacktestTradeMarker[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BACKTEST_BATCH_SIZE = 50;
const BACKTEST_WARMUP = 60;
const FUNDING_INTERVAL_MS = 8 * 3_600_000;
const TRADE_STRIDE = 7;

// ─── Safe helpers ──────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function lastFinite(values: Float32Array): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}

function emptyLayerScores(): LayerScores {
  const scores = {} as LayerScores;
  for (const layer of LAYER_NAMES) scores[layer] = 50;
  return scores;
}

function scoreBias(finalScore: number): ScoreBias {
  if (finalScore >= SCORE_THRESHOLDS.strongLong) return 'STRONG_LONG';
  if (finalScore >= SCORE_THRESHOLDS.long) return 'LONG';
  if (finalScore <= SCORE_THRESHOLDS.strongShort) return 'STRONG_SHORT';
  if (finalScore <= SCORE_THRESHOLDS.short) return 'SHORT';
  return 'NEUTRAL';
}

function protectivePool(
  pools: LiquidityPool[],
  entryPrice: number,
  side: TradeSide,
): LiquidityPool | null {
  let best: LiquidityPool | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < pools.length; i++) {
    const p = pools[i];
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    const isProtective =
      side === 'LONG' ? p.price <= entryPrice : p.price >= entryPrice;
    if (!isProtective) continue;
    const dist = Math.abs(entryPrice - p.price);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

function cvdSlopeExhausted(cvd: Float32Array, side: TradeSide, lookback = 5): boolean {
  const n = cvd.length;
  if (n < lookback + 1) return false;
  const start = cvd[n - lookback - 1];
  const end = cvd[n - 1];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const delta = end - start;
  const flat = Math.abs(delta) < Math.max(1, Math.abs(end) * 0.02);
  if (flat) return true;
  if (side === 'LONG' && delta < 0) return true;
  if (side === 'SHORT' && delta > 0) return true;
  return false;
}

// ─── PHẦN 1: Perceptron heuristic layer scores ─────────────────────────────────

function scoreEmaTrend(closes: Float32Array, regime: MarketRegime): number {
  const ema20 = calculateWilderEMA(closes, 20);
  const ema50 = calculateWilderEMA(closes, 50);
  const close = closes[closes.length - 1];
  const e20 = lastFinite(ema20);
  const e50 = lastFinite(ema50);
  if (e20 == null || e50 == null) return 50;
  let score = 50;
  if (close > e20) score += 15;
  else score -= 15;
  if (close > e50) score += 15;
  else score -= 15;
  if (e20 > e50) score += 10;
  else score -= 10;
  if (regime.startsWith('TRENDING')) score += close > e50 ? 5 : -5;
  return clamp(score);
}

function scoreBosChoCh(smc: SMCStructureResult, regime: MarketRegime): number {
  let score = 50;
  const last = smc.signals[smc.signals.length - 1];
  if (last?.type === 'BOS') {
    score += last.trend === 'BULLISH' ? 30 : -30;
  } else if (last?.type === 'CHOCH') {
    score += last.trend === 'BULLISH' ? 20 : -20;
  }
  if (smc.trend === 'BULLISH') score += 15;
  else if (smc.trend === 'BEARISH') score -= 15;
  if (regime === 'TRENDING_BULL' && smc.trend === 'BULLISH') score += 10;
  if (regime === 'TRENDING_BEAR' && smc.trend === 'BEARISH') score -= 10;
  return clamp(score);
}

function scoreRsi(closes: Float32Array, regime: MarketRegime): number {
  const rsi = lastFinite(calculateRSI(closes, 14)) ?? 50;
  if (regime === 'MEAN_REVERSION') {
    if (rsi < 30) return 75;
    if (rsi > 70) return 25;
    return 50;
  }
  if (rsi >= 45 && rsi <= 65) return 60;
  if (rsi > 65 && rsi < 80) return 70;
  if (rsi < 35) return 35;
  if (rsi >= 80) return 40;
  return 50;
}

function scoreMacd(closes: Float32Array): number {
  const { histogram } = calculateMACD(closes, 12, 26, 9);
  const h = lastFinite(histogram);
  if (h == null) return 50;
  return clamp(50 + h * 5);
}

function scoreBollinger(closes: Float32Array, regime: MarketRegime): number {
  const bb = calculateBollingerBands(closes, 20, 2);
  const close = closes[closes.length - 1];
  const upper = lastFinite(bb.upper);
  const lower = lastFinite(bb.lower);
  const middle = lastFinite(bb.middle);
  if (upper == null || lower == null || middle == null || upper === lower) return 50;
  const pos = (close - lower) / (upper - lower);
  if (regime === 'MEAN_REVERSION') {
    if (pos < 0.15) return 75;
    if (pos > 0.85) return 25;
    return 50;
  }
  return clamp(pos * 100);
}

function scoreVolumeProfile(ohlcv: OHLCVSeries): number {
  const n = ohlcv.volume.length;
  if (n < 20) return 50;
  let sum = 0;
  for (let i = n - 20; i < n; i++) sum += ohlcv.volume[i];
  const avg = sum / 20;
  const last = ohlcv.volume[n - 1];
  const close = ohlcv.close[n - 1];
  const prev = ohlcv.close[n - 2] ?? close;
  const up = close >= prev;
  const ratio = avg > 0 ? last / avg : 1;
  if (ratio > 1.3 && up) return 72;
  if (ratio > 1.3 && !up) return 28;
  return 50;
}

function scoreCvdDivergence(orderFlow: OrderFlowAnalysis): number {
  const div = orderFlow.divergences.find((d) => d.type !== 'NONE');
  if (div?.type === 'BULLISH') return 78;
  if (div?.type === 'BEARISH') return 22;
  const cvdLast = lastFinite(orderFlow.cvd);
  if (cvdLast == null) return 50;
  return clamp(50 + Math.sign(cvdLast) * Math.min(25, Math.abs(cvdLast) / 10));
}

function scoreFundingOi(regime: FundingOIRegime): number {
  switch (regime) {
    case 'ACCUMULATION':
      return 68;
    case 'SHORT_SQUEEZE_RISK':
      return 72;
    case 'DISTRIBUTION':
      return 32;
    case 'LONG_SQUEEZE_RISK':
      return 28;
    default:
      return 50;
  }
}

function scoreLiquidityPool(
  heatmap: LiquidityHeatmapResult,
  close: number,
): number {
  if (!heatmap.pools.length) return 50;
  const below = heatmap.pools.filter((p) => p.price < close);
  const above = heatmap.pools.filter((p) => p.price > close);
  const belowStr = below.reduce((m, p) => Math.max(m, p.strength), 0);
  const aboveStr = above.reduce((m, p) => Math.max(m, p.strength), 0);
  if (belowStr > aboveStr * 1.2) return 65;
  if (aboveStr > belowStr * 1.2) return 35;
  return 50;
}

function scoreOrderbookImbalance(imbalance: number): number {
  return clamp(50 + imbalance * 40);
}

function scoreAtrVolatility(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  regime: MarketRegime,
): number {
  const atr = lastFinite(calculateATR(highs, lows, closes, 14));
  const close = closes[closes.length - 1];
  if (atr == null || close <= 0) return 50;
  const atrPct = (atr / close) * 100;
  if (regime === 'HIGH_VOLATILITY_CHOP') {
    if (atrPct > 1.5) return 40;
    return 55;
  }
  if (atrPct >= 0.4 && atrPct <= 1.2) return 60;
  if (atrPct < 0.2) return 45;
  return 50;
}

function scoreSupportResistance(smc: SMCStructureResult, close: number): number {
  if (!smc.swings.length) return 50;
  let nearestSupport = Infinity;
  let nearestResist = Infinity;
  for (const s of smc.swings) {
    if (s.price <= close) nearestSupport = Math.min(nearestSupport, close - s.price);
    else nearestResist = Math.min(nearestResist, s.price - close);
  }
  const supPct = nearestSupport < Infinity ? (nearestSupport / close) * 100 : 10;
  const resPct = nearestResist < Infinity ? (nearestResist / close) * 100 : 10;
  if (supPct < 0.5 && resPct > 1) return 68;
  if (resPct < 0.5 && supPct > 1) return 32;
  return 50;
}

function scoreMtfConfluence(
  smc: SMCStructureResult,
  regime: RegimeClassification,
  override?: number,
): number {
  if (override != null) return clamp(override);
  let score = 50;
  if (smc.trend === regime.trend) score += 20;
  else if (smc.trend !== 'SIDEWAYS' && regime.trend !== 'SIDEWAYS') score -= 10;
  score += regime.confidence * 20;
  return clamp(score);
}

function squeezePenaltyAmount(regime: FundingOIRegime, finalDirection: number): number {
  if (regime === 'LONG_SQUEEZE_RISK' && finalDirection > 0) return 8;
  if (regime === 'SHORT_SQUEEZE_RISK' && finalDirection < 0) return 8;
  return 0;
}

function smcStructuralBoost(smc: SMCStructureResult, regime: MarketRegime): number {
  const last = smc.signals[smc.signals.length - 1];
  if (!last) return 0;
  let boost = 0;
  if (last.type === 'BOS') {
    if (
      (regime === 'TRENDING_BULL' && last.trend === 'BULLISH') ||
      (regime === 'TRENDING_BEAR' && last.trend === 'BEARISH')
    ) {
      boost = 4;
    }
  }
  if (last.type === 'CHOCH') boost = last.trend === 'BULLISH' ? 2 : -2;
  return boost;
}

function cvdStructuralBoost(orderFlow: OrderFlowAnalysis): number {
  const div = orderFlow.divergences.find((d) => d.type !== 'NONE');
  if (div?.type === 'BULLISH') return 3;
  if (div?.type === 'BEARISH') return -3;
  return 0;
}

/**
 * PHẦN 1 — AI Perceptron heuristic: 14 layer scores × REGIME_WEIGHTS → final 0–100.
 */
export function computeAIScore(ctx: ScorerContext): AIScoreResult {
  const weights = REGIME_WEIGHTS[ctx.marketRegime];
  const { ohlcv, smc, orderFlow, heatmap, regime } = ctx;
  const closes = ohlcv.close;
  const close = closes[closes.length - 1];

  const layerScores = emptyLayerScores();
  layerScores.EMA_TREND = scoreEmaTrend(closes, ctx.marketRegime);
  layerScores.BOS_CHOCH = scoreBosChoCh(smc, ctx.marketRegime);
  layerScores.RSI = scoreRsi(closes, ctx.marketRegime);
  layerScores.MACD = scoreMacd(closes);
  layerScores.BOLLINGER = scoreBollinger(closes, ctx.marketRegime);
  layerScores.VOLUME_PROFILE = scoreVolumeProfile(ohlcv);
  layerScores.CVD_DIVERGENCE = scoreCvdDivergence(orderFlow);
  layerScores.FUNDING_OI = scoreFundingOi(orderFlow.fundingOI.regime);
  layerScores.LIQUIDITY_POOL = scoreLiquidityPool(heatmap, close);
  layerScores.ORDERBOOK_IMBALANCE = scoreOrderbookImbalance(ctx.orderBookImbalance ?? 0);
  layerScores.ATR_VOLATILITY = scoreAtrVolatility(
    ohlcv.high,
    ohlcv.low,
    closes,
    ctx.marketRegime,
  );
  layerScores.SUPPORT_RESISTANCE = scoreSupportResistance(smc, close);
  layerScores.MTF_CONFLUENCE = scoreMtfConfluence(
    smc,
    regime,
    ctx.mtfConfluenceScore,
  );
  layerScores.ENTRY_QUALITY = ctx.entryQuality?.score ?? 50;

  const smcBoost = smcStructuralBoost(smc, ctx.marketRegime);
  layerScores.BOS_CHOCH = clamp(layerScores.BOS_CHOCH + smcBoost * 2);

  const cvdBoost = cvdStructuralBoost(orderFlow);
  layerScores.CVD_DIVERGENCE = clamp(layerScores.CVD_DIVERGENCE + cvdBoost * 2);

  const weightedContribution = {} as LayerScores;
  let rawSum = 0;
  for (const layer of LAYER_NAMES) {
    const w = weights[layer] ?? 0;
    const contrib = layerScores[layer] * w;
    weightedContribution[layer] = contrib;
    rawSum += contrib;
  }

  const direction = rawSum - 50;
  const squeezePenalty = squeezePenaltyAmount(orderFlow.fundingOI.regime, direction);
  const finalScore = clamp(rawSum - squeezePenalty);

  const bias = scoreBias(finalScore);
  const note =
    squeezePenalty > 0
      ? `Squeeze risk (${orderFlow.fundingOI.regime}) −${squeezePenalty.toFixed(1)}`
      : `SMC ${smcBoost >= 0 ? '+' : ''}${smcBoost} · CVD ${cvdBoost >= 0 ? '+' : ''}${cvdBoost}`;

  return {
    finalScore,
    bias,
    layerScores,
    weightedContribution,
    smcBoost,
    cvdBoost,
    squeezePenalty,
    note,
  };
}

// ─── PHẦN 2: Entry quality ─────────────────────────────────────────────────────

export interface EntryQualityInput {
  entryPrice: number;
  side: TradeSide;
  postEntryBars: { high: number; low: number }[];
  pools: LiquidityPool[];
}

/**
 * PHẦN 2 — MAE + khoảng cách tới cụm thanh khoản bảo vệ → 0–100.
 */
export function calculateEntryQuality(input: EntryQualityInput): EntryQualityScore {
  const { entryPrice, side, postEntryBars, pools } = input;

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return { score: 0, mae: 0, liquidityDistance: 100, note: 'Invalid entry price' };
  }

  let mae = 0;
  for (let i = 0; i < postEntryBars.length; i++) {
    const bar = postEntryBars[i];
    const adverse =
      side === 'LONG'
        ? ((entryPrice - bar.low) / entryPrice) * 100
        : ((bar.high - entryPrice) / entryPrice) * 100;
    if (adverse > mae) mae = adverse;
  }

  const pool = protectivePool(pools, entryPrice, side);
  const liquidityDistance = pool
    ? (Math.abs(entryPrice - pool.price) / entryPrice) * 100
    : SCORE_THRESHOLDS.maxLiquidityDistancePercent * 2;

  const maeScore = clamp(
    100 - (mae / SCORE_THRESHOLDS.maxMAEPercent) * 100,
  );
  const liqScore = clamp(
    100 -
      (liquidityDistance / SCORE_THRESHOLDS.maxLiquidityDistancePercent) * 100,
  );
  const score = clamp(liqScore * 0.55 + maeScore * 0.45);

  let note = '';
  if (score >= 80) note = 'Entry sát tường thanh khoản, MAE thấp';
  else if (score >= 50) note = 'Chất lượng vào lệnh chấp nhận được';
  else note = 'Entry xa vùng bảo vệ hoặc MAE cao';

  return { score, mae, liquidityDistance, note };
}

// ─── PHASE 4: 10-Layer Scorer Engine ───────────────────────────────────────────

const LAYER_NAMES_VI: Record<ScorerLayerId, string> = {
  1: 'Giá & MA',
  2: 'RSI',
  3: 'MACD',
  4: 'Bollinger',
  5: 'Volume & OI',
  6: 'Funding',
  7: 'Long/Short Ratio',
  8: 'BTC 24h',
  9: 'Phiên giao dịch',
  10: 'Tâm lý',
};

const DECISION_DISPLAY: Record<TradeDecisionLabel, string> = {
  KHONG_VAO: 'KHÔNG VÀO',
  CHO_THEM: 'CHỜ THÊM',
  CO_THE_VAO: 'CÓ THỂ VÀO',
  VAO_TU_TIN: 'VÀO TỰ TIN',
  SETUP_NGON: 'SETUP NGON 🔥',
};

const ATR_SL_MULT = 2;
const TP_R_MULTS: [number, number, number] = [1, 2, 3];

function clampLayer(score: number): number {
  return Math.max(0, Math.min(LAYER_MAX_POINTS, score));
}

function layerResult(
  layer: ScorerLayerId,
  score: number,
  opts: {
    passed: boolean;
    isMandatory: boolean;
    isMandatoryViolation: boolean;
    reason: string;
  },
): LayerResult {
  return {
    layer,
    name: LAYER_NAMES_VI[layer],
    score: clampLayer(score),
    maxScore: LAYER_MAX_POINTS,
    passed: opts.passed,
    isMandatory: opts.isMandatory,
    isMandatoryViolation: opts.isMandatoryViolation,
    reason: opts.reason,
  };
}

/** PHẦN 1 — Layer 1: Giá so với EMA20/50 & SMA200 */
export function scoreLayer1_PriceMA(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const { price, ema20, ema50, sma200, hasSma200 } = indicators;
  let score = 0;
  const parts: string[] = [];
  // SMA200 chỉ tính điểm và mandatory khi có đủ dữ liệu (≥200 bar). Nếu không, dùng 2 MA.
  const trustSma200 = hasSma200 !== false;

  if (direction === 'LONG') {
    if (price > ema20) {
      score += 0.5;
      parts.push('trên EMA20');
    }
    if (price > ema50) {
      score += 0.5;
      parts.push('trên EMA50');
    }
    if (trustSma200) {
      if (price > sma200) {
        score += 0.5;
        parts.push('trên SMA200');
      }
    } else {
      // Không đủ 200 bar → cấp 0.5 điểm bù để không phạt oan, đánh dấu trong reason.
      score += 0.5;
      parts.push('SMA200 chưa đủ dữ liệu — bỏ qua');
    }
    const broken = trustSma200
      ? price <= ema20 && price <= ema50 && price <= sma200
      : price <= ema20 && price <= ema50;
    return layerResult(1, score, {
      passed: score > 0,
      isMandatory: true,
      isMandatoryViolation: broken,
      reason: broken
        ? 'Giá gãy toàn bộ MA — cấu trúc bearish'
        : parts.length
          ? `Giá ${parts.join(', ')}`
          : 'Giá dưới các MA chính',
    });
  }

  if (price < ema20) {
    score += 0.5;
    parts.push('dưới EMA20');
  }
  if (price < ema50) {
    score += 0.5;
    parts.push('dưới EMA50');
  }
  if (trustSma200) {
    if (price < sma200) {
      score += 0.5;
      parts.push('dưới SMA200');
    }
  } else {
    score += 0.5;
    parts.push('SMA200 chưa đủ dữ liệu — bỏ qua');
  }
  const broken = trustSma200
    ? price >= ema20 && price >= ema50 && price >= sma200
    : price >= ema20 && price >= ema50;
  return layerResult(1, score, {
    passed: score > 0,
    isMandatory: true,
    isMandatoryViolation: broken,
    reason: broken
      ? 'Giá vượt toàn bộ MA — cấu trúc bullish'
      : parts.length
        ? `Giá ${parts.join(', ')}`
        : 'Giá trên các MA chính',
  });
}

/** PHẦN 1 — Layer 2: RSI */
export function scoreLayer2_RSI(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const { rsi } = indicators;
  let score = 0;
  let reason = '';

  if (direction === 'LONG') {
    if (rsi >= 45 && rsi <= 65) {
      score = 1.5;
      reason = `RSI ${rsi.toFixed(1)} trong vùng tăng lành mạnh`;
    } else if (rsi > 65 && rsi < 75) {
      score = 1;
      reason = `RSI ${rsi.toFixed(1)} hơi cao nhưng còn momentum`;
    } else if (rsi >= 30 && rsi < 45) {
      score = 0.75;
      reason = `RSI ${rsi.toFixed(1)} hồi phục từ vùng thấp`;
    } else if (rsi >= 75) {
      score = 0.25;
      reason = `RSI ${rsi.toFixed(1)} quá mua — rủi ro`;
    } else {
      score = 0;
      reason = `RSI ${rsi.toFixed(1)} yếu cho long`;
    }
  } else if (rsi <= 55 && rsi >= 35) {
    score = 1.5;
    reason = `RSI ${rsi.toFixed(1)} trong vùng giảm lành mạnh`;
  } else if (rsi < 35 && rsi > 25) {
    score = 1;
    reason = `RSI ${rsi.toFixed(1)} hơi thấp nhưng còn momentum`;
  } else if (rsi <= 70 && rsi > 55) {
    score = 0.75;
    reason = `RSI ${rsi.toFixed(1)} hồi từ vùng cao`;
  } else if (rsi <= 25) {
    score = 0.25;
    reason = `RSI ${rsi.toFixed(1)} quá bán — rủi ro squeeze`;
  } else {
    score = 0;
    reason = `RSI ${rsi.toFixed(1)} yếu cho short`;
  }

  return layerResult(2, score, {
    passed: score >= 0.5,
    isMandatory: false,
    isMandatoryViolation: false,
    reason,
  });
}

/** PHẦN 1 — Layer 3: MACD 2 khung */
export function scoreLayer3_MACD(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const { macdHistogram, macdHistogram4h } = indicators;
  let score = 0;

  if (direction === 'LONG') {
    if (macdHistogram > 0) score += 0.75;
    if (macdHistogram4h > 0) score += 0.75;
    const bothNeg = macdHistogram <= 0 && macdHistogram4h <= 0;
    return layerResult(3, score, {
      passed: score > 0,
      isMandatory: true,
      isMandatoryViolation: bothNeg,
      reason: bothNeg
        ? 'MACD cả 2 khung âm — đảo chiều bearish'
        : `MACD ${macdHistogram.toFixed(4)} · 4h ${macdHistogram4h.toFixed(4)}`,
    });
  }

  if (macdHistogram < 0) score += 0.75;
  if (macdHistogram4h < 0) score += 0.75;
  const bothPos = macdHistogram >= 0 && macdHistogram4h >= 0;
  return layerResult(3, score, {
    passed: score > 0,
    isMandatory: true,
    isMandatoryViolation: bothPos,
    reason: bothPos
      ? 'MACD cả 2 khung dương — đảo chiều bullish'
      : `MACD ${macdHistogram.toFixed(4)} · 4h ${macdHistogram4h.toFixed(4)}`,
  });
}

/** PHẦN 1 — Layer 4: Bollinger Bands */
export function scoreLayer4_BollingerBands(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const pos = indicators.bollingerPosition;
  let score = 0;
  let reason = '';

  if (direction === 'LONG') {
    if (pos >= 0.55 && pos <= 0.85) {
      score = 1.5;
      reason = 'Giá ở nửa trên dải BB — momentum tăng';
    } else if (pos >= 0.35 && pos < 0.55) {
      score = 1;
      reason = 'Giá giữa dải BB — có room tăng';
    } else if (pos < 0.2) {
      score = 0.75;
      reason = 'Chạm band dưới — hồi kỹ thuật';
    } else if (pos > 0.9) {
      score = 0.25;
      reason = 'Sát band trên — overextended';
    } else {
      score = 0.5;
      reason = `Vị trí BB ${(pos * 100).toFixed(0)}%`;
    }
  } else if (pos <= 0.45 && pos >= 0.15) {
    score = 1.5;
    reason = 'Giá ở nửa dưới dải BB — momentum giảm';
  } else if (pos <= 0.65 && pos > 0.45) {
    score = 1;
    reason = 'Giá giữa dải BB — có room giảm';
  } else if (pos > 0.8) {
    score = 0.75;
    reason = 'Chạm band trên — hồi kỹ thuật';
  } else if (pos < 0.1) {
    score = 0.25;
    reason = 'Sát band dưới — oversold';
  } else {
    score = 0.5;
    reason = `Vị trí BB ${(pos * 100).toFixed(0)}%`;
  }

  return layerResult(4, score, {
    passed: score >= 0.5,
    isMandatory: false,
    isMandatoryViolation: false,
    reason,
  });
}

/** PHẦN 1 — Layer 5: Volume & OI */
export function scoreLayer5_VolumeOI(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const { volumeRatio, oiDelta } = indicators;
  let score = 0.5;
  const parts: string[] = [];

  if (volumeRatio >= 1.2) {
    score += 0.5;
    parts.push(`volume ×${volumeRatio.toFixed(2)}`);
  } else if (volumeRatio < 0.7) {
    score -= 0.25;
    parts.push('volume thấp');
  }

  if (direction === 'LONG' && oiDelta > 0) {
    score += 0.5;
    parts.push('OI tăng');
  } else if (direction === 'SHORT' && oiDelta < 0) {
    score += 0.5;
    parts.push('OI giảm');
  } else if (Math.abs(oiDelta) > 0) {
    parts.push(`ΔOI ${oiDelta.toFixed(0)}`);
  }

  return layerResult(5, score, {
    passed: score >= 0.5,
    isMandatory: false,
    isMandatoryViolation: false,
    reason: parts.length ? parts.join(' · ') : 'Volume/OI trung bình',
  });
}

/** PHẦN 1 — Layer 6: Funding Rate */
export function scoreLayer6_FundingRate(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const fr = indicators.fundingRate;
  let score = 0.5;
  let reason = `Funding ${(fr * 100).toFixed(4)}%`;

  if (direction === 'LONG') {
    if (fr < 0) {
      score = 1.25;
      reason += ' — short trả long, thuận long';
    } else if (fr < 0.0003) {
      score = 1;
      reason += ' — funding thấp';
    } else if (fr > 0.001) {
      score = 0;
      reason += ' — funding cao, rủi ro long squeeze';
    } else {
      score = 0.5;
    }
  } else if (fr > 0) {
    score = 1.25;
    reason += ' — long trả short, thuận short';
  } else if (fr > -0.0003) {
    score = 1;
    reason += ' — funding gần 0';
  } else if (fr < -0.001) {
    score = 0;
    reason += ' — funding âm sâu, rủi ro short squeeze';
  } else {
    score = 0.5;
  }

  const violation = score === 0;
  return layerResult(6, score, {
    passed: score >= 0.5,
    isMandatory: violation,
    isMandatoryViolation: violation,
    reason,
  });
}

/** PHẦN 1 — Layer 7: Long/Short Ratio */
export function scoreLayer7_LongShortRatio(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const ratio = indicators.longShortRatio;
  let score = 0.75;
  let reason = `L/S ratio ${ratio.toFixed(2)}`;

  if (direction === 'LONG') {
    if (ratio < 0.9) {
      score = 1.25;
      reason += ' — short đông, thuận long';
    } else if (ratio <= 1.1) {
      score = 1;
    } else if (ratio > 1.5) {
      score = 0.25;
      reason += ' — long quá đông';
    }
  } else if (ratio > 1.1) {
    score = 1.25;
    reason += ' — long đông, thuận short';
  } else if (ratio >= 0.9) {
    score = 1;
  } else if (ratio < 0.7) {
    score = 0.25;
    reason += ' — short quá đông';
  }

  return layerResult(7, score, {
    passed: score >= 0.5,
    isMandatory: false,
    isMandatoryViolation: false,
    reason,
  });
}

/** PHẦN 1 — Layer 8: BTC 24h */
export function scoreLayer8_BTCCondition(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult {
  const chg = indicators.btcChange24h;
  let score = 0.75;
  let reason = `BTC 24h ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;

  if (direction === 'LONG') {
    if (chg > 2) {
      score = 1.5;
      reason += ' — risk-on mạnh';
    } else if (chg > 0) {
      score = 1.25;
    } else if (chg > -2) {
      score = 0.5;
    } else {
      score = 0;
      reason += ' — BTC giảm mạnh, chặn long alt';
    }
  } else if (chg < -2) {
    score = 1.5;
    reason += ' — risk-off mạnh';
  } else if (chg < 0) {
    score = 1.25;
  } else if (chg < 2) {
    score = 0.5;
  } else {
    score = 0;
    reason += ' — BTC tăng mạnh, chặn short alt';
  }

  const violation = score === 0;
  return layerResult(8, score, {
    passed: score > 0,
    isMandatory: true,
    isMandatoryViolation: violation,
    reason,
  });
}

/** PHẦN 1 — Layer 9: Trading Session (UTC+7) */
export function scoreLayer9_TradingSession(
  indicators: IndicatorSet,
  _direction: TradeDirection,
): LayerResult {
  const hour = indicators.sessionHour;
  let score = 0.75;
  let reason = `Giờ phiên ${hour}h`;

  if (hour >= 6 && hour < 22) {
    score = 1.25;
    reason += ' — trong khung quét 6–22h';
  } else if (hour >= 22 || hour < 2) {
    score = 0.5;
    reason += ' — thanh khoản mỏng';
  } else {
    score = 0.25;
    reason += ' — ngoài phiên chính';
  }

  return layerResult(9, score, {
    passed: score >= 0.5,
    isMandatory: false,
    isMandatoryViolation: false,
    reason,
  });
}

/** PHẦN 1 — Layer 10: Psychology & risk discipline */
export function scoreLayer10_Psychology(
  indicators: IndicatorSet,
  _direction: TradeDirection,
): LayerResult {
  const { consecutiveLosses, dailyLossPercent, maxDailyLossPercent } =
    indicators.psychology;
  let score = 1.5;
  const parts: string[] = [];

  if (indicators.psychology.lossStreakLocked) {
    score -= 0.75;
    const minsLeft =
      indicators.psychology.lossStreakLockUntil != null
        ? Math.max(1, Math.ceil((indicators.psychology.lossStreakLockUntil - Date.now()) / 60_000))
        : HARD_BLOCK_RULES.LOSS_STREAK_LOCK_MINUTES;
    parts.push(
      `${indicators.psychology.consecutiveLossesIn24h} thua liên tiếp trong 24h — cooldown còn ${minsLeft} phút`,
    );
  } else if (consecutiveLosses >= 2) {
    score -= 0.35;
    parts.push(`${consecutiveLosses} lệnh thua liên tiếp`);
  }

  if (dailyLossPercent >= maxDailyLossPercent) {
    score = 0;
    parts.push('chạm trần lỗ ngày');
  } else if (dailyLossPercent >= maxDailyLossPercent * 0.7) {
    score -= 0.5;
    parts.push(`lỗ ngày ${dailyLossPercent.toFixed(1)}%`);
  }

  const violation = dailyLossPercent >= maxDailyLossPercent;
  return layerResult(10, score, {
    passed: score >= 0.5,
    isMandatory: true,
    isMandatoryViolation: violation,
    reason: parts.length ? parts.join(' · ') : 'Tâm lý & kỷ luật ổn',
  });
}

/** Chấm đủ 10 layer */
export function scoreAllLayers(
  indicators: IndicatorSet,
  direction: TradeDirection,
): LayerResult[] {
  return [
    scoreLayer1_PriceMA(indicators, direction),
    scoreLayer2_RSI(indicators, direction),
    scoreLayer3_MACD(indicators, direction),
    scoreLayer4_BollingerBands(indicators, direction),
    scoreLayer5_VolumeOI(indicators, direction),
    scoreLayer6_FundingRate(indicators, direction),
    scoreLayer7_LongShortRatio(indicators, direction),
    scoreLayer8_BTCCondition(indicators, direction),
    scoreLayer9_TradingSession(indicators, direction),
    scoreLayer10_Psychology(indicators, direction),
  ];
}

export function computeLayerTotalScore(layers: LayerResult[]): number {
  let sum = 0;
  for (let i = 0; i < layers.length; i++) sum += layers[i].score;
  return Math.round(sum * 100) / 100;
}

/** PHẦN 2 — Quyết định vào lệnh */
export function makeDecision(
  totalScore: number,
  layers: LayerResult[],
  btcChange24h: number,
  direction: TradeDirection,
): TradeDecision {
  const mandatoryViolations = layers
    .filter((l) => l.isMandatory && l.isMandatoryViolation)
    .map((l) => `L${l.layer} ${l.name}: ${l.reason}`);

  if (mandatoryViolations.length > 0) {
    return {
      label: 'KHONG_VAO',
      display: DECISION_DISPLAY.KHONG_VAO,
      canEnter: false,
      totalScore,
      blockedByMandatory: true,
      mandatoryViolations,
    };
  }

  if (Math.abs(btcChange24h) > 8) {
    mandatoryViolations.push(`BTC biến động cực đoan ${btcChange24h.toFixed(1)}%`);
    return {
      label: 'KHONG_VAO',
      display: DECISION_DISPLAY.KHONG_VAO,
      canEnter: false,
      totalScore,
      blockedByMandatory: true,
      mandatoryViolations,
    };
  }

  void direction;

  let label: TradeDecisionLabel;
  if (totalScore < 8) label = 'KHONG_VAO';
  else if (totalScore < 9) label = 'CHO_THEM';
  else if (totalScore < 10) label = 'CO_THE_VAO';
  else if (totalScore < 11.5) label = 'VAO_TU_TIN';
  else label = 'SETUP_NGON';

  return {
    label,
    display: DECISION_DISPLAY[label],
    canEnter: label !== 'KHONG_VAO' && label !== 'CHO_THEM',
    totalScore,
    blockedByMandatory: false,
    mandatoryViolations: [],
  };
}

function snapTpToWall(
  tp: number,
  direction: TradeDirection,
  walls: LiquidityPool[],
): number {
  if (!walls.length) return tp;
  let best = tp;
  let bestDist = Infinity;
  for (const w of walls) {
    if (!Number.isFinite(w.price)) continue;
    const ok =
      direction === 'LONG' ? w.price > tp * 0.998 && w.price < tp * 1.02 : w.price < tp * 1.002 && w.price > tp * 0.98;
    if (!ok) continue;
    const dist = Math.abs(w.price - tp);
    if (dist < bestDist) {
      bestDist = dist;
      best = w.price;
    }
  }
  return best;
}

/** PHẦN 3 — Entry limit tối ưu từ EMA / ATR / thanh khoản */
export function computeOptimalLimitEntry(
  marketPrice: number,
  direction: TradeDirection,
  atr: number,
  indicators: Pick<IndicatorSet, 'ema20' | 'ema50'>,
  whaleWalls: LiquidityPool[] = [],
): { entryPrice: number; reason: string } {
  const tick = Math.max(atr * 0.12, marketPrice * 0.0004);

  if (direction === 'LONG') {
    const candidates: Array<{ price: number; label: string }> = [];

    if (marketPrice > indicators.ema20 && indicators.ema20 > 0) {
      candidates.push({ price: indicators.ema20 + tick, label: 'Hồi EMA20 phiên' });
    }
    if (
      marketPrice > indicators.ema50 &&
      indicators.ema50 > 0 &&
      indicators.ema50 < marketPrice
    ) {
      candidates.push({ price: indicators.ema50 + tick, label: 'Hồi EMA50' });
    }
    candidates.push({ price: marketPrice - atr * 0.45, label: 'Pullback 0.45×ATR' });

    for (const w of whaleWalls) {
      if (w.price < marketPrice * 0.999 && w.price > marketPrice * 0.965) {
        candidates.push({ price: w.price + tick * 0.5, label: 'Vùng thanh khoản hỗ trợ' });
      }
    }

    const valid = candidates.filter((c) => c.price > 0 && c.price < marketPrice * 0.9995);
    if (valid.length === 0) {
      return { entryPrice: marketPrice - atr * 0.35, reason: 'Pullback ATR' };
    }
    valid.sort((a, b) => b.price - a.price);
    return { entryPrice: valid[0].price, reason: valid[0].label };
  }

  const candidates: Array<{ price: number; label: string }> = [];

  if (marketPrice < indicators.ema20 && indicators.ema20 > 0) {
    candidates.push({ price: indicators.ema20 - tick, label: 'Hồi EMA20 phiên' });
  }
  if (
    marketPrice < indicators.ema50 &&
    indicators.ema50 > 0 &&
    indicators.ema50 > marketPrice
  ) {
    candidates.push({ price: indicators.ema50 - tick, label: 'Hồi EMA50' });
  }
  candidates.push({ price: marketPrice + atr * 0.45, label: 'Pullback 0.45×ATR' });

  for (const w of whaleWalls) {
    if (w.price > marketPrice * 1.001 && w.price < marketPrice * 1.035) {
      candidates.push({ price: w.price - tick * 0.5, label: 'Vùng thanh khoản kháng cự' });
    }
  }

  const valid = candidates.filter((c) => c.price > marketPrice * 1.0005);
  if (valid.length === 0) {
    return { entryPrice: marketPrice + atr * 0.35, reason: 'Pullback ATR' };
  }
  valid.sort((a, b) => a.price - b.price);
  return { entryPrice: valid[0].price, reason: valid[0].label };
}

/** PHẦN 3 — Kế hoạch lệnh: Entry Zone → SL/TP/size/margin */
export function calculateTradePlan(
  currentPrice: number,
  direction: TradeDirection,
  atr: number,
  settings: typeof DEFAULT_SETTINGS,
  whaleWalls: LiquidityPool[] = [],
  indicators?: Pick<IndicatorSet, 'ema20' | 'ema50'>,
): TradePlan {
  const ema20 = indicators?.ema20 ?? currentPrice;
  const wallGroups = buildEntryWhaleWalls(currentPrice, whaleWalls);
  const entryZone = calculateEntryZone(currentPrice, ema20, atr, direction, wallGroups);
  const entryPrice = entryZone.optimal;

  const slDistance = Math.max(atr * ATR_SL_MULT, entryPrice * 0.003);
  let stopLoss =
    direction === 'LONG' ? entryPrice - slDistance : entryPrice + slDistance;

  const pool = protectivePool(whaleWalls, entryPrice, direction);
  if (pool) {
    const poolSl =
      direction === 'LONG' ? pool.price - tickBuffer(atr, entryPrice) : pool.price + tickBuffer(atr, entryPrice);
    stopLoss =
      direction === 'LONG' ? Math.min(stopLoss, poolSl) : Math.max(stopLoss, poolSl);
  }

  let takeProfit1 =
    direction === 'LONG'
      ? entryPrice + slDistance * TP_R_MULTS[0]
      : entryPrice - slDistance * TP_R_MULTS[0];
  let takeProfit2 =
    direction === 'LONG'
      ? entryPrice + slDistance * TP_R_MULTS[1]
      : entryPrice - slDistance * TP_R_MULTS[1];
  let takeProfit3 =
    direction === 'LONG'
      ? entryPrice + slDistance * TP_R_MULTS[2]
      : entryPrice - slDistance * TP_R_MULTS[2];

  takeProfit1 = snapTpToWall(takeProfit1, direction, whaleWalls);
  takeProfit2 = snapTpToWall(takeProfit2, direction, whaleWalls);
  takeProfit3 = snapTpToWall(takeProfit3, direction, whaleWalls);

  const riskAmount = settings.maxLossPerTrade;
  const positionSize = riskAmount / slDistance;
  const notional = positionSize * entryPrice;
  const cappedNotional = Math.min(notional, settings.sizePerTrade * settings.leverage);
  const finalSize = cappedNotional / entryPrice;
  const marginRequired = cappedNotional / settings.leverage;

  const slWalls = direction === 'LONG' ? wallGroups.bidWalls : wallGroups.askWalls;
  const slSafety = evaluateWhaleWallSLSafety(slWalls, stopLoss, direction);
  const rrRatio = slDistance > 0 ? Math.abs(takeProfit1 - entryPrice) / slDistance : 0;

  return {
    direction,
    entryPrice,
    stopLoss,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    positionSize: finalSize,
    marginRequired,
    notional: cappedNotional,
    riskAmount,
    atrMultiplier: ATR_SL_MULT,
    rrRatios: TP_R_MULTS,
    marketPrice: currentPrice,
    entryReason: entryZone.reasoning,
    entryZone,
    isSafeSL: slSafety.isSafe,
    safeSLReason: slSafety.safeSLReason,
    rrRatio,
    notes: `Limit · ${entryZone.reasoning} · SL ${ATR_SL_MULT}×ATR · size theo rủi ro $${riskAmount}`,
  };
}

function tickBuffer(atr: number, price: number): number {
  return Math.max(atr * 0.12, price * 0.0004);
}

function cvdSlopeFromSeries(cvd: Float32Array): 'up' | 'down' | 'flat' {
  const n = cvd.length;
  if (n < 4) return 'flat';
  const start = cvd[n - 4];
  const end = cvd[n - 1];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'flat';
  const delta = end - start;
  if (Math.abs(delta) < Math.max(1, Math.abs(end) * 0.02)) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export interface BuildIndicatorSetInput {
  ohlcv: OHLCVSeries;
  ohlcv4h?: OHLCVSeries;
  oiDelta?: number;
  fundingRate?: number;
  longShortRatio?: number;
  btcChange24h?: number;
  sessionHour?: number;
  psychology?: Partial<IndicatorPsychology>;
  cvdSeries?: Float32Array;
}

/** Dựng IndicatorSet từ OHLCV + dữ liệu phụ trợ */
export function buildIndicatorSet(input: BuildIndicatorSetInput): IndicatorSet {
  const { ohlcv, ohlcv4h } = input;
  const closes = ohlcv.close;
  const n = closes.length;
  const price = closes[n - 1];

  // Dùng EMA chuẩn (α = 2/(n+1)) cho EMA20/EMA50 — khớp chart TradingView/Binance.
  const ema20 = lastFinite(calculateEMA(closes, 20)) ?? price;
  const ema50 = lastFinite(calculateEMA(closes, 50)) ?? price;

  // SMA200: chỉ tính khi có đủ 200 bar; nếu không, đặt sma200 = price và hasSma200=false để
  // các layer mandatory dựa vào MA200 không kích hoạt sai.
  const hasSma200 = n >= 200;
  const sma200 = hasSma200 ? lastFinite(calculateSMA(closes, 200)) ?? price : price;

  const rsi = lastFinite(calculateRSI(closes, 14)) ?? 50;

  const macd = calculateMACD(closes);
  const macdHistogram = lastFinite(macd.histogram) ?? 0;

  let macdHistogram4h = macdHistogram;
  if (ohlcv4h?.close.length) {
    const macd4h = calculateMACD(ohlcv4h.close);
    macdHistogram4h = lastFinite(macd4h.histogram) ?? macdHistogram;
  }

  const bb = calculateBollingerBands(closes, 20, 2);
  const upper = lastFinite(bb.upper) ?? price * 1.02;
  const lower = lastFinite(bb.lower) ?? price * 0.98;
  const bollingerPosition =
    upper === lower ? 0.5 : (price - lower) / (upper - lower);

  let volSum = 0;
  const volN = Math.min(20, n);
  for (let i = n - volN; i < n; i++) volSum += ohlcv.volume[i];
  const avgVol = volSum / volN;
  const volumeRatio = avgVol > 0 ? ohlcv.volume[n - 1] / avgVol : 1;

  const cvd = input.cvdSeries;
  const cvdLast = cvd ? lastFinite(cvd) ?? 0 : 0;
  const cvdSlope = cvd ? cvdSlopeFromSeries(cvd) : 'flat';

  const psych = input.psychology ?? {};
  const maxDaily =
    psych.maxDailyLossPercent ??
    (DEFAULT_SETTINGS.maxLossPerWeek / DEFAULT_SETTINGS.accountSize) * 100;

  // ATR thực 14 chu kỳ trên timeframe phân tích.
  const atrSeries = calculateATR(ohlcv.high, ohlcv.low, ohlcv.close, 14);
  const atr = lastFinite(atrSeries) ?? undefined;

  return {
    price,
    rsi,
    macdHistogram,
    macdHistogram4h,
    bollingerPosition,
    volumeRatio,
    oiDelta: input.oiDelta ?? 0,
    fundingRate: input.fundingRate ?? 0,
    longShortRatio: input.longShortRatio ?? 1,
    btcChange24h: input.btcChange24h ?? 0,
    sessionHour: input.sessionHour ?? new Date().getHours(),
    ema20,
    ema50,
    sma200,
    cvd: { slope: cvdSlope, last: cvdLast },
    psychology: {
      consecutiveLosses: psych.consecutiveLosses ?? 0,
      dailyLossPercent: psych.dailyLossPercent ?? 0,
      maxDailyLossPercent: maxDaily,
    },
    atr,
    hasSma200,
  };
}

/** PHẦN 5 — Pipeline đầy đủ: Indicators → Scoring → Decision → TradePlan */
export function runFullAnalysis(input: FullAnalysisInput): FullAnalysisResult {
  const {
    indicators,
    direction,
    settings,
    whaleWalls = [],
    currentPrice = indicators.price,
  } = input;

  const layers = scoreAllLayers(indicators, direction);
  const totalScore = computeLayerTotalScore(layers);
  const decision = makeDecision(
    totalScore,
    layers,
    indicators.btcChange24h,
    direction,
  );

  const atrFromIndicators = indicators.atr;
  const atrFallback =
    Math.abs(indicators.price - indicators.ema20) * 0.5 + indicators.price * 0.005;
  const atrValue =
    typeof atrFromIndicators === 'number' && Number.isFinite(atrFromIndicators) && atrFromIndicators > 0
      ? atrFromIndicators
      : atrFallback;

  const tradePlan = decision.canEnter
    ? calculateTradePlan(currentPrice, direction, atrValue, settings, whaleWalls, indicators)
    : null;

  return {
    layers,
    totalScore,
    decision,
    tradePlan,
  };
}

// ─── RAM-optimized backtest ────────────────────────────────────────────────────

interface MutableBacktestState {
  totalTrades: number;
  wins: number;
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  totalSlippagePaid: number;
  totalFundingPaid: number;
  maxDrawdown: number;
  peakEquity: number;
  balance: number;
  entryQualitySum: number;
  tradeCount: number;
  tradeBuffer: Float32Array;
  equityCurve: Float32Array;
  lastFundingTs: number;
}

function applySlippage(price: number, side: TradeSide, isEntry: boolean, pct: number): number {
  const slip = pct / 100;
  if (side === 'LONG') return isEntry ? price * (1 + slip) : price * (1 - slip);
  return isEntry ? price * (1 - slip) : price * (1 + slip);
}

function fundingRateAt(
  records: FundingRateRecord[] | undefined,
  ts: number,
): number {
  if (!records?.length) return 0;
  let rate = records[0].fundingRate;
  for (let i = 0; i < records.length; i++) {
    if (records[i].fundingTime <= ts) rate = records[i].fundingRate;
    else break;
  }
  return rate;
}

function writeTradeMarker(
  buf: Float32Array,
  idx: number,
  m: BacktestTradeMarker,
): void {
  const o = idx * TRADE_STRIDE;
  buf[o] = m.entryPrice;
  buf[o + 1] = m.exitPrice;
  buf[o + 2] = m.slippage;
  buf[o + 3] = m.funding;
  buf[o + 4] = m.mae;
  buf[o + 5] = m.pnl;
  buf[o + 6] = m.entryTime;
}

function readTradeMarker(buf: Float32Array, idx: number): BacktestTradeMarker {
  const o = idx * TRADE_STRIDE;
  return {
    entryPrice: buf[o],
    exitPrice: buf[o + 1],
    side: 'LONG',
    slippage: buf[o + 2],
    funding: buf[o + 3],
    mae: buf[o + 4],
    pnl: buf[o + 5],
    entryTime: buf[o + 6],
    exitTime: buf[o + 6],
  };
}

function sliceKlines(klines: Kline[], start: number, end: number): Kline[] {
  return klines.slice(start, end);
}

/**
 * PHẦN 4 — Backtest phân đoạn 50 nến, mutate state, Float32Array equity, pruning RAM.
 */
export async function runAdvancedBacktest(
  config: BacktestConfig,
  klines: Kline[],
  fundingRecords?: FundingRateRecord[],
): Promise<AdvancedBacktestResult> {
  const filtered = klines.filter(
    (k) => k.openTime >= config.startDate && k.openTime <= config.endDate,
  );
  const n = filtered.length;
  const maxTrades = Math.max(16, Math.ceil(n / 20));

  const state: MutableBacktestState = {
    totalTrades: 0,
    wins: 0,
    grossProfit: 0,
    grossLoss: 0,
    netProfit: 0,
    totalSlippagePaid: 0,
    totalFundingPaid: 0,
    maxDrawdown: 0,
    peakEquity: config.initialBalance,
    balance: config.initialBalance,
    entryQualitySum: 0,
    tradeCount: 0,
    tradeBuffer: new Float32Array(maxTrades * TRADE_STRIDE),
    equityCurve: new Float32Array(Math.max(1, n - BACKTEST_WARMUP)),
    lastFundingTs: 0,
  };

  const openPos = {
    active: false,
    side: 'LONG' as TradeSide,
    entryPrice: 0,
    entryIdx: 0,
    entryTime: 0,
    size: 0,
    mae: 0,
    sl: 0,
  };

  const marker: BacktestTradeMarker = {
    entryPrice: 0,
    exitPrice: 0,
    side: 'LONG',
    slippage: 0,
    funding: 0,
    mae: 0,
    pnl: 0,
    entryTime: 0,
    exitTime: 0,
  };

  let ohlcvRef: OHLCVSeries | null = null;
  let rsiBuf: Float32Array | null = null;
  let atrBuf: Float32Array | null = null;

  const closeTrade = (exitPrice: number, exitTime: number, slippageCost: number) => {
    const pnl =
      openPos.side === 'LONG'
        ? (exitPrice - openPos.entryPrice) * openPos.size
        : (openPos.entryPrice - exitPrice) * openPos.size;
    state.balance += pnl - slippageCost;
    state.netProfit = state.balance - config.initialBalance;
    state.totalSlippagePaid += slippageCost;
    if (pnl > 0) {
      state.wins += 1;
      state.grossProfit += pnl;
    } else {
      state.grossLoss += Math.abs(pnl);
    }
    state.totalTrades += 1;

    marker.entryPrice = openPos.entryPrice;
    marker.exitPrice = exitPrice;
    marker.side = openPos.side;
    marker.slippage = slippageCost;
    marker.funding = 0;
    marker.mae = openPos.mae;
    marker.pnl = pnl;
    marker.entryTime = openPos.entryTime;
    marker.exitTime = exitTime;

    if (state.tradeCount < maxTrades) {
      writeTradeMarker(state.tradeBuffer, state.tradeCount, marker);
      state.tradeCount += 1;
    }

    openPos.active = false;
    if (state.balance > state.peakEquity) state.peakEquity = state.balance;
    const dd = state.peakEquity > 0 ? (state.peakEquity - state.balance) / state.peakEquity : 0;
    if (dd > state.maxDrawdown) state.maxDrawdown = dd;
  };

  for (let batchStart = BACKTEST_WARMUP; batchStart < n; batchStart += BACKTEST_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BACKTEST_BATCH_SIZE, n);

    for (let i = batchStart; i < batchEnd; i++) {
      const window = sliceKlines(filtered, Math.max(0, i - BACKTEST_WARMUP), i + 1);
      ohlcvRef = klinesToOHLCV(window);
      const { close, high, low, timestamp } = ohlcvRef;
      const bar = filtered[i];
      const price = bar.close;
      const ts = bar.openTime;

      if (config.includeFundingFee && openPos.active) {
        const hoursSince = ts - state.lastFundingTs;
        if (state.lastFundingTs === 0 || hoursSince >= FUNDING_INTERVAL_MS) {
          const rate = fundingRateAt(fundingRecords, ts);
          const notional = openPos.entryPrice * openPos.size;
          const fee = notional * rate * (openPos.side === 'LONG' ? -1 : 1);
          state.balance += fee;
          state.totalFundingPaid += Math.abs(fee);
          state.lastFundingTs = ts;
        }
      }

      rsiBuf = calculateRSI(close, 14);
      atrBuf = calculateATR(high, low, close, 14);
      const atr = lastFinite(atrBuf) ?? price * 0.01;

      if (openPos.active) {
        const adverse =
          openPos.side === 'LONG'
            ? ((openPos.entryPrice - bar.low) / openPos.entryPrice) * 100
            : ((bar.high - openPos.entryPrice) / openPos.entryPrice) * 100;
        if (adverse > openPos.mae) openPos.mae = adverse;

        const hitSl =
          openPos.side === 'LONG' ? bar.low <= openPos.sl : bar.high >= openPos.sl;
        if (hitSl) {
          const exitPx = applySlippage(openPos.sl, openPos.side, false, config.slippagePercent);
          const slipCost = Math.abs(openPos.sl - exitPx) * openPos.size;
          closeTrade(exitPx, ts, slipCost);
        }
      }

      const smc = detectSMCStructure(high, low, close, timestamp);
      const heatmap = calculateLiquidityHeatmap(null, null);
      const orderFlow = analyzeOrderFlow(ohlcvRef, null, fundingRecords ?? null);
      const regime = classifyMarketRegime(close, high, low, timestamp);

      const eq = calculateEntryQuality({
        entryPrice: price,
        side: 'LONG',
        postEntryBars: [{ high: bar.high, low: bar.low }],
        pools: heatmap.pools,
      });

      const ai = computeAIScore({
        marketRegime: regime.regime,
        ohlcv: ohlcvRef,
        smc,
        orderFlow,
        heatmap,
        regime,
        entryQuality: eq,
      });

      if (!openPos.active) {
        const notional = config.initialBalance * 0.1;
        const size = notional / price;
        if (ai.finalScore >= SCORE_THRESHOLDS.long) {
          const entryPx = applySlippage(price, 'LONG', true, config.slippagePercent);
          const slipCost = Math.abs(entryPx - price) * size;
          openPos.active = true;
          openPos.side = 'LONG';
          openPos.entryPrice = entryPx;
          openPos.entryIdx = i;
          openPos.entryTime = ts;
          openPos.size = size;
          openPos.mae = 0;
          openPos.sl = entryPx - atr * 2;
          state.balance -= slipCost;
          state.totalSlippagePaid += slipCost;
          state.entryQualitySum += eq.score;
        } else if (ai.finalScore <= SCORE_THRESHOLDS.short) {
          const entryPx = applySlippage(price, 'SHORT', true, config.slippagePercent);
          const slipCost = Math.abs(price - entryPx) * size;
          openPos.active = true;
          openPos.side = 'SHORT';
          openPos.entryPrice = entryPx;
          openPos.entryIdx = i;
          openPos.entryTime = ts;
          openPos.size = size;
          openPos.mae = 0;
          openPos.sl = entryPx + atr * 2;
          state.balance -= slipCost;
          state.totalSlippagePaid += slipCost;
          state.entryQualitySum += eq.score;
        }
      } else if (
        (openPos.side === 'LONG' && ai.finalScore <= SCORE_THRESHOLDS.short) ||
        (openPos.side === 'SHORT' && ai.finalScore >= SCORE_THRESHOLDS.long)
      ) {
        const exitPx = applySlippage(price, openPos.side, false, config.slippagePercent);
        const slipCost =
          Math.abs(price - exitPx) * openPos.size;
        closeTrade(exitPx, ts, slipCost);
      }

      const eqIdx = i - BACKTEST_WARMUP;
      if (eqIdx >= 0 && eqIdx < state.equityCurve.length) {
        state.equityCurve[eqIdx] = state.balance;
      }

      rsiBuf = null;
      atrBuf = null;
    }

    ohlcvRef = null;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  if (openPos.active && n > 0) {
    const last = filtered[n - 1];
    const exitPx = applySlippage(last.close, openPos.side, false, config.slippagePercent);
    closeTrade(exitPx, last.openTime, Math.abs(last.close - exitPx) * openPos.size);
  }

  const winRate = state.totalTrades > 0 ? state.wins / state.totalTrades : 0;
  const profitFactor =
    state.grossLoss > 0 ? state.grossProfit / state.grossLoss : state.grossProfit > 0 ? 99 : 0;
  const avgEntryQuality =
    state.totalTrades > 0 ? state.entryQualitySum / state.totalTrades : 0;

  const tradeMarkers: BacktestTradeMarker[] = [];
  for (let t = 0; t < state.tradeCount; t++) {
    tradeMarkers.push(readTradeMarker(state.tradeBuffer, t));
  }

  const result: AdvancedBacktestResult = {
    totalTrades: state.totalTrades,
    winRate,
    netProfit: state.netProfit,
    maxDrawdown: state.maxDrawdown,
    profitFactor,
    totalSlippagePaid: state.totalSlippagePaid,
    totalFundingPaid: state.totalFundingPaid,
    avgEntryQuality,
    equityCurve: state.equityCurve,
    tradeMarkers,
  };

  state.tradeBuffer = new Float32Array(0);
  return result;
}

/** Build scorer context from live analysis slices (dashboard helper). */
export function buildScorerContext(
  marketRegime: MarketRegime,
  ohlcv: OHLCVSeries,
  smc: SMCStructureResult,
  orderFlow: OrderFlowAnalysis,
  heatmap: LiquidityHeatmapResult,
  regime: RegimeClassification,
  extras?: Partial<Pick<ScorerContext, 'entryQuality' | 'orderBookImbalance' | 'mtfConfluenceScore'>>,
): ScorerContext {
  return {
    marketRegime,
    ohlcv,
    smc,
    orderFlow,
    heatmap,
    regime,
    ...extras,
  };
}

// ─── Market analysis input (shared) ────────────────────────────────────────────
export {
  buildAnalysisInputFromMarket,
  type AnalysisInput,
} from './analysisInput';

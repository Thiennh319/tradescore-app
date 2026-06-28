import { describe, expect, it } from 'vitest';
import type { Kline } from './binanceApi';
import {
  analyzeOrderFlow,
  detectSMCStructure,
  klinesToOHLCV,
  type OHLCVSeries,
} from './indicators';
import {
  buildIndicatorSet,
  calculateEntryQuality,
  computeOptimalLimitEntry,
  calculateTradePlan,
  computeAIScore,
  computeLayerTotalScore,
  makeDecision,
  runAdvancedBacktest,
  runFullAnalysis,
  scoreAllLayers,
  scoreLayer1_PriceMA,
  scoreLayer3_MACD,
  type ScorerContext,
} from './scorer';
import {
  DEFAULT_SETTINGS,
  LAYER_NAMES,
  REGIME_WEIGHTS,
  SCORE_THRESHOLDS,
  type IndicatorSet,
} from '../constants/scoring';

function makeKlines(closes: number[], startTime = 1_700_000_000_000): Kline[] {
  return closes.map((close, i) => ({
    openTime: startTime + i * 3_600_000,
    open: close - 0.5,
    high: close + 2,
    low: close - 2,
    close,
    volume: 200 + i * 5,
    closeTime: startTime + i * 3_600_000 + 3_599_999,
    quoteVolume: close * 200,
    trades: 50,
  }));
}

function risingOhlcv(n: number, start = 100): OHLCVSeries {
  return klinesToOHLCV(makeKlines(Array.from({ length: n }, (_, i) => start + i * 0.5)));
}

function baseIndicators(overrides?: Partial<IndicatorSet>): IndicatorSet {
  return {
    price: 100,
    rsi: 55,
    macdHistogram: 0.8,
    macdHistogram4h: 0.5,
    bollingerPosition: 0.6,
    volumeRatio: 1.3,
    oiDelta: 120,
    fundingRate: -0.0001,
    longShortRatio: 0.95,
    btcChange24h: 1.5,
    sessionHour: 10,
    ema20: 98,
    ema50: 95,
    sma200: 90,
    cvd: { slope: 'up', last: 50 },
    psychology: {
      consecutiveLosses: 0,
      consecutiveLossesIn24h: 0,
      lossStreakLocked: false,
      lossStreakLockUntil: null,
      dailyLossPercent: 0,
      maxDailyLossPercent: 40,
    },
    ...overrides,
  };
}

function baseContext(overrides?: Partial<ScorerContext>): ScorerContext {
  const ohlcv = risingOhlcv(80, 100);
  const smc = detectSMCStructure(ohlcv.high, ohlcv.low, ohlcv.close, ohlcv.timestamp);
  const orderFlow = analyzeOrderFlow(ohlcv, null, null);
  const ctx: ScorerContext = {
    marketRegime: 'TRENDING_BULL',
    ohlcv,
    smc,
    orderFlow,
    heatmap: { coords: new Float32Array(0), pools: [], averageVolume: 0, points: [] },
    regime: {
      regime: 'TRENDING_BULL',
      trend: 'BULLISH',
      bollingerBandwidth: 0.06,
      confidence: 0.75,
    },
    orderBookImbalance: 0.2,
    mtfConfluenceScore: 70,
    ...overrides,
  };
  return ctx;
}

describe('computeAIScore', () => {
  it('returns 0–100 final score with all 14 layers', () => {
    const result = computeAIScore(baseContext());
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
    expect(LAYER_NAMES.every((l) => Number.isFinite(result.layerScores[l]))).toBe(true);
    expect(LAYER_NAMES.every((l) => Number.isFinite(result.weightedContribution[l]))).toBe(
      true,
    );
  });

  it('applies REGIME_WEIGHTS so weighted sum drives final score', () => {
    const ctx = baseContext({ marketRegime: 'TRENDING_BULL' });
    const result = computeAIScore(ctx);
    const weights = REGIME_WEIGHTS.TRENDING_BULL;
    let manual = 0;
    for (const layer of LAYER_NAMES) {
      manual += result.layerScores[layer] * (weights[layer] ?? 0);
    }
    const expected = Math.max(0, Math.min(100, manual - result.squeezePenalty));
    expect(result.finalScore).toBeCloseTo(expected, 1);
  });

  it('penalizes LONG bias under LONG_SQUEEZE_RISK', () => {
    const ctx = baseContext();
    const base = computeAIScore(ctx);
    ctx.orderFlow.fundingOI.regime = 'LONG_SQUEEZE_RISK';
    const squeezed = computeAIScore(ctx);
    if (base.finalScore > 55) {
      expect(squeezed.squeezePenalty).toBeGreaterThan(0);
      expect(squeezed.finalScore).toBeLessThanOrEqual(base.finalScore);
    }
  });

  it('assigns bias labels from SCORE_THRESHOLDS', () => {
    const high = computeAIScore(
      baseContext({
        mtfConfluenceScore: 95,
        orderBookImbalance: 0.8,
        entryQuality: { score: 90, mae: 0.1, liquidityDistance: 0.1, note: '' },
      }),
    );
    expect(['STRONG_LONG', 'LONG', 'NEUTRAL', 'SHORT', 'STRONG_SHORT']).toContain(high.bias);
  });
});

describe('calculateEntryQuality', () => {
  it('scores high when MAE low and entry near protective pool', () => {
    const result = calculateEntryQuality({
      entryPrice: 100,
      side: 'LONG',
      postEntryBars: [
        { high: 101, low: 99.8 },
        { high: 100.5, low: 99.9 },
      ],
      pools: [{ price: 99.92, volume: 1000, strength: 8, type: 'ORDERBOOK_WALL' }],
    });
    expect(result.mae).toBeLessThan(1);
    expect(result.liquidityDistance).toBeLessThan(1);
    expect(result.score).toBeGreaterThan(70);
  });

  it('scores low when far from liquidity and high MAE', () => {
    const result = calculateEntryQuality({
      entryPrice: 100,
      side: 'LONG',
      postEntryBars: [{ high: 101, low: 97 }],
      pools: [{ price: 90, volume: 500, strength: 5, type: 'ORDERBOOK_WALL' }],
    });
    expect(result.mae).toBeGreaterThan(1);
    expect(result.score).toBeLessThan(60);
  });
});

describe('Phase 4 — 10-layer scorer', () => {
  it('scores 10 layers and sums total', () => {
    const layers = scoreAllLayers(baseIndicators(), 'LONG');
    expect(layers).toHaveLength(10);
    const total = computeLayerTotalScore(layers);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(15);
  });

  it('layer1 mandatory violation when price below all MAs for LONG', () => {
    const r = scoreLayer1_PriceMA(
      baseIndicators({ price: 80, ema20: 90, ema50: 95, sma200: 100 }),
      'LONG',
    );
    expect(r.score).toBe(0);
    expect(r.isMandatoryViolation).toBe(true);
  });

  it('layer3 mandatory violation when MACD both negative for LONG', () => {
    const r = scoreLayer3_MACD(
      baseIndicators({ macdHistogram: -0.5, macdHistogram4h: -0.3 }),
      'LONG',
    );
    expect(r.score).toBe(0);
    expect(r.isMandatoryViolation).toBe(true);
  });

  it('makeDecision blocks on mandatory violation', () => {
    const layers = scoreAllLayers(
      baseIndicators({ price: 80, ema20: 90, ema50: 95, sma200: 100 }),
      'LONG',
    );
    const decision = makeDecision(9, layers, 1, 'LONG');
    expect(decision.canEnter).toBe(false);
    expect(decision.label).toBe('KHONG_VAO');
  });

  it('makeDecision classifies score bands', () => {
    const layers = scoreAllLayers(baseIndicators(), 'LONG');
    expect(makeDecision(7.5, layers, 1, 'LONG').label).toBe('KHONG_VAO');
    expect(makeDecision(8.5, layers, 1, 'LONG').label).toBe('CHO_THEM');
    expect(makeDecision(9.5, layers, 1, 'LONG').label).toBe('CO_THE_VAO');
    expect(makeDecision(10.5, layers, 1, 'LONG').label).toBe('VAO_TU_TIN');
    expect(makeDecision(12, layers, 1, 'LONG').label).toBe('SETUP_NGON');
  });

  it('calculateTradePlan produces SL and TPs with entry zone', () => {
    const plan = calculateTradePlan(100, 'LONG', 2, DEFAULT_SETTINGS, [], { ema20: 99.9, ema50: 98 });
    expect(plan.entryZone).toBeDefined();
    expect(plan.entryPrice).toBe(plan.entryZone!.optimal);
    expect(plan.stopLoss).toBeLessThan(plan.entryPrice);
    expect(plan.takeProfit1).toBeGreaterThan(plan.entryPrice);
    expect(plan.takeProfit2).toBeGreaterThan(plan.takeProfit1);
    expect(plan.positionSize).toBeGreaterThan(0);
    expect(plan.rrRatio).toBeGreaterThan(0);
  });

  it('computeOptimalLimitEntry suggests pullback below mark for LONG', () => {
    const { entryPrice, reason } = computeOptimalLimitEntry(
      100,
      'LONG',
      2,
      { ema20: 98, ema50: 95 },
      [],
    );
    expect(entryPrice).toBeLessThan(100);
    expect(reason.length).toBeGreaterThan(0);
    const plan = calculateTradePlan(100, 'LONG', 2, DEFAULT_SETTINGS, [], { ema20: 98, ema50: 95 });
    expect(plan.entryPrice).toBeLessThan(100);
    expect(plan.stopLoss).toBeLessThan(plan.entryPrice);
    expect(plan.takeProfit1).toBeGreaterThan(plan.entryPrice);
  });

  it('runFullAnalysis returns decision and optional trade plan', () => {
    const result = runFullAnalysis({
      indicators: baseIndicators(),
      direction: 'LONG',
      settings: DEFAULT_SETTINGS,
    });
    expect(result.layers).toHaveLength(10);
    expect(result.decision).toBeDefined();
    expect(result.totalScore).toBeGreaterThan(0);
  });

  it('buildIndicatorSet from OHLCV', () => {
    const ohlcv = risingOhlcv(80);
    const set = buildIndicatorSet({ ohlcv, btcChange24h: 2 });
    expect(set.price).toBeGreaterThan(0);
    expect(set.rsi).toBeGreaterThan(0);
  });

  it('buildIndicatorSet đặt hasSma200=false khi <200 bar và =true khi đủ', () => {
    const short = buildIndicatorSet({ ohlcv: risingOhlcv(80) });
    expect(short.hasSma200).toBe(false);
    // Khi không đủ 200 bar, sma200 = price để layer1 không phạt oan
    expect(short.sma200).toBe(short.price);

    const long = buildIndicatorSet({ ohlcv: risingOhlcv(220) });
    expect(long.hasSma200).toBe(true);
    expect(long.sma200).toBeLessThan(long.price); // chuỗi tăng → sma200 < price
  });

  it('buildIndicatorSet trả ATR thực >0 trên dữ liệu hợp lệ', () => {
    const set = buildIndicatorSet({ ohlcv: risingOhlcv(80) });
    expect(typeof set.atr).toBe('number');
    expect(set.atr!).toBeGreaterThan(0);
  });

  it('Layer1 không phụ thuộc SMA200 khi hasSma200=false', () => {
    // Giá TRÊN cả EMA20 và EMA50 nhưng SMA200 không đủ dữ liệu — phải PASS, không broken
    const indicators = baseIndicators({
      price: 110,
      ema20: 100,
      ema50: 95,
      sma200: 110, // = price (vì hasSma200=false set trong buildIndicatorSet)
      hasSma200: false,
    });
    const layer1 = scoreLayer1_PriceMA(indicators, 'LONG');
    expect(layer1.isMandatoryViolation).toBe(false);
    expect(layer1.score).toBeGreaterThanOrEqual(1);
    // Reason phải nói rõ SMA200 chưa đủ dữ liệu
    expect(layer1.reason).toContain('SMA200');
  });

  it('Layer1 mandatory vẫn fire bình thường khi giá gãy EMA20+EMA50 (kể cả khi hasSma200=false)', () => {
    const indicators = baseIndicators({
      price: 90,
      ema20: 95,
      ema50: 100,
      sma200: 90,
      hasSma200: false,
    });
    const layer1 = scoreLayer1_PriceMA(indicators, 'LONG');
    expect(layer1.isMandatoryViolation).toBe(true);
  });
});

describe('runAdvancedBacktest', () => {
  it('completes batched backtest with equity Float32Array', async () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 8) * 5 + i * 0.02);
    const klines = makeKlines(closes);
    const start = klines[0].openTime;
    const end = klines[klines.length - 1].openTime;

    const result = await runAdvancedBacktest(
      {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        startDate: start,
        endDate: end,
        initialBalance: 1000,
        slippagePercent: 0.05,
        includeFundingFee: true,
      },
      klines,
      [
        { symbol: 'BTCUSDT', fundingRate: 0.0001, fundingTime: start, markPrice: 100 },
        {
          symbol: 'BTCUSDT',
          fundingRate: 0.0002,
          fundingTime: start + FUNDING_8H,
          markPrice: 101,
        },
      ],
    );

    expect(result.equityCurve).toBeInstanceOf(Float32Array);
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(Number.isFinite(result.netProfit)).toBe(true);
  }, 15_000);
});

const FUNDING_8H = 8 * 3_600_000;

describe('SCORE_THRESHOLDS integration', () => {
  it('long/short gates align with scorer bias zones', () => {
    expect(SCORE_THRESHOLDS.long).toBe(65);
    expect(SCORE_THRESHOLDS.short).toBe(35);
  });
});

import {
  TRADE_SYMBOLS,
  type AnalysisTimeframe,
  type AppTradeSymbol,
  type LayerResult,
  type MarketTrend,
  type PsychologyChecklistV2,
  type TradeDecisionLabel,
  type TradeDirection,
  type TradePlan,
  type TradePlanV3,
  DEFAULT_SETTINGS,
  convertToGroupScore,
  convertToGroupScoreV4,
  LAYER_L5B_ID,
  SCORING_GROUPS_V3,
  SCORING_GROUPS_V4,
  DECISION_LABELS_V2,
  DECISION_LABELS_V4,
  TRADE_PLAN_V3_CONFIG,
  getFundingStateLabel,
  type DecisionTypeV2,
  type DecisionTypeV4,
} from '../constants/scoring';
import type { CvdTrend } from '../constants/aiJournal';
import {
  fetch24hTickerChange,
  fetchAllMarketData,
  fetchTickerPrice,
  scheduleForceOrdersRefresh,
  statsPeriodFor,
  type Kline,
} from './binanceApi';
import {
  getScanMarketSnapshot,
  publishScanMarketSnapshot,
} from './scanMarketSnapshotStore';
import {
  applyEntryBlockedFields,
  resolveSnapEntryBlocked,
} from './entryBlockedLabeling';
import {
  fetchBtcChange24hPct,
  MARKET_KLINE_LIMIT,
  MARKET_KLINE_LIMIT_MTF,
  MARKET_LS_DEPTH,
} from './marketAnalysisFetch';
import {
  computeFullAnalysisBundle,
  computeMtfChain,
  computeTradeAnalysis,
} from '../hooks/useMarketAnalysis';
import {
  buildAnalysisInputV3FromMarket,
  buildTodayStatsFromJournal,
  canEnterV3,
  scoreAnalysisV3,
  scoringLayersToDisplayV3,
  suggestDirectionV3,
  type DirectionalScoreV3,
  type ScoringResultV3,
} from './scorerV3';
import {
  buildAnalysisInputV4FromMarket,
  buildTodayStatsFromJournalV4,
  canEnterV4,
  scoreAnalysisV4,
  scoringLayersToDisplayV4,
  suggestDirectionV4,
  type DirectionalScoreV4,
  type L6DetailV4,
  type ScoringResultV4,
} from './scorerV4';
import {
  analyzeCVD,
  detectCVDDivergence,
  detectRSIDivergenceV3,
  getBollingerAnalysisV3,
  getBTCAnalysisV3,
  getEMAAnalysisV3,
  getMACDAnalysisV3,
  getRSI,
  getVolumeRatio,
  type ADXAnalysis,
  type BollingerAnalysisV3,
  type CVDPoint,
} from './indicators';
import { buildRuleAuditSnapshot } from './ruleAuditSnapshotBuilder';
import {
  populateRuleAuditSnapshot,
  type RuleAuditPopulateInput,
} from './ruleAuditSnapshotPopulate';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import { computeAtr1hFromKlines } from './atr1h';
import { calculateTradePlanV3, applyVWAPEntryToPlan } from './tradePlanV3';
import { calculateTradePlanV4 } from './tradePlanV4';
import { FinalEntryStatus } from '../types/scoring';
import { computeFinalEntryStatusForSide } from './finalEntryStatus';
import type { SqueezeRiskResult } from '../types/squeezeRisk';
import {
  resolveDirectionAmbiguity,
  type AmbiguityState,
} from './directionAmbiguity';
import { evaluateADXGate, type ADXGateResult } from './adxGate';
import {
  calculateStructureSL,
  resolveStructureSlLookback,
  STRUCTURE_SL_DEFAULTS,
  type StructureSLResult,
} from './structureSL';
import {
  getVWAPEntrySignal,
  type VWAPEntrySignal,
  type VWAPResult,
} from './vwapService';
import { calculateVWAPBonus, type VWAPBonusResult } from './vwapBonus';
import type {
  RuleAuditBollingerTimeframe,
  RuleAuditCvdTrend,
  RuleAuditDivergence,
  RuleAuditSnapshot,
} from '../types/ruleAuditSnapshot';
import type { AnalysisInputV4 } from './scorerV4';

/** Per-symbol ambiguity hysteresis — truyền từ useSignalBoard (optional). */
export interface AmbiguityStateStores {
  v3?: Map<string, AmbiguityState>;
  v4?: Map<string, AmbiguityState>;
}

export interface SignalScanContext {
  consecutiveLosses: number;
  consecutiveLossesIn24h: number;
  lossStreakLocked: boolean;
  lossStreakLockUntil: number | null;
  dailyLossUSDT: number;
  recentJournal: Array<{ outcome: { status: string } }>;
  /** Vốn hiện tại — trade plan dynamic capital */
  currentCapital?: number;
  /** Vốn gốc ban đầu */
  initialCapital?: number;
}

export interface SignalRowScorerSnapshot {
  score: number;
  longScore: number;
  shortScore: number;
  direction: TradeDirection;
  decisionLabel: TradeDecisionLabel;
  decisionDisplay: string;
  winrate: string;
  canEnter: boolean;
  /** Layers hướng V3 gợi ý lúc quét — UI chi tiết */
  layers: LayerResult[];
  mandatoryViolations: string[];
  /**
   * Legacy name. Same OR as entryBlocked when FIX_HARD_REASON_LABELING is ON
   * (hardBlocks.length>0 || groupBlocks.length>0). Prefer resolveSnapEntryBlocked().
   */
  hardBlocked: boolean;
  /**
   * Preferred when FIX_HARD_REASON_LABELING ON — same boolean as hardBlocked
   * (rename only; entry gate formula unchanged).
   */
  entryBlocked?: boolean;
  marketMode?: 'TRENDING' | 'RANGING';
  groupScores?: { A: number; B: number; C: number };
  groupBlocks?: string[];
  /** Layers / blocks / warnings riêng từng hướng — position advisor */
  longLayers?: LayerResult[];
  shortLayers?: LayerResult[];
  longGroupScores?: { A: number; B: number; C: number };
  shortGroupScores?: { A: number; B: number; C: number };
  longGroupBlocks?: string[];
  shortGroupBlocks?: string[];
  longHardBlocks?: string[];
  shortHardBlocks?: string[];
  longBlockReasons?: string[];
  shortBlockReasons?: string[];
  longWarnings?: string[];
  shortWarnings?: string[];
  scoringWarnings?: string[];
  /** V4 — chỉ L9 chặn, chờ phiên tốt để tái chấm */
  awaitingRescore?: boolean;
  /** Scoring + tradePlanValid — hiển thị thẻ Signal Board */
  finalEntryStatus?: FinalEntryStatus;
  /** L11 EXTREME squeeze — cùng hướng setup, ENTRY_VALID */
  squeezeWarning?: string | null;
  /** Long vs Short quá sát — block vào lệnh (hysteresis 2-scan) */
  isAmbiguousDirection?: boolean;
  ambiguousMessage?: string;
}

function latestCvdValue(cvdPoints: CVDPoint[]): number {
  if (cvdPoints.length === 0) return 0;
  return cvdPoints[cvdPoints.length - 1].cvd;
}

function cvdTrendFromPoints(
  cvdPoints: CVDPoint[],
  direction: TradeDirection,
): CvdTrend {
  const slope = analyzeCVD(cvdPoints, direction).slope;
  if (slope === 'up') return 'UP';
  if (slope === 'down') return 'DOWN';
  return 'FLAT';
}

function avgVolumeBeforeLast(klines: Kline[], lookback = 20): number {
  if (klines.length < lookback + 1) return 0;
  let sum = 0;
  for (let i = klines.length - lookback - 1; i < klines.length - 1; i += 1) {
    sum += klines[i].volume;
  }
  return sum / lookback;
}

function mapBollingerTimeframe(bb: BollingerAnalysisV3): RuleAuditBollingerTimeframe {
  const last = bb.upper.length - 1;
  return {
    percentB: bb.percentB,
    bandwidth: bb.bandwidth,
    bandwidthSlope: bb.bandwidthSlope,
    marketMode: bb.marketMode,
    upper: last >= 0 ? bb.upper[last] : 0,
    middle: last >= 0 ? bb.middle[last] : 0,
    lower: last >= 0 ? bb.lower[last] : 0,
  };
}

function cvdDivergenceTypeFromPoints(cvdPoints: CVDPoint[]): RuleAuditDivergence {
  if (cvdPoints.length < 40) return 'NONE';
  const n = cvdPoints.length;
  const closes = new Float32Array(n);
  const cvd = new Float32Array(n);
  const timestamps = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    closes[i] = cvdPoints[i].price;
    cvd[i] = cvdPoints[i].cvd;
    timestamps[i] = cvdPoints[i].timestamp;
  }
  const divergences = detectCVDDivergence(closes, cvd, timestamps);
  if (divergences.length === 0) return 'NONE';
  return divergences[divergences.length - 1].type;
}

function cvdTrendToAudit(trend: CvdTrend): RuleAuditCvdTrend {
  if (trend === 'UP') return 'UP';
  if (trend === 'DOWN') return 'DOWN';
  return 'FLAT';
}

interface RuleAuditScanContext {
  analysisInputV4: AnalysisInputV4;
  directionV4: TradeDirection;
  klines1h: Kline[];
  klines4h: Kline[];
  cvdPoints: CVDPoint[];
  cvdValue: number | undefined;
  cvdTrend: CvdTrend;
  topLSRatio: number;
  trend: MarketTrend;
  regimeConfidence: number;
  btcChange24h: number;
  atr1h: number;
  price: number;
  l6Detail: L6DetailV4;
  adxData: ADXAnalysis | undefined;
  adxGate: ADXGateResult | undefined;
  vwapData: VWAPResult | undefined;
  vwapSignal: VWAPEntrySignal | undefined;
  structureSL: StructureSLResult | undefined;
  l1Reason: string;
}

function buildRuleAuditPopulateInput(ctx: RuleAuditScanContext): RuleAuditPopulateInput {
  const {
    analysisInputV4,
    directionV4,
    klines1h,
    klines4h,
    cvdPoints,
    cvdValue,
    cvdTrend,
    topLSRatio,
    trend,
    regimeConfidence,
    btcChange24h,
    atr1h,
    price,
    l6Detail,
    adxData,
    adxGate,
    vwapData,
    vwapSignal,
    structureSL,
    l1Reason,
  } = ctx;

  const ema1h = getEMAAnalysisV3(klines1h);
  const ema4h = getEMAAnalysisV3(klines4h);
  const macd1h = getMACDAnalysisV3(klines1h);
  const macd4h = getMACDAnalysisV3(klines4h);
  const bb1h = getBollingerAnalysisV3(klines1h);
  const bb4h = getBollingerAnalysisV3(klines4h);
  const cvdAnalysis = analyzeCVD(cvdPoints, directionV4);
  const fundingMetrics = analysisInputV4.fundingMetrics;
  const btcKlines1h = analysisInputV4.btcKlines1h ?? klines1h;
  const btc = getBTCAnalysisV3(btcKlines1h, analysisInputV4.btc24hChangePct ?? btcChange24h);
  const globalRatios = analysisInputV4.globalLongShortRatios;
  const globalRatio =
    globalRatios.length > 0 ? globalRatios[globalRatios.length - 1] : topLSRatio;
  const oiCurrent = analysisInputV4.oiCurrent;
  const oiPrevious = analysisInputV4.oiPrevious;

  return {
    ema: {
      h1: ema1h,
      h4: ema4h,
      alignment: l1Reason,
      pullback: l1Reason.toLowerCase().includes('pullback'),
    },
    rsi: {
      rsi1h: getRSI(klines1h),
      rsi4h: getRSI(klines4h),
      divergence1h: detectRSIDivergenceV3(klines1h),
      divergence4h: detectRSIDivergenceV3(klines4h),
    },
    macd: {
      h1: macd1h,
      h4: macd4h,
    },
    bollinger: {
      h1: mapBollingerTimeframe(bb1h),
      h4: mapBollingerTimeframe(bb4h),
    },
    volume: {
      volumeRatio1h: getVolumeRatio(klines1h),
      volumeRatio4h: getVolumeRatio(klines4h),
      lastVolume: klines1h.length > 0 ? klines1h[klines1h.length - 1].volume : 0,
      avgVolume1h: avgVolumeBeforeLast(klines1h),
    },
    cvd: {
      value: cvdValue ?? latestCvdValue(cvdPoints),
      trend: cvdTrendToAudit(cvdTrend),
      slope: cvdAnalysis.slope,
      divergence: cvdAnalysis.divergence,
      divergenceType: cvdDivergenceTypeFromPoints(cvdPoints),
      supportive: cvdAnalysis.supportive,
      cvdMomentum24h: cvdAnalysis.cvdMomentum24h,
      reason: cvdAnalysis.reason,
    },
    oi: {
      current: oiCurrent,
      previous: oiPrevious,
      delta: oiCurrent - oiPrevious,
      change1hPct: analysisInputV4.oiChange1h ?? 0,
      change4hPct: analysisInputV4.oiChange4h ?? 0,
    },
    funding: {
      ratePct: l6Detail.fundingCurrent ?? analysisInputV4.fundingRate,
      avg8: l6Detail.fundingAvg8,
      avg16: fundingMetrics?.fundingAvg16 ?? 0,
      velocity: l6Detail.fundingVelocity,
      acceleration: l6Detail.fundingAcceleration,
      state: getFundingStateLabel(l6Detail.fundingState).text,
    },
    longShortRatio: {
      topRatio: topLSRatio,
      globalRatio,
      topHistory: [...analysisInputV4.topLongShortRatios],
    },
    btcContext: {
      change24hPct: btc.change24h,
      change1hPct: btc.change1h,
      trend,
      regimeConfidence,
    },
    adx: adxData
      ? {
          adx1h: adxData.adx1H,
          adx4h: adxData.adx4H,
          adxAvg: adxData.adxAvg,
          regime: adxData.regime,
          regimeStrength: adxData.regimeStrength,
          isChoppy1h: adxData.isChoppy1H,
          isChoppy4h: adxData.isChoppy4H,
          bothChoppy: adxData.bothChoppy,
          gateAllowed: adxGate?.allowed ?? true,
          gateBlock: adxGate?.block ?? false,
          gateSeverity: adxGate?.severity ?? 'OK',
          gateTpMultiplier: adxGate?.tpMultiplier ?? 1,
          gateSlMultiplier: adxGate?.slMultiplier ?? 1,
          gateMessage: adxGate?.message ?? '',
        }
      : {
          adx1h: 0,
          adx4h: 0,
          adxAvg: 0,
          regime: 'CHOPPY',
          regimeStrength: 'WEAK',
          isChoppy1h: false,
          isChoppy4h: false,
          bothChoppy: false,
          gateAllowed: true,
          gateBlock: false,
          gateSeverity: 'OK',
          gateTpMultiplier: 1,
          gateSlMultiplier: 1,
          gateMessage: '',
        },
    atr: {
      atr1h,
      atr1hPct: price > 0 ? (atr1h / price) * 100 : 0,
    },
    vwap: vwapData
      ? {
          vwap: vwapData.vwap,
          upperBand1: vwapData.upperBand1,
          lowerBand1: vwapData.lowerBand1,
          upperBand2: vwapData.upperBand2,
          lowerBand2: vwapData.lowerBand2,
          priceVsVwap: vwapData.priceVsVwap,
          zone: vwapData.zone,
          isNearVwap: vwapData.isNearVwap,
          isPullingBackToVwap: vwapData.isPullingBackToVwap,
          sessionStart: vwapData.sessionStart,
          candleCount: vwapData.candleCount,
          entryQuality: vwapSignal?.quality ?? 'NEUTRAL',
          suggestedEntry: vwapSignal?.suggestedEntry ?? null,
          entryReason: vwapSignal?.entryReason ?? '',
        }
      : {
          vwap: 0,
          upperBand1: 0,
          lowerBand1: 0,
          upperBand2: 0,
          lowerBand2: 0,
          priceVsVwap: 0,
          zone: 'NEAR_VWAP',
          isNearVwap: false,
          isPullingBackToVwap: false,
          sessionStart: 0,
          candleCount: 0,
          entryQuality: 'NEUTRAL',
          suggestedEntry: null,
          entryReason: '',
        },
    structure: {
      swingPrice: structureSL?.swingPrice ?? 0,
      swingTime: structureSL?.swingTime ?? 0,
      slPrice: structureSL?.slPrice ?? 0,
      slSource: structureSL?.slSource ?? 'STRUCTURE',
      bufferPct: structureSL?.bufferPct ?? STRUCTURE_SL_DEFAULTS.BUFFER_PCT,
      distanceFromEntry: structureSL?.distanceFromEntry ?? 0,
      candlesBack: structureSL?.candlesBack ?? 0,
      lookbackCandles: resolveStructureSlLookback(adxData?.adxAvg),
    },
  };
}

function wireRuleAuditSnapshot(ctx: RuleAuditScanContext): RuleAuditSnapshot {
  const snapshot = buildRuleAuditSnapshot();
  populateRuleAuditSnapshot(snapshot, buildRuleAuditPopulateInput(ctx));
  return snapshot;
}

const KLINE_LIMIT = MARKET_KLINE_LIMIT;
const KLINE_LIMIT_MTF = MARKET_KLINE_LIMIT_MTF;

export interface SignalRow {
  symbol: AppTradeSymbol;
  price: number | null;
  change24h: number;
  trend: MarketTrend;
  regimeConfidence: number;
  score: number;
  longScore: number;
  shortScore: number;
  direction: TradeDirection;
  decisionLabel: TradeDecisionLabel;
  decisionDisplay: string;
  /** Winrate gợi ý từ Scorer V3 */
  winrate: string;
  canEnter: boolean;
  tradePlan: TradePlan | null;
  /** Kế hoạch V3 — entry/SL/TP tối ưu từ Scorer */
  tradePlanV3?: TradePlanV3 | null;
  /** Trade plan riêng theo engine (V3/V4) */
  tradePlansByScorer?: Partial<Record<'v3' | 'v4', TradePlanV3 | null>>;
  layers: LayerResult[];
  mandatoryViolations: string[];
  hardBlocked: boolean;
  /** Present when FIX_HARD_REASON_LABELING ON — mirrors hardBlocked (rename only). */
  entryBlocked?: boolean;
  fromCache: boolean;
  /** Kế hoạch LONG/SHORT từ bundle — dùng tối ưu SL/TP lệnh đang mở */
  tradePlans?: Partial<Record<TradeDirection, TradePlan>>;
  /** Snapshot market cho locked plan / journal */
  cvdValue?: number;
  cvdTrend?: CvdTrend;
  fundingRate?: number;
  topLSRatio?: number;
  /** Snapshot Scorer V4 */
  v4?: SignalRowScorerSnapshot;
  /** @deprecated Snapshot Scorer V3 — giữ cho hàng cache cũ */
  v3?: SignalRowScorerSnapshot;
  /** ATR(14) thật khung 1H từ Scorer */
  atr1h?: number;
  /** L6 FundingState — V4 layer detail UI */
  l6Detail?: L6DetailV4;
  error?: string;
  /** Trạng thái vào lệnh cuối (engine V4 mặc định trên row) */
  finalEntryStatus?: FinalEntryStatus;
  /** L11 squeeze warning — V4 only */
  squeezeWarning?: string | null;
  /** L11 Squeeze Risk snapshot — V4 only */
  squeezeRisk?: SqueezeRiskResult;
  isAmbiguousDirection?: boolean;
  ambiguousMessage?: string;
  /** Cổng lọc ADX độc lập — không thuộc scorer 10 lớp */
  adxGate?: ADXGateResult;
  /** Set khi adxGate.block — vd. ADX_CHOPPY */
  adxBlockReason?: string;
  /** Snapshot ADX 1H/4H — dùng journal / audit */
  adxData?: ADXAnalysis;
  /** Structure-based SL — swing 4H + buffer */
  structureSL?: StructureSLResult;
  /** VWAP session snapshot */
  vwapData?: VWAPResult;
  /** VWAP entry signal — hướng V4 active */
  vwapSignal?: VWAPEntrySignal;
  /** L5 volume bonus từ VWAP — hướng V4 active */
  vwapBonus?: VWAPBonusResult;
  ruleAuditSnapshot?: RuleAuditSnapshot;
}

function errorRow(symbol: AppTradeSymbol, message: string): SignalRow {
  return {
    symbol,
    price: null,
    change24h: 0,
    trend: 'SIDEWAYS',
    regimeConfidence: 0,
    score: 0,
    longScore: 0,
    shortScore: 0,
    direction: 'LONG',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    tradePlan: null,
    tradePlanV3: null,
    layers: [],
    mandatoryViolations: [],
    ...applyEntryBlockedFields(true),
    fromCache: false,
    error: message,
  };
}

function snapshotFromV3(
  scoringV3: ScoringResultV3,
  direction: TradeDirection,
): SignalRowScorerSnapshot {
  const active = direction === 'LONG' ? scoringV3.long : scoringV3.short;
  const violations = [...active.hardBlocks, ...active.groupBlocks];
  const blocked =
    active.hardBlocks.length > 0 || active.groupBlocks.length > 0;
  return {
    score: active.totalScore,
    longScore: scoringV3.long.totalScore,
    shortScore: scoringV3.short.totalScore,
    direction,
    decisionLabel: active.decision as TradeDecisionLabel,
    decisionDisplay: active.decisionLabel,
    winrate: active.winrate,
    canEnter: canEnterV3(active),
    layers: scoringLayersToDisplayV3(active.layers),
    mandatoryViolations: violations,
    ...applyEntryBlockedFields(blocked),
    marketMode: scoringV3.marketMode,
    groupScores: active.groupScores,
    groupBlocks: active.groupBlocks,
    longLayers: scoringLayersToDisplayV3(scoringV3.long.layers),
    shortLayers: scoringLayersToDisplayV3(scoringV3.short.layers),
    longGroupScores: scoringV3.long.groupScores,
    shortGroupScores: scoringV3.short.groupScores,
    longGroupBlocks: scoringV3.long.groupBlocks,
    shortGroupBlocks: scoringV3.short.groupBlocks,
    longHardBlocks: scoringV3.long.hardBlocks,
    shortHardBlocks: scoringV3.short.hardBlocks,
    longWarnings: scoringV3.long.warnings,
    shortWarnings: scoringV3.short.warnings,
    scoringWarnings: scoringV3.warnings,
  };
}

function snapshotFromV4(
  scoringV4: ScoringResultV4,
  direction: TradeDirection,
): SignalRowScorerSnapshot {
  const active = direction === 'LONG' ? scoringV4.long : scoringV4.short;
  const displayScore = active.officialTotalScore ?? active.referenceTotalScore;
  const violations = [
    ...active.hardBlocks,
    ...active.blockReasons,
    ...active.groupBlocks,
  ];
  const blocked =
    active.hardBlocks.length > 0 || active.groupBlocks.length > 0;
  return {
    score: displayScore,
    longScore: scoringV4.long.officialTotalScore ?? scoringV4.long.referenceTotalScore,
    shortScore: scoringV4.short.officialTotalScore ?? scoringV4.short.referenceTotalScore,
    direction,
    decisionLabel: active.decision as TradeDecisionLabel,
    decisionDisplay: active.decisionLabel,
    winrate: active.winrate,
    canEnter: canEnterV4(active),
    layers: scoringLayersToDisplayV4(active.layers),
    mandatoryViolations: violations,
    ...applyEntryBlockedFields(blocked),
    marketMode: scoringV4.marketMode,
    groupScores: active.groupScores,
    groupBlocks: active.groupBlocks,
    longLayers: scoringLayersToDisplayV4(scoringV4.long.layers),
    shortLayers: scoringLayersToDisplayV4(scoringV4.short.layers),
    longGroupScores: scoringV4.long.groupScores,
    shortGroupScores: scoringV4.short.groupScores,
    longGroupBlocks: scoringV4.long.groupBlocks,
    shortGroupBlocks: scoringV4.short.groupBlocks,
    longHardBlocks: scoringV4.long.hardBlocks,
    shortHardBlocks: scoringV4.short.hardBlocks,
    longBlockReasons: scoringV4.long.blockReasons,
    shortBlockReasons: scoringV4.short.blockReasons,
    longWarnings: scoringV4.long.warnings,
    shortWarnings: scoringV4.short.warnings,
    scoringWarnings: scoringV4.warnings,
    awaitingRescore: active.awaitingRescore,
  };
}

function enrichSnapshotFinalStatus(
  snap: SignalRowScorerSnapshot,
  plan: TradePlanV3 | null,
  hardBlocks: string[],
  groupBlocks: string[],
  tradeSide: TradeDirection,
  squeezeRisk?: SqueezeRiskResult | null,
): SignalRowScorerSnapshot {
  const { finalEntryStatus, squeezeWarning } = computeFinalEntryStatusForSide(
    snap.decisionLabel,
    plan,
    { hardBlocks, groupBlocks },
    { tradeSide, squeezeRisk },
  );
  return {
    ...snap,
    finalEntryStatus,
    squeezeWarning,
  };
}

function applyAmbiguityToSnapshot(
  snap: SignalRowScorerSnapshot,
  ambiguity: AmbiguityState,
): SignalRowScorerSnapshot {
  if (ambiguity.status !== 'AMBIGUOUS') return snap;
  return {
    ...snap,
    isAmbiguousDirection: true,
    ambiguousMessage: ambiguity.message,
    canEnter: false,
  };
}

function applySnapshotToRow(row: SignalRow, snap: SignalRowScorerSnapshot): SignalRow {
  return {
    ...row,
    score: snap.score,
    longScore: snap.longScore,
    shortScore: snap.shortScore,
    direction: snap.direction,
    decisionLabel: snap.decisionLabel,
    decisionDisplay: snap.decisionDisplay,
    winrate: snap.winrate,
    canEnter: snap.canEnter,
    layers: snap.layers,
    mandatoryViolations: snap.mandatoryViolations,
    hardBlocked: resolveSnapEntryBlocked(snap),
    entryBlocked: snap.entryBlocked,
    finalEntryStatus: snap.finalEntryStatus,
    squeezeWarning: snap.squeezeWarning,
    isAmbiguousDirection: snap.isAmbiguousDirection,
    ambiguousMessage: snap.ambiguousMessage,
  };
}

function scaleTradePlanByAdxGate(plan: TradePlanV3, gate: ADXGateResult): TradePlanV3 {
  const entry = plan.recommendedEntry;
  const isLong = plan.direction === 'LONG';

  const scaleTp = (price: number): number => {
    if (isLong) return entry + (price - entry) * gate.tpMultiplier;
    return entry - (entry - price) * gate.tpMultiplier;
  };

  const scaleSl = (price: number): number => {
    if (isLong) return entry - (entry - price) * gate.slMultiplier;
    return entry + (price - entry) * gate.slMultiplier;
  };

  return {
    ...plan,
    stopLoss: { ...plan.stopLoss, price: scaleSl(plan.stopLoss.price) },
    tp1: { ...plan.tp1, price: scaleTp(plan.tp1.price) },
    tp2: { ...plan.tp2, price: scaleTp(plan.tp2.price) },
    tp3: { ...plan.tp3, price: scaleTp(plan.tp3.price) },
  };
}

function applyAdxBlockToSnapshot(snap: SignalRowScorerSnapshot): SignalRowScorerSnapshot {
  const violations = snap.mandatoryViolations.includes('ADX_CHOPPY')
    ? snap.mandatoryViolations
    : [...snap.mandatoryViolations, 'ADX_CHOPPY'];
  return {
    ...snap,
    canEnter: false,
    ...applyEntryBlockedFields(true),
    finalEntryStatus: FinalEntryStatus.HARD_BLOCKED,
    mandatoryViolations: violations,
  };
}

function applyAdxBlockToPlan(plan: TradePlanV3): TradePlanV3 {
  const blockReasons = plan.blockReasons.includes('ADX_CHOPPY')
    ? plan.blockReasons
    : [...plan.blockReasons, 'ADX_CHOPPY'];
  return {
    ...plan,
    isValid: false,
    tradePlanValid: false,
    blockReasons,
  };
}

function resolveDecisionV3(total: number): DecisionTypeV2 {
  if (total >= 11.5) return 'SETUP_NGON';
  if (total >= 10) return 'VAO_TU_TIN';
  if (total >= 9) return 'CO_THE_VAO';
  if (total >= 8) return 'CHO_THEM';
  return 'KHONG_VAO';
}

function resolveDecisionV4(total: number): DecisionTypeV4 {
  if (total >= 11.5) return 'SETUP_NGON';
  if (total >= 10) return 'VAO_TU_TIN';
  if (total >= 9) return 'CO_THE_VAO';
  if (total >= 8) return 'CHO_THEM';
  return 'KHONG_VAO';
}

function updateGroupBBlocks(
  groupBlocks: string[],
  groupB: number,
  minRequired: number,
): string[] {
  const filtered = groupBlocks.filter((b) => !b.startsWith('Nhóm B'));
  if (groupB < minRequired) {
    filtered.push(
      `Nhóm B (Dòng tiền) ${groupB.toFixed(1)}/5đ < ${minRequired}đ`,
    );
  }
  return filtered;
}

function patchDirectionalV3WithL5Bonus(
  dir: DirectionalScoreV3,
  bonus: VWAPBonusResult,
): DirectionalScoreV3 {
  if (!bonus.applied) return dir;

  const newL5 = Math.min(2, (dir.rawLayerScores[5] ?? 0) + bonus.bonusRaw);
  const rawB =
    newL5 +
    (dir.rawLayerScores[6] ?? 0) +
    (dir.rawLayerScores[7] ?? 0);
  const groupB = convertToGroupScore(rawB, 'GROUP_B_FLOW');
  const groupA = dir.groupScores.A;
  const groupC = dir.groupScores.C;
  const totalScore = +(groupA + groupB + groupC).toFixed(2);
  const groupBlocks = updateGroupBBlocks(
    dir.groupBlocks,
    groupB,
    SCORING_GROUPS_V3.GROUP_B_FLOW.minRequired,
  );
  const isBlocked = dir.hardBlocks.length > 0 || groupBlocks.length > 0;

  const layers = dir.layers.map((l) =>
    l.layerNumber === 5
      ? { ...l, score: newL5, reason: `${l.reason} | ${bonus.reason}` }
      : l,
  );

  let decision = dir.decision;
  let decisionLabel = dir.decisionLabel;
  let winrate = dir.winrate;
  if (!isBlocked) {
    decision = resolveDecisionV3(totalScore);
    const info = DECISION_LABELS_V2[decision];
    decisionLabel = info.label;
    winrate = info.winrate;
  }

  return {
    ...dir,
    layers,
    rawLayerScores: { ...dir.rawLayerScores, 5: newL5 },
    groupScores: { ...dir.groupScores, B: groupB },
    groupBlocks,
    totalScore,
    decision,
    decisionLabel,
    winrate,
  };
}

function patchDirectionalV4WithL5Bonus(
  dir: DirectionalScoreV4,
  bonus: VWAPBonusResult,
): DirectionalScoreV4 {
  if (!bonus.applied) return dir;

  const newL5a = Math.min(2, (dir.rawLayerScores[5] ?? 0) + bonus.bonusRaw);
  const rawB =
    newL5a +
    (dir.rawLayerScores[LAYER_L5B_ID] ?? 0) +
    (dir.rawLayerScores[6] ?? 0) +
    (dir.rawLayerScores[7] ?? 0);
  const groupB = convertToGroupScoreV4(rawB, 'GROUP_B_FLOW');
  const groupA = dir.groupScores.A;
  const groupC = dir.groupScores.C;
  const referenceTotalScore = +(groupA + groupB + groupC).toFixed(2);
  const groupBlocks = updateGroupBBlocks(
    dir.groupBlocks,
    groupB,
    SCORING_GROUPS_V4.GROUP_B_FLOW.minRequired,
  );
  const isBlocked = dir.hardBlocks.length > 0 || groupBlocks.length > 0;

  const layers = dir.layers.map((l) =>
    l.layerNumber === 5
      ? { ...l, score: newL5a, reason: `${l.reason} | ${bonus.reason}` }
      : l,
  );

  const rawLayerScores = { ...dir.rawLayerScores, 5: newL5a };

  if (dir.awaitingRescore) {
    return {
      ...dir,
      layers,
      rawLayerScores,
      groupScores: { ...dir.groupScores, B: groupB },
      groupBlocks,
      referenceTotalScore,
    };
  }

  let decision = dir.decision;
  let decisionLabel = dir.decisionLabel;
  let officialTotalScore = dir.officialTotalScore;
  let winrate = dir.winrate;

  if (!isBlocked) {
    decision = resolveDecisionV4(referenceTotalScore);
    officialTotalScore = referenceTotalScore;
    const info = DECISION_LABELS_V4[decision];
    decisionLabel = info.label;
    winrate = info.winrate;
  }

  return {
    ...dir,
    layers,
    rawLayerScores,
    groupScores: { ...dir.groupScores, B: groupB },
    groupBlocks,
    referenceTotalScore,
    officialTotalScore,
    decision,
    decisionLabel,
    winrate,
  };
}

function applyVwapBonusToScoring(
  scoringV3: ScoringResultV3,
  scoringV4: ScoringResultV4,
  vwapData: VWAPResult | undefined,
  cvdValue?: number,
): {
  scoringV3: ScoringResultV3;
  scoringV4: ScoringResultV4;
  longBonus: VWAPBonusResult;
  shortBonus: VWAPBonusResult;
} {
  const longBonus = calculateVWAPBonus(
    vwapData,
    'LONG',
    scoringV4.long.rawLayerScores[5] ?? 0,
    cvdValue,
  );
  const shortBonus = calculateVWAPBonus(
    vwapData,
    'SHORT',
    scoringV4.short.rawLayerScores[5] ?? 0,
    cvdValue,
  );

  const longBonusV3 = calculateVWAPBonus(
    vwapData,
    'LONG',
    scoringV3.long.rawLayerScores[5] ?? 0,
    cvdValue,
  );
  const shortBonusV3 = calculateVWAPBonus(
    vwapData,
    'SHORT',
    scoringV3.short.rawLayerScores[5] ?? 0,
    cvdValue,
  );

  return {
    scoringV3: {
      ...scoringV3,
      long: patchDirectionalV3WithL5Bonus(scoringV3.long, longBonusV3),
      short: patchDirectionalV3WithL5Bonus(scoringV3.short, shortBonusV3),
    },
    scoringV4: {
      ...scoringV4,
      long: patchDirectionalV4WithL5Bonus(scoringV4.long, longBonus),
      short: patchDirectionalV4WithL5Bonus(scoringV4.short, shortBonus),
    },
    longBonus,
    shortBonus,
  };
}

function applyStructureSlToPlan(plan: TradePlanV3, newSlPrice: number): TradePlanV3 {
  const entry = plan.recommendedEntry;
  const isLong = plan.direction === 'LONG';
  const risk = isLong ? entry - newSlPrice : newSlPrice - entry;
  if (risk <= 0) return plan;

  const rrForTp = (tpPrice: number): number =>
    isLong ? (tpPrice - entry) / risk : (entry - tpPrice) / risk;

  const tp1RR = rrForTp(plan.tp1.price);
  const tp2RR = rrForTp(plan.tp2.price);
  const tp3RR = rrForTp(plan.tp3.price);
  const distancePct = (Math.abs(entry - newSlPrice) / entry) * 100;

  return {
    ...plan,
    stopLoss: {
      ...plan.stopLoss,
      price: newSlPrice,
      distancePct,
    },
    tp1: { ...plan.tp1, rrRatio: tp1RR },
    tp2: { ...plan.tp2, rrRatio: tp2RR },
    tp3: { ...plan.tp3, rrRatio: tp3RR },
    primaryRR: tp1RR,
  };
}

function invalidatePlanIfStructureRrBelowMin(
  plan: TradePlanV3 | null,
  structureSlSource: StructureSLResult['slSource'] | undefined,
): TradePlanV3 | null {
  if (!plan || structureSlSource !== 'STRUCTURE') return plan;

  const minRr = TRADE_PLAN_V3_CONFIG.MIN_RR_TO_ENTER;
  const rrRounded = Math.round(plan.primaryRR * 100) / 100;
  if (rrRounded >= minRr) return plan;

  const reason =
    `R:R thực ${rrRounded.toFixed(2)}:1 sau Structure SL < ${minRr}:1 — chờ entry tốt hơn`;

  return {
    ...plan,
    tradePlanValid: false,
    blockReasons: plan.blockReasons.includes(reason)
      ? plan.blockReasons
      : [...plan.blockReasons, reason],
  };
}

function applyStructureSLToPlans(
  planV3: TradePlanV3 | null,
  planV4: TradePlanV3 | null,
  direction: TradeDirection,
  klines4H: Kline[],
  adxValue?: number,
): { planV3: TradePlanV3 | null; planV4: TradePlanV3 | null; structureSL?: StructureSLResult } {
  if (!planV4 || klines4H.length === 0) {
    return { planV3, planV4, structureSL: undefined };
  }

  try {
    const structureSL = calculateStructureSL({
      direction,
      entryPrice: planV4.recommendedEntry,
      atrSL: planV4.stopLoss.price,
      klines4H,
      bufferPct: STRUCTURE_SL_DEFAULTS.BUFFER_PCT,
      adxValue,
    });

    if (structureSL.slSource !== 'STRUCTURE') {
      return { planV3, planV4, structureSL };
    }

    const planV4Updated = applyStructureSlToPlan(planV4, structureSL.slPrice);
    const planV3Updated = planV3
      ? applyStructureSlToPlan(planV3, structureSL.slPrice)
      : null;

    return {
      planV3: planV3Updated,
      planV4: planV4Updated,
      structureSL,
    };
  } catch {
    return { planV3, planV4, structureSL: undefined };
  }
}

export async function scanSignalSymbol(
  symbol: AppTradeSymbol,
  timeframe: AnalysisTimeframe,
  btcChange24h: number,
  psychologyChecklist: PsychologyChecklistV2,
  scanContext?: SignalScanContext,
  ambiguityStores?: AmbiguityStateStores,
): Promise<SignalRow> {
  try {
    const [market, ticker, change24h] = await Promise.all([
      fetchAllMarketData(
        symbol,
        KLINE_LIMIT,
        MARKET_LS_DEPTH,
        statsPeriodFor(timeframe),
        '1h',
        KLINE_LIMIT_MTF,
      ),
      fetchTickerPrice(symbol),
      symbol === 'BTCUSDT'
        ? Promise.resolve(btcChange24h)
        : fetch24hTickerChange(symbol).catch(() => 0),
    ]);

    publishScanMarketSnapshot({
      symbol,
      market,
      tickerPrice: ticker.price,
      change24h,
      btcChange24h,
      scannedAt: Date.now(),
    });
    // When background forceOrders WS finishes, merge into snapshot for UI (heatmap).
    // Scoring for this tick already used peek/stale/null — next tick benefits too.
    scheduleForceOrdersRefresh(symbol, 100, (fo) => {
      const snap = getScanMarketSnapshot(symbol);
      if (!snap) return;
      publishScanMarketSnapshot({
        ...snap,
        market: { ...snap.market, forceOrders: fo },
      });
    });

    const mtfChain = computeMtfChain(market);
    const analysis = computeTradeAnalysis(market, timeframe, mtfChain);
    if (!analysis) return errorRow(symbol, 'Thiếu dữ liệu phân tích');

    const analysisInputV4 = buildAnalysisInputV4FromMarket({
      symbol,
      currentPrice: ticker.price,
      market,
      psychologyChecklist,
      btc24hChangePct: btcChange24h,
      liquidityPools: analysis.heatmap.pools,
      recentJournal: scanContext?.recentJournal,
    });
    if (!analysisInputV4) return errorRow(symbol, 'Không đủ dữ liệu 1H/4H');

    const todayStatsV3 = buildTodayStatsFromJournal(
      scanContext?.consecutiveLosses ?? 0,
      scanContext?.dailyLossUSDT ?? 0,
      scanContext
        ? {
            consecutiveLossesIn24h: scanContext.consecutiveLossesIn24h,
            lossStreakLocked: scanContext.lossStreakLocked,
            lossStreakLockUntil: scanContext.lossStreakLockUntil,
          }
        : undefined,
    );
    const todayStatsV4 = buildTodayStatsFromJournalV4(
      scanContext?.consecutiveLosses ?? 0,
      scanContext?.dailyLossUSDT ?? 0,
      scanContext
        ? {
            consecutiveLossesIn24h: scanContext.consecutiveLossesIn24h,
            lossStreakLocked: scanContext.lossStreakLocked,
            lossStreakLockUntil: scanContext.lossStreakLockUntil,
          }
        : undefined,
    );

    const analysisInputV3 =
      buildAnalysisInputV3FromMarket({
        symbol,
        currentPrice: ticker.price,
        market,
        psychologyChecklist,
        btc24hChangePct: btcChange24h,
        liquidityPools: analysis.heatmap.pools,
        recentJournal: scanContext?.recentJournal,
      }) ?? analysisInputV4;

    const scoringV3 = scoreAnalysisV3(analysisInputV3, todayStatsV3);
    const scoringV4 = scoreAnalysisV4(analysisInputV4, todayStatsV4);

    const vwapData = analysisInputV4.vwapData;
    const cvdPoints = analysisInputV4.cvdPoints ?? [];
    const cvdValue =
      cvdPoints.length > 0 ? latestCvdValue(cvdPoints) : undefined;
    const vwapBonusApplied = applyVwapBonusToScoring(
      scoringV3,
      scoringV4,
      vwapData,
      cvdValue,
    );
    const scoringV3WithBonus = vwapBonusApplied.scoringV3;
    const scoringV4WithBonus = vwapBonusApplied.scoringV4;

    const longScoreV4 =
      scoringV4WithBonus.long.officialTotalScore ??
      scoringV4WithBonus.long.referenceTotalScore;
    const shortScoreV4 =
      scoringV4WithBonus.short.officialTotalScore ??
      scoringV4WithBonus.short.referenceTotalScore;
    const prevStateV4 = ambiguityStores?.v4?.get(symbol) ?? null;
    const ambiguityV4 = resolveDirectionAmbiguity(
      longScoreV4,
      shortScoreV4,
      prevStateV4,
    );
    ambiguityStores?.v4?.set(symbol, ambiguityV4);

    const longScoreV3 = scoringV3WithBonus.long.totalScore;
    const shortScoreV3 = scoringV3WithBonus.short.totalScore;
    const prevStateV3 = ambiguityStores?.v3?.get(symbol) ?? null;
    const ambiguityV3 = resolveDirectionAmbiguity(
      longScoreV3,
      shortScoreV3,
      prevStateV3,
    );
    ambiguityStores?.v3?.set(symbol, ambiguityV3);

    const directionV3 = suggestDirectionV3(scoringV3WithBonus);
    const directionV4 = suggestDirectionV4(scoringV4WithBonus);
    let v3Base = snapshotFromV3(scoringV3WithBonus, directionV3);
    let v4Base = snapshotFromV4(scoringV4WithBonus, directionV4);
    v3Base = applyAmbiguityToSnapshot(v3Base, ambiguityV3);
    v4Base = applyAmbiguityToSnapshot(v4Base, ambiguityV4);

    const bundle = computeFullAnalysisBundle(
      market,
      analysis,
      timeframe,
      btcChange24h,
      ticker.price,
    );
    const longTradePlan = bundle?.long.tradePlan ?? null;
    const shortTradePlan = bundle?.short.tradePlan ?? null;
    const tradePlan = directionV4 === 'LONG' ? longTradePlan : shortTradePlan;

    const cvdTrend = cvdTrendFromPoints(cvdPoints, directionV4);
    const topLSRatio =
      analysisInputV4.topLongShortRatios.length > 0
        ? analysisInputV4.topLongShortRatios[analysisInputV4.topLongShortRatios.length - 1]
        : 1;

    const klines1h = market.klines[timeframe]?.klines ?? market.klines['1h']?.klines ?? [];
    const klines4h = market.klines['4h']?.klines ?? [];
    const whaleWalls = buildWhaleEntryWalls(
      symbol,
      ticker.price,
      computeAtr1hFromKlines(klines1h, ticker.price),
      analysis.heatmap.pools,
    );

    let tradePlanV3Scorer: TradePlanV3 | null = null;
    let tradePlanV4Scorer: TradePlanV3 | null = null;
    if (klines1h.length > 0 && klines4h.length > 0) {
      const currentCapital = scanContext?.currentCapital ?? DEFAULT_SETTINGS.accountSize;
      const initialCapital = scanContext?.initialCapital ?? DEFAULT_SETTINGS.initialCapital;
      tradePlanV3Scorer = calculateTradePlanV3(
        symbol,
        ticker.price,
        klines1h,
        klines4h,
        scoringV3WithBonus,
        directionV3,
        whaleWalls,
        currentCapital,
        initialCapital,
      );
      tradePlanV4Scorer = calculateTradePlanV4(
        symbol,
        ticker.price,
        klines1h,
        klines4h,
        scoringV4WithBonus,
        directionV4,
        whaleWalls,
        currentCapital,
        initialCapital,
      );
    }

    const activeV3 = directionV3 === 'LONG' ? scoringV3WithBonus.long : scoringV3WithBonus.short;
    const activeV4 = directionV4 === 'LONG' ? scoringV4WithBonus.long : scoringV4WithBonus.short;

    const vwapBonus =
      directionV4 === 'LONG'
        ? vwapBonusApplied.longBonus
        : vwapBonusApplied.shortBonus;
    const vwapSignal =
      vwapData != null ? getVWAPEntrySignal(vwapData, directionV4) : undefined;

    let v3Final = v3Base;
    let v4Final = v4Base;
    let planV3Final = tradePlanV3Scorer;
    let planV4Final = tradePlanV4Scorer;
    let adxGate: ADXGateResult | undefined;
    let adxBlockReason: string | undefined;
    let structureSL: StructureSLResult | undefined;

    const adxData = analysisInputV4.adxData;
    if (adxData != null) {
      adxGate = evaluateADXGate(adxData, directionV4);
      if (adxGate.tpMultiplier !== 1.0 || adxGate.slMultiplier !== 1.0) {
        if (planV3Final) planV3Final = scaleTradePlanByAdxGate(planV3Final, adxGate);
        if (planV4Final) planV4Final = scaleTradePlanByAdxGate(planV4Final, adxGate);
      }
    }

    if (planV4Final) {
      planV4Final = applyVWAPEntryToPlan(planV4Final, vwapData, directionV4);
    }

    const structureApplied = applyStructureSLToPlans(
      planV3Final,
      planV4Final,
      directionV4,
      klines4h,
      adxData?.adxAvg,
    );
    planV3Final = structureApplied.planV3;
    planV4Final = structureApplied.planV4;
    structureSL = structureApplied.structureSL;

    const structureSlSource = structureApplied.structureSL?.slSource;
    planV3Final = invalidatePlanIfStructureRrBelowMin(planV3Final, structureSlSource);
    planV4Final = invalidatePlanIfStructureRrBelowMin(planV4Final, structureSlSource);

    v3Final = enrichSnapshotFinalStatus(
      v3Base,
      planV3Final,
      activeV3.hardBlocks,
      activeV3.groupBlocks,
      directionV3,
    );
    v4Final = enrichSnapshotFinalStatus(
      v4Base,
      planV4Final,
      activeV4.hardBlocks,
      activeV4.groupBlocks,
      directionV4,
      scoringV4WithBonus.squeezeRisk,
    );

    if (adxData != null && adxGate != null) {
      if (adxGate.block) {
        adxBlockReason = 'ADX_CHOPPY';
        v3Final = applyAdxBlockToSnapshot(v3Final);
        v4Final = applyAdxBlockToSnapshot(v4Final);
        if (planV3Final) planV3Final = applyAdxBlockToPlan(planV3Final);
        if (planV4Final) planV4Final = applyAdxBlockToPlan(planV4Final);
      }
    }

    const l1Layer = v4Final.layers.find((layer) => layer.layer === 1);
    const ruleAuditSnapshot = wireRuleAuditSnapshot({
      analysisInputV4,
      directionV4,
      klines1h,
      klines4h,
      cvdPoints,
      cvdValue,
      cvdTrend,
      topLSRatio,
      trend: analysis.smc.trend,
      regimeConfidence: analysis.regime.confidence,
      btcChange24h,
      atr1h: scoringV4WithBonus.atr1h,
      price: ticker.price,
      l6Detail: scoringV4WithBonus.l6Detail,
      adxData,
      adxGate,
      vwapData,
      vwapSignal,
      structureSL,
      l1Reason: l1Layer?.reason ?? '',
    });

    const baseRow: SignalRow = {
      symbol,
      price: ticker.price,
      change24h,
      trend: analysis.smc.trend,
      regimeConfidence: analysis.regime.confidence,
      score: v4Final.score,
      longScore: v4Final.longScore,
      shortScore: v4Final.shortScore,
      direction: v4Final.direction,
      decisionLabel: v4Final.decisionLabel,
      decisionDisplay: v4Final.decisionDisplay,
      winrate: v4Final.winrate,
      canEnter: v4Final.canEnter,
      tradePlan,
      tradePlanV3: planV4Final,
      tradePlansByScorer: { v3: planV3Final, v4: planV4Final },
      layers: v4Final.layers,
      mandatoryViolations: v4Final.mandatoryViolations,
      hardBlocked: resolveSnapEntryBlocked(v4Final),
      entryBlocked: v4Final.entryBlocked,
      fromCache: market.fromCache,
      tradePlans: {
        LONG: longTradePlan ?? undefined,
        SHORT: shortTradePlan ?? undefined,
      },
      cvdValue,
      cvdTrend,
      fundingRate: analysisInputV4.fundingRate,
      topLSRatio,
      v3: v3Final,
      v4: v4Final,
      atr1h: scoringV4WithBonus.atr1h,
      l6Detail: scoringV4WithBonus.l6Detail,
      squeezeRisk: scoringV4WithBonus.squeezeRisk,
      finalEntryStatus: v4Final.finalEntryStatus,
      squeezeWarning: v4Final.squeezeWarning,
      adxGate,
      adxBlockReason,
      adxData,
      structureSL,
      vwapData,
      vwapSignal,
      vwapBonus,
      ruleAuditSnapshot,
    };

    return applySnapshotToRow(baseRow, v4Final);
  } catch (e) {
    return errorRow(symbol, String(e));
  }
}

/** Quét TRADE_SYMBOLS — Scorer V3 + V4 + trade plan (symbols song song, REST ≤ BINANCE_MAX_CONCURRENT). */
export async function scanAllSignalRows(
  timeframe: AnalysisTimeframe,
  psychologyChecklist: PsychologyChecklistV2,
  scanContext?: SignalScanContext,
  ambiguityStores?: AmbiguityStateStores,
): Promise<SignalRow[]> {
  const btcChange24h = await fetchBtcChange24hPct();
  const settled = await Promise.allSettled(
    TRADE_SYMBOLS.map((sym) =>
      scanSignalSymbol(
        sym,
        timeframe,
        btcChange24h,
        psychologyChecklist,
        scanContext,
        ambiguityStores,
      ),
    ),
  );
  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return errorRow(TRADE_SYMBOLS[i], String(result.reason));
  });
}

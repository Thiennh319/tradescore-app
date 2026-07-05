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
  type DecisionTypeV2,
  type DecisionTypeV4,
} from '../constants/scoring';
import type { CvdTrend } from '../constants/aiJournal';
import {
  fetch24hTickerChange,
  fetchAllMarketData,
  fetchTickerPrice,
  statsPeriodFor,
  type Kline,
} from './binanceApi';
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
import { analyzeCVD, type ADXAnalysis, type CVDPoint } from './indicators';
import { buildWhaleEntryWalls } from './whaleEntryWalls';
import { computeAtr1hFromKlines } from './atr1h';
import { calculateTradePlanV3 } from './tradePlanV3';
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
  STRUCTURE_SL_DEFAULTS,
  type StructureSLResult,
} from './structureSL';
import {
  getVWAPEntrySignal,
  type VWAPEntrySignal,
  type VWAPResult,
} from './vwapService';
import { calculateVWAPBonus, type VWAPBonusResult } from './vwapBonus';

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
  hardBlocked: boolean;
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
    hardBlocked: true,
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
    hardBlocked: active.hardBlocks.length > 0 || active.groupBlocks.length > 0,
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
  const violations = [...active.hardBlocks, ...active.groupBlocks];
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
    hardBlocked: active.hardBlocks.length > 0 || active.groupBlocks.length > 0,
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
    hardBlocked: snap.hardBlocked,
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
    hardBlocked: true,
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

type TradePlanWithVwapFields = TradePlanV3 & {
  entryOptions?: number[];
  entryNote?: string;
};

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
  );
  const shortBonus = calculateVWAPBonus(
    vwapData,
    'SHORT',
    scoringV4.short.rawLayerScores[5] ?? 0,
  );

  const longBonusV3 = calculateVWAPBonus(
    vwapData,
    'LONG',
    scoringV3.long.rawLayerScores[5] ?? 0,
  );
  const shortBonusV3 = calculateVWAPBonus(
    vwapData,
    'SHORT',
    scoringV3.short.rawLayerScores[5] ?? 0,
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

function applyVWAPEntryToPlan(
  plan: TradePlanV3 | null,
  vwapData: VWAPResult | undefined,
  direction: TradeDirection,
): TradePlanV3 | null {
  if (!plan || !vwapData) return plan;

  const signal = getVWAPEntrySignal(vwapData, direction);
  if (signal.quality !== 'IDEAL' && signal.quality !== 'GOOD') return plan;

  const extended = plan as TradePlanWithVwapFields;
  const entryOptions = extended.entryOptions?.length
    ? [...extended.entryOptions, vwapData.vwap]
    : [vwapData.vwap];

  return {
    ...plan,
    entryOptions,
    entryNote: `VWAP ${vwapData.vwap.toFixed(2)} — ${signal.entryReason}`,
  } as TradePlanV3;
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

function applyStructureSLToPlans(
  planV3: TradePlanV3 | null,
  planV4: TradePlanV3 | null,
  direction: TradeDirection,
  klines4H: Kline[],
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
      lookback: STRUCTURE_SL_DEFAULTS.LOOKBACK_CANDLES,
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
    const vwapBonusApplied = applyVwapBonusToScoring(scoringV3, scoringV4, vwapData);
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

    const cvdPoints = analysisInputV4.cvdPoints ?? [];
    const cvdValue = latestCvdValue(cvdPoints);
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
    );
    planV3Final = structureApplied.planV3;
    planV4Final = structureApplied.planV4;
    structureSL = structureApplied.structureSL;

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
      hardBlocked: v4Final.hardBlocked,
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
    };

    return applySnapshotToRow(baseRow, v4Final);
  } catch (e) {
    return errorRow(symbol, String(e));
  }
}

/** Quét 4 cặp — Scorer V3 + Phase 4 cho trade plan. */
export async function scanAllSignalRows(
  timeframe: AnalysisTimeframe,
  psychologyChecklist: PsychologyChecklistV2,
  scanContext?: SignalScanContext,
  ambiguityStores?: AmbiguityStateStores,
): Promise<SignalRow[]> {
  const btcChange24h = await fetchBtcChange24hPct();
  const rows: SignalRow[] = [];
  for (const sym of TRADE_SYMBOLS) {
    rows.push(
      await scanSignalSymbol(
        sym,
        timeframe,
        btcChange24h,
        psychologyChecklist,
        scanContext,
        ambiguityStores,
      ),
    );
  }
  return rows;
}

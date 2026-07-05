import type { FundingState } from '../constants/scoring';
import type { SqueezeDirection, SqueezeLevel } from '../types/squeezeRisk';
import { isCloseFamilyAction, isHoldFamilyAction, recommendWithGracePeriod } from './gracePeriod';
import {
  applyRecommendationStability,
  type StabilityState,
} from './recommendationStability';

export type RecommendationType =
  | 'HOLD'
  | 'HOLD_MOVE_SL'
  | 'PARTIAL_TP1'
  | 'PARTIAL_TP2'
  | 'PARTIAL_CLOSE_30'
  | 'CLOSE_NOW'
  | 'CLOSE_URGENT'
  | 'CLOSE_REVERSE';

// ─── Trade Thesis Snapshot ───────────────────────────────────────────────────

export type TradeThesisTrendDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export type TradeThesisMarketStructure = 'TRENDING' | 'RANGING' | 'UNKNOWN';

export type TradeThesisBTCAlignment = 'ALIGNED' | 'NEUTRAL' | 'MISALIGNED' | 'UNKNOWN';

export type TradeThesisConfirmationLevel = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';

/** Ngữ cảnh S/R tại thời điểm vào lệnh. */
export interface TradeThesisSupportResistanceContext {
  readonly price: number | null;
  readonly distancePct: number | null;
  readonly summary: string;
}

/**
 * Snapshot bất biến — lý do mở lệnh tại entry.
 * Tạo một lần khi position active; không cập nhật sau đó.
 */
export interface TradeThesisSnapshot {
  readonly entryTimestamp: number;
  readonly symbol: string | null;
  readonly direction: 'LONG' | 'SHORT';
  readonly entryTradeScore: number;
  readonly entryConfidence: number;
  readonly entryTrendDirection: TradeThesisTrendDirection;
  readonly entryTrendStrength: number;
  readonly entryBTCAlignment: TradeThesisBTCAlignment;
  readonly entryMarketStructure: TradeThesisMarketStructure;
  readonly entryVolumeConfirmation: TradeThesisConfirmationLevel;
  readonly entryBreakoutConfirmation: TradeThesisConfirmationLevel;
  readonly entrySupportContext: TradeThesisSupportResistanceContext;
  readonly entryResistanceContext: TradeThesisSupportResistanceContext;
  readonly frozenAt: number;
}

/**
 * Bộ nhớ vị thế — entry conditions bất biến + thesis scan gần nhất.
 * Persist qua `position.positionMemory` hoặc session cache (cùng position key).
 */
export interface PositionMemory {
  readonly entryTradeScore: number;
  readonly entryConfidence: number;
  readonly entryTrendDirection: TradeThesisTrendDirection;
  readonly entryTrendStrength: number;
  readonly entryBTCAlignment: TradeThesisBTCAlignment;
  readonly entryVolumeConfirmation: TradeThesisConfirmationLevel;
  readonly entryBreakoutConfirmation: TradeThesisConfirmationLevel;
  readonly tradeThesisSnapshot: Readonly<TradeThesisSnapshot>;
  readonly lastThesisHealthScore: number;
  readonly lastThesisState: ThesisOperationalState;
  /** Confidence scan trước (từ score V3) — so sánh noise. */
  readonly lastScanConfidence: number;
  readonly updatedAt: number;
}

/** Ghi đè từng trường khi tạo snapshot (tùy chọn). */
export interface TradeThesisEntryContext {
  entryTimestamp?: number;
  symbol?: string | null;
  entryTradeScore?: number;
  entryConfidence?: number;
  entryTrendDirection?: TradeThesisTrendDirection;
  entryTrendStrength?: number;
  entryBTCAlignment?: TradeThesisBTCAlignment;
  entryMarketStructure?: TradeThesisMarketStructure;
  entryVolumeConfirmation?: TradeThesisConfirmationLevel;
  entryBreakoutConfirmation?: TradeThesisConfirmationLevel;
  entrySupportContext?: TradeThesisSupportResistanceContext;
  entryResistanceContext?: TradeThesisSupportResistanceContext;
}

export interface PositionRecommendation {
  type: RecommendationType;
  label: string;
  color: string;
  confidence: number;
  reasons: string[];
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  matchedRuleCount: number;
  triggeredBy: string;
  /** Grace period — rule maturity bị hạ priority tạm thời */
  gracePeriodActive?: boolean;
  graceMinutesOpen?: number;
  graceSuppressedRules?: string[];
  /** Caller set lastCVDDivergenceActive khi CVD rule báo cần lưu flag. */
  shouldSetCVDFlag?: boolean;
  /** V4 FUNDING_REVERSAL — caller set lastFundingReversalPending = true. */
  shouldSetFundingReversalPending?: boolean;
  /** V4 FUNDING_REVERSAL — caller reset lastFundingReversalPending = false. */
  shouldClearFundingReversalPending?: boolean;
  /** State stability sau filter — caller persist per position. */
  stabilityState?: StabilityState;
  /** Trade Thesis đã resolve — luôn có sau evaluate khi position active. */
  tradeThesisSnapshot?: Readonly<TradeThesisSnapshot>;
  /** Caller nên ghi snapshot vào position/store khi true (lần tạo đầu). */
  shouldPersistTradeThesisSnapshot?: boolean;
  /** Điểm sức khỏe thesis — so sánh entry snapshot vs trạng thái hiện tại. */
  thesisHealth?: ThesisHealthResult;
  /** Trạng thái vận hành thesis — dịch từ health score. */
  thesisState?: ThesisStateEvaluation;
  /** Thesis engine đã điều chỉnh khuyến nghị. */
  thesisEngineApplied?: boolean;
  /** Mã điều chỉnh thesis (HEALTHY_HOLD_BIAS, …). */
  thesisEngineNote?: string;
  /** Bộ nhớ vị thế — entry + last thesis scan; caller persist trên position. */
  positionMemory?: Readonly<PositionMemory>;
  /** Caller nên ghi positionMemory vào position/store. */
  shouldPersistPositionMemory?: boolean;
  /** Lớp thesis + confidence — đã điều chỉnh trước stability filter. */
  thesisConfidenceDecisionApplied?: boolean;
  thesisConfidenceDecisionNote?: string;
  /** Mức delta confidence scan-to-scan (khi lớp confidence áp dụng). */
  thesisConfidenceDeltaLevel?: ConfidenceDeltaLevel | 'NEUTRAL';
}

// ─── Thesis Health Score ─────────────────────────────────────────────────────

export type ThesisHealthClassification = 'STRONG' | 'HEALTHY' | 'WEAKENING' | 'BROKEN';

export interface ThesisHealthComponentScores {
  readonly trend: number;
  readonly btc: number;
  readonly volume: number;
  readonly breakout: number;
  readonly structure: number;
  readonly supportResistance: number;
}

export interface ThesisHealthResult {
  readonly score: number;
  readonly classification: ThesisHealthClassification;
  readonly components: ThesisHealthComponentScores;
}

export const THESIS_HEALTH_WEIGHTS = {
  trend: 0.3,
  btc: 0.15,
  volume: 0.15,
  breakout: 0.15,
  structure: 0.15,
  supportResistance: 0.1,
} as const;

// ─── Thesis State Machine ────────────────────────────────────────────────────

export type ThesisOperationalState =
  | 'HEALTHY'
  | 'WARNING'
  | 'EXIT_RECOMMENDED'
  | 'THESIS_INVALID';

/** Ngưỡng công khai — deterministic, không ẩn. */
export const THESIS_STATE_THRESHOLDS = {
  /** score >= 80 → HEALTHY */
  HEALTHY_MIN: 80,
  /** score >= 60 → WARNING */
  WARNING_MIN: 60,
  /** score >= 40 → EXIT_RECOMMENDED */
  EXIT_RECOMMENDED_MIN: 40,
  /** score < 40 → THESIS_INVALID */
} as const;

/**
 * Ngưỡng hysteresis — ENTER khi health giảm qua ngưỡng dưới;
 * EXIT khi health tăng qua ngưỡng trên. Giữ state trong band.
 */
export const THESIS_STATE_HYSTERESIS = {
  ENTER_THESIS_INVALID: 35,
  EXIT_THESIS_INVALID: 45,
  ENTER_EXIT_RECOMMENDED: 55,
  EXIT_EXIT_RECOMMENDED: 65,
  ENTER_WARNING: 75,
  EXIT_WARNING: 85,
} as const;

// ─── Thesis + Confidence Final Decision Layer ────────────────────────────────

/** Mức thay đổi confidence scan-to-scan — deterministic bands. */
export type ConfidenceDeltaLevel =
  | 'MINOR_DROP'
  | 'MAJOR_DROP'
  | 'COLLAPSE'
  | 'MINOR_RISE'
  | 'MAJOR_RISE'
  | 'SURGE';

/** Biên delta (điểm) — inclusive trong từng band. */
export const CONFIDENCE_DELTA_BANDS = {
  MINOR_MIN: 3,
  MINOR_MAX: 5,
  MAJOR_MIN: 6,
  MAJOR_MAX: 12,
  /** Drop/rise > 12 điểm → COLLAPSE / SURGE */
  EXTREME_BEYOND: 12,
} as const;

/** Ngưỡng công khai — thesis health × confidence stability. */
export const THESIS_CONFIDENCE_DECISION_THRESHOLDS = {
  /** Thesis health >= 80 — cho phép giữ khi confidence giảm mạnh */
  STRONG_THESIS_MIN_HEALTH: THESIS_STATE_THRESHOLDS.HEALTHY_MIN,
  /** Thesis health < 40 — không cho confidence cao ghi đè */
  BROKEN_THESIS_MAX_HEALTH: THESIS_STATE_THRESHOLDS.EXIT_RECOMMENDED_MIN,
  /** @deprecated Dùng CONFIDENCE_DELTA_BANDS + classifyConfidenceDelta */
  CONFIDENCE_DROP_MIN_DELTA: CONFIDENCE_DELTA_BANDS.MINOR_MIN,
  /** @deprecated Dùng CONFIDENCE_DELTA_BANDS + classifyConfidenceDelta */
  CONFIDENCE_RISE_MIN_DELTA: CONFIDENCE_DELTA_BANDS.MINOR_MIN,
} as const;

/** Phân loại delta confidence — NEUTRAL khi |delta| < 3. */
export function classifyConfidenceDelta(
  delta: number,
): ConfidenceDeltaLevel | 'NEUTRAL' {
  if (delta >= -2 && delta <= 2) return 'NEUTRAL';
  if (delta <= -(CONFIDENCE_DELTA_BANDS.EXTREME_BEYOND + 1)) return 'COLLAPSE';
  if (delta <= -CONFIDENCE_DELTA_BANDS.MAJOR_MIN) return 'MAJOR_DROP';
  if (delta <= -CONFIDENCE_DELTA_BANDS.MINOR_MIN) return 'MINOR_DROP';
  if (delta >= CONFIDENCE_DELTA_BANDS.EXTREME_BEYOND + 1) return 'SURGE';
  if (delta >= CONFIDENCE_DELTA_BANDS.MAJOR_MIN) return 'MAJOR_RISE';
  if (delta >= CONFIDENCE_DELTA_BANDS.MINOR_MIN) return 'MINOR_RISE';
  return 'NEUTRAL';
}

export interface ThesisConfidenceDecisionContext {
  readonly thesisHealth: ThesisHealthResult;
  readonly thesisState: ThesisStateEvaluation;
  readonly currentConfidence: number;
  readonly previousConfidence: number;
}

export interface ThesisStateEvaluation {
  readonly state: ThesisOperationalState;
  readonly score: number;
  readonly reason: string;
}

const THESIS_COMPONENT_LABELS: Record<keyof ThesisHealthComponentScores, string> = {
  trend: 'Xu hướng',
  btc: 'BTC alignment',
  volume: 'Volume',
  breakout: 'Breakout',
  structure: 'Cấu trúc thị trường',
  supportResistance: 'Support/Resistance',
};

const THESIS_STATE_REASON_PREFIX: Record<ThesisOperationalState, string> = {
  HEALTHY: 'Thesis còn vững',
  WARNING: 'Thesis suy yếu — theo dõi sát',
  EXIT_RECOMMENDED: 'Thesis đang phá vỡ — cân nhắc thoát',
  THESIS_INVALID: 'Thesis không còn hợp lệ',
};

function weakestThesisComponent(
  components: ThesisHealthComponentScores,
): { key: keyof ThesisHealthComponentScores; score: number } {
  const entries = Object.entries(components) as Array<
    [keyof ThesisHealthComponentScores, number]
  >;
  entries.sort((a, b) => a[1] - b[1]);
  const [key, componentScore] = entries[0] ?? ['trend', 0];
  return { key, score: componentScore };
}

function buildThesisStateReason(
  state: ThesisOperationalState,
  score: number,
  components: ThesisHealthComponentScores,
): string {
  const weakest = weakestThesisComponent(components);
  const label = THESIS_COMPONENT_LABELS[weakest.key];
  const prefix = THESIS_STATE_REASON_PREFIX[state];
  return `${prefix} (điểm ${score}) — yếu nhất: ${label} (${weakest.score})`;
}

function resolveThesisOperationalState(score: number): ThesisOperationalState {
  if (score >= THESIS_STATE_THRESHOLDS.HEALTHY_MIN) return 'HEALTHY';
  if (score >= THESIS_STATE_THRESHOLDS.WARNING_MIN) return 'WARNING';
  if (score >= THESIS_STATE_THRESHOLDS.EXIT_RECOMMENDED_MIN) return 'EXIT_RECOMMENDED';
  return 'THESIS_INVALID';
}

/** Khởi tạo state lần đầu (chưa có lastThesisState) — dùng ngưỡng EXIT. */
function inferInitialThesisOperationalState(score: number): ThesisOperationalState {
  if (score >= THESIS_STATE_HYSTERESIS.EXIT_WARNING) return 'HEALTHY';
  if (score >= THESIS_STATE_HYSTERESIS.EXIT_EXIT_RECOMMENDED) return 'WARNING';
  if (score >= THESIS_STATE_HYSTERESIS.EXIT_THESIS_INVALID) return 'EXIT_RECOMMENDED';
  return 'THESIS_INVALID';
}

/**
 * Thesis state với hysteresis — cần previousState từ PositionMemory.
 * Giữ state hiện tại khi health nằm trong band.
 */
export function resolveThesisOperationalStateWithHysteresis(
  score: number,
  previousState?: ThesisOperationalState | null,
): ThesisOperationalState {
  const prev = previousState ?? inferInitialThesisOperationalState(score);

  switch (prev) {
    case 'HEALTHY':
      if (score < THESIS_STATE_HYSTERESIS.ENTER_WARNING) return 'WARNING';
      return 'HEALTHY';
    case 'WARNING':
      if (score < THESIS_STATE_HYSTERESIS.ENTER_EXIT_RECOMMENDED) {
        return 'EXIT_RECOMMENDED';
      }
      if (score > THESIS_STATE_HYSTERESIS.EXIT_WARNING) return 'HEALTHY';
      return 'WARNING';
    case 'EXIT_RECOMMENDED':
      if (score < THESIS_STATE_HYSTERESIS.ENTER_THESIS_INVALID) {
        return 'THESIS_INVALID';
      }
      if (score > THESIS_STATE_HYSTERESIS.EXIT_EXIT_RECOMMENDED) return 'WARNING';
      return 'EXIT_RECOMMENDED';
    case 'THESIS_INVALID':
      if (score > THESIS_STATE_HYSTERESIS.EXIT_THESIS_INVALID) {
        return 'EXIT_RECOMMENDED';
      }
      return 'THESIS_INVALID';
    default:
      return inferInitialThesisOperationalState(score);
  }
}

/** Dịch Thesis Health → trạng thái vận hành (deterministic, có hysteresis). */
export function evaluateThesisState(
  health: ThesisHealthResult,
  previousState?: ThesisOperationalState | null,
): ThesisStateEvaluation {
  const state = resolveThesisOperationalStateWithHysteresis(
    health.score,
    previousState,
  );
  return Object.freeze({
    state,
    score: health.score,
    reason: buildThesisStateReason(state, health.score, health.components),
  });
}

/** Dịch điểm health thô → trạng thái (khi chưa có full components). */
export function evaluateThesisStateFromScore(
  score: number,
  components?: ThesisHealthComponentScores,
  previousState?: ThesisOperationalState | null,
): ThesisStateEvaluation {
  const state = resolveThesisOperationalStateWithHysteresis(score, previousState);
  const defaultComponents: ThesisHealthComponentScores = components ?? {
    trend: score,
    btc: score,
    volume: score,
    breakout: score,
    structure: score,
    supportResistance: score,
  };
  return Object.freeze({
    state,
    score,
    reason: buildThesisStateReason(state, score, defaultComponents),
  });
}

export interface ActivePosition {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  /** Thời điểm khớp lệnh (ms). */
  openedAt: number;
  /** Alias tương thích — ưu tiên hơn openedAt khi có. */
  openTime?: number;
  currentPnlPct: number;
  currentPnlUSDT: number;
  /** FundingState lần scan trước — V4 FUNDING_REVERSAL */
  lastFundingState?: FundingState;
  /** L11 squeeze level lần scan trước — V4 SQUEEZE_RISK_ALERT */
  lastSqueezeRiskLevel?: SqueezeLevel | null;
  /** L11 squeeze direction lần scan trước — V4 SQUEEZE_RISK_ALERT */
  lastSqueezeRiskDirection?: SqueezeDirection | null;
  /** Lỗ tối đa nếu chạm SL (USDT) — so sánh ngưỡng 50% trong FUNDING_REVERSAL */
  maxLossUSDT?: number;
  /** Scan trước có CVD divergence — rule CVD_DIVERGENCE cần 2 lần liên tiếp. */
  lastCVDDivergenceActive?: boolean;
  /** V4 FUNDING_REVERSAL — đã thấy transition 1 lần, chờ xác nhận scan 2. */
  lastFundingReversalPending?: boolean;
  /** Symbol — dùng khi tạo Trade Thesis Snapshot. */
  symbol?: string;
  /** Snapshot lý do vào lệnh — immutable sau khi tạo; caller persist qua các scan. */
  tradeThesisSnapshot?: Readonly<TradeThesisSnapshot>;
  /** Bộ nhớ entry + thesis — ưu tiên hơn session cache khi caller persist. */
  positionMemory?: Readonly<PositionMemory>;
}

export interface OwnDirectionScore {
  totalScore: number;
  direction: 'LONG' | 'SHORT';
  groupScores: { A: number; B: number; C: number };
  decision: string;
  hardBlocks: string[];
  groupBlocks: string[];
  warnings: string[];
  layers: { layerNumber: number; score: number; reason?: string }[];
}

export interface EvaluatePositionInput {
  position: ActivePosition;
  currentPrice: number;
  ownDirectionScore: OwnDirectionScore;
  oppositeDirectionScore: {
    totalScore: number;
    decision: string;
    hardBlocks: string[];
  };
  marketMode: 'TRENDING' | 'RANGING';
  /** ATR(14) thật khung 1H từ Scorer — dùng grace period */
  atr1h?: number;
  /** Thời điểm đánh giá — dùng cho test / grace period. */
  now?: number;
  /** Khuyến nghị scan trước — hysteresis HOLD_STRONG / HOLD_CONDITIONAL. */
  lastRecommendationType?: RecommendationType;
  /** State stability sau filter — caller persist per position. */
  stabilityState?: StabilityState;
  /** Snapshot lý do vào lệnh — ưu tiên hơn position.tradeThesisSnapshot. */
  tradeThesisSnapshot?: Readonly<TradeThesisSnapshot>;
  /** Symbol top-level — fallback khi position.symbol thiếu. */
  symbol?: string;
  /** Ghi đè trường snapshot khi tạo lần đầu (tùy chọn). */
  entryThesisContext?: TradeThesisEntryContext;
  /** Bộ nhớ vị thế — ưu tiên hơn session cache. */
  positionMemory?: Readonly<PositionMemory>;
}

export interface CreateTradeThesisSnapshotInput {
  position: ActivePosition;
  ownDirectionScore: OwnDirectionScore;
  marketMode: 'TRENDING' | 'RANGING';
  currentPrice: number;
  symbol?: string;
  entryThesisContext?: TradeThesisEntryContext;
  now?: number;
}

export type RuleResult =
  | {
      matched: false;
      shouldSetCVDFlag?: boolean;
      shouldSetFundingReversalPending?: boolean;
      shouldClearFundingReversalPending?: boolean;
    }
  | MatchedRuleResult;

export const NO_RULE_MATCH: RuleResult = { matched: false };

export type MatchedRuleResult = {
  matched: true;
  priority: number;
  ruleName: string;
  type: RecommendationType;
  label: string;
  color: string;
  confidence: number;
  reasons: string[];
  urgency: PositionRecommendation['urgency'];
  /** CVD_DIVERGENCE — caller cập nhật position.lastCVDDivergenceActive. */
  shouldSetCVDFlag?: boolean;
  /** FUNDING_REVERSAL — caller cập nhật position.lastFundingReversalPending. */
  shouldSetFundingReversalPending?: boolean;
  /** FUNDING_REVERSAL — caller reset lastFundingReversalPending. */
  shouldClearFundingReversalPending?: boolean;
};

type PositionWithPrice = ActivePosition & { currentPrice: number };

export type RuleContext = EvaluatePositionInput & { position: PositionWithPrice };

const COLOR_BEAR = '#F6465D';
const COLOR_WARN = '#F0B90B';
const COLOR_BULL = '#0ECB81';

const NO_MATCH = NO_RULE_MATCH;

function includesAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function getLayer(
  layers: OwnDirectionScore['layers'],
  layerNumber: number,
): number | null {
  const layer = layers.find((l) => l.layerNumber === layerNumber);
  return layer != null ? layer.score : null;
}

function calcDistToTP1Pct(position: PositionWithPrice): number {
  const { direction, entryPrice, tp1, currentPrice } = position;
  if (direction === 'LONG') {
    return safeRatio(currentPrice - entryPrice, tp1 - entryPrice) * 100;
  }
  return safeRatio(entryPrice - currentPrice, entryPrice - tp1) * 100;
}

function calcDistToTP2Pct(position: PositionWithPrice): number {
  const { direction, entryPrice, tp2, currentPrice } = position;
  if (direction === 'LONG') {
    return safeRatio(currentPrice - entryPrice, tp2 - entryPrice) * 100;
  }
  return safeRatio(entryPrice - currentPrice, entryPrice - tp2) * 100;
}

function isBeyondOnePointFiveR(position: PositionWithPrice): boolean {
  const slDistance = Math.abs(position.entryPrice - position.sl);
  if (slDistance <= 0) return false;
  if (position.direction === 'LONG') {
    return position.currentPrice >= position.entryPrice + slDistance * 1.5;
  }
  return position.currentPrice <= position.entryPrice - slDistance * 1.5;
}

// ─── Trade Thesis helpers ────────────────────────────────────────────────────

const GROUP_A_MAX = 5;
const LAYER_STRONG = 1.25;
const LAYER_MODERATE = 0.75;
const LAYER_WEAK = 0.25;

/** Session cache — giữ memory khi caller chưa persist (cùng position key). */
const positionMemorySessionCache = new Map<string, Readonly<PositionMemory>>();

function positionThesisCacheKey(position: ActivePosition): string {
  const openedAt = position.openTime ?? position.openedAt;
  return `${position.direction}:${position.entryPrice}:${openedAt}`;
}

function freezePositionMemory(memory: PositionMemory): Readonly<PositionMemory> {
  return Object.freeze({
    ...memory,
    tradeThesisSnapshot: freezeTradeThesisSnapshot(memory.tradeThesisSnapshot),
  });
}

/** Tạo memory bất biến từ thesis snapshot entry. */
export function createPositionMemoryFromSnapshot(
  snapshot: Readonly<TradeThesisSnapshot>,
  lastHealth?: Pick<ThesisHealthResult, 'score'> | null,
  lastState?: Pick<ThesisStateEvaluation, 'state'> | null,
): Readonly<PositionMemory> {
  return freezePositionMemory({
    entryTradeScore: snapshot.entryTradeScore,
    entryConfidence: snapshot.entryConfidence,
    entryTrendDirection: snapshot.entryTrendDirection,
    entryTrendStrength: snapshot.entryTrendStrength,
    entryBTCAlignment: snapshot.entryBTCAlignment,
    entryVolumeConfirmation: snapshot.entryVolumeConfirmation,
    entryBreakoutConfirmation: snapshot.entryBreakoutConfirmation,
    tradeThesisSnapshot: snapshot,
    lastThesisHealthScore: lastHealth?.score ?? 100,
    lastThesisState: lastState?.state ?? 'HEALTHY',
    lastScanConfidence: snapshot.entryConfidence,
    updatedAt: snapshot.frozenAt,
  });
}

export function commitPositionMemoryScan(
  position: ActivePosition,
  memory: Readonly<PositionMemory>,
  health: ThesisHealthResult,
  state: ThesisStateEvaluation,
  scanConfidence: number,
  now?: number,
): Readonly<PositionMemory> {
  const updated = freezePositionMemory({
    entryTradeScore: memory.entryTradeScore,
    entryConfidence: memory.entryConfidence,
    entryTrendDirection: memory.entryTrendDirection,
    entryTrendStrength: memory.entryTrendStrength,
    entryBTCAlignment: memory.entryBTCAlignment,
    entryVolumeConfirmation: memory.entryVolumeConfirmation,
    entryBreakoutConfirmation: memory.entryBreakoutConfirmation,
    tradeThesisSnapshot: memory.tradeThesisSnapshot,
    lastThesisHealthScore: health.score,
    lastThesisState: state.state,
    lastScanConfidence: scanConfidence,
    updatedAt: now ?? Date.now(),
  });
  positionMemorySessionCache.set(positionThesisCacheKey(position), updated);
  return updated;
}

export function resolvePositionMemoryAndSnapshot(input: EvaluatePositionInput): {
  memory: Readonly<PositionMemory>;
  snapshot: Readonly<TradeThesisSnapshot>;
  memoryCreated: boolean;
} {
  const key = positionThesisCacheKey(input.position);
  const existing =
    input.positionMemory ??
    input.position.positionMemory ??
    positionMemorySessionCache.get(key);

  if (existing) {
    return {
      memory: existing,
      snapshot: existing.tradeThesisSnapshot,
      memoryCreated: false,
    };
  }

  const snapshot = createTradeThesisSnapshot({
    position: input.position,
    ownDirectionScore: input.ownDirectionScore,
    marketMode: input.marketMode,
    currentPrice: input.currentPrice,
    symbol: input.symbol ?? input.position.symbol,
    entryThesisContext: input.entryThesisContext,
    now: input.now,
  });
  const memory = createPositionMemoryFromSnapshot(snapshot);
  positionMemorySessionCache.set(key, memory);
  return { memory, snapshot, memoryCreated: true };
}

function freezeTradeThesisSnapshot(snapshot: TradeThesisSnapshot): Readonly<TradeThesisSnapshot> {
  return Object.freeze({
    ...snapshot,
    entrySupportContext: Object.freeze({ ...snapshot.entrySupportContext }),
    entryResistanceContext: Object.freeze({ ...snapshot.entryResistanceContext }),
  });
}

function layerToConfirmationLevel(score: number | null): TradeThesisConfirmationLevel {
  if (score == null || !Number.isFinite(score)) return 'NONE';
  if (score >= LAYER_STRONG) return 'STRONG';
  if (score >= LAYER_MODERATE) return 'MODERATE';
  if (score >= LAYER_WEAK) return 'WEAK';
  return 'NONE';
}

function layerToBTCAlignment(score: number | null): TradeThesisBTCAlignment {
  if (score == null || !Number.isFinite(score)) return 'UNKNOWN';
  if (score >= LAYER_STRONG) return 'ALIGNED';
  if (score >= LAYER_MODERATE) return 'NEUTRAL';
  return 'MISALIGNED';
}

function decisionToConfidence(decision: string, totalScore: number): number {
  switch (decision) {
    case 'SETUP_NGON':
      return 92;
    case 'VAO_TU_TIN':
      return 82;
    case 'CO_THE_VAO':
      return 72;
    case 'CHO_THEM':
      return 55;
    case 'KHONG_VAO':
      return 35;
    default:
      return Math.round(Math.min(100, Math.max(0, (totalScore / 15) * 100)));
  }
}

function resolveTrendDirection(
  positionDirection: 'LONG' | 'SHORT',
  scoreDirection: 'LONG' | 'SHORT',
): TradeThesisTrendDirection {
  if (scoreDirection === positionDirection) return positionDirection;
  return 'NEUTRAL';
}

function buildSupportResistanceContext(
  position: ActivePosition,
  side: 'support' | 'resistance',
): TradeThesisSupportResistanceContext {
  const { direction, entryPrice, sl, tp1 } = position;
  const isLong = direction === 'LONG';

  let price: number | null;
  if (side === 'support') {
    price = isLong ? sl : tp1;
  } else {
    price = isLong ? tp1 : sl;
  }

  if (price == null || !Number.isFinite(price) || entryPrice <= 0) {
    return Object.freeze({
      price: null,
      distancePct: null,
      summary: side === 'support' ? 'Không xác định support' : 'Không xác định resistance',
    });
  }

  const distancePct =
    side === 'support'
      ? isLong
        ? safeRatio(entryPrice - price, entryPrice) * 100
        : safeRatio(price - entryPrice, entryPrice) * 100
      : isLong
        ? safeRatio(price - entryPrice, entryPrice) * 100
        : safeRatio(entryPrice - price, entryPrice) * 100;

  const label = side === 'support' ? 'Support' : 'Resistance';
  const summary = `${label} @ ${price.toFixed(4)} (${distancePct.toFixed(1)}% từ entry)`;

  return Object.freeze({ price, distancePct, summary });
}

/** Trạng thái thesis tương đương — dùng cho snapshot entry và scan hiện tại. */
interface ThesisComparableState {
  trendDirection: TradeThesisTrendDirection;
  trendStrength: number;
  btcAlignment: TradeThesisBTCAlignment;
  marketStructure: TradeThesisMarketStructure;
  volumeConfirmation: TradeThesisConfirmationLevel;
  breakoutConfirmation: TradeThesisConfirmationLevel;
}

function deriveComparableThesisState(
  position: ActivePosition,
  ownDirectionScore: OwnDirectionScore,
  marketMode: 'TRENDING' | 'RANGING',
): ThesisComparableState {
  const l1 = getLayer(ownDirectionScore.layers, 1);
  const l3 = getLayer(ownDirectionScore.layers, 3);
  const l5 = getLayer(ownDirectionScore.layers, 5);
  const l8 = getLayer(ownDirectionScore.layers, 8);

  const trendStrength = Math.round(
    Math.min(
      100,
      Math.max(0, (ownDirectionScore.groupScores.A / GROUP_A_MAX) * 100 + (l1 ?? 0) * 8),
    ),
  );

  return {
    trendDirection: resolveTrendDirection(position.direction, ownDirectionScore.direction),
    trendStrength,
    btcAlignment: layerToBTCAlignment(l8),
    marketStructure:
      marketMode === 'TRENDING' || marketMode === 'RANGING' ? marketMode : 'UNKNOWN',
    volumeConfirmation: layerToConfirmationLevel(l5),
    breakoutConfirmation: layerToConfirmationLevel(l3),
  };
}

function deriveTradeThesisFields(
  input: CreateTradeThesisSnapshotInput,
): Omit<TradeThesisSnapshot, 'frozenAt'> {
  const { position, ownDirectionScore, marketMode, entryThesisContext } = input;
  const openedAt = position.openTime ?? position.openedAt;
  const symbol = entryThesisContext?.symbol ?? input.symbol ?? position.symbol ?? null;
  const comparable = deriveComparableThesisState(position, ownDirectionScore, marketMode);

  return {
    entryTimestamp: entryThesisContext?.entryTimestamp ?? openedAt,
    symbol,
    direction: position.direction,
    entryTradeScore:
      entryThesisContext?.entryTradeScore ?? ownDirectionScore.totalScore,
    entryConfidence:
      entryThesisContext?.entryConfidence ??
      decisionToConfidence(ownDirectionScore.decision, ownDirectionScore.totalScore),
    entryTrendDirection:
      entryThesisContext?.entryTrendDirection ?? comparable.trendDirection,
    entryTrendStrength:
      entryThesisContext?.entryTrendStrength ?? comparable.trendStrength,
    entryBTCAlignment:
      entryThesisContext?.entryBTCAlignment ?? comparable.btcAlignment,
    entryMarketStructure:
      entryThesisContext?.entryMarketStructure ?? comparable.marketStructure,
    entryVolumeConfirmation:
      entryThesisContext?.entryVolumeConfirmation ?? comparable.volumeConfirmation,
    entryBreakoutConfirmation:
      entryThesisContext?.entryBreakoutConfirmation ?? comparable.breakoutConfirmation,
    entrySupportContext:
      entryThesisContext?.entrySupportContext ??
      buildSupportResistanceContext(position, 'support'),
    entryResistanceContext:
      entryThesisContext?.entryResistanceContext ??
      buildSupportResistanceContext(position, 'resistance'),
  };
}

/** Tạo snapshot bất biến từ phân tích tại thời điểm vào lệnh. */
export function createTradeThesisSnapshot(
  input: CreateTradeThesisSnapshotInput,
): Readonly<TradeThesisSnapshot> {
  const now = input.now ?? Date.now();
  const snapshot = freezeTradeThesisSnapshot({
    ...deriveTradeThesisFields(input),
    frozenAt: now,
  });
  positionMemorySessionCache.set(
    positionThesisCacheKey(input.position),
    createPositionMemoryFromSnapshot(snapshot),
  );
  return snapshot;
}

export function resolveTradeThesisSnapshot(input: EvaluatePositionInput): {
  snapshot: Readonly<TradeThesisSnapshot>;
  created: boolean;
} {
  const resolved = resolvePositionMemoryAndSnapshot(input);
  return { snapshot: resolved.snapshot, created: resolved.memoryCreated };
}

/** Gắn thesis vào output evaluate — luôn expose snapshot cho scan sau. */
export function attachTradeThesisToRecommendation(
  input: EvaluatePositionInput,
  recommendation: PositionRecommendation,
): PositionRecommendation {
  const { snapshot, created } = resolveTradeThesisSnapshot(input);
  return {
    ...recommendation,
    tradeThesisSnapshot: snapshot,
    ...(created ? { shouldPersistTradeThesisSnapshot: true } : {}),
  };
}

/** Xóa cache session (test / reset). */
export function clearTradeThesisSessionCache(): void {
  positionMemorySessionCache.clear();
}

/** Alias — xóa position memory session cache. */
export function clearPositionMemorySessionCache(): void {
  positionMemorySessionCache.clear();
}

// ─── Thesis Health helpers ───────────────────────────────────────────────────

const CONFIRMATION_ORDINAL: Record<TradeThesisConfirmationLevel, number> = {
  NONE: 0,
  WEAK: 1,
  MODERATE: 2,
  STRONG: 3,
};

const BTC_ALIGNMENT_ORDINAL: Record<TradeThesisBTCAlignment, number> = {
  MISALIGNED: 0,
  UNKNOWN: 1,
  NEUTRAL: 2,
  ALIGNED: 3,
};

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function preservationByOrdinal(entryOrd: number, currentOrd: number): number {
  const delta = currentOrd - entryOrd;
  if (delta >= 0) return 100;
  if (delta === -1) return 66;
  if (delta === -2) return 33;
  return 0;
}

function scoreConfirmationPreservation(
  entry: TradeThesisConfirmationLevel,
  current: TradeThesisConfirmationLevel,
): number {
  return preservationByOrdinal(CONFIRMATION_ORDINAL[entry], CONFIRMATION_ORDINAL[current]);
}

function scoreBTCAlignmentPreservation(
  entry: TradeThesisBTCAlignment,
  current: TradeThesisBTCAlignment,
): number {
  return preservationByOrdinal(BTC_ALIGNMENT_ORDINAL[entry], BTC_ALIGNMENT_ORDINAL[current]);
}

function scoreTrendPreservation(
  thesis: TradeThesisSnapshot,
  current: ThesisComparableState,
): number {
  const positionDir = thesis.direction;

  if (current.trendDirection !== positionDir && current.trendDirection !== 'NEUTRAL') {
    return 0;
  }

  const directionScore =
    current.trendDirection === positionDir
      ? 100
      : current.trendDirection === 'NEUTRAL'
        ? 55
        : 0;

  const entryStrength = thesis.entryTrendStrength;
  const currentStrength = current.trendStrength;
  let strengthScore: number;
  if (entryStrength <= 0) {
    strengthScore = currentStrength >= 50 ? 80 : 50;
  } else {
    strengthScore = clampScore((currentStrength / entryStrength) * 100);
  }

  return clampScore(directionScore * 0.55 + strengthScore * 0.45);
}

function scoreStructurePreservation(
  entry: TradeThesisMarketStructure,
  current: TradeThesisMarketStructure,
): number {
  if (entry === current) return 100;
  if (entry === 'UNKNOWN' || current === 'UNKNOWN') return 70;
  if (entry === 'TRENDING' && current === 'RANGING') return 45;
  if (entry === 'RANGING' && current === 'TRENDING') return 90;
  return 60;
}

function scoreSupportResistancePreservation(
  thesis: TradeThesisSnapshot,
  position: PositionWithPrice,
): number {
  const { direction, currentPrice, entryPrice } = position;
  const stopLevel =
    direction === 'LONG'
      ? thesis.entrySupportContext.price
      : thesis.entryResistanceContext.price;

  if (stopLevel == null || !Number.isFinite(stopLevel)) return 70;

  if (direction === 'LONG') {
    if (currentPrice <= stopLevel) return 0;
    const riskDistance = entryPrice - stopLevel;
    const cushion = currentPrice - stopLevel;
    if (riskDistance <= 0) return 75;
    return clampScore((cushion / riskDistance) * 100);
  }

  if (currentPrice >= stopLevel) return 0;
  const riskDistance = stopLevel - entryPrice;
  const cushion = stopLevel - currentPrice;
  if (riskDistance <= 0) return 75;
  return clampScore((cushion / riskDistance) * 100);
}

function classifyThesisHealth(score: number): ThesisHealthClassification {
  if (score >= 80) return 'STRONG';
  if (score >= 65) return 'HEALTHY';
  if (score >= 40) return 'WEAKENING';
  return 'BROKEN';
}

/** So sánh thesis entry vs trạng thái scan hiện tại — điểm 0–100. */
export function calculateThesisHealthScore(
  input: EvaluatePositionInput,
  thesis: Readonly<TradeThesisSnapshot>,
): ThesisHealthResult {
  const current = deriveComparableThesisState(
    input.position,
    input.ownDirectionScore,
    input.marketMode,
  );
  const positionWithPrice: PositionWithPrice = {
    ...input.position,
    currentPrice: input.currentPrice,
  };

  const components: ThesisHealthComponentScores = Object.freeze({
    trend: scoreTrendPreservation(thesis, current),
    btc: scoreBTCAlignmentPreservation(thesis.entryBTCAlignment, current.btcAlignment),
    volume: scoreConfirmationPreservation(
      thesis.entryVolumeConfirmation,
      current.volumeConfirmation,
    ),
    breakout: scoreConfirmationPreservation(
      thesis.entryBreakoutConfirmation,
      current.breakoutConfirmation,
    ),
    structure: scoreStructurePreservation(
      thesis.entryMarketStructure,
      current.marketStructure,
    ),
    supportResistance: scoreSupportResistancePreservation(thesis, positionWithPrice),
  });

  const score = clampScore(
    components.trend * THESIS_HEALTH_WEIGHTS.trend +
      components.btc * THESIS_HEALTH_WEIGHTS.btc +
      components.volume * THESIS_HEALTH_WEIGHTS.volume +
      components.breakout * THESIS_HEALTH_WEIGHTS.breakout +
      components.structure * THESIS_HEALTH_WEIGHTS.structure +
      components.supportResistance * THESIS_HEALTH_WEIGHTS.supportResistance,
  );

  return Object.freeze({
    score,
    classification: classifyThesisHealth(score),
    components,
  });
}

/** Rule matrix không bị thesis ghi đè. */
export const THESIS_IMMUNE_RULE_TRIGGERS = new Set<string>([
  'HARD_BLOCK',
  'GROUP_BLOCK',
  'BTC_REVERSAL',
]);

/** Rule thoát có ý nghĩa — HEALTHY không lọc là tín hiệu nhỏ. */
export const THESIS_SIGNIFICANT_EXIT_RULE_TRIGGERS = new Set<string>([
  'OPPOSITE_STRONG',
  'CVD_DIVERGENCE',
  'TP_HIT',
  'SCORE_DROP_NEAR_TP1',
  'MOVE_SL_BE',
  'FUNDING_REVERSAL',
  'SQUEEZE_RISK_ALERT',
]);

/** Loại action HEALTHY được phép làm mềm (chỉ LOW/MEDIUM urgency). */
export const THESIS_HEALTHY_SUPPRESSIBLE_TYPES = new Set<RecommendationType>([
  'PARTIAL_TP1',
  'PARTIAL_TP2',
  'HOLD_MOVE_SL',
]);

/** Ngưỡng deterministic cho thesis engine layer. */
export const THESIS_ENGINE_TUNING = {
  /** HEALTHY — chỉ làm mềm urgency LOW/MEDIUM */
  HEALTHY_SOFTENABLE_URGENCIES: ['LOW', 'MEDIUM'] as const,
  HEALTHY_MINOR_MAX_CONFIDENCE: 75,
  /** EXIT_RECOMMENDED — confidence tối thiểu khi chuyển HOLD → CLOSE */
  EXIT_RECOMMENDED_MIN_CONFIDENCE: 72,
  /** THESIS_INVALID — confidence tối thiểu khi force CLOSE */
  THESIS_INVALID_MIN_CONFIDENCE: 82,
} as const;

const URGENCY_ORDER: PositionRecommendation['urgency'][] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
];

function bumpUrgency(
  urgency: PositionRecommendation['urgency'],
): PositionRecommendation['urgency'] {
  const index = URGENCY_ORDER.indexOf(urgency);
  if (index < 0 || index >= URGENCY_ORDER.length - 1) return urgency;
  return URGENCY_ORDER[index + 1]!;
}

function isThesisImmuneRecommendation(recommendation: PositionRecommendation): boolean {
  return (
    recommendation.urgency === 'CRITICAL' ||
    recommendation.type === 'CLOSE_URGENT' ||
    recommendation.type === 'CLOSE_NOW' ||
    recommendation.type === 'CLOSE_REVERSE' ||
    THESIS_IMMUNE_RULE_TRIGGERS.has(recommendation.triggeredBy)
  );
}

/** HEALTHY chỉ làm mềm partial / move SL — LOW hoặc MEDIUM urgency. */
function isHealthySuppressibleRecommendation(
  recommendation: PositionRecommendation,
): boolean {
  if (isThesisImmuneRecommendation(recommendation)) return false;
  if (THESIS_SIGNIFICANT_EXIT_RULE_TRIGGERS.has(recommendation.triggeredBy)) {
    return false;
  }
  if (!THESIS_HEALTHY_SUPPRESSIBLE_TYPES.has(recommendation.type)) return false;
  return (
    recommendation.urgency === 'LOW' || recommendation.urgency === 'MEDIUM'
  );
}

function withThesisReason(
  recommendation: PositionRecommendation,
  thesisState: ThesisStateEvaluation,
  prefix: string,
): string[] {
  const note = `[Thesis] ${prefix} — ${thesisState.reason}`;
  const rest = recommendation.reasons.filter((r) => !r.startsWith('[Thesis]'));
  return [note, ...rest].slice(0, 5);
}

function applyHealthyThesisBias(
  recommendation: PositionRecommendation,
  thesisState: ThesisStateEvaluation,
): PositionRecommendation {
  if (!isHealthySuppressibleRecommendation(recommendation)) return recommendation;

  return {
    ...recommendation,
    type: 'HOLD',
    label: 'Tiếp tục giữ — thesis còn vững',
    color: COLOR_BULL,
    urgency: 'LOW',
    confidence: Math.min(recommendation.confidence, 72),
    reasons: withThesisReason(
      recommendation,
      thesisState,
      'Bỏ qua tín hiệu nhỏ, thesis HEALTHY',
    ),
    thesisEngineApplied: true,
    thesisEngineNote: 'HEALTHY_HOLD_BIAS',
  };
}

function applyExitRecommendedThesisBias(
  recommendation: PositionRecommendation,
  thesisState: ThesisStateEvaluation,
): PositionRecommendation {
  if (isHoldFamilyAction(recommendation.type)) {
    return {
      ...recommendation,
      type: 'CLOSE_NOW',
      label: 'Cân nhắc đóng — thesis suy yếu',
      color: COLOR_BEAR,
      urgency: 'HIGH',
      confidence: Math.max(
        recommendation.confidence,
        THESIS_ENGINE_TUNING.EXIT_RECOMMENDED_MIN_CONFIDENCE,
      ),
      reasons: withThesisReason(recommendation, thesisState, 'Tăng áp lực thoát'),
      thesisEngineApplied: true,
      thesisEngineNote: 'EXIT_RECOMMENDED_HOLD_TO_CLOSE',
    };
  }

  if (isCloseFamilyAction(recommendation.type) || recommendation.type === 'PARTIAL_CLOSE_30') {
    const nextUrgency = bumpUrgency(recommendation.urgency);
    if (nextUrgency === recommendation.urgency) {
      return {
        ...recommendation,
        reasons: withThesisReason(recommendation, thesisState, 'Urgency thoát đã tối đa'),
        thesisEngineApplied: true,
        thesisEngineNote: 'EXIT_RECOMMENDED_URGENCY_MAX',
      };
    }

    return {
      ...recommendation,
      urgency: nextUrgency,
      reasons: withThesisReason(recommendation, thesisState, 'Tăng urgency thoát'),
      thesisEngineApplied: true,
      thesisEngineNote: 'EXIT_RECOMMENDED_URGENCY_BUMP',
    };
  }

  return recommendation;
}

function applyThesisInvalidForceClose(
  recommendation: PositionRecommendation,
  thesisState: ThesisStateEvaluation,
): PositionRecommendation {
  if (recommendation.type === 'CLOSE_NOW' || recommendation.type === 'CLOSE_URGENT') {
    return {
      ...recommendation,
      urgency: bumpUrgency(recommendation.urgency),
      confidence: Math.max(
        recommendation.confidence,
        THESIS_ENGINE_TUNING.THESIS_INVALID_MIN_CONFIDENCE,
      ),
      reasons: withThesisReason(recommendation, thesisState, 'Thesis INVALID — củng cố thoát'),
      thesisEngineApplied: true,
      thesisEngineNote: 'THESIS_INVALID_REINFORCE',
    };
  }

  return {
    ...recommendation,
    type: 'CLOSE_NOW',
    label: 'Đóng lệnh — thesis không còn hợp lệ',
    color: COLOR_BEAR,
    urgency: 'HIGH',
    confidence: Math.max(
      recommendation.confidence,
      THESIS_ENGINE_TUNING.THESIS_INVALID_MIN_CONFIDENCE,
    ),
    reasons: withThesisReason(recommendation, thesisState, 'Force CLOSE — thesis INVALID'),
    thesisEngineApplied: true,
    thesisEngineNote: 'THESIS_INVALID_FORCE_CLOSE',
  };
}

/**
 * Lớp thesis bổ sung — chạy sau rules, trước stability filter.
 * Không thay thế rule matrix; không ghi đè CRITICAL / HARD_BLOCK.
 */
export function applyThesisEngineLayer(
  recommendation: PositionRecommendation,
  thesisState: ThesisStateEvaluation,
  options?: { skipOnEntrySnapshot?: boolean },
): PositionRecommendation {
  if (options?.skipOnEntrySnapshot) return recommendation;
  if (isThesisImmuneRecommendation(recommendation)) return recommendation;

  switch (thesisState.state) {
    case 'WARNING':
      return recommendation;
    case 'HEALTHY':
      return applyHealthyThesisBias(recommendation, thesisState);
    case 'EXIT_RECOMMENDED':
      return applyExitRecommendedThesisBias(recommendation, thesisState);
    case 'THESIS_INVALID':
      return applyThesisInvalidForceClose(recommendation, thesisState);
    default:
      return recommendation;
  }
}

/** Confidence từ score V3 scan hiện tại. */
export function deriveScanConfidence(ownDirectionScore: OwnDirectionScore): number {
  return decisionToConfidence(ownDirectionScore.decision, ownDirectionScore.totalScore);
}

function isCriticalRiskRecommendation(recommendation: PositionRecommendation): boolean {
  return isThesisImmuneRecommendation(recommendation);
}

function reduceUrgency(
  urgency: PositionRecommendation['urgency'],
): PositionRecommendation['urgency'] {
  const index = URGENCY_ORDER.indexOf(urgency);
  if (index <= 0) return urgency;
  return URGENCY_ORDER[index - 1]!;
}

function withThesisConfidenceReason(
  recommendation: PositionRecommendation,
  prefix: string,
  currentConfidence: number,
  previousConfidence: number,
  healthScore: number,
): string[] {
  const note = `[Thesis Stability] ${prefix} (confidence ${previousConfidence}→${currentConfidence}, health ${healthScore})`;
  const rest = recommendation.reasons.filter(
    (r) => !r.startsWith('[Thesis Stability]'),
  );
  return [note, ...rest].slice(0, 5);
}

function applyStrongThesisConfidenceDipHold(
  recommendation: PositionRecommendation,
  ctx: ThesisConfidenceDecisionContext,
  deltaLevel: ConfidenceDeltaLevel,
): PositionRecommendation {
  if (!isHealthySuppressibleRecommendation(recommendation)) return recommendation;

  return {
    ...recommendation,
    type: 'HOLD',
    label: 'Tiếp tục giữ — thesis mạnh, confidence giảm mạnh',
    color: COLOR_BULL,
    urgency: 'LOW',
    confidence: Math.min(recommendation.confidence, 70),
    reasons: withThesisConfidenceReason(
      recommendation,
      `Ưu tiên HOLD — thesis health >= 80 (${deltaLevel})`,
      ctx.currentConfidence,
      ctx.previousConfidence,
      ctx.thesisHealth.score,
    ),
    thesisConfidenceDecisionApplied: true,
    thesisConfidenceDecisionNote: 'STRONG_THESIS_MAJOR_DROP_HOLD',
    thesisConfidenceDeltaLevel: deltaLevel,
  };
}

function applyMinorConfidenceDrop(
  recommendation: PositionRecommendation,
  ctx: ThesisConfidenceDecisionContext,
): PositionRecommendation {
  const nextUrgency = reduceUrgency(recommendation.urgency);
  if (nextUrgency === recommendation.urgency) return recommendation;

  return {
    ...recommendation,
    urgency: nextUrgency,
    reasons: withThesisConfidenceReason(
      recommendation,
      'Confidence giảm nhẹ — hạ urgency một bậc',
      ctx.currentConfidence,
      ctx.previousConfidence,
      ctx.thesisHealth.score,
    ),
    thesisConfidenceDecisionApplied: true,
    thesisConfidenceDecisionNote: 'MINOR_DROP_URGENCY_SOFTEN',
    thesisConfidenceDeltaLevel: 'MINOR_DROP',
  };
}

function applyConfidenceCollapseExitPressure(
  recommendation: PositionRecommendation,
  ctx: ThesisConfidenceDecisionContext,
): PositionRecommendation {
  if (isCloseFamilyAction(recommendation.type)) {
    const nextUrgency = bumpUrgency(bumpUrgency(recommendation.urgency));
    return {
      ...recommendation,
      urgency: nextUrgency,
      confidence: Math.max(recommendation.confidence, 85),
      reasons: withThesisConfidenceReason(
        recommendation,
        'Confidence sụp — tăng áp lực thoát',
        ctx.currentConfidence,
        ctx.previousConfidence,
        ctx.thesisHealth.score,
      ),
      thesisConfidenceDecisionApplied: true,
      thesisConfidenceDecisionNote: 'COLLAPSE_REINFORCE_CLOSE',
      thesisConfidenceDeltaLevel: 'COLLAPSE',
    };
  }

  if (isHoldFamilyAction(recommendation.type)) {
    return {
      ...recommendation,
      type: 'CLOSE_NOW',
      label: 'Đóng lệnh — confidence sụp mạnh',
      color: COLOR_BEAR,
      urgency: 'HIGH',
      confidence: Math.max(recommendation.confidence, 85),
      reasons: withThesisConfidenceReason(
        recommendation,
        'Force CLOSE — confidence collapse',
        ctx.currentConfidence,
        ctx.previousConfidence,
        ctx.thesisHealth.score,
      ),
      thesisConfidenceDecisionApplied: true,
      thesisConfidenceDecisionNote: 'COLLAPSE_FORCE_CLOSE',
      thesisConfidenceDeltaLevel: 'COLLAPSE',
    };
  }

  return {
    ...recommendation,
    urgency: bumpUrgency(bumpUrgency(recommendation.urgency)),
    confidence: Math.max(recommendation.confidence, 80),
    reasons: withThesisConfidenceReason(
      recommendation,
      'Confidence sụp — tăng urgency thoát',
      ctx.currentConfidence,
      ctx.previousConfidence,
      ctx.thesisHealth.score,
    ),
    thesisConfidenceDecisionApplied: true,
    thesisConfidenceDecisionNote: 'COLLAPSE_EXIT_PRESSURE',
    thesisConfidenceDeltaLevel: 'COLLAPSE',
  };
}

function applyMajorConfidenceRiseWeight(
  recommendation: PositionRecommendation,
  ctx: ThesisConfidenceDecisionContext,
): PositionRecommendation {
  const boostedConfidence = Math.max(
    recommendation.confidence,
    ctx.currentConfidence,
    75,
  );

  return {
    ...recommendation,
    confidence: boostedConfidence,
    reasons: withThesisConfidenceReason(
      recommendation,
      'Confidence tăng mạnh — tăng trọng số quyết định',
      ctx.currentConfidence,
      ctx.previousConfidence,
      ctx.thesisHealth.score,
    ),
    thesisConfidenceDecisionApplied: true,
    thesisConfidenceDecisionNote: 'MAJOR_RISE_CONFIDENCE_WEIGHT',
    thesisConfidenceDeltaLevel: 'MAJOR_RISE',
  };
}

function isPendingDomainConfirmationHold(
  recommendation: PositionRecommendation,
): boolean {
  return (
    recommendation.triggeredBy === 'FUNDING_REVERSAL' &&
    recommendation.shouldSetFundingReversalPending === true
  );
}

function applyConfidenceSurgeConfirmation(
  recommendation: PositionRecommendation,
  ctx: ThesisConfidenceDecisionContext,
): PositionRecommendation {
  if (isPendingDomainConfirmationHold(recommendation)) {
    return recommendation;
  }

  const isBrokenThesis =
    ctx.thesisHealth.score <
    THESIS_CONFIDENCE_DECISION_THRESHOLDS.BROKEN_THESIS_MAX_HEALTH;

  if (isBrokenThesis) {
    const reinforced = applyBrokenThesisConfidenceRiseClose(recommendation, ctx);
    return {
      ...reinforced,
      urgency: 'CRITICAL',
      confidence: Math.max(reinforced.confidence, 88),
      thesisConfidenceDecisionNote: 'SURGE_BROKEN_THESIS_CLOSE',
      thesisConfidenceDeltaLevel: 'SURGE',
      reasons: withThesisConfidenceReason(
        recommendation,
        'Confidence surge nhưng thesis gãy — thoát mạnh',
        ctx.currentConfidence,
        ctx.previousConfidence,
        ctx.thesisHealth.score,
      ),
    };
  }

  if (isHoldFamilyAction(recommendation.type)) {
    return {
      ...recommendation,
      urgency: 'LOW',
      confidence: Math.max(recommendation.confidence, ctx.currentConfidence, 85),
      reasons: withThesisConfidenceReason(
        recommendation,
        'Confidence surge — xác nhận giữ mạnh',
        ctx.currentConfidence,
        ctx.previousConfidence,
        ctx.thesisHealth.score,
      ),
      thesisConfidenceDecisionApplied: true,
      thesisConfidenceDecisionNote: 'SURGE_STRONG_HOLD_CONFIRMATION',
      thesisConfidenceDeltaLevel: 'SURGE',
    };
  }

  if (
    isCloseFamilyAction(recommendation.type) &&
    !isThesisImmuneRecommendation(recommendation)
  ) {
    const nextUrgency = reduceUrgency(recommendation.urgency);
    return {
      ...recommendation,
      urgency: nextUrgency,
      confidence: Math.max(recommendation.confidence, ctx.currentConfidence),
      reasons: withThesisConfidenceReason(
        recommendation,
        'Confidence surge — giảm over-exit',
        ctx.currentConfidence,
        ctx.previousConfidence,
        ctx.thesisHealth.score,
      ),
      thesisConfidenceDecisionApplied: true,
      thesisConfidenceDecisionNote: 'SURGE_SOFTEN_EXIT',
      thesisConfidenceDeltaLevel: 'SURGE',
    };
  }

  return {
    ...recommendation,
    confidence: Math.max(recommendation.confidence, ctx.currentConfidence, 85),
    reasons: withThesisConfidenceReason(
      recommendation,
      'Confidence surge — xác nhận mạnh',
      ctx.currentConfidence,
      ctx.previousConfidence,
      ctx.thesisHealth.score,
    ),
    thesisConfidenceDecisionApplied: true,
    thesisConfidenceDecisionNote: 'SURGE_CONFIRMATION',
    thesisConfidenceDeltaLevel: 'SURGE',
  };
}

function applyBrokenThesisConfidenceRiseClose(
  recommendation: PositionRecommendation,
  ctx: ThesisConfidenceDecisionContext,
  deltaLevel: ConfidenceDeltaLevel = 'MAJOR_RISE',
): PositionRecommendation {
  if (recommendation.type === 'CLOSE_NOW' || recommendation.type === 'CLOSE_URGENT') {
    return {
      ...recommendation,
      urgency: bumpUrgency(recommendation.urgency),
      reasons: withThesisConfidenceReason(
        recommendation,
        'Thesis gãy — không để confidence tăng ghi đè thoát',
        ctx.currentConfidence,
        ctx.previousConfidence,
        ctx.thesisHealth.score,
      ),
      thesisConfidenceDecisionApplied: true,
      thesisConfidenceDecisionNote: 'BROKEN_THESIS_REINFORCE_CLOSE',
      thesisConfidenceDeltaLevel: deltaLevel,
    };
  }

  return {
    ...recommendation,
    type: 'CLOSE_NOW',
    label: 'Đóng lệnh — thesis gãy dù confidence tăng',
    color: COLOR_BEAR,
    urgency: deltaLevel === 'SURGE' ? 'CRITICAL' : 'HIGH',
    confidence: Math.max(recommendation.confidence, 80),
    reasons: withThesisConfidenceReason(
      recommendation,
      `Force CLOSE — thesis health < 40 (${deltaLevel})`,
      ctx.currentConfidence,
      ctx.previousConfidence,
      ctx.thesisHealth.score,
    ),
    thesisConfidenceDecisionApplied: true,
    thesisConfidenceDecisionNote: 'BROKEN_THESIS_CONFIDENCE_RISE_CLOSE',
    thesisConfidenceDeltaLevel: deltaLevel,
  };
}

/**
 * Lớp quyết định cuối — thesis health × confidence delta bands (trước stability filter).
 * Priority: Critical Risk → Thesis Validity → Rules → Confidence → Stability.
 */
export function applyThesisConfidenceDecisionLayer(
  recommendation: PositionRecommendation,
  ctx: ThesisConfidenceDecisionContext,
  options?: { skipOnEntrySnapshot?: boolean },
): PositionRecommendation {
  if (options?.skipOnEntrySnapshot) return recommendation;
  if (isCriticalRiskRecommendation(recommendation)) return recommendation;

  const confidenceDelta = ctx.currentConfidence - ctx.previousConfidence;
  const deltaLevel = classifyConfidenceDelta(confidenceDelta);
  if (deltaLevel === 'NEUTRAL') return recommendation;

  switch (deltaLevel) {
    case 'MINOR_DROP':
      return applyMinorConfidenceDrop(recommendation, ctx);

    case 'MAJOR_DROP':
      if (
        ctx.thesisHealth.score >=
        THESIS_CONFIDENCE_DECISION_THRESHOLDS.STRONG_THESIS_MIN_HEALTH
      ) {
        return applyStrongThesisConfidenceDipHold(
          recommendation,
          ctx,
          deltaLevel,
        );
      }
      return applyMinorConfidenceDrop(recommendation, ctx);

    case 'COLLAPSE':
      return applyConfidenceCollapseExitPressure(recommendation, ctx);

    case 'MINOR_RISE':
      return recommendation;

    case 'MAJOR_RISE':
      if (
        ctx.thesisHealth.score <
        THESIS_CONFIDENCE_DECISION_THRESHOLDS.BROKEN_THESIS_MAX_HEALTH
      ) {
        return applyBrokenThesisConfidenceRiseClose(
          recommendation,
          ctx,
          deltaLevel,
        );
      }
      return applyMajorConfidenceRiseWeight(recommendation, ctx);

    case 'SURGE':
      return applyConfidenceSurgeConfirmation(recommendation, ctx);

    default:
      return recommendation;
  }
}

function attachThesisHealthToRecommendation(
  input: EvaluatePositionInput,
  recommendation: PositionRecommendation,
  thesis: Readonly<TradeThesisSnapshot>,
): PositionRecommendation {
  const thesisHealth = calculateThesisHealthScore(input, thesis);
  return {
    ...recommendation,
    thesisHealth,
    thesisState: evaluateThesisState(thesisHealth),
  };
}

function ruleHardBlock(input: RuleContext): RuleResult {
  const { position, ownDirectionScore } = input;
  const criticalBlocks = ownDirectionScore.hardBlocks.filter((b) =>
    includesAny(b, ['BTC', 'Funding', 'squeeze']),
  );

  if (criticalBlocks.length === 0) return NO_MATCH;

  const reasons = [criticalBlocks[0]];
  if (ownDirectionScore.hardBlocks.length > 1) {
    reasons.push(`+${ownDirectionScore.hardBlocks.length - 1} lý do khác`);
  }

  if (position.currentPnlUSDT > 0) {
    reasons.push(
      `Đang lời +${position.currentPnlUSDT.toFixed(2)} USDT — chốt trước khi xấu hơn`,
    );
    return {
      matched: true,
      priority: 100,
      ruleName: 'HARD_BLOCK',
      type: 'CLOSE_URGENT',
      label: 'Chốt lời ngay',
      color: COLOR_BEAR,
      confidence: 92,
      reasons,
      urgency: 'CRITICAL',
    };
  }

  return {
    matched: true,
    priority: 100,
    ruleName: 'HARD_BLOCK',
    type: 'CLOSE_URGENT',
    label: 'Đóng khẩn cấp',
    color: COLOR_BEAR,
    confidence: 95,
    reasons,
    urgency: 'CRITICAL',
  };
}

function ruleGroupBlock(input: RuleContext): RuleResult {
  const { position, ownDirectionScore } = input;
  if (ownDirectionScore.groupBlocks.length === 0) return NO_MATCH;

  const reasons = ownDirectionScore.groupBlocks.slice(0, 2);

  if (position.currentPnlUSDT > 0) {
    reasons.push(`Đang lời +${position.currentPnlUSDT.toFixed(2)} USDT — nên chốt`);
    return {
      matched: true,
      priority: 95,
      ruleName: 'GROUP_BLOCK',
      type: 'CLOSE_NOW',
      label: 'Chốt lời',
      color: COLOR_WARN,
      confidence: 75,
      reasons,
      urgency: 'MEDIUM',
    };
  }

  return {
    matched: true,
    priority: 95,
    ruleName: 'GROUP_BLOCK',
    type: 'CLOSE_NOW',
    label: 'Đóng lệnh',
    color: COLOR_BEAR,
    confidence: 70,
    reasons,
    urgency: 'MEDIUM',
  };
}

function ruleBTCReversal(input: RuleContext): RuleResult {
  const { position, ownDirectionScore } = input;
  const l8 = getLayer(ownDirectionScore.layers, 8);
  if (l8 == null || l8 > 0) return NO_MATCH;

  const l8Layer = ownDirectionScore.layers.find((l) => l.layerNumber === 8);
  const reasons = [
    l8Layer?.reason?.trim() ||
      (position.direction === 'LONG'
        ? 'BTC đang giảm mạnh — không thuận Long'
        : 'BTC đang tăng mạnh — không thuận Short'),
  ];

  if (position.currentPnlUSDT > 0) {
    reasons.push(`Đang lời +${position.currentPnlUSDT.toFixed(2)} USDT — chốt trước khi đảo`);
    return {
      matched: true,
      priority: 90,
      ruleName: 'BTC_REVERSAL',
      type: 'CLOSE_URGENT',
      label: 'Chốt lời ngay',
      color: COLOR_BEAR,
      confidence: 88,
      reasons,
      urgency: 'HIGH',
    };
  }

  return {
    matched: true,
    priority: 90,
    ruleName: 'BTC_REVERSAL',
    type: 'CLOSE_URGENT',
    label: 'Đóng khẩn cấp',
    color: COLOR_BEAR,
    confidence: 82,
    reasons,
    urgency: 'HIGH',
  };
}

function ruleOppositeDirectionStrong(input: RuleContext): RuleResult {
  const { position, oppositeDirectionScore, lastRecommendationType } = input;

  const isCurrentlyActive = lastRecommendationType === 'CLOSE_REVERSE';
  const threshold = isCurrentlyActive ? 10.0 : 11.0;

  if (
    oppositeDirectionScore.totalScore < threshold ||
    oppositeDirectionScore.hardBlocks.length > 0
  ) {
    return NO_MATCH;
  }

  const oppositeDirLabel = position.direction === 'LONG' ? 'SHORT' : 'LONG';
  const reasons = [
    `Setup ${oppositeDirLabel} đang rất mạnh (${oppositeDirectionScore.totalScore.toFixed(1)}/15đ)`,
    'Dấu hiệu thị trường có thể đang đảo chiều hoàn toàn',
  ];

  if (position.currentPnlUSDT > 0) {
    reasons.push(`Đang lời +${position.currentPnlUSDT.toFixed(2)} USDT — chốt lời, tránh đảo chiều`);
    return {
      matched: true,
      priority: 85,
      ruleName: 'OPPOSITE_STRONG',
      type: 'CLOSE_REVERSE',
      label: 'Chốt lời, cẩn thận đảo chiều',
      color: COLOR_WARN,
      confidence: 78,
      reasons,
      urgency: 'HIGH',
    };
  }

  // So sánh cùng đơn vị USDT với maxLossUSDT (giống ruleFundingReversal,
  // ruleSqueezeRiskAlert) — tránh lỗi đơn vị cũ (so PnL USDT với
  // entryPrice × hệ số, vốn không cùng đơn vị và phụ thuộc sai vào
  // giá tuyệt đối của coin).
  const maxLoss = position.maxLossUSDT ?? 0;
  const lossAbs = Math.abs(position.currentPnlUSDT);
  // Khi thiếu maxLossUSDT (field chưa populate hoặc lỗi data), KHÔNG
  // dùng +Infinity (sẽ khiến MỌI mức lỗ bị coi là "nhẹ" một cách im
  // lặng). Dùng threshold = 0 để buộc rơi xuống nhánh CLOSE_NOW cẩn
  // trọng hơn ở cuối hàm khi không chắc chắn về mức độ rủi ro thật.
  const lightLossThreshold = maxLoss > 0 ? maxLoss * 0.3 : 0;

  if (lossAbs < lightLossThreshold) {
    reasons.push('Lỗ nhẹ — đóng sớm tránh lỗ thêm khi đảo chiều');
    return {
      matched: true,
      priority: 85,
      ruleName: 'OPPOSITE_STRONG',
      type: 'CLOSE_REVERSE',
      label: 'Đóng lệnh, đảo chiều',
      color: COLOR_BEAR,
      confidence: 70,
      reasons,
      urgency: 'HIGH',
    };
  }

  reasons.push('Đang lỗ — theo dõi sát, sẵn sàng đóng nếu SL gần');
  return {
    matched: true,
    priority: 85,
    ruleName: 'OPPOSITE_STRONG',
    type: 'CLOSE_NOW',
    label: 'Cân nhắc đóng lệnh',
    color: COLOR_BEAR,
    confidence: 60,
    reasons,
    urgency: 'MEDIUM',
  };
}

function ruleCVDDivergence(input: RuleContext): RuleResult {
  const { ownDirectionScore, position } = input;
  const l5 = getLayer(ownDirectionScore.layers, 5);
  const cvdWarning = ownDirectionScore.warnings.find((w) =>
    includesAny(w, ['CVD phân kỳ', 'bull trap', 'bear trap']),
  );

  if (!cvdWarning || l5 == null || l5 > 0) return NO_MATCH;

  const distToTP1Pct = calcDistToTP1Pct(position);
  const canTrigger =
    position.lastCVDDivergenceActive === true || distToTP1Pct < 70;

  if (!canTrigger) {
    return { matched: false, shouldSetCVDFlag: true };
  }

  const reasons = [cvdWarning];

  if (distToTP1Pct >= 70) {
    reasons.push(`Đã đi ${distToTP1Pct.toFixed(0)}% đến TP1 — chốt sớm`);
    return {
      matched: true,
      priority: 80,
      ruleName: 'CVD_DIVERGENCE',
      type: 'PARTIAL_TP1',
      label: 'Chốt 50% ngay',
      color: COLOR_WARN,
      confidence: 80,
      reasons,
      urgency: 'HIGH',
      shouldSetCVDFlag: true,
    };
  }

  return {
    matched: true,
    priority: 80,
    ruleName: 'CVD_DIVERGENCE',
    type: 'CLOSE_NOW',
    label: 'Đóng lệnh',
    color: COLOR_BEAR,
    confidence: 75,
    reasons,
    urgency: 'HIGH',
    shouldSetCVDFlag: true,
  };
}

function ruleTPHit(input: RuleContext): RuleResult {
  const { ownDirectionScore } = input;
  const distToTP1Pct = calcDistToTP1Pct(input.position);

  if (distToTP1Pct < 100) return NO_MATCH;

  const distToTP2Pct = calcDistToTP2Pct(input.position);

  if (distToTP2Pct >= 80) {
    return {
      matched: true,
      priority: 60,
      ruleName: 'TP_HIT',
      type: 'PARTIAL_TP2',
      label: 'Chốt thêm 30%',
      color: COLOR_BULL,
      confidence: 85,
      urgency: 'MEDIUM',
      reasons: [
        `Đã vượt TP1, đang tiến đến TP2 (${distToTP2Pct.toFixed(0)}%)`,
        'Chốt thêm 30% tại TP2',
      ],
    };
  }

  const reasons = ['Đã chạm TP1 — chốt 50% bảo toàn lợi nhuận'];
  if (ownDirectionScore.totalScore < 8) {
    reasons.push('Score đang giảm — chốt sớm an toàn hơn');
  }

  return {
    matched: true,
    priority: 60,
    ruleName: 'TP_HIT',
    type: 'PARTIAL_TP1',
    label: 'Chốt 50% TP1',
    color: COLOR_BULL,
    confidence: 90,
    reasons,
    urgency: 'MEDIUM',
  };
}

function ruleScoreDropNearTP1(input: RuleContext): RuleResult {
  const { ownDirectionScore } = input;
  const distToTP1Pct = calcDistToTP1Pct(input.position);

  if (distToTP1Pct < 50 || ownDirectionScore.totalScore >= 8) return NO_MATCH;

  return {
    matched: true,
    priority: 50,
    ruleName: 'SCORE_DROP_NEAR_TP1',
    type: 'PARTIAL_TP1',
    label: 'Chốt 50% sớm',
    color: COLOR_WARN,
    confidence: 72,
    urgency: 'MEDIUM',
    reasons: [
      `Score giảm xuống ${ownDirectionScore.totalScore.toFixed(1)}/15 khi đang lời`,
      `Đã đi ${distToTP1Pct.toFixed(0)}% đến TP1`,
    ],
  };
}

function ruleMoveSLBreakeven(input: RuleContext): RuleResult {
  const { position, marketMode } = input;
  const distToTP1Pct = calcDistToTP1Pct(position);

  if (
    distToTP1Pct < 60 ||
    position.currentPnlUSDT <= 0 ||
    !isBeyondOnePointFiveR(position)
  ) {
    return NO_MATCH;
  }

  const reasons = [
    `Đang lời tốt (+${position.currentPnlUSDT.toFixed(2)} USDT)`,
    'Dời SL về breakeven để bảo vệ vốn',
  ];
  if (marketMode === 'TRENDING') {
    reasons.push('Thị trường trending — giữ phần còn lại chạy tiếp');
  }

  return {
    matched: true,
    priority: 40,
    ruleName: 'MOVE_SL_BE',
    type: 'HOLD_MOVE_SL',
    label: 'Dời SL về entry',
    color: COLOR_BULL,
    confidence: 85,
    reasons,
    urgency: 'MEDIUM',
  };
}

function ruleHoldStrong(input: RuleContext): RuleResult {
  const { ownDirectionScore, marketMode, lastRecommendationType } = input;

  const isCurrentlyHoldStrong = lastRecommendationType === 'HOLD';
  const threshold = isCurrentlyHoldStrong ? 8.5 : 9.0;

  if (
    ownDirectionScore.totalScore < threshold ||
    ownDirectionScore.hardBlocks.length > 0 ||
    ownDirectionScore.groupBlocks.length > 0
  ) {
    return NO_MATCH;
  }

  const l5 = getLayer(ownDirectionScore.layers, 5) ?? 0;
  const reasons: string[] = [];

  if (ownDirectionScore.totalScore >= 11) {
    reasons.push(`Score V3 mạnh: ${ownDirectionScore.totalScore.toFixed(1)}/15`);
    if (l5 >= 1.5) reasons.push('CVD/Dòng tiền đang ủng hộ hướng lệnh');
    if (marketMode === 'TRENDING') reasons.push('Thị trường đang trending rõ');
    return {
      matched: true,
      priority: 20,
      ruleName: 'HOLD_STRONG',
      type: 'HOLD',
      label: 'Tiếp tục giữ',
      color: COLOR_BULL,
      confidence: 85,
      reasons,
      urgency: 'LOW',
    };
  }

  reasons.push(`Score V3: ${ownDirectionScore.totalScore.toFixed(1)}/15 — ổn định`);
  return {
    matched: true,
    priority: 20,
    ruleName: 'HOLD_STRONG',
    type: 'HOLD',
    label: 'Tiếp tục giữ',
    color: COLOR_BULL,
    confidence: 72,
    reasons,
    urgency: 'LOW',
  };
}

function ruleHoldConditional(input: RuleContext): RuleResult {
  const { position, ownDirectionScore, lastRecommendationType } = input;

  const isCurrentlyHoldConditional = lastRecommendationType === 'HOLD';
  const threshold = isCurrentlyHoldConditional ? 6.5 : 7.0;

  if (ownDirectionScore.totalScore < threshold) return NO_MATCH;

  const l1 = getLayer(ownDirectionScore.layers, 1) ?? 0;
  const l3 = getLayer(ownDirectionScore.layers, 3) ?? 0;
  const hoursHeld = (Date.now() - position.openedAt) / 3_600_000;
  const reasons: string[] = [];

  if (l1 < 1 && position.direction === 'LONG') {
    reasons.push('L1 MA yếu — giá đang mâu thuẫn với EMA');
  }
  if (l3 < 1) {
    reasons.push('MACD histogram đang yếu dần');
  }
  if (hoursHeld > 8) {
    reasons.push(`Đã giữ ${Math.floor(hoursHeld)}h — theo dõi sát hơn`);
  }
  if (reasons.length === 0) {
    reasons.push('Score trung bình — tiếp tục theo dõi');
  }

  return {
    matched: true,
    priority: 10,
    ruleName: 'HOLD_CONDITIONAL',
    type: 'HOLD',
    label: 'Tiếp tục giữ',
    color: COLOR_WARN,
    confidence: 58,
    reasons,
    urgency: 'LOW',
  };
}

function ruleFallback(input: RuleContext): RuleResult {
  return {
    matched: true,
    priority: 0,
    ruleName: 'FALLBACK',
    type: 'HOLD',
    label: 'Tiếp tục giữ',
    color: COLOR_WARN,
    confidence: 50,
    urgency: 'LOW',
    reasons: [`Score ${input.ownDirectionScore.totalScore.toFixed(1)}/15 — theo dõi thêm`],
  };
}

const ALL_RULES: Array<(input: RuleContext) => RuleResult> = [
  ruleHardBlock,
  ruleGroupBlock,
  ruleBTCReversal,
  ruleOppositeDirectionStrong,
  ruleCVDDivergence,
  ruleTPHit,
  ruleScoreDropNearTP1,
  ruleMoveSLBreakeven,
  ruleHoldStrong,
  ruleHoldConditional,
  ruleFallback,
];

export type PositionAdvisorRuleReplacements = Partial<{
  holdStrong: (input: RuleContext) => RuleResult;
  moveSlBe: (input: RuleContext) => RuleResult;
}>;

function resolveAdvisorRules(
  ruleReplacements?: PositionAdvisorRuleReplacements,
): Array<(input: RuleContext) => RuleResult> {
  if (!ruleReplacements?.holdStrong && !ruleReplacements?.moveSlBe) {
    return ALL_RULES;
  }
  return ALL_RULES.map((rule) => {
    if (rule === ruleHoldStrong && ruleReplacements.holdStrong) {
      return ruleReplacements.holdStrong;
    }
    if (rule === ruleMoveSLBreakeven && ruleReplacements.moveSlBe) {
      return ruleReplacements.moveSlBe;
    }
    return rule;
  });
}

export function buildPositionAdvisorContext(
  input: EvaluatePositionInput,
): RuleContext {
  const snapshot = input.tradeThesisSnapshot ?? input.position.tradeThesisSnapshot;
  const memory = input.positionMemory ?? input.position.positionMemory;
  const positionWithPrice: PositionWithPrice = {
    ...input.position,
    currentPrice: input.currentPrice,
    ...(snapshot ? { tradeThesisSnapshot: snapshot } : {}),
    ...(memory ? { positionMemory: memory } : {}),
  };
  return {
    ...input,
    ...(snapshot ? { tradeThesisSnapshot: snapshot } : {}),
    ...(memory ? { positionMemory: memory } : {}),
    position: positionWithPrice,
  };
}

/** Chạy rule matrix — `extraRules` cho V4 (vd. FUNDING_REVERSAL). */
export function runPositionAdvisorRules(
  ctx: RuleContext,
  extraRules: Array<(input: RuleContext) => RuleResult> = [],
): MatchedRuleResult[] {
  return collectPositionAdvisorRuleResults(ctx, extraRules).matchedRules;
}

export function collectPositionAdvisorRuleResults(
  ctx: RuleContext,
  extraRules: Array<(input: RuleContext) => RuleResult> = [],
  ruleReplacements?: PositionAdvisorRuleReplacements,
): {
  matchedRules: MatchedRuleResult[];
  shouldSetCVDFlag: boolean;
  shouldSetFundingReversalPending: boolean;
  shouldClearFundingReversalPending: boolean;
} {
  const coreRules = resolveAdvisorRules(ruleReplacements);
  const allResults = [...coreRules, ...extraRules].map((rule) => rule(ctx));
  const matchedRules = allResults.filter((r): r is MatchedRuleResult => r.matched);
  matchedRules.sort((a, b) => b.priority - a.priority);
  return {
    matchedRules,
    shouldSetCVDFlag: allResults.some((r) => r.shouldSetCVDFlag === true),
    shouldSetFundingReversalPending: allResults.some(
      (r) => r.shouldSetFundingReversalPending === true,
    ),
    shouldClearFundingReversalPending: allResults.some(
      (r) => r.shouldClearFundingReversalPending === true,
    ),
  };
}

export function applyPositionAdvisorRuleSideEffects(
  recommendation: PositionRecommendation,
  sideEffects: Pick<
    ReturnType<typeof collectPositionAdvisorRuleResults>,
    | 'shouldSetCVDFlag'
    | 'shouldSetFundingReversalPending'
    | 'shouldClearFundingReversalPending'
  >,
): PositionRecommendation {
  let result = recommendation;
  if (sideEffects.shouldSetCVDFlag) {
    result = { ...result, shouldSetCVDFlag: true };
  }
  if (sideEffects.shouldSetFundingReversalPending) {
    result = { ...result, shouldSetFundingReversalPending: true };
  }
  if (sideEffects.shouldClearFundingReversalPending) {
    result = { ...result, shouldClearFundingReversalPending: true };
  }
  return result;
}

export function recommendFromMatchedRules(
  matchedRules: MatchedRuleResult[],
  ctx: RuleContext,
): PositionRecommendation {
  const winner = matchedRules[0] ?? ruleFallback(ctx);

  const allReasons: string[] = [...winner.reasons];
  for (const rule of matchedRules.slice(1, 3)) {
    const extra = rule.reasons[0];
    if (extra && !allReasons.includes(extra)) {
      allReasons.push(`(${rule.ruleName}) ${extra}`);
    }
  }

  return {
    type: winner.type,
    label: winner.label,
    color: winner.color,
    confidence: winner.confidence,
    reasons: allReasons.slice(0, 5),
    urgency: winner.urgency,
    matchedRuleCount: matchedRules.length,
    triggeredBy: winner.ruleName,
  };
}

export function evaluatePositionV2(input: EvaluatePositionInput): PositionRecommendation {
  const resolved = resolvePositionMemoryAndSnapshot(input);
  const enrichedInput: EvaluatePositionInput = {
    ...input,
    tradeThesisSnapshot: resolved.snapshot,
    positionMemory: resolved.memory,
    position: {
      ...input.position,
      tradeThesisSnapshot: resolved.snapshot,
      positionMemory: resolved.memory,
    },
  };
  const ctx = buildPositionAdvisorContext(enrichedInput);
  const { matchedRules, ...sideEffects } = collectPositionAdvisorRuleResults(ctx);
  const recommendation = recommendWithGracePeriod(matchedRules, ctx, {
    position: enrichedInput.position,
    currentPrice: enrichedInput.currentPrice,
    atr1h: enrichedInput.atr1h,
    now: enrichedInput.now,
  });
  const withSideEffects = applyPositionAdvisorRuleSideEffects(recommendation, sideEffects);

  const thesisHealth = calculateThesisHealthScore(enrichedInput, resolved.snapshot);
  const previousThesisState = resolved.memoryCreated
    ? null
    : resolved.memory.lastThesisState;
  const thesisState = evaluateThesisState(thesisHealth, previousThesisState);
  const withThesisEngine = applyThesisEngineLayer(withSideEffects, thesisState, {
    skipOnEntrySnapshot: resolved.memoryCreated,
  });

  const currentScanConfidence = deriveScanConfidence(enrichedInput.ownDirectionScore);
  const previousScanConfidence =
    resolved.memory.lastScanConfidence ?? resolved.memory.entryConfidence;
  const withConfidenceDecision = applyThesisConfidenceDecisionLayer(
    withThesisEngine,
    {
      thesisHealth,
      thesisState,
      currentConfidence: currentScanConfidence,
      previousConfidence: previousScanConfidence,
    },
    { skipOnEntrySnapshot: resolved.memoryCreated },
  );

  const withStability = applyRecommendationStability(
    withConfidenceDecision,
    input.stabilityState,
  );
  const positionMemory = commitPositionMemoryScan(
    enrichedInput.position,
    resolved.memory,
    thesisHealth,
    thesisState,
    currentScanConfidence,
    enrichedInput.now,
  );

  return {
    ...withStability,
    tradeThesisSnapshot: resolved.snapshot,
    positionMemory,
    thesisHealth,
    thesisState,
    shouldPersistPositionMemory: true,
    ...(resolved.memoryCreated ? { shouldPersistTradeThesisSnapshot: true } : {}),
  };
}

/** @deprecated Dùng evaluatePositionV2() thay thế */
export function evaluatePosition(
  position: ActivePosition,
  currentPrice: number,
  currentScoreV3: OwnDirectionScore,
  marketMode: 'TRENDING' | 'RANGING',
): PositionRecommendation {
  return evaluatePositionV2({
    position,
    currentPrice,
    ownDirectionScore: currentScoreV3,
    oppositeDirectionScore: { totalScore: 0, decision: 'KHONG_VAO', hardBlocks: [] },
    marketMode,
  });
}

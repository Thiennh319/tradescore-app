import { CAPITAL_RATIOS } from '../constants/capitalManagement';
import type { SkipReason, LayerResult, AppSettings, TradePlan, ScorerVersion, FundingState } from '../constants/scoring';
import { computePositionPnl } from '../utils/positionPnl';
import type { L6DetailV4 } from './scorerV4';
import type { SqueezeDirection, SqueezeLevel, SqueezeRiskResult } from '../types/squeezeRisk';
import type { CancelReason } from '../services/lockedPlanScoring';
import { vi } from '../constants/vi';
import type { EntryZoneType, ADXAnalysis } from './indicators';
import { exitReasonToCloseReason } from './tradeHistorySync';
import { SCORER_LAYER_NAMES, type ScorerLayerId } from '../constants/scoring';
import type { SignalRow } from '../services/signalBoardScan';
import type { StructureSLResult } from './structureSL';
import { resolveJournalAdvisorSnapshot } from './journalAdvisorSnapshot';
import {
  sumRealizedPartialPnl,
  resolveOriginalSizeUsdt,
  sumPartialClosePercent,
  partialCloseBadgeLabel,
} from './partialClose';
import { tradePlanV3ToLegacyPlan } from './tradePlanV3';
import {
  AI_JOURNAL_APP_VERSION,
  JOURNAL_ARCHIVE_AGE_MS,
  JOURNAL_ARCHIVE_LIMIT,
  STALE_OPEN_TRADE_MS,
  STALE_PENDING_ORDER_MS,
  type AccountHistoryPoint,
  type AiTradeJournalEntry,
  type AdxJournalSnapshot,
  type StructureSLSnapshot,
  type VWAPSnapshot,
  type StrategySource,
  type LockedTradePlan,
  type MarketSnapshot,
  type StoredEntryZone,
  type TradePlanSnapshot,
  type CvdTrend,
  type DailySessionStats,
  type EntryQualityResult,
  type JournalDirection,
  type LayerScoreMap,
  type LossPattern,
  type ScoringSnapshot,
  type ScoreRangeWinRate,
  type SessionType,
  type TodayQuickStats,
  type TradeExitReason,
  type TradeOutcomeStatus,
  type WeeklyStats,
  type PositionAdvisorActionAtExit,
} from '../constants/aiJournal';
import { calculatePlanExpiry, formatPlanExpiredMessage } from './tradePlanExpiry';
import type { ScoringLayerResult } from '../services/lockedPlanScoring';
import { getVietnamDateParts } from '../store/useTradeStore';

const LAYER_KEYS: (keyof LayerScoreMap)[] = [
  'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10',
];

const SCORE_RANGES: Array<{ label: string; min: number; max: number }> = [
  { label: '<8', min: -Infinity, max: 8 },
  { label: '8-9', min: 8, max: 9 },
  { label: '9-10', min: 9, max: 10 },
  { label: '10-11', min: 10, max: 11 },
  { label: '11-11.5', min: 11, max: 11.5 },
  { label: '>11.5', min: 11.5, max: Infinity },
];

const LAYER_HIGH_THRESHOLD = 1;

export function emptyLayerScores(): LayerScoreMap {
  return { l1: 0, l2: 0, l3: 0, l4: 0, l5: 0, l6: 0, l7: 0, l8: 0, l9: 0, l10: 0 };
}

export function layersToScoreMap(layers: LayerResult[] | ScoringLayerResult[]): LayerScoreMap {
  const map = emptyLayerScores();
  for (const layer of layers) {
    const n = 'layerNumber' in layer ? layer.layerNumber : layer.layer;
    const weighted =
      'layerNumber' in layer
        ? Math.round(layer.score * 0.75 * 100) / 100
        : Math.round(layer.score * 100) / 100;
    const key = `l${n}` as keyof LayerScoreMap;
    if (key in map) map[key] = weighted;
  }
  return map;
}

export function inferSessionType(hourVN: number, settings?: Pick<AppSettings, 'autoCheckStartHour' | 'autoCheckEndHour'>): SessionType {
  const start = settings?.autoCheckStartHour ?? 8;
  const end = settings?.autoCheckEndHour ?? 23;
  if (hourVN >= start && hourVN <= end) return 'GOOD';
  if (hourVN >= start - 2 && hourVN <= end + 1) return 'MEDIUM';
  return 'BAD';
}

export function cvdSlopeToTrend(slope: 'up' | 'down' | 'flat' | string): CvdTrend {
  if (slope === 'up') return 'UP';
  if (slope === 'down') return 'DOWN';
  return 'FLAT';
}

export function computeSlippagePct(entryPrice: number, priceAtAnalysis: number): number {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(priceAtAnalysis) || priceAtAnalysis === 0) {
    return 0;
  }
  return Math.round(((entryPrice - priceAtAnalysis) / priceAtAnalysis) * 10000) / 100;
}

export function buildMarketSnapshot(input: {
  entryPrice: number;
  priceAtAnalysis: number;
  cvdValue?: number;
  cvdTrend?: CvdTrend;
  volumeRatio?: number;
  btcChangePct?: number;
  fundingRate?: number;
  topLSRatio?: number;
  oiChangePct?: number;
  settings?: AppSettings;
  now?: Date;
}): MarketSnapshot {
  const parts = getVietnamDateParts(input.now ?? new Date());
  const hourVN = parts.hour + parts.minute / 60;
  return {
    entryPrice: input.entryPrice,
    priceAtAnalysis: input.priceAtAnalysis,
    slippage: computeSlippagePct(input.entryPrice, input.priceAtAnalysis),
    cvdValue: input.cvdValue ?? 0,
    cvdTrend: input.cvdTrend ?? 'FLAT',
    volumeRatio: input.volumeRatio ?? 1,
    btcChangePct: input.btcChangePct ?? 0,
    fundingRate: input.fundingRate ?? 0,
    topLSRatio: input.topLSRatio ?? 1,
    oiChangePct: input.oiChangePct ?? 0,
    sessionType: inferSessionType(parts.hour, input.settings),
    hourVN: Math.round(hourVN * 100) / 100,
  };
}

export function buildScoringSnapshot(input: {
  totalScore: number;
  direction: JournalDirection;
  layers: LayerResult[] | ScoringLayerResult[];
  mandatoryViolations: string[];
  decision: string;
  scorerVersion?: ScorerVersion;
  groupScores?: { A: number; B: number; C: number };
  l5aScore?: number;
  expectedWinrate?: string;
  recommendationLabel?: string;
  score?: number;
  marketState?: string;
}): ScoringSnapshot {
  return {
    totalScore: input.totalScore,
    direction: input.direction,
    layerScores: layersToScoreMap(input.layers),
    mandatoryViolations: input.mandatoryViolations,
    decision: input.decision,
    scorerVersion: input.scorerVersion,
    groupA: input.groupScores?.A,
    groupB: input.groupScores?.B,
    groupC: input.groupScores?.C,
    l5aScore: input.l5aScore,
    expectedWinrate: input.expectedWinrate,
    recommendationLabel: input.recommendationLabel,
    score: input.score,
    marketState: input.marketState,
  };
}

export function buildPlanSnapshot(input: {
  tradePlan: TradePlan | null;
  entryPrice: number;
  stopLoss?: number;
  takeProfit1?: number;
  sizeActual: number;
  sizeProposed?: number;
}): TradePlanSnapshot {
  const plan = input.tradePlan;
  const zone = plan?.entryZone;
  return {
    entryZoneType: zone?.type ?? plan?.entryReason ?? 'MARKET_NEAR',
    entryZoneOptimal: zone?.optimal ?? plan?.entryPrice ?? input.entryPrice,
    entryZoneRangeLow: zone?.rangeLow ?? input.entryPrice,
    entryZoneRangeHigh: zone?.rangeHigh ?? input.entryPrice,
    slProposed: plan?.stopLoss ?? input.stopLoss ?? 0,
    slActual: input.stopLoss ?? plan?.stopLoss ?? 0,
    tp1Proposed: plan?.takeProfit1 ?? input.takeProfit1 ?? 0,
    tp1Actual: input.takeProfit1 ?? plan?.takeProfit1 ?? 0,
    tp2: plan?.takeProfit2 ?? 0,
    tp3: plan?.takeProfit3 ?? 0,
    rrProposed: plan?.rrRatio ?? plan?.rrRatios?.[0] ?? 0,
    sizeProposed: input.sizeProposed ?? input.sizeActual,
    sizeActual: input.sizeActual,
    isSafeSL: plan?.isSafeSL ?? false,
    openReason: resolveOpenReasonFromTradePlan(plan),
  };
}

/** Lý do mở lệnh — entryZone.reasoning / notes từ trade plan (entry engine). */
export function resolveOpenReasonFromTradePlan(plan: TradePlan | null | undefined): string | undefined {
  const reasoning = plan?.entryZone?.reasoning ?? plan?.notes;
  const trimmed = reasoning?.trim();
  return trimmed || undefined;
}

/** Hiển thị openReason — fallback entryZoneType qua vi cho entry cũ. */
export function resolveJournalOpenReasonDisplay(entry: AiTradeJournalEntry): string | null {
  const stored = entry.plan.openReason?.trim();
  if (stored) return stored;
  const type = entry.plan.entryZoneType as EntryZoneType;
  return vi.recommend.entryZoneTypes[type] ?? entry.plan.entryZoneType ?? null;
}

const CANCEL_EXIT_REASONS = new Set<TradeExitReason>([
  'PLAN_EXPIRED',
  'PLAN_HEALTH_CANCEL',
  'LIMIT_NOT_FILLED',
]);

/** Nhãn lý do đóng — vi.tradeHistory + formatPendingCancelLabel (không hardcode mới). */
export function formatJournalCloseReason(
  exitReason?: TradeExitReason,
  notes?: string,
): string | undefined {
  if (!exitReason) return undefined;
  if (CANCEL_EXIT_REASONS.has(exitReason)) {
    return formatPendingCancelLabel(exitReason, notes);
  }
  const code = exitReasonToCloseReason(exitReason);
  return vi.tradeHistory.closeReason[code] ?? vi.tradeHistory.closeReason.OTHER;
}

/** Hiển thị closeReason — fallback từ exitReason cho entry cũ. */
export function resolveJournalCloseReasonDisplay(entry: AiTradeJournalEntry): string | null {
  const partialExit = formatPartialCloseExitReason(entry);
  if (partialExit) return partialExit;
  const stored = entry.outcome.closeReason?.trim();
  if (stored) return stored;
  if (entry.outcome.status === 'CANCELLED' || CANCEL_EXIT_REASONS.has(entry.outcome.exitReason!)) {
    return formatPendingCancelLabel(entry.outcome.exitReason, entry.outcome.notes);
  }
  if (entry.outcome.exitReason) {
    return formatJournalCloseReason(entry.outcome.exitReason, entry.outcome.notes) ?? null;
  }
  return null;
}

export interface JournalPnlBreakdown {
  hasPartial: boolean;
  closedPercent: number;
  remainingPercent: number;
  realizedPnl: number;
  unrealizedPnl: number | null;
  totalPnl: number | null;
}

/** PnL tách realized / unrealized cho lệnh OPEN có chốt một phần. */
export function buildJournalOpenPnlBreakdown(
  entry: AiTradeJournalEntry,
  markPrice: number | null | undefined,
  leverage: number = CAPITAL_RATIOS.leverage,
): JournalPnlBreakdown {
  const partials = entry.partialCloses ?? [];
  const closedPercent = sumPartialClosePercent(partials);
  const hasPartial = closedPercent > 0;
  const realizedPnl = sumRealizedPartialPnl(partials);
  const lev = leverage > 0 ? leverage : CAPITAL_RATIOS.leverage;

  let unrealizedPnl: number | null = null;
  if (markPrice != null && Number.isFinite(markPrice) && entry.plan.sizeActual > 0) {
    const snap = computePositionPnl(
      {
        direction: entry.scoring.direction,
        entryPrice: entry.market.entryPrice,
        leverage: lev,
        size: entry.plan.sizeActual,
      },
      markPrice,
    );
    unrealizedPnl = snap.pnlUsdt;
  }

  const totalPnl = unrealizedPnl != null ? realizedPnl + unrealizedPnl : null;

  return {
    hasPartial,
    closedPercent,
    remainingPercent: Math.max(0, 100 - closedPercent),
    realizedPnl,
    unrealizedPnl,
    totalPnl,
  };
}

/** Nhãn close reason khi đóng hết sau đã chốt một phần. */
export function formatPartialCloseExitReason(
  entry: AiTradeJournalEntry,
  exitPrice?: number | null,
): string | null {
  const partials = entry.partialCloses ?? [];
  if (partials.length === 0) return null;

  const isClosed =
    entry.outcome.status !== 'OPEN' && entry.outcome.status !== 'PENDING';
  const finalExit =
    exitPrice ??
    entry.outcome.exitPrice ??
    null;
  if (!isClosed && finalExit == null) return null;
  if (finalExit == null || !Number.isFinite(finalExit)) return null;

  const sym = entry.symbol;
  const segments = partials.map(
    (p) =>
      `Chốt ${p.partialClosePercent}% tại ${formatJournalPartialPrice(sym, p.partialClosePrice)}`,
  );
  const remaining = Math.max(0, 100 - sumPartialClosePercent(partials));
  segments.push(
    `Đóng ${remaining}% còn lại tại ${formatJournalPartialPrice(sym, finalExit)}`,
  );
  return segments.join(' → ');
}

function formatJournalPartialPrice(symbol: string, price: number): string {
  if (!Number.isFinite(price)) return '—';
  const abs = Math.abs(price);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return `${price.toFixed(digits)}`;
}

export interface JournalPartialStats {
  partialTradeCount: number;
  totalRealizedPnl: number;
}

export function computeJournalPartialStats(
  entries: readonly AiTradeJournalEntry[],
): JournalPartialStats {
  let partialTradeCount = 0;
  let totalRealizedPnl = 0;
  for (const entry of entries) {
    const partials = entry.partialCloses ?? [];
    if (partials.length === 0) continue;
    partialTradeCount += 1;
    totalRealizedPnl += sumRealizedPartialPnl(partials);
  }
  return {
    partialTradeCount,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
  };
}

/** STATUS — OPEN + partial → RUNNING • PARTIAL X% */
export function resolveJournalStatusLabel(entry: AiTradeJournalEntry): string {
  const base = resolveJournalDisplayStatus(entry.outcome.status);
  const closedPct = sumPartialClosePercent(entry.partialCloses ?? []);
  if (entry.outcome.status === 'OPEN' && closedPct > 0) {
    return `${base} • PARTIAL ${closedPct}%`;
  }
  return base;
}

export function hasJournalPartialClose(entry: AiTradeJournalEntry): boolean {
  return sumPartialClosePercent(entry.partialCloses ?? []) > 0;
}

/** Gắn nhãn partial vào khuyến nghị live (OPEN). */
export function enrichAdvisorLabelWithPartial(
  entry: AiTradeJournalEntry,
  advisorLabel: string,
): string {
  const badge = partialCloseBadgeLabel(entry.partialCloses ?? []);
  if (!badge || entry.outcome.status !== 'OPEN') return advisorLabel;
  const trimmed = advisorLabel.trim();
  if (!trimmed || trimmed === '—') return badge;
  return `${badge} · ${trimmed}`;
}

/** Nhãn trạng thái journal — OPEN hiển thị RUNNING. */
export function resolveJournalDisplayStatus(
  status: AiTradeJournalEntry['outcome']['status'],
): string {
  if (status === 'OPEN') return 'RUNNING';
  return status;
}

export function isJournalRunning(entry: AiTradeJournalEntry): boolean {
  return entry.outcome.status === 'OPEN';
}

export interface FundingAtEntrySnapshot {
  fundingAtEntry: number | null;
  fundingVelocityAtEntry: number | null;
  fundingStateAtEntry: FundingState | null;
}

export interface FundingAtExitSnapshot {
  fundingAtExit: number | null;
  fundingStateAtExit: FundingState | null;
}

export interface SqueezeAtEntrySnapshot {
  squeezeRiskScoreAtEntry: number | null;
  squeezeRiskLevelAtEntry: SqueezeLevel | null;
  squeezeRiskDirectionAtEntry: SqueezeDirection | null;
}

export interface SqueezeAtExitSnapshot {
  squeezeRiskScoreAtExit: number | null;
  squeezeRiskLevelAtExit: SqueezeLevel | null;
  squeezeRiskDirectionAtExit: SqueezeDirection | null;
}

const FUNDING_STATE_VALUES = new Set<string>([
  'EXTREME_LONG_EUPHORIA',
  'LONG_EUPHORIA_FADING',
  'NEUTRAL',
  'SHORT_EUPHORIA_FADING',
  'SHORT_SQUEEZE_BUILDING',
]);

export function isValidFundingState(value: unknown): value is FundingState {
  return typeof value === 'string' && FUNDING_STATE_VALUES.has(value);
}

/** L6 detail lúc vào lệnh — chỉ V4; V3 / thiếu data → null. */
export function fundingAtEntryFromL6Detail(
  l6Detail: L6DetailV4 | undefined | null,
  scorerVersion?: 'v3' | 'v4',
): FundingAtEntrySnapshot {
  if (scorerVersion !== 'v4' || !l6Detail) {
    return {
      fundingAtEntry: null,
      fundingVelocityAtEntry: null,
      fundingStateAtEntry: null,
    };
  }
  return {
    fundingAtEntry: l6Detail.fundingCurrent,
    fundingVelocityAtEntry: l6Detail.fundingVelocity,
    fundingStateAtEntry: l6Detail.fundingState,
  };
}

export function fundingAtExitFromL6Detail(
  l6Detail: L6DetailV4 | undefined | null,
  scorerVersion?: 'v3' | 'v4',
): FundingAtExitSnapshot {
  if (scorerVersion !== 'v4' || !l6Detail) {
    return { fundingAtExit: null, fundingStateAtExit: null };
  }
  return {
    fundingAtExit: l6Detail.fundingCurrent,
    fundingStateAtExit: l6Detail.fundingState,
  };
}

/** L11 squeeze lúc vào lệnh — chỉ V4; V3 / thiếu data → null. */
export function squeezeAtEntryFromResult(
  squeezeRisk: SqueezeRiskResult | undefined | null,
  scorerVersion?: 'v3' | 'v4',
): SqueezeAtEntrySnapshot {
  if (scorerVersion !== 'v4' || !squeezeRisk) {
    return {
      squeezeRiskScoreAtEntry: null,
      squeezeRiskLevelAtEntry: null,
      squeezeRiskDirectionAtEntry: null,
    };
  }
  return {
    squeezeRiskScoreAtEntry: squeezeRisk.score,
    squeezeRiskLevelAtEntry: squeezeRisk.level,
    squeezeRiskDirectionAtEntry: squeezeRisk.direction,
  };
}

export function squeezeAtExitFromResult(
  squeezeRisk: SqueezeRiskResult | undefined | null,
  scorerVersion?: 'v3' | 'v4',
): SqueezeAtExitSnapshot {
  if (scorerVersion !== 'v4' || !squeezeRisk) {
    return {
      squeezeRiskScoreAtExit: null,
      squeezeRiskLevelAtExit: null,
      squeezeRiskDirectionAtExit: null,
    };
  }
  return {
    squeezeRiskScoreAtExit: squeezeRisk.score,
    squeezeRiskLevelAtExit: squeezeRisk.level,
    squeezeRiskDirectionAtExit: squeezeRisk.direction,
  };
}

/** Patch squeeze lúc đóng lệnh — dùng chung store + test. */
export function resolveSqueezeExitPatchForClose(input: {
  entry: Pick<AiTradeJournalEntry, 'scoring' | 'symbol'>;
  options: {
    squeezeRiskScoreAtExit?: number | null;
    squeezeRiskLevelAtExit?: SqueezeLevel | null;
    squeezeRiskDirectionAtExit?: SqueezeDirection | null;
  };
  squeezeRisk?: SqueezeRiskResult | null;
  scorerVersion?: ScorerVersion;
  selectedSymbol?: string;
}): SqueezeAtExitSnapshot | Record<string, never> {
  if (input.entry.scoring.scorerVersion !== 'v4') {
    return {};
  }
  if (
    input.options.squeezeRiskLevelAtExit !== undefined ||
    input.options.squeezeRiskScoreAtExit !== undefined ||
    input.options.squeezeRiskDirectionAtExit !== undefined
  ) {
    return {
      squeezeRiskScoreAtExit: input.options.squeezeRiskScoreAtExit ?? null,
      squeezeRiskLevelAtExit: input.options.squeezeRiskLevelAtExit ?? null,
      squeezeRiskDirectionAtExit: input.options.squeezeRiskDirectionAtExit ?? null,
    };
  }
  const canUseStore =
    input.scorerVersion === 'v4' && input.entry.symbol === input.selectedSymbol;
  return squeezeAtExitFromResult(canUseStore ? input.squeezeRisk : undefined, 'v4');
}

/** Patch funding lúc đóng lệnh — dùng chung store + test. */
export function resolveFundingExitPatchForClose(input: {
  entry: Pick<AiTradeJournalEntry, 'scoring' | 'symbol'>;
  options: {
    fundingAtExit?: number | null;
    fundingStateAtExit?: FundingState | null;
  };
  l6Detail?: L6DetailV4 | null;
  scorerVersion?: ScorerVersion;
  selectedSymbol?: string;
}): FundingAtExitSnapshot | Record<string, never> {
  if (input.entry.scoring.scorerVersion !== 'v4') {
    return {};
  }
  if (
    input.options.fundingAtExit !== undefined ||
    input.options.fundingStateAtExit !== undefined
  ) {
    return {
      fundingAtExit: input.options.fundingAtExit ?? null,
      fundingStateAtExit: input.options.fundingStateAtExit ?? null,
    };
  }
  const canUseStoreDetail =
    input.scorerVersion === 'v4' && input.entry.symbol === input.selectedSymbol;
  return fundingAtExitFromL6Detail(
    canUseStoreDetail ? input.l6Detail : undefined,
    'v4',
  );
}

/** Gộp outcome đóng + funding exit — mô phỏng closeTradeEntry (test). */
export function applyCloseWithFundingPatch(
  entry: AiTradeJournalEntry,
  outcome: AiTradeJournalEntry['outcome'],
  fundingPatch: FundingAtExitSnapshot | Record<string, never>,
): AiTradeJournalEntry {
  return { ...entry, outcome, ...fundingPatch };
}

/** SignalRow có thể mang adxData khi scan gán (optional). */
export type SignalRowWithAdxData = SignalRow & { adxData?: ADXAnalysis };

/** ADX Gate snapshot cho journal — cần cả adxGate và adxData trên row. */
export function buildAdxJournalSnapshot(
  row: SignalRowWithAdxData,
): AdxJournalSnapshot | undefined {
  const adxGate = row.adxGate;
  const adxData = row.adxData;
  if (adxGate == null || adxData == null) {
    return undefined;
  }

  return {
    adx1H: adxData.adx1H,
    adx4H: adxData.adx4H,
    adxAvg: adxData.adxAvg,
    regime: adxData.regime,
    regimeStrength:
      adxData.regime === 'TRENDING' ? adxData.regimeStrength : undefined,
    bothChoppy: adxData.bothChoppy,
    gateResult: adxGate.severity,
    tpMultiplier: adxGate.tpMultiplier,
    slMultiplier: adxGate.slMultiplier,
  };
}

/** Regime string cho legacy StoredTradeJournalEntry. */
export function resolveAdxRegimeForLegacyJournal(
  row: SignalRowWithAdxData,
): string | undefined {
  return buildAdxJournalSnapshot(row)?.regime ?? row.adxGate?.regime;
}

/** Structure SL snapshot cho journal — map từ SignalRow.structureSL */
export function buildStructureSLSnapshot(
  structureSL: StructureSLResult | undefined,
): StructureSLSnapshot | undefined {
  if (structureSL == null) return undefined;
  return {
    swingPrice: structureSL.swingPrice,
    swingTime: structureSL.swingTime,
    slPrice: structureSL.slPrice,
    slSource: structureSL.slSource,
    bufferPct: structureSL.bufferPct,
    distanceFromEntry: structureSL.distanceFromEntry,
    candlesBack: structureSL.candlesBack,
  };
}

/** slSource cho legacy StoredTradeJournalEntry */
export function resolveStructureSlSourceForLegacyJournal(
  row: SignalRow,
): string | undefined {
  return row.structureSL?.slSource;
}

/** VWAP snapshot cho journal — map từ SignalRow */
export function buildVWAPSnapshot(row: SignalRow): VWAPSnapshot | undefined {
  if (row.vwapData == null) return undefined;
  return {
    vwap: row.vwapData.vwap,
    upperBand1: row.vwapData.upperBand1,
    upperBand2: row.vwapData.upperBand2,
    lowerBand1: row.vwapData.lowerBand1,
    lowerBand2: row.vwapData.lowerBand2,
    priceVsVwap: row.vwapData.priceVsVwap,
    zone: row.vwapData.zone,
    isNearVwap: row.vwapData.isNearVwap,
    entryQuality: row.vwapSignal?.quality ?? 'NEUTRAL',
    bonusApplied: row.vwapBonus?.applied ?? false,
    bonusRaw: row.vwapBonus?.bonusRaw ?? 0,
  };
}

/** Zone VWAP cho legacy StoredTradeJournalEntry */
export function resolveVwapZoneForLegacyJournal(row: SignalRow): string | undefined {
  return row.vwapData?.zone;
}

/** Entry quality VWAP cho legacy StoredTradeJournalEntry */
export function resolveVwapEntryQualityForLegacyJournal(
  row: SignalRow,
): string | undefined {
  return row.vwapSignal?.quality;
}

export function newAiJournalEntry(input: {
  symbol: string;
  accountSizeAtEntry: number;
  market: MarketSnapshot;
  scoring: ScoringSnapshot;
  plan: TradePlanSnapshot;
  tags?: string[];
  id?: string;
  timestamp?: number;
  abTestRecordId?: string;
  fundingAtEntry?: number | null;
  fundingVelocityAtEntry?: number | null;
  fundingStateAtEntry?: FundingState | null;
  squeezeRiskScoreAtEntry?: number | null;
  squeezeRiskLevelAtEntry?: SqueezeLevel | null;
  squeezeRiskDirectionAtEntry?: SqueezeDirection | null;
  strategySource?: StrategySource;
  adxSnapshot?: AdxJournalSnapshot;
  structureSLSnapshot?: StructureSLSnapshot;
  vwapSnapshot?: VWAPSnapshot;
}): AiTradeJournalEntry {
  return {
    id: input.id ?? `aj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: input.timestamp ?? Date.now(),
    symbol: input.symbol,
    accountSizeAtEntry: input.accountSizeAtEntry,
    market: input.market,
    scoring: input.scoring,
    plan: input.plan,
    outcome: { status: 'OPEN' },
    tags: input.tags ?? [],
    version: AI_JOURNAL_APP_VERSION,
    abTestRecordId: input.abTestRecordId,
    strategySource: input.strategySource,
    fundingAtEntry: input.fundingAtEntry ?? null,
    fundingVelocityAtEntry: input.fundingVelocityAtEntry ?? null,
    fundingStateAtEntry: input.fundingStateAtEntry ?? null,
    fundingAtExit: null,
    fundingStateAtExit: null,
    squeezeRiskScoreAtEntry: input.squeezeRiskScoreAtEntry ?? null,
    squeezeRiskLevelAtEntry: input.squeezeRiskLevelAtEntry ?? null,
    squeezeRiskDirectionAtEntry: input.squeezeRiskDirectionAtEntry ?? null,
    squeezeRiskScoreAtExit: null,
    squeezeRiskLevelAtExit: null,
    squeezeRiskDirectionAtExit: null,
    adxSnapshot: input.adxSnapshot,
    structureSLSnapshot: input.structureSLSnapshot,
    vwapSnapshot: input.vwapSnapshot,
  };
}

export function isClosedOutcome(status: TradeOutcomeStatus): boolean {
  return (
    status === 'WIN' ||
    status === 'LOSS' ||
    status === 'BREAKEVEN' ||
    status === 'CANCELLED'
  );
}

/** Chỉ WIN / LOSS / BREAKEVEN — dùng cho win rate & PnL stats */
export function isStatsEligibleOutcome(status: TradeOutcomeStatus): boolean {
  return status === 'WIN' || status === 'LOSS' || status === 'BREAKEVEN';
}

export function newAiJournalPendingEntry(input: {
  symbol: string;
  accountSizeAtEntry: number;
  market: MarketSnapshot;
  scoring: ScoringSnapshot;
  plan: TradePlanSnapshot;
  limitOrderPrice: number;
  tags?: string[];
  id?: string;
  timestamp?: number;
  abTestRecordId?: string;
  strategySource?: StrategySource;
  adxSnapshot?: AdxJournalSnapshot;
  structureSLSnapshot?: StructureSLSnapshot;
  vwapSnapshot?: VWAPSnapshot;
}): AiTradeJournalEntry {
  const placedAt = input.timestamp ?? Date.now();
  const base = newAiJournalEntry({
    ...input,
    timestamp: placedAt,
    market: {
      ...input.market,
      entryPrice: input.limitOrderPrice,
      slippage: computeSlippagePct(input.limitOrderPrice, input.plan.entryZoneOptimal),
    },
  });
  return {
    ...base,
    outcome: {
      status: 'PENDING',
      limitOrderPrice: input.limitOrderPrice,
      limitOrderPlacedAt: placedAt,
    },
  };
}

export function formatPendingWaitDuration(placedAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - placedAt) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function isStalePendingOrder(
  entry: AiTradeJournalEntry,
  now = Date.now(),
): boolean {
  if (entry.outcome.status !== 'PENDING') return false;
  const placedAt = entry.outcome.limitOrderPlacedAt ?? entry.timestamp;
  return now - placedAt >= STALE_PENDING_ORDER_MS;
}

export function getStalePendingOrders(
  entries: AiTradeJournalEntry[],
  now = Date.now(),
): AiTradeJournalEntry[] {
  return entries.filter((e) => !e.archived && isStalePendingOrder(e, now));
}

export function outcomeFromClose(input: {
  exitPrice: number;
  pnlUSDT?: number;
  pnlPct?: number;
  entryTimestamp: number;
  exitTimestamp?: number;
  exitReason?: TradeExitReason;
  notes?: string;
  breakeven?: boolean;
  offlineClose?: boolean;
  wasGracePeriodTriggered?: boolean;
}): AiTradeJournalEntry['outcome'] {
  const pnl = input.pnlUSDT ?? 0;
  let status: TradeOutcomeStatus = 'WIN';
  if (input.breakeven) status = 'BREAKEVEN';
  else if (pnl < -0.01) status = 'LOSS';
  else if (Math.abs(pnl) <= 0.01) status = 'BREAKEVEN';
  else status = 'WIN';

  const exitTs = input.exitTimestamp ?? Date.now();
  const holdingTimeMinutes = Math.max(
    0,
    Math.round((exitTs - input.entryTimestamp) / 60_000),
  );

  return {
    status,
    exitPrice: input.exitPrice,
    exitTimestamp: exitTs,
    pnlUSDT: input.pnlUSDT,
    pnlPct: input.pnlPct,
    holdingTimeMinutes,
    holdDurationMinutes: holdingTimeMinutes,
    exitReason: input.exitReason ?? 'MANUAL_CLOSE',
    closeReason: formatJournalCloseReason(input.exitReason ?? 'MANUAL_CLOSE', input.notes),
    notes: input.notes,
    offlineClose: input.offlineClose,
    wasGracePeriodTriggered: input.wasGracePeriodTriggered,
  };
}

export function mapCloseReasonToExit(
  reason?: string,
): TradeExitReason {
  switch (reason) {
    case 'TP1':
      return 'TP1_HIT';
    case 'TP2':
      return 'TP2_HIT';
    case 'TP3':
      return 'TP3_HIT';
    case 'SL':
      return 'SL_HIT';
    case 'MANUAL_STOP':
      return 'MANUAL_CLOSE';
    default:
      return 'MANUAL_CLOSE';
  }
}

export function filterJournalBySymbol(entries: AiTradeJournalEntry[], symbol: string): AiTradeJournalEntry[] {
  return entries.filter((e) => e.symbol === symbol);
}

export function filterJournalByDirection(
  entries: AiTradeJournalEntry[],
  direction: JournalDirection,
): AiTradeJournalEntry[] {
  return entries.filter((e) => e.scoring.direction === direction);
}

export function filterJournalByStatus(
  entries: AiTradeJournalEntry[],
  status: TradeOutcomeStatus,
): AiTradeJournalEntry[] {
  return entries.filter((e) => e.outcome.status === status);
}

export function filterJournalByDateRange(
  entries: AiTradeJournalEntry[],
  from: number,
  to: number,
): AiTradeJournalEntry[] {
  return entries.filter((e) => e.timestamp >= from && e.timestamp <= to);
}

export function calculateLayerAccuracy(entries: AiTradeJournalEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of LAYER_KEYS) {
    let hits = 0;
    let total = 0;
    for (const entry of entries) {
      if (!isStatsEligibleOutcome(entry.outcome.status)) continue;
      const layerScore = entry.scoring.layerScores[key];
      if (layerScore < LAYER_HIGH_THRESHOLD) continue;
      total += 1;
      if (entry.outcome.status === 'WIN') hits += 1;
    }
    result[key] = total > 0 ? Math.round((hits / total) * 1000) / 10 : 0;
  }
  return result;
}

export function getWinRateByScoreRange(entries: AiTradeJournalEntry[]): ScoreRangeWinRate[] {
  const closed = entries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  return SCORE_RANGES.map(({ label, min, max }) => {
    const bucket = closed.filter((e) => {
      const s = e.scoring.totalScore;
      return s >= min && (max === Infinity ? true : s < max);
    });
    const wins = bucket.filter((e) => e.outcome.status === 'WIN').length;
    const avgPnl =
      bucket.length > 0
        ? bucket.reduce((sum, e) => sum + (e.outcome.pnlUSDT ?? 0), 0) / bucket.length
        : 0;
    return {
      range: label,
      trades: bucket.length,
      winRate: bucket.length > 0 ? Math.round((wins / bucket.length) * 1000) / 10 : 0,
      avgPnl: Math.round(avgPnl * 100) / 100,
    };
  });
}

export function getWinRateByHour(
  entries: AiTradeJournalEntry[],
): Record<number, { trades: number; winRate: number }> {
  const result: Record<number, { trades: number; winRate: number }> = {};
  const closed = entries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  for (let h = 0; h < 24; h += 1) {
    const bucket = closed.filter((e) => Math.floor(e.market.hourVN) === h);
    const wins = bucket.filter((e) => e.outcome.status === 'WIN').length;
    result[h] = {
      trades: bucket.length,
      winRate: bucket.length > 0 ? Math.round((wins / bucket.length) * 1000) / 10 : 0,
    };
  }
  return result;
}

export function getWinRateByCoin(
  entries: AiTradeJournalEntry[],
): Record<string, { trades: number; winRate: number; avgPnl: number }> {
  const closed = entries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  const byCoin: Record<string, AiTradeJournalEntry[]> = {};
  for (const entry of closed) {
    byCoin[entry.symbol] = byCoin[entry.symbol] ?? [];
    byCoin[entry.symbol].push(entry);
  }
  const result: Record<string, { trades: number; winRate: number; avgPnl: number }> = {};
  for (const [symbol, list] of Object.entries(byCoin)) {
    const wins = list.filter((e) => e.outcome.status === 'WIN').length;
    const avgPnl = list.reduce((s, e) => s + (e.outcome.pnlUSDT ?? 0), 0) / list.length;
    result[symbol] = {
      trades: list.length,
      winRate: Math.round((wins / list.length) * 1000) / 10,
      avgPnl: Math.round(avgPnl * 100) / 100,
    };
  }
  return result;
}

export function getWinRateByEntryType(
  entries: AiTradeJournalEntry[],
): Record<string, { trades: number; winRate: number }> {
  const closed = entries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  const byType: Record<string, AiTradeJournalEntry[]> = {};
  for (const entry of closed) {
    const t = entry.plan.entryZoneType || 'UNKNOWN';
    byType[t] = byType[t] ?? [];
    byType[t].push(entry);
  }
  const result: Record<string, { trades: number; winRate: number }> = {};
  for (const [type, list] of Object.entries(byType)) {
    const wins = list.filter((e) => e.outcome.status === 'WIN').length;
    result[type] = {
      trades: list.length,
      winRate: Math.round((wins / list.length) * 1000) / 10,
    };
  }
  return result;
}

export function analyzeLossPatterns(entries: AiTradeJournalEntry[]): LossPattern[] {
  const losses = entries.filter((e) => e.outcome.status === 'LOSS');
  if (losses.length === 0) return [];

  const patterns: LossPattern[] = [];

  const badSession = losses.filter((e) => e.market.sessionType === 'BAD');
  if (badSession.length >= 2) {
    patterns.push({
      pattern: 'BAD_SESSION',
      frequency: Math.round((badSession.length / losses.length) * 100),
      description: 'Vào lệnh ngoài phiên vàng (session BAD)',
    });
  }

  const badL9 = losses.filter((e) => e.scoring.layerScores.l9 < LAYER_HIGH_THRESHOLD);
  if (badL9.length >= 2) {
    patterns.push({
      pattern: 'L9_LOW',
      frequency: Math.round((badL9.length / losses.length) * 100),
      description: 'Vào lệnh khi L9 (phiên) cho điểm thấp',
    });
  }

  const longHighFunding = losses.filter(
    (e) => e.scoring.direction === 'LONG' && e.market.fundingRate > 0.008,
  );
  if (longHighFunding.length >= 2) {
    patterns.push({
      pattern: 'LONG_HIGH_FUNDING',
      frequency: Math.round((longHighFunding.length / losses.length) * 100),
      description: 'Long khi funding > 0.008%',
    });
  }

  const longCvdDown = losses.filter(
    (e) => e.scoring.direction === 'LONG' && e.market.cvdTrend === 'DOWN',
  );
  if (longCvdDown.length >= 2) {
    patterns.push({
      pattern: 'LONG_CVD_DOWN',
      frequency: Math.round((longCvdDown.length / losses.length) * 100),
      description: 'Long khi CVD đang giảm',
    });
  }

  const farEntry = losses.filter((e) => {
    const { entryPrice } = e.market;
    const { entryZoneRangeLow, entryZoneRangeHigh, entryZoneOptimal } = e.plan;
    if (entryZoneRangeLow === entryZoneRangeHigh) return false;
    const outOfRange = entryPrice < entryZoneRangeLow || entryPrice > entryZoneRangeHigh;
    const farFromOptimal =
      Math.abs(entryPrice - entryZoneOptimal) / entryZoneOptimal > 0.015;
    return outOfRange || farFromOptimal;
  });
  if (farEntry.length >= 2) {
    patterns.push({
      pattern: 'ENTRY_OFF_ZONE',
      frequency: Math.round((farEntry.length / losses.length) * 100),
      description: 'Entry ngoài vùng đề xuất hoặc cách optimal >1.5%',
    });
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

export function calculateEntryQuality(entry: AiTradeJournalEntry): EntryQualityResult {
  const { entryPrice } = entry.market;
  const { entryZoneOptimal, entryZoneRangeLow, entryZoneRangeHigh } = entry.plan;
  const inRange = entryPrice >= entryZoneRangeLow && entryPrice <= entryZoneRangeHigh;
  const distPct =
    entryZoneOptimal > 0
      ? Math.abs(entryPrice - entryZoneOptimal) / entryZoneOptimal
      : 0;

  let score = 70;
  if (inRange) score += 20;
  else score -= 25;
  score -= Math.min(30, distPct * 1000);

  if (entry.outcome.status === 'WIN' && inRange) score = Math.min(100, score + 10);
  if (entry.outcome.status === 'LOSS' && !inRange) score = Math.max(0, score - 15);

  score = Math.round(Math.max(0, Math.min(100, score)));

  let assessment = 'Tốt';
  if (distPct > 0.015) assessment = entryPrice < entryZoneOptimal ? 'Vào quá sớm' : 'Vào trễ';
  else if (!inRange) assessment = 'Ngoài vùng entry';
  else if (score >= 85) assessment = 'Rất tốt';

  return { score, assessment };
}

export function computeTodayQuickStats(
  entries: AiTradeJournalEntry[],
  now = new Date(),
): TodayQuickStats {
  const ymd = getVietnamDateParts(now).ymd;
  const today = entries.filter(
    (e) => getVietnamDateParts(new Date(e.timestamp)).ymd === ymd,
  );
  const closed = today.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  const wins = closed.filter((e) => e.outcome.status === 'WIN').length;
  const losses = closed.filter((e) => e.outcome.status === 'LOSS').length;
  const breakevens = closed.filter((e) => e.outcome.status === 'BREAKEVEN').length;
  const totalPnl = closed.reduce((s, e) => s + (e.outcome.pnlUSDT ?? 0), 0);

  return {
    date: ymd,
    trades: closed.length,
    wins,
    losses,
    breakevens,
    winRate: closed.length > 0 ? Math.round((wins / closed.length) * 1000) / 10 : 0,
    totalPnlUSDT: Math.round(totalPnl * 100) / 100,
    openCount: today.filter((e) => e.outcome.status === 'OPEN').length,
  };
}

function sessionWinRate(list: AiTradeJournalEntry[]): number {
  const closed = list.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  if (closed.length === 0) return 0;
  const wins = closed.filter((e) => e.outcome.status === 'WIN').length;
  return Math.round((wins / closed.length) * 1000) / 10;
}

export function calculateDailyStats(
  entries: AiTradeJournalEntry[],
  date: string,
): DailySessionStats {
  const dayEntries = entries.filter(
    (e) => getVietnamDateParts(new Date(e.timestamp)).ymd === date,
  );
  const closed = dayEntries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  const wins = closed.filter((e) => e.outcome.status === 'WIN');
  const losses = closed.filter((e) => e.outcome.status === 'LOSS');
  const breakevens = closed.filter((e) => e.outcome.status === 'BREAKEVEN');

  let bestTrade = '';
  let worstTrade = '';
  let bestPnl = -Infinity;
  let worstPnl = Infinity;
  for (const e of closed) {
    const pnl = e.outcome.pnlUSDT ?? 0;
    if (pnl > bestPnl) {
      bestPnl = pnl;
      bestTrade = e.id;
    }
    if (pnl < worstPnl) {
      worstPnl = pnl;
      worstTrade = e.id;
    }
  }

  const avgScore =
    dayEntries.length > 0
      ? dayEntries.reduce((s, e) => s + e.scoring.totalScore, 0) / dayEntries.length
      : 0;

  const withHolding = closed.filter((e) => e.outcome.holdingTimeMinutes != null);
  const avgHolding =
    withHolding.length > 0
      ? withHolding.reduce((s, e) => s + (e.outcome.holdingTimeMinutes ?? 0), 0) / withHolding.length
      : 0;

  const good = dayEntries.filter((e) => e.market.sessionType === 'GOOD');
  const medium = dayEntries.filter((e) => e.market.sessionType === 'MEDIUM');
  const bad = dayEntries.filter((e) => e.market.sessionType === 'BAD');

  const layerAccRaw = calculateLayerAccuracy(dayEntries);
  const layerAccuracy = emptyLayerScores();
  for (const key of LAYER_KEYS) {
    layerAccuracy[key] = layerAccRaw[key] ?? 0;
  }

  const totalPnl = closed.reduce((s, e) => s + (e.outcome.pnlUSDT ?? 0), 0);

  return {
    date,
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 1000) / 10 : 0,
    totalPnlUSDT: Math.round(totalPnl * 100) / 100,
    bestTrade,
    worstTrade,
    avgScore: Math.round(avgScore * 100) / 100,
    avgHoldingMinutes: Math.round(avgHolding * 10) / 10,
    sessionBreakdown: {
      good: { trades: good.length, winRate: sessionWinRate(good) },
      medium: { trades: medium.length, winRate: sessionWinRate(medium) },
      bad: { trades: bad.length, winRate: sessionWinRate(bad) },
    },
    layerAccuracy,
  };
}

/** PnL trên margin — cộng phần đã chốt một phần + phần còn lại tại exit. */
export function computeTradePnl(
  entry: AiTradeJournalEntry,
  exitPrice: number,
  leverage: number = CAPITAL_RATIOS.leverage,
): { pnlUSDT: number; pnlPct: number } {
  const { entryPrice } = entry.market;
  const size = entry.plan.sizeActual;
  if (entryPrice <= 0 || !Number.isFinite(exitPrice)) {
    return { pnlUSDT: 0, pnlPct: 0 };
  }
  const lev = leverage > 0 ? leverage : CAPITAL_RATIOS.leverage;
  const partialRealized = sumRealizedPartialPnl(entry.partialCloses ?? []);
  const sizeOriginal = resolveOriginalSizeUsdt(entry);

  let remainingPnlUSDT = 0;
  if (size > 0) {
    const snap = computePositionPnl(
      {
        direction: entry.scoring.direction,
        entryPrice,
        leverage: lev,
        size,
      },
      exitPrice,
    );
    remainingPnlUSDT = snap.pnlUsdt ?? 0;
  }

  const pnlUSDT = partialRealized + remainingPnlUSDT;
  const pnlPct =
    sizeOriginal > 0 ? (pnlUSDT / sizeOriginal) * 100 : 0;
  return {
    pnlUSDT: Math.round(pnlUSDT * 100) / 100,
    pnlPct: Math.round(pnlPct * 100) / 100,
  };
}

export function formatTradeLabel(entry: AiTradeJournalEntry): string {
  const sym = entry.symbol.replace('USDT', '');
  const pnl = entry.outcome.pnlUSDT ?? 0;
  const sign = pnl >= 0 ? '+' : '';
  const d = getVietnamDateParts(new Date(entry.timestamp));
  const date = `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}`;
  return `${sign}${pnl.toFixed(2)} USDT (${sym} ${entry.scoring.direction} ${date})`;
}

export function getVisibleJournalEntries(entries: AiTradeJournalEntry[]): AiTradeJournalEntry[] {
  return entries.filter((e) => !e.archived);
}

export function archiveJournalIfNeeded(
  entries: AiTradeJournalEntry[],
  now = Date.now(),
): AiTradeJournalEntry[] {
  const visible = entries.filter((e) => !e.archived);
  if (visible.length <= JOURNAL_ARCHIVE_LIMIT) return entries;

  const cutoff = now - JOURNAL_ARCHIVE_AGE_MS;
  const candidates = visible
    .filter((e) => isClosedOutcome(e.outcome.status) && e.timestamp < cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);
  const need = visible.length - JOURNAL_ARCHIVE_LIMIT;
  const archiveIds = new Set(candidates.slice(0, need).map((e) => e.id));

  return entries.map((e) => (archiveIds.has(e.id) ? { ...e, archived: true } : e));
}

export function getStaleOpenTrades(
  entries: AiTradeJournalEntry[],
  now = Date.now(),
): AiTradeJournalEntry[] {
  return entries.filter(
    (e) =>
      e.outcome.status === 'OPEN' &&
      !e.archived &&
      now - e.timestamp >= STALE_OPEN_TRADE_MS,
  );
}

export function groupJournalByDate(
  entries: AiTradeJournalEntry[],
): Array<{ date: string; label: string; items: AiTradeJournalEntry[] }> {
  const visible = getVisibleJournalEntries(entries).sort((a, b) => b.timestamp - a.timestamp);
  const groups = new Map<string, AiTradeJournalEntry[]>();
  for (const e of visible) {
    const ymd = getVietnamDateParts(new Date(e.timestamp)).ymd;
    const list = groups.get(ymd) ?? [];
    list.push(e);
    groups.set(ymd, list);
  }
  return [...groups.entries()].map(([date, items]) => {
    const p = getVietnamDateParts(new Date(items[0]!.timestamp));
    return {
      date,
      label: `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`,
      items,
    };
  });
}

export function getHourBucketWinRates(
  entries: AiTradeJournalEntry[],
): Array<{ label: string; trades: number; winRate: number }> {
  const closed = entries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  const buckets: Array<{ start: number; end: number; label: string }> = [
    { start: 0, end: 8, label: '00-08h' },
    { start: 8, end: 10, label: '08-10h' },
    { start: 10, end: 12, label: '10-12h' },
    { start: 12, end: 14, label: '12-14h' },
    { start: 14, end: 16, label: '14-16h' },
    { start: 16, end: 18, label: '16-18h' },
    { start: 18, end: 20, label: '18-20h' },
    { start: 20, end: 22, label: '20-22h' },
    { start: 22, end: 24, label: '22-24h' },
  ];
  return buckets.map(({ start, end, label }) => {
    const bucket = closed.filter((e) => {
      const h = Math.floor(e.market.hourVN);
      return h >= start && h < end;
    });
    const wins = bucket.filter((e) => e.outcome.status === 'WIN').length;
    return {
      label,
      trades: bucket.length,
      winRate: bucket.length > 0 ? Math.round((wins / bucket.length) * 1000) / 10 : 0,
    };
  });
}

export function computeWeeklyStats(
  entries: AiTradeJournalEntry[],
  accountSize = 0,
  now = new Date(),
): WeeklyStats {
  const end = getVietnamDateParts(now);
  const startMs = now.getTime() - 7 * 86_400_000;
  const weekEntries = filterJournalByDateRange(entries, startMs, now.getTime());
  const closed = weekEntries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  const wins = closed.filter((e) => e.outcome.status === 'WIN').length;
  const losses = closed.filter((e) => e.outcome.status === 'LOSS').length;
  const breakevens = closed.filter((e) => e.outcome.status === 'BREAKEVEN').length;
  const totalPnl = closed.reduce((s, e) => s + (e.outcome.pnlUSDT ?? 0), 0);
  const avgScore =
    weekEntries.length > 0
      ? weekEntries.reduce((s, e) => s + e.scoring.totalScore, 0) / weekEntries.length
      : 0;

  const byDay: Record<string, number> = {};
  for (const e of closed) {
    const d = getVietnamDateParts(new Date(e.timestamp)).ymd;
    byDay[d] = (byDay[d] ?? 0) + (e.outcome.pnlUSDT ?? 0);
  }
  let bestDay: string | null = null;
  let worstDay: string | null = null;
  let best = -Infinity;
  let worst = Infinity;
  for (const [day, pnl] of Object.entries(byDay)) {
    if (pnl > best) {
      best = pnl;
      bestDay = day;
    }
    if (pnl < worst) {
      worst = pnl;
      worstDay = day;
    }
  }

  let bestTradeLabel: string | null = null;
  let worstTradeLabel: string | null = null;
  let bestPnl = -Infinity;
  let worstPnl = Infinity;
  for (const e of closed) {
    const pnl = e.outcome.pnlUSDT ?? 0;
    if (pnl > bestPnl) {
      bestPnl = pnl;
      bestTradeLabel = formatTradeLabel(e);
    }
    if (pnl < worstPnl) {
      worstPnl = pnl;
      worstTradeLabel = formatTradeLabel(e);
    }
  }

  const layerAcc = calculateLayerAccuracy(closed);
  const layerSorted = Object.entries(layerAcc)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const bestLayer = layerSorted[0]?.[0] ?? null;
  const bestLayerAccuracy = layerSorted[0]?.[1] ?? 0;

  const accountEnd = accountSize;
  const accountStart = Math.max(0, accountEnd - totalPnl);
  const accountChangePct =
    accountStart > 0 ? Math.round((totalPnl / accountStart) * 1000) / 10 : 0;

  return {
    from: getVietnamDateParts(new Date(startMs)).ymd,
    to: end.ymd,
    trades: closed.length,
    wins,
    losses,
    breakevens,
    winRate: closed.length > 0 ? Math.round((wins / closed.length) * 1000) / 10 : 0,
    totalPnlUSDT: Math.round(totalPnl * 100) / 100,
    avgScore: Math.round(avgScore * 100) / 100,
    bestDay,
    worstDay,
    accountStartUSDT: Math.round(accountStart * 100) / 100,
    accountEndUSDT: Math.round(accountEnd * 100) / 100,
    accountChangePct,
    bestTradeLabel,
    worstTradeLabel,
    bestLayer,
    bestLayerAccuracy,
  };
}

export function generateWeeklyInsights(
  entries: AiTradeJournalEntry[],
  dailyStats: DailySessionStats[],
): string[] {
  const insights: string[] = [];
  const closed = entries.filter((e) => isStatsEligibleOutcome(e.outcome.status));
  if (closed.length < 3) {
    insights.push('Cần thêm lệnh (≥3) để gợi ý có ý nghĩa.');
    return insights;
  }

  const byHour = getWinRateByHour(closed);
  let bestHour = 0;
  let bestHourWr = 0;
  for (const [h, stat] of Object.entries(byHour)) {
    if (stat.trades >= 2 && stat.winRate > bestHourWr) {
      bestHourWr = stat.winRate;
      bestHour = Number(h);
    }
  }
  if (bestHourWr > 0) {
    insights.push(
      `Win rate tốt nhất trong khung ${String(bestHour).padStart(2, '0')}:00–${String(bestHour + 1).padStart(2, '0')}:00 VN (${bestHourWr}%).`,
    );
  }

  const byCoin = getWinRateByCoin(closed);
  const coinRows = Object.entries(byCoin)
    .filter(([, s]) => s.trades >= 2)
    .sort((a, b) => b[1].winRate - a[1].winRate);
  if (coinRows.length >= 2) {
    const [bestSym, best] = coinRows[0];
    const [worstSym, worst] = coinRows[coinRows.length - 1];
    if (best.winRate - worst.winRate >= 10) {
      insights.push(
        `Lệnh ${bestSym.replace('USDT', '')} win rate ${best.winRate}%, ${worstSym.replace('USDT', '')} ${worst.winRate}% — cân nhắc tập trung ${bestSym.replace('USDT', '')}.`,
      );
    }
  }

  const highCvd = closed.filter((e) => e.market.cvdValue > 500_000);
  if (highCvd.length >= 2) {
    const wr =
      (highCvd.filter((e) => e.outcome.status === 'WIN').length / highCvd.length) * 100;
    insights.push(`Khi CVD > 500K, win rate đạt ${Math.round(wr)}%.`);
  }

  const layerAcc = calculateLayerAccuracy(closed);
  const layerSorted = Object.entries(layerAcc)
    .filter(([, acc]) => acc > 0)
    .sort((a, b) => b[1] - a[1]);
  if (layerSorted.length > 0) {
    const [bestLayer, bestAcc] = layerSorted[0];
    insights.push(
      `Lớp ${bestLayer.toUpperCase()} predict chính xác ${bestAcc}% — đáng tin cậy nhất.`,
    );
    const weak = layerSorted.find(([, acc]) => acc < 55);
    if (weak) {
      insights.push(
        `Lớp ${weak[0].toUpperCase()} chỉ chính xác ${weak[1]}% — xem xét giảm trọng số.`,
      );
    }
  }

  const recentDays = dailyStats.slice(-7);
  if (recentDays.length >= 3) {
    const avgWr = recentDays.reduce((s, d) => s + d.winRate, 0) / recentDays.length;
    insights.push(`7 ngày gần nhất: win rate trung bình ${Math.round(avgWr * 10) / 10}%.`);
  }

  const lossPatterns = analyzeLossPatterns(closed);
  if (lossPatterns[0]) {
    insights.push(`Pattern thua phổ biến: ${lossPatterns[0].description} (${lossPatterns[0].frequency}% lệnh thua).`);
  }

  return insights;
}

// ─── Insight logic (Bổ sung 3 — sub-tab Gợi ý) ───────────────────────────────

export type InsightItemType = 'LAYER' | 'TIME' | 'COIN' | 'CVD';

export interface InsightItem {
  type: InsightItemType;
  title: string;
  finding: string;
  suggestion: string;
  dataPoints: number;
  isWarning: boolean;
}

export interface GenerateAllInsightsResult {
  insights: InsightItem[];
  hasEnoughData: boolean;
  missingDataMessage?: string;
}

export const INSIGHT_MIN_DATA = 5;
const INSIGHT_MIN_CLOSED = 3;
const INSIGHT_CACHE_MS = 5 * 60_000;

const CVD_LONG_THRESHOLDS = [0, 100_000, 300_000, 500_000, 1_000_000] as const;

const TIME_GROUPS: Array<{ label: string; hours: number[] }> = [
  { label: '06-10h', hours: [6, 7, 8, 9] },
  { label: '10-14h', hours: [10, 11, 12, 13] },
  { label: '14-18h', hours: [14, 15, 16, 17] },
  { label: '18-22h', hours: [18, 19, 20, 21] },
  { label: '22-02h', hours: [22, 23, 0, 1, 2] },
];

let insightResultCache: {
  signature: string;
  expiresAt: number;
  result: GenerateAllInsightsResult;
} | null = null;

function winLossOnly(entries: AiTradeJournalEntry[]): AiTradeJournalEntry[] {
  return entries.filter(
    (e) => e.outcome.status === 'WIN' || e.outcome.status === 'LOSS',
  );
}

function winRateWinLoss(entries: AiTradeJournalEntry[]): {
  winRate: number;
  wins: number;
  losses: number;
  total: number;
} {
  const wins = entries.filter((e) => e.outcome.status === 'WIN').length;
  const losses = entries.filter((e) => e.outcome.status === 'LOSS').length;
  const total = wins + losses;
  if (total <= 0) return { winRate: 0, wins: 0, losses: 0, total: 0 };
  return { winRate: wins / total, wins, losses, total };
}

function pct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 10;
}

function layerDisplayName(key: keyof LayerScoreMap): string {
  const n = Number(key.replace('l', '')) as ScorerLayerId;
  return SCORER_LAYER_NAMES[n] ?? key.toUpperCase();
}

function insightSignature(entries: AiTradeJournalEntry[]): string {
  const wl = winLossOnly(entries);
  const sum = wl.reduce((s, e) => s + e.timestamp, 0);
  return `${wl.length}:${sum}`;
}

export function getLayerAccuracyInsights(entries: AiTradeJournalEntry[]): InsightItem[] {
  const closed = winLossOnly(entries);
  const insights: InsightItem[] = [];

  for (const key of LAYER_KEYS) {
    const layerNum = Number(key.replace('l', ''));
    const name = layerDisplayName(key);
    const relevant = closed.filter((e) => (e.scoring.layerScores[key] ?? 0) > 0);
    if (relevant.length < INSIGHT_MIN_DATA) continue;

    const hits = relevant.filter((e) => e.outcome.status === 'WIN').length;
    const accuracy = hits / relevant.length;
    if (!Number.isFinite(accuracy)) continue;

    const accPct = pct(accuracy);
    const z = relevant.length;

    if (accuracy < 0.55) {
      insights.push({
        type: 'LAYER',
        title: `Lớp ${layerNum} đang kém chính xác`,
        finding: `Lớp ${layerNum} (${name}) chỉ chính xác ${accPct}% (${z} lệnh)`,
        suggestion: 'Xem xét điều chỉnh tiêu chí lớp này hoặc giảm trọng số',
        dataPoints: z,
        isWarning: true,
      });
    } else if (accuracy > 0.75) {
      insights.push({
        type: 'LAYER',
        title: `Lớp ${layerNum} đang rất chính xác`,
        finding: `Lớp ${layerNum} (${name}) chính xác ${accPct}% (${z} lệnh)`,
        suggestion: 'Ưu tiên tín hiệu của lớp này khi phân tích',
        dataPoints: z,
        isWarning: false,
      });
    }
  }

  return insights;
}

function timeGroupForHour(hourVN: number): string | null {
  const h = Math.floor(hourVN);
  for (const group of TIME_GROUPS) {
    if (group.hours.includes(h)) return group.label;
  }
  return null;
}

export function getTimePatternInsight(entries: AiTradeJournalEntry[]): InsightItem | null {
  const closed = winLossOnly(entries);
  const buckets = new Map<string, AiTradeJournalEntry[]>();

  for (const entry of closed) {
    const group = timeGroupForHour(entry.market.hourVN);
    if (!group) continue;
    const list = buckets.get(group) ?? [];
    list.push(entry);
    buckets.set(group, list);
  }

  const stats: Array<{ label: string; winRate: number; total: number }> = [];
  for (const [label, list] of buckets.entries()) {
    const { winRate, total } = winRateWinLoss(list);
    if (total < INSIGHT_MIN_DATA) continue;
    stats.push({ label, winRate, total });
  }

  if (stats.length < 2) return null;

  const sorted = [...stats].sort((a, b) => b.winRate - a.winRate);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const diffPct = pct((best.winRate - worst.winRate) * 100);
  if (best.winRate - worst.winRate <= 0.15) return null;

  return {
    type: 'TIME',
    title: 'Pattern theo khung giờ VN',
    finding: [
      `Win rate tốt nhất: ${best.label} VN (${pct(best.winRate * 100)}%, ${best.total} lệnh)`,
      `Win rate thấp nhất: ${worst.label} VN (${pct(worst.winRate * 100)}%, ${worst.total} lệnh)`,
    ].join('\n'),
    suggestion: `Ưu tiên giao dịch trong khung ${best.label}, hạn chế ${worst.label}`,
    dataPoints: best.total + worst.total,
    isWarning: worst.winRate < 0.45,
  };
}

export function getCoinPatternInsight(entries: AiTradeJournalEntry[]): InsightItem | null {
  const closed = winLossOnly(entries);
  const byCoin: Record<string, AiTradeJournalEntry[]> = {};

  for (const entry of closed) {
    byCoin[entry.symbol] = byCoin[entry.symbol] ?? [];
    byCoin[entry.symbol].push(entry);
  }

  const stats: Array<{
    symbol: string;
    winRate: number;
    avgPnl: number;
    total: number;
  }> = [];

  for (const [symbol, list] of Object.entries(byCoin)) {
    const { winRate, total } = winRateWinLoss(list);
    if (total < INSIGHT_MIN_DATA) continue;
    const avgPnl =
      list.reduce((s, e) => s + (e.outcome.pnlUSDT ?? 0), 0) / list.length;
    stats.push({
      symbol,
      winRate,
      avgPnl: Math.round(avgPnl * 100) / 100,
      total,
    });
  }

  if (stats.length < 2) return null;

  const sorted = [...stats].sort((a, b) => b.winRate - a.winRate);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const wrDiff = pct((best.winRate - worst.winRate) * 100);
  if (best.winRate - worst.winRate <= 0.2) return null;

  const bestLabel = best.symbol.replace('USDT', '');
  const worstLabel = worst.symbol.replace('USDT', '');

  return {
    type: 'COIN',
    title: 'So sánh hiệu suất theo coin',
    finding: [
      `${bestLabel} phù hợp hơn ${worstLabel} với phong cách của bạn (${pct(best.winRate * 100)}% vs ${pct(worst.winRate * 100)}%)`,
      `${bestLabel}: avg ${best.avgPnl >= 0 ? '+' : ''}${best.avgPnl.toFixed(2)} USDT/lệnh | ${worstLabel}: avg ${worst.avgPnl >= 0 ? '+' : ''}${worst.avgPnl.toFixed(2)} USDT/lệnh`,
    ].join('\n'),
    suggestion: `Tập trung ${bestLabel}, hạn chế ${worstLabel} cho đến khi win rate cải thiện (chênh ${wrDiff}%)`,
    dataPoints: best.total + worst.total,
    isWarning: worst.winRate < 0.4,
  };
}

function formatCvdThreshold(t: number): string {
  if (t >= 1_000_000) return `${t / 1_000_000}M`;
  if (t >= 1_000) return `${Math.round(t / 1000)}K`;
  return String(t);
}

export function getCVDPatternInsight(entries: AiTradeJournalEntry[]): InsightItem | null {
  const closed = winLossOnly(entries);
  const longs = closed.filter(
    (e) => e.scoring.direction === 'LONG' && e.market.cvdValue > 0,
  );
  if (longs.length < INSIGHT_MIN_DATA) return null;

  const overallLong = winRateWinLoss(longs);
  if (overallLong.total <= 0) return null;

  let bestThreshold: number | null = null;
  let bestWinRate = 0;
  let bestCount = 0;

  for (const t of CVD_LONG_THRESHOLDS) {
    const bucket = longs.filter((e) => e.market.cvdValue >= t);
    if (bucket.length < 3) continue;
    const { winRate } = winRateWinLoss(bucket);
    if (winRate > bestWinRate) {
      bestWinRate = winRate;
      bestThreshold = t;
      bestCount = bucket.length;
    }
  }

  if (bestThreshold == null || bestWinRate - overallLong.winRate < 0.15) {
    const shortsDown = closed.filter(
      (e) => e.scoring.direction === 'SHORT' && e.market.cvdTrend === 'DOWN',
    );
    if (shortsDown.length >= 3) {
      const { winRate, total } = winRateWinLoss(shortsDown);
      const allShort = winRateWinLoss(closed.filter((e) => e.scoring.direction === 'SHORT'));
      if (allShort.total >= 3 && winRate - allShort.winRate >= 0.15) {
        return {
          type: 'CVD',
          title: 'Pattern CVD cho Short',
          finding: `Short khi CVD trend DOWN: win rate ${pct(winRate * 100)}% (${total} lệnh) vs short tổng ${pct(allShort.winRate * 100)}%`,
          suggestion: 'Ưu tiên Short khi CVD đang giảm (trend DOWN)',
          dataPoints: total,
          isWarning: false,
        };
      }
    }
    return null;
  }

  const lowCvdLongs = closed.filter(
    (e) => e.scoring.direction === 'LONG' && e.market.cvdValue <= 0,
  );
  const lowWr = lowCvdLongs.length > 0 ? winRateWinLoss(lowCvdLongs) : null;
  const thresholdLabel =
    bestThreshold === 0 ? '0' : formatCvdThreshold(bestThreshold);

  const findingLines = [
    `Khi CVD > ${thresholdLabel} khi vào Long, win rate đạt ${pct(bestWinRate * 100)}% (${bestCount} lệnh)`,
  ];
  if (lowWr && lowWr.total > 0) {
    findingLines.push(
      `Khi CVD <= 0 khi vào Long, win rate chỉ ${pct(lowWr.winRate * 100)}% (${lowWr.total} lệnh)`,
    );
  }

  return {
    type: 'CVD',
    title: 'Pattern CVD cho Long',
    finding: findingLines.join('\n'),
    suggestion: `Chỉ vào Long khi CVD > ${thresholdLabel} — tỷ lệ thành công cao hơn rõ rệt`,
    dataPoints: bestCount,
    isWarning: bestWinRate < 0.5,
  };
}

export function generateAllInsights(
  entries: AiTradeJournalEntry[],
  options?: { bypassCache?: boolean },
): GenerateAllInsightsResult {
  const closedEntries = winLossOnly(entries);

  if (closedEntries.length < INSIGHT_MIN_CLOSED) {
    const result: GenerateAllInsightsResult = {
      insights: [],
      hasEnoughData: false,
      missingDataMessage: `Cần thêm ${INSIGHT_MIN_CLOSED - closedEntries.length} lệnh đã đóng (Win/Loss) để xem gợi ý`,
    };
    return result;
  }

  const sig = insightSignature(entries);
  const now = Date.now();
  if (
    !options?.bypassCache &&
    insightResultCache &&
    insightResultCache.signature === sig &&
    now < insightResultCache.expiresAt
  ) {
    return insightResultCache.result;
  }

  const combined: InsightItem[] = [
    ...getLayerAccuracyInsights(closedEntries),
  ];

  const timeInsight = getTimePatternInsight(closedEntries);
  if (timeInsight) combined.push(timeInsight);

  const coinInsight = getCoinPatternInsight(closedEntries);
  if (coinInsight) combined.push(coinInsight);

  const cvdInsight = getCVDPatternInsight(closedEntries);
  if (cvdInsight) combined.push(cvdInsight);

  const result: GenerateAllInsightsResult = {
    insights: combined,
    hasEnoughData: true,
  };

  insightResultCache = {
    signature: sig,
    expiresAt: now + INSIGHT_CACHE_MS,
    result,
  };

  return result;
}

/** Xóa cache insight (dùng trong test) */
export function clearInsightCache(): void {
  insightResultCache = null;
}

export function upsertDailyStats(
  existing: DailySessionStats[],
  entry: DailySessionStats,
): DailySessionStats[] {
  const idx = existing.findIndex((d) => d.date === entry.date);
  if (idx >= 0) {
    const next = [...existing];
    next[idx] = entry;
    return next;
  }
  return [...existing, entry].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildSnapshotsFromSignalRow(input: {
  row: SignalRow;
  entryPrice: number;
  stopLoss?: number;
  takeProfit1?: number;
  sizeActual: number;
  settings?: AppSettings;
  planSource?: 'v2' | 'v3' | 'v4';
  scorerVersion?: ScorerVersion;
  strategySource?: StrategySource;
}): {
  market: MarketSnapshot;
  scoring: ScoringSnapshot;
  plan: TradePlanSnapshot;
  fundingAtEntry: FundingAtEntrySnapshot;
  squeezeAtEntry: SqueezeAtEntrySnapshot;
  adxSnapshot?: AdxJournalSnapshot;
  structureSLSnapshot?: StructureSLSnapshot;
  vwapSnapshot?: VWAPSnapshot;
} {
  const { row, entryPrice, planSource } = input;
  const resolvedVersion: ScorerVersion | undefined =
    input.scorerVersion ??
    (planSource === 'v3' || planSource === 'v4' ? planSource : undefined);
  const useV4 = (planSource === 'v4' || resolvedVersion === 'v4') && row.v4 != null;
  const useV3 = !useV4 && (planSource === 'v3' || resolvedVersion === 'v3') && row.v3 != null;
  const scorerSnap = useV4 ? row.v4 : useV3 ? row.v3 : undefined;
  const useScorerPlan =
    (useV4 || useV3) && row.tradePlansByScorer?.[useV4 ? 'v4' : 'v3'] != null
      ? true
      : (useV4 || useV3) && row.tradePlanV3 != null;
  const direction =
    useScorerPlan && scorerSnap ? scorerSnap.direction : row.direction;
  const layers =
    useScorerPlan && scorerSnap
      ? direction === 'LONG' && scorerSnap.longLayers?.length
        ? scorerSnap.longLayers
        : direction === 'SHORT' && scorerSnap.shortLayers?.length
          ? scorerSnap.shortLayers
          : scorerSnap.layers
      : row.layers;
  const groupScores =
    useScorerPlan && scorerSnap
      ? direction === 'LONG'
        ? scorerSnap.longGroupScores ?? scorerSnap.groupScores
        : scorerSnap.shortGroupScores ?? scorerSnap.groupScores
      : undefined;
  const l5Layer = layers.find((l) => l.layer === 5);
  const effectivePlan = useScorerPlan
    ? tradePlanV3ToLegacyPlan(
        row.tradePlansByScorer?.[useV4 ? 'v4' : 'v3'] ?? row.tradePlanV3!,
      )
    : row.tradePlan;
  const priceAtAnalysis = row.price ?? entryPrice;
  const fundingAtEntry = fundingAtEntryFromL6Detail(
    row.l6Detail,
    useV4 ? 'v4' : useV3 ? 'v3' : resolvedVersion,
  );
  const squeezeAtEntry = squeezeAtEntryFromResult(
    row.squeezeRisk,
    useV4 ? 'v4' : useV3 ? 'v3' : resolvedVersion,
  );
  const advisorSnap = resolveJournalAdvisorSnapshot({
    row,
    strategySource: input.strategySource,
    scorerVersion: resolvedVersion,
    direction,
  });
  return {
    market: buildMarketSnapshot({
      entryPrice,
      priceAtAnalysis,
      cvdValue: row.cvdValue,
      cvdTrend: row.cvdTrend,
      fundingRate: row.fundingRate,
      topLSRatio: row.topLSRatio,
      volumeRatio: 1,
      btcChangePct: row.change24h,
      settings: input.settings,
    }),
    scoring: buildScoringSnapshot({
      totalScore: useScorerPlan && scorerSnap ? scorerSnap.score : row.score,
      direction,
      layers,
      mandatoryViolations:
        useScorerPlan && scorerSnap ? scorerSnap.mandatoryViolations : row.mandatoryViolations,
      decision: useScorerPlan && scorerSnap ? scorerSnap.decisionLabel : row.decisionLabel,
      scorerVersion: useV4 ? 'v4' : useV3 ? 'v3' : resolvedVersion,
      groupScores,
      l5aScore: l5Layer?.score,
      expectedWinrate: useScorerPlan && scorerSnap ? scorerSnap.winrate : row.winrate,
      recommendationLabel: advisorSnap?.recommendationLabel,
      score: advisorSnap?.score,
      marketState: advisorSnap?.marketState,
    }),
    plan: buildPlanSnapshot({
      tradePlan: effectivePlan,
      entryPrice,
      stopLoss: input.stopLoss,
      takeProfit1: input.takeProfit1,
      sizeActual: input.sizeActual,
      sizeProposed: useScorerPlan
        ? (row.tradePlansByScorer?.[useV4 ? 'v4' : 'v3'] ?? row.tradePlanV3)?.positionSizeAdjusted
        : undefined,
    }),
    fundingAtEntry,
    squeezeAtEntry,
    adxSnapshot: buildAdxJournalSnapshot(input.row),
    structureSLSnapshot: buildStructureSLSnapshot(input.row.structureSL),
    vwapSnapshot: buildVWAPSnapshot(input.row),
  };
}

export function refreshDailyStatsForEntry(
  entries: AiTradeJournalEntry[],
  existing: DailySessionStats[],
): DailySessionStats[] {
  const dates = new Set(
    entries.map((e) => getVietnamDateParts(new Date(e.timestamp)).ymd),
  );
  let stats = [...existing];
  for (const date of dates) {
    stats = upsertDailyStats(stats, calculateDailyStats(entries, date));
  }
  return stats;
}

export interface EquityCurveStats {
  startValue: number;
  currentValue: number;
  maxValue: number;
  minValue: number;
  maxDrawdown: number;
  totalReturn: number;
  targetValue: number;
  progressPct: number;
}

export interface EquityCurveChartData {
  chartPoints: { value: number; label: string; pnl: number }[];
  isPositive: boolean;
  targetLine: number;
  baselineLine: number;
}

function closedTradesForHistory(journal: AiTradeJournalEntry[]): AiTradeJournalEntry[] {
  return journal
    .filter((e) => !e.archived && isStatsEligibleOutcome(e.outcome.status))
    .sort((a, b) => {
      const ta = a.outcome.exitTimestamp ?? a.timestamp;
      const tb = b.outcome.exitTimestamp ?? b.timestamp;
      return ta - tb;
    });
}

/** Tái tạo accountHistory từ journal (đóng lệnh / sửa PnL). */
export function rebuildAccountHistoryFromJournal(
  journal: AiTradeJournalEntry[],
): AccountHistoryPoint[] {
  return closedTradesForHistory(journal).map((entry) => {
    const pnlUSDT = entry.outcome.pnlUSDT ?? 0;
    return {
      timestamp: entry.outcome.exitTimestamp ?? entry.timestamp,
      value: Math.max(0, entry.accountSizeAtEntry + pnlUSDT),
      tradeId: entry.id,
      pnlUSDT,
      symbol: entry.symbol,
    };
  });
}

export function computeEquityCurveStats(
  history: AccountHistoryPoint[],
  targetValue = 100,
): EquityCurveStats | null {
  if (history.length === 0) return null;

  const values = history.map((h) => h.value);
  const startValue = values[0];
  const currentValue = values[values.length - 1];
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);

  let maxDrawdown = 0;
  let peak = values[0];
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const range = targetValue - startValue;
  const progressPct =
    range > 0
      ? Math.min(100, ((currentValue - startValue) / range) * 100)
      : currentValue >= targetValue
        ? 100
        : 0;

  return {
    startValue,
    currentValue,
    maxValue,
    minValue,
    maxDrawdown,
    totalReturn: startValue > 0 ? ((currentValue - startValue) / startValue) * 100 : 0,
    targetValue,
    progressPct,
  };
}

export function buildEquityCurveData(
  history: AccountHistoryPoint[],
): EquityCurveChartData | null {
  if (history.length === 0) return null;

  const chartPoints = history.map((point, i) => ({
    value: point.value,
    label: i === 0 ? 'Start' : `#${i}`,
    pnl: point.pnlUSDT,
  }));

  const startValue = history[0].value;
  const currentValue = history[history.length - 1].value;

  return {
    chartPoints,
    isPositive: currentValue >= startValue,
    targetLine: 100,
    baselineLine: startValue,
  };
}

export function buildStoredEntryZone(plan: TradePlanSnapshot): StoredEntryZone {
  return {
    optimal: plan.entryZoneOptimal,
    rangeLow: plan.entryZoneRangeLow,
    rangeHigh: plan.entryZoneRangeHigh,
    type: plan.entryZoneType,
  };
}

export function buildLockedTradePlanInput(input: {
  pendingEntryId: string;
  symbol: string;
  scoring: ScoringSnapshot;
  plan: TradePlanSnapshot;
  market: MarketSnapshot;
  limitOrderPrice: number;
}): Omit<LockedTradePlan, 'id' | 'lockedAt' | 'expiresAt' | 'status'> {
  return {
    pendingEntryId: input.pendingEntryId,
    lockedScore: input.scoring.totalScore,
    lockedDirection: input.scoring.direction,
    lockedScoringSnapshot: input.scoring,
    lockedCvdValue: input.market.cvdValue,
    lockedCvdTrend: input.market.cvdTrend,
    lockedSessionType: input.market.sessionType,
    entryZone: buildStoredEntryZone(input.plan),
    limitOrderPrice: input.limitOrderPrice,
    sl: input.plan.slActual,
    tp1: input.plan.tp1Actual,
    tp2: input.plan.tp2,
    tp3: input.plan.tp3,
    symbol: input.symbol,
  };
}

export function formatLockedPlanCountdown(expiresAt: number, now = Date.now()): string {
  const ms = Math.max(0, expiresAt - now);
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h${m}m`;
}

export interface CancelPendingOrderOptions {
  exitReason?: TradeExitReason;
  notes?: string;
  positionAdvisorActionAtExit?: PositionAdvisorActionAtExit | null;
}

/** Tìm entry PENDING gắn với locked plan (fallback theo symbol + hướng). */
export function resolvePendingEntryForLockedPlan(
  journal: AiTradeJournalEntry[],
  plan: Pick<LockedTradePlan, 'pendingEntryId' | 'symbol' | 'lockedDirection'>,
): AiTradeJournalEntry | null {
  const byId = journal.find((e) => e.id === plan.pendingEntryId);
  if (byId?.outcome.status === 'PENDING') return byId;
  return (
    journal
      .filter(
        (e) =>
          e.outcome.status === 'PENDING' &&
          e.symbol === plan.symbol &&
          e.scoring.direction === plan.lockedDirection,
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null
  );
}

/** Metadata journal khi unlockTradePlan hủy lệnh chờ. */
export function pendingCancelOutcomeFromUnlockReason(
  reason: CancelReason | 'USER_MANUAL' | 'PLAN_EXPIRED' | 'MULTI_CONFIRMATION_CANCEL',
  plan: Pick<LockedTradePlan, 'expiryHours' | 'lockedScore'>,
  detail?: string,
): CancelPendingOrderOptions {
  switch (reason) {
    case 'PLAN_EXPIRED': {
      const hours = plan.expiryHours ?? calculatePlanExpiry(plan.lockedScore).hours;
      return {
        exitReason: 'PLAN_EXPIRED',
        notes: `[Tự hủy app] ${formatPlanExpiredMessage(hours)}`,
        positionAdvisorActionAtExit: 'PLAN_EXPIRED',
      };
    }
    case 'MULTI_CONFIRMATION_CANCEL':
      return {
        exitReason: 'PLAN_HEALTH_CANCEL',
        notes: `[Tự hủy app] ${detail ?? cancelReasonDetail(reason)}`,
      };
    default:
      return {
        exitReason: 'LIMIT_NOT_FILLED',
        notes: detail ? `[Hủy locked plan] ${detail}` : undefined,
      };
  }
}

export function formatPendingCancelLabel(
  exitReason?: TradeExitReason,
  notes?: string,
): string {
  if (notes?.trim()) return notes.trim();
  switch (exitReason) {
    case 'PLAN_EXPIRED':
      return 'Tự hủy — plan hết hạn';
    case 'PLAN_HEALTH_CANCEL':
      return 'Tự hủy — Plan Health xấu';
    case 'LIMIT_NOT_FILLED':
      return 'Hủy lệnh chờ — limit không khớp';
    default:
      return 'Đã hủy';
  }
}

export function mapCancelReasonToSkipReason(
  reason: CancelReason | 'USER_MANUAL' | 'PLAN_EXPIRED',
): SkipReason {
  switch (reason) {
    case 'CVD_REVERSAL':
      return 'CVD_DIVERGENCE';
    case 'SESSION_EXPIRED':
      return 'BAD_SESSION';
    case 'PLAN_EXPIRED':
      return 'PLAN_EXPIRED';
    case 'MULTI_CONFIRMATION_CANCEL':
      return 'MULTI_CONFIRMATION_CANCEL';
    case 'BTC_DUMP':
    case 'FUNDING_EXTREME':
    case 'PRICE_THROUGH_SL':
      return 'MANDATORY_FAIL';
    case 'USER_MANUAL':
    default:
      return 'USER_SKIP';
  }
}

export function cancelReasonDetail(
  reason: CancelReason | 'USER_MANUAL' | 'PLAN_EXPIRED',
  message?: string,
): string {
  if (message) return message;
  switch (reason) {
    case 'BTC_DUMP':
      return 'BTC biến động mạnh — hủy locked plan';
    case 'FUNDING_EXTREME':
      return 'Funding cực đoan — hủy locked plan';
    case 'CVD_REVERSAL':
      return 'CVD đảo chiều mạnh — hủy locked plan';
    case 'PRICE_THROUGH_SL':
      return 'Giá xuyên SL — hủy locked plan';
    case 'SESSION_EXPIRED':
      return 'Hết phiên tốt — hủy locked plan';
    case 'PLAN_EXPIRED':
      return 'Lệnh chờ đã hết hạn — tự hủy locked plan';
    case 'MULTI_CONFIRMATION_CANCEL':
      return '⚠️ Hủy lệnh: Squeeze + CVD + Funding cùng xác nhận ngược hướng';
    case 'USER_MANUAL':
      return 'User hủy thủ công';
    default:
      return 'Hủy locked plan';
  }
}

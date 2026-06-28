/**
 * Phase 1 — migration & chuẩn hóa dữ liệu khi cập nhật app / đổi UI / đổi tiêu chí chấm.
 *
 * Nguyên tắc:
 * - Khóa lưu trữ `gd1_*` KHÔNG đổi tên — chỉ thêm key mới nếu cần.
 * - Lịch sử lệnh giữ snapshot điểm lúc vào — KHÔNG chấm lại theo tiêu chí mới.
 * - Migration chỉ bổ sung field thiếu / sửa shape; không xóa entry hợp lệ.
 */

import {
  AI_JOURNAL_APP_VERSION,
  AI_JOURNAL_SCHEMA_VERSION,
  type AccountHistoryPoint,
  type AiTradeJournalEntry,
  type DailySessionStats,
  type LayerScoreMap,
  type LockedTradePlan,
  type ManualExitReason,
  type MarketSnapshot,
  type PositionAdvisorActionAtExit,
  type PlanHealthAtExit,
  type ScoringSnapshot,
  type TradeOutcome,
  type TradeOutcomeStatus,
  type TradePlanSnapshot,
  type StrategySource,
} from '../constants/aiJournal';
import { DEFAULT_SETTINGS, type AppSettings, type SkippedSetupEntry, type FundingState } from '../constants/scoring';
import { syncSettingsWithCapitalTier } from './capitalManagement';
import type { PsychologyChecklist, StoredTradeJournalEntry } from '../store/useTradeStore';
import {
  TRADE_SNAPSHOT_VERSION,
  type TradeFullSnapshot,
} from './tradeSnapshot';
import { isValidFundingState } from './journalService';
import type { SqueezeDirection, SqueezeLevel } from '../types/squeezeRisk';

function migrateNullableFundingNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function migrateNullableFundingState(value: unknown): FundingState | null {
  return isValidFundingState(value) ? value : null;
}

const SQUEEZE_LEVELS = new Set<SqueezeLevel>(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']);
const SQUEEZE_DIRECTIONS = new Set<SqueezeDirection>(['LONG_SQUEEZE', 'SHORT_SQUEEZE', 'NONE']);

function migrateNullableSqueezeLevel(value: unknown): SqueezeLevel | null | undefined {
  if (value == null) return value === null ? null : undefined;
  return SQUEEZE_LEVELS.has(value as SqueezeLevel) ? (value as SqueezeLevel) : undefined;
}

function migrateNullableSqueezeDirection(value: unknown): SqueezeDirection | null | undefined {
  if (value == null) return value === null ? null : undefined;
  return SQUEEZE_DIRECTIONS.has(value as SqueezeDirection)
    ? (value as SqueezeDirection)
    : undefined;
}

const ADVISOR_ACTIONS = new Set<PositionAdvisorActionAtExit>([
  'HOLD_STRONG',
  'HOLD_CONDITIONAL',
  'PARTIAL_CLOSE_30',
  'PARTIAL_TP1',
  'CLOSE_NOW',
  'CLOSE_URGENT',
  'MOVE_SL_BE',
  'MOVE_SL_TIGHTER',
  'FUNDING_REVERSAL',
  'SQUEEZE_ALERT',
  'PLAN_EXPIRED',
  'NO_ACTIVE_ADVISOR',
]);

const PLAN_HEALTH_STATUSES = new Set<PlanHealthAtExit>(['STRONG', 'NORMAL', 'WEAK', 'CRITICAL']);

function migrateAdvisorActionAtExit(value: unknown): PositionAdvisorActionAtExit | null | undefined {
  if (value == null) return value === null ? null : undefined;
  return ADVISOR_ACTIONS.has(value as PositionAdvisorActionAtExit)
    ? (value as PositionAdvisorActionAtExit)
    : undefined;
}

function migratePlanHealthAtExit(value: unknown): PlanHealthAtExit | null | undefined {
  if (value == null) return value === null ? null : undefined;
  return PLAN_HEALTH_STATUSES.has(value as PlanHealthAtExit)
    ? (value as PlanHealthAtExit)
    : undefined;
}

const MANUAL_EXIT_REASONS = new Set<ManualExitReason>([
  'FOLLOW_ADVISOR',
  'TAKE_PROFIT_MANUAL',
  'CUT_LOSS_MANUAL',
  'PLAN_CHANGED',
  'OTHER',
]);

function migrateManualExitReason(value: unknown): ManualExitReason | null | undefined {
  if (value == null) return value === null ? null : undefined;
  return MANUAL_EXIT_REASONS.has(value as ManualExitReason)
    ? (value as ManualExitReason)
    : undefined;
}

function migrateNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === true || value === false) return value;
  if (value == null) return value === null ? null : undefined;
  return undefined;
}

const EMPTY_LAYERS: LayerScoreMap = {
  l1: 0,
  l2: 0,
  l3: 0,
  l4: 0,
  l5: 0,
  l6: 0,
  l7: 0,
  l8: 0,
  l9: 0,
  l10: 0,
};

const VALID_OUTCOMES = new Set<TradeOutcomeStatus>([
  'OPEN',
  'WIN',
  'LOSS',
  'BREAKEVEN',
  'CANCELLED',
  'PENDING',
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function migrateLayerScores(raw: unknown): LayerScoreMap {
  if (!isObject(raw)) return { ...EMPTY_LAYERS };
  return {
    l1: num(raw.l1),
    l2: num(raw.l2),
    l3: num(raw.l3),
    l4: num(raw.l4),
    l5: num(raw.l5),
    l6: num(raw.l6),
    l7: num(raw.l7),
    l8: num(raw.l8),
    l9: num(raw.l9),
    l10: num(raw.l10),
  };
}

function migrateMarket(raw: unknown, entryPriceFallback = 0): MarketSnapshot {
  const m = isObject(raw) ? raw : {};
  const session = str(m.sessionType, 'MEDIUM');
  return {
    entryPrice: num(m.entryPrice, entryPriceFallback),
    priceAtAnalysis: num(m.priceAtAnalysis, num(m.entryPrice, entryPriceFallback)),
    slippage: num(m.slippage),
    cvdValue: num(m.cvdValue),
    cvdTrend: m.cvdTrend === 'UP' || m.cvdTrend === 'DOWN' ? m.cvdTrend : 'FLAT',
    volumeRatio: num(m.volumeRatio, 1),
    btcChangePct: num(m.btcChangePct),
    fundingRate: num(m.fundingRate),
    topLSRatio: num(m.topLSRatio, 1),
    oiChangePct: num(m.oiChangePct),
    sessionType: session === 'GOOD' || session === 'BAD' ? session : 'MEDIUM',
    hourVN: num(m.hourVN),
  };
}

function migrateScoring(raw: unknown): ScoringSnapshot {
  const s = isObject(raw) ? raw : {};
  const dir = s.direction === 'SHORT' ? 'SHORT' : 'LONG';
  const scorerVersion =
    s.scorerVersion === 'v3' || s.scorerVersion === 'v4' ? s.scorerVersion : undefined;
  return {
    totalScore: num(s.totalScore),
    direction: dir,
    layerScores: migrateLayerScores(s.layerScores),
    mandatoryViolations: Array.isArray(s.mandatoryViolations)
      ? s.mandatoryViolations.filter((x): x is string => typeof x === 'string')
      : [],
    decision: str(s.decision, 'KHONG_VAO'),
    scorerVersion,
    groupA: s.groupA != null ? num(s.groupA) : undefined,
    groupB: s.groupB != null ? num(s.groupB) : undefined,
    groupC: s.groupC != null ? num(s.groupC) : undefined,
    l5aScore: s.l5aScore != null ? num(s.l5aScore) : undefined,
    expectedWinrate: typeof s.expectedWinrate === 'string' ? s.expectedWinrate : undefined,
    recommendationLabel:
      typeof s.recommendationLabel === 'string' ? s.recommendationLabel : undefined,
    score: s.score != null ? num(s.score) : undefined,
    marketState: typeof s.marketState === 'string' ? s.marketState : undefined,
  };
}

function migratePlan(raw: unknown, entryPrice = 0): TradePlanSnapshot {
  const p = isObject(raw) ? raw : {};
  return {
    entryZoneType: str(p.entryZoneType, 'MARKET_NEAR'),
    entryZoneOptimal: num(p.entryZoneOptimal, entryPrice),
    entryZoneRangeLow: num(p.entryZoneRangeLow, entryPrice),
    entryZoneRangeHigh: num(p.entryZoneRangeHigh, entryPrice),
    slProposed: num(p.slProposed),
    slActual: num(p.slActual),
    tp1Proposed: num(p.tp1Proposed),
    tp1Actual: num(p.tp1Actual),
    tp2: num(p.tp2),
    tp3: num(p.tp3),
    rrProposed: num(p.rrProposed),
    sizeProposed: num(p.sizeProposed, 1),
    sizeActual: num(p.sizeActual, 1),
    isSafeSL: Boolean(p.isSafeSL),
    openReason: typeof p.openReason === 'string' ? p.openReason : undefined,
  };
}

function migrateOutcome(raw: unknown): TradeOutcome {
  const o = isObject(raw) ? raw : {};
  const statusRaw = str(o.status, 'OPEN');
  const status = VALID_OUTCOMES.has(statusRaw as TradeOutcomeStatus)
    ? (statusRaw as TradeOutcomeStatus)
    : 'OPEN';
  return {
    status,
    exitPrice: o.exitPrice != null ? num(o.exitPrice) : undefined,
    exitTimestamp: o.exitTimestamp != null ? num(o.exitTimestamp) : undefined,
    pnlUSDT: o.pnlUSDT != null ? num(o.pnlUSDT) : undefined,
    pnlPct: o.pnlPct != null ? num(o.pnlPct) : undefined,
    holdingTimeMinutes:
      o.holdingTimeMinutes != null ? num(o.holdingTimeMinutes) : undefined,
    holdDurationMinutes:
      o.holdDurationMinutes != null
        ? num(o.holdDurationMinutes)
        : o.holdingTimeMinutes != null
          ? num(o.holdingTimeMinutes)
          : undefined,
    exitReason:
      typeof o.exitReason === 'string'
        ? (o.exitReason as TradeOutcome['exitReason'])
        : undefined,
    closeReason: typeof o.closeReason === 'string' ? o.closeReason : undefined,
    limitOrderPrice:
      o.limitOrderPrice != null ? num(o.limitOrderPrice) : undefined,
    fillMarketPrice:
      o.fillMarketPrice != null ? num(o.fillMarketPrice) : undefined,
    entryAdjusted: o.entryAdjusted === true ? true : undefined,
    limitOrderPlacedAt:
      o.limitOrderPlacedAt != null ? num(o.limitOrderPlacedAt) : undefined,
    notes: typeof o.notes === 'string' ? o.notes : undefined,
    offlineClose: o.offlineClose === true ? true : undefined,
    wasGracePeriodTriggered: o.wasGracePeriodTriggered === true ? true : undefined,
  };
}

function migrateStrategySource(raw: unknown): StrategySource | undefined {
  if (raw === 'V3' || raw === 'V4' || raw === 'CVDX' || raw === 'MANUAL') return raw;
  return undefined;
}

/** Chuẩn hóa 1 entry journal — giữ snapshot lịch sử, không chấm lại. */
export function migrateAiJournalEntry(raw: unknown): AiTradeJournalEntry | null {
  if (!isObject(raw)) return null;
  const symbol = str(raw.symbol);
  if (!symbol) return null;

  const timestamp = num(raw.timestamp, Date.now());
  const market = migrateMarket(raw.market, num(isObject(raw.market) ? raw.market.entryPrice : 0));

  return {
    id: str(raw.id, `aj_migrated_${timestamp}`),
    timestamp,
    symbol,
    accountSizeAtEntry: num(raw.accountSizeAtEntry, DEFAULT_SETTINGS.accountSize),
    market,
    scoring: migrateScoring(raw.scoring),
    plan: migratePlan(raw.plan, market.entryPrice),
    outcome: migrateOutcome(raw.outcome),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    version: str(raw.version, AI_JOURNAL_APP_VERSION),
    abTestRecordId: typeof raw.abTestRecordId === 'string' ? raw.abTestRecordId : undefined,
    strategySource: migrateStrategySource(raw.strategySource),
    archived: raw.archived === true ? true : undefined,
    gracePeriodEverTriggered:
      raw.gracePeriodEverTriggered === true ? true : undefined,
    lastFundingState: migrateNullableFundingState(raw.lastFundingState) ?? undefined,
    lastSqueezeRiskLevel: migrateNullableSqueezeLevel(raw.lastSqueezeRiskLevel),
    lastSqueezeRiskDirection: migrateNullableSqueezeDirection(raw.lastSqueezeRiskDirection),
    squeezeRiskScoreAtEntry: migrateNullableFundingNumber(raw.squeezeRiskScoreAtEntry),
    squeezeRiskLevelAtEntry: migrateNullableSqueezeLevel(raw.squeezeRiskLevelAtEntry) ?? null,
    squeezeRiskDirectionAtEntry:
      migrateNullableSqueezeDirection(raw.squeezeRiskDirectionAtEntry) ?? null,
    squeezeRiskScoreAtExit: migrateNullableFundingNumber(raw.squeezeRiskScoreAtExit),
    squeezeRiskLevelAtExit: migrateNullableSqueezeLevel(raw.squeezeRiskLevelAtExit) ?? null,
    squeezeRiskDirectionAtExit:
      migrateNullableSqueezeDirection(raw.squeezeRiskDirectionAtExit) ?? null,
    fundingAtEntry: migrateNullableFundingNumber(raw.fundingAtEntry),
    fundingVelocityAtEntry: migrateNullableFundingNumber(raw.fundingVelocityAtEntry),
    fundingStateAtEntry: migrateNullableFundingState(raw.fundingStateAtEntry),
    fundingAtExit: migrateNullableFundingNumber(raw.fundingAtExit),
    fundingStateAtExit: migrateNullableFundingState(raw.fundingStateAtExit),
    positionAdvisorActionAtExit: migrateAdvisorActionAtExit(raw.positionAdvisorActionAtExit),
    followedAdvisorRecommendation: migrateNullableBoolean(raw.followedAdvisorRecommendation),
    scoringDecisionAtExit:
      typeof raw.scoringDecisionAtExit === 'string' ? raw.scoringDecisionAtExit : null,
    planHealthAtExit: migratePlanHealthAtExit(raw.planHealthAtExit),
    manualExitReason: migrateManualExitReason(raw.manualExitReason),
    manualExitNote: typeof raw.manualExitNote === 'string' ? raw.manualExitNote : null,
  };
}

export function migrateAiJournal(raw: unknown): AiTradeJournalEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateAiJournalEntry).filter((e): e is AiTradeJournalEntry => e != null);
}

export function migrateLegacyJournalEntry(raw: unknown): StoredTradeJournalEntry | null {
  if (!isObject(raw)) return null;
  const symbol = str(raw.symbol);
  if (!symbol) return null;
  const statusRaw = str(raw.status, 'OPEN');
  const status =
    statusRaw === 'CLOSED' || statusRaw === 'PENDING' || statusRaw === 'OPEN'
      ? statusRaw
      : 'OPEN';
  const direction = raw.direction === 'SHORT' ? 'SHORT' : 'LONG';

  return {
    id: str(raw.id, `tj_migrated_${Date.now()}`),
    symbol: symbol as StoredTradeJournalEntry['symbol'],
    direction,
    entryPrice: num(raw.entryPrice),
    entryTime: num(raw.entryTime, Date.now()),
    leverage: num(raw.leverage, 5),
    size: num(raw.size, 1),
    stopLoss: num(raw.stopLoss),
    takeProfit1: num(raw.takeProfit1),
    takeProfit2: num(raw.takeProfit2),
    takeProfit3: num(raw.takeProfit3),
    status,
    closedAt: raw.closedAt != null ? num(raw.closedAt) : undefined,
    exitPrice: raw.exitPrice != null ? num(raw.exitPrice) : undefined,
    closeReason:
      typeof raw.closeReason === 'string'
        ? (raw.closeReason as StoredTradeJournalEntry['closeReason'])
        : undefined,
    realizedPnlUsdt: raw.realizedPnlUsdt != null ? num(raw.realizedPnlUsdt) : undefined,
    realizedPnlPercent:
      raw.realizedPnlPercent != null ? num(raw.realizedPnlPercent) : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    analysisTimeframe:
      raw.analysisTimeframe === '15m' ||
      raw.analysisTimeframe === '4h' ||
      raw.analysisTimeframe === '1d'
        ? raw.analysisTimeframe
        : '1h',
    strategySource: migrateStrategySource(raw.strategySource),
  };
}

export function migrateLegacyJournal(raw: unknown): StoredTradeJournalEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(migrateLegacyJournalEntry).filter((e): e is StoredTradeJournalEntry => e != null);
}

export function migrateDailyStats(raw: unknown): DailySessionStats[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is DailySessionStats => isObject(d) && typeof d.date === 'string');
}

export function migrateAccountHistory(raw: unknown): AccountHistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!isObject(p)) return null;
      return {
        timestamp: num(p.timestamp),
        value: num(p.value),
        tradeId: str(p.tradeId),
        pnlUSDT: num(p.pnlUSDT),
        symbol: str(p.symbol),
      } satisfies AccountHistoryPoint;
    })
    .filter((p): p is AccountHistoryPoint => p != null && p.tradeId.length > 0);
}

export function migrateSkippedSetups(raw: unknown): SkippedSetupEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is SkippedSetupEntry => isObject(s) && typeof s.id === 'string');
}

export function migratePsychology(raw: unknown): PsychologyChecklist {
  const p = isObject(raw) ? raw : {};
  return {
    noRevengeTrading: p.noRevengeTrading !== false,
    withinDailyLossLimit: p.withinDailyLossLimit !== false,
    restedAndFocused: p.restedAndFocused === true,
    planWritten: p.planWritten === true,
    noOverLeverage: p.noOverLeverage !== false,
  };
}

export function migrateSettings(raw: unknown): AppSettings {
  if (!isObject(raw)) {
    return syncSettingsWithCapitalTier({ ...DEFAULT_SETTINGS });
  }
  const partial = raw as Partial<AppSettings>;
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...partial };
  if (merged.initialCapital <= 0) {
    merged.initialCapital = DEFAULT_SETTINGS.initialCapital;
  }
  if (merged.lastMilestoneCapital <= 0) {
    merged.lastMilestoneCapital = merged.initialCapital;
  }
  return syncSettingsWithCapitalTier(merged);
}

export function migrateLockedPlan(raw: unknown): LockedTradePlan | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.symbol !== 'string') return null;
  return raw as LockedTradePlan;
}

/**
 * Snapshot cũ (version 1, thiếu lockedPlan…) vẫn đọc được sau khi bump app.
 * Không reject theo version — luôn migrate lên shape hiện tại.
 */
export function migrateTradeSnapshot(raw: unknown): TradeFullSnapshot | null {
  if (!isObject(raw)) return null;

  const aiTradeJournal = migrateAiJournal(raw.aiTradeJournal);
  const tradeJournal = migrateLegacyJournal(raw.tradeJournal);

  if (
    aiTradeJournal.length === 0 &&
    tradeJournal.length === 0 &&
    !raw.settings &&
    !raw.psychologyChecklist
  ) {
    return null;
  }

  return {
    version: TRADE_SNAPSHOT_VERSION,
    savedAt: num(raw.savedAt, Date.now()),
    tradeJournal,
    aiTradeJournal,
    dailyStats: migrateDailyStats(raw.dailyStats),
    accountHistory: migrateAccountHistory(raw.accountHistory),
    skippedSetups: migrateSkippedSetups(raw.skippedSetups),
    settings: migrateSettings(raw.settings),
    psychologyChecklist: migratePsychology(raw.psychologyChecklist),
    lockedPlan: migrateLockedPlan(raw.lockedPlan),
  };
}

export function currentPhase1SchemaVersion(): string {
  return AI_JOURNAL_SCHEMA_VERSION;
}

/** JSON.stringify để so sánh trước/sau migration. */
export function phase1PayloadChanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

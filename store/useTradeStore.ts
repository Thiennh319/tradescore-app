import { create } from 'zustand';
import { Platform } from 'react-native';
import {
  DEFAULT_SETTINGS,
  FundingState,
  HARD_BLOCK_RULES,
  type AnalysisTimeframe,
  type AppSettings,
  type AppTradeSymbol,
  type IndicatorPsychology,
  type PsychologyChecklistV2,
  type TradeDirection,
  type TradeJournalEntry,
  type TradePlan,
} from '../constants/scoring';
import { fetchMarketAnalysisBundle } from '../services/marketAnalysisFetch';
import {
  buildAnalysisInputV4FromMarket,
  buildTodayStatsFromJournalV4,
  scoreAnalysisV4,
  suggestDirectionV4,
  type ScoringResultV4,
} from '../services/scorerV4';
import {
  buildAnalysisInputV3FromMarket,
  buildTodayStatsFromJournal,
  scoreAnalysisV3,
  suggestDirectionV3,
  type ScoringResultV3,
} from '../services/scorerV3';
import type { StrategySource } from '../constants/aiJournal';
import type { ScorerVersion } from '../constants/scoring';
import {
  computeFullAnalysisBundle,
  computeMtfChain,
  computeTradeAnalysis,
  type FullAnalysisBundle,
  type TradeAnalysis,
} from '../hooks/useMarketAnalysis';
import {
  buildCapitalManagementState,
  confirmMilestoneUpgrade,
  defaultCapitalManagementState,
  processAccountSizeUpdate,
  notifyCapitalUpdatedAfterSave,
  syncSettingsWithCapitalTier,
  capitalStateFromSettings,
  applyCapitalStateToSettings,
  type CapitalManagementState,
  type MilestoneUpgradePreview,
} from '../services/capitalManagement';
import {
  loadCapitalState,
  saveCapitalState,
} from '../services/capitalStatePersistence';
import { persistGetJson, persistRemoveItem, persistSetJson } from '../services/persistStorage';
import {
  buildTradeSnapshot,
  loadTradeSnapshot,
  mergeTradeSnapshots,
  readWindowNameSnapshot,
  saveTradeSnapshot,
  type TradeFullSnapshot,
} from '../services/tradeSnapshot';
import {
  downloadFullBackup,
  pickAndParseBackupFile,
} from '../services/dataBackupService';
import {
  migrateAccountHistory,
  migrateAiJournal,
  migrateDailyStats,
  migrateLegacyJournal,
  migrateLockedPlan,
  migratePsychology,
  migrateSettings,
  migrateSkippedSetups,
  phase1PayloadChanged,
} from '../services/phase1Migration';
import {
  mergeClosedTradeHistory,
  syncLegacyJournalClosedFromAi,
} from '../services/tradeHistorySync';
import { computePositionPnl } from '../utils/positionPnl';
import {
  LEGACY_STORAGE_KEYS as STORAGE_KEYS,
  loadPersistedAppData,
  savePersistedAnalysisBundle,
  summarizeJournal,
} from '../services/appPersistence';
import {
  AI_JOURNAL_SCHEMA_VERSION,
  AI_JOURNAL_STORAGE_KEYS,
  type AccountHistoryPoint,
  type AiTradeJournalEntry,
  type LockedTradePlan,
  type DailySessionStats,
  type MarketSnapshot,
  type ScoringSnapshot,
  type TodayQuickStats,
  type TradeExitReason,
  type TradeOutcome,
  type TradePlanSnapshot,
  type WeeklyStats,
} from '../constants/aiJournal';
import {
  calculatePlanExpiry,
  formatPlanExpiredMessage,
  planExpiresAtMs,
} from '../services/tradePlanExpiry';
import { formatMultiConfirmationCancelNote } from '../services/planHealth';
import type { PlanHealth } from '../types/tradePlan';
import {
  archiveSkippedSetupsIfNeeded,
  applySkippedPriceUpdate,
  getSkippedStats,
  newSkippedSetupEntry,
  refreshSkippedSetupMarkPrices,
  type SkippedSetupStats,
} from '../services/skippedSetupService';
import {
  formatFillAuditNote,
  resolveActualEntryPrice,
} from '../services/orderFillResolution';
import {
  shouldNotifyForUrgency,
  type NotificationThrottleState,
  type NotificationUrgency,
} from '../services/notificationThrottle';
import { clearKeyLevelsCache } from '../services/indicators';
import {
  loadRecoverySnapshot,
  maxDiskJournalCount,
  maxMemoryJournalCount,
  readDiskJournalCounts,
  shouldPersistHydratedState,
} from '../services/hydrateSafety';
import {
  logRecommendationIfNeeded,
  clearOldRecommendationLogs,
  type RecommendationLogEntry,
} from '../services/recommendationLogService';
import {
  archiveJournalIfNeeded,
  calculateDailyStats,
  computeSlippagePct,
  computeTodayQuickStats,
  computeTradePnl,
  computeWeeklyStats,
  filterJournalByDateRange,
  filterJournalByDirection,
  filterJournalByStatus,
  filterJournalBySymbol,
  getStaleOpenTrades,
  getVisibleJournalEntries,
  newAiJournalEntry,
  newAiJournalPendingEntry,
  outcomeFromClose,
  rebuildAccountHistoryFromJournal,
  refreshDailyStatsForEntry,
  computeEquityCurveStats,
  mapCancelReasonToSkipReason,
  cancelReasonDetail,
  pendingCancelOutcomeFromUnlockReason,
  resolvePendingEntryForLockedPlan,
  type CancelPendingOrderOptions,
  fundingAtEntryFromL6Detail,
  resolveFundingExitPatchForClose,
  resolveSqueezeExitPatchForClose,
  squeezeAtEntryFromResult,
  applyCloseWithFundingPatch,
  type FundingAtEntrySnapshot,
  type SqueezeAtEntrySnapshot,
  type EquityCurveStats,
} from '../services/journalService';
import { syncOnAction } from '../services/driveSyncService';
import { registerDriveSyncStoreBridge } from '../services/driveSyncStoreBridge';
import type { CancelReason } from '../services/lockedPlanScoring';

// ─── Phase 1 AI Journal (re-export types) ────────────────────────────────────

export type {
  AccountHistoryPoint,
  AiTradeJournalEntry,
  LockedTradePlan,
  DailySessionStats,
  MarketSnapshot,
  ScoringSnapshot,
  TodayQuickStats,
  TradeOutcome,
  TradePlanSnapshot,
  WeeklyStats,
} from '../constants/aiJournal';

export type { SkippedSetupEntry, SkipReason } from '../constants/scoring';
export type { SkippedSetupStats } from '../services/skippedSetupService';
export type { EquityCurveStats } from '../services/journalService';

export { AI_JOURNAL_STORAGE_KEYS } from '../constants/aiJournal';

// ─── Storage keys (v5 journal/settings — tương thích appPersistence) ─────────

import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
const VIETNAM_UTC_OFFSET_HOURS = 7;

// ─── Domain types ──────────────────────────────────────────────────────────────

export type TradeJournalStatus = 'OPEN' | 'CLOSED' | 'PENDING';

export type TradeCloseReason = 'MANUAL_STOP' | 'SL' | 'TP1' | 'TP2' | 'TP3' | 'OTHER';

export type { NotificationThrottleState, NotificationUrgency } from '../services/notificationThrottle';

export interface CloseJournalOptions {
  notes?: string;
  exitPrice?: number;
  closeReason?: TradeCloseReason;
}

export interface PsychologyChecklist {
  noRevengeTrading: boolean;
  withinDailyLossLimit: boolean;
  restedAndFocused: boolean;
  planWritten: boolean;
  noOverLeverage: boolean;
}

export const DEFAULT_PSYCHOLOGY_CHECKLIST: PsychologyChecklist = {
  noRevengeTrading: true,
  withinDailyLossLimit: true,
  restedAndFocused: false,
  planWritten: false,
  noOverLeverage: true,
};

export interface StoredTradeJournalEntry extends TradeJournalEntry {
  id: string;
  status: TradeJournalStatus;
  analysisTimeframe?: AnalysisTimeframe;
  closedAt?: number;
  notes?: string;
  /** SL/TP đã gửi thông báo — tránh báo trùng */
  priceAlertsFired?: Array<'SL' | 'TP1' | 'TP2' | 'TP3'>;
  exitPrice?: number;
  closeReason?: TradeCloseReason;
  realizedPnlUsdt?: number;
  realizedPnlPercent?: number;
  strategySource?: StrategySource;
}

export interface AnalysisSnapshot {
  symbol: AppTradeSymbol;
  timeframe: AnalysisTimeframe;
  fetchedAt: number;
  price: number;
  analysis: TradeAnalysis;
  fullAnalysis: FullAnalysisBundle;
  fromCache: boolean;
}

export interface TradePlansByDirection {
  LONG: TradePlan | null;
  SHORT: TradePlan | null;
}

export interface TradeStoreState {
  selectedSymbol: AppTradeSymbol;
  analysisTimeframe: AnalysisTimeframe;
  analysisResults: AnalysisSnapshot | null;
  tradePlans: TradePlansByDirection;
  selectedDirection: TradeDirection;
  isLoading: boolean;
  lastError: string | null;
  isCachedData: boolean;
  psychologyChecklist: PsychologyChecklist;
  /** Kết quả chấm điểm V4 */
  scoringResultV4: ScoringResultV4 | null;
  /** Kết quả chấm điểm V3 (song song, chọn trên UI) */
  scoringResultV3: ScoringResultV3 | null;
  /** Engine chấm điểm đang hiển thị */
  scorerVersion: ScorerVersion;
  tradeJournal: StoredTradeJournalEntry[];
  settings: AppSettings;
  hydrated: boolean;
  lastSavedAt: number | null;
  persistSummary: { open: number; pending: number; closed: number } | null;
  /** Phase 1 — journal đầy đủ cho AI */
  aiTradeJournal: AiTradeJournalEntry[];
  dailyStats: DailySessionStats[];
  currentOpenDataTrade: AiTradeJournalEntry | null;
  skippedSetups: SkippedSetupEntry[];
  accountHistory: AccountHistoryPoint[];
  lockedPlan: LockedTradePlan | null;
  /** Throttle push cảnh báo urgency position advisor */
  notificationThrottle: NotificationThrottleState;
  /** Quản lý vốn động — tier GD, milestone +30% */
  capitalManagement: CapitalManagementState;
  /** Modal lên cấp milestone — chờ user xác nhận */
  milestoneUpgradePreview: MilestoneUpgradePreview | null;
  /** Nhật ký milestone (capital_state) */
  milestoneJournal: string[];
}

export interface CloseTradeOptions {
  exitPrice: number;
  exitReason: TradeExitReason;
  exitTimestamp?: number;
  notes?: string;
  offlineClose?: boolean;
  fundingAtExit?: number | null;
  fundingStateAtExit?: FundingState | null;
  squeezeRiskScoreAtExit?: number | null;
  squeezeRiskLevelAtExit?: import('../types/squeezeRisk').SqueezeLevel | null;
  squeezeRiskDirectionAtExit?: import('../types/squeezeRisk').SqueezeDirection | null;
  positionAdvisorActionAtExit?: import('../constants/aiJournal').PositionAdvisorActionAtExit | null;
  followedAdvisorRecommendation?: boolean | null;
  scoringDecisionAtExit?: string | null;
  planHealthAtExit?: import('../constants/aiJournal').PlanHealthAtExit | null;
  manualExitReason?: import('../constants/aiJournal').ManualExitReason | null;
  manualExitNote?: string | null;
}

export interface TradeStoreActions {
  hydrate: () => Promise<void>;
  setSelectedSymbol: (symbol: AppTradeSymbol) => void;
  setSelectedDirection: (direction: TradeDirection) => void;
  setAnalysisTimeframe: (timeframe: AnalysisTimeframe) => void;
  setScorerVersion: (version: ScorerVersion) => void;
  fetchAndAnalyze: (symbol?: AppTradeSymbol) => Promise<void>;
  addJournalEntry: (
    entry: Omit<StoredTradeJournalEntry, 'id' | 'status'> & { status?: TradeJournalStatus },
  ) => Promise<StoredTradeJournalEntry>;
  updateJournalEntry: (
    id: string,
    patch: Partial<Omit<StoredTradeJournalEntry, 'id'>>,
  ) => Promise<void>;
  removeJournalEntry: (id: string) => Promise<void>;
  closeJournalEntry: (
    id: string,
    options?: CloseJournalOptions | string,
  ) => Promise<void>;
  clearClosedTradeHistory: () => Promise<void>;
  clearTradeJournal: () => Promise<void>;
  flushPersistedState: () => Promise<void>;
  getClosedTradeHistory: () => StoredTradeJournalEntry[];
  updatePsychologyChecklist: (patch: Partial<PsychologyChecklist>) => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Cập nhật vốn hiện tại — trade plan + milestone modal */
  updateCapital: (newAccountSize: number) => Promise<void>;
  /** Xác nhận modal milestone sau khi lên cấp GD */
  confirmMilestoneUpgrade: () => Promise<void>;
  /** Phase 1 — tạo entry AI journal khi xác nhận vào lệnh */
  addTradeEntry: (
    symbol: string,
    market: MarketSnapshot,
    scoring: ScoringSnapshot,
    plan: TradePlanSnapshot,
    tags?: string[],
    fundingAtEntry?: FundingAtEntrySnapshot,
    squeezeAtEntry?: SqueezeAtEntrySnapshot,
    strategySource?: StrategySource,
  ) => Promise<string>;
  updateTradeOutcome: (id: string, outcome: Partial<TradeOutcome>) => Promise<void>;
  closeWin: (
    id: string,
    exitPrice: number,
    exitReason?: TradeExitReason,
  ) => Promise<void>;
  closeLoss: (id: string, exitPrice: number) => Promise<void>;
  closeBreakeven: (id: string, exitPrice?: number) => Promise<void>;
  closeTradeEntry: (id: string, options: CloseTradeOptions) => Promise<void>;
  /** Ghi nhận grace period đã chặn maturity rule trong quá trình giữ lệnh */
  markGracePeriodTriggered: (tradeId: string) => Promise<void>;
  /** Lưu fundingState sau mỗi lần Position Advisor V4 scan */
  updatePositionLastFundingState: (
    tradeId: string,
    fundingState: FundingState,
  ) => Promise<void>;
  /** Lưu squeeze risk snapshot sau mỗi lần Position Advisor V4 scan */
  updatePositionLastSqueezeRisk: (
    tradeId: string,
    level: import('../types/squeezeRisk').SqueezeLevel,
    direction: import('../types/squeezeRisk').SqueezeDirection,
  ) => Promise<void>;
  /** Phase 1 — đặt lệnh limit chờ fill */
  placePendingOrder: (
    symbol: string,
    market: MarketSnapshot,
    scoring: ScoringSnapshot,
    plan: TradePlanSnapshot,
    limitOrderPrice: number,
    strategySource?: StrategySource,
  ) => Promise<string>;
  /** PENDING → OPEN sau khi limit/stop/trigger fill */
  confirmOrderFilled: (
    id: string,
    marketPriceAtFill: number,
    actualSL: number,
    actualSize: number,
  ) => Promise<void>;
  /** Hủy lệnh chờ — status CANCELLED + ghi reason/notes vào nhật ký */
  cancelPendingOrder: (id: string, options?: CancelPendingOrderOptions) => Promise<void>;
  getPendingOrders: () => AiTradeJournalEntry[];
  addSkippedSetup: (
    symbol: string,
    direction: 'LONG' | 'SHORT',
    totalScore: number,
    skipReason: SkipReason,
    skipReasonDetail: string,
    currentPrice: number,
  ) => Promise<string>;
  updateSkippedPrice: (
    id: string,
    priceAfter2h?: number,
    priceAfter4h?: number,
  ) => Promise<void>;
  refreshSkippedSetupMarkPrices: (markPricesBySymbol: Record<string, number>) => Promise<void>;
  getSkippedStats: () => SkippedSetupStats;
  getStaleOpenTrades: () => AiTradeJournalEntry[];
  getVisibleAiJournal: () => AiTradeJournalEntry[];
  getTodayStats: () => TodayQuickStats;
  calculateDailyStats: (date: string) => DailySessionStats;
  getWeeklyStats: () => WeeklyStats;
  getJournalBySymbol: (symbol: string) => AiTradeJournalEntry[];
  getJournalByDirection: (direction: 'LONG' | 'SHORT') => AiTradeJournalEntry[];
  getJournalByStatus: (status: TradeOutcome['status']) => AiTradeJournalEntry[];
  getJournalByDateRange: (from: number, to: number) => AiTradeJournalEntry[];
  setAiJournalTags: (id: string, tags: string[]) => Promise<void>;
  importAiJournalBundle: (
    journal: AiTradeJournalEntry[],
    stats?: DailySessionStats[],
  ) => Promise<void>;
  /** Web — tải file JSON backup và gộp vào store. */
  importFullBackup: () => Promise<boolean>;
  /** Tải file JSON backup toàn bộ Phase 1. */
  exportFullBackup: () => void;
  /** Web — chọn file JSON ghi tự động (đồng bộ qua mọi port). */
  enableAutoFileBackup: () => Promise<boolean>;
  /** Web — áp dụng snapshot từ tab khác (BroadcastChannel). */
  syncFromRemoteSnapshot: (snapshot: TradeFullSnapshot) => Promise<void>;
  getAccountHistory: () => AccountHistoryPoint[];
  resetAccountHistory: () => Promise<void>;
  getEquityCurveStats: () => EquityCurveStats | null;
  lockTradePlan: (
    plan: Omit<LockedTradePlan, 'id' | 'lockedAt' | 'expiresAt' | 'status'>,
  ) => Promise<string>;
  unlockTradePlan: (
    reason: CancelReason | 'FILLED' | 'USER_MANUAL' | 'PLAN_EXPIRED',
    marketPriceAtFill?: number,
  ) => Promise<void>;
  updateLockedPlanHealth: (planHealth: PlanHealth) => Promise<void>;
  checkPlanExpiry: () => boolean;
  updateNotificationThrottle: (
    tradeId: string,
    urgency: NotificationUrgency,
  ) => Promise<void>;
  shouldNotify: (tradeId: string, newUrgency: NotificationUrgency) => boolean;
  checkPositionAdvisorAlerts: () => Promise<boolean>;
  logPositionRecommendation: (
    entry: Omit<RecommendationLogEntry, 'id' | 'trigger'>,
    isUserInteraction?: boolean,
  ) => Promise<void>;
}

export type TradeStore = TradeStoreState & TradeStoreActions;

// ─── Helpers ───────────────────────────────────────────────────────────────────

export interface VietnamDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  ymd: string;
}

/** Thời gian hiện tại theo múi giờ Việt Nam (UTC+7). */
export function getVietnamDateParts(now = new Date()): VietnamDateParts {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const vn = new Date(utcMs + VIETNAM_UTC_OFFSET_HOURS * 3_600_000);
  const year = vn.getFullYear();
  const month = vn.getMonth() + 1;
  const day = vn.getDate();
  return {
    year,
    month,
    day,
    hour: vn.getHours(),
    minute: vn.getMinutes(),
    ymd: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function buildAutoRefreshLockKey(parts: VietnamDateParts, triggerMinute: number): string {
  return `${parts.ymd}:${parts.hour}:m${triggerMinute}`;
}

export function shouldTriggerAutoCheck(
  parts: VietnamDateParts,
  settings: Pick<AppSettings, 'triggerMinute' | 'autoCheckStartHour' | 'autoCheckEndHour'>,
): boolean {
  return (
    parts.minute === settings.triggerMinute &&
    parts.hour >= settings.autoCheckStartHour &&
    parts.hour <= settings.autoCheckEndHour
  );
}

function newJournalId(): string {
  return `tj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sessionHourUtcPlus7(): number {
  return (new Date().getUTCHours() + VIETNAM_UTC_OFFSET_HOURS) % 24;
}

/**
 * Tính `IndicatorPsychology` từ nhật ký lệnh + cài đặt risk:
 * - `consecutiveLosses`: chuỗi lệnh CLOSED gần nhất có PnL âm (theo `realizedPnlPercent`).
 * - `dailyLossPercent`: tổng |PnL%| của các lệnh đóng trong cùng ngày VN, chỉ đếm lệnh thua.
 * - `maxDailyLossPercent`: từ settings (`maxLossPerWeek/accountSize × 100 / 5` ≈ trần lỗ ngày).
 */
function closedEntryPnlPercent(entry: StoredTradeJournalEntry): number | null {
  if (entry.realizedPnlPercent != null && Number.isFinite(entry.realizedPnlPercent)) {
    return entry.realizedPnlPercent;
  }
  if (entry.exitPrice != null) {
    return computePositionPnl(entry, entry.exitPrice).pnlPercent;
  }
  return null;
}

export interface LossStreakLockExtras {
  consecutiveLossesIn24h: number;
  lossStreakLocked: boolean;
  lossStreakLockUntil: number | null;
}

/** 3 thua liên tiếp trong 24h → cooldown 180 phút kể từ lệnh thua gần nhất. */
export function resolveLossStreakLock(
  journal: StoredTradeJournalEntry[],
  now = new Date(),
): LossStreakLockExtras {
  const nowMs = now.getTime();
  const windowStart = nowMs - HARD_BLOCK_RULES.LOSS_STREAK_WINDOW_MS;
  const lockMs = HARD_BLOCK_RULES.LOSS_STREAK_LOCK_MINUTES * 60 * 1000;

  const closed = journal
    .filter((e) => e.status === 'CLOSED')
    .sort((a, b) => (b.closedAt ?? b.entryTime) - (a.closedAt ?? a.entryTime));

  let consecutiveLossesIn24h = 0;
  let mostRecentLossClosedAt: number | null = null;

  for (const entry of closed) {
    const ts = entry.closedAt ?? entry.entryTime;
    if (ts < windowStart) break;
    const pnl = closedEntryPnlPercent(entry);
    if (pnl == null || !Number.isFinite(pnl)) break;
    if (pnl < 0) {
      consecutiveLossesIn24h += 1;
      if (mostRecentLossClosedAt == null) mostRecentLossClosedAt = ts;
    } else {
      break;
    }
  }

  const lossStreakLockUntil =
    consecutiveLossesIn24h >= HARD_BLOCK_RULES.MAX_CONSECUTIVE_LOSSES &&
    mostRecentLossClosedAt != null
      ? mostRecentLossClosedAt + lockMs
      : null;
  const lossStreakLocked =
    lossStreakLockUntil != null && nowMs < lossStreakLockUntil;

  return { consecutiveLossesIn24h, lossStreakLocked, lossStreakLockUntil };
}

export function buildTodayStatsLockExtras(
  psychology: Pick<
    IndicatorPsychology,
    'consecutiveLossesIn24h' | 'lossStreakLocked' | 'lossStreakLockUntil'
  >,
): LossStreakLockExtras {
  return {
    consecutiveLossesIn24h: psychology.consecutiveLossesIn24h,
    lossStreakLocked: psychology.lossStreakLocked,
    lossStreakLockUntil: psychology.lossStreakLockUntil,
  };
}

export function derivePsychology(
  journal: StoredTradeJournalEntry[],
  settings: AppSettings,
  now = new Date(),
): IndicatorPsychology {
  const closed = journal
    .filter((e) => e.status === 'CLOSED')
    .sort((a, b) => (b.closedAt ?? b.entryTime) - (a.closedAt ?? a.entryTime));

  let consecutiveLosses = 0;
  for (const entry of closed) {
    const pnl = closedEntryPnlPercent(entry);
    if (pnl == null || !Number.isFinite(pnl)) break;
    if (pnl < 0) consecutiveLosses += 1;
    else break;
  }

  const lock = resolveLossStreakLock(journal, now);

  const todayYmd = getVietnamDateParts(now).ymd;
  let dailyLossPercent = 0;
  for (const entry of closed) {
    const ts = entry.closedAt ?? entry.entryTime;
    const entryYmd = getVietnamDateParts(new Date(ts)).ymd;
    if (entryYmd !== todayYmd) continue;
    const pnl = closedEntryPnlPercent(entry);
    if (pnl != null && Number.isFinite(pnl) && pnl < 0) {
      dailyLossPercent += Math.abs(pnl);
    }
  }

  // Trần lỗ ngày = (maxLossPerWeek / accountSize) × 100 / 5 ngày giao dịch
  const accountSize = settings.accountSize > 0 ? settings.accountSize : DEFAULT_SETTINGS.accountSize;
  const weeklyLossPct = (settings.maxLossPerWeek / accountSize) * 100;
  const maxDailyLossPercent = Math.max(0.5, weeklyLossPct / 5);

  return {
    consecutiveLosses,
    consecutiveLossesIn24h: lock.consecutiveLossesIn24h,
    lossStreakLocked: lock.lossStreakLocked,
    lossStreakLockUntil: lock.lossStreakLockUntil,
    dailyLossPercent,
    maxDailyLossPercent,
  };
}

/** Tổng lỗ USDT thực tế các lệnh đóng trong ngày VN */
export function computeDailyLossUsdt(
  journal: StoredTradeJournalEntry[],
  now = new Date(),
): number {
  const todayYmd = getVietnamDateParts(now).ymd;
  let loss = 0;
  for (const entry of journal) {
    if (entry.status !== 'CLOSED') continue;
    const ts = entry.closedAt ?? entry.entryTime;
    if (getVietnamDateParts(new Date(ts)).ymd !== todayYmd) continue;
    const pnl = entry.realizedPnlUsdt;
    if (pnl != null && Number.isFinite(pnl) && pnl < 0) {
      loss += Math.abs(pnl);
    }
  }
  return loss;
}

/** Map checklist UI store → checklist Scorer v2 */
export function toScoringPsychologyChecklist(
  checklist: PsychologyChecklist,
  journal: StoredTradeJournalEntry[],
  settings: AppSettings,
): PsychologyChecklistV2 {
  const derived = derivePsychology(journal, settings);
  const dailyLoss = computeDailyLossUsdt(journal);
  return {
    alert: checklist.restedAndFocused,
    noLossStreak: !derived.lossStreakLocked,
    dailyLossOk: dailyLoss < HARD_BLOCK_RULES.MAX_DAILY_LOSS_USDT,
    noFomo: checklist.noRevengeTrading,
    slTpReady: checklist.planWritten,
  };
}

async function readJson<T>(key: string): Promise<T | null> {
  return persistGetJson<T>(key);
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await persistSetJson(key, value);
}

async function persistCapitalSnapshot(
  settings: AppSettings,
  milestoneJournal: string[],
): Promise<void> {
  await saveCapitalState(capitalStateFromSettings(settings, milestoneJournal));
}

async function persistFullSnapshotFromState(
  state: TradeStoreState,
  options?: { skipBroadcast?: boolean },
): Promise<void> {
  await saveTradeSnapshot(
    buildTradeSnapshot({
      tradeJournal: state.tradeJournal,
      aiTradeJournal: state.aiTradeJournal,
      dailyStats: state.dailyStats,
      accountHistory: state.accountHistory,
      skippedSetups: state.skippedSetups,
      settings: state.settings,
      psychologyChecklist: state.psychologyChecklist,
      lockedPlan: state.lockedPlan,
    }),
    options,
  );
}

/** Ghi toàn bộ khóa Phase 1 + mirror (IndexedDB, window.name, file). */
async function persistAllPhase1Keys(
  state: TradeStoreState,
  options?: { skipBroadcast?: boolean },
): Promise<void> {
  const openTrade = state.currentOpenDataTrade ?? syncCurrentOpenTrade(state.aiTradeJournal);
  await Promise.all([
    writeJson(STORAGE_KEYS.journal, state.tradeJournal),
    writeJson(STORAGE_KEYS.settings, state.settings),
    writeJson(STORAGE_KEYS.psychology, state.psychologyChecklist),
    writeJson(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL, state.aiTradeJournal),
    writeJson(AI_JOURNAL_STORAGE_KEYS.DAILY_STATS, state.dailyStats),
    writeJson(AI_JOURNAL_STORAGE_KEYS.OPEN_TRADE, openTrade),
    writeJson(AI_JOURNAL_STORAGE_KEYS.SKIPPED_SETUPS, state.skippedSetups),
    writeJson(AI_JOURNAL_STORAGE_KEYS.ACCOUNT_HISTORY, state.accountHistory),
    state.lockedPlan
      ? writeJson(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN, state.lockedPlan)
      : persistRemoveItem(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN),
    writeJson(AI_JOURNAL_STORAGE_KEYS.JOURNAL_VERSION, AI_JOURNAL_SCHEMA_VERSION),
  ]);
  await persistFullSnapshotFromState(state, options);
}

async function applyMergedSnapshotToStore(
  merged: TradeFullSnapshot,
  set: (partial: Partial<TradeStoreState>) => void,
  get: () => TradeStoreState,
  options?: { skipBroadcast?: boolean },
): Promise<void> {
  const journalV2 = merged.aiTradeJournal;
  const tradeJournal = syncLegacyJournalClosedFromAi(merged.tradeJournal, journalV2);
  const summary = summarizeJournal(tradeJournal);
  const openFromJournal = syncCurrentOpenTrade(journalV2);

  let lockedPlan = merged.lockedPlan ?? null;
  if (
    lockedPlan &&
    (lockedPlan.status !== 'WAITING' || Date.now() >= lockedPlan.expiresAt)
  ) {
    lockedPlan = null;
  }

  let history = merged.accountHistory ?? [];
  if (history.length === 0 && journalV2.length > 0) {
    history = rebuildAccountHistoryFromJournal(journalV2);
  }

  set({
    tradeJournal,
    aiTradeJournal: journalV2,
    dailyStats: merged.dailyStats,
    skippedSetups: merged.skippedSetups,
    accountHistory: history,
    lockedPlan,
    settings: { ...DEFAULT_SETTINGS, ...merged.settings },
    psychologyChecklist: {
      ...DEFAULT_PSYCHOLOGY_CHECKLIST,
      ...merged.psychologyChecklist,
    },
    currentOpenDataTrade: openFromJournal,
    lastSavedAt: merged.savedAt,
    persistSummary: summary,
  });

  await persistAllPhase1Keys(get(), options);
}

async function persistSkippedSetups(
  setups: SkippedSetupEntry[],
  getState: () => TradeStoreState,
): Promise<void> {
  await writeJson(AI_JOURNAL_STORAGE_KEYS.SKIPPED_SETUPS, setups);
  await persistFullSnapshotFromState(getState());
}

async function persistAccountHistory(
  history: AccountHistoryPoint[],
  getState: () => TradeStoreState,
): Promise<void> {
  await writeJson(AI_JOURNAL_STORAGE_KEYS.ACCOUNT_HISTORY, history);
  await persistFullSnapshotFromState(getState());
}

async function persistLockedPlan(
  plan: LockedTradePlan | null,
  getState: () => TradeStoreState,
): Promise<void> {
  if (plan == null) {
    await persistRemoveItem(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN);
  } else {
    await writeJson(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN, plan);
  }
  await persistFullSnapshotFromState(getState());
}

function applySkippedPersist(
  setups: SkippedSetupEntry[],
): SkippedSetupEntry[] {
  return archiveSkippedSetupsIfNeeded(setups);
}

async function persistLegacyJournal(
  journal: StoredTradeJournalEntry[],
  getState: () => TradeStoreState,
): Promise<void> {
  await writeJson(STORAGE_KEYS.journal, journal);
  await persistFullSnapshotFromState(getState());
}

function triggerJournalDriveSync(): void {
  syncOnAction('JOURNAL_ENTRY_ADDED').catch((err) => {
    console.warn('[Journal] Drive sync failed (non-critical):', err);
  });
}

function triggerPositionPlacedSync(): void {
  syncOnAction('ORDER_PLACED').catch((err) => {
    console.warn('[Position] Drive sync failed (non-critical):', err);
  });
}

function triggerPositionClosedSync(): void {
  syncOnAction('ORDER_CLOSED').catch((err) => {
    console.warn('[Position] Drive sync failed (non-critical):', err);
  });
}

function triggerPositionUpdatedSync(): void {
  syncOnAction('POSITION_UPDATED').catch((err) => {
    console.warn('[Position] Drive sync failed (non-critical):', err);
  });
}

async function persistAiJournal(
  journal: AiTradeJournalEntry[],
  stats: DailySessionStats[],
  openTrade: AiTradeJournalEntry | null,
  getState: () => TradeStoreState,
): Promise<void> {
  await Promise.all([
    writeJson(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL, journal),
    writeJson(AI_JOURNAL_STORAGE_KEYS.DAILY_STATS, stats),
    writeJson(AI_JOURNAL_STORAGE_KEYS.OPEN_TRADE, openTrade),
    writeJson(AI_JOURNAL_STORAGE_KEYS.JOURNAL_VERSION, AI_JOURNAL_SCHEMA_VERSION),
  ]);
  await persistFullSnapshotFromState(getState());
}

function applyJournalPersist(
  journal: AiTradeJournalEntry[],
  stats: DailySessionStats[],
): Pick<TradeStoreState, 'aiTradeJournal' | 'dailyStats' | 'currentOpenDataTrade'> {
  const archived = archiveJournalIfNeeded(journal);
  const open = syncCurrentOpenTrade(archived);
  return {
    aiTradeJournal: archived,
    dailyStats: stats,
    currentOpenDataTrade: open,
  };
}

function syncCurrentOpenTrade(journal: AiTradeJournalEntry[]): AiTradeJournalEntry | null {
  const open = journal.filter((e) => e.outcome.status === 'OPEN');
  if (open.length === 0) return null;
  return open.sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

function journalPersistMeta(journal: StoredTradeJournalEntry[]) {
  return {
    persistSummary: summarizeJournal(journal),
    lastSavedAt: Date.now(),
  };
}

function extractTradePlans(bundle: FullAnalysisBundle): TradePlansByDirection {
  return {
    LONG: bundle.long.tradePlan,
    SHORT: bundle.short.tradePlan,
  };
}

// ─── Zustand store ─────────────────────────────────────────────────────────────

export const useTradeStore = create<TradeStore>()((set, get) => ({
  selectedSymbol: 'BTCUSDT',
  analysisTimeframe: '1h',
  analysisResults: null,
  tradePlans: { LONG: null, SHORT: null },
  selectedDirection: 'LONG',
  isLoading: false,
  lastError: null,
  isCachedData: false,
  psychologyChecklist: { ...DEFAULT_PSYCHOLOGY_CHECKLIST },
  scoringResultV4: null,
  scoringResultV3: null,
  scorerVersion: 'v4',
  tradeJournal: [],
  settings: { ...DEFAULT_SETTINGS },
  hydrated: false,
  lastSavedAt: null,
  persistSummary: null,
  aiTradeJournal: [],
  dailyStats: [],
  currentOpenDataTrade: null,
  skippedSetups: [],
  accountHistory: [],
  lockedPlan: null,
  notificationThrottle: {},

  capitalManagement: defaultCapitalManagementState(),
  milestoneUpgradePreview: null,
  milestoneJournal: [],

  hydrate: async () => {
    const diskCountsAtStart = await readDiskJournalCounts();

    try {
      const [
        data,
        aiJournal,
        dailyStats,
        openTrade,
        skippedSetups,
        accountHistory,
        lockedPlanRaw,
        storedSnapshot,
        notificationThrottleRaw,
        capitalStatePersisted,
      ] = await Promise.all([
        loadPersistedAppData(),
        readJson<AiTradeJournalEntry[]>(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL),
        readJson<DailySessionStats[]>(AI_JOURNAL_STORAGE_KEYS.DAILY_STATS),
        readJson<AiTradeJournalEntry | null>(AI_JOURNAL_STORAGE_KEYS.OPEN_TRADE),
        readJson<SkippedSetupEntry[]>(AI_JOURNAL_STORAGE_KEYS.SKIPPED_SETUPS),
        readJson<AccountHistoryPoint[]>(AI_JOURNAL_STORAGE_KEYS.ACCOUNT_HISTORY),
        readJson<LockedTradePlan | null>(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN),
        loadTradeSnapshot(),
        readJson<NotificationThrottleState>(AI_JOURNAL_STORAGE_KEYS.NOTIFICATION_THROTTLE),
        loadCapitalState(),
      ]);

      const aiJournalMigrated = migrateAiJournal(aiJournal ?? []);
      const legacyJournalMigrated = migrateLegacyJournal(data.journal ?? []);
      const dailyStatsMigrated = migrateDailyStats(dailyStats ?? []);
      const accountHistoryMigrated = migrateAccountHistory(accountHistory ?? []);
      const skippedMigrated = migrateSkippedSetups(skippedSetups ?? []);
      const psychologyMigrated = migratePsychology(data.psychology);
      const settingsBase = migrateSettings(data.settings);
      const settingsFromCapital = capitalStatePersisted
        ? applyCapitalStateToSettings(settingsBase, capitalStatePersisted)
        : syncSettingsWithCapitalTier(settingsBase);
      const milestoneJournalFromDisk = capitalStatePersisted?.milestoneJournal ?? [];

      const needsMigration =
        phase1PayloadChanged(aiJournal, aiJournalMigrated) ||
        phase1PayloadChanged(data.journal, legacyJournalMigrated) ||
        phase1PayloadChanged(dailyStats, dailyStatsMigrated) ||
        phase1PayloadChanged(accountHistory, accountHistoryMigrated) ||
        phase1PayloadChanged(skippedSetups, skippedMigrated) ||
        phase1PayloadChanged(data.psychology, psychologyMigrated) ||
        phase1PayloadChanged(data.settings, settingsFromCapital);

      const psychologyChecklist = {
        ...DEFAULT_PSYCHOLOGY_CHECKLIST,
        ...psychologyMigrated,
      };

      const partsSnapshot = buildTradeSnapshot({
        tradeJournal: legacyJournalMigrated,
        aiTradeJournal: aiJournalMigrated,
        dailyStats: dailyStatsMigrated,
        accountHistory: accountHistoryMigrated,
        skippedSetups: skippedMigrated,
        settings: settingsFromCapital,
        psychologyChecklist,
      });
      const merged = mergeTradeSnapshots(
        storedSnapshot,
        readWindowNameSnapshot(),
        partsSnapshot,
      );

      let journalV2 = merged?.aiTradeJournal ?? aiJournalMigrated ?? [];
      let tradeJournal = syncLegacyJournalClosedFromAi(
        merged?.tradeJournal ?? legacyJournalMigrated ?? [],
        journalV2,
      );

      if (
        maxMemoryJournalCount(tradeJournal, journalV2) === 0 &&
        maxDiskJournalCount(diskCountsAtStart) > 0
      ) {
        const recovery = await loadRecoverySnapshot();
        if (recovery) {
          journalV2 = recovery.aiTradeJournal ?? [];
          tradeJournal = syncLegacyJournalClosedFromAi(
            recovery.tradeJournal ?? [],
            journalV2,
          );
          console.warn('[hydrate] Phục hồi journal từ full snapshot');
        }
      }

      const summary = summarizeJournal(tradeJournal);
      const bundle = data.analysisBundle;
      const openFromJournal = syncCurrentOpenTrade(journalV2);
      const mergedSettingsRaw = merged?.settings
        ? { ...DEFAULT_SETTINGS, ...merged.settings }
        : settingsFromCapital;
      const mergedSettings = capitalStatePersisted
        ? applyCapitalStateToSettings(
            syncSettingsWithCapitalTier(mergedSettingsRaw),
            capitalStatePersisted,
          )
        : syncSettingsWithCapitalTier(mergedSettingsRaw);
      const capitalManagement = buildCapitalManagementState(mergedSettings);
      const milestoneJournal = milestoneJournalFromDisk;
      const mergedPsychology = merged?.psychologyChecklist
        ? { ...DEFAULT_PSYCHOLOGY_CHECKLIST, ...merged.psychologyChecklist }
        : psychologyChecklist;

      let history = merged?.accountHistory ?? accountHistory ?? [];
      if (history.length === 0 && journalV2.length > 0) {
        history = rebuildAccountHistoryFromJournal(journalV2);
        if (history.length > 0) {
          void writeJson(AI_JOURNAL_STORAGE_KEYS.ACCOUNT_HISTORY, history);
        }
      }

      // Khôi phục lockedPlan: ưu tiên key gd1_ (cùng origin); nếu thiếu (đổi port)
      // thì lấy từ snapshot đã mirror sang window.name.
      let lockedPlan = migrateLockedPlan(lockedPlanRaw ?? merged?.lockedPlan ?? null);
      if (
        lockedPlan &&
        (lockedPlan.status !== 'WAITING' || Date.now() >= lockedPlan.expiresAt)
      ) {
        lockedPlan = null;
        void persistRemoveItem(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN);
      } else if (lockedPlan && !lockedPlanRaw) {
        void writeJson(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN, lockedPlan);
      }

      set({
        tradeJournal,
        aiTradeJournal: journalV2,
        dailyStats: merged?.dailyStats ?? dailyStats ?? [],
        currentOpenDataTrade: openTrade ?? openFromJournal,
        skippedSetups: merged?.skippedSetups ?? skippedSetups ?? [],
        accountHistory: history,
        lockedPlan,
        settings: mergedSettings,
        capitalManagement,
        psychologyChecklist: mergedPsychology,
        selectedSymbol: data.symbol ?? bundle?.selectedSymbol ?? 'BTCUSDT',
        selectedDirection: data.direction ?? bundle?.selectedDirection ?? 'LONG',
        analysisTimeframe: data.timeframe ?? bundle?.analysisTimeframe ?? '1h',
        analysisResults: bundle?.analysisResults ?? null,
        tradePlans: bundle?.tradePlans ?? { LONG: null, SHORT: null },
        scoringResultV4: bundle?.scoringResultV4 ?? null,
        scoringResultV3: bundle?.scoringResultV3 ?? null,
        scorerVersion: bundle?.scorerVersion ?? data.scorerVersion ?? 'v4',
        isCachedData: bundle?.analysisResults?.fromCache ?? false,
        lastSavedAt: merged?.savedAt ?? data.savedAt,
        persistSummary: summary,
        notificationThrottle: notificationThrottleRaw ?? {},
        milestoneJournal,
        milestoneUpgradePreview: null,
        hydrated: true,
      });

      void clearOldRecommendationLogs(30);

      const memoryMax = maxMemoryJournalCount(tradeJournal, journalV2);
      if (
        (merged || needsMigration) &&
        shouldPersistHydratedState(memoryMax, maxDiskJournalCount(diskCountsAtStart))
      ) {
        await persistAllPhase1Keys(get());
      }
    } catch (e) {
      console.error('[hydrate] lỗi:', e);
      const recovery = await loadRecoverySnapshot();
      if (recovery && maxDiskJournalCount(diskCountsAtStart) > 0) {
        const journalV2 = recovery.aiTradeJournal ?? [];
        const tradeJournal = syncLegacyJournalClosedFromAi(
          recovery.tradeJournal ?? [],
          journalV2,
        );
        set({
          tradeJournal,
          aiTradeJournal: journalV2,
          dailyStats: recovery.dailyStats ?? [],
          accountHistory: recovery.accountHistory ?? [],
          skippedSetups: recovery.skippedSetups ?? [],
          settings: { ...DEFAULT_SETTINGS, ...recovery.settings },
          psychologyChecklist: {
            ...DEFAULT_PSYCHOLOGY_CHECKLIST,
            ...recovery.psychologyChecklist,
          },
          currentOpenDataTrade: syncCurrentOpenTrade(journalV2),
          lockedPlan: recovery.lockedPlan ?? null,
          persistSummary: summarizeJournal(tradeJournal),
          hydrated: true,
          lastError: String(e),
        });
        return;
      }

      set({
        lastError: String(e),
        hydrated: true,
      });
    }
  },

  flushPersistedState: async () => {
    await persistAllPhase1Keys(get());
  },

  getClosedTradeHistory: () =>
    mergeClosedTradeHistory(get().tradeJournal, get().aiTradeJournal),

  setSelectedSymbol: (symbol) => {
    clearKeyLevelsCache(symbol);
    set({ selectedSymbol: symbol });
    void writeJson(STORAGE_KEYS.symbol, symbol);
  },

  setSelectedDirection: (direction) => {
    set({ selectedDirection: direction });
    void writeJson(STORAGE_KEYS.direction, direction);
  },

  setAnalysisTimeframe: (timeframe) => {
    set({ analysisTimeframe: timeframe });
    void writeJson(STORAGE_KEYS.timeframe, timeframe);
  },

  setScorerVersion: (version) => {
    set({ scorerVersion: version });
    void writeJson(STORAGE_KEYS.scorerVersion, version);
  },

  fetchAndAnalyze: async (symbolArg) => {
    const state = get();
    const symbol = symbolArg ?? state.selectedSymbol;
    const timeframe = state.analysisTimeframe;
    const psychology = derivePsychology(state.tradeJournal, state.settings);

    set({ isLoading: true, lastError: null });

    try {
      const { market, ticker, btcChange24h } = await fetchMarketAnalysisBundle(symbol, timeframe);

      const mtfChain = computeMtfChain(market);
      const analysis = computeTradeAnalysis(market, timeframe, mtfChain);
      if (!analysis) {
        throw new Error(`Không đủ dữ liệu phân tích cho ${symbol} · ${timeframe}`);
      }

      const price = ticker.price;

      const fullAnalysis = computeFullAnalysisBundle(
        market,
        analysis,
        timeframe,
        btcChange24h,
        price,
        psychology,
      );
      if (!fullAnalysis) {
        throw new Error(`Không thể chấm điểm Phase 4 cho ${symbol}`);
      }

      const snapshot: AnalysisSnapshot = {
        symbol,
        timeframe,
        fetchedAt: Date.now(),
        price,
        analysis,
        fullAnalysis,
        fromCache: market.fromCache,
      };

      const tradePlans = extractTradePlans(fullAnalysis);

      const scoringPsychology = toScoringPsychologyChecklist(
        state.psychologyChecklist,
        state.tradeJournal,
        state.settings,
      );
      const v4Input = buildAnalysisInputV4FromMarket({
        symbol,
        currentPrice: price,
        market,
        psychologyChecklist: scoringPsychology,
        btc24hChangePct: btcChange24h,
        liquidityPools: analysis.heatmap.pools,
        recentJournal: state.aiTradeJournal.slice(-30).map((e) => ({ outcome: e.outcome })),
      });
      const v3Input = buildAnalysisInputV3FromMarket({
        symbol,
        currentPrice: price,
        market,
        psychologyChecklist: scoringPsychology,
        btc24hChangePct: btcChange24h,
        liquidityPools: analysis.heatmap.pools,
        recentJournal: state.aiTradeJournal.slice(-30).map((e) => ({ outcome: e.outcome })),
      });
      const todayStats = buildTodayStatsFromJournalV4(
        psychology.consecutiveLosses,
        computeDailyLossUsdt(state.tradeJournal),
        buildTodayStatsLockExtras(psychology),
      );
      const todayStatsV3 = buildTodayStatsFromJournal(
        psychology.consecutiveLosses,
        computeDailyLossUsdt(state.tradeJournal),
        buildTodayStatsLockExtras(psychology),
      );
      const scoringResultV4 = v4Input ? scoreAnalysisV4(v4Input, todayStats) : null;
      const scoringResultV3 = v3Input ? scoreAnalysisV3(v3Input, todayStatsV3) : null;

      const activeDirection = scoringResultV4
        ? suggestDirectionV4(scoringResultV4)
        : scoringResultV3
          ? suggestDirectionV3(scoringResultV3)
          : fullAnalysis.suggestedDirection;

      set({
        selectedSymbol: symbol,
        analysisResults: snapshot,
        tradePlans,
        scoringResultV4,
        scoringResultV3,
        selectedDirection: activeDirection,
        isCachedData: market.fromCache,
        isLoading: false,
        lastError: null,
      });

      void writeJson(STORAGE_KEYS.symbol, symbol);
      void writeJson(STORAGE_KEYS.direction, activeDirection);
      void savePersistedAnalysisBundle({
        analysisResults: snapshot,
        tradePlans,
        scoringResultV4,
        scoringResultV3,
        scorerVersion: get().scorerVersion,
        selectedDirection: activeDirection,
        selectedSymbol: symbol,
        analysisTimeframe: timeframe,
      }).then(() => {
        set({ lastSavedAt: Date.now() });
      });
    } catch (e) {
      set({
        isLoading: false,
        lastError: String(e),
      });
    }
  },

  addJournalEntry: async (entry) => {
    const record: StoredTradeJournalEntry = {
      ...entry,
      id: newJournalId(),
      status: entry.status ?? 'OPEN',
      analysisTimeframe: entry.analysisTimeframe ?? get().analysisTimeframe,
    };
    const next = [...get().tradeJournal, record];
    set({ tradeJournal: next, ...journalPersistMeta(next) });
    await persistLegacyJournal(next, get);
    triggerJournalDriveSync();
    triggerPositionPlacedSync();
    return record;
  },

  updateJournalEntry: async (id, patch) => {
    const next = get().tradeJournal.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry,
    );
    set({ tradeJournal: next, ...journalPersistMeta(next) });
    await persistLegacyJournal(next, get);
  },

  removeJournalEntry: async (id) => {
    const next = get().tradeJournal.filter((entry) => entry.id !== id);
    set({ tradeJournal: next, ...journalPersistMeta(next) });
    await persistLegacyJournal(next, get);
  },

  closeJournalEntry: async (id, options) => {
    const opts: CloseJournalOptions =
      typeof options === 'string' ? { notes: options } : (options ?? {});

    const closing = get().tradeJournal.find((entry) => entry.id === id);
    if (closing) {
      clearKeyLevelsCache(closing.symbol);
    }

    const next = get().tradeJournal.map((entry) => {
      if (entry.id !== id) return entry;

      let realizedPnlUsdt = entry.realizedPnlUsdt;
      let realizedPnlPercent = entry.realizedPnlPercent;

      if (opts.exitPrice != null && Number.isFinite(opts.exitPrice)) {
        const snap = computePositionPnl(entry, opts.exitPrice);
        if (snap.pnlUsdt != null) realizedPnlUsdt = snap.pnlUsdt;
        if (snap.pnlPercent != null) realizedPnlPercent = snap.pnlPercent;
      }

      return {
        ...entry,
        status: 'CLOSED' as const,
        closedAt: Date.now(),
        notes: opts.notes ?? entry.notes,
        exitPrice: opts.exitPrice ?? entry.exitPrice,
        closeReason: opts.closeReason ?? entry.closeReason ?? 'OTHER',
        realizedPnlUsdt,
        realizedPnlPercent,
      };
    });

    set({ tradeJournal: next, ...journalPersistMeta(next) });
    await persistLegacyJournal(next, get);
    triggerJournalDriveSync();
    triggerPositionClosedSync();
  },

  clearClosedTradeHistory: async () => {
    const nextLegacy = get().tradeJournal.filter((entry) => entry.status !== 'CLOSED');
    const nextAi = get().aiTradeJournal.map((entry) => {
      if (entry.outcome.status === 'OPEN' || entry.outcome.status === 'PENDING') {
        return entry;
      }
      return { ...entry, archived: true };
    });
    const nextStats = refreshDailyStatsForEntry(nextAi, get().dailyStats);
    const persisted = applyJournalPersist(nextAi, nextStats);
    set({
      tradeJournal: nextLegacy,
      ...journalPersistMeta(nextLegacy),
      ...persisted,
    });
    await persistLegacyJournal(nextLegacy, get);
    await persistAiJournal(
      persisted.aiTradeJournal,
      nextStats,
      persisted.currentOpenDataTrade,
      get,
    );
  },

  clearTradeJournal: async () => {
    set({ tradeJournal: [], ...journalPersistMeta([]) });
    await persistLegacyJournal([], get);
  },

  updatePsychologyChecklist: async (patch) => {
    const next = { ...get().psychologyChecklist, ...patch };
    set({ psychologyChecklist: next });
    await writeJson(STORAGE_KEYS.psychology, next);
    await persistFullSnapshotFromState(get());
  },

  saveSettings: async (patch) => {
    const prev = get().settings;
    if (patch.accountSize !== undefined && patch.accountSize !== prev.accountSize) {
      const { accountSize, ...rest } = patch;
      await get().updateCapital(accountSize);
      if (Object.keys(rest).length > 0) {
        const next = { ...get().settings, ...rest };
        const capitalManagement = buildCapitalManagementState(next);
        set({ settings: next, capitalManagement });
        await writeJson(STORAGE_KEYS.settings, next);
        await persistFullSnapshotFromState(get());
      }
      return;
    }

    const next = syncSettingsWithCapitalTier({ ...prev, ...patch });
    const capitalManagement = buildCapitalManagementState(next);
    set({ settings: next, capitalManagement });
    await writeJson(STORAGE_KEYS.settings, next);
    await persistCapitalSnapshot(next, get().milestoneJournal);
    await persistFullSnapshotFromState(get());
  },

  updateCapital: async (newAccountSize) => {
    const result = processAccountSizeUpdate(newAccountSize, get().settings);
    set({
      settings: result.settings,
      capitalManagement: result.capitalManagement,
      milestoneUpgradePreview: result.milestoneUpgradePreview,
    });
    await writeJson(STORAGE_KEYS.settings, result.settings);
    await persistCapitalSnapshot(result.settings, get().milestoneJournal);
    await persistFullSnapshotFromState(get());
    notifyCapitalUpdatedAfterSave();
  },

  confirmMilestoneUpgrade: async () => {
    if (!get().milestoneUpgradePreview) return;
    const confirmed = confirmMilestoneUpgrade(get().settings);
    const milestoneJournal = [...get().milestoneJournal, confirmed.journalNote];
    set({
      settings: confirmed.settings,
      capitalManagement: confirmed.capitalManagement,
      milestoneUpgradePreview: null,
      milestoneJournal,
    });
    await writeJson(STORAGE_KEYS.settings, confirmed.settings);
    await persistCapitalSnapshot(confirmed.settings, milestoneJournal);
    await persistFullSnapshotFromState(get());
    notifyCapitalUpdatedAfterSave();
  },

  addTradeEntry: async (
    symbol,
    market,
    scoring,
    plan,
    tags = [],
    fundingAtEntry,
    squeezeAtEntry,
    strategySource,
  ) => {
    const funding = fundingAtEntry ?? {
      fundingAtEntry: null,
      fundingVelocityAtEntry: null,
      fundingStateAtEntry: null,
    };
    const squeeze = squeezeAtEntry ?? {
      squeezeRiskScoreAtEntry: null,
      squeezeRiskLevelAtEntry: null,
      squeezeRiskDirectionAtEntry: null,
    };
    const entry = newAiJournalEntry({
      symbol,
      accountSizeAtEntry: get().settings.accountSize,
      market,
      scoring,
      plan,
      tags,
      strategySource,
      ...funding,
      ...squeeze,
    });
    const nextJournal = [...get().aiTradeJournal, entry];
    const nextStats = refreshDailyStatsForEntry(nextJournal, get().dailyStats);
    const persisted = applyJournalPersist(nextJournal, nextStats);
    set(persisted);
    await persistAiJournal(persisted.aiTradeJournal, nextStats, persisted.currentOpenDataTrade, get);
    triggerJournalDriveSync();
    triggerPositionPlacedSync();
    return entry.id;
  },

  placePendingOrder: async (symbol, market, scoring, plan, limitOrderPrice, strategySource) => {
    const entry = newAiJournalPendingEntry({
      symbol,
      accountSizeAtEntry: get().settings.accountSize,
      market,
      scoring,
      plan,
      limitOrderPrice,
      strategySource,
    });
    const nextJournal = [...get().aiTradeJournal, entry];
    const persisted = applyJournalPersist(nextJournal, get().dailyStats);
    set(persisted);
    await persistAiJournal(persisted.aiTradeJournal, persisted.dailyStats, persisted.currentOpenDataTrade, get);
    triggerPositionPlacedSync();
    return entry.id;
  },

  confirmOrderFilled: async (id, marketPriceAtFill, actualSL, actualSize) => {
    const entry = get().aiTradeJournal.find((e) => e.id === id);
    if (!entry || entry.outcome.status !== 'PENDING') return;

    const orderEntryPrice =
      entry.outcome.limitOrderPrice ?? entry.market.entryPrice;
    const resolved = resolveActualEntryPrice(
      entry.scoring.direction,
      orderEntryPrice,
      marketPriceAtFill,
    );
    if (!resolved) return;

    const { actualEntryPrice } = resolved;
    const slippage = computeSlippagePct(actualEntryPrice, entry.plan.entryZoneOptimal);
    const fillAuditNote = formatFillAuditNote(resolved);
    const state = get();
    const fundingAtFill =
      entry.scoring.scorerVersion === 'v4'
        ? fundingAtEntryFromL6Detail(
            state.scoringResultV4?.l6Detail,
            'v4',
          )
        : {
            fundingAtEntry: null,
            fundingVelocityAtEntry: null,
            fundingStateAtEntry: null,
          };
    const squeezeAtFill =
      entry.scoring.scorerVersion === 'v4'
        ? squeezeAtEntryFromResult(state.scoringResultV4?.squeezeRisk, 'v4')
        : {
            squeezeRiskScoreAtEntry: null,
            squeezeRiskLevelAtEntry: null,
            squeezeRiskDirectionAtEntry: null,
          };
    const nextJournal = get().aiTradeJournal.map((e) => {
      if (e.id !== id) return e;
      return {
        ...e,
        ...fundingAtFill,
        ...squeezeAtFill,
        market: {
          ...e.market,
          entryPrice: actualEntryPrice,
          slippage,
        },
        plan: {
          ...e.plan,
          slActual: actualSL,
          sizeActual: actualSize,
        },
        outcome: {
          status: 'OPEN' as const,
          limitOrderPrice: e.outcome.limitOrderPrice ?? orderEntryPrice,
          fillMarketPrice: resolved.marketPriceAtFill,
          entryAdjusted: resolved.entryAdjusted,
          limitOrderPlacedAt: e.outcome.limitOrderPlacedAt,
          notes: fillAuditNote,
        },
      };
    });

    const nextStats = refreshDailyStatsForEntry(nextJournal, get().dailyStats);
    const persisted = applyJournalPersist(nextJournal, nextStats);
    set(persisted);
    await persistAiJournal(persisted.aiTradeJournal, nextStats, persisted.currentOpenDataTrade, get);

    const legacyPending = get().tradeJournal.find(
      (e) => e.symbol === entry.symbol && e.status === 'PENDING',
    );
    if (legacyPending?.id) {
      await get().updateJournalEntry(legacyPending.id, {
        status: 'OPEN',
        entryPrice: actualEntryPrice,
        stopLoss: actualSL,
        size: actualSize,
      });
    }

    triggerPositionPlacedSync();
  },

  cancelPendingOrder: async (id, options) => {
    const entry = get().aiTradeJournal.find((e) => e.id === id);
    if (!entry || entry.outcome.status !== 'PENDING') return;

    const exitTimestamp = Date.now();
    const placedAt = entry.outcome.limitOrderPlacedAt ?? entry.timestamp;
    const holdingTimeMinutes = Math.max(
      0,
      Math.round((exitTimestamp - placedAt) / 60_000),
    );

    const nextJournal = get().aiTradeJournal.map((e) => {
      if (e.id !== id) return e;
      return {
        ...e,
        positionAdvisorActionAtExit:
          options?.positionAdvisorActionAtExit !== undefined
            ? options.positionAdvisorActionAtExit
            : e.positionAdvisorActionAtExit,
        outcome: {
          status: 'CANCELLED' as const,
          exitReason: options?.exitReason ?? ('LIMIT_NOT_FILLED' as const),
          exitTimestamp,
          holdingTimeMinutes,
          limitOrderPrice: e.outcome.limitOrderPrice,
          limitOrderPlacedAt: e.outcome.limitOrderPlacedAt,
          notes: options?.notes ?? e.outcome.notes,
        },
      };
    });

    const nextStats = refreshDailyStatsForEntry(nextJournal, get().dailyStats);
    const persisted = applyJournalPersist(nextJournal, nextStats);
    const clearLocked = get().lockedPlan?.pendingEntryId === id;
    set({
      ...persisted,
      ...(clearLocked ? { lockedPlan: null } : {}),
    });
    await Promise.all([
      persistAiJournal(persisted.aiTradeJournal, nextStats, persisted.currentOpenDataTrade, get),
      clearLocked ? persistLockedPlan(null, get) : Promise.resolve(),
    ]);

    const legacyPending = get().tradeJournal.find(
      (e) => e.symbol === entry.symbol && e.status === 'PENDING',
    );
    if (legacyPending?.id) {
      await get().removeJournalEntry(legacyPending.id);
    }

    triggerJournalDriveSync();
  },

  getPendingOrders: () =>
    getVisibleJournalEntries(get().aiTradeJournal).filter(
      (e) => e.outcome.status === 'PENDING',
    ),

  addSkippedSetup: async (symbol, direction, totalScore, skipReason, skipReasonDetail, currentPrice) => {
    const entry = newSkippedSetupEntry({
      symbol,
      direction,
      totalScore,
      skipReason,
      skipReasonDetail,
      priceAtSkip: currentPrice,
    });
    const next = applySkippedPersist([...get().skippedSetups, entry]);
    set({ skippedSetups: next });
    await persistSkippedSetups(next, get);
    return entry.id;
  },

  updateSkippedPrice: async (id, priceAfter2h, priceAfter4h) => {
    const next = applySkippedPersist(
      get().skippedSetups.map((e) =>
        e.id === id ? applySkippedPriceUpdate(e, priceAfter2h, priceAfter4h) : e,
      ),
    );
    set({ skippedSetups: next });
    await persistSkippedSetups(next, get);
  },

  refreshSkippedSetupMarkPrices: async (markPricesBySymbol) => {
    const current = get().skippedSetups;
    const refreshed = refreshSkippedSetupMarkPrices(current, markPricesBySymbol);
    const changed = refreshed.some(
      (e, i) =>
        e.priceAfter2h !== current[i]?.priceAfter2h ||
        e.priceAfter4h !== current[i]?.priceAfter4h ||
        e.hypotheticalPnlPct !== current[i]?.hypotheticalPnlPct,
    );
    if (!changed) return;
    const next = applySkippedPersist(refreshed);
    set({ skippedSetups: next });
    await persistSkippedSetups(next, get);
  },

  getSkippedStats: () => getSkippedStats(get().skippedSetups),

  updateTradeOutcome: async (id, outcome) => {
    const nextJournal = get().aiTradeJournal.map((e) =>
      e.id === id ? { ...e, outcome: { ...e.outcome, ...outcome } } : e,
    );
    const nextStats = refreshDailyStatsForEntry(nextJournal, get().dailyStats);
    const persisted = applyJournalPersist(nextJournal, nextStats);

    const edited = nextJournal.find((e) => e.id === id);
    const pnlChanged =
      outcome.pnlUSDT !== undefined || outcome.pnlPct !== undefined;
    const isClosed =
      edited != null &&
      edited.outcome.status !== 'OPEN' &&
      edited.outcome.status !== 'PENDING';

    let nextHistory = get().accountHistory;
    let nextSettings = get().settings;
    let capitalManagement = get().capitalManagement;
    let milestoneUpgradePreview = get().milestoneUpgradePreview;
    if (isClosed && pnlChanged) {
      nextHistory = rebuildAccountHistoryFromJournal(nextJournal);
      if (nextHistory.length > 0) {
        const newAccountSize = nextHistory[nextHistory.length - 1].value;
        const capitalUpdate = processAccountSizeUpdate(newAccountSize, get().settings);
        nextSettings = capitalUpdate.settings;
        capitalManagement = capitalUpdate.capitalManagement;
        milestoneUpgradePreview = capitalUpdate.milestoneUpgradePreview;
      }
    }

    set({
      ...persisted,
      accountHistory: nextHistory,
      settings: nextSettings,
      capitalManagement,
      milestoneUpgradePreview,
    });
    await Promise.all([
      persistAiJournal(persisted.aiTradeJournal, nextStats, persisted.currentOpenDataTrade, get),
      isClosed && pnlChanged ? persistAccountHistory(nextHistory, get) : Promise.resolve(),
      isClosed && pnlChanged && nextHistory.length > 0
        ? Promise.all([
            writeJson(STORAGE_KEYS.settings, nextSettings),
            persistCapitalSnapshot(nextSettings, get().milestoneJournal),
          ])
        : Promise.resolve(),
    ]);
  },

  closeTradeEntry: async (id, options) => {
    const entry = get().aiTradeJournal.find((e) => e.id === id);
    if (!entry) return;
    clearKeyLevelsCache(entry.symbol);
    const leverage = get().settings.leverage ?? 5;
    const { pnlUSDT, pnlPct } = computeTradePnl(entry, options.exitPrice, leverage);
    const outcome = outcomeFromClose({
      exitPrice: options.exitPrice,
      pnlUSDT,
      pnlPct,
      entryTimestamp: entry.timestamp,
      exitTimestamp: options.exitTimestamp,
      exitReason: options.exitReason,
      notes: options.notes,
      offlineClose: options.offlineClose,
      breakeven: options.exitReason === 'BE_CLOSE',
      wasGracePeriodTriggered: entry.gracePeriodEverTriggered === true,
    });

    const state = get();
    const fundingExitPatch = resolveFundingExitPatchForClose({
      entry,
      options,
      l6Detail: state.scoringResultV4?.l6Detail,
      scorerVersion: state.scorerVersion,
      selectedSymbol: state.selectedSymbol,
    });
    const squeezeExitPatch = resolveSqueezeExitPatchForClose({
      entry,
      options,
      squeezeRisk: state.scoringResultV4?.squeezeRisk,
      scorerVersion: state.scorerVersion,
      selectedSymbol: state.selectedSymbol,
    });

    const nextJournal = get().aiTradeJournal.map((e) =>
      e.id === id
        ? {
            ...e,
            outcome,
            ...fundingExitPatch,
            ...squeezeExitPatch,
            positionAdvisorActionAtExit: options.positionAdvisorActionAtExit ?? null,
            followedAdvisorRecommendation: options.followedAdvisorRecommendation ?? null,
            scoringDecisionAtExit: options.scoringDecisionAtExit ?? null,
            planHealthAtExit: options.planHealthAtExit ?? null,
            manualExitReason: options.manualExitReason ?? null,
            manualExitNote: options.manualExitNote ?? null,
          }
        : e,
    );
    const nextStats = refreshDailyStatsForEntry(nextJournal, get().dailyStats);
    const persisted = applyJournalPersist(nextJournal, nextStats);

    const nextHistory = rebuildAccountHistoryFromJournal(nextJournal);
    const newAccountSize =
      nextHistory.length > 0
        ? nextHistory[nextHistory.length - 1].value
        : Math.max(0, get().settings.accountSize + pnlUSDT);
    const capitalUpdate = processAccountSizeUpdate(newAccountSize, get().settings);

    set({
      ...persisted,
      accountHistory: nextHistory,
      settings: capitalUpdate.settings,
      capitalManagement: capitalUpdate.capitalManagement,
      milestoneUpgradePreview: capitalUpdate.milestoneUpgradePreview,
    });
    await Promise.all([
      persistAiJournal(persisted.aiTradeJournal, nextStats, persisted.currentOpenDataTrade, get),
      persistAccountHistory(nextHistory, get),
      writeJson(STORAGE_KEYS.settings, capitalUpdate.settings),
      persistCapitalSnapshot(capitalUpdate.settings, get().milestoneJournal),
    ]);

    const legacyOpen = get().tradeJournal.find(
      (e) => e.symbol === entry.symbol && e.status === 'OPEN',
    );
    if (legacyOpen?.id) {
      const closeReason: TradeCloseReason =
        options.exitReason === 'TP1_HIT'
          ? 'TP1'
          : options.exitReason === 'TP2_HIT'
            ? 'TP2'
            : options.exitReason === 'TP3_HIT'
              ? 'TP3'
              : options.exitReason === 'SL_HIT'
                ? 'SL'
                : options.exitReason === 'BE_CLOSE'
                  ? 'OTHER'
                  : 'MANUAL_STOP';
      await get().closeJournalEntry(legacyOpen.id, {
        exitPrice: options.exitPrice,
        closeReason,
        notes: options.notes,
      });
    }

    triggerJournalDriveSync();
    triggerPositionClosedSync();
  },

  closeWin: async (id, exitPrice, exitReason = 'MANUAL_CLOSE') => {
    await get().closeTradeEntry(id, { exitPrice, exitReason });
  },

  closeLoss: async (id, exitPrice) => {
    await get().closeTradeEntry(id, { exitPrice, exitReason: 'SL_HIT' });
  },

  closeBreakeven: async (id, exitPrice) => {
    const entry = get().aiTradeJournal.find((e) => e.id === id);
    const price = exitPrice ?? entry?.market.entryPrice ?? 0;
    await get().closeTradeEntry(id, { exitPrice: price, exitReason: 'BE_CLOSE' });
  },

  getTodayStats: () => computeTodayQuickStats(get().aiTradeJournal),

  calculateDailyStats: (date) => calculateDailyStats(get().aiTradeJournal, date),

  getWeeklyStats: () => computeWeeklyStats(get().aiTradeJournal, get().settings.accountSize),

  getJournalBySymbol: (symbol) =>
    filterJournalBySymbol(getVisibleJournalEntries(get().aiTradeJournal), symbol),

  getJournalByDirection: (direction) =>
    filterJournalByDirection(getVisibleJournalEntries(get().aiTradeJournal), direction),

  getJournalByStatus: (status) =>
    filterJournalByStatus(getVisibleJournalEntries(get().aiTradeJournal), status),

  getJournalByDateRange: (from, to) =>
    filterJournalByDateRange(getVisibleJournalEntries(get().aiTradeJournal), from, to),

  getStaleOpenTrades: () => getStaleOpenTrades(get().aiTradeJournal),

  getVisibleAiJournal: () => getVisibleJournalEntries(get().aiTradeJournal),

  setAiJournalTags: async (id, tags) => {
    const nextJournal = get().aiTradeJournal.map((e) =>
      e.id === id ? { ...e, tags } : e,
    );
    const open = syncCurrentOpenTrade(nextJournal);
    set({ aiTradeJournal: nextJournal, currentOpenDataTrade: open });
    await persistAiJournal(nextJournal, get().dailyStats, open, get);
  },

  importAiJournalBundle: async (journal, stats) => {
    const nextStats = stats ?? refreshDailyStatsForEntry(journal, []);
    const persisted = applyJournalPersist(journal, nextStats);
    const nextHistory = rebuildAccountHistoryFromJournal(journal);
    set({ ...persisted, accountHistory: nextHistory });
    await Promise.all([
      persistAiJournal(persisted.aiTradeJournal, nextStats, persisted.currentOpenDataTrade, get),
      persistAccountHistory(nextHistory, get),
    ]);
  },

  importFullBackup: async () => {
    const parsed = await pickAndParseBackupFile();
    if (!parsed) return false;
    const current = buildTradeSnapshot({
      tradeJournal: get().tradeJournal,
      aiTradeJournal: get().aiTradeJournal,
      dailyStats: get().dailyStats,
      accountHistory: get().accountHistory,
      skippedSetups: get().skippedSetups,
      settings: get().settings,
      psychologyChecklist: get().psychologyChecklist,
      lockedPlan: get().lockedPlan,
    });
    const merged = mergeTradeSnapshots(current, parsed);
    if (!merged) return false;
    await applyMergedSnapshotToStore(merged, set, get);
    return true;
  },

  exportFullBackup: () => {
    downloadFullBackup(
      buildTradeSnapshot({
        tradeJournal: get().tradeJournal,
        aiTradeJournal: get().aiTradeJournal,
        dailyStats: get().dailyStats,
        accountHistory: get().accountHistory,
        skippedSetups: get().skippedSetups,
        settings: get().settings,
        psychologyChecklist: get().psychologyChecklist,
        lockedPlan: get().lockedPlan,
      }),
    );
  },

  enableAutoFileBackup: async () => {
    const { pickBackupFile } = await import('../services/webFileBackup');
    const ok = await pickBackupFile();
    if (ok) {
      await persistFullSnapshotFromState(get());
    }
    return ok;
  },

  syncFromRemoteSnapshot: async (incoming) => {
    const state = get();
    const current = buildTradeSnapshot({
      tradeJournal: state.tradeJournal,
      aiTradeJournal: state.aiTradeJournal,
      dailyStats: state.dailyStats,
      accountHistory: state.accountHistory,
      skippedSetups: state.skippedSetups,
      settings: state.settings,
      psychologyChecklist: state.psychologyChecklist,
      lockedPlan: state.lockedPlan,
    });
    const merged = mergeTradeSnapshots(current, incoming);
    if (!merged) return;

    const hasMoreData =
      merged.aiTradeJournal.length > state.aiTradeJournal.length ||
      merged.tradeJournal.length > state.tradeJournal.length ||
      merged.savedAt > (state.lastSavedAt ?? 0);
    if (!hasMoreData) return;

    await applyMergedSnapshotToStore(merged, set, get, { skipBroadcast: true });
  },

  getAccountHistory: () => get().accountHistory,

  resetAccountHistory: async () => {
    set({ accountHistory: [] });
    await persistAccountHistory([], get);
  },

  getEquityCurveStats: () => computeEquityCurveStats(get().accountHistory),

  lockTradePlan: async (planInput) => {
    const now = Date.now();
    const id = planInput.pendingEntryId;
    const { hours, tier } = calculatePlanExpiry(planInput.lockedScore);
    const lockedPlan: LockedTradePlan = {
      ...planInput,
      id,
      pendingEntryId: planInput.pendingEntryId,
      lockedAt: now,
      expiresAt: planExpiresAtMs(now, hours),
      expiryHours: hours,
      expiryTier: tier,
      status: 'WAITING',
    };
    set({ lockedPlan });
    await persistLockedPlan(lockedPlan, get);
    return id;
  },

  unlockTradePlan: async (reason, marketPriceAtFill) => {
    const plan = get().lockedPlan;
    if (!plan || plan.status !== 'WAITING') return;

    const entryId = plan.pendingEntryId;
    const entry = get().aiTradeJournal.find((e) => e.id === entryId);

    if (reason === 'FILLED') {
      if (entry && entry.outcome.status === 'PENDING') {
        const fillPrice =
          marketPriceAtFill ??
          get().analysisResults?.price ??
          entry.market.entryPrice ??
          plan.limitOrderPrice;
        await get().confirmOrderFilled(
          entryId,
          fillPrice,
          plan.sl,
          entry.plan.sizeActual,
        );
      }
      set({ lockedPlan: null });
      await persistLockedPlan(null, get);
      return;
    }

    set({ lockedPlan: { ...plan, status: 'CANCELLED' } });

    const detail =
      reason === 'PLAN_EXPIRED'
        ? formatPlanExpiredMessage(plan.expiryHours ?? calculatePlanExpiry(plan.lockedScore).hours)
        : reason === 'MULTI_CONFIRMATION_CANCEL' && plan.planHealth
          ? formatMultiConfirmationCancelNote(plan.planHealth.penalties)
          : cancelReasonDetail(reason);

    const pendingEntry =
      entry?.outcome.status === 'PENDING'
        ? entry
        : resolvePendingEntryForLockedPlan(get().aiTradeJournal, plan);

    if (pendingEntry) {
      await get().cancelPendingOrder(
        pendingEntry.id,
        pendingCancelOutcomeFromUnlockReason(reason, plan, detail),
      );
    }

    const skipReason = mapCancelReasonToSkipReason(reason);
    const markPrice =
      get().analysisResults?.price ??
      pendingEntry?.market.entryPrice ??
      entry?.market.entryPrice ??
      plan.limitOrderPrice;

    await get().addSkippedSetup(
      plan.symbol,
      plan.lockedDirection,
      plan.lockedScore,
      skipReason,
      detail,
      markPrice,
    );

    set({ lockedPlan: null });
    await persistLockedPlan(null, get);
  },

  updateLockedPlanHealth: async (planHealth) => {
    const plan = get().lockedPlan;
    if (!plan || plan.status !== 'WAITING') return;
    if (
      plan.planHealth?.status === planHealth.status &&
      plan.planHealth?.score === planHealth.score &&
      plan.planHealth?.autoCancel === planHealth.autoCancel &&
      JSON.stringify(plan.planHealth?.penalties) === JSON.stringify(planHealth.penalties)
    ) {
      return;
    }
    const next = { ...plan, planHealth };
    set({ lockedPlan: next });
    await persistLockedPlan(next, get);
  },

  checkPlanExpiry: () => {
    const plan = get().lockedPlan;
    if (!plan || plan.status !== 'WAITING') return false;
    if (Date.now() < plan.expiresAt) return false;
    void get().unlockTradePlan('PLAN_EXPIRED');
    return true;
  },

  updateNotificationThrottle: async (tradeId, urgency) => {
    const next = {
      ...get().notificationThrottle,
      [tradeId]: { lastNotifiedUrgency: urgency, lastNotifiedAt: Date.now() },
    };
    set({ notificationThrottle: next });
    await writeJson(AI_JOURNAL_STORAGE_KEYS.NOTIFICATION_THROTTLE, next);
  },

  shouldNotify: (tradeId, newUrgency) => {
    const throttle = get().notificationThrottle[tradeId];
    return shouldNotifyForUrgency(throttle, newUrgency);
  },

  checkPositionAdvisorAlerts: async () => {
    const state = get();
    const openTrades = state.aiTradeJournal.filter(
      (t) => t.outcome.status === 'OPEN' && !t.archived,
    );
    if (openTrades.length === 0) return false;

    const { runPositionAdvisorAlerts } = await import('../services/positionAdvisorAlertRunner');
    const { sent, throttle } = await runPositionAdvisorAlerts({
      openTrades,
      settings: state.settings,
      throttle: state.notificationThrottle,
      timeframe: state.analysisTimeframe,
      legacyJournal: state.tradeJournal,
    });
    set({ notificationThrottle: throttle });
    return sent;
  },

  logPositionRecommendation: async (entry, isUserInteraction = false) => {
    await logRecommendationIfNeeded(entry, isUserInteraction);
  },

  markGracePeriodTriggered: async (tradeId) => {
    const journal = get().aiTradeJournal;
    const target = journal.find((e) => e.id === tradeId);
    if (!target || target.gracePeriodEverTriggered) return;
    const nextJournal = journal.map((e) =>
      e.id === tradeId ? { ...e, gracePeriodEverTriggered: true } : e,
    );
    const open = syncCurrentOpenTrade(nextJournal);
    set({ aiTradeJournal: nextJournal, currentOpenDataTrade: open });
    await persistAiJournal(nextJournal, get().dailyStats, open, get);
  },

  updatePositionLastFundingState: async (tradeId, fundingState) => {
    const journal = get().aiTradeJournal;
    const target = journal.find((e) => e.id === tradeId);
    if (!target || target.lastFundingState === fundingState) return;
    const nextJournal = journal.map((e) =>
      e.id === tradeId ? { ...e, lastFundingState: fundingState } : e,
    );
    const open = syncCurrentOpenTrade(nextJournal);
    set({ aiTradeJournal: nextJournal, currentOpenDataTrade: open });
    await persistAiJournal(nextJournal, get().dailyStats, open, get);
    triggerPositionUpdatedSync();
  },

  updatePositionLastSqueezeRisk: async (tradeId, level, direction) => {
    const journal = get().aiTradeJournal;
    const target = journal.find((e) => e.id === tradeId);
    if (
      !target ||
      (target.lastSqueezeRiskLevel === level && target.lastSqueezeRiskDirection === direction)
    ) {
      return;
    }
    const nextJournal = journal.map((e) =>
      e.id === tradeId
        ? { ...e, lastSqueezeRiskLevel: level, lastSqueezeRiskDirection: direction }
        : e,
    );
    const open = syncCurrentOpenTrade(nextJournal);
    set({ aiTradeJournal: nextJournal, currentOpenDataTrade: open });
    await persistAiJournal(nextJournal, get().dailyStats, open, get);
    triggerPositionUpdatedSync();
  },
}));

// ─── Auto-refresh (phút thứ 02, UTC+7) ───────────────────────────────────────

export interface AutoRefreshStoreLike {
  getState: () => Pick<TradeStore, 'settings' | 'fetchAndAnalyze'>;
}

/**
 * Quét mỗi 60s — fetchAndAnalyze (app & web foreground).
 * Khuyến nghị lệnh OPEN dùng V3 trên Signal Board (cập nhật khi scan).
 * Trả về cleanup clearInterval.
 */
export function startAutoRefresh(store: AutoRefreshStoreLike): () => void {
  const tick = async () => {
    const { fetchAndAnalyze } = store.getState();
    await fetchAndAnalyze();
  };

  void tick();
  const intervalId = setInterval(() => {
    void tick();
  }, SCAN_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
  };
}

export { STORAGE_KEYS as TRADE_STORE_STORAGE_KEYS };

function buildDrivePositionsPayload(state: TradeStoreState) {
  const openTrades = state.aiTradeJournal.filter(
    (e) => e.outcome.status === 'OPEN' || e.outcome.status === 'PENDING',
  );
  return {
    currentOpenTrade: state.currentOpenDataTrade ?? syncCurrentOpenTrade(state.aiTradeJournal),
    openTrades,
    lockedPlan: state.lockedPlan,
  };
}

function buildDriveCapitalPayload(state: TradeStoreState) {
  return capitalStateFromSettings(state.settings, state.milestoneJournal);
}

function countJournalMirrorChanges(
  local: AiTradeJournalEntry[],
  remote: AiTradeJournalEntry[],
): number {
  const localById = new Map(local.map((entry) => [entry.id, entry]));
  const remoteById = new Map(remote.map((entry) => [entry.id, entry]));
  let changes = 0;

  for (const entry of remote) {
    const existing = localById.get(entry.id);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(entry)) {
      changes++;
    }
  }

  for (const entry of local) {
    if (!remoteById.has(entry.id)) {
      changes++;
    }
  }

  return changes;
}

registerDriveSyncStoreBridge({
  getDeviceId: () => (Platform.OS === 'web' ? 'WEB' : 'APK'),
  getJournal: () => useTradeStore.getState().aiTradeJournal,
  getPositions: () => buildDrivePositionsPayload(useTradeStore.getState()),
  getCapital: () => buildDriveCapitalPayload(useTradeStore.getState()),
  applyJournalMirrorFromApk: async (remoteJournal) => {
    if (Platform.OS !== 'web') return 0;

    const remote = remoteJournal as AiTradeJournalEntry[];
    const local = useTradeStore.getState().aiTradeJournal;
    const changes = countJournalMirrorChanges(local, remote);
    if (changes === 0) return 0;

    const state = useTradeStore.getState();
    const nextStats = refreshDailyStatsForEntry(remote, state.dailyStats);
    const persisted = applyJournalPersist(remote, nextStats);
    const tradeJournal = syncLegacyJournalClosedFromAi(state.tradeJournal, remote);
    const nextHistory = rebuildAccountHistoryFromJournal(remote);

    useTradeStore.setState({
      ...persisted,
      tradeJournal,
      accountHistory: nextHistory,
      persistSummary: summarizeJournal(tradeJournal),
      lastSavedAt: Date.now(),
    });

    await Promise.all([
      writeJson(STORAGE_KEYS.journal, tradeJournal),
      persistAiJournal(
        persisted.aiTradeJournal,
        nextStats,
        persisted.currentOpenDataTrade,
        () => useTradeStore.getState(),
      ),
      persistAccountHistory(nextHistory, () => useTradeStore.getState()),
      persistFullSnapshotFromState(useTradeStore.getState()),
    ]);

    return changes;
  },
  applyPositionsMirrorFromApk: async (remote) => {
    if (Platform.OS !== 'web') return 0;

    const payload = remote as {
      currentOpenTrade?: AiTradeJournalEntry | null;
      openTrades?: AiTradeJournalEntry[];
      lockedPlan?: LockedTradePlan | null;
    };

    const state = useTradeStore.getState();
    const nextOpen = payload.currentOpenTrade ?? null;
    const nextLocked = payload.lockedPlan ?? null;

    const openChanged =
      JSON.stringify(state.currentOpenDataTrade) !== JSON.stringify(nextOpen);
    const lockedChanged = JSON.stringify(state.lockedPlan) !== JSON.stringify(nextLocked);

    if (!openChanged && !lockedChanged) return 0;

    useTradeStore.setState({
      currentOpenDataTrade: nextOpen,
      lockedPlan: nextLocked,
      lastSavedAt: Date.now(),
    });

    await Promise.all([
      writeJson(AI_JOURNAL_STORAGE_KEYS.OPEN_TRADE, nextOpen),
      nextLocked
        ? writeJson(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN, nextLocked)
        : persistRemoveItem(AI_JOURNAL_STORAGE_KEYS.LOCKED_PLAN),
      persistFullSnapshotFromState(useTradeStore.getState()),
    ]);

    return (openChanged ? 1 : 0) + (lockedChanged ? 1 : 0);
  },
  applyCapitalMirrorFromApk: async (remote) => {
    if (Platform.OS !== 'web') return false;

    const remoteState = remote as import('../constants/capitalManagement').CapitalStatePersisted;
    const state = useTradeStore.getState();
    const localState = await loadCapitalState();

    const sameCapital =
      localState?.currentCapital === remoteState.currentCapital &&
      localState?.initialCapital === remoteState.initialCapital &&
      localState?.lastMilestoneCapital === remoteState.lastMilestoneCapital &&
      JSON.stringify(localState?.milestoneJournal ?? []) ===
        JSON.stringify(remoteState.milestoneJournal ?? state.milestoneJournal);

    if (sameCapital) return false;

    const settings = applyCapitalStateToSettings(state.settings, remoteState);
    const milestoneJournal = remoteState.milestoneJournal ?? state.milestoneJournal;

    useTradeStore.setState({
      settings,
      capitalManagement: buildCapitalManagementState(settings),
      milestoneJournal,
      lastSavedAt: Date.now(),
    });

    await persistCapitalSnapshot(settings, milestoneJournal);
    await writeJson(STORAGE_KEYS.settings, settings);
    await persistFullSnapshotFromState(useTradeStore.getState());
    return true;
  },
});

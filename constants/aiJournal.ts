/** Phase 1 — nền tảng dữ liệu journal cho AI (tách khỏi TradeJournalEntry trong scoring.ts). */

import type { FundingState } from './scoring';
import type { SqueezeDirection, SqueezeLevel } from '../types/squeezeRisk';

export const AI_JOURNAL_APP_VERSION = '1.0.4';

export const AI_JOURNAL_SCHEMA_VERSION = '2.0.0';

/**
 * Khóa lưu trữ Phase 1 — KHÔNG đổi tên khi cập nhật UI / tiêu chí chấm.
 * Chỉ thêm key mới (vd. gd1_*_v3) nếu schema breaking; migration đọc key cũ.
 */
export const AI_JOURNAL_STORAGE_KEYS = {
  TRADE_JOURNAL: 'gd1_trade_journal_v2',
  DAILY_STATS: 'gd1_daily_stats_v2',
  OPEN_TRADE: 'gd1_open_trade',
  JOURNAL_VERSION: 'gd1_journal_version',
  SKIPPED_SETUPS: 'gd1_skipped_setups',
  ACCOUNT_HISTORY: 'gd1_account_history',
  LOCKED_PLAN: 'gd1_locked_plan',
  NOTIFICATION_THROTTLE: 'gd1_notification_throttle',
} as const;

/** TTL tối đa (HIGH tier) — plan thực tế dùng calculatePlanExpiry(score). */
export const LOCKED_PLAN_MAX_TTL_MS = 12 * 3_600_000;
/** Fallback cho plan cũ thiếu expiryHours. */
export const LOCKED_PLAN_TTL_MS = LOCKED_PLAN_MAX_TTL_MS;

/** Vùng entry lưu trong locked plan (tương thích EntryZone). */
export interface StoredEntryZone {
  optimal: number;
  rangeLow: number;
  rangeHigh: number;
  type: string;
}

export type LockedPlanStatus = 'WAITING' | 'TRIGGERED' | 'CANCELLED';

/** Kế hoạch limit đã khóa — score không đổi khi giá về vùng entry. */
export interface LockedTradePlan {
  id: string;
  pendingEntryId: string;
  lockedAt: number;
  expiresAt: number;
  /** 4 / 8 / 12 — theo score lúc khóa plan */
  expiryHours?: number;
  expiryTier?: 'LOW' | 'MEDIUM' | 'HIGH';
  lockedScore: number;
  lockedDirection: JournalDirection;
  lockedScoringSnapshot: ScoringSnapshot;
  lockedCvdValue: number;
  lockedCvdTrend: CvdTrend;
  lockedSessionType: SessionType;
  entryZone: StoredEntryZone;
  limitOrderPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  symbol: string;
  status: LockedPlanStatus;
  /** Penalty health — cập nhật mỗi scan khi chờ limit */
  planHealth?: import('../types/tradePlan').PlanHealth;
}

/** Một điểm trên equity curve — sau mỗi lệnh đóng. */
export interface AccountHistoryPoint {
  timestamp: number;
  value: number;
  tradeId: string;
  pnlUSDT: number;
  symbol: string;
}

export const SKIPPED_SETUPS_ARCHIVE_LIMIT = 200;
export const SKIPPED_SETUPS_ARCHIVE_AGE_MS = 90 * 86_400_000;
export const SKIPPED_SETUPS_INSIGHTS_MIN = 3;

export const JOURNAL_ARCHIVE_LIMIT = 500;
export const JOURNAL_ARCHIVE_AGE_MS = 183 * 86_400_000; // ~6 tháng
export const STALE_OPEN_TRADE_MS = 24 * 86_400_000;
export const STALE_PENDING_ORDER_MS = 8 * 3_600_000;
export const INSIGHTS_MIN_TRADES = 3;

export type SessionType = 'GOOD' | 'MEDIUM' | 'BAD';
export type CvdTrend = 'UP' | 'DOWN' | 'FLAT';
export type JournalDirection = 'LONG' | 'SHORT';

/** Nguồn chiến lược lúc ghi journal — từ màn hình / engine khởi tạo lệnh. */
export type StrategySource = 'V3' | 'V4' | 'CVDX' | 'MANUAL';
export type TradeOutcomeStatus =
  | 'OPEN'
  | 'WIN'
  | 'LOSS'
  | 'BREAKEVEN'
  | 'CANCELLED'
  | 'PENDING';

export type TradeExitReason =
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'TP3_HIT'
  | 'SL_HIT'
  | 'MANUAL_CLOSE'
  | 'BE_CLOSE'
  | 'LIMIT_NOT_FILLED'
  | 'PLAN_EXPIRED'
  | 'PLAN_HEALTH_CANCEL';

/** Khuyến nghị Position Advisor lúc đóng lệnh */
export type PositionAdvisorActionAtExit =
  | 'HOLD_STRONG'
  | 'HOLD_CONDITIONAL'
  | 'PARTIAL_CLOSE_30'
  | 'PARTIAL_TP1'
  | 'CLOSE_NOW'
  | 'CLOSE_URGENT'
  | 'MOVE_SL_BE'
  | 'MOVE_SL_TIGHTER'
  | 'FUNDING_REVERSAL'
  | 'SQUEEZE_ALERT'
  | 'PLAN_EXPIRED'
  | 'NO_ACTIVE_ADVISOR';

export type PlanHealthAtExit = import('../types/tradePlan').PlanHealthStatus;

/** Lý do đóng lệnh do trader chọn trên dialog xác nhận */
export type ManualExitReason =
  | 'FOLLOW_ADVISOR'
  | 'TAKE_PROFIT_MANUAL'
  | 'CUT_LOSS_MANUAL'
  | 'PLAN_CHANGED'
  | 'OTHER';

/** Lý do chốt một phần — Position Advisor */
export type PartialCloseReason = 'PARTIAL_TP1' | 'PARTIAL_TP2' | 'PARTIAL_CLOSE_30';

/** Một lần chốt một phần trong lệnh OPEN */
export interface PartialCloseRecord {
  partialClosePercent: number;
  partialClosePrice: number;
  partialCloseTime: number;
  partialCloseReason: PartialCloseReason;
  /** PnL đã thực hiện trên phần margin vừa chốt */
  realizedPnlUSDT: number;
  realizedPnlPct: number;
  /** Margin (USDT) đã chốt trong lần này */
  closedSizeUsdt: number;
}

export interface LayerScoreMap {
  l1: number;
  l2: number;
  l3: number;
  l4: number;
  l5: number;
  l6: number;
  l7: number;
  l8: number;
  l9: number;
  l10: number;
}

export interface MarketSnapshot {
  entryPrice: number;
  priceAtAnalysis: number;
  slippage: number;
  cvdValue: number;
  cvdTrend: CvdTrend;
  volumeRatio: number;
  btcChangePct: number;
  fundingRate: number;
  topLSRatio: number;
  oiChangePct: number;
  sessionType: SessionType;
  hourVN: number;
}

export interface ScoringSnapshot {
  totalScore: number;
  direction: JournalDirection;
  layerScores: LayerScoreMap;
  mandatoryViolations: string[];
  decision: string;
  /** Engine chấm điểm lúc vào lệnh */
  scorerVersion?: 'v3' | 'v4';
  groupA?: number;
  groupB?: number;
  groupC?: number;
  /** L5a CVD raw score (0–2) — V4 */
  l5aScore?: number;
  /** Winrate kỳ vọng từ bảng quyết định lúc vào */
  expectedWinrate?: string;
  /** Nhãn khuyến nghị lúc vào — vd. LONG 8.3/15, STRONG LONG 10.2/15 */
  recommendationLabel?: string;
  /** Điểm hướng lệnh lúc vào (0–15) — từ engine, không tính lại trong journal */
  score?: number;
  /** TRENDING | RANGING — marketMode từ scorer/advisor path */
  marketState?: string;
}

export interface TradePlanSnapshot {
  entryZoneType: string;
  entryZoneOptimal: number;
  entryZoneRangeLow: number;
  entryZoneRangeHigh: number;
  slProposed: number;
  slActual: number;
  tp1Proposed: number;
  tp1Actual: number;
  tp2: number;
  tp3: number;
  rrProposed: number;
  sizeProposed: number;
  sizeActual: number;
  /** Margin gốc lúc mở — cố định sau lần chốt một phần đầu */
  sizeOriginal?: number;
  isSafeSL: boolean;
  /** Lý do vào lệnh — entryZone.reasoning từ trade plan lúc mở */
  openReason?: string;
}

export interface TradeOutcome {
  status: TradeOutcomeStatus;
  exitPrice?: number;
  exitTimestamp?: number;
  pnlUSDT?: number;
  pnlPct?: number;
  holdingTimeMinutes?: number;
  /** Alias — cùng giá trị holdingTimeMinutes khi đóng lệnh */
  holdDurationMinutes?: number;
  exitReason?: TradeExitReason;
  /** Nhãn lý do đóng — từ vi / formatPendingCancelLabel lúc ghi */
  closeReason?: string;
  /** Giá limit/stop/trigger đặt ban đầu (audit — không đổi sau fill). */
  limitOrderPrice?: number;
  /** Giá market tại thời điểm khớp (audit). */
  fillMarketPrice?: number;
  /** true khi actualEntryPrice ≠ limitOrderPrice do rule slippage. */
  entryAdjusted?: boolean;
  /** Timestamp đặt lệnh chờ (ms) */
  limitOrderPlacedAt?: number;
  notes?: string;
  /** Đóng offline — sync sau khi có mạng */
  offlineClose?: boolean;
  /** Grace Period đã từng chặn ≥1 maturity rule trong quá trình giữ */
  wasGracePeriodTriggered?: boolean;
}

/** Entry journal đầy đủ cho AI — không trùng tên với TradeJournalEntry (scoring.ts). */
export interface AiTradeJournalEntry {
  id: string;
  timestamp: number;
  symbol: string;
  accountSizeAtEntry: number;
  market: MarketSnapshot;
  scoring: ScoringSnapshot;
  plan: TradePlanSnapshot;
  outcome: TradeOutcome;
  tags: string[];
  version: string;
  /** Liên kết bản ghi A/B test khi vào lệnh */
  abTestRecordId?: string;
  /** V3 | V4 | CVDX | MANUAL — từ màn hình khởi tạo, không suy luận sau đó */
  strategySource?: StrategySource;
  /** Ẩn khỏi list UI nhưng vẫn tính stats */
  archived?: boolean;
  /** Runtime — đặt true khi advisor grace period chặn maturity rule */
  gracePeriodEverTriggered?: boolean;
  /** FundingState lần scan trước — V4 Position Advisor FUNDING_REVERSAL */
  lastFundingState?: FundingState;
  /** L11 squeeze level lần scan trước — V4 SQUEEZE_RISK_ALERT */
  lastSqueezeRiskLevel?: SqueezeLevel | null;
  /** L11 squeeze direction lần scan trước — V4 SQUEEZE_RISK_ALERT */
  lastSqueezeRiskDirection?: SqueezeDirection | null;
  /** V4 — funding % tại vào lệnh (null = V3 hoặc entry cũ) */
  fundingAtEntry?: number | null;
  fundingVelocityAtEntry?: number | null;
  fundingStateAtEntry?: FundingState | null;
  /** V4 — funding tại đóng lệnh */
  fundingAtExit?: number | null;
  fundingStateAtExit?: FundingState | null;
  /** L11 — squeeze risk lúc vào lệnh (V4) */
  squeezeRiskScoreAtEntry?: number | null;
  squeezeRiskLevelAtEntry?: SqueezeLevel | null;
  squeezeRiskDirectionAtEntry?: SqueezeDirection | null;
  /** L11 — squeeze risk lúc đóng lệnh (V4) */
  squeezeRiskScoreAtExit?: number | null;
  squeezeRiskLevelAtExit?: SqueezeLevel | null;
  squeezeRiskDirectionAtExit?: SqueezeDirection | null;
  /** Khuyến nghị Position Advisor lúc đóng lệnh */
  positionAdvisorActionAtExit?: PositionAdvisorActionAtExit | null;
  /** Trader có theo khuyến nghị app khi đóng */
  followedAdvisorRecommendation?: boolean | null;
  /** Quyết định scoring tại thời điểm đóng */
  scoringDecisionAtExit?: string | null;
  /** Plan health tại thời điểm đóng */
  planHealthAtExit?: PlanHealthAtExit | null;
  /** Lý do đóng do trader chọn (dialog) */
  manualExitReason?: ManualExitReason | null;
  /** Ghi chú khi chọn OTHER */
  manualExitNote?: string | null;
  /** Lịch sử chốt một phần khi lệnh còn OPEN */
  partialCloses?: PartialCloseRecord[];
  /** ADX Gate snapshot lúc vào lệnh — optional, không break entry cũ */
  adxSnapshot?: AdxJournalSnapshot;
  /** Structure SL snapshot lúc vào lệnh — optional */
  structureSLSnapshot?: StructureSLSnapshot;
  /** VWAP snapshot lúc vào lệnh — optional */
  vwapSnapshot?: VWAPSnapshot;
}

/** VWAP tại thời điểm ghi journal — từ SignalRow.vwapData + vwapSignal + vwapBonus */
export interface VWAPSnapshot {
  vwap: number;
  upperBand1: number;
  upperBand2: number;
  lowerBand1: number;
  lowerBand2: number;
  priceVsVwap: number;
  zone: string;
  isNearVwap: boolean;
  entryQuality: string;
  bonusApplied: boolean;
  bonusRaw: number;
}

/** Structure SL tại thời điểm ghi journal — từ SignalRow.structureSL */
export interface StructureSLSnapshot {
  swingPrice: number;
  swingTime: number;
  slPrice: number;
  slSource: 'STRUCTURE' | 'ATR_FALLBACK';
  bufferPct: number;
  distanceFromEntry: number;
  candlesBack: number;
}

/** ADX Gate tại thời điểm ghi journal — từ SignalRow.adxGate + adxData */
export interface AdxJournalSnapshot {
  adx1H: number;
  adx4H: number;
  adxAvg: number;
  regime: string;
  regimeStrength?: string;
  bothChoppy: boolean;
  gateResult: string;
  tpMultiplier: number;
  slMultiplier: number;
}

export interface SessionBreakdownSlice {
  trades: number;
  winRate: number;
}

export interface DailySessionStats {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  totalPnlUSDT: number;
  bestTrade: string;
  worstTrade: string;
  avgScore: number;
  avgHoldingMinutes: number;
  sessionBreakdown: {
    good: SessionBreakdownSlice;
    medium: SessionBreakdownSlice;
    bad: SessionBreakdownSlice;
  };
  layerAccuracy: LayerScoreMap;
}

export interface TodayQuickStats {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  totalPnlUSDT: number;
  openCount: number;
}

export interface WeeklyStats {
  from: string;
  to: string;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  totalPnlUSDT: number;
  avgScore: number;
  bestDay: string | null;
  worstDay: string | null;
  accountStartUSDT: number;
  accountEndUSDT: number;
  accountChangePct: number;
  bestTradeLabel: string | null;
  worstTradeLabel: string | null;
  bestLayer: string | null;
  bestLayerAccuracy: number;
}

export interface LossPattern {
  pattern: string;
  frequency: number;
  description: string;
}

export interface EntryQualityResult {
  score: number;
  assessment: string;
}

export interface ScoreRangeWinRate {
  range: string;
  trades: number;
  winRate: number;
  avgPnl: number;
}

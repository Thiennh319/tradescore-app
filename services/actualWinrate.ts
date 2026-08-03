import type { AiTradeJournalEntry } from '../constants/aiJournal';
import {
  FundingState,
  WINRATE_EXPECTED_BY_BUCKET,
  WINRATE_SAMPLE_MEANINGFUL_MIN,
  WINRATE_SAMPLE_WARN_MIN,
  getFundingStateLabel,
  type WinrateBucketId,
} from '../constants/scoring';
import { isStatsEligibleOutcome } from './journalService';
import { metricWinRatePct1 } from './intelligence/shared/metrics';
import { maybeLogTpProbabilityFilterEnableHint } from '../config/featureFlags';

export type WinrateScorerFilter = 'v3' | 'v4' | 'all';

export interface DateRange {
  from?: number;
  to?: number;
}

export interface ActualWinrateResult {
  bucketId: WinrateBucketId;
  bucketLabel: string;
  decisionHint: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winLossCount: number;
  actualWinratePct: number | null;
  expectedWinratePct: number;
  expectedLabel: string;
  deviationPct: number | null;
  sampleTooSmall: boolean;
  statisticallyWeak: boolean;
  scorerVersion: WinrateScorerFilter;
}

export interface WinrateTrendPoint {
  label: string;
  fromMs: number;
  toMs: number;
  trades: number;
  actualWinratePct: number | null;
}

function bucketDef(id: WinrateBucketId) {
  const def = WINRATE_EXPECTED_BY_BUCKET.find((b) => b.id === id);
  if (!def) throw new Error(`Unknown bucket: ${id}`);
  return def;
}

export function scoreInBucket(totalScore: number, bucketId: WinrateBucketId): boolean {
  const { min, max } = bucketDef(bucketId);
  return totalScore >= min && (max === Infinity ? true : totalScore < max);
}

export function bucketForScore(totalScore: number): WinrateBucketId | null {
  for (const b of WINRATE_EXPECTED_BY_BUCKET) {
    if (scoreInBucket(totalScore, b.id)) return b.id;
  }
  return null;
}

function filterJournalEntries(
  entries: AiTradeJournalEntry[],
  scorerVersion: WinrateScorerFilter,
  dateRange?: DateRange,
): AiTradeJournalEntry[] {
  const from = dateRange?.from ?? 0;
  const to = dateRange?.to ?? Date.now();

  return entries.filter((e) => {
    if (e.archived) return false;
    if (!isStatsEligibleOutcome(e.outcome.status)) return false;
    const closedAt = e.outcome.exitTimestamp ?? e.timestamp;
    if (closedAt < from || closedAt > to) return false;
    if (scorerVersion === 'all') return true;
    return e.scoring.scorerVersion === scorerVersion;
  });
}

function aggregateBucket(
  bucketId: WinrateBucketId,
  entries: AiTradeJournalEntry[],
  scorerVersion: WinrateScorerFilter,
): ActualWinrateResult {
  const def = bucketDef(bucketId);
  const bucket = entries.filter((e) => scoreInBucket(e.scoring.totalScore, bucketId));

  const wins = bucket.filter((e) => e.outcome.status === 'WIN').length;
  const losses = bucket.filter((e) => e.outcome.status === 'LOSS').length;
  const breakevens = bucket.filter((e) => e.outcome.status === 'BREAKEVEN').length;
  const winLossCount = wins + losses;
  const actualWinratePct =
    winLossCount > 0 ? metricWinRatePct1(wins, winLossCount) : null;
  const deviationPct =
    actualWinratePct != null
      ? Math.round((actualWinratePct - def.expectedWinratePct) * 10) / 10
      : null;

  return {
    bucketId,
    bucketLabel: def.label,
    decisionHint: def.decisionHint,
    totalTrades: bucket.length,
    wins,
    losses,
    breakevens,
    winLossCount,
    actualWinratePct,
    expectedWinratePct: def.expectedWinratePct,
    expectedLabel: def.expectedLabel,
    deviationPct,
    sampleTooSmall: bucket.length < WINRATE_SAMPLE_WARN_MIN,
    statisticallyWeak: bucket.length < WINRATE_SAMPLE_MEANINGFUL_MIN,
    scorerVersion,
  };
}

/** Winrate thực tế theo bucket điểm — so sánh với kỳ vọng thiết kế. */
export function calculateActualWinrate(
  decisionBucket: WinrateBucketId,
  scorerVersion: WinrateScorerFilter,
  entries: AiTradeJournalEntry[],
  dateRange?: DateRange,
): ActualWinrateResult {
  const filtered = filterJournalEntries(entries, scorerVersion, dateRange);
  return aggregateBucket(decisionBucket, filtered, scorerVersion);
}

export function calculateAllBucketWinrates(
  entries: AiTradeJournalEntry[],
  scorerVersion: WinrateScorerFilter,
  dateRange?: DateRange,
): ActualWinrateResult[] {
  const filtered = filterJournalEntries(entries, scorerVersion, dateRange);
  return WINRATE_EXPECTED_BY_BUCKET.map((b) =>
    aggregateBucket(b.id, filtered, scorerVersion),
  );
}

/** Winrate thực tế theo cửa sổ thời gian (7d = theo ngày, 30d = theo tuần). */
export function getWinrateTrendByBucket(
  entries: AiTradeJournalEntry[],
  bucketId: WinrateBucketId,
  scorerVersion: WinrateScorerFilter,
  days: 7 | 30,
): WinrateTrendPoint[] {
  const now = Date.now();
  const from = now - days * 86_400_000;
  const filtered = filterJournalEntries(entries, scorerVersion, { from, to: now }).filter((e) =>
    scoreInBucket(e.scoring.totalScore, bucketId),
  );

  const segmentMs = days === 7 ? 86_400_000 : 7 * 86_400_000;
  const segmentCount = days === 7 ? 7 : Math.ceil(30 / 7);

  const points: WinrateTrendPoint[] = [];
  for (let i = segmentCount - 1; i >= 0; i--) {
    const segStart = now - (i + 1) * segmentMs;
    const segEnd = now - i * segmentMs;
    const slice = filtered.filter((e) => {
      const t = e.outcome.exitTimestamp ?? e.timestamp;
      return t >= segStart && t < segEnd;
    });
    const wins = slice.filter((e) => e.outcome.status === 'WIN').length;
    const losses = slice.filter((e) => e.outcome.status === 'LOSS').length;
    const wl = wins + losses;
    const label =
      days === 7
        ? new Date(segEnd - segmentMs / 2).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
          })
        : `T-${i + 1}`;

    points.push({
      label,
      fromMs: segStart,
      toMs: segEnd,
      trades: slice.length,
      actualWinratePct: wl > 0 ? metricWinRatePct1(wins, wl) : null,
    });
  }
  return points;
}

export interface BucketEngineComparison {
  bucketId: WinrateBucketId;
  bucketLabel: string;
  v3: ActualWinrateResult | null;
  v4: ActualWinrateResult | null;
}

export type FundingStateWinrateFilter = FundingState | 'all';

export interface FundingStateWinrateRow {
  fundingState: FundingState;
  label: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winLossCount: number;
  actualWinratePct: number | null;
  sampleTooSmall: boolean;
  /** Lệnh V3 hoặc thiếu fundingStateAtEntry — không tính vào bucket này */
  naCount: number;
}

const FUNDING_STATE_ORDER: FundingState[] = [
  FundingState.SHORT_SQUEEZE_BUILDING,
  FundingState.SHORT_EUPHORIA_FADING,
  FundingState.NEUTRAL,
  FundingState.LONG_EUPHORIA_FADING,
  FundingState.LONG_FUNDING_ELEVATED,
  FundingState.EXTREME_LONG_EUPHORIA,
];

function fundingStateLabel(state: FundingState): string {
  return getFundingStateLabel(state).text;
}

/** Winrate theo fundingStateAtEntry — chỉ lệnh V4 có state hợp lệ. */
export function calculateWinrateByFundingStateAtEntry(
  entries: AiTradeJournalEntry[],
  scorerVersion: WinrateScorerFilter,
  dateRange?: DateRange,
): FundingStateWinrateRow[] {
  const allEligible = entries.filter(
    (e) => !e.archived && isStatsEligibleOutcome(e.outcome.status),
  );
  const naCount = allEligible.filter(
    (e) => e.scoring.scorerVersion !== 'v4' || e.fundingStateAtEntry == null,
  ).length;
  const filtered = filterJournalEntries(entries, scorerVersion, dateRange);

  if (scorerVersion === 'v3') {
    return FUNDING_STATE_ORDER.map((state) => ({
      fundingState: state,
      label: fundingStateLabel(state),
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winLossCount: 0,
      actualWinratePct: null,
      sampleTooSmall: true,
      naCount,
    }));
  }

  return FUNDING_STATE_ORDER.map((state) => {
    const bucket = filtered.filter(
      (e) => e.scoring.scorerVersion === 'v4' && e.fundingStateAtEntry === state,
    );
    const wins = bucket.filter((e) => e.outcome.status === 'WIN').length;
    const losses = bucket.filter((e) => e.outcome.status === 'LOSS').length;
    const breakevens = bucket.filter((e) => e.outcome.status === 'BREAKEVEN').length;
    const winLossCount = wins + losses;
    const actualWinratePct =
      winLossCount > 0 ? metricWinRatePct1(wins, winLossCount) : null;

    return {
      fundingState: state,
      label: fundingStateLabel(state),
      totalTrades: bucket.length,
      wins,
      losses,
      breakevens,
      winLossCount,
      actualWinratePct,
      sampleTooSmall: bucket.length < WINRATE_SAMPLE_WARN_MIN,
      naCount,
    };
  });
}

/** Một dòng tóm tắt cho filter state cụ thể (dùng UI). */
export function summarizeFundingStateWinrate(
  rows: FundingStateWinrateRow[],
  filterState: FundingStateWinrateFilter,
): { summary: string; isNA: boolean } {
  if (filterState === 'all') {
    const withData = rows.filter((r) => r.totalTrades > 0);
    if (withData.length === 0) {
      return { summary: 'Chưa có lệnh V4 với Funding State', isNA: false };
    }
    return {
      summary: `${withData.length} trạng thái có dữ liệu — xem bảng bên dưới`,
      isNA: false,
    };
  }
  const row = rows.find((r) => r.fundingState === filterState);
  if (!row) {
    return { summary: 'N/A', isNA: true };
  }
  if (row.totalTrades === 0) {
    return {
      summary: `Các lệnh vào khi ${filterState}: 0 lệnh — N/A`,
      isNA: true,
    };
  }
  const wr = row.actualWinratePct != null ? `${row.actualWinratePct}%` : 'N/A';
  const stateKey = filterState;
  return {
    summary: `Các lệnh vào khi ${stateKey}: ${row.totalTrades} lệnh, winrate ${wr}`,
    isNA: row.actualWinratePct == null,
  };
}

const SQUEEZE_LEVEL_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] as const;

export interface SqueezeLevelWinrateRow {
  level: (typeof SQUEEZE_LEVEL_ORDER)[number];
  label: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winLossCount: number;
  actualWinratePct: number | null;
  sampleTooSmall: boolean;
  naCount: number;
}

/** Winrate theo squeezeRiskLevelAtEntry — chỉ lệnh V4 có level hợp lệ. */
export function calculateWinrateBySqueezeLevel(
  entries: AiTradeJournalEntry[],
  scorerVersion: WinrateScorerFilter,
  dateRange?: DateRange,
): SqueezeLevelWinrateRow[] {
  const allEligible = entries.filter(
    (e) => !e.archived && isStatsEligibleOutcome(e.outcome.status),
  );
  maybeLogTpProbabilityFilterEnableHint(allEligible.length);
  const naCount = allEligible.filter(
    (e) => e.scoring.scorerVersion !== 'v4' || e.squeezeRiskLevelAtEntry == null,
  ).length;
  const filtered = filterJournalEntries(entries, scorerVersion, dateRange);

  if (scorerVersion === 'v3') {
    return SQUEEZE_LEVEL_ORDER.map((level) => ({
      level,
      label: level,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      winLossCount: 0,
      actualWinratePct: null,
      sampleTooSmall: true,
      naCount,
    }));
  }

  return SQUEEZE_LEVEL_ORDER.map((level) => {
    const bucket = filtered.filter(
      (e) => e.scoring.scorerVersion === 'v4' && e.squeezeRiskLevelAtEntry === level,
    );
    const wins = bucket.filter((e) => e.outcome.status === 'WIN').length;
    const losses = bucket.filter((e) => e.outcome.status === 'LOSS').length;
    const breakevens = bucket.filter((e) => e.outcome.status === 'BREAKEVEN').length;
    const winLossCount = wins + losses;
    const actualWinratePct =
      winLossCount > 0 ? metricWinRatePct1(wins, winLossCount) : null;

    return {
      level,
      label: level,
      totalTrades: bucket.length,
      wins,
      losses,
      breakevens,
      winLossCount,
      actualWinratePct,
      sampleTooSmall: bucket.length < WINRATE_SAMPLE_WARN_MIN,
      naCount,
    };
  });
}

export function squeezeLevelSampleWarning(n: number): string {
  return `⚠️ Chưa đủ mẫu (n=${n})`;
}

/** So sánh V3 vs V4 cùng bucket khi có đủ dữ liệu. */
export function compareEnginesByBucket(
  entries: AiTradeJournalEntry[],
  dateRange?: DateRange,
): BucketEngineComparison[] {
  return WINRATE_EXPECTED_BY_BUCKET.map((b) => {
    const v3 = calculateActualWinrate(b.id, 'v3', entries, dateRange);
    const v4 = calculateActualWinrate(b.id, 'v4', entries, dateRange);
    return {
      bucketId: b.id,
      bucketLabel: b.label,
      v3: v3.totalTrades > 0 ? v3 : null,
      v4: v4.totalTrades > 0 ? v4 : null,
    };
  });
}

export interface AdvisorFollowRow {
  key: string;
  label: string;
  trades: number;
  wins: number;
  winratePct: number | null;
  hasData: boolean;
}

function advisorRowStats(
  key: string,
  label: string,
  subset: AiTradeJournalEntry[],
): AdvisorFollowRow {
  const wins = subset.filter((e) => e.outcome.status === 'WIN').length;
  const losses = subset.filter((e) => e.outcome.status === 'LOSS').length;
  const wl = wins + losses;
  return {
    key,
    label,
    trades: subset.length,
    wins,
    winratePct: wl > 0 ? metricWinRatePct1(wins, wl) : null,
    hasData: subset.length > 0,
  };
}

const CLOSE_ADVISOR_ACTIONS = new Set([
  'PARTIAL_CLOSE_30',
  'PARTIAL_TP1',
  'CLOSE_NOW',
  'CLOSE_URGENT',
  'FUNDING_REVERSAL',
  'SQUEEZE_ALERT',
  'PLAN_EXPIRED',
]);

const HOLD_ADVISOR_ACTIONS = new Set([
  'HOLD_STRONG',
  'HOLD_CONDITIONAL',
  'MOVE_SL_BE',
  'MOVE_SL_TIGHTER',
]);

/** Phân tích trader có theo khuyến nghị Position Advisor khi đóng lệnh. */
export function calculateAdvisorFollowStats(
  entries: AiTradeJournalEntry[],
): AdvisorFollowRow[] {
  const closed = entries.filter(
    (e) => !e.archived && isStatsEligibleOutcome(e.outcome.status),
  );

  return [
    advisorRowStats(
      'follow',
      'Theo app (followed=true)',
      closed.filter((e) => e.followedAdvisorRecommendation === true),
    ),
    advisorRowStats(
      'against',
      'Ngược app (followed=false)',
      closed.filter((e) => e.followedAdvisorRecommendation === false),
    ),
    advisorRowStats(
      'app_suggest_close',
      'App đề xuất Close/Partial',
      closed.filter(
        (e) =>
          e.positionAdvisorActionAtExit != null &&
          CLOSE_ADVISOR_ACTIONS.has(e.positionAdvisorActionAtExit),
      ),
    ),
    advisorRowStats(
      'app_suggest_hold',
      'App đề xuất Hold/SL',
      closed.filter(
        (e) =>
          e.positionAdvisorActionAtExit != null &&
          HOLD_ADVISOR_ACTIONS.has(e.positionAdvisorActionAtExit),
      ),
    ),
    advisorRowStats(
      'hold_but_trader_closed',
      'App HOLD → trader tự đóng (ngược)',
      closed.filter(
        (e) =>
          (e.positionAdvisorActionAtExit === 'HOLD_STRONG' ||
            e.positionAdvisorActionAtExit === 'HOLD_CONDITIONAL') &&
          e.followedAdvisorRecommendation === false,
      ),
    ),
  ];
}

export function countAdvisorExitNa(entries: AiTradeJournalEntry[]): number {
  return entries.filter(
    (e) =>
      !e.archived &&
      isStatsEligibleOutcome(e.outcome.status) &&
      (e.positionAdvisorActionAtExit == null || e.followedAdvisorRecommendation == null),
  ).length;
}

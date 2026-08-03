/**
 * Task 14.2 — Statistics Intelligence types (Rule #69 single metric home).
 * Data source: AiTradeJournalEntry (TI View) only.
 */

export const RULE_69_SINGLE_METRIC_DEFINITION = 69 as const;

/** Shared group metrics — produced only by Statistics Intelligence. */
export type StatisticsGroupMetrics = {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number | null;
  pnlUsdt: number | null;
  averageRr: number | null;
  avgHoldingMinutes: number | null;
  profitFactor: number | null;
  expectancyUsdt: number | null;
  averageWinUsdt: number | null;
  averageLossUsdt: number | null;
  /** Advisor-only */
  occurrences?: number;
  successRate?: number | null;
  averageProfitUsdt?: number | null;
};

export type StatisticsOverview = {
  totalTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  netPnlUsdt: number | null;
  grossProfitUsdt: number | null;
  grossLossUsdt: number | null;
  averageRr: number | null;
  averageHoldingMinutes: number | null;
};

export type StatisticsProfitMetrics = {
  profitFactor: number | null;
  expectancyUsdt: number | null;
  averageWinUsdt: number | null;
  averageLossUsdt: number | null;
  largestWinUsdt: number | null;
  largestLossUsdt: number | null;
  averageTradeUsdt: number | null;
  medianTradeUsdt: number | null;
};

export type StatisticsDrawdownMetrics = {
  currentDrawdownUsdt: number | null;
  maxDrawdownUsdt: number | null;
  recoveryFactor: number | null;
  longestLosingStreak: number;
  longestWinningStreak: number;
};

export type StatisticsTimeBucket = StatisticsGroupMetrics & {
  period: 'day' | 'week' | 'month' | 'session';
};

export type StatisticsTagComboRow = StatisticsGroupMetrics & {
  tags: string[];
};

export type StatisticsViewModel = {
  overview: StatisticsOverview;
  profit: StatisticsProfitMetrics;
  drawdown: StatisticsDrawdownMetrics;
  byCoin: StatisticsGroupMetrics[];
  byStrategy: StatisticsGroupMetrics[];
  byTrigger: StatisticsGroupMetrics[];
  byConfidence: StatisticsGroupMetrics[];
  byAdvisor: StatisticsGroupMetrics[];
  byTag: StatisticsGroupMetrics[];
  byTagCombo: StatisticsTagComboRow[];
  byDay: StatisticsTimeBucket[];
  byWeek: StatisticsTimeBucket[];
  byMonth: StatisticsTimeBucket[];
  bySessionZone: StatisticsTimeBucket[];
  /** Legacy/session GOOD·MEDIUM·BAD */
  bySessionType: StatisticsGroupMetrics[];
  byFunding: StatisticsGroupMetrics[];
  byWhale: StatisticsGroupMetrics[];
  sampleSize: number;
  projectionFingerprint: string;
  cancelledCount: number;
};

/** Accumulator used by O(n) aggregator — not exported as public metric API. */
export type GroupAcc = {
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  pnlSum: number;
  pnlCount: number;
  rrSum: number;
  rrCount: number;
  holdSum: number;
  holdCount: number;
  grossProfit: number;
  grossLoss: number;
  occurrences: number;
  successHits: number;
};

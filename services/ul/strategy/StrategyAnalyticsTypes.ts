/**
 * Task 15.6 — Strategy Analytics types.
 * Strategy performance only. No psychology / entry quality. No AI.
 */

export const STRATEGY_ANALYTICS_VERSION = 1 as const;

export type StrategyStatus =
  | 'Excellent'
  | 'Healthy'
  | 'Watch'
  | 'Weak'
  | 'Deprecated'
  | 'Disabled';

export type StrategyGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export type StrategyLifecycle =
  | 'New'
  | 'Growing'
  | 'Stable'
  | 'Declining'
  | 'Deprecated';

export type StrategyTrendTag =
  | 'Best Strategy'
  | 'Worst Strategy'
  | 'Improving Strategy'
  | 'Declining Strategy'
  | 'Stable Strategy'
  | 'Dead Strategy'
  | 'Overfit Strategy';

export type StrategyAnalyticsRow = {
  id: string;
  name: string;
  tradeCount: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  averageRR: number | null;
  netPnL: number;
  largestWin: number | null;
  largestLoss: number | null;
  maxDrawdown: number;
  recoveryFactor: number | null;
  consistency: number;
  performance: number;
  stability: number;
  confidence: number;
  score: number;
  grade: StrategyGrade;
  status: StrategyStatus;
  lifecycle: StrategyLifecycle;
  recommendation: string;
  tags: readonly StrategyTrendTag[];
};

export type StrategyRankingEntry = {
  rank: number;
  strategyId: string;
  name: string;
  score: number;
  profitFactor: number;
  expectancy: number;
  tradeCount: number;
};

export type StrategyHeatmapCell = {
  key: string;
  /** Dimension value: hour 0-23, weekday 0-6, side, or coin symbol. */
  bucket: string;
  trades: number;
  pnl: number;
};

export type StrategyHeatmap = {
  hour: readonly StrategyHeatmapCell[];
  weekday: readonly StrategyHeatmapCell[];
  market: readonly StrategyHeatmapCell[];
  coin: readonly StrategyHeatmapCell[];
};

export type StrategyAnalyticsSummary = {
  strategyCount: number;
  totalTrades: number;
  headline: string;
  bestStrategyId: string | null;
  worstStrategyId: string | null;
};

export type StrategyAnalyticsReport = {
  version: typeof STRATEGY_ANALYTICS_VERSION;
  summary: StrategyAnalyticsSummary;
  strategies: readonly StrategyAnalyticsRow[];
  ranking: readonly StrategyRankingEntry[];
  bestStrategy: StrategyAnalyticsRow | null;
  worstStrategy: StrategyAnalyticsRow | null;
  heatmap: StrategyHeatmap;
  lifecycle: readonly { strategyId: string; lifecycle: StrategyLifecycle }[];
  confidence: number;
};

/**
 * Task 15.0.2 — Performance Dashboard ViewModel (compatibility facade).
 * Pure display shape for future HT bind. No UL types leak to UI.
 */

export const PERFORMANCE_DASHBOARD_VM_VERSION = 1 as const;

/** Display risk level — matches DashboardRiskLevel casing. */
export type PerformanceRiskLevelDisplay =
  | 'Low'
  | 'Medium'
  | 'High'
  | 'Critical'
  | 'Unknown';

export type PerformanceSummaryVM = {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  netPnl: number;
  averageRr: number | null;
  averageWinner: number | null;
  averageLoser: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  averageHoldingTime: number | null;
  maxDrawdown: number;
  currentDrawdown: number;
  recoveryFactor: number | null;
  calmarRatio: number | null;
  consistencyScore: number;
  stabilityScore: number;
  performanceScore: number;
  grade: string;
  riskLevel: PerformanceRiskLevelDisplay;
};

export type PerformanceCoinRowVM = {
  rank: number;
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  averageRr: number | null;
  expectancy: number;
  score: number;
};

export type PerformanceCoinTableVM = {
  rows: readonly PerformanceCoinRowVM[];
  bestCoin: string | null;
  worstCoin: string | null;
};

export type PerformanceRecommendationItemVM = {
  id: string;
  priority: string;
  title: string;
  description: string;
  reason: string;
  severity: string;
  action: string;
  /** Flattened for panels that expect evidence[]. */
  evidence: readonly string[];
  target: string;
};

export type PerformanceRecommendationPanelVM = {
  items: readonly PerformanceRecommendationItemVM[];
};

export type PerformanceRiskWidgetVM = {
  level: PerformanceRiskLevelDisplay;
  score: number;
  summary: string;
  drawdown: number | null;
  winRate: number | null;
  profitFactor: number | null;
  recoveryFactor: number | null;
  consistency: number | null;
};

export type PerformanceEquityPointVM = {
  index: number;
  equity: number;
  pnl: number;
  closedAt: number;
};

export type PerformanceEquityChartVM = {
  data: readonly PerformanceEquityPointVM[];
};

export type PerformanceDailyPointVM = {
  dayKey: string;
  pnl: number;
  trades: number;
};

export type PerformanceDailyChartVM = {
  data: readonly PerformanceDailyPointVM[];
};

export type PerformanceScoreWidgetVM = {
  performanceScore: number;
  consistencyScore: number;
  stabilityScore: number;
  riskScore: number;
  expectancyScore: number;
  grade: string;
};

export type PerformanceInsightCardVM = {
  id: string;
  title: string;
  subtitle: string;
  value: string;
  tint: string;
};

export type PerformancePatternsVM = {
  winningStreak: number;
  losingStreak: number;
  bestTradingHour: number | null;
  worstTradingHour: number | null;
  bestWeekday: number | null;
  worstWeekday: number | null;
  bestStrategy: string | null;
  worstStrategy: string | null;
  averageTradeDuration: number | null;
};

/**
 * Compatibility ViewModel for Performance HT (Task 15.1 bind target).
 * UI reads this shape only — never ULDashboardData.
 */
export type PerformanceDashboardViewModel = {
  version: typeof PERFORMANCE_DASHBOARD_VM_VERSION;
  generatedAt: string;
  tradeCount: number;
  fingerprint: string;
  summary: PerformanceSummaryVM;
  coinPerformance: PerformanceCoinTableVM;
  recommendationPanel: PerformanceRecommendationPanelVM;
  riskWidget: PerformanceRiskWidgetVM;
  equityChart: PerformanceEquityChartVM;
  dailyChart: PerformanceDailyChartVM;
  scoreWidget: PerformanceScoreWidgetVM;
  insightCards: readonly PerformanceInsightCardVM[];
  patterns: PerformancePatternsVM;
};

export type DeepReadonlyPerformanceDashboardVM = Readonly<PerformanceDashboardViewModel>;

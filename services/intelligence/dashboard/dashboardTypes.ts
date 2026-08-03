/**
 * Task 14.4 — Dashboard Intelligence types.
 * Rules #93–#100 · Presentation only · Performance ViewModel ONLY.
 */

export const RULE_93_DASHBOARD_READ_ONLY = 93 as const;
export const RULE_94_NEVER_CALCULATES = 94 as const;
export const RULE_95_NEVER_AGGREGATES = 95 as const;
export const RULE_96_PERFORMANCE_VM_ONLY = 96 as const;
export const RULE_97_WIDGETS_STATELESS = 97 as const;
export const RULE_98_STABLE_WIDGET_IDS = 98 as const;
export const RULE_99_DASHBOARD_SNAPSHOT = 99 as const;
export const RULE_100_DASHBOARD_CACHE = 100 as const;

export const DASHBOARD_VERSION = 1 as const;

export type DashboardHealthLabel = 'Excellent' | 'Good' | 'Warning' | 'Critical' | 'Unknown';

export type DashboardRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown';

export type DashboardTradingStatus = 'ACTIVE' | 'IDLE' | 'CAUTION' | 'UNKNOWN';

export type DashboardFilterPeriod = 'today' | 'week' | 'month' | 'all';

export type DashboardFilter = {
  period: DashboardFilterPeriod;
  coin: string | null;
  strategy: string | null;
  tag: string | null;
};

export const DEFAULT_DASHBOARD_FILTER: DashboardFilter = {
  period: 'all',
  coin: null,
  strategy: null,
  tag: null,
};

export type DashboardSnapshotMeta = {
  dashboardVersion: typeof DASHBOARD_VERSION;
  performanceVersion: number;
  statisticsVersion: number;
  recommendationVersion: number;
  projectionFingerprint: string;
  performanceFingerprint: string;
  generatedAt: string;
};

export type TradingSummaryWidget = {
  overallGrade: string;
  overallScore: number | null;
  systemHealth: DashboardHealthLabel;
  tradingStatus: DashboardTradingStatus;
  generatedAt: string;
};

export type TodayPerformanceWidget = {
  /** Copied / labeled from Performance trends — null if VM has no day slice */
  todayTrades: number | null;
  todayWinrate: number | null;
  todayNetPnl: number | null;
  todayRr: number | null;
  todayBestCoin: string | null;
  todayWorstCoin: string | null;
  sourceWindow: string;
};

export type TopPicksWidget = {
  topStrategy: string | null;
  topCoin: string | null;
  topTrigger: string | null;
  topConfidence: string | null;
  topAdvisor: string | null;
  topTag: string | null;
};

export type RiskMonitorWidget = {
  currentDrawdownLabel: string | null;
  recoveryTrend: string | null;
  largestLosingStreakLabel: string | null;
  riskLevel: DashboardRiskLevel;
  stability: number | null;
  consistency: number | null;
};

export type RecommendationPanelWidget = {
  items: {
    id: string;
    action: string;
    target: string;
    reason: string;
    evidence: string[];
  }[];
  recommendationVersion: number;
};

export type TrendPanelWidget = {
  window: string;
  winrateTrend: string;
  pnlTrend: string;
  drawdownTrend: string;
};

export type QuickStatisticsWidget = {
  trades: number | null;
  winrate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  averageRr: number | null;
  holdingTime: number | null;
  /** Provenance — from Performance ranking row, not recalculated */
  sourceKey: string;
};

export type DashboardWidget = {
  id: string;
  title: string;
  section: number;
};

export type DashboardViewModel = {
  tradingSummary: TradingSummaryWidget;
  todayPerformance: TodayPerformanceWidget;
  systemHealth: DashboardHealthLabel;
  topPicks: TopPicksWidget;
  riskMonitor: RiskMonitorWidget;
  recommendationPanel: RecommendationPanelWidget;
  recentTrends: TrendPanelWidget[];
  activeInsights: string[];
  quickStatistics: QuickStatisticsWidget;
  filter: DashboardFilter;
  widgets: DashboardWidget[];
  snapshot: DashboardSnapshotMeta;
};

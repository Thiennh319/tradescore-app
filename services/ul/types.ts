/**
 * Task 15.0.1 — UL Analytics Engine types + extension contract.
 * Pure domain types. No React / UI / Trade Engine imports.
 */

export type UlSide = 'LONG' | 'SHORT';

export type UlRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type UlRecommendationSeverity = 'INFO' | 'WARN' | 'CRITICAL';

/** UI sorts by this order: CRITICAL → HIGH → MEDIUM → LOW → INFO */
export type UlRecommendationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFO';

export type UlGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

/** Normalized closed-trade input for UL Analytics. */
export type ULTradeInput = {
  id?: string;
  symbol: string;
  side: UlSide;
  entry: number;
  exit: number;
  pnl: number;
  /** Realized or planned RR (>0). Null if unknown. */
  rr: number | null;
  /** Holding time in minutes. */
  duration: number;
  strategy: string;
  openedAt: number;
  closedAt: number;
  reasonOpen: string;
  reasonClose: string;
};

export type ULCoreMetrics = {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  /** Empty → 0 (Task 15.0.1 null-safety). */
  winRate: number;
  /** Empty → 0. */
  profitFactor: number;
  /** Empty → 0. */
  expectancy: number;
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
  /** Base performance pillar (0–100) before weighted blend. */
  performanceScore: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
};

export type ULCoinStats = {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  averageRr: number | null;
  expectancy: number;
  rank: number;
  score: number;
};

export type ULCoinAnalysis = {
  rows: ULCoinStats[];
  bestCoin: string | null;
  worstCoin: string | null;
};

export type ULPatternAnalysis = {
  winningStreak: number;
  losingStreak: number;
  bestTradingHour: number | null;
  worstTradingHour: number | null;
  bestWeekday: number | null;
  worstWeekday: number | null;
  bestStrategy: string | null;
  worstStrategy: string | null;
  averageTradeDuration: number | null;
  pnlByHour: ReadonlyArray<{ hour: number; pnl: number; trades: number }>;
  pnlByWeekday: ReadonlyArray<{ weekday: number; pnl: number; trades: number }>;
};

export type ULRiskAnalysis = {
  riskLevel: UlRiskLevel;
  /** 0–100 (higher = more risk). */
  score: number;
  factors: {
    drawdown: number | null;
    winRate: number | null;
    profitFactor: number | null;
    recoveryFactor: number | null;
    consistency: number | null;
  };
  summary: string;
};

export type ULRecommendation = {
  id: string;
  priority: UlRecommendationPriority;
  title: string;
  description: string;
  reason: string;
  severity: UlRecommendationSeverity;
  action: string;
};

export type ULScoreBreakdown = {
  /** Final weighted score (integer 0–100). */
  performanceScore: number;
  consistencyScore: number;
  stabilityScore: number;
  riskScore: number;
  expectancyScore: number;
  grade: UlGrade;
};

export type ULChartPoint = {
  index: number;
  equity: number;
  pnl: number;
  closedAt: number;
};

export type ULCharts = {
  equityCurve: ULChartPoint[];
  dailyPnl: ReadonlyArray<{ dayKey: string; pnl: number; trades: number }>;
};

export type ULInsightCard = {
  id: string;
  title: string;
  subtitle: string;
  value: string;
  tint: 'green' | 'red' | 'amber' | 'blue' | 'purple';
};

export type ULDashboardKPI = {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  netPnl: number;
  performanceScore: number;
  grade: UlGrade;
  riskLevel: UlRiskLevel;
};

/** Full dashboard payload produced by ULAnalyticsEngine. */
export type ULDashboardData = {
  version: typeof UL_ANALYTICS_VERSION;
  generatedAt: string;
  tradeCount: number;
  /** Stable hash of sanitized trades. Same fingerprint → same analytics. */
  fingerprint: string;
  kpi: ULDashboardKPI;
  metrics: ULCoreMetrics;
  charts: ULCharts;
  coinTable: ULCoinAnalysis;
  patterns: ULPatternAnalysis;
  risk: ULRiskAnalysis;
  score: ULScoreBreakdown;
  insights: ULInsightCard[];
  recommendations: ULRecommendation[];
};

/**
 * Future plug-in — may extend dashboard without modifying core layers.
 * Plugins must not call reverse into earlier layers.
 */
export interface ULAnalyzerPlugin {
  analyze(
    dashboard: ULDashboardData,
    trades: readonly ULTradeInput[],
  ): Partial<ULDashboardData>;
}

export type ULBuildOptions = {
  /** Required for wall-clock stamp; engine never calls Date.now()/new Date(). */
  generatedAt?: string;
  /** Optional plug-ins (Session / Funding / Whale / …). */
  plugins?: readonly ULAnalyzerPlugin[];
  /** When true, skip module cache (default false). */
  bypassCache?: boolean;
};

export const UL_ANALYTICS_VERSION = 1 as const;

/** Recommendation priority rank for UI sort (lower = higher priority). */
export const UL_RECOMMENDATION_PRIORITY_RANK: Record<UlRecommendationPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

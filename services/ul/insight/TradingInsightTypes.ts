/**
 * Task 15.3 — Trading Insight Engine types.
 * Deterministic analytics insights. No AI / React / UI.
 */

export const TRADING_INSIGHT_VERSION = 1 as const;

export type TradingInsightCategory =
  | 'Performance'
  | 'Risk'
  | 'Psychology'
  | 'Strategy'
  | 'Market'
  | 'Coin'
  | 'Timing'
  | 'Execution'
  | 'Consistency';

export type TradingInsightSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TradingInsight = {
  id: string;
  title: string;
  description: string;
  category: TradingInsightCategory;
  severity: TradingInsightSeverity;
  /** 0–100 */
  confidence: number;
  evidence: readonly string[];
  recommendation: string;
};

export type TradingInsightBucket =
  | 'strengths'
  | 'weaknesses'
  | 'opportunities'
  | 'warnings';

export type TradingInsightSummary = {
  headline: string;
  insightCount: number;
  strengthCount: number;
  weaknessCount: number;
  opportunityCount: number;
  warningCount: number;
  topSeverity: TradingInsightSeverity | null;
};

export type TradingInsightReport = {
  version: typeof TRADING_INSIGHT_VERSION;
  summary: TradingInsightSummary;
  insights: readonly TradingInsight[];
  strengths: readonly TradingInsight[];
  weaknesses: readonly TradingInsight[];
  opportunities: readonly TradingInsight[];
  warnings: readonly TradingInsight[];
};

export const TRADING_INSIGHT_SEVERITY_RANK: Record<TradingInsightSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

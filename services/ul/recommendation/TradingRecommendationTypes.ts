/**
 * Task 15.4 — Trading Recommendation Engine types.
 * Deterministic mapping from insights → actions. No AI / React / UI.
 */

export const TRADING_RECOMMENDATION_VERSION = 1 as const;

export type TradingRecommendationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFO';

export type TradingRecommendationImpact = 'HIGH' | 'MEDIUM' | 'LOW';

export type TradingRecommendationEffort = 'EASY' | 'MEDIUM' | 'HARD';

export type TradingRecommendationExpectedBenefit =
  | 'Win Rate'
  | 'Profit Factor'
  | 'Expectancy'
  | 'Risk'
  | 'Drawdown'
  | 'Consistency'
  | 'Discipline'
  | 'Execution';

export type TradingRecommendationCategory =
  | 'Risk'
  | 'Performance'
  | 'Coin'
  | 'Timing'
  | 'Execution'
  | 'Strategy'
  | 'Psychology'
  | 'Portfolio';

export type TradingRecommendation = {
  id: string;
  title: string;
  description: string;
  reason: string;
  priority: TradingRecommendationPriority;
  confidence: number;
  impact: TradingRecommendationImpact;
  effort: TradingRecommendationEffort;
  expectedBenefit: TradingRecommendationExpectedBenefit;
  category: TradingRecommendationCategory;
  action: string;
  evidence: readonly string[];
  /** Source insight id(s). */
  sourceInsightIds: readonly string[];
};

export type TradingRecommendationSummary = {
  headline: string;
  total: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
};

export type TradingRecommendationReport = {
  version: typeof TRADING_RECOMMENDATION_VERSION;
  summary: TradingRecommendationSummary;
  recommendations: readonly TradingRecommendation[];
  critical: readonly TradingRecommendation[];
  high: readonly TradingRecommendation[];
  medium: readonly TradingRecommendation[];
  low: readonly TradingRecommendation[];
};

export const TRADING_RECOMMENDATION_PRIORITY_RANK: Record<
  TradingRecommendationPriority,
  number
> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export const TRADING_RECOMMENDATION_IMPACT_RANK: Record<TradingRecommendationImpact, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

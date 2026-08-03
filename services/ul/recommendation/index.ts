/**
 * Task 15.4 — Trading Recommendation Engine public API.
 */

export {
  TRADING_RECOMMENDATION_VERSION,
  TRADING_RECOMMENDATION_PRIORITY_RANK,
  TRADING_RECOMMENDATION_IMPACT_RANK,
} from './TradingRecommendationTypes';
export type {
  TradingRecommendationPriority,
  TradingRecommendationImpact,
  TradingRecommendationEffort,
  TradingRecommendationExpectedBenefit,
  TradingRecommendationCategory,
  TradingRecommendation,
  TradingRecommendationSummary,
  TradingRecommendationReport,
} from './TradingRecommendationTypes';

export {
  RECOMMENDATION_BY_INSIGHT_ID,
  priorityFromSeverity,
  fallbackTemplate,
} from './TradingRecommendationRules';
export { clampRecConfidence, formatRecommendationPriority } from './TradingRecommendationFormatter';
export { buildRecommendationsFromInsights } from './TradingRecommendationBuilder';
export { buildTradingRecommendationReport } from './TradingRecommendationEngine';

/**
 * Task 15.6 — Strategy Analytics Engine public API.
 */

export { STRATEGY_ANALYTICS_VERSION } from './StrategyAnalyticsTypes';
export type {
  StrategyStatus,
  StrategyGrade,
  StrategyLifecycle,
  StrategyTrendTag,
  StrategyAnalyticsRow,
  StrategyRankingEntry,
  StrategyHeatmapCell,
  StrategyHeatmap,
  StrategyAnalyticsSummary,
  StrategyAnalyticsReport,
} from './StrategyAnalyticsTypes';

export {
  STRATEGY_RULES,
  strategyGradeFromScore,
  strategyStatusFromScore,
  strategyConfidence,
  strategyCompositeScore,
  lifecycleFromSignals,
} from './StrategyAnalyticsRules';

export {
  formatStrategyGrade,
  formatStrategyStatus,
  formatStrategyPct,
} from './StrategyAnalyticsFormatter';

export {
  groupTradesByStrategy,
  buildStrategyRows,
  rankStrategies,
  buildStrategyHeatmap,
  overallConfidence,
} from './StrategyAnalyticsBuilder';

export { buildStrategyAnalyticsReport } from './StrategyAnalyticsEngine';

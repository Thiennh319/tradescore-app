/**
 * Task 14.2 — Statistics Intelligence public API.
 */

export {
  aggregateStatistics,
  projectAggregateToViewModel,
} from './statisticsAggregator';

export { finalizeStatisticsProjection, projectCoinFocus } from './statisticsProjector';

export {
  buildStatisticsViewModel,
  clearStatisticsIntelligenceCache,
  getStatisticsCacheFingerprint,
} from './statisticsViewModel';

export {
  metricAverage,
  metricExpectancy,
  metricMedian,
  metricProfitFactor,
  metricWinRate,
} from './statisticsMetrics';

export { computeExpectancyUsdt } from './statisticsExpectancy';
export { computeDrawdownMetrics } from './statisticsDrawdown';
export { computeDistribution } from './statisticsDistribution';
export { computeTagStatistics } from './statisticsTags';
export { FOCUS_COINS, TAG_COMBOS } from './statisticsGrouping';

export {
  RULE_69_SINGLE_METRIC_DEFINITION,
  type StatisticsDrawdownMetrics,
  type StatisticsGroupMetrics,
  type StatisticsOverview,
  type StatisticsProfitMetrics,
  type StatisticsTagComboRow,
  type StatisticsTimeBucket,
  type StatisticsViewModel,
} from './statisticsTypes';

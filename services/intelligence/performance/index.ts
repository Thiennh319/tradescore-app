/**
 * Task 14.3 — Performance Intelligence public API.
 */

export {
  buildPerformanceViewModel,
  clearPerformanceIntelligenceCache,
  getPerformanceCacheFingerprint,
} from './performanceViewModel';

export { projectPerformanceViewModel } from './performanceProjector';
export { rankGroups, rankByWinRate, rankScore } from './performanceRanking';
export { buildComparisons } from './performanceComparison';
export { buildTrends } from './performanceTrend';
export { buildRecommendations } from './performanceRecommendation';
export { buildPerformanceSnapshot } from './performanceMetadata';

export {
  PERFORMANCE_VERSION,
  RECOMMENDATION_VERSION,
  RULE_80_NO_METRIC_DEFINITION,
  RULE_81_RANKING_ONLY,
  RULE_82_RECOMMENDATION_HAS_EVIDENCE,
  RULE_83_VIEWMODEL_IMMUTABLE,
  RULE_84_RANKING_DETERMINISTIC,
  RULE_85_RECOMMENDATION_VERSION,
  RULE_86_PERFORMANCE_SNAPSHOT,
  RULE_87_PERFORMANCE_CACHE,
  type ComparisonAxis,
  type ConfidenceAnalysis,
  type PerformanceGrade,
  type PerformanceOverall,
  type PerformanceRecommendation,
  type PerformanceSnapshotMeta,
  type PerformanceViewModel,
  type RankedRow,
  type TagIntelligence,
  type TrendSnapshot,
} from './performanceTypes';

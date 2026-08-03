/**
 * Phase 14 / Task 14.1 / 14.1.1 — Trading Intelligence public API.
 * Source: AiTradeJournalEntry (TI View) only.
 */

export {
  buildIntelligenceSectionSources,
  buildJournalEntryIntelligence,
  clearJournalIntelligenceCache,
  deriveIntelligenceTradeTags,
  isJournalIntelligenceCached,
} from './journalIntelligence';

export {
  actionCodeToLabel,
  buildAdviserTimeline,
  buildEventTimeline,
} from './journalTimelineBuilder';

export {
  REPLAY_VERSION,
  createReplayState,
  replayJump,
  replayPause,
  replayPlay,
  replayStep,
  replayTick,
} from './journalReplayBuilder';

export { AI_SUMMARY_VERSION, buildJournalAiSummary } from './journalAiSummary';
export { buildJournalRootCause } from './journalRootCause';
export { buildJournalOutcomeAnalysis } from './journalOutcomeAnalysis';
export { buildJournalEvidence } from './journalEvidence';

export {
  parseProjectedTags,
  resolveProjectionVersion,
  type ParsedProjectedMeta,
} from './parseProjectedTags';

export { buildStatisticsIntelligence, buildStatisticsViewModel } from './statisticsIntelligence';
export {
  clearStatisticsIntelligenceCache,
  metricExpectancy,
  metricProfitFactor,
  metricWinRate,
  RULE_69_SINGLE_METRIC_DEFINITION,
  type StatisticsViewModel,
  type StatisticsGroupMetrics,
  type StatisticsOverview,
  type StatisticsProfitMetrics,
  type StatisticsDrawdownMetrics,
} from './statistics';

export {
  invalidateAllIntelligenceCaches,
  metricWinRatePct1,
  buildJournalStatisticsFingerprint,
  tradeOutcomeFingerprint,
} from './shared';

export { buildPerformanceIntelligence, buildPerformanceViewModel } from './performanceIntelligence';
export {
  clearPerformanceIntelligenceCache,
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
  type PerformanceViewModel,
  type PerformanceRecommendation,
  type RankedRow,
} from './performance';

export { buildDashboardIntelligence, buildDashboardViewModel } from './dashboardIntelligence';
export {
  clearDashboardIntelligenceCache,
  DASHBOARD_VERSION,
  DASHBOARD_WIDGET_IDS,
  DEFAULT_DASHBOARD_FILTER,
  RULE_93_DASHBOARD_READ_ONLY,
  RULE_94_NEVER_CALCULATES,
  RULE_95_NEVER_AGGREGATES,
  RULE_96_PERFORMANCE_VM_ONLY,
  RULE_97_WIDGETS_STATELESS,
  RULE_98_STABLE_WIDGET_IDS,
  RULE_99_DASHBOARD_SNAPSHOT,
  RULE_100_DASHBOARD_CACHE,
  type DashboardFilter,
  type DashboardViewModel,
} from './dashboard';

export {
  RULE_51_AI_SUGGEST_ONLY,
  RULE_57_JOURNAL_INTEL_READ_ONLY,
  RULE_58_REPLAY_TIMELINE_ONLY,
  RULE_59_AI_SUMMARY_HAS_EVIDENCE,
  RULE_60_OUTCOME_REPRODUCIBLE,
  RULE_61_JOURNAL_IS_CANONICAL,
  RULE_62_SECTION_HAS_SOURCE,
  RULE_63_REPLAY_VERSION,
  RULE_64_SUMMARY_VERSION,
  RULE_65_INTELLIGENCE_CACHE,
  type DashboardHealthInput,
  type DashboardIntelligence,
  type IntelligenceAdviserStep,
  type IntelligenceSectionId,
  type IntelligenceSectionSource,
  type IntelligenceTimelineEvent,
  type JournalAiSummaryResult,
  type JournalDecisionSnapshot,
  type JournalEntryIntelligence,
  type JournalEvidenceItem,
  type JournalMarketSnapshotView,
  type JournalOutcomeAnalysisResult,
  type JournalReplayState,
  type JournalRootCauseResult,
  type JournalTradeSummary,
  type PerformanceIntelligence,
  type PerformanceVersionRow,
  type RootCauseCategory,
  type StatisticsIntelligence,
  type WinrateBucketRow,
} from './types';

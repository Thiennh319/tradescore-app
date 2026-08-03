/**
 * Task 15.0 / 15.0.1 — UL Analytics Engine public API.
 */

export { UL_ANALYTICS_VERSION, UL_RECOMMENDATION_PRIORITY_RANK } from './types';
export type {
  UlSide,
  UlRiskLevel,
  UlRecommendationSeverity,
  UlRecommendationPriority,
  UlGrade,
  ULTradeInput,
  ULCoreMetrics,
  ULCoinStats,
  ULCoinAnalysis,
  ULPatternAnalysis,
  ULRiskAnalysis,
  ULRecommendation,
  ULScoreBreakdown,
  ULChartPoint,
  ULCharts,
  ULInsightCard,
  ULDashboardKPI,
  ULDashboardData,
  ULAnalyzerPlugin,
  ULBuildOptions,
} from './types';

export {
  isFiniteNumber,
  metricWinRate,
  metricProfitFactor,
  metricExpectancy,
  metricAverage,
  sortTradesByClose,
  buildEquitySeries,
  computeCoreMetrics,
  computeConsistencyScore,
  computeStabilityScore,
  computeBasePerformanceScore,
  computePerformanceScore,
  dayKeyUtc,
} from './ULMetrics';

export { gradeFromScore, buildScoreBreakdown, expectancyToScore } from './ULScoreEngine';
export { analyzeCoins } from './ULCoinAnalyzer';
export { analyzePatterns } from './ULPatternAnalyzer';
export { computeRiskScore, riskLevelFromScore, analyzeRisk } from './ULRiskAnalyzer';
export { buildRecommendations } from './ULRecommendationEngine';
export {
  buildULDashboard,
  runULAnalyticsEngine,
  clearUlAnalyticsCache,
} from './ULAnalyticsEngine';
export { mapJournalToUlTrades } from './mapJournalToUlTrades';
export {
  sanitizeTrades,
  isValidTrade,
  fingerprintTrades,
  fnv1aHex,
  buildCacheKey,
} from './ULInputAdapter';
export { formatUsdt, formatPct, formatRr, formatScore } from './ULFormat';
export { applyUlPlugins } from './ULPlugin';
export {
  clearUlAnalyticsCache as clearUlCache,
  readUlCache,
  writeUlCache,
  getUlCacheKey,
  getUlCacheFingerprint,
} from './ULCache';

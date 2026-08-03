/**
 * Task 14.4 — Dashboard Intelligence public API.
 */

export { buildDashboardViewModel } from './dashboardViewModel';
export {
  clearDashboardIntelligenceCache,
  getDashboardCacheFingerprint,
} from './dashboardCache';

export {
  applyDashboardFilter,
  projectDashboardViewModel,
} from './dashboardProjector';

export {
  DASHBOARD_WIDGET_IDS,
  buildDashboardWidgets,
  buildRiskMonitor,
} from './dashboardWidgets';

export {
  mapGradeToHealth,
  mapOverallToRisk,
  resolveSystemHealth,
} from './dashboardHealth';

export { buildDashboardSnapshot } from './dashboardMetadata';

export {
  DASHBOARD_VERSION,
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
  type DashboardHealthLabel,
  type DashboardViewModel,
  type DashboardWidget,
  type QuickStatisticsWidget,
  type RecommendationPanelWidget,
  type TradingSummaryWidget,
} from './dashboardTypes';

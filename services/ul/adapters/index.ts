/**
 * Task 15.0.2 — UL → Performance Dashboard adapter public surface.
 * UI must not import from here until Task 15.1 bind.
 */

export {
  PERFORMANCE_DASHBOARD_VM_VERSION,
} from './performanceDashboardTypes';
export type {
  PerformanceRiskLevelDisplay,
  PerformanceSummaryVM,
  PerformanceCoinRowVM,
  PerformanceCoinTableVM,
  PerformanceRecommendationItemVM,
  PerformanceRecommendationPanelVM,
  PerformanceRiskWidgetVM,
  PerformanceEquityPointVM,
  PerformanceEquityChartVM,
  PerformanceDailyPointVM,
  PerformanceDailyChartVM,
  PerformanceScoreWidgetVM,
  PerformanceInsightCardVM,
  PerformancePatternsVM,
  PerformanceDashboardViewModel,
  DeepReadonlyPerformanceDashboardVM,
} from './performanceDashboardTypes';

export {
  buildPerformanceDashboardVM,
  mapRiskLevel,
  deepFreezeVm,
} from './ULDashboardAdapter';

export { validatePerformanceDashboardVM } from './PerformanceDashboardValidator';

/**
 * Task 14.4 — Projector: PerformanceViewModel → DashboardViewModel.
 */

import type { PerformanceViewModel } from '../performance';
import {
  buildActiveInsights,
  buildRecentTrends,
  buildRecommendationPanel,
} from './dashboardAlerts';
import { resolveSystemHealth } from './dashboardHealth';
import { buildDashboardSnapshot } from './dashboardMetadata';
import {
  buildQuickStatistics,
  buildTodayPerformance,
  buildTopPicks,
  buildTradingSummary,
} from './dashboardSummary';
import {
  DEFAULT_DASHBOARD_FILTER,
  type DashboardFilter,
  type DashboardViewModel,
} from './dashboardTypes';
import { buildDashboardWidgets, buildRiskMonitor } from './dashboardWidgets';

export function projectDashboardViewModel(
  perf: PerformanceViewModel,
  filter: DashboardFilter = DEFAULT_DASHBOARD_FILTER,
): DashboardViewModel {
  const tradingSummary = buildTradingSummary(perf);
  return Object.freeze({
    tradingSummary,
    todayPerformance: buildTodayPerformance(perf),
    systemHealth: resolveSystemHealth(perf.overall),
    topPicks: buildTopPicks(perf, filter),
    riskMonitor: buildRiskMonitor(perf),
    recommendationPanel: buildRecommendationPanel(perf),
    recentTrends: buildRecentTrends(perf),
    activeInsights: buildActiveInsights(perf),
    quickStatistics: buildQuickStatistics(perf),
    filter: { ...filter },
    widgets: buildDashboardWidgets(),
    snapshot: buildDashboardSnapshot(perf),
  }) as DashboardViewModel;
}

/** Filter only reshapes presentation of rankings already on Performance VM. */
export function applyDashboardFilter(
  perf: PerformanceViewModel,
  filter: DashboardFilter,
): DashboardViewModel {
  return projectDashboardViewModel(perf, filter);
}

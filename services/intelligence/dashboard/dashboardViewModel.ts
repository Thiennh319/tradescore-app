/**
 * Task 14.4 — Dashboard ViewModel entry (Performance VM only).
 */

import type { PerformanceViewModel } from '../performance';
import { buildOrReuseDashboardViewModel } from './dashboardCache';
import {
  DEFAULT_DASHBOARD_FILTER,
  type DashboardFilter,
  type DashboardViewModel,
} from './dashboardTypes';

export function buildDashboardViewModel(
  perf: PerformanceViewModel,
  filter: DashboardFilter = DEFAULT_DASHBOARD_FILTER,
): DashboardViewModel {
  return buildOrReuseDashboardViewModel(perf, filter);
}

export {
  clearDashboardIntelligenceCache,
  getDashboardCacheFingerprint,
} from './dashboardCache';

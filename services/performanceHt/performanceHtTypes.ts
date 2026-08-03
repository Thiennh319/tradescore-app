/**
 * Task 15.1 — Performance HT data bundle (Task14-shaped render source).
 * Built by performanceHtDataSource — UI never imports services/ul/.
 */

import type {
  DashboardViewModel,
  DashboardFilterPeriod,
} from '../intelligence/dashboard/dashboardTypes';
import type { PerformanceViewModel } from '../intelligence/performance/performanceTypes';
import type { StatisticsViewModel } from '../intelligence/statistics/statisticsTypes';
import type { PerformanceDashboardViewModel } from '../ul/adapters/performanceDashboardTypes';

export type PerformanceHtDataSourceKind = 'task14' | 'ul';

/**
 * Render bundle consumed by Performance HT.
 * Field shapes match Task 14 VMs so JSX / layout stay unchanged.
 */
export type PerformanceHtDataBundle = {
  source: PerformanceHtDataSourceKind;
  stats: StatisticsViewModel;
  perf: PerformanceViewModel;
  dash: DashboardViewModel;
  /** Present when source === 'ul' (validated VM). */
  performanceDashboardVm: PerformanceDashboardViewModel | null;
  /** True iff validator ran on this build. */
  validatorExecuted: boolean;
  period: DashboardFilterPeriod;
};

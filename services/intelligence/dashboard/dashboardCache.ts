/**
 * Task 14.4 — Dashboard cache (Rule #100).
 */

import type { PerformanceViewModel } from '../performance';
import { projectDashboardViewModel } from './dashboardProjector';
import {
  DEFAULT_DASHBOARD_FILTER,
  type DashboardFilter,
  type DashboardViewModel,
} from './dashboardTypes';

type CacheEntry = {
  performanceFingerprint: string;
  filterKey: string;
  vm: DashboardViewModel;
};

let cache: CacheEntry | null = null;

function filterKeyOf(filter: DashboardFilter): string {
  return `${filter.period}|${filter.coin ?? ''}|${filter.strategy ?? ''}|${filter.tag ?? ''}`;
}

export function getCachedDashboard(
  perf: PerformanceViewModel,
  filter: DashboardFilter = DEFAULT_DASHBOARD_FILTER,
): DashboardViewModel | null {
  const fp = perf.snapshot.statisticsFingerprint;
  const fk = filterKeyOf(filter);
  if (cache && cache.performanceFingerprint === fp && cache.filterKey === fk) {
    return cache.vm;
  }
  return null;
}

export function setCachedDashboard(
  perf: PerformanceViewModel,
  filter: DashboardFilter,
  vm: DashboardViewModel,
): void {
  cache = {
    performanceFingerprint: perf.snapshot.statisticsFingerprint,
    filterKey: filterKeyOf(filter),
    vm,
  };
}

export function clearDashboardIntelligenceCache(): void {
  cache = null;
}

export function getDashboardCacheFingerprint(): string | null {
  return cache?.performanceFingerprint ?? null;
}

export function buildOrReuseDashboardViewModel(
  perf: PerformanceViewModel,
  filter: DashboardFilter = DEFAULT_DASHBOARD_FILTER,
): DashboardViewModel {
  const hit = getCachedDashboard(perf, filter);
  if (hit) return hit;
  const vm = projectDashboardViewModel(perf, filter);
  setCachedDashboard(perf, filter, vm);
  return vm;
}

/**
 * Task 14.3 — Performance ViewModel + cache (Rule #87).
 * Input: StatisticsViewModel ONLY.
 */

import type { StatisticsViewModel } from '../statistics';
import { projectPerformanceViewModel } from './performanceProjector';
import type { PerformanceViewModel } from './performanceTypes';

type CacheEntry = {
  statisticsFingerprint: string;
  vm: PerformanceViewModel;
};

let cache: CacheEntry | null = null;

/** Build Performance ViewModel from Statistics (immutable, cached). */
export function buildPerformanceViewModel(
  stats: StatisticsViewModel,
  generatedAt?: string,
): PerformanceViewModel {
  const fp = stats.projectionFingerprint;
  if (cache && cache.statisticsFingerprint === fp) {
    return cache.vm;
  }
  const vm = projectPerformanceViewModel(stats, generatedAt);
  cache = { statisticsFingerprint: fp, vm };
  return vm;
}

export function clearPerformanceIntelligenceCache(): void {
  cache = null;
}

export function getPerformanceCacheFingerprint(): string | null {
  return cache?.statisticsFingerprint ?? null;
}

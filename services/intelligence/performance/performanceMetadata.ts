/**
 * Task 14.3 — Snapshot metadata (Rule #85 / #86).
 */

import type { StatisticsViewModel } from '../statistics';
import {
  PERFORMANCE_VERSION,
  RECOMMENDATION_VERSION,
  STATISTICS_CONSUMER_VERSION,
  type PerformanceSnapshotMeta,
} from './performanceTypes';

export function buildPerformanceSnapshot(
  stats: StatisticsViewModel,
  generatedAt: string = new Date().toISOString(),
): PerformanceSnapshotMeta {
  return {
    performanceVersion: PERFORMANCE_VERSION,
    statisticsVersion: STATISTICS_CONSUMER_VERSION,
    recommendationVersion: RECOMMENDATION_VERSION,
    projectionFingerprint: stats.projectionFingerprint,
    statisticsFingerprint: stats.projectionFingerprint,
    generatedAt,
  };
}

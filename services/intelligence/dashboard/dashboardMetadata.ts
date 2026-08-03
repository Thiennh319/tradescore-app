/**
 * Task 14.4 — Snapshot metadata (Rule #99).
 */

import type { PerformanceViewModel } from '../performance';
import { DASHBOARD_VERSION, type DashboardSnapshotMeta } from './dashboardTypes';

export function buildDashboardSnapshot(
  perf: PerformanceViewModel,
): DashboardSnapshotMeta {
  return {
    dashboardVersion: DASHBOARD_VERSION,
    performanceVersion: perf.snapshot.performanceVersion,
    statisticsVersion: perf.snapshot.statisticsVersion,
    recommendationVersion: perf.snapshot.recommendationVersion,
    projectionFingerprint: perf.snapshot.projectionFingerprint,
    performanceFingerprint: perf.snapshot.statisticsFingerprint,
    generatedAt: perf.snapshot.generatedAt,
  };
}

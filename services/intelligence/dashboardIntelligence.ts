/**
 * Task 14.4 — Legacy DashboardIntelligence facade.
 * UI path: Journal → Statistics → Performance → Dashboard (presentation).
 * Dashboard modules themselves never read Journal / Statistics.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { buildDashboardViewModel } from './dashboard';
import { buildPerformanceViewModel } from './performance';
import { buildStatisticsViewModel } from './statistics';
import type { DashboardHealthInput, DashboardIntelligence } from './types';
import type { DashboardViewModel } from './dashboard';

export function mapDashboardViewModelToLegacy(
  dash: DashboardViewModel,
  health: DashboardHealthInput = {},
): DashboardIntelligence {
  const sync = health.syncStatus ?? 'NOT_WIRED';
  const label = dash.systemHealth;
  const systemHealth: DashboardIntelligence['systemHealth'] =
    label === 'Critical' || label === 'Warning'
      ? 'DEGRADED'
      : label === 'Unknown'
        ? 'UNKNOWN'
        : 'OK';

  return {
    systemHealth,
    desktopSync: sync,
    queueDepth: health.queueDepth ?? null,
    ackPending: health.ackPending ?? null,
    projector: health.projectorStatus ?? 'VIEW_ONLY',
    eventStore: health.eventStoreStatus ?? 'DESKTOP_SOT',
    journalHealth: `GRADE_${dash.tradingSummary.overallGrade}`,
    projectionVersion: dash.snapshot.projectionFingerprint.slice(0, 32) || null,
    pendingEvents: health.queueDepth ?? 0,
    replayReadyCount: dash.quickStatistics.trades ?? 0,
    aiInsight: dash.activeInsights[0] ?? `Dashboard v${dash.snapshot.dashboardVersion}`,
  };
}

/**
 * Compatibility entry used by App / old tests.
 * Builds Stats → Perf → Dashboard then maps legacy health strip.
 */
export function buildDashboardIntelligence(
  journal: readonly AiTradeJournalEntry[],
  health: DashboardHealthInput = {},
): DashboardIntelligence {
  const stats = buildStatisticsViewModel(journal);
  const perf = buildPerformanceViewModel(stats);
  const dash = buildDashboardViewModel(perf);
  return mapDashboardViewModelToLegacy(dash, health);
}

export { buildDashboardViewModel } from './dashboard';

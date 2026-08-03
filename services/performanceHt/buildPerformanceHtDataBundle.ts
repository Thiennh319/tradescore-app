/**
 * Task 15.1 — Performance HT data source switch.
 *
 * false → Task 14 intelligence VMs (unchanged pipeline)
 * true  → UL Analytics → Adapter → Validator → Task14-shaped projection
 *
 * UI imports this module only — never services/ul/ directly.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import {
  isUlAnalyticsEnabled,
} from '../../config/featureFlags';
import {
  DEFAULT_DASHBOARD_FILTER,
  buildDashboardViewModel,
  type DashboardFilterPeriod,
} from '../intelligence/dashboard';
import { buildPerformanceViewModel } from '../intelligence/performance';
import { buildStatisticsViewModel } from '../intelligence/statistics';
import { buildULDashboard } from '../ul/ULAnalyticsEngine';
import { mapJournalToUlTrades } from '../ul/mapJournalToUlTrades';
import { buildPerformanceDashboardVM } from '../ul/adapters/ULDashboardAdapter';
import { validatePerformanceDashboardVM } from '../ul/adapters/PerformanceDashboardValidator';
import type { PerformanceHtDataBundle } from './performanceHtTypes';
import { projectUlVmToTask14Shapes } from './projectUlVmToTask14Shapes';

export type BuildPerformanceHtOptions = {
  period?: DashboardFilterPeriod;
  /** Override feature flag (tests / screenshots). */
  useUlAnalytics?: boolean;
  generatedAt?: string;
};

function buildTask14Bundle(
  entries: readonly AiTradeJournalEntry[],
  period: DashboardFilterPeriod,
): PerformanceHtDataBundle {
  const stats = buildStatisticsViewModel(entries);
  const perf = buildPerformanceViewModel(stats);
  const dash = buildDashboardViewModel(perf, {
    ...DEFAULT_DASHBOARD_FILTER,
    period,
  });
  return {
    source: 'task14',
    stats,
    perf,
    dash,
    performanceDashboardVm: null,
    validatorExecuted: false,
    period,
  };
}

function buildUlBundle(
  entries: readonly AiTradeJournalEntry[],
  period: DashboardFilterPeriod,
  generatedAt?: string,
): PerformanceHtDataBundle {
  const trades = mapJournalToUlTrades(entries);
  const ulData = buildULDashboard(trades, {
    generatedAt: generatedAt ?? '',
    bypassCache: true,
  });
  const adapted = buildPerformanceDashboardVM(ulData);
  const validated = validatePerformanceDashboardVM(adapted);
  const { stats, perf, dash } = projectUlVmToTask14Shapes(validated, period);
  return {
    source: 'ul',
    stats,
    perf,
    dash,
    performanceDashboardVm: validated,
    validatorExecuted: true,
    period,
  };
}

function readWebQueryUlFlag(): boolean | null {
  if (typeof globalThis === 'undefined') return null;
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    if (!loc?.search) return null;
    const q = new URLSearchParams(loc.search).get('useUlAnalytics');
    if (q === '1' || q === 'true') return true;
    if (q === '0' || q === 'false') return false;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Single entry for Performance HT ViewModel provider.
 */
export function buildPerformanceHtDataBundle(
  entries: readonly AiTradeJournalEntry[],
  options?: BuildPerformanceHtOptions,
): PerformanceHtDataBundle {
  const period = options?.period ?? 'all';
  const webQ = readWebQueryUlFlag();
  const useUl = options?.useUlAnalytics ?? webQ ?? isUlAnalyticsEnabled();
  if (useUl) {
    return buildUlBundle(entries, period, options?.generatedAt);
  }
  return buildTask14Bundle(entries, period);
}

export { projectUlVmToTask14Shapes } from './projectUlVmToTask14Shapes';
export type { PerformanceHtDataBundle, PerformanceHtDataSourceKind } from './performanceHtTypes';

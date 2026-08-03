/**
 * Task 15.2 — Compare snapshot builder (copy metrics only — no recalculation).
 */

import type { ULCoreMetrics, ULDashboardData } from '../types';
import type {
  ULCompareMetricBag,
  ULCompareMetricKey,
  ULComparePeriodSpec,
  ULCompareSide,
} from './ULCompareTypes';
import { periodLabel } from './ULComparePeriods';

export const UL_COMPARE_METRIC_KEYS: readonly ULCompareMetricKey[] = [
  'trades',
  'winRate',
  'profitFactor',
  'expectancy',
  'averageRr',
  'netPnl',
  'largestWin',
  'largestLoss',
  'recoveryFactor',
  'maxDrawdown',
  'consistency',
  'stability',
  'performanceScore',
] as const;

export const UL_COMPARE_METRIC_LABELS: Record<ULCompareMetricKey, string> = {
  trades: 'Trades',
  winRate: 'Win Rate',
  profitFactor: 'Profit Factor',
  expectancy: 'Expectancy',
  averageRr: 'Average RR',
  netPnl: 'Net PnL',
  largestWin: 'Largest Win',
  largestLoss: 'Largest Loss',
  recoveryFactor: 'Recovery Factor',
  maxDrawdown: 'Max Drawdown',
  consistency: 'Consistency',
  stability: 'Stability',
  performanceScore: 'Performance Score',
};

/** Metrics where a lower numeric value is generally better. */
export const UL_COMPARE_LOWER_IS_BETTER: ReadonlySet<ULCompareMetricKey> = new Set([
  'maxDrawdown',
]);

export function metricBagFromCore(metrics: ULCoreMetrics): ULCompareMetricBag {
  return {
    trades: metrics.totalTrades,
    winRate: metrics.winRate,
    profitFactor: metrics.profitFactor,
    expectancy: metrics.expectancy,
    averageRr: metrics.averageRr,
    netPnl: metrics.netPnl,
    largestWin: metrics.largestWin,
    largestLoss: metrics.largestLoss,
    recoveryFactor: metrics.recoveryFactor,
    maxDrawdown: metrics.maxDrawdown,
    consistency: metrics.consistencyScore,
    stability: metrics.stabilityScore,
    performanceScore: metrics.performanceScore,
  };
}

export function metricBagFromDashboard(dashboard: ULDashboardData): ULCompareMetricBag {
  return metricBagFromCore(dashboard.metrics);
}

export function emptyMetricBag(): ULCompareMetricBag {
  return {
    trades: 0,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    averageRr: null,
    netPnl: 0,
    largestWin: null,
    largestLoss: null,
    recoveryFactor: null,
    maxDrawdown: 0,
    consistency: 0,
    stability: 0,
    performanceScore: 0,
  };
}

export function buildCompareSide(input: {
  metrics: ULCompareMetricBag;
  label?: string;
  period?: ULComparePeriodSpec | null;
  range?: { startMs: number; endMs: number } | null;
}): ULCompareSide {
  const period = input.period ?? null;
  return {
    label: input.label ?? (period ? periodLabel(period) : 'Period'),
    period,
    range: input.range ?? null,
    metrics: { ...input.metrics },
  };
}

export function readMetric(
  bag: ULCompareMetricBag,
  key: ULCompareMetricKey,
): number | null {
  const v = bag[key];
  if (v == null) return null;
  return Number.isFinite(v) ? v : null;
}

/**
 * Task 15.2 — Display formatters for compare deltas (pure).
 */

import type { ULCompareMetricKey, ULCompareTrend } from './ULCompareTypes';

export function formatCompareTrendArrow(trend: ULCompareTrend): string {
  if (trend === 'UP') return '↑';
  if (trend === 'DOWN') return '↓';
  return '→';
}

export function formatCompareDelta(
  key: ULCompareMetricKey,
  delta: number | null,
): string {
  if (delta == null || !Number.isFinite(delta)) return '—';
  const sign = delta > 0 ? '+' : '';
  switch (key) {
    case 'winRate':
    case 'consistency':
    case 'stability':
    case 'performanceScore':
      return `${sign}${delta.toFixed(1)}`;
    case 'trades':
      return `${sign}${Math.round(delta)}`;
    case 'profitFactor':
    case 'averageRr':
    case 'recoveryFactor':
      return `${sign}${delta.toFixed(2)}`;
    case 'expectancy':
    case 'netPnl':
    case 'largestWin':
    case 'largestLoss':
    case 'maxDrawdown':
      return `${sign}${delta.toFixed(2)}`;
    default:
      return `${sign}${delta}`;
  }
}

export function formatComparePctDelta(pctDelta: number | null): string {
  if (pctDelta == null || !Number.isFinite(pctDelta)) return '—';
  const sign = pctDelta > 0 ? '+' : '';
  return `${sign}${pctDelta.toFixed(1)}%`;
}

/**
 * Task 14.2 — Expectancy helper (delegates to Rule #69 metrics).
 */

import { metricExpectancy } from './statisticsMetrics';

export function computeExpectancyUsdt(pnls: readonly number[]): number | null {
  if (pnls.length === 0) return null;
  const sum = pnls.reduce((a, b) => a + b, 0);
  return metricExpectancy(sum, pnls.length);
}

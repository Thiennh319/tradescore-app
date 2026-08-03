/**
 * Task 14.4.1 — Rule #69 single metric definitions.
 * Journal Service / Statistics / Insights consumers must use these only.
 */

/** Winrate as percent (0–100). null if no trades. */
export function metricWinRate(wins: number, trades: number): number | null {
  if (trades <= 0) return null;
  return (wins / trades) * 100;
}

/**
 * Winrate percent rounded to 1 decimal (legacy Journal Service UI contract).
 * Returns 0 when empty — same as historical journalService helpers.
 */
export function metricWinRatePct1(wins: number, trades: number): number {
  const w = metricWinRate(wins, trades);
  return w == null ? 0 : Math.round(w * 10) / 10;
}

/** Profit factor = grossProfit / grossLoss */
export function metricProfitFactor(
  grossProfit: number,
  grossLoss: number,
): number | null {
  if (grossLoss <= 0) return null;
  return grossProfit / grossLoss;
}

/** Expectancy = mean PnL of sample */
export function metricExpectancy(pnlSum: number, count: number): number | null {
  if (count <= 0) return null;
  return pnlSum / count;
}

export function metricAverage(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return sum / count;
}

export function metricMedian(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

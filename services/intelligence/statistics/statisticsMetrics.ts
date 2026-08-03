/**
 * Task 14.2 / 14.4.1 — Pure metric helpers + group finalizers.
 * Rule #69 definitions live in shared/metrics — this module re-exports + accumulator utils.
 */

import {
  metricAverage,
  metricExpectancy,
  metricMedian,
  metricProfitFactor,
  metricWinRate,
} from '../shared/metrics';
import type { GroupAcc, StatisticsGroupMetrics } from './statisticsTypes';

export {
  metricAverage,
  metricExpectancy,
  metricMedian,
  metricProfitFactor,
  metricWinRate,
};

export function emptyAcc(): GroupAcc {
  return {
    trades: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    pnlSum: 0,
    pnlCount: 0,
    rrSum: 0,
    rrCount: 0,
    holdSum: 0,
    holdCount: 0,
    grossProfit: 0,
    grossLoss: 0,
    occurrences: 0,
    successHits: 0,
  };
}

export function absorbPnl(acc: GroupAcc, pnl: number | null | undefined): void {
  if (pnl == null || !Number.isFinite(pnl)) return;
  acc.pnlSum += pnl;
  acc.pnlCount += 1;
  if (pnl > 0) acc.grossProfit += pnl;
  else if (pnl < 0) acc.grossLoss += Math.abs(pnl);
}

export function absorbRr(acc: GroupAcc, rr: number | null | undefined): void {
  if (rr == null || !Number.isFinite(rr) || rr <= 0) return;
  acc.rrSum += rr;
  acc.rrCount += 1;
}

export function absorbHold(acc: GroupAcc, hold: number | null | undefined): void {
  if (hold == null || !Number.isFinite(hold)) return;
  acc.holdSum += hold;
  acc.holdCount += 1;
}

export function finalizeGroupMetrics(key: string, acc: GroupAcc): StatisticsGroupMetrics {
  return {
    key,
    trades: acc.trades,
    wins: acc.wins,
    losses: acc.losses,
    breakevens: acc.breakevens,
    winRate: metricWinRate(acc.wins, acc.trades),
    pnlUsdt: acc.pnlCount > 0 ? acc.pnlSum : null,
    averageRr: metricAverage(acc.rrSum, acc.rrCount),
    avgHoldingMinutes: metricAverage(acc.holdSum, acc.holdCount),
    profitFactor: metricProfitFactor(acc.grossProfit, acc.grossLoss),
    expectancyUsdt: metricExpectancy(acc.pnlSum, acc.pnlCount),
    averageWinUsdt: null,
    averageLossUsdt: null,
    occurrences: acc.occurrences > 0 ? acc.occurrences : undefined,
    successRate:
      acc.occurrences > 0 ? metricWinRate(acc.successHits, acc.occurrences) : undefined,
    averageProfitUsdt: metricExpectancy(acc.pnlSum, acc.pnlCount) ?? undefined,
  };
}

export function sortedGroupRows(
  map: Map<string, GroupAcc>,
): StatisticsGroupMetrics[] {
  return [...map.entries()]
    .map(([key, acc]) => finalizeGroupMetrics(key, acc))
    .sort((a, b) => b.trades - a.trades || (b.occurrences ?? 0) - (a.occurrences ?? 0));
}

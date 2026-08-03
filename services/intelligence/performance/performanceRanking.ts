/**
 * Task 14.3 — Deterministic ranking (Rule #81 / #84).
 * Score từ Metrics đã có trên Statistics — không aggregate.
 */

import type { StatisticsGroupMetrics } from '../statistics';
import type { RankedRow } from './performanceTypes';

function num(v: number | null | undefined, fallback = 0): number {
  return v != null && Number.isFinite(v) ? v : fallback;
}

/**
 * Composite score for ranking (interpretation weights only — not a new metric definition).
 * Uses Statistics fields only.
 */
export function rankScore(row: StatisticsGroupMetrics): number {
  const wr = num(row.winRate);
  const pf = num(row.profitFactor, 1);
  const exp = num(row.expectancyUsdt);
  const rr = num(row.averageRr);
  const tradesBoost = Math.min(10, row.trades);
  return wr * 0.45 + Math.min(pf, 5) * 8 + exp * 0.35 + rr * 4 + tradesBoost;
}

export function toRankedRow(row: StatisticsGroupMetrics, rank: number): RankedRow {
  return {
    rank,
    key: row.key,
    score: rankScore(row),
    winRate: row.winRate,
    profitFactor: row.profitFactor,
    expectancyUsdt: row.expectancyUsdt,
    averageRr: row.averageRr,
    pnlUsdt: row.pnlUsdt,
    trades: row.trades,
    avgHoldingMinutes: row.avgHoldingMinutes,
    successRate: row.successRate,
    averageProfitUsdt: row.averageProfitUsdt,
    occurrences: row.occurrences,
  };
}

/** Stable sort: score desc, then key asc (deterministic). */
export function rankGroups(
  rows: readonly StatisticsGroupMetrics[],
  opts?: { minTrades?: number },
): RankedRow[] {
  const min = opts?.minTrades ?? 0;
  const filtered = rows.filter((r) => r.trades >= min);
  const sorted = [...filtered].sort((a, b) => {
    const ds = rankScore(b) - rankScore(a);
    if (ds !== 0) return ds;
    return a.key.localeCompare(b.key);
  });
  return sorted.map((r, i) => toRankedRow(r, i + 1));
}

/** Rank by winrate only (tags / lose-win lists). */
export function rankByWinRate(
  rows: readonly StatisticsGroupMetrics[],
  direction: 'best' | 'worst',
  limit = 5,
): RankedRow[] {
  const eligible = rows.filter((r) => r.trades > 0 && r.winRate != null);
  const sorted = [...eligible].sort((a, b) => {
    const dw =
      direction === 'best'
        ? num(b.winRate) - num(a.winRate)
        : num(a.winRate) - num(b.winRate);
    if (dw !== 0) return dw;
    return a.key.localeCompare(b.key);
  });
  return sorted.slice(0, limit).map((r, i) => toRankedRow(r, i + 1));
}

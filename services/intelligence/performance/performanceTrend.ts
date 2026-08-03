/**
 * Task 14.3 — Trend interpretation from Statistics time buckets (no aggregation).
 */

import type { StatisticsTimeBucket, StatisticsViewModel } from '../statistics';
import type { TrendSnapshot } from './performanceTypes';

function meanWinRate(rows: readonly StatisticsTimeBucket[]): number | null {
  if (rows.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (r.winRate != null) {
      sum += r.winRate;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

function meanPnl(rows: readonly StatisticsTimeBucket[]): number | null {
  if (rows.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    if (r.pnlUsdt != null) {
      sum += r.pnlUsdt;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

function dir(a: number | null, b: number | null): 'UP' | 'FLAT' | 'DOWN' | 'NA' {
  if (a == null || b == null) return 'NA';
  const d = b - a;
  if (Math.abs(d) < 0.5) return 'FLAT';
  return d > 0 ? 'UP' : 'DOWN';
}

/**
 * Approximate 7/30/90 windows by slicing sorted day buckets (already aggregated by Statistics).
 * First third vs last third of available day rows — interpretation only.
 */
function windowTrend(
  days: readonly StatisticsTimeBucket[],
  window: TrendSnapshot['window'],
  take: number,
): TrendSnapshot {
  const slice = days.slice(-Math.max(take, 1));
  const mid = Math.floor(slice.length / 2) || 1;
  const early = slice.slice(0, mid);
  const late = slice.slice(mid);
  const wrA = meanWinRate(early);
  const wrB = meanWinRate(late);
  const pnlA = meanPnl(early);
  const pnlB = meanPnl(late);
  const wrT = dir(wrA, wrB);
  const pnlT = dir(pnlA, pnlB);
  // Drawdown/recovery from overview context — flat unless late PnL worsens
  const ddT: TrendSnapshot['drawdownTrend'] =
    pnlT === 'DOWN' ? 'UP' : pnlT === 'UP' ? 'DOWN' : pnlT === 'FLAT' ? 'FLAT' : 'NA';
  const recT: TrendSnapshot['recoveryTrend'] =
    pnlT === 'UP' ? 'UP' : pnlT === 'DOWN' ? 'DOWN' : pnlT;

  return {
    window,
    winrateTrend: wrT,
    profitTrend: pnlT,
    drawdownTrend: ddT,
    recoveryTrend: recT,
    evidence: `dayBuckets=${slice.length} earlyWR=${wrA?.toFixed(1) ?? '—'} lateWR=${wrB?.toFixed(1) ?? '—'}`,
  };
}

export function buildTrends(stats: StatisticsViewModel): TrendSnapshot[] {
  const days = [...stats.byDay].sort((a, b) => a.key.localeCompare(b.key));
  return [
    windowTrend(days, '7d', 7),
    windowTrend(days, '30d', 30),
    windowTrend(days, '90d', 90),
  ];
}

export function growthFromTrends(trends: readonly TrendSnapshot[]): 'UP' | 'FLAT' | 'DOWN' | 'NA' {
  const t30 = trends.find((t) => t.window === '30d');
  if (!t30) return 'NA';
  if (t30.profitTrend !== 'NA') return t30.profitTrend;
  return t30.winrateTrend;
}

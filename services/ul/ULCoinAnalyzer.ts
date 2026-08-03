/**
 * Task 15.0.1 — Layer 3 Coin Analyzer.
 * Rank: PnL → Win Rate → RR → Trades → Symbol (deterministic).
 */

import {
  metricAverage,
  metricExpectancy,
  metricWinRate,
} from './ULMetrics';
import type { ULCoinAnalysis, ULCoinStats, ULTradeInput } from './types';

function coinScore(row: Omit<ULCoinStats, 'rank' | 'score'>): number {
  const wr = row.winRate;
  const exp = row.expectancy;
  const rr = row.averageRr ?? 0;
  const pnl = row.totalPnl;
  return wr * 0.35 + Math.min(50, Math.max(-50, exp * 5)) + rr * 8 + Math.min(40, Math.max(-40, pnl));
}

function compareCoins(
  a: Omit<ULCoinStats, 'rank'>,
  b: Omit<ULCoinStats, 'rank'>,
): number {
  if (b.totalPnl !== a.totalPnl) return b.totalPnl - a.totalPnl;
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  const arr = a.averageRr ?? -Infinity;
  const brr = b.averageRr ?? -Infinity;
  if (brr !== arr) return brr - arr;
  if (b.trades !== a.trades) return b.trades - a.trades;
  return a.symbol.localeCompare(b.symbol);
}

export function analyzeCoins(trades: readonly ULTradeInput[]): ULCoinAnalysis {
  if (trades.length === 0) {
    return { rows: [], bestCoin: null, worstCoin: null };
  }

  const map = new Map<
    string,
    {
      trades: number;
      wins: number;
      losses: number;
      pnl: number;
      rrSum: number;
      rrCount: number;
    }
  >();

  for (const t of trades) {
    const key = t.symbol.replace(/USDT$/i, '').toUpperCase() || t.symbol;
    let acc = map.get(key);
    if (!acc) {
      acc = { trades: 0, wins: 0, losses: 0, pnl: 0, rrSum: 0, rrCount: 0 };
      map.set(key, acc);
    }
    acc.trades += 1;
    acc.pnl += t.pnl;
    if (t.pnl > 0) acc.wins += 1;
    else if (t.pnl < 0) acc.losses += 1;
    if (t.rr != null && Number.isFinite(t.rr) && t.rr > 0) {
      acc.rrSum += t.rr;
      acc.rrCount += 1;
    }
  }

  const drafted: Omit<ULCoinStats, 'rank'>[] = [...map.entries()].map(([symbol, acc]) => {
    const base = {
      symbol,
      trades: acc.trades,
      wins: acc.wins,
      losses: acc.losses,
      winRate: metricWinRate(acc.wins, acc.trades),
      totalPnl: acc.pnl,
      averageRr: metricAverage(acc.rrSum, acc.rrCount),
      expectancy: metricExpectancy(acc.pnl, acc.trades),
    };
    return { ...base, score: coinScore(base) };
  });

  drafted.sort(compareCoins);

  const rows: ULCoinStats[] = drafted.map((r, i) => ({ ...r, rank: i + 1 }));
  const bestCoin = rows[0]?.symbol ?? null;
  const worstCoin = rows.length ? rows[rows.length - 1]!.symbol : null;

  return { rows, bestCoin, worstCoin };
}

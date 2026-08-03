/**
 * Task 15.0 / 15.0.1 — UL metric primitives (Layer 2).
 * Pure functions. No UI / React. No wall-clock Date.
 */

import type { ULCoreMetrics, ULTradeInput } from './types';

export function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function metricWinRate(wins: number, total: number): number {
  if (total <= 0) return 0;
  return (wins / total) * 100;
}

export function metricProfitFactor(grossProfit: number, grossLossAbs: number): number {
  // No losses + profit → strong finite PF (avoid Infinity in scores).
  if (grossLossAbs <= 0) return grossProfit > 0 ? 99 : 0;
  if (grossProfit <= 0) return 0;
  return grossProfit / grossLossAbs;
}

export function metricExpectancy(pnlSum: number, count: number): number {
  if (count <= 0) return 0;
  return pnlSum / count;
}

export function metricAverage(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return sum / count;
}

/** Sort closed trades by close time ascending (stable for equity). O(n log n). */
export function sortTradesByClose(trades: readonly ULTradeInput[]): ULTradeInput[] {
  return [...trades].sort((a, b) => {
    const d = a.closedAt - b.closedAt;
    if (d !== 0) return d;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

export type EquitySeries = {
  points: { equity: number; pnl: number; closedAt: number }[];
  maxDrawdown: number;
  currentDrawdown: number;
  peak: number;
  netPnl: number;
};

/** Running equity from cumulative PnL starting at 0. O(n). */
export function buildEquitySeries(trades: readonly ULTradeInput[]): EquitySeries {
  const ordered = sortTradesByClose(trades);
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  const points: EquitySeries['points'] = [];

  for (const t of ordered) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
    points.push({ equity, pnl: t.pnl, closedAt: t.closedAt });
  }

  const currentDd = peak - equity;
  return {
    points,
    maxDrawdown: maxDd,
    currentDrawdown: Math.max(0, currentDd),
    peak,
    netPnl: equity,
  };
}

/**
 * UTC day key from epoch ms — deterministic given `ms`.
 * Uses Date only as a UTC calendar decoder (not wall clock).
 */
export function dayKeyUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyMetrics(): ULCoreMetrics {
  return {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    averageRr: null,
    averageWinner: null,
    averageLoser: null,
    largestWin: null,
    largestLoss: null,
    averageHoldingTime: null,
    maxDrawdown: 0,
    currentDrawdown: 0,
    recoveryFactor: null,
    calmarRatio: null,
    consistencyScore: 0,
    stabilityScore: 0,
    performanceScore: 0,
    netPnl: 0,
    grossProfit: 0,
    grossLoss: 0,
  };
}

/**
 * Base performance pillar 0–100 from WR / PF / recovery (Layer 2).
 * Final weighted score is Layer 6 (Score Engine).
 */
export function computeBasePerformanceScore(input: {
  winRate: number;
  profitFactor: number;
  recoveryFactor: number | null;
  netPnl: number;
}): number {
  const parts: number[] = [];
  parts.push(Math.min(100, Math.max(0, input.winRate)));
  parts.push(Math.min(100, Math.max(0, (input.profitFactor / 3) * 100)));
  if (input.recoveryFactor != null) {
    parts.push(Math.min(100, Math.max(0, (input.recoveryFactor / 3) * 100)));
  }
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  const pnlTilt = input.netPnl > 0 ? 3 : input.netPnl < 0 ? -3 : 0;
  return Math.round(Math.max(0, Math.min(100, avg + pnlTilt)));
}

/** 0–100: rewards steady win rate + PF and low day-to-day PnL volatility. */
export function computeConsistencyScore(
  trades: readonly ULTradeInput[],
  winRate: number,
  profitFactor: number,
): number {
  if (trades.length < 2) return 0;
  const byDay = new Map<string, number>();
  for (const t of trades) {
    const key = dayKeyUtc(t.closedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + t.pnl);
  }
  const dayPnls = [...byDay.values()];
  if (dayPnls.length < 2) {
    const wrPart = Math.min(100, Math.max(0, winRate));
    const pfPart = Math.min(100, Math.max(0, (profitFactor / 2) * 100));
    return Math.round(wrPart * 0.5 + pfPart * 0.5);
  }
  const mean = dayPnls.reduce((a, b) => a + b, 0) / dayPnls.length;
  const variance =
    dayPnls.reduce((a, b) => a + (b - mean) * (b - mean), 0) / dayPnls.length;
  const std = Math.sqrt(variance);
  const absMean = Math.abs(mean) || 1;
  const cv = std / absMean;
  const volScore = Math.max(0, Math.min(100, 100 - cv * 40));
  const wrPart = Math.min(100, Math.max(0, winRate));
  const pfPart = Math.min(100, Math.max(0, (profitFactor / 2.5) * 100));
  return Math.round(volScore * 0.4 + wrPart * 0.3 + pfPart * 0.3);
}

/** 0–100: lower drawdown relative to gains → higher stability. */
export function computeStabilityScore(
  maxDrawdown: number,
  currentDrawdown: number,
  netPnl: number,
  trades: number,
): number {
  if (trades < 2) return 0;
  const scale = Math.max(Math.abs(netPnl), maxDrawdown, 1);
  const ddPenalty = (maxDrawdown / scale) * 55;
  const curPenalty = (currentDrawdown / scale) * 25;
  const pnlBonus = netPnl > 0 ? 20 : netPnl === 0 ? 10 : 0;
  return Math.round(Math.max(0, Math.min(100, 100 - ddPenalty - curPenalty + pnlBonus)));
}

/** @deprecated Use computeBasePerformanceScore — kept for barrel compat. */
export function computePerformanceScore(input: {
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  recoveryFactor: number | null;
  consistencyScore: number | null;
  stabilityScore: number | null;
  netPnl: number;
}): number {
  return computeBasePerformanceScore({
    winRate: input.winRate ?? 0,
    profitFactor: input.profitFactor ?? 0,
    recoveryFactor: input.recoveryFactor,
    netPnl: input.netPnl,
  });
}

export function computeCoreMetrics(trades: readonly ULTradeInput[]): ULCoreMetrics {
  const n = trades.length;
  if (n === 0) return emptyMetrics();

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winSum = 0;
  let winCount = 0;
  let lossSum = 0;
  let lossCount = 0;
  let largestWin: number | null = null;
  let largestLoss: number | null = null;
  let rrSum = 0;
  let rrCount = 0;
  let holdSum = 0;
  let holdCount = 0;
  let pnlSum = 0;

  for (const t of trades) {
    pnlSum += t.pnl;
    if (t.pnl > 0) {
      wins += 1;
      grossProfit += t.pnl;
      winSum += t.pnl;
      winCount += 1;
      if (largestWin == null || t.pnl > largestWin) largestWin = t.pnl;
    } else if (t.pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(t.pnl);
      lossSum += t.pnl;
      lossCount += 1;
      if (largestLoss == null || t.pnl < largestLoss) largestLoss = t.pnl;
    } else {
      breakevens += 1;
    }

    if (isFiniteNumber(t.rr) && t.rr > 0) {
      rrSum += t.rr;
      rrCount += 1;
    }
    if (isFiniteNumber(t.duration) && t.duration >= 0) {
      holdSum += t.duration;
      holdCount += 1;
    }
  }

  const equity = buildEquitySeries(trades);
  const winRate = metricWinRate(wins, n);
  const profitFactor = metricProfitFactor(grossProfit, grossLoss);
  const expectancy = metricExpectancy(pnlSum, n);
  const averageRr = metricAverage(rrSum, rrCount);
  const averageWinner = metricAverage(winSum, winCount);
  const averageLoser = metricAverage(lossSum, lossCount);
  const averageHoldingTime = metricAverage(holdSum, holdCount);

  const maxDrawdown = equity.maxDrawdown;
  const currentDrawdown = equity.currentDrawdown;
  const recoveryFactor =
    maxDrawdown > 0 ? equity.netPnl / maxDrawdown : equity.netPnl > 0 ? null : null;
  const calmarRatio = maxDrawdown > 0 ? equity.netPnl / maxDrawdown : null;

  const consistencyScore = computeConsistencyScore(trades, winRate, profitFactor);
  const stabilityScore = computeStabilityScore(maxDrawdown, currentDrawdown, equity.netPnl, n);
  const performanceScore = computeBasePerformanceScore({
    winRate,
    profitFactor,
    recoveryFactor,
    netPnl: equity.netPnl,
  });

  return {
    totalTrades: n,
    wins,
    losses,
    breakevens,
    winRate,
    profitFactor,
    expectancy,
    averageRr,
    averageWinner,
    averageLoser,
    largestWin,
    largestLoss,
    averageHoldingTime,
    maxDrawdown,
    currentDrawdown,
    recoveryFactor,
    calmarRatio,
    consistencyScore,
    stabilityScore,
    performanceScore,
    netPnl: equity.netPnl,
    grossProfit,
    grossLoss,
  };
}

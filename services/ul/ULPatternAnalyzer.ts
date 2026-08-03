/**
 * Task 15.0 — UL Pattern Analyzer.
 * Streaks, hour/weekday/strategy performance.
 */

import { metricAverage, sortTradesByClose } from './ULMetrics';
import type { ULPatternAnalysis, ULTradeInput } from './types';

type Bucket = { pnl: number; trades: number };

function emptyHourBuckets(): Bucket[] {
  return Array.from({ length: 24 }, () => ({ pnl: 0, trades: 0 }));
}

function emptyWeekdayBuckets(): Bucket[] {
  return Array.from({ length: 7 }, () => ({ pnl: 0, trades: 0 }));
}

function bestWorstKey(
  entries: ReadonlyArray<{ key: string; pnl: number; trades: number }>,
  minTrades = 1,
): { best: string | null; worst: string | null } {
  const eligible = entries.filter((e) => e.trades >= minTrades);
  if (eligible.length === 0) return { best: null, worst: null };
  let best = eligible[0]!;
  let worst = eligible[0]!;
  for (const e of eligible) {
    if (e.pnl > best.pnl) best = e;
    if (e.pnl < worst.pnl) worst = e;
  }
  return { best: best.key, worst: worst.key };
}

export function analyzePatterns(trades: readonly ULTradeInput[]): ULPatternAnalysis {
  if (trades.length === 0) {
    return {
      winningStreak: 0,
      losingStreak: 0,
      bestTradingHour: null,
      worstTradingHour: null,
      bestWeekday: null,
      worstWeekday: null,
      bestStrategy: null,
      worstStrategy: null,
      averageTradeDuration: null,
      pnlByHour: emptyHourBuckets().map((b, hour) => ({ hour, ...b })),
      pnlByWeekday: emptyWeekdayBuckets().map((b, weekday) => ({ weekday, ...b })),
    };
  }

  const ordered = sortTradesByClose(trades);
  let winStreak = 0;
  let lossStreak = 0;
  let maxWin = 0;
  let maxLoss = 0;
  let holdSum = 0;
  let holdCount = 0;

  const hours = emptyHourBuckets();
  const weekdays = emptyWeekdayBuckets();
  const strategies = new Map<string, Bucket>();

  for (const t of ordered) {
    if (t.pnl > 0) {
      winStreak += 1;
      lossStreak = 0;
      if (winStreak > maxWin) maxWin = winStreak;
    } else if (t.pnl < 0) {
      lossStreak += 1;
      winStreak = 0;
      if (lossStreak > maxLoss) maxLoss = lossStreak;
    } else {
      winStreak = 0;
      lossStreak = 0;
    }

    const d = new Date(t.closedAt);
    const hour = d.getUTCHours();
    const weekday = d.getUTCDay();
    hours[hour]!.pnl += t.pnl;
    hours[hour]!.trades += 1;
    weekdays[weekday]!.pnl += t.pnl;
    weekdays[weekday]!.trades += 1;

    const sk = (t.strategy || 'UNKNOWN').trim() || 'UNKNOWN';
    const sb = strategies.get(sk) ?? { pnl: 0, trades: 0 };
    sb.pnl += t.pnl;
    sb.trades += 1;
    strategies.set(sk, sb);

    if (Number.isFinite(t.duration) && t.duration >= 0) {
      holdSum += t.duration;
      holdCount += 1;
    }
  }

  const hourEntries = hours.map((b, hour) => ({
    key: String(hour),
    pnl: b.pnl,
    trades: b.trades,
  }));
  const weekdayEntries = weekdays.map((b, weekday) => ({
    key: String(weekday),
    pnl: b.pnl,
    trades: b.trades,
  }));
  const strategyEntries = [...strategies.entries()].map(([key, b]) => ({
    key,
    pnl: b.pnl,
    trades: b.trades,
  }));

  const hourBW = bestWorstKey(hourEntries);
  const dayBW = bestWorstKey(weekdayEntries);
  const stratBW = bestWorstKey(strategyEntries);

  return {
    winningStreak: maxWin,
    losingStreak: maxLoss,
    bestTradingHour: hourBW.best == null ? null : Number(hourBW.best),
    worstTradingHour: hourBW.worst == null ? null : Number(hourBW.worst),
    bestWeekday: dayBW.best == null ? null : Number(dayBW.best),
    worstWeekday: dayBW.worst == null ? null : Number(dayBW.worst),
    bestStrategy: stratBW.best,
    worstStrategy: stratBW.worst,
    averageTradeDuration: metricAverage(holdSum, holdCount),
    pnlByHour: hours.map((b, hour) => ({ hour, pnl: b.pnl, trades: b.trades })),
    pnlByWeekday: weekdays.map((b, weekday) => ({
      weekday,
      pnl: b.pnl,
      trades: b.trades,
    })),
  };
}

/**
 * Task 15.6 — Group trades by strategy + build rows / heatmap / ranking.
 * O(n) grouping; per-strategy metrics via UL computeCoreMetrics (reuse, no duplicate formulas).
 */

import { computeCoreMetrics, sortTradesByClose } from '../ULMetrics';
import type { ULDashboardData, ULTradeInput } from '../types';
import {
  STRATEGY_RULES,
  lifecycleFromSignals,
  strategyCompositeScore,
  strategyConfidence,
  strategyGradeFromScore,
  strategyStatusFromScore,
} from './StrategyAnalyticsRules';
import type {
  StrategyAnalyticsRow,
  StrategyHeatmap,
  StrategyHeatmapCell,
  StrategyLifecycle,
  StrategyRankingEntry,
  StrategyTrendTag,
} from './StrategyAnalyticsTypes';

function strategyKey(t: ULTradeInput): string {
  const s = (t.strategy || 'UNKNOWN').trim();
  return s.length ? s : 'UNKNOWN';
}

/** O(n) group by strategy name. */
export function groupTradesByStrategy(
  trades: readonly ULTradeInput[],
): Map<string, ULTradeInput[]> {
  const map = new Map<string, ULTradeInput[]>();
  for (const t of trades) {
    const key = strategyKey(t);
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(t);
  }
  return map;
}

function halfWindowTrend(trades: readonly ULTradeInput[]): {
  improving: boolean;
  declining: boolean;
  stable: boolean;
} {
  if (trades.length < 4) {
    return { improving: false, declining: false, stable: true };
  }
  const ordered = sortTradesByClose(trades);
  const mid = Math.floor(ordered.length / 2);
  const first = computeCoreMetrics(ordered.slice(0, mid));
  const second = computeCoreMetrics(ordered.slice(mid));
  const delta = second.expectancy - first.expectancy;
  if (delta >= STRATEGY_RULES.TREND_EPS) {
    return { improving: true, declining: false, stable: false };
  }
  if (delta <= -STRATEGY_RULES.TREND_EPS) {
    return { improving: false, declining: true, stable: false };
  }
  return { improving: false, declining: false, stable: true };
}

function recommendationFor(row: {
  status: StrategyAnalyticsRow['status'];
  lifecycle: StrategyLifecycle;
  tags: readonly StrategyTrendTag[];
  name: string;
}): string {
  if (row.status === 'Disabled') return `Disable ${row.name} — do not trade.`;
  if (row.tags.includes('Dead Strategy') || row.status === 'Deprecated') {
    return `Deprecate ${row.name} — insufficient or failed edge.`;
  }
  if (row.tags.includes('Overfit Strategy')) {
    return `Treat ${row.name} cautiously — small perfect sample may overfit.`;
  }
  if (row.tags.includes('Declining Strategy') || row.lifecycle === 'Declining') {
    return `Reduce size on ${row.name} — performance declining.`;
  }
  if (row.tags.includes('Improving Strategy') || row.lifecycle === 'Growing') {
    return `Allow modest size growth on ${row.name}.`;
  }
  if (row.status === 'Excellent' || row.status === 'Healthy') {
    return `Keep ${row.name} as a primary strategy.`;
  }
  if (row.status === 'Watch') return `Monitor ${row.name} closely.`;
  return `Review ${row.name} edge before adding size.`;
}

export function buildStrategyRows(
  trades: readonly ULTradeInput[],
  options?: { disabledNames?: ReadonlySet<string> },
): StrategyAnalyticsRow[] {
  const groups = groupTradesByStrategy(trades);
  const disabled = options?.disabledNames ?? new Set<string>();
  const rows: StrategyAnalyticsRow[] = [];

  for (const [name, group] of groups) {
    const metrics = computeCoreMetrics(group);
    const trend = halfWindowTrend(group);
    const score = strategyCompositeScore({
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      expectancy: metrics.expectancy,
      consistency: metrics.consistencyScore,
      performance: metrics.performanceScore,
      stability: metrics.stabilityScore,
      netPnL: metrics.netPnl,
    });
    const confidence = strategyConfidence({
      tradeCount: metrics.totalTrades,
      consistency: metrics.consistencyScore,
      profitFactor: metrics.profitFactor,
      maxDrawdown: metrics.maxDrawdown,
      netPnL: metrics.netPnl,
    });
    const dead =
      metrics.totalTrades <= STRATEGY_RULES.DEAD_MAX_TRADES && metrics.netPnl <= 0;
    const overfit =
      metrics.totalTrades <= STRATEGY_RULES.OVERFIT_MAX_TRADES &&
      metrics.winRate >= STRATEGY_RULES.OVERFIT_MIN_WR &&
      metrics.totalTrades >= 2;
    const isDisabled = disabled.has(name);
    const grade = strategyGradeFromScore(score);
    const status = strategyStatusFromScore(score, metrics.totalTrades, dead, isDisabled);
    const lifecycle = lifecycleFromSignals({
      tradeCount: metrics.totalTrades,
      improving: trend.improving,
      declining: trend.declining,
      dead,
      score,
    });

    const tags: StrategyTrendTag[] = [];
    if (trend.improving) tags.push('Improving Strategy');
    if (trend.declining) tags.push('Declining Strategy');
    if (trend.stable && metrics.totalTrades >= STRATEGY_RULES.MIN_TRADES_STABLE) {
      tags.push('Stable Strategy');
    }
    if (dead) tags.push('Dead Strategy');
    if (overfit) tags.push('Overfit Strategy');

    const draft = {
      status,
      lifecycle,
      tags,
      name,
    };

    rows.push({
      id: `strat-${name}`,
      name,
      tradeCount: metrics.totalTrades,
      winRate: metrics.winRate,
      profitFactor: metrics.profitFactor,
      expectancy: metrics.expectancy,
      averageRR: metrics.averageRr,
      netPnL: metrics.netPnl,
      largestWin: metrics.largestWin,
      largestLoss: metrics.largestLoss,
      maxDrawdown: metrics.maxDrawdown,
      recoveryFactor: metrics.recoveryFactor,
      consistency: metrics.consistencyScore,
      performance: metrics.performanceScore,
      stability: metrics.stabilityScore,
      confidence,
      score,
      grade,
      status,
      lifecycle,
      recommendation: recommendationFor(draft),
      tags,
    });
  }

  // Attach best/worst tags after ranking (immutable rebuild)
  const ranked = rankStrategies(rows);
  if (ranked.length === 0) return rows;

  const bestId = ranked[0]!.strategyId;
  const worstId = ranked[ranked.length - 1]!.strategyId;

  return rows.map((row) => {
    const nextTags: StrategyTrendTag[] = [...row.tags];
    if (row.id === bestId) nextTags.push('Best Strategy');
    if (ranked.length >= 2 && row.id === worstId) nextTags.push('Worst Strategy');
    return {
      ...row,
      tags: nextTags,
      recommendation: recommendationFor({
        status: row.status,
        lifecycle: row.lifecycle,
        tags: nextTags,
        name: row.name,
      }),
    };
  });
}

/** Sort: Score → PF → Expectancy → Trades (desc). */
export function rankStrategies(rows: readonly StrategyAnalyticsRow[]): StrategyRankingEntry[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.profitFactor !== a.profitFactor) return b.profitFactor - a.profitFactor;
    if (b.expectancy !== a.expectancy) return b.expectancy - a.expectancy;
    if (b.tradeCount !== a.tradeCount) return b.tradeCount - a.tradeCount;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((r, i) => ({
    rank: i + 1,
    strategyId: r.id,
    name: r.name,
    score: r.score,
    profitFactor: r.profitFactor,
    expectancy: r.expectancy,
    tradeCount: r.tradeCount,
  }));
}

function bumpHeat(
  map: Map<string, { trades: number; pnl: number }>,
  bucket: string,
  pnl: number,
): void {
  const cur = map.get(bucket) ?? { trades: 0, pnl: 0 };
  cur.trades += 1;
  cur.pnl += pnl;
  map.set(bucket, cur);
}

function toCells(
  dim: string,
  map: Map<string, { trades: number; pnl: number }>,
): StrategyHeatmapCell[] {
  return [...map.entries()]
    .map(([bucket, v]) => ({
      key: `${dim}:${bucket}`,
      bucket,
      trades: v.trades,
      pnl: v.pnl,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** Global heatmap across all trades (O(n)). */
export function buildStrategyHeatmap(trades: readonly ULTradeInput[]): StrategyHeatmap {
  const hour = new Map<string, { trades: number; pnl: number }>();
  const weekday = new Map<string, { trades: number; pnl: number }>();
  const market = new Map<string, { trades: number; pnl: number }>();
  const coin = new Map<string, { trades: number; pnl: number }>();

  for (const t of trades) {
    const d = new Date(t.closedAt);
    bumpHeat(hour, String(d.getUTCHours()), t.pnl);
    bumpHeat(weekday, String(d.getUTCDay()), t.pnl);
    bumpHeat(market, t.side, t.pnl);
    const sym = t.symbol.replace(/USDT$/i, '').toUpperCase() || t.symbol;
    bumpHeat(coin, sym, t.pnl);
  }

  return {
    hour: toCells('hour', hour),
    weekday: toCells('weekday', weekday),
    market: toCells('market', market),
    coin: toCells('coin', coin),
  };
}

export function overallConfidence(rows: readonly StrategyAnalyticsRow[]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((a, r) => a + r.confidence, 0);
  return Math.round(sum / rows.length);
}

/** Optional: mark disabled strategies from dashboard pattern worst with zero path — none by default. */
export function disabledStrategiesFromDashboard(
  _dashboard: ULDashboardData | null | undefined,
): ReadonlySet<string> {
  return new Set();
}

/**
 * Task 14.4 — Summary / Today / Quick stats widgets — copy from Performance VM.
 */

import type { PerformanceViewModel, RankedRow } from '../performance';
import {
  mapTradingStatus,
  resolveSystemHealth,
} from './dashboardHealth';
import type {
  DashboardFilter,
  QuickStatisticsWidget,
  TodayPerformanceWidget,
  TopPicksWidget,
  TradingSummaryWidget,
} from './dashboardTypes';

function firstKey(rows: readonly RankedRow[]): string | null {
  return rows[0]?.key ?? null;
}

function lastKey(rows: readonly RankedRow[]): string | null {
  return rows.length > 0 ? rows[rows.length - 1]!.key : null;
}

export function buildTradingSummary(perf: PerformanceViewModel): TradingSummaryWidget {
  const o = perf.overall;
  return {
    overallGrade: o.overallGrade,
    overallScore: o.overallScore,
    systemHealth: resolveSystemHealth(o),
    tradingStatus: mapTradingStatus(o),
    generatedAt: perf.snapshot.generatedAt,
  };
}

/**
 * "Today" window — present Performance 7d / coin ranking tops (no day aggregation).
 */
export function buildTodayPerformance(perf: PerformanceViewModel): TodayPerformanceWidget {
  const t7 = perf.trends.find((t) => t.window === '7d');
  const best = firstKey(perf.coinRanking);
  const worst = lastKey(perf.coinRanking);
  const top = perf.coinRanking[0];
  return {
    todayTrades: top?.trades ?? null,
    todayWinrate: top?.winRate ?? null,
    todayNetPnl: top?.pnlUsdt ?? null,
    todayRr: top?.averageRr ?? null,
    todayBestCoin: best,
    todayWorstCoin: worst,
    sourceWindow: t7?.window ?? 'performance-coin-ranking',
  };
}

export function buildTopPicks(
  perf: PerformanceViewModel,
  filter: DashboardFilter,
): TopPicksWidget {
  const coinRows = filter.coin
    ? perf.coinRanking.filter((r) => r.key === filter.coin)
    : perf.coinRanking;
  const strategyRows = filter.strategy
    ? perf.strategyRanking.filter((r) => r.key === filter.strategy)
    : perf.strategyRanking;
  const tagRows = filter.tag
    ? perf.tagIntelligence.topWinningTags.filter((r) => r.key === filter.tag)
    : perf.tagIntelligence.topWinningTags;

  const conf = [...perf.confidenceAnalysis].sort((a, b) => a.key.localeCompare(b.key));
  const topConf =
    conf.find((c) => c.key === 'High')?.key ??
    conf[0]?.key ??
    null;

  return {
    topStrategy: firstKey(strategyRows),
    topCoin: firstKey(coinRows),
    topTrigger: firstKey(perf.triggerRanking),
    topConfidence: topConf,
    topAdvisor: firstKey(perf.advisorRanking),
    topTag: firstKey(tagRows),
  };
}

/** Quick stats copied from top strategy ranking row (Performance fields). */
export function buildQuickStatistics(perf: PerformanceViewModel): QuickStatisticsWidget {
  const row = perf.strategyRanking[0];
  if (!row) {
    return {
      trades: null,
      winrate: null,
      profitFactor: null,
      expectancy: null,
      averageRr: null,
      holdingTime: null,
      sourceKey: 'none',
    };
  }
  return {
    trades: row.trades,
    winrate: row.winRate,
    profitFactor: row.profitFactor,
    expectancy: row.expectancyUsdt,
    averageRr: row.averageRr,
    holdingTime: row.avgHoldingMinutes,
    sourceKey: `strategyRanking:#1:${row.key}`,
  };
}

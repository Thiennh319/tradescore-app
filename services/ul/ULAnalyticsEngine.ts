/**
 * Task 15.0.1 — UL Analytics Engine orchestrator.
 *
 * Layers (no reverse calls):
 * 1 Input Adapter → 2 Core Metrics → 3 Coin → 4 Pattern → 5 Risk → 6 Score → 7 Recs
 * → Dashboard Output (+ optional plugins)
 *
 * Deterministic: no Math.random / Date.now / new Date() for wall clock.
 * generatedAt must come from options (default "").
 */

import { analyzeCoins } from './ULCoinAnalyzer';
import { clearUlAnalyticsCache, readUlCache, writeUlCache } from './ULCache';
import { formatPct, formatScore, formatUsdt } from './ULFormat';
import { fingerprintTrades, sanitizeTrades } from './ULInputAdapter';
import {
  buildEquitySeries,
  computeCoreMetrics,
  dayKeyUtc,
  sortTradesByClose,
} from './ULMetrics';
import { analyzePatterns } from './ULPatternAnalyzer';
import { applyUlPlugins } from './ULPlugin';
import { buildRecommendations } from './ULRecommendationEngine';
import { analyzeRisk } from './ULRiskAnalyzer';
import { buildScoreBreakdown } from './ULScoreEngine';
import type {
  ULBuildOptions,
  ULCharts,
  ULDashboardData,
  ULDashboardKPI,
  ULInsightCard,
  ULTradeInput,
} from './types';
import { UL_ANALYTICS_VERSION } from './types';

function buildCharts(trades: readonly ULTradeInput[]): ULCharts {
  if (trades.length === 0) {
    return { equityCurve: [], dailyPnl: [] };
  }

  const equity = buildEquitySeries(trades);
  const equityCurve = equity.points.map((p, index) => ({
    index,
    equity: p.equity,
    pnl: p.pnl,
    closedAt: p.closedAt,
  }));

  const byDay = new Map<string, { pnl: number; trades: number }>();
  for (const t of sortTradesByClose(trades)) {
    const key = dayKeyUtc(t.closedAt);
    const cur = byDay.get(key) ?? { pnl: 0, trades: 0 };
    cur.pnl += t.pnl;
    cur.trades += 1;
    byDay.set(key, cur);
  }
  const dailyPnl = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, v]) => ({ dayKey, pnl: v.pnl, trades: v.trades }));

  return { equityCurve, dailyPnl };
}

function buildInsights(input: {
  metrics: ReturnType<typeof computeCoreMetrics>;
  coins: ReturnType<typeof analyzeCoins>;
  patterns: ReturnType<typeof analyzePatterns>;
  risk: ReturnType<typeof analyzeRisk>;
  score: ReturnType<typeof buildScoreBreakdown>;
}): ULInsightCard[] {
  const { metrics, coins, patterns, risk, score } = input;
  if (metrics.totalTrades === 0) return [];

  const cards: ULInsightCard[] = [];

  cards.push({
    id: 'ul-insight-score',
    title: 'Performance Score',
    subtitle: `Grade ${score.grade}`,
    value: formatScore(score.performanceScore),
    tint:
      score.grade === 'A+' || score.grade === 'A' || score.grade === 'B+'
        ? 'green'
        : score.grade === 'F' || score.grade === 'D'
          ? 'red'
          : 'amber',
  });

  cards.push({
    id: 'ul-insight-risk',
    title: 'Risk Level',
    subtitle: risk.summary,
    value: risk.riskLevel,
    tint:
      risk.riskLevel === 'LOW'
        ? 'green'
        : risk.riskLevel === 'MEDIUM'
          ? 'amber'
          : risk.riskLevel === 'HIGH'
            ? 'red'
            : 'purple',
  });

  if (coins.bestCoin) {
    cards.push({
      id: 'ul-insight-best-coin',
      title: 'Best Coin',
      subtitle: 'Theo ranking UL',
      value: coins.bestCoin,
      tint: 'green',
    });
  }

  if (coins.worstCoin && coins.worstCoin !== coins.bestCoin) {
    cards.push({
      id: 'ul-insight-worst-coin',
      title: 'Worst Coin',
      subtitle: 'Theo ranking UL',
      value: coins.worstCoin,
      tint: 'red',
    });
  }

  if (patterns.winningStreak > 0 || patterns.losingStreak > 0) {
    cards.push({
      id: 'ul-insight-streak',
      title: 'Streak',
      subtitle: `Win ${patterns.winningStreak} / Loss ${patterns.losingStreak}`,
      value: `${patterns.winningStreak}W / ${patterns.losingStreak}L`,
      tint: patterns.losingStreak >= patterns.winningStreak ? 'red' : 'green',
    });
  }

  if (patterns.bestStrategy) {
    cards.push({
      id: 'ul-insight-strategy',
      title: 'Best Strategy',
      subtitle: patterns.worstStrategy
        ? `Worst: ${patterns.worstStrategy}`
        : 'Theo PnL strategy',
      value: patterns.bestStrategy,
      tint: 'blue',
    });
  }

  cards.push({
    id: 'ul-insight-expectancy',
    title: 'Expectancy',
    subtitle: 'USDT / trade',
    value: formatUsdt(metrics.expectancy),
    tint: metrics.expectancy >= 0 ? 'green' : 'red',
  });

  cards.push({
    id: 'ul-insight-winrate',
    title: 'Win Rate',
    subtitle: 'Closed trades',
    value: `${formatPct(metrics.winRate)}%`,
    tint: metrics.winRate >= 50 ? 'green' : 'red',
  });

  return cards.slice(0, 8);
}

function buildDashboardFromTrades(
  trades: readonly ULTradeInput[],
  fingerprint: string,
  generatedAt: string,
): ULDashboardData {
  // Layer 2
  const metrics = computeCoreMetrics(trades);
  // Layer 3
  const coinTable = analyzeCoins(trades);
  // Layer 4
  const patterns = analyzePatterns(trades);
  // Layer 5
  const risk = analyzeRisk(metrics);
  // Layer 6
  const score = buildScoreBreakdown(metrics, risk.score);
  // Charts (derived from Layer 2 equity; not a reverse call)
  const charts = buildCharts(trades);
  // Insights (presentation projection)
  const insights = buildInsights({ metrics, coins: coinTable, patterns, risk, score });
  // Layer 7
  const recommendations = buildRecommendations({
    metrics,
    coins: coinTable,
    patterns,
    risk,
  });

  const finalMetrics = {
    ...metrics,
    performanceScore: score.performanceScore,
  };

  const kpi: ULDashboardKPI = {
    totalTrades: finalMetrics.totalTrades,
    winRate: finalMetrics.winRate,
    profitFactor: finalMetrics.profitFactor,
    expectancy: finalMetrics.expectancy,
    netPnl: finalMetrics.netPnl,
    performanceScore: score.performanceScore,
    grade: score.grade,
    riskLevel: risk.riskLevel,
  };

  return {
    version: UL_ANALYTICS_VERSION,
    generatedAt,
    tradeCount: trades.length,
    fingerprint,
    kpi,
    metrics: finalMetrics,
    charts,
    coinTable,
    patterns,
    risk,
    score,
    insights,
    recommendations,
  };
}

/**
 * Primary entry: build full UL dashboard payload from completed trades.
 * Invalid trades are skipped (never throws).
 */
export function buildULDashboard(
  trades: readonly unknown[],
  options?: ULBuildOptions,
): ULDashboardData {
  // Layer 1
  const sanitized = sanitizeTrades(trades);
  const fingerprint = fingerprintTrades(sanitized);
  const generatedAt = options?.generatedAt ?? '';

  if (!options?.bypassCache) {
    const hit = readUlCache(fingerprint);
    if (hit) {
      return {
        ...hit,
        generatedAt,
      };
    }
  }

  let dashboard = buildDashboardFromTrades(sanitized, fingerprint, generatedAt);
  dashboard = applyUlPlugins(dashboard, sanitized, options?.plugins);

  if (!options?.bypassCache) {
    writeUlCache(fingerprint, dashboard);
  }

  return dashboard;
}

/** Alias — matches task naming. */
export const runULAnalyticsEngine = buildULDashboard;

export { clearUlAnalyticsCache };

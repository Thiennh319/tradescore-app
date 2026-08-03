/**
 * Task 15.6 — Strategy Analytics Engine orchestrator.
 * Strategy performance only. Deterministic. No AI / UI / Trade Engine.
 */

import { sanitizeTrades } from '../ULInputAdapter';
import type { ULDashboardData, ULTradeInput } from '../types';
import {
  buildStrategyHeatmap,
  buildStrategyRows,
  disabledStrategiesFromDashboard,
  overallConfidence,
  rankStrategies,
} from './StrategyAnalyticsBuilder';
import type { StrategyAnalyticsReport } from './StrategyAnalyticsTypes';
import { STRATEGY_ANALYTICS_VERSION } from './StrategyAnalyticsTypes';

function emptyReport(): StrategyAnalyticsReport {
  return {
    version: STRATEGY_ANALYTICS_VERSION,
    summary: {
      strategyCount: 0,
      totalTrades: 0,
      headline: 'No strategy data.',
      bestStrategyId: null,
      worstStrategyId: null,
    },
    strategies: [],
    ranking: [],
    bestStrategy: null,
    worstStrategy: null,
    heatmap: { hour: [], weekday: [], market: [], coin: [] },
    lifecycle: [],
    confidence: 0,
  };
}

/**
 * Primary API — dashboard context + completed trades → StrategyAnalyticsReport.
 * Never throws. Does not mutate inputs.
 */
export function buildStrategyAnalyticsReport(
  dashboard: ULDashboardData | null | undefined,
  trades: readonly ULTradeInput[] | readonly unknown[] | null | undefined,
): StrategyAnalyticsReport {
  try {
    const sanitized = sanitizeTrades(trades ?? []);
    if (sanitized.length === 0) {
      return emptyReport();
    }

    const disabled = disabledStrategiesFromDashboard(dashboard);
    const strategies = buildStrategyRows(sanitized, { disabledNames: disabled });
    const ranking = rankStrategies(strategies);
    const bestStrategy = ranking.length ? strategies.find((s) => s.id === ranking[0]!.strategyId) ?? null : null;
    const worstStrategy =
      ranking.length >= 2
        ? strategies.find((s) => s.id === ranking[ranking.length - 1]!.strategyId) ?? null
        : ranking.length === 1
          ? bestStrategy
          : null;

    const headline = bestStrategy
      ? `Best strategy: ${bestStrategy.name} (grade ${bestStrategy.grade})`
      : 'Strategy analytics ready.';

    // Prefer dashboard tradeCount when provided; else sanitized length
    const totalTrades = dashboard?.tradeCount ?? sanitized.length;

    return {
      version: STRATEGY_ANALYTICS_VERSION,
      summary: {
        strategyCount: strategies.length,
        totalTrades,
        headline,
        bestStrategyId: bestStrategy?.id ?? null,
        worstStrategyId:
          ranking.length >= 2 ? ranking[ranking.length - 1]!.strategyId : bestStrategy?.id ?? null,
      },
      strategies,
      ranking,
      bestStrategy,
      worstStrategy: ranking.length >= 2 ? worstStrategy : null,
      heatmap: buildStrategyHeatmap(sanitized),
      lifecycle: strategies.map((s) => ({ strategyId: s.id, lifecycle: s.lifecycle })),
      confidence: overallConfidence(strategies),
    };
  } catch {
    return emptyReport();
  }
}

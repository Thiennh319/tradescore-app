/**
 * Task 14.4 — Alerts / insights / recommendations panel (read Performance only).
 */

import type { PerformanceViewModel } from '../performance';
import type { RecommendationPanelWidget, TrendPanelWidget } from './dashboardTypes';

export function buildRecommendationPanel(
  perf: PerformanceViewModel,
): RecommendationPanelWidget {
  return {
    items: perf.recommendations.slice(0, 3).map((r) => ({
      id: r.id,
      action: r.action,
      target: r.target,
      reason: r.reason,
      evidence: [...r.evidence],
    })),
    recommendationVersion: perf.snapshot.recommendationVersion,
  };
}

export function buildRecentTrends(perf: PerformanceViewModel): TrendPanelWidget[] {
  return perf.trends.map((t) => ({
    window: t.window,
    winrateTrend: t.winrateTrend,
    pnlTrend: t.profitTrend,
    drawdownTrend: t.drawdownTrend,
  }));
}

/** Active insights = recommendation headlines (no new generation). */
export function buildActiveInsights(perf: PerformanceViewModel): string[] {
  return perf.recommendations.map((r) => {
    if (r.action === 'PRIORITIZE') return `${r.target} outperforming / prioritize (${r.reason})`;
    if (r.action === 'REDUCE') return `Reduce ${r.target}: ${r.reason}`;
    return `Monitor ${r.target}: ${r.reason}`;
  });
}

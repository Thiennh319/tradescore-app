/**
 * Task 14.4 — Stable widget IDs (Rule #98) + risk monitor copy.
 */

import type { PerformanceViewModel } from '../performance';
import { mapOverallToRisk } from './dashboardHealth';
import type { DashboardWidget, RiskMonitorWidget } from './dashboardTypes';

export const DASHBOARD_WIDGET_IDS = {
  overallScore: 'overall-score',
  systemHealth: 'system-health',
  todayPerformance: 'today-performance',
  topStrategy: 'top-strategy',
  topPicks: 'top-picks',
  riskMonitor: 'risk-monitor',
  recommendations: 'recommendations',
  recentTrend: 'recent-trend',
  activeInsights: 'active-insights',
  quickStatistics: 'quick-statistics',
  quickFilters: 'quick-filters',
} as const;

export function buildDashboardWidgets(): DashboardWidget[] {
  return [
    { id: DASHBOARD_WIDGET_IDS.overallScore, title: 'Trading Summary', section: 1 },
    { id: DASHBOARD_WIDGET_IDS.todayPerformance, title: "Today's Performance", section: 2 },
    { id: DASHBOARD_WIDGET_IDS.systemHealth, title: 'System Health', section: 3 },
    { id: DASHBOARD_WIDGET_IDS.topPicks, title: 'Top Strategy / Coin / …', section: 4 },
    { id: DASHBOARD_WIDGET_IDS.riskMonitor, title: 'Risk Monitor', section: 5 },
    { id: DASHBOARD_WIDGET_IDS.recommendations, title: 'Recommendation Panel', section: 6 },
    { id: DASHBOARD_WIDGET_IDS.recentTrend, title: 'Recent Trend', section: 7 },
    { id: DASHBOARD_WIDGET_IDS.activeInsights, title: 'Active Insights', section: 8 },
    { id: DASHBOARD_WIDGET_IDS.quickStatistics, title: 'Quick Statistics', section: 9 },
    { id: DASHBOARD_WIDGET_IDS.quickFilters, title: 'Quick Filters', section: 10 },
  ];
}

export function buildRiskMonitor(perf: PerformanceViewModel): RiskMonitorWidget {
  const t30 = perf.trends.find((t) => t.window === '30d');
  const ddEvidence = perf.recommendations
    .flatMap((r) => r.evidence)
    .find((e) => e.includes('maxDD') || e.includes('Drawdown') || e.includes('DD'));

  return {
    currentDrawdownLabel: ddEvidence ?? null,
    recoveryTrend: t30?.recoveryTrend ?? perf.trends[0]?.recoveryTrend ?? null,
    largestLosingStreakLabel:
      perf.overall.consistency == null
        ? null
        : `consistency=${perf.overall.consistency}`,
    riskLevel: mapOverallToRisk(perf.overall),
    stability: perf.overall.systemStability,
    consistency: perf.overall.consistency,
  };
}

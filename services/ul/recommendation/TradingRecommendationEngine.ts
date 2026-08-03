/**
 * Task 15.4 — Trading Recommendation Engine orchestrator.
 * Deterministic · no AI · no calculation · no Journal access.
 */

import type { TradingInsightReport } from '../insight/TradingInsightTypes';
import type { ULDashboardData } from '../types';
import { buildRecommendationsFromInsights } from './TradingRecommendationBuilder';
import type {
  TradingRecommendation,
  TradingRecommendationReport,
  TradingRecommendationSummary,
} from './TradingRecommendationTypes';
import {
  TRADING_RECOMMENDATION_IMPACT_RANK,
  TRADING_RECOMMENDATION_PRIORITY_RANK,
  TRADING_RECOMMENDATION_VERSION,
} from './TradingRecommendationTypes';

function sortRecommendations(list: TradingRecommendation[]): TradingRecommendation[] {
  return [...list].sort((a, b) => {
    const p =
      TRADING_RECOMMENDATION_PRIORITY_RANK[a.priority] -
      TRADING_RECOMMENDATION_PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const i =
      TRADING_RECOMMENDATION_IMPACT_RANK[a.impact] - TRADING_RECOMMENDATION_IMPACT_RANK[b.impact];
    if (i !== 0) return i;
    return a.title.localeCompare(b.title);
  });
}

function emptyReport(headline: string): TradingRecommendationReport {
  return {
    version: TRADING_RECOMMENDATION_VERSION,
    summary: {
      headline,
      total: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0,
    },
    recommendations: [],
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
}

function buildSummary(recs: readonly TradingRecommendation[]): TradingRecommendationSummary {
  const criticalCount = recs.filter((r) => r.priority === 'CRITICAL').length;
  const highCount = recs.filter((r) => r.priority === 'HIGH').length;
  const mediumCount = recs.filter((r) => r.priority === 'MEDIUM').length;
  const lowCount = recs.filter((r) => r.priority === 'LOW').length;
  const infoCount = recs.filter((r) => r.priority === 'INFO').length;

  let headline = 'No recommendations for this window.';
  if (recs.length > 0) {
    headline = recs[0]!.title;
  }

  return {
    headline,
    total: recs.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
  };
}

/**
 * Primary API — insights (+ dashboard labels) → TradingRecommendationReport.
 * Never throws. Does not analyze or recalculate metrics.
 */
export function buildTradingRecommendationReport(
  insightReport: TradingInsightReport | null | undefined,
  dashboard: ULDashboardData | null | undefined,
): TradingRecommendationReport {
  try {
    if (insightReport == null) {
      return emptyReport('No insight report.');
    }

    const raw = buildRecommendationsFromInsights(insightReport, dashboard);
    const sorted = sortRecommendations(raw);
    const summary = buildSummary(sorted);

    return {
      version: TRADING_RECOMMENDATION_VERSION,
      summary,
      recommendations: sorted,
      critical: sorted.filter((r) => r.priority === 'CRITICAL'),
      high: sorted.filter((r) => r.priority === 'HIGH'),
      medium: sorted.filter((r) => r.priority === 'MEDIUM'),
      low: sorted.filter((r) => r.priority === 'LOW' || r.priority === 'INFO'),
    };
  } catch {
    return emptyReport('Recommendation mapping failed safely.');
  }
}

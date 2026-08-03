/**
 * Task 15.3 — Trading Insight Engine orchestrator.
 * Deterministic · no AI · no React.
 */

import type { ULCompareReport } from '../compare/ULCompareTypes';
import type { ULDashboardData } from '../types';
import { evaluateInsightRules, type BuiltInsight } from './TradingInsightBuilder';
import type {
  TradingInsight,
  TradingInsightReport,
  TradingInsightSummary,
} from './TradingInsightTypes';
import {
  TRADING_INSIGHT_SEVERITY_RANK,
  TRADING_INSIGHT_VERSION,
} from './TradingInsightTypes';

function stripBucket(i: BuiltInsight): TradingInsight {
  const { bucket: _b, ...rest } = i;
  return rest;
}

function sortInsights(list: BuiltInsight[]): BuiltInsight[] {
  return [...list].sort((a, b) => {
    const s =
      TRADING_INSIGHT_SEVERITY_RANK[a.severity] - TRADING_INSIGHT_SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.title.localeCompare(b.title);
  });
}

function emptyReport(headline: string): TradingInsightReport {
  return {
    version: TRADING_INSIGHT_VERSION,
    summary: {
      headline,
      insightCount: 0,
      strengthCount: 0,
      weaknessCount: 0,
      opportunityCount: 0,
      warningCount: 0,
      topSeverity: null,
    },
    insights: [],
    strengths: [],
    weaknesses: [],
    opportunities: [],
    warnings: [],
  };
}

function buildSummary(sorted: BuiltInsight[]): TradingInsightSummary {
  const strengths = sorted.filter((i) => i.bucket === 'strengths');
  const weaknesses = sorted.filter((i) => i.bucket === 'weaknesses');
  const opportunities = sorted.filter((i) => i.bucket === 'opportunities');
  const warnings = sorted.filter((i) => i.bucket === 'warnings');

  let headline = 'No material insights for this window.';
  if (warnings.length > 0) headline = warnings[0]!.title;
  else if (weaknesses.length > 0) headline = weaknesses[0]!.title;
  else if (strengths.length > 0) headline = strengths[0]!.title;
  else if (opportunities.length > 0) headline = opportunities[0]!.title;

  return {
    headline,
    insightCount: sorted.length,
    strengthCount: strengths.length,
    weaknessCount: weaknesses.length,
    opportunityCount: opportunities.length,
    warningCount: warnings.length,
    topSeverity: sorted[0]?.severity ?? null,
  };
}

/**
 * Primary API — convert UL dashboard + compare into TradingInsightReport.
 * Never throws.
 */
export function buildTradingInsightReport(
  dashboard: ULDashboardData | null | undefined,
  compare: ULCompareReport | null | undefined,
): TradingInsightReport {
  try {
    if (dashboard == null) {
      return emptyReport('No dashboard data.');
    }

    const evaluated = evaluateInsightRules(dashboard, compare);
    const sorted = sortInsights(evaluated);
    const summary = buildSummary(sorted);

    return {
      version: TRADING_INSIGHT_VERSION,
      summary,
      insights: sorted.map(stripBucket),
      strengths: sorted.filter((i) => i.bucket === 'strengths').map(stripBucket),
      weaknesses: sorted.filter((i) => i.bucket === 'weaknesses').map(stripBucket),
      opportunities: sorted.filter((i) => i.bucket === 'opportunities').map(stripBucket),
      warnings: sorted.filter((i) => i.bucket === 'warnings').map(stripBucket),
    };
  } catch {
    return emptyReport('Insight evaluation failed safely.');
  }
}

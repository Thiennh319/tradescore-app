/**
 * Task 15.5 — Trading Psychology Engine orchestrator.
 * Deterministic · no AI · no Journal mutation · no recommendation mutation.
 */

import type { TradingInsightReport } from '../insight/TradingInsightTypes';
import type { TradingRecommendationReport } from '../recommendation/TradingRecommendationTypes';
import type { ULDashboardData } from '../types';
import {
  bucketFindings,
  buildTraitScores,
  collectPsychologyFindings,
} from './TradingPsychologyBuilder';
import type {
  TradingPsychologyFinding,
  TradingPsychologyReport,
  TradingPsychologySummary,
} from './TradingPsychologyTypes';
import {
  TRADING_PSYCHOLOGY_SEVERITY_RANK,
  TRADING_PSYCHOLOGY_VERSION,
} from './TradingPsychologyTypes';

function sortFindings(list: TradingPsychologyFinding[]): TradingPsychologyFinding[] {
  return [...list].sort((a, b) => {
    const s =
      TRADING_PSYCHOLOGY_SEVERITY_RANK[a.severity] -
      TRADING_PSYCHOLOGY_SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.title.localeCompare(b.title);
  });
}

function emptyReport(headline: string): TradingPsychologyReport {
  const { traits, score, grade } = buildTraitScores([]);
  return {
    version: TRADING_PSYCHOLOGY_VERSION,
    summary: {
      headline,
      findingCount: 0,
      strengthCount: 0,
      weaknessCount: 0,
      warningCount: 0,
      habitCount: 0,
      topSeverity: null,
    },
    score,
    grade,
    traits,
    strengths: [],
    weaknesses: [],
    warnings: [],
    habits: [],
    findings: [],
  };
}

function buildSummary(
  findings: readonly TradingPsychologyFinding[],
  buckets: ReturnType<typeof bucketFindings>,
): TradingPsychologySummary {
  let headline = 'Psychology profile is neutral.';
  if (buckets.warnings[0]) headline = buckets.warnings[0].title;
  else if (buckets.weaknesses[0]) headline = buckets.weaknesses[0].title;
  else if (buckets.strengths[0]) headline = buckets.strengths[0].title;

  return {
    headline,
    findingCount: findings.length,
    strengthCount: buckets.strengths.length,
    weaknessCount: buckets.weaknesses.length,
    warningCount: buckets.warnings.length,
    habitCount: buckets.habits.length,
    topSeverity: findings[0]?.severity ?? null,
  };
}

/**
 * Primary API — dashboard + insight + recommendation → TradingPsychologyReport.
 * Never throws. Does not mutate inputs.
 */
export function buildTradingPsychologyReport(
  dashboard: ULDashboardData | null | undefined,
  insight: TradingInsightReport | null | undefined,
  recommendation: TradingRecommendationReport | null | undefined,
): TradingPsychologyReport {
  try {
    if (dashboard == null && insight == null && recommendation == null) {
      return emptyReport('No psychology inputs.');
    }

    const { findings: raw, specs } = collectPsychologyFindings(
      dashboard,
      insight,
      recommendation,
    );
    const findings = sortFindings(raw);
    const buckets = bucketFindings(findings);
    const { traits, score, grade } = buildTraitScores(specs);

    return {
      version: TRADING_PSYCHOLOGY_VERSION,
      summary: buildSummary(findings, {
        strengths: sortFindings(buckets.strengths),
        weaknesses: sortFindings(buckets.weaknesses),
        warnings: sortFindings(buckets.warnings),
        habits: sortFindings(buckets.habits),
      }),
      score,
      grade,
      traits,
      strengths: sortFindings(buckets.strengths),
      weaknesses: sortFindings(buckets.weaknesses),
      warnings: sortFindings(buckets.warnings),
      habits: sortFindings(buckets.habits),
      findings,
    };
  } catch {
    return emptyReport('Psychology evaluation failed safely.');
  }
}

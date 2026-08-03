/**
 * Task 15.5 — Build psychology findings + trait scores from existing reports.
 * Reads dashboard / insight / recommendation only — no Journal, no UL recalculation.
 */

import type { TradingInsightReport } from '../insight/TradingInsightTypes';
import type { TradingRecommendationReport } from '../recommendation/TradingRecommendationTypes';
import type { ULDashboardData } from '../types';
import { clampPsychologyConfidence } from './TradingPsychologyFormatter';
import {
  DETECTION_BY_INSIGHT_ID,
  DETECTION_BY_REC_ACTION_SUBSTR,
  PSYCHOLOGY_RULES,
  clampTraitScore,
  psychologyGradeFromScore,
  severityFromInsight,
  type PsychologyDetectionSpec,
} from './TradingPsychologyRules';
import type {
  TradingPsychologyFinding,
  TradingPsychologyGrade,
  TradingPsychologyTrait,
  TradingPsychologyTraitId,
} from './TradingPsychologyTypes';
import { TRADING_PSYCHOLOGY_TRAIT_IDS } from './TradingPsychologyTypes';

function findingFromSpec(
  spec: PsychologyDetectionSpec,
  severity: TradingPsychologyFinding['severity'],
  confidence: number,
  evidence: readonly string[],
  description: string,
): TradingPsychologyFinding {
  return {
    id: spec.id,
    title: spec.title,
    description,
    severity,
    confidence: clampPsychologyConfidence(confidence),
    psychologyType: spec.psychologyType,
    evidence: [...evidence],
    habit: spec.habit,
    improvement: spec.improvement,
  };
}

/** Dashboard-only heuristics using already-computed UL fields (read, don't recompute). */
function dashboardDetections(dashboard: ULDashboardData | null | undefined): {
  finding: TradingPsychologyFinding;
  spec: PsychologyDetectionSpec;
}[] {
  const out: { finding: TradingPsychologyFinding; spec: PsychologyDetectionSpec }[] = [];
  if (!dashboard) return out;
  const m = dashboard.metrics;
  const trades = dashboard.tradeCount ?? m.totalTrades ?? 0;

  if (trades >= PSYCHOLOGY_RULES.OVERTRADE_MIN && m.netPnl < 0) {
    const spec: PsychologyDetectionSpec = {
      id: 'psy-overtrade-volume',
      psychologyType: 'Over Trading',
      title: 'Over trading volume',
      habit: 'High trade count with negative net PnL',
      improvement: 'Cut frequency; quality over quantity',
      traitDeltas: { Patience: -10, Discipline: -8 },
      defaultSeverity: 'HIGH',
    };
    out.push({
      spec,
      finding: findingFromSpec(
        spec,
        'HIGH',
        78,
        [`trades=${trades}`, `netPnl=${m.netPnl}`],
        `Closed ${trades} trades with net PnL ${m.netPnl}.`,
      ),
    });
  }

  if (
    m.maxDrawdown > 0 &&
    Math.abs(m.netPnl) > 0 &&
    m.maxDrawdown >= Math.abs(m.netPnl) * PSYCHOLOGY_RULES.HIGH_DD_RATIO &&
    trades >= 3
  ) {
    const spec: PsychologyDetectionSpec = {
      id: 'psy-dd-pressure',
      psychologyType: 'Large Drawdown Behavior',
      title: 'Drawdown pressure behavior',
      habit: 'Operating through elevated drawdown vs net',
      improvement: 'Reduce size until DD cools',
      traitDeltas: { 'Risk Control': -12 },
      defaultSeverity: 'MEDIUM',
    };
    out.push({
      spec,
      finding: findingFromSpec(
        spec,
        'MEDIUM',
        72,
        [`maxDrawdown=${m.maxDrawdown}`, `netPnl=${m.netPnl}`],
        'Max drawdown is large relative to net PnL.',
      ),
    });
  }

  if (m.averageRr != null && m.averageRr < PSYCHOLOGY_RULES.LOW_RR && trades >= 3) {
    // May duplicate ti-rr-low — dedupe later by id
    const spec = DETECTION_BY_INSIGHT_ID['ti-rr-low']!;
    out.push({
      spec,
      finding: findingFromSpec(
        spec,
        'HIGH',
        80,
        [`averageRr=${m.averageRr}`],
        `Average RR ${m.averageRr} is below discipline floor.`,
      ),
    });
  }

  return out;
}

export function collectPsychologyFindings(
  dashboard: ULDashboardData | null | undefined,
  insight: TradingInsightReport | null | undefined,
  recommendation: TradingRecommendationReport | null | undefined,
): { findings: TradingPsychologyFinding[]; specs: PsychologyDetectionSpec[] } {
  const findings: TradingPsychologyFinding[] = [];
  const specs: PsychologyDetectionSpec[] = [];
  const seen = new Set<string>();

  const push = (finding: TradingPsychologyFinding, spec: PsychologyDetectionSpec) => {
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    findings.push(finding);
    specs.push(spec);
  };

  if (insight?.insights) {
    for (const i of insight.insights) {
      const spec = DETECTION_BY_INSIGHT_ID[i.id];
      if (!spec) continue;
      push(
        findingFromSpec(
          spec,
          severityFromInsight(i.severity, spec.defaultSeverity),
          i.confidence,
          i.evidence,
          i.description,
        ),
        spec,
      );
    }
  }

  if (recommendation?.recommendations) {
    for (const rec of recommendation.recommendations) {
      const actionLower = rec.action.toLowerCase();
      for (const row of DETECTION_BY_REC_ACTION_SUBSTR) {
        if (!actionLower.includes(row.match.toLowerCase())) continue;
        push(
          findingFromSpec(
            row.spec,
            severityFromInsight(
              rec.priority === 'CRITICAL'
                ? 'CRITICAL'
                : rec.priority === 'HIGH'
                  ? 'HIGH'
                  : rec.priority === 'MEDIUM'
                    ? 'MEDIUM'
                    : rec.priority === 'LOW'
                      ? 'LOW'
                      : 'INFO',
              row.spec.defaultSeverity,
            ),
            rec.confidence,
            rec.evidence,
            rec.description,
          ),
          row.spec,
        );
      }
    }
  }

  for (const { finding, spec } of dashboardDetections(dashboard)) {
    push(finding, spec);
  }

  // Empty window
  if ((!insight || insight.insights.length === 0) && (!dashboard || dashboard.tradeCount === 0)) {
    const spec: PsychologyDetectionSpec = {
      id: 'psy-empty',
      psychologyType: 'Healthy Habit',
      title: 'Insufficient behavior sample',
      habit: 'No closed trades to score habits',
      improvement: 'Accumulate closed trades for psychology scoring',
      traitDeltas: {},
      defaultSeverity: 'INFO',
    };
    push(
      findingFromSpec(spec, 'INFO', 100, ['tradeCount=0'], 'No closed trades in dashboard.'),
      spec,
    );
  }

  return { findings, specs };
}

export function buildTraitScores(specs: readonly PsychologyDetectionSpec[]): {
  traits: TradingPsychologyTrait[];
  score: number;
  grade: TradingPsychologyGrade;
} {
  const scores: Record<TradingPsychologyTraitId, number> = {
    Discipline: PSYCHOLOGY_RULES.TRAIT_BASE,
    Patience: PSYCHOLOGY_RULES.TRAIT_BASE,
    Consistency: PSYCHOLOGY_RULES.TRAIT_BASE,
    'Risk Control': PSYCHOLOGY_RULES.TRAIT_BASE,
    Confidence: PSYCHOLOGY_RULES.TRAIT_BASE,
    Execution: PSYCHOLOGY_RULES.TRAIT_BASE,
    'Emotional Control': PSYCHOLOGY_RULES.TRAIT_BASE,
  };

  for (const spec of specs) {
    for (const [trait, delta] of Object.entries(spec.traitDeltas)) {
      const key = trait as TradingPsychologyTraitId;
      scores[key] = clampTraitScore(scores[key] + (delta as number));
    }
  }

  const traits: TradingPsychologyTrait[] = TRADING_PSYCHOLOGY_TRAIT_IDS.map((id) => ({
    id,
    score: scores[id],
    label: id,
  }));

  const score = Math.round(
    traits.reduce((a, t) => a + t.score, 0) / Math.max(1, traits.length),
  );
  return { traits, score: clampTraitScore(score), grade: psychologyGradeFromScore(score) };
}

export function bucketFindings(findings: readonly TradingPsychologyFinding[]): {
  strengths: TradingPsychologyFinding[];
  weaknesses: TradingPsychologyFinding[];
  warnings: TradingPsychologyFinding[];
  habits: TradingPsychologyFinding[];
} {
  const strengths: TradingPsychologyFinding[] = [];
  const weaknesses: TradingPsychologyFinding[] = [];
  const warnings: TradingPsychologyFinding[] = [];
  const habits: TradingPsychologyFinding[] = [];

  for (const f of findings) {
    if (f.psychologyType === 'Healthy Habit') {
      strengths.push(f);
      habits.push(f);
      continue;
    }
    if (f.severity === 'CRITICAL' || f.severity === 'HIGH') {
      warnings.push(f);
      weaknesses.push(f);
      habits.push(f);
      continue;
    }
    if (f.severity === 'MEDIUM' || f.severity === 'LOW') {
      weaknesses.push(f);
      habits.push(f);
      continue;
    }
    habits.push(f);
  }

  return { strengths, weaknesses, warnings, habits };
}

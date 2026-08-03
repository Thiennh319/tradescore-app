/**
 * TASK 17.4 — Position Review Builder.
 *
 * Normalizes a frozen Position Adviser snapshot for POSITION_REVIEW.md.
 * Copy only: never calculates, never infers, never generates, never
 * modifies engines. Rule evidence is de-duplicated by rule id (first
 * wins). Conflict detection is a structural observation on copied
 * values — never a recomputation.
 */

import { fmt } from '../formatters/markdown';
import type {
  PositionCheckItem,
  PositionEvidenceItem,
  PositionReview,
  PositionReviewCheck,
  PositionReviewConflict,
  PositionReviewEvidence,
  PositionReviewInput,
  PositionReviewRuleReference,
  PositionReviewTreeStep,
  PositionRuleEvidenceItem,
  PositionRuleReferenceItem,
  PositionTreeStepItem,
} from './PositionReviewTypes';

function evidenceItems(
  evidence: readonly PositionReviewEvidence[] | null | undefined,
): readonly PositionEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function treeStepItem(step: PositionReviewTreeStep): PositionTreeStepItem {
  return {
    stage: fmt(step.stage),
    result: fmt(step.result),
    detail: fmt(step.detail),
  };
}

function checkItem(check: PositionReviewCheck): PositionCheckItem {
  return {
    checkId: fmt(check.checkId),
    ruleId: fmt(check.ruleId),
    ruleName: fmt(check.ruleName),
    priority: fmt(check.priority),
    status: fmt(check.status),
    reason: fmt(check.reason),
    recommendation: fmt(check.recommendation),
    evidence: evidenceItems(check.evidence),
    source: fmt(check.source),
  };
}

function ruleReferenceItem(
  reference: PositionReviewRuleReference,
): PositionRuleReferenceItem {
  return {
    ruleId: fmt(reference.ruleId),
    ruleName: fmt(reference.ruleName),
    module: fmt(reference.module),
    priority: fmt(reference.priority),
    evidence: fmt(reference.evidence),
    triggered: fmt(reference.triggered),
    hardExit: fmt(reference.hardExit),
  };
}

/**
 * Build the EVIDENCE section: each rule id is emitted at most once —
 * first occurrence wins, duplicates are dropped. Nothing is invented.
 */
function buildRuleEvidence(
  input: PositionReviewInput,
): readonly PositionRuleEvidenceItem[] {
  const seen = new Set<string>();
  const result: PositionRuleEvidenceItem[] = [];
  for (const item of input.ruleEvidence ?? []) {
    const ruleId = fmt(item.ruleId);
    if (seen.has(ruleId)) continue;
    seen.add(ruleId);
    result.push({
      ruleId,
      ruleName: fmt(item.ruleName),
      evidence: evidenceItems(item.evidence),
    });
  }
  return result;
}

/**
 * Structural conflict observations on copied values only:
 * - Recommendation CLOSE while PnL positive and no triggered hard exit
 *   rule in the snapshot.
 * - Recommendation HOLD while a triggered hard exit rule exists.
 */
function detectConflict(input: PositionReviewInput): PositionReviewConflict {
  const reasons: string[] = [];
  const recommendation = input.summary?.recommendation ?? null;
  const pnlPct = input.positionSnapshot?.pnlPct;
  const references = input.ruleReferences ?? [];
  const hardExitTriggered = references.filter(
    (reference) => reference.triggered === true && reference.hardExit === true,
  );

  if (
    recommendation === 'CLOSE' &&
    typeof pnlPct === 'number' &&
    pnlPct > 0 &&
    hardExitTriggered.length === 0
  ) {
    reasons.push(
      'Recommendation CLOSE on profitable position without hard exit rule',
    );
  }

  if (recommendation === 'HOLD' && hardExitTriggered.length > 0) {
    reasons.push(
      `Recommendation HOLD despite hard exit rule (${hardExitTriggered
        .map((reference) => fmt(reference.ruleId))
        .join(', ')})`,
    );
  }

  return { detected: reasons.length > 0, reasons };
}

/** Build the normalized Position Review from a frozen snapshot. O(n). */
export function buildPositionReview(
  input: PositionReviewInput,
): PositionReview {
  const market = input.marketSnapshot ?? {};
  return {
    metadata: input.metadata ?? {},
    positionSnapshot: input.positionSnapshot ?? {},
    marketSnapshot: Object.keys(market)
      .sort()
      .map((key) => ({ key, value: fmt(market[key]) })),
    summary: input.summary ?? {},
    decisionTree: (input.decisionTree ?? []).map(treeStepItem),
    checks: (input.checks ?? []).map(checkItem),
    ruleReferences: (input.ruleReferences ?? []).map(ruleReferenceItem),
    stopLossPlan: input.stopLossPlan ?? {},
    takeProfitPlan: input.takeProfitPlan ?? {},
    positionManagement: input.positionManagement ?? {},
    ruleEvidence: buildRuleEvidence(input),
    conflict: detectConflict(input),
  };
}

/**
 * TASK 17.3 — Entry Review Builder.
 *
 * Normalizes a frozen Entry snapshot for ENTRY_REVIEW.md. Copy only:
 * no calculation, no derivation, no inference, no re-scoring, no
 * re-ranking, no re-evaluation. Rule evidence is de-duplicated by rule
 * id (first wins). Conflict detection is a structural observation on
 * copied values — never a recomputation.
 */

import { fmt } from '../formatters/markdown';
import type {
  EntryBlockerItem,
  EntryCheckItem,
  EntryEvidenceItem,
  EntryReview,
  EntryReviewBlocker,
  EntryReviewCheck,
  EntryReviewConflict,
  EntryReviewEvidence,
  EntryReviewInput,
  EntryReviewRuleReference,
  EntryReviewTreeStep,
  EntryRuleEvidenceItem,
  EntryRuleReferenceItem,
  EntryTreeStepItem,
} from './EntryReviewTypes';

function evidenceItems(
  evidence: readonly EntryReviewEvidence[] | null | undefined,
): readonly EntryEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function treeStepItem(step: EntryReviewTreeStep): EntryTreeStepItem {
  return {
    stage: fmt(step.stage),
    result: fmt(step.result),
    detail: fmt(step.detail),
  };
}

function checkItem(check: EntryReviewCheck): EntryCheckItem {
  return {
    checkId: fmt(check.checkId),
    ruleId: fmt(check.ruleId),
    ruleName: fmt(check.ruleName),
    priority: fmt(check.priority),
    status: fmt(check.status),
    actual: fmt(check.actual),
    expected: fmt(check.expected),
    threshold: fmt(check.threshold),
    difference: fmt(check.difference),
    reason: fmt(check.reason),
    recommendation: fmt(check.recommendation),
    evidence: evidenceItems(check.evidence),
    source: fmt(check.source),
  };
}

function blockerItem(blocker: EntryReviewBlocker): EntryBlockerItem {
  return {
    type: fmt(blocker.type),
    rule: fmt(blocker.rule),
    priority: fmt(blocker.priority),
    trigger: fmt(blocker.trigger),
    reason: fmt(blocker.reason),
    override: fmt(blocker.override),
    evidence: evidenceItems(blocker.evidence),
  };
}

function ruleReferenceItem(
  reference: EntryReviewRuleReference,
): EntryRuleReferenceItem {
  return {
    ruleId: fmt(reference.ruleId),
    ruleName: fmt(reference.ruleName),
    module: fmt(reference.module),
    priority: fmt(reference.priority),
    evidence: fmt(reference.evidence),
  };
}

/**
 * Build the EVIDENCE section: each rule id is emitted at most once —
 * first occurrence wins, duplicates are dropped. Nothing is invented.
 */
function buildRuleEvidence(
  input: EntryReviewInput,
): readonly EntryRuleEvidenceItem[] {
  const seen = new Set<string>();
  const result: EntryRuleEvidenceItem[] = [];
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
 * - Decision ENTER while RuleBook State BLOCKED.
 * - Decision WAIT without any blocker in the snapshot.
 * - Decision ENTER despite a HARD blocker in the snapshot.
 */
function detectConflict(input: EntryReviewInput): EntryReviewConflict {
  const reasons: string[] = [];
  const decision = input.summary?.decision ?? null;
  const state = input.summary?.rulebookState ?? null;
  const blockers = input.blockers ?? [];

  if (decision === 'ENTER' && state === 'BLOCKED') {
    reasons.push('Decision ENTER while RuleBook State BLOCKED');
  }
  if (decision === 'WAIT' && blockers.length === 0) {
    reasons.push('Decision WAIT without blocker');
  }
  if (
    decision === 'ENTER' &&
    blockers.some((blocker) => blocker.type === 'HARD')
  ) {
    reasons.push('Decision ENTER despite HARD BLOCK');
  }

  return { detected: reasons.length > 0, reasons };
}

/** Build the normalized Entry Review from a frozen snapshot. O(n). */
export function buildEntryReview(input: EntryReviewInput): EntryReview {
  const market = input.marketSnapshot ?? {};
  return {
    metadata: input.metadata ?? {},
    marketSnapshot: Object.keys(market)
      .sort()
      .map((key) => ({ key, value: fmt(market[key]) })),
    summary: input.summary ?? {},
    decisionTree: (input.decisionTree ?? []).map(treeStepItem),
    checks: (input.checks ?? []).map(checkItem),
    blockers: (input.blockers ?? []).map(blockerItem),
    ruleReferences: (input.ruleReferences ?? []).map(ruleReferenceItem),
    ruleEvidence: buildRuleEvidence(input),
    conflict: detectConflict(input),
  };
}

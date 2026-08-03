/**
 * TASK 17.5 — TradePlan Review Builder.
 *
 * Normalizes a frozen TradePlan snapshot for TRADEPLAN_REVIEW.md. Copy
 * only: never computes RR, position size, confidence, targets, entry,
 * stop loss, adviser state, or recommendation. Rule evidence is
 * de-duplicated by rule id (first wins). Conflict detection is a
 * structural observation on copied values — never an inference.
 */

import { fmt } from '../formatters/markdown';
import type {
  TradePlanBlockerItem,
  TradePlanCancellationItem,
  TradePlanEvidenceItem,
  TradePlanReview,
  TradePlanReviewBlocker,
  TradePlanReviewConflict,
  TradePlanReviewEvidence,
  TradePlanReviewInput,
  TradePlanReviewRuleReference,
  TradePlanRuleEvidenceItem,
  TradePlanRuleReferenceItem,
} from './TradePlanReviewTypes';

function evidenceItems(
  evidence: readonly TradePlanReviewEvidence[] | null | undefined,
): readonly TradePlanEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function ruleReferenceItem(
  reference: TradePlanReviewRuleReference,
): TradePlanRuleReferenceItem {
  return {
    ruleId: fmt(reference.ruleId),
    ruleName: fmt(reference.ruleName),
    module: fmt(reference.module),
    priority: fmt(reference.priority),
    evidence: fmt(reference.evidence),
  };
}

function blockerItem(blocker: TradePlanReviewBlocker): TradePlanBlockerItem {
  return {
    blocker: fmt(blocker.blocker),
    requiredUnlock: fmt(blocker.requiredUnlock),
    reason: fmt(blocker.reason),
    evidence: evidenceItems(blocker.evidence),
  };
}

function cancellationItem(
  cancellation: TradePlanReviewInput['cancellation'],
): TradePlanCancellationItem {
  return {
    cancelCondition: fmt(cancellation?.cancelCondition),
    reason: fmt(cancellation?.reason),
    evidence: evidenceItems(cancellation?.evidence),
  };
}

/**
 * Build the EVIDENCE section: each rule id is emitted at most once —
 * first occurrence wins, duplicates are dropped. Nothing is invented.
 */
function buildRuleEvidence(
  input: TradePlanReviewInput,
): readonly TradePlanRuleEvidenceItem[] {
  const seen = new Set<string>();
  const result: TradePlanRuleEvidenceItem[] = [];
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
 * - Plan READY while the copied Entry decision is WAIT.
 * - Plan READY while the copied cancellation flag is TRUE.
 * - Plan ACTIVE while the copied Position state is CLOSED.
 * - Entry WAIT / AVOID while the copied Position state is OPEN (any status).
 */
function detectConflict(input: TradePlanReviewInput): TradePlanReviewConflict {
  const reasons: string[] = [];
  const status = input.summary?.status ?? null;
  const cross = input.crossReferences ?? {};

  if (status === 'READY' && cross.entryDecision === 'WAIT') {
    reasons.push('Plan READY while Entry decision WAIT');
  }
  if (status === 'READY' && cross.cancellationTriggered === true) {
    reasons.push('Plan READY while Cancellation TRUE');
  }
  if (status === 'ACTIVE' && cross.positionState === 'CLOSED') {
    reasons.push('Plan ACTIVE while Position CLOSED');
  }
  if (
    (cross.entryDecision === 'WAIT' || cross.entryDecision === 'AVOID') &&
    cross.positionState === 'OPEN'
  ) {
    reasons.push(
      `Entry decision is ${cross.entryDecision} while Position is OPEN`,
    );
  }

  return { detected: reasons.length > 0, reasons };
}

/** Build the normalized TradePlan Review from a frozen snapshot. O(n). */
export function buildTradePlanReview(
  input: TradePlanReviewInput,
): TradePlanReview {
  const market = input.marketSnapshot ?? {};
  return {
    metadata: input.metadata ?? {},
    marketSnapshot: Object.keys(market)
      .sort()
      .map((key) => ({ key, value: fmt(market[key]) })),
    summary: input.summary ?? {},
    entryPlan: input.entryPlan ?? {},
    riskPlan: input.riskPlan ?? {},
    targetPlan: input.targetPlan ?? {},
    executionPlan: input.executionPlan ?? {},
    positionManagement: input.positionManagement ?? {},
    ruleReferences: (input.ruleReferences ?? []).map(ruleReferenceItem),
    ruleEvidence: buildRuleEvidence(input),
    blockers: (input.blockers ?? []).map(blockerItem),
    cancellation: cancellationItem(input.cancellation),
    crossReferences: input.crossReferences ?? {},
    conflict: detectConflict(input),
  };
}

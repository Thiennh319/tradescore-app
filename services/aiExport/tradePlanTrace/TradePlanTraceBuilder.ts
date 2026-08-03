/**
 * TASK 16.6 — TradePlan Trace Builder.
 *
 * Normalizes the frozen TradePlan for Markdown formatting. Copy only —
 * no plan creation, no risk/target arithmetic. Conflict detection is a
 * structural observation on copied cross-reference values, never a new
 * calculation.
 */

import { fmt } from '../formatters/markdown';
import type {
  TradePlanBlocker,
  TradePlanBlockerItem,
  TradePlanCancellationItem,
  TradePlanConflict,
  TradePlanEvidenceItem,
  TradePlanRuleReference,
  TradePlanRuleReferenceItem,
  TradePlanTrace,
  TradePlanTraceEvidence,
  TradePlanTraceInput,
} from './TradePlanTraceTypes';

function evidenceItems(
  evidence: readonly TradePlanTraceEvidence[] | null | undefined,
): readonly TradePlanEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function ruleReferenceItem(
  reference: TradePlanRuleReference,
  index: number,
): TradePlanRuleReferenceItem {
  return {
    index: index + 1,
    ruleId: fmt(reference.ruleId),
    ruleName: fmt(reference.ruleName),
    decisionSource: fmt(reference.decisionSource),
    evidenceReference: fmt(reference.evidenceReference),
  };
}

function blockerItem(blocker: TradePlanBlocker, index: number): TradePlanBlockerItem {
  return {
    index: index + 1,
    blocker: fmt(blocker.blocker),
    requiredUnlock: fmt(blocker.requiredUnlock),
    reason: fmt(blocker.reason),
    evidence: evidenceItems(blocker.evidence),
  };
}

function cancellationItem(
  cancellation: TradePlanTraceInput['cancellation'],
): TradePlanCancellationItem {
  return {
    cancelCondition: fmt(cancellation?.cancelCondition),
    reason: fmt(cancellation?.reason),
    evidence: evidenceItems(cancellation?.evidence),
  };
}

/**
 * Structural conflict observations on copied values only:
 * - Plan READY while the Entry decision is WAIT / AVOID.
 * - Plan READY / ACTIVE while the Position is CLOSED.
 * - Entry WAIT / AVOID while the Position is OPEN (any planStatus).
 */
function detectConflict(input: TradePlanTraceInput): TradePlanConflict {
  const planStatus = input.summary?.planStatus ?? null;
  const entryDecision = input.crossReferences?.entryDecision ?? null;
  const positionState = input.crossReferences?.positionState ?? null;
  const reasons: string[] = [];

  if (
    planStatus === 'READY' &&
    (entryDecision === 'WAIT' || entryDecision === 'AVOID')
  ) {
    reasons.push(`Plan READY while Entry decision is ${entryDecision}`);
  }
  if (
    (planStatus === 'READY' || planStatus === 'ACTIVE') &&
    positionState === 'CLOSED'
  ) {
    reasons.push(`TradePlan ${planStatus} while Position CLOSED`);
  }
  if (
    (entryDecision === 'WAIT' || entryDecision === 'AVOID') &&
    positionState === 'OPEN'
  ) {
    reasons.push(`Entry decision is ${entryDecision} while Position is OPEN`);
  }
  return { detected: reasons.length > 0, reasons };
}

/** Build the normalized TradePlan Trace from frozen input. O(n). */
export function buildTradePlanTrace(input: TradePlanTraceInput): TradePlanTrace {
  return {
    metadata: input.metadata ?? {},
    summary: input.summary ?? {},
    entryPlan: input.entryPlan ?? {},
    riskPlan: input.riskPlan ?? {},
    targetPlan: input.targetPlan ?? {},
    executionPlan: input.executionPlan ?? {},
    positionManagement: input.positionManagement ?? {},
    ruleReferences: (input.ruleReferences ?? []).map(ruleReferenceItem),
    contribution: input.contribution ?? {},
    blockers: (input.blockers ?? []).map(blockerItem),
    cancellation: cancellationItem(input.cancellation),
    crossReferences: input.crossReferences ?? {},
    conflict: detectConflict(input),
  };
}

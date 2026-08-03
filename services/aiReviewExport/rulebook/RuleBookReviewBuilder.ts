/**
 * TASK 17.1 — RuleBook Review Builder.
 *
 * Normalizes a frozen RuleBook snapshot for RULEBOOK_REVIEW.md. Copy
 * only: no rule generation, no counting, no recomputation. Evidence is
 * de-duplicated per rule (emit once). Conflict detection is a structural
 * observation on copied values — never a logic evaluation.
 */

import { fmt } from '../formatters/markdown';
import type {
  ReviewEvidenceItem,
  RuleBookReview,
  RuleBookReviewBlockedItem,
  RuleBookReviewBlockedRule,
  RuleBookReviewConflict,
  RuleBookReviewDependency,
  RuleBookReviewDependencyItem,
  RuleBookReviewEvidence,
  RuleBookReviewEvidenceItem,
  RuleBookReviewInput,
  RuleBookReviewRuleEvidence,
  RuleBookReviewTriggeredItem,
  RuleBookReviewTriggeredRule,
} from './RuleBookReviewTypes';

function evidenceItems(
  evidence: readonly RuleBookReviewEvidence[] | null | undefined,
): readonly ReviewEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function triggeredItem(
  rule: RuleBookReviewTriggeredRule,
): RuleBookReviewTriggeredItem {
  return {
    ruleId: fmt(rule.ruleId),
    ruleName: fmt(rule.ruleName),
    result: fmt(rule.result),
    priority: fmt(rule.priority),
    reason: fmt(rule.reason),
    evidence: evidenceItems(rule.evidence),
  };
}

function blockedItem(rule: RuleBookReviewBlockedRule): RuleBookReviewBlockedItem {
  return {
    ruleId: fmt(rule.ruleId),
    ruleName: fmt(rule.ruleName),
    trigger: fmt(rule.trigger),
    reason: fmt(rule.reason),
    unlockCondition: fmt(rule.unlockCondition),
  };
}

function dependencyItem(
  dependency: RuleBookReviewDependency,
): RuleBookReviewDependencyItem {
  return { input: fmt(dependency.input), module: fmt(dependency.module) };
}

/**
 * Build the RULE EVIDENCE section: each rule's evidence is emitted at
 * most once. Prefer the explicit `ruleEvidence` snapshot; otherwise copy
 * (deduped) from the triggered rules. Never generates new evidence.
 */
function buildRuleEvidence(
  input: RuleBookReviewInput,
): readonly RuleBookReviewEvidenceItem[] {
  const seen = new Set<string>();
  const result: RuleBookReviewEvidenceItem[] = [];

  const push = (
    ruleId: string,
    ruleName: string,
    evidence: readonly ReviewEvidenceItem[],
  ): void => {
    if (seen.has(ruleId)) return;
    seen.add(ruleId);
    result.push({ ruleId, ruleName, evidence });
  };

  const explicit: readonly RuleBookReviewRuleEvidence[] = input.ruleEvidence ?? [];
  for (const item of explicit) {
    push(fmt(item.ruleId), fmt(item.ruleName), evidenceItems(item.evidence));
  }

  if (result.length === 0) {
    for (const rule of input.triggeredRules ?? []) {
      const evidence = evidenceItems(rule.evidence);
      if (evidence.length > 0) {
        push(fmt(rule.ruleId), fmt(rule.ruleName), evidence);
      }
    }
  }

  return result;
}

/**
 * Structural conflict observations on copied values only:
 * - A triggered rule with result PASS while RuleBook State is BLOCKED.
 * - The same rule id present in both triggered and blocked lists.
 */
function detectConflict(input: RuleBookReviewInput): RuleBookReviewConflict {
  const reasons: string[] = [];
  const state = input.summary?.rulebookState ?? null;
  const triggered = input.triggeredRules ?? [];
  const blocked = input.blockedRules ?? [];

  if (state === 'BLOCKED') {
    for (const rule of triggered) {
      if (rule.result === 'PASS') {
        reasons.push(
          `Rule ${fmt(rule.ruleId)} PASS but RuleBook State BLOCKED`,
        );
      }
    }
  }

  const blockedIds = new Set(
    blocked
      .map((rule) => fmt(rule.ruleId))
      .filter((id) => id !== 'UNAVAILABLE'),
  );
  for (const rule of triggered) {
    const id = fmt(rule.ruleId);
    if (id !== 'UNAVAILABLE' && blockedIds.has(id)) {
      reasons.push(`Rule ${id} present in both triggered and blocked lists`);
    }
  }

  return { detected: reasons.length > 0, reasons };
}

/** Build the normalized RuleBook Review from a frozen snapshot. O(n). */
export function buildRuleBookReview(
  input: RuleBookReviewInput,
): RuleBookReview {
  const market = input.marketSnapshot ?? {};
  return {
    metadata: input.metadata ?? {},
    marketSnapshot: Object.keys(market)
      .sort()
      .map((key) => ({ key, value: fmt(market[key]) })),
    summary: input.summary ?? {},
    triggeredRules: (input.triggeredRules ?? []).map(triggeredItem),
    blockedRules: (input.blockedRules ?? []).map(blockedItem),
    ruleEvidence: buildRuleEvidence(input),
    dependencies: (input.dependencies ?? []).map(dependencyItem),
    conflict: detectConflict(input),
  };
}

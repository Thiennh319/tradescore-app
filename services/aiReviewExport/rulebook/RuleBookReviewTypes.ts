/**
 * TASK 17.1 — RuleBook Review Export. Architecture: FROZEN.
 *
 * Frozen input contracts for RULEBOOK_REVIEW.md — a self-contained AI
 * Review package. Every value is copied from a frozen snapshot; the
 * exporter never counts, recomputes, or invents rules/evidence/summary.
 */

import type { ReviewScalar } from '../formatters/markdown';

export interface RuleBookReviewEvidence {
  label?: ReviewScalar;
  value?: ReviewScalar;
}

export interface RuleBookReviewMetadata {
  version?: ReviewScalar;
  ruleVersion?: ReviewScalar;
  engineVersion?: ReviewScalar;
  timestamp?: ReviewScalar;
  coin?: ReviewScalar;
  side?: ReviewScalar;
  tradeId?: ReviewScalar;
}

/** RuleBook aggregate counts — copied verbatim, never counted here. */
export interface RuleBookReviewSummary {
  totalRules?: ReviewScalar;
  triggeredRules?: ReviewScalar;
  passedRules?: ReviewScalar;
  failedRules?: ReviewScalar;
  blockedRules?: ReviewScalar;
  ignoredRules?: ReviewScalar;
  warningRules?: ReviewScalar;
  rulebookState?: ReviewScalar;
}

export interface RuleBookReviewTriggeredRule {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  result?: ReviewScalar;
  priority?: ReviewScalar;
  reason?: ReviewScalar;
  evidence?: readonly RuleBookReviewEvidence[] | null;
}

export interface RuleBookReviewBlockedRule {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  trigger?: ReviewScalar;
  reason?: ReviewScalar;
  unlockCondition?: ReviewScalar;
}

/** One rule's evidence block — emitted at most once per rule. */
export interface RuleBookReviewRuleEvidence {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  evidence?: readonly RuleBookReviewEvidence[] | null;
}

export interface RuleBookReviewDependency {
  input?: ReviewScalar;
  module?: ReviewScalar;
}

/** Market snapshot values (key → value), copied verbatim. */
export type RuleBookReviewMarketSnapshot = Readonly<Record<string, ReviewScalar>>;

/** Full frozen input for one RuleBook Review export run. */
export interface RuleBookReviewInput {
  metadata?: RuleBookReviewMetadata | null;
  marketSnapshot?: RuleBookReviewMarketSnapshot | null;
  summary?: RuleBookReviewSummary | null;
  triggeredRules?: readonly RuleBookReviewTriggeredRule[] | null;
  blockedRules?: readonly RuleBookReviewBlockedRule[] | null;
  ruleEvidence?: readonly RuleBookReviewRuleEvidence[] | null;
  dependencies?: readonly RuleBookReviewDependency[] | null;
}

export interface ReviewEvidenceItem {
  label: string;
  value: string;
}

export interface RuleBookReviewTriggeredItem {
  ruleId: string;
  ruleName: string;
  result: string;
  priority: string;
  reason: string;
  evidence: readonly ReviewEvidenceItem[];
}

export interface RuleBookReviewBlockedItem {
  ruleId: string;
  ruleName: string;
  trigger: string;
  reason: string;
  unlockCondition: string;
}

export interface RuleBookReviewEvidenceItem {
  ruleId: string;
  ruleName: string;
  evidence: readonly ReviewEvidenceItem[];
}

export interface RuleBookReviewDependencyItem {
  input: string;
  module: string;
}

export interface RuleBookReviewConflict {
  detected: boolean;
  reasons: readonly string[];
}

/** Builder output — normalized and ready for formatting. */
export interface RuleBookReview {
  metadata: RuleBookReviewMetadata;
  marketSnapshot: readonly { key: string; value: string }[];
  summary: RuleBookReviewSummary;
  triggeredRules: readonly RuleBookReviewTriggeredItem[];
  blockedRules: readonly RuleBookReviewBlockedItem[];
  ruleEvidence: readonly RuleBookReviewEvidenceItem[];
  dependencies: readonly RuleBookReviewDependencyItem[];
  conflict: RuleBookReviewConflict;
}

/**
 * TASK 17.3 — Entry Review Export. Architecture: FROZEN.
 *
 * Frozen input contracts for ENTRY_REVIEW.md — a self-contained AI
 * Review package for the Entry Decision. Every value is copied from a
 * frozen Entry snapshot; the builder never calculates, derives, infers,
 * re-scores, re-ranks, or re-evaluates anything.
 */

import type { ReviewScalar } from '../formatters/markdown';

export interface EntryReviewEvidence {
  label?: ReviewScalar;
  value?: ReviewScalar;
}

export interface EntryReviewMetadata {
  version?: ReviewScalar;
  tradeId?: ReviewScalar;
  coin?: ReviewScalar;
  side?: ReviewScalar;
  timestamp?: ReviewScalar;
  entryVersion?: ReviewScalar;
  ruleVersion?: ReviewScalar;
  engineVersion?: ReviewScalar;
}

/** Entry aggregates — copied verbatim, never counted here. */
export interface EntryReviewSummary {
  decision?: ReviewScalar;
  confidence?: ReviewScalar;
  grade?: ReviewScalar;
  recommendation?: ReviewScalar;
  reason?: ReviewScalar;
  summary?: ReviewScalar;
  rulebookState?: ReviewScalar;
  passedChecks?: ReviewScalar;
  failedChecks?: ReviewScalar;
  warnings?: ReviewScalar;
  hardBlocks?: ReviewScalar;
  groupBlocks?: ReviewScalar;
  softBlocks?: ReviewScalar;
  unlockRules?: ReviewScalar;
}

export interface EntryReviewTreeStep {
  stage?: ReviewScalar;
  result?: ReviewScalar;
  detail?: ReviewScalar;
}

export interface EntryReviewCheck {
  checkId?: ReviewScalar;
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  priority?: ReviewScalar;
  status?: ReviewScalar;
  actual?: ReviewScalar;
  expected?: ReviewScalar;
  threshold?: ReviewScalar;
  difference?: ReviewScalar;
  reason?: ReviewScalar;
  recommendation?: ReviewScalar;
  evidence?: readonly EntryReviewEvidence[] | null;
  source?: ReviewScalar;
}

/** Blocker copied from the frozen snapshot — never inferred. */
export interface EntryReviewBlocker {
  type?: ReviewScalar;
  rule?: ReviewScalar;
  priority?: ReviewScalar;
  trigger?: ReviewScalar;
  reason?: ReviewScalar;
  override?: ReviewScalar;
  evidence?: readonly EntryReviewEvidence[] | null;
}

export interface EntryReviewRuleReference {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  module?: ReviewScalar;
  priority?: ReviewScalar;
  evidence?: ReviewScalar;
}

/** One rule's evidence block — emitted at most once per rule id. */
export interface EntryReviewRuleEvidence {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  evidence?: readonly EntryReviewEvidence[] | null;
}

/** Market snapshot values (key → value), copied verbatim. */
export type EntryReviewMarketSnapshot = Readonly<Record<string, ReviewScalar>>;

/** Full frozen input for one Entry Review export run. */
export interface EntryReviewInput {
  metadata?: EntryReviewMetadata | null;
  marketSnapshot?: EntryReviewMarketSnapshot | null;
  summary?: EntryReviewSummary | null;
  decisionTree?: readonly EntryReviewTreeStep[] | null;
  checks?: readonly EntryReviewCheck[] | null;
  blockers?: readonly EntryReviewBlocker[] | null;
  ruleReferences?: readonly EntryReviewRuleReference[] | null;
  ruleEvidence?: readonly EntryReviewRuleEvidence[] | null;
}

export interface EntryEvidenceItem {
  label: string;
  value: string;
}

export interface EntryTreeStepItem {
  stage: string;
  result: string;
  detail: string;
}

export interface EntryCheckItem {
  checkId: string;
  ruleId: string;
  ruleName: string;
  priority: string;
  status: string;
  actual: string;
  expected: string;
  threshold: string;
  difference: string;
  reason: string;
  recommendation: string;
  evidence: readonly EntryEvidenceItem[];
  source: string;
}

export interface EntryBlockerItem {
  type: string;
  rule: string;
  priority: string;
  trigger: string;
  reason: string;
  override: string;
  evidence: readonly EntryEvidenceItem[];
}

export interface EntryRuleReferenceItem {
  ruleId: string;
  ruleName: string;
  module: string;
  priority: string;
  evidence: string;
}

export interface EntryRuleEvidenceItem {
  ruleId: string;
  ruleName: string;
  evidence: readonly EntryEvidenceItem[];
}

export interface EntryReviewConflict {
  detected: boolean;
  reasons: readonly string[];
}

/** Builder output — normalized and ready for formatting. */
export interface EntryReview {
  metadata: EntryReviewMetadata;
  marketSnapshot: readonly { key: string; value: string }[];
  summary: EntryReviewSummary;
  decisionTree: readonly EntryTreeStepItem[];
  checks: readonly EntryCheckItem[];
  blockers: readonly EntryBlockerItem[];
  ruleReferences: readonly EntryRuleReferenceItem[];
  ruleEvidence: readonly EntryRuleEvidenceItem[];
  conflict: EntryReviewConflict;
}

/**
 * TASK 17.5 — TradePlan Review Export. Architecture: FROZEN.
 *
 * Frozen input contracts for TRADEPLAN_REVIEW.md — a self-contained AI
 * Review package for the TradePlan. Every value is copied from a frozen
 * snapshot; the builder never computes RR, position size, confidence,
 * targets, entry, stop loss, adviser state, or recommendation.
 */

import type { ReviewScalar } from '../formatters/markdown';

export interface TradePlanReviewEvidence {
  label?: ReviewScalar;
  value?: ReviewScalar;
}

export interface TradePlanReviewMetadata {
  version?: ReviewScalar;
  tradeId?: ReviewScalar;
  coin?: ReviewScalar;
  side?: ReviewScalar;
  strategy?: ReviewScalar;
  timestamp?: ReviewScalar;
  tradePlanVersion?: ReviewScalar;
  ruleVersion?: ReviewScalar;
  engineVersion?: ReviewScalar;
}

/** Plan aggregates — copied verbatim. */
export interface TradePlanReviewSummary {
  status?: ReviewScalar;
  headline?: ReviewScalar;
  summary?: ReviewScalar;
  confidence?: ReviewScalar;
  priority?: ReviewScalar;
}

export interface TradePlanReviewEntryPlan {
  entryPrice?: ReviewScalar;
  entryZone?: ReviewScalar;
  preferredEntry?: ReviewScalar;
  maximumEntry?: ReviewScalar;
  reason?: ReviewScalar;
}

export interface TradePlanReviewRiskPlan {
  stopLoss?: ReviewScalar;
  riskPct?: ReviewScalar;
  maximumLoss?: ReviewScalar;
  riskReward?: ReviewScalar;
  positionSize?: ReviewScalar;
  leverage?: ReviewScalar;
  reason?: ReviewScalar;
}

export interface TradePlanReviewTargetPlan {
  tp1?: ReviewScalar;
  tp2?: ReviewScalar;
  tp3?: ReviewScalar;
  scaleOut?: ReviewScalar;
  breakEven?: ReviewScalar;
  trailing?: ReviewScalar;
}

export interface TradePlanReviewExecutionPlan {
  currentStep?: ReviewScalar;
  nextStep?: ReviewScalar;
  trigger?: ReviewScalar;
  condition?: ReviewScalar;
  fallback?: ReviewScalar;
}

export interface TradePlanReviewManagement {
  initialAdviserState?: ReviewScalar;
  expectedAdviserState?: ReviewScalar;
  protection?: ReviewScalar;
  scaleOut?: ReviewScalar;
  closeCondition?: ReviewScalar;
}

export interface TradePlanReviewRuleReference {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  module?: ReviewScalar;
  priority?: ReviewScalar;
  evidence?: ReviewScalar;
}

/** One rule's evidence block — emitted at most once per rule id. */
export interface TradePlanReviewRuleEvidence {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  evidence?: readonly TradePlanReviewEvidence[] | null;
}

export interface TradePlanReviewBlocker {
  blocker?: ReviewScalar;
  requiredUnlock?: ReviewScalar;
  reason?: ReviewScalar;
  evidence?: readonly TradePlanReviewEvidence[] | null;
}

export interface TradePlanReviewCancellation {
  cancelCondition?: ReviewScalar;
  reason?: ReviewScalar;
  evidence?: readonly TradePlanReviewEvidence[] | null;
}

/**
 * Frozen values copied from other engines, used only for structural
 * conflict observation — never evaluated or recomputed here.
 */
export interface TradePlanReviewCrossReferences {
  entryDecision?: ReviewScalar;
  positionState?: ReviewScalar;
  cancellationTriggered?: boolean | null;
}

/** Market snapshot values (key → value), copied verbatim. */
export type TradePlanReviewMarketSnapshot = Readonly<Record<string, ReviewScalar>>;

/** Full frozen input for one TradePlan Review export run. */
export interface TradePlanReviewInput {
  metadata?: TradePlanReviewMetadata | null;
  marketSnapshot?: TradePlanReviewMarketSnapshot | null;
  summary?: TradePlanReviewSummary | null;
  entryPlan?: TradePlanReviewEntryPlan | null;
  riskPlan?: TradePlanReviewRiskPlan | null;
  targetPlan?: TradePlanReviewTargetPlan | null;
  executionPlan?: TradePlanReviewExecutionPlan | null;
  positionManagement?: TradePlanReviewManagement | null;
  ruleReferences?: readonly TradePlanReviewRuleReference[] | null;
  ruleEvidence?: readonly TradePlanReviewRuleEvidence[] | null;
  blockers?: readonly TradePlanReviewBlocker[] | null;
  cancellation?: TradePlanReviewCancellation | null;
  crossReferences?: TradePlanReviewCrossReferences | null;
}

export interface TradePlanEvidenceItem {
  label: string;
  value: string;
}

export interface TradePlanRuleReferenceItem {
  ruleId: string;
  ruleName: string;
  module: string;
  priority: string;
  evidence: string;
}

export interface TradePlanRuleEvidenceItem {
  ruleId: string;
  ruleName: string;
  evidence: readonly TradePlanEvidenceItem[];
}

export interface TradePlanBlockerItem {
  blocker: string;
  requiredUnlock: string;
  reason: string;
  evidence: readonly TradePlanEvidenceItem[];
}

export interface TradePlanCancellationItem {
  cancelCondition: string;
  reason: string;
  evidence: readonly TradePlanEvidenceItem[];
}

export interface TradePlanReviewConflict {
  detected: boolean;
  reasons: readonly string[];
}

/** Builder output — normalized and ready for formatting. */
export interface TradePlanReview {
  metadata: TradePlanReviewMetadata;
  marketSnapshot: readonly { key: string; value: string }[];
  summary: TradePlanReviewSummary;
  entryPlan: TradePlanReviewEntryPlan;
  riskPlan: TradePlanReviewRiskPlan;
  targetPlan: TradePlanReviewTargetPlan;
  executionPlan: TradePlanReviewExecutionPlan;
  positionManagement: TradePlanReviewManagement;
  ruleReferences: readonly TradePlanRuleReferenceItem[];
  ruleEvidence: readonly TradePlanRuleEvidenceItem[];
  blockers: readonly TradePlanBlockerItem[];
  cancellation: TradePlanCancellationItem;
  crossReferences: TradePlanReviewCrossReferences;
  conflict: TradePlanReviewConflict;
}

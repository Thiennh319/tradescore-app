/**
 * TASK 17.4 — Position Review Export. Architecture: FROZEN.
 *
 * Frozen input contracts for POSITION_REVIEW.md — a self-contained AI
 * Review package for the Position Adviser. Every value is copied from a
 * frozen snapshot; the builder never calculates, infers, generates, or
 * modifies any engine state.
 */

import type { ReviewScalar } from '../formatters/markdown';

export interface PositionReviewEvidence {
  label?: ReviewScalar;
  value?: ReviewScalar;
}

export interface PositionReviewMetadata {
  version?: ReviewScalar;
  tradeId?: ReviewScalar;
  positionId?: ReviewScalar;
  coin?: ReviewScalar;
  side?: ReviewScalar;
  strategy?: ReviewScalar;
  timestamp?: ReviewScalar;
  adviserVersion?: ReviewScalar;
  ruleVersion?: ReviewScalar;
  engineVersion?: ReviewScalar;
}

/** Frozen position state — copied verbatim, never recalculated. */
export interface PositionReviewSnapshot {
  entryPrice?: ReviewScalar;
  currentPrice?: ReviewScalar;
  pnlPct?: ReviewScalar;
  pnlUsdt?: ReviewScalar;
  riskReward?: ReviewScalar;
  stopLoss?: ReviewScalar;
  takeProfit?: ReviewScalar;
  trailingStop?: ReviewScalar;
  breakEven?: ReviewScalar;
  leverage?: ReviewScalar;
  positionSize?: ReviewScalar;
  exposure?: ReviewScalar;
  holdingTime?: ReviewScalar;
}

/** Adviser outcome — copied verbatim. */
export interface PositionReviewSummary {
  recommendation?: ReviewScalar;
  reason?: ReviewScalar;
  summary?: ReviewScalar;
  confidence?: ReviewScalar;
  priority?: ReviewScalar;
  adviserState?: ReviewScalar;
}

export interface PositionReviewTreeStep {
  stage?: ReviewScalar;
  result?: ReviewScalar;
  detail?: ReviewScalar;
}

export interface PositionReviewCheck {
  checkId?: ReviewScalar;
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  priority?: ReviewScalar;
  status?: ReviewScalar;
  reason?: ReviewScalar;
  recommendation?: ReviewScalar;
  evidence?: readonly PositionReviewEvidence[] | null;
  source?: ReviewScalar;
}

/**
 * Rule reference copied from the frozen snapshot. `triggered` and
 * `hardExit` are copied flags used only for structural conflict
 * observation — never evaluated here.
 */
export interface PositionReviewRuleReference {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  module?: ReviewScalar;
  priority?: ReviewScalar;
  evidence?: ReviewScalar;
  triggered?: boolean | null;
  hardExit?: boolean | null;
}

export interface PositionReviewStopLossPlan {
  currentSl?: ReviewScalar;
  suggestedSl?: ReviewScalar;
  reason?: ReviewScalar;
  breakEven?: ReviewScalar;
  trailing?: ReviewScalar;
  protectionType?: ReviewScalar;
}

export interface PositionReviewTakeProfitPlan {
  currentTp?: ReviewScalar;
  suggestedTp?: ReviewScalar;
  scaleOut?: ReviewScalar;
  remaining?: ReviewScalar;
  reason?: ReviewScalar;
}

export interface PositionReviewManagement {
  initialAdviserState?: ReviewScalar;
  currentAdviserState?: ReviewScalar;
  expectedAdviserState?: ReviewScalar;
  protection?: ReviewScalar;
  closeCondition?: ReviewScalar;
}

/** One rule's evidence block — emitted at most once per rule id. */
export interface PositionReviewRuleEvidence {
  ruleId?: ReviewScalar;
  ruleName?: ReviewScalar;
  evidence?: readonly PositionReviewEvidence[] | null;
}

/** Market snapshot values (key → value), copied verbatim. */
export type PositionReviewMarketSnapshot = Readonly<Record<string, ReviewScalar>>;

/** Full frozen input for one Position Review export run. */
export interface PositionReviewInput {
  metadata?: PositionReviewMetadata | null;
  positionSnapshot?: PositionReviewSnapshot | null;
  marketSnapshot?: PositionReviewMarketSnapshot | null;
  summary?: PositionReviewSummary | null;
  decisionTree?: readonly PositionReviewTreeStep[] | null;
  checks?: readonly PositionReviewCheck[] | null;
  ruleReferences?: readonly PositionReviewRuleReference[] | null;
  stopLossPlan?: PositionReviewStopLossPlan | null;
  takeProfitPlan?: PositionReviewTakeProfitPlan | null;
  positionManagement?: PositionReviewManagement | null;
  ruleEvidence?: readonly PositionReviewRuleEvidence[] | null;
}

export interface PositionEvidenceItem {
  label: string;
  value: string;
}

export interface PositionTreeStepItem {
  stage: string;
  result: string;
  detail: string;
}

export interface PositionCheckItem {
  checkId: string;
  ruleId: string;
  ruleName: string;
  priority: string;
  status: string;
  reason: string;
  recommendation: string;
  evidence: readonly PositionEvidenceItem[];
  source: string;
}

export interface PositionRuleReferenceItem {
  ruleId: string;
  ruleName: string;
  module: string;
  priority: string;
  evidence: string;
  triggered: string;
  hardExit: string;
}

export interface PositionRuleEvidenceItem {
  ruleId: string;
  ruleName: string;
  evidence: readonly PositionEvidenceItem[];
}

export interface PositionReviewConflict {
  detected: boolean;
  reasons: readonly string[];
}

/** Builder output — normalized and ready for formatting. */
export interface PositionReview {
  metadata: PositionReviewMetadata;
  positionSnapshot: PositionReviewSnapshot;
  marketSnapshot: readonly { key: string; value: string }[];
  summary: PositionReviewSummary;
  decisionTree: readonly PositionTreeStepItem[];
  checks: readonly PositionCheckItem[];
  ruleReferences: readonly PositionRuleReferenceItem[];
  stopLossPlan: PositionReviewStopLossPlan;
  takeProfitPlan: PositionReviewTakeProfitPlan;
  positionManagement: PositionReviewManagement;
  ruleEvidence: readonly PositionRuleEvidenceItem[];
  conflict: PositionReviewConflict;
}

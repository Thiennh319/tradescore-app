/**
 * TASK 17.2 — Score Review Export. Architecture: FROZEN.
 *
 * Frozen input contracts for SCORE_REVIEW.md — a self-contained AI
 * Review package. Every value is copied from a frozen Score Engine
 * snapshot; the exporter never scores, weights, sums bonuses/penalties,
 * or recomputes grade/confidence.
 */

import type { ReviewScalar } from '../formatters/markdown';

export interface ScoreReviewEvidence {
  label?: ReviewScalar;
  value?: ReviewScalar;
}

export interface ScoreReviewMetadata {
  version?: ReviewScalar;
  tradeId?: ReviewScalar;
  coin?: ReviewScalar;
  side?: ReviewScalar;
  timestamp?: ReviewScalar;
  scoreVersion?: ReviewScalar;
  ruleVersion?: ReviewScalar;
  engineVersion?: ReviewScalar;
}

/** Score aggregates — copied verbatim, never summed or recomputed. */
export interface ScoreReviewSummary {
  totalScore?: ReviewScalar;
  grade?: ReviewScalar;
  confidence?: ReviewScalar;
  status?: ReviewScalar;
  recommendation?: ReviewScalar;
  maxScore?: ReviewScalar;
  currentScore?: ReviewScalar;
  penalty?: ReviewScalar;
  bonus?: ReviewScalar;
  /** Copied hard-block flag from the engine snapshot (TASK 17.X F1). */
  hardBlocked?: ReviewScalar;
}

/** One hard-block entry copied from the engine snapshot (TASK 17.X F1). */
export interface ScoreReviewHardBlock {
  rule?: ReviewScalar;
  reason?: ReviewScalar;
  priority?: ReviewScalar;
  evidence?: readonly ScoreReviewEvidence[] | null;
}

/**
 * Decision policy copied from the engine snapshot (TASK 17.X F3/F4/F5).
 * Every field is copy-only; missing fields render as UNAVAILABLE and are
 * never derived, inferred or recomputed by the export layer.
 */
export interface ScoreReviewDecisionPolicy {
  decision?: ReviewScalar;
  decisionThreshold?: ReviewScalar;
  decisionPolicy?: ReviewScalar;
  decisionSource?: ReviewScalar;
  decisionRule?: ReviewScalar;
  decisionMapping?: ReviewScalar;
  decisionReason?: ReviewScalar;
  overridden?: ReviewScalar;
  overrideRule?: ReviewScalar;
  overrideModule?: ReviewScalar;
  overrideReason?: ReviewScalar;
  overrideEvidence?: readonly ScoreReviewEvidence[] | null;
}

export interface ScoreReviewBreakdownEntry {
  indicator?: ReviewScalar;
  score?: ReviewScalar;
  max?: ReviewScalar;
  weight?: ReviewScalar;
  result?: ReviewScalar;
  reason?: ReviewScalar;
}

export interface ScoreReviewPenalty {
  penalty?: ReviewScalar;
  reason?: ReviewScalar;
  evidence?: readonly ScoreReviewEvidence[] | null;
  priority?: ReviewScalar;
}

export interface ScoreReviewBonus {
  bonus?: ReviewScalar;
  reason?: ReviewScalar;
  evidence?: readonly ScoreReviewEvidence[] | null;
  priority?: ReviewScalar;
}

/** One indicator's evidence block — emitted at most once per indicator. */
export interface ScoreReviewIndicatorEvidence {
  indicator?: ReviewScalar;
  evidence?: readonly ScoreReviewEvidence[] | null;
}

export interface ScoreReviewDependency {
  indicator?: ReviewScalar;
  module?: ReviewScalar;
}

export interface ScoreReviewThreshold {
  indicator?: ReviewScalar;
  actual?: ReviewScalar;
  expected?: ReviewScalar;
  threshold?: ReviewScalar;
  difference?: ReviewScalar;
  priority?: ReviewScalar;
}

/** Market snapshot values (key → value), copied verbatim. */
export type ScoreReviewMarketSnapshot = Readonly<Record<string, ReviewScalar>>;

/** Full frozen input for one Score Review export run. */
export interface ScoreReviewInput {
  metadata?: ScoreReviewMetadata | null;
  marketSnapshot?: ScoreReviewMarketSnapshot | null;
  summary?: ScoreReviewSummary | null;
  breakdown?: readonly ScoreReviewBreakdownEntry[] | null;
  penalties?: readonly ScoreReviewPenalty[] | null;
  bonuses?: readonly ScoreReviewBonus[] | null;
  scoreEvidence?: readonly ScoreReviewIndicatorEvidence[] | null;
  dependencies?: readonly ScoreReviewDependency[] | null;
  thresholds?: readonly ScoreReviewThreshold[] | null;
  /** TASK 17.X F1 — hard-block entries copied from the engine snapshot. */
  hardBlocks?: readonly ScoreReviewHardBlock[] | null;
  /** TASK 17.X F3/F4/F5 — decision policy copied from the engine snapshot. */
  decision?: ScoreReviewDecisionPolicy | null;
}

export interface ScoreEvidenceItem {
  label: string;
  value: string;
}

export interface ScoreBreakdownItem {
  indicator: string;
  score: string;
  max: string;
  weight: string;
  result: string;
  reason: string;
}

export interface ScorePenaltyItem {
  penalty: string;
  reason: string;
  evidence: readonly ScoreEvidenceItem[];
  priority: string;
}

export interface ScoreBonusItem {
  bonus: string;
  reason: string;
  evidence: readonly ScoreEvidenceItem[];
  priority: string;
}

export interface ScoreIndicatorEvidenceItem {
  indicator: string;
  evidence: readonly ScoreEvidenceItem[];
}

export interface ScoreDependencyItem {
  indicator: string;
  module: string;
}

export interface ScoreThresholdItem {
  indicator: string;
  actual: string;
  expected: string;
  threshold: string;
  difference: string;
  priority: string;
}

/** Normalized hard-block row (TASK 17.X F1). */
export interface ScoreHardBlockItem {
  rule: string;
  reason: string;
  priority: string;
  evidence: readonly ScoreEvidenceItem[];
}

/** Normalized decision policy — all fields formatted strings (TASK 17.X). */
export interface ScoreDecisionPolicyItem {
  decision: string;
  decisionThreshold: string;
  decisionPolicy: string;
  decisionSource: string;
  decisionRule: string;
  decisionMapping: string;
  decisionReason: string;
  overridden: string;
  overrideRule: string;
  overrideModule: string;
  overrideReason: string;
  overrideEvidence: readonly ScoreEvidenceItem[];
}

export interface ScoreReviewConflict {
  detected: boolean;
  reasons: readonly string[];
}

/** Builder output — normalized and ready for formatting. */
export interface ScoreReview {
  metadata: ScoreReviewMetadata;
  marketSnapshot: readonly { key: string; value: string }[];
  summary: ScoreReviewSummary;
  breakdown: readonly ScoreBreakdownItem[];
  penalties: readonly ScorePenaltyItem[];
  bonuses: readonly ScoreBonusItem[];
  scoreEvidence: readonly ScoreIndicatorEvidenceItem[];
  dependencies: readonly ScoreDependencyItem[];
  thresholds: readonly ScoreThresholdItem[];
  hardBlocks: readonly ScoreHardBlockItem[];
  decision: ScoreDecisionPolicyItem;
  conflict: ScoreReviewConflict;
}

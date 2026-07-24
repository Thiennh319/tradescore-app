/**
 * TASK 17.2 — Score Review Builder.
 *
 * Normalizes a frozen Score Engine snapshot for SCORE_REVIEW.md. Copy
 * only: no scoring, no weighting, no bonus/penalty arithmetic, no grade
 * or confidence changes. Indicator evidence is de-duplicated (emit
 * once). Conflict detection is a structural observation on copied
 * values — never a recomputation.
 */

import { fmt } from '../formatters/markdown';
import type {
  ScoreBonusItem,
  ScoreBreakdownItem,
  ScoreDecisionPolicyItem,
  ScoreDependencyItem,
  ScoreEvidenceItem,
  ScoreHardBlockItem,
  ScoreIndicatorEvidenceItem,
  ScorePenaltyItem,
  ScoreReview,
  ScoreReviewBonus,
  ScoreReviewBreakdownEntry,
  ScoreReviewConflict,
  ScoreReviewDependency,
  ScoreReviewEvidence,
  ScoreReviewHardBlock,
  ScoreReviewInput,
  ScoreReviewPenalty,
  ScoreReviewThreshold,
  ScoreThresholdItem,
} from './ScoreReviewTypes';

function evidenceItems(
  evidence: readonly ScoreReviewEvidence[] | null | undefined,
): readonly ScoreEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function breakdownItem(entry: ScoreReviewBreakdownEntry): ScoreBreakdownItem {
  return {
    indicator: fmt(entry.indicator),
    score: fmt(entry.score),
    max: fmt(entry.max),
    weight: fmt(entry.weight),
    result: fmt(entry.result),
    reason: fmt(entry.reason),
  };
}

function penaltyItem(penalty: ScoreReviewPenalty): ScorePenaltyItem {
  return {
    penalty: fmt(penalty.penalty),
    reason: fmt(penalty.reason),
    evidence: evidenceItems(penalty.evidence),
    priority: fmt(penalty.priority),
  };
}

function bonusItem(bonus: ScoreReviewBonus): ScoreBonusItem {
  return {
    bonus: fmt(bonus.bonus),
    reason: fmt(bonus.reason),
    evidence: evidenceItems(bonus.evidence),
    priority: fmt(bonus.priority),
  };
}

function dependencyItem(dependency: ScoreReviewDependency): ScoreDependencyItem {
  return { indicator: fmt(dependency.indicator), module: fmt(dependency.module) };
}

function thresholdItem(threshold: ScoreReviewThreshold): ScoreThresholdItem {
  return {
    indicator: fmt(threshold.indicator),
    actual: fmt(threshold.actual),
    expected: fmt(threshold.expected),
    threshold: fmt(threshold.threshold),
    difference: fmt(threshold.difference),
    priority: fmt(threshold.priority),
  };
}

/** TASK 17.X F1 — copy one hard-block entry (no generation). */
function hardBlockItem(block: ScoreReviewHardBlock): ScoreHardBlockItem {
  return {
    rule: fmt(block.rule),
    reason: fmt(block.reason),
    priority: fmt(block.priority),
    evidence: evidenceItems(block.evidence),
  };
}

/** TASK 17.X F3/F4/F5 — copy decision policy; missing → UNAVAILABLE. */
function decisionPolicyItem(input: ScoreReviewInput): ScoreDecisionPolicyItem {
  const decision = input.decision ?? {};
  return {
    decision: fmt(decision.decision),
    decisionThreshold: fmt(decision.decisionThreshold),
    decisionPolicy: fmt(decision.decisionPolicy),
    decisionSource: fmt(decision.decisionSource),
    decisionRule: fmt(decision.decisionRule),
    decisionMapping: fmt(decision.decisionMapping),
    decisionReason: fmt(decision.decisionReason),
    overridden: fmt(decision.overridden),
    overrideRule: fmt(decision.overrideRule),
    overrideModule: fmt(decision.overrideModule),
    overrideReason: fmt(decision.overrideReason),
    overrideEvidence: evidenceItems(decision.overrideEvidence),
  };
}

/**
 * Interpret a copied hard-block flag. Structural reading only — accepts
 * the snapshot's own boolean or YES/NO/TRUE/FALSE spelling. Returns null
 * when the snapshot did not provide the flag (nothing is inferred).
 */
function readHardBlockedFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'YES' || normalized === 'TRUE') return true;
    if (normalized === 'NO' || normalized === 'FALSE') return false;
  }
  return null;
}

/**
 * Build the SCORE EVIDENCE section: each indicator's evidence is emitted
 * at most once. Prefer the explicit `scoreEvidence` snapshot; otherwise
 * nothing is invented — the exporter never generates evidence.
 */
function buildScoreEvidence(
  input: ScoreReviewInput,
): readonly ScoreIndicatorEvidenceItem[] {
  const seen = new Set<string>();
  const result: ScoreIndicatorEvidenceItem[] = [];
  for (const item of input.scoreEvidence ?? []) {
    const indicator = fmt(item.indicator);
    if (seen.has(indicator)) continue;
    seen.add(indicator);
    result.push({ indicator, evidence: evidenceItems(item.evidence) });
  }
  return result;
}

function findDuplicates(names: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    if (name === 'UNAVAILABLE') continue;
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  return [...duplicates];
}

/**
 * Structural conflict observations on copied values only:
 * - Current Score greater than Max Score.
 * - Current Score below zero.
 * - Duplicated penalty name.
 * - Duplicated bonus name.
 * - TASK 17.X F1: HardBlocked flag contradicts the HARD / GROUP BLOCKS section.
 * - TASK 17.X F4: Override flagged YES without an override rule.
 */
function detectConflict(input: ScoreReviewInput): ScoreReviewConflict {
  const reasons: string[] = [];
  const summary = input.summary ?? {};
  const current = summary.currentScore;
  const max = summary.maxScore;

  if (typeof current === 'number' && typeof max === 'number' && current > max) {
    reasons.push(`Current Score ${current} greater than Max Score ${max}`);
  }
  if (typeof current === 'number' && current < 0) {
    reasons.push(`Current Score ${current} below zero`);
  }

  for (const name of findDuplicates(
    (input.penalties ?? []).map((penalty) => fmt(penalty.penalty)),
  )) {
    reasons.push(`Penalty ${name} duplicated`);
  }
  for (const name of findDuplicates(
    (input.bonuses ?? []).map((bonus) => fmt(bonus.bonus)),
  )) {
    reasons.push(`Bonus ${name} duplicated`);
  }

  // TASK 17.X F1 — HardBlocked flag vs HARD / GROUP BLOCKS entries. The flag is
  // read from the copied summary first, then the copied market snapshot.
  // Both values already exist in the frozen snapshot; nothing is inferred.
  const flag =
    readHardBlockedFlag(summary.hardBlocked) ??
    readHardBlockedFlag((input.marketSnapshot ?? {})['Hard/Group Blocked State']) ??
    readHardBlockedFlag((input.marketSnapshot ?? {})['HardBlocked State']);
  const hardBlockCount = (input.hardBlocks ?? []).length;
  if (flag === true && hardBlockCount === 0) {
    reasons.push('HardBlocked YES but no hard block entries exported');
  }
  if (flag === false && hardBlockCount > 0) {
    reasons.push(
      `HardBlocked NO but ${hardBlockCount} hard block entr${hardBlockCount === 1 ? 'y' : 'ies'} exported`,
    );
  }

  // TASK 17.X F4 — Override declared without an override rule.
  const overridden = readHardBlockedFlag(input.decision?.overridden);
  if (overridden === true && fmt(input.decision?.overrideRule) === 'UNAVAILABLE') {
    reasons.push('Decision Override YES but Override Rule UNAVAILABLE');
  }

  return { detected: reasons.length > 0, reasons };
}

/** Build the normalized Score Review from a frozen snapshot. O(n). */
export function buildScoreReview(input: ScoreReviewInput): ScoreReview {
  const market = input.marketSnapshot ?? {};
  return {
    metadata: input.metadata ?? {},
    marketSnapshot: Object.keys(market)
      .sort()
      .map((key) => ({ key, value: fmt(market[key]) })),
    summary: input.summary ?? {},
    breakdown: (input.breakdown ?? []).map(breakdownItem),
    penalties: (input.penalties ?? []).map(penaltyItem),
    bonuses: (input.bonuses ?? []).map(bonusItem),
    scoreEvidence: buildScoreEvidence(input),
    dependencies: (input.dependencies ?? []).map(dependencyItem),
    thresholds: (input.thresholds ?? []).map(thresholdItem),
    hardBlocks: (input.hardBlocks ?? []).map(hardBlockItem),
    decision: decisionPolicyItem(input),
    conflict: detectConflict(input),
  };
}

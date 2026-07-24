/**
 * TASK 17.2 / 17.5.1 — Score Review Formatter.
 *
 * Renders SCORE_REVIEW.md — a self-contained AI Review package following
 * the TASK 17.0 AI Audit Standard and the harmonized Cursor workflow
 * layout. Markdown only, deterministic, null-safe. No cross-file
 * references, no JSON dump, no recomputation. Review workflow sections
 * are static blank templates for the reviewer AI to fill.
 *
 * TASK 17.5.1 harmonization: REVIEW MISSION, REVIEW FOCUS, and
 * CURSOR IMPLEMENTATION PROMPT naming aligned with Entry / Position /
 * TradePlan.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import type { ScoreEvidenceItem, ScoreReview } from './ScoreReviewTypes';

const DIVIDER = '--------------------------------';
const REVIEW_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function evidenceText(evidence: readonly ScoreEvidenceItem[]): string {
  return evidence.length > 0
    ? evidence.map((item) => `${item.label}=${item.value}`).join('; ')
    : UNAVAILABLE;
}

function reviewMission(): string[] {
  return [
    '# REVIEW MISSION',
    '',
    'Goal: Review the Score Engine only.',
    '',
    'Do NOT review: RuleBook, Entry Engine, Position Adviser, TradePlan, UI, Analytics.',
    '',
    'Expected Output:',
    '',
    'AI Review',
    '  |',
    'Cursor Prompt',
    '  |',
    'Validation',
    '  |',
    'PASS',
  ];
}

function metadata(review: ScoreReview): string[] {
  const m = review.metadata;
  return [
    kv('Version', m.version ?? REVIEW_VERSION),
    kv('Trade ID', m.tradeId),
    kv('Coin', m.coin),
    kv('Side', m.side),
    kv('Timestamp', m.timestamp),
    kv('Score Version', m.scoreVersion),
    kv('Rule Version', m.ruleVersion),
    kv('Engine Version', m.engineVersion),
  ];
}

function marketSnapshot(review: ScoreReview): string[] {
  return review.marketSnapshot.map((item) => kv(item.key, item.value));
}

function scoreSummary(review: ScoreReview): string[] {
  const s = review.summary;
  return [
    kv('Total Score', s.totalScore),
    kv('Grade', s.grade),
    kv('Confidence', s.confidence),
    kv('Status', s.status),
    kv('Hard/Group Blocked', s.hardBlocked),
    kv('Recommendation', s.recommendation),
    kv('Max Score', s.maxScore),
    kv('Current Score', s.currentScore),
    kv('Penalty', s.penalty),
    kv('Bonus', s.bonus),
  ];
}

function scoreBreakdown(review: ScoreReview): string[] {
  return table(
    ['Indicator', 'Score', 'Max', 'Weight', 'Result', 'Reason'],
    review.breakdown.map((entry) => [
      entry.indicator,
      entry.score,
      entry.max,
      entry.weight,
      entry.result,
      entry.reason,
    ]),
  );
}

function penalties(review: ScoreReview): string[] {
  return table(
    ['Penalty', 'Reason', 'Evidence', 'Priority'],
    review.penalties.map((penalty) => [
      penalty.penalty,
      penalty.reason,
      evidenceText(penalty.evidence),
      penalty.priority,
    ]),
  );
}

function bonuses(review: ScoreReview): string[] {
  return table(
    ['Bonus', 'Reason', 'Evidence', 'Priority'],
    review.bonuses.map((bonus) => [
      bonus.bonus,
      bonus.reason,
      evidenceText(bonus.evidence),
      bonus.priority,
    ]),
  );
}

function scoreEvidence(review: ScoreReview): string[] {
  return review.scoreEvidence.flatMap((item, index) => [
    ...(index > 0 ? [''] : []),
    item.indicator,
    kv('Evidence', evidenceText(item.evidence)),
  ]);
}

function scoreDependency(review: ScoreReview): string[] {
  return review.dependencies.flatMap((dependency, index) => [
    ...(index > 0 ? [''] : []),
    dependency.indicator,
    '  |',
    dependency.module,
  ]);
}

function thresholdReview(review: ScoreReview): string[] {
  return table(
    ['Indicator', 'Actual', 'Expected', 'Threshold', 'Difference', 'Priority'],
    review.thresholds.map((threshold) => [
      threshold.indicator,
      threshold.actual,
      threshold.expected,
      threshold.threshold,
      threshold.difference,
      threshold.priority,
    ]),
  );
}

/**
 * TASK 17.X F1 — HARD / GROUP BLOCKS section. Entries are copied verbatim;
 * when the snapshot exposes no hard/group-block list the section renders
 * UNAVAILABLE. Source (Hard vs Group) is in evidence labels from the wire.
 */
function hardBlocks(review: ScoreReview): string[] {
  if (review.hardBlocks.length === 0) return [];
  return table(
    ['Rule', 'Reason', 'Priority', 'Evidence'],
    review.hardBlocks.map((block) => [
      block.rule,
      block.reason,
      block.priority,
      evidenceText(block.evidence),
    ]),
  );
}

/**
 * TASK 17.X F2 — DECISION EXPLANATION. Renders the copied score journey:
 * per-indicator contributions (from the copied breakdown), then the copied
 * penalty/bonus/final score/decision. Nothing is summed or derived.
 */
function decisionExplanation(review: ScoreReview): string[] {
  const s = review.summary;
  const contributions = review.breakdown.map((entry) =>
    kv(`${entry.indicator} Contribution`, entry.score),
  );
  return [
    ...(contributions.length > 0 ? contributions : [kv('Contribution Breakdown', undefined)]),
    kv('Penalty', s.penalty),
    kv('Bonus', s.bonus),
    kv('Final Score', s.totalScore),
    kv('Decision', review.decision.decision),
  ];
}

/**
 * TASK 17.X F3/F4/F5 — DECISION POLICY. Every value is copied from the
 * frozen snapshot; missing fields render UNAVAILABLE (never inferred).
 */
function decisionPolicy(review: ScoreReview): string[] {
  const d = review.decision;
  return [
    `Decision: ${d.decision}`,
    `Decision Threshold: ${d.decisionThreshold}`,
    `Decision Policy: ${d.decisionPolicy}`,
    `Decision Source: ${d.decisionSource}`,
    `Decision Rule: ${d.decisionRule}`,
    `Decision Mapping: ${d.decisionMapping}`,
    `Decision Reason: ${d.decisionReason}`,
    '',
    `Override: ${d.overridden}`,
    `Override Rule: ${d.overrideRule}`,
    `Override Module: ${d.overrideModule}`,
    `Override Reason: ${d.overrideReason}`,
    `Override Evidence: ${evidenceText(d.overrideEvidence)}`,
  ];
}

function reviewFocus(): string[] {
  return [
    '1. Total Score',
    '2. Grade',
    '3. Confidence',
    '4. Breakdown',
    '5. Penalties',
    '6. Bonuses',
    '7. Thresholds',
    '8. Evidence',
    '9. Hard Block Consistency',
    '10. Decision Mapping',
    '11. Conflict',
    '12. Optimization',
  ];
}

function conflictDetection(review: ScoreReview): string[] {
  if (!review.conflict.detected) return ['Conflict: NO'];
  return [
    'Conflict: YES',
    '',
    ...review.conflict.reasons.map((reason) => kv('Reason', reason)),
  ];
}

function aiReview(): string[] {
  return [
    '| Review Item | Result | Severity | Notes |',
    '| --- | --- | --- | --- |',
    '| Wrong Weight | □ | | |',
    '| Wrong Threshold | □ | | |',
    '| Wrong Bonus | □ | | |',
    '| Wrong Penalty | □ | | |',
    '| Wrong Grade | □ | | |',
    '| Wrong Confidence | □ | | |',
    '| Missing Indicator | □ | | |',
    '| Duplicate Indicator | □ | | |',
    '| Need Optimization | □ | | |',
  ];
}

function cursorImplementationPrompt(): string[] {
  return [
    '| Field | Value |',
    '| --- | --- |',
    '| Module | |',
    '| Problem | |',
    '| Current Behavior | |',
    '| Expected Behavior | |',
    '| Root Cause | |',
    '| Suggested Fix | |',
    '| Allowed Scope | |',
    '| Forbidden Scope | |',
    '| Acceptance Criteria | |',
  ];
}

function patchRequirements(): string[] {
  return [
    '### Allowed Files',
    '',
    '-',
    '',
    '### Forbidden Files',
    '',
    '-',
    '',
    '### Allowed Changes',
    '',
    '-',
    '',
    '### Forbidden Changes',
    '',
    '-',
    '',
    '### Regression Requirement',
    '',
    '-',
    '',
    '### Architecture Requirement',
    '',
    '-',
  ];
}

function fixValidationChecklist(): string[] {
  return [
    '| Validation | Status |',
    '| --- | --- |',
    '| Only Score module modified | □ |',
    '| Rule unchanged | □ |',
    '| Entry unchanged | □ |',
    '| Architecture unchanged | □ |',
    '| API unchanged | □ |',
    '| UI unchanged | □ |',
    '| Store unchanged | □ |',
    '| Tests PASS | □ |',
    '| Stable Output | □ |',
  ];
}

function nextReview(): string[] {
  return [
    'Sau khi Cursor hoàn thành patch:',
    '',
    '1. Export lại SCORE_REVIEW.md',
    '',
    '2. Reviewer AI chỉ review đúng các mục Score đã sửa.',
    '',
    '3. Không audit lại module khác.',
    '',
    '4. Nếu PASS: Final Verdict = PASS.',
    '',
    'Nếu FAIL: Sinh CURSOR IMPLEMENTATION PROMPT mới.',
  ];
}

function finalVerdict(): string[] {
  return [
    'Reviewer AI selects exactly one:',
    '',
    '- [ ] PASS',
    '- [ ] PASS WITH MINOR IMPROVEMENTS',
    '- [ ] PASS WITH MAJOR IMPROVEMENTS',
    '- [ ] INVALID',
    '',
    'Confidence:',
    '',
    'Reason:',
  ];
}

/** Render the complete self-contained SCORE_REVIEW.md Markdown. */
export function formatScoreReview(review: ScoreReview): string {
  return [
    ...reviewMission(),
    '',
    ...section('Metadata', metadata(review)),
    '',
    ...section('MARKET SNAPSHOT', marketSnapshot(review)),
    '',
    ...section('SCORE SUMMARY', scoreSummary(review)),
    '',
    ...section('SCORE BREAKDOWN', scoreBreakdown(review)),
    '',
    ...section('PENALTIES', penalties(review)),
    '',
    ...section('BONUSES', bonuses(review)),
    '',
    ...section('HARD / GROUP BLOCKS', hardBlocks(review)),
    '',
    ...section('SCORE EVIDENCE', scoreEvidence(review)),
    '',
    ...section('SCORE DEPENDENCY', scoreDependency(review)),
    '',
    ...section('THRESHOLD REVIEW', thresholdReview(review)),
    '',
    ...section('DECISION EXPLANATION', decisionExplanation(review)),
    '',
    ...section('DECISION POLICY', decisionPolicy(review)),
    '',
    ...section('REVIEW FOCUS', reviewFocus()),
    '',
    ...section('CONFLICT DETECTION', conflictDetection(review)),
    '',
    ...section('AI REVIEW', aiReview()),
    '',
    ...section('CURSOR IMPLEMENTATION PROMPT', cursorImplementationPrompt()),
    '',
    ...section('PATCH REQUIREMENTS', patchRequirements()),
    '',
    ...section('FIX VALIDATION CHECKLIST', fixValidationChecklist()),
    '',
    ...section('NEXT REVIEW', nextReview()),
    '',
    ...aiReviewSpecificationSection(),
    '',
    ...section('FINAL VERDICT', finalVerdict()),
    '',
  ].join('\n');
}

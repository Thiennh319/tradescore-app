/**
 * TASK 17.5 — TradePlan Review Formatter.
 *
 * Renders TRADEPLAN_REVIEW.md — a self-contained AI Review package
 * following the TASK 17.0 AI Audit Standard with the Cursor workflow
 * layout. Markdown only, deterministic, null-safe. No cross-file
 * references, no JSON dump, no recomputation. Review workflow sections
 * are static blank templates for the reviewer AI to fill.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import type { TradePlanEvidenceItem, TradePlanReview } from './TradePlanReviewTypes';

const DIVIDER = '--------------------------------';
const REVIEW_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function evidenceText(evidence: readonly TradePlanEvidenceItem[]): string {
  return evidence.length > 0
    ? evidence.map((item) => `${item.label}=${item.value}`).join('; ')
    : UNAVAILABLE;
}

function reviewMission(): string[] {
  return [
    '# REVIEW MISSION',
    '',
    'Goal: Review the TradePlan only.',
    '',
    'Do NOT review: RuleBook, Score Engine, Entry Engine, Position Adviser, Trade Engine.',
    '',
    'Expected Workflow:',
    '',
    'AI Review',
    '  |',
    'Cursor Prompt',
    '  |',
    'Regression',
    '  |',
    'PASS',
  ];
}

function metadata(review: TradePlanReview): string[] {
  const m = review.metadata;
  return [
    kv('Version', m.version ?? REVIEW_VERSION),
    kv('Trade ID', m.tradeId),
    kv('Coin', m.coin),
    kv('Side', m.side),
    kv('Strategy', m.strategy),
    kv('Timestamp', m.timestamp),
    kv('TradePlan Version', m.tradePlanVersion),
    kv('Rule Version', m.ruleVersion),
    kv('Engine Version', m.engineVersion),
  ];
}

function marketSnapshot(review: TradePlanReview): string[] {
  return review.marketSnapshot.map((item) => kv(item.key, item.value));
}

function planSummary(review: TradePlanReview): string[] {
  const s = review.summary;
  return [
    kv('Status', s.status),
    kv('Headline', s.headline),
    kv('Summary', s.summary),
    kv('Confidence', s.confidence),
    kv('Priority', s.priority),
  ];
}

function entryPlan(review: TradePlanReview): string[] {
  const e = review.entryPlan;
  return [
    kv('Entry Price', e.entryPrice),
    kv('Entry Zone', e.entryZone),
    kv('Preferred Entry', e.preferredEntry),
    kv('Maximum Entry', e.maximumEntry),
    kv('Reason', e.reason),
  ];
}

function riskPlan(review: TradePlanReview): string[] {
  const r = review.riskPlan;
  return [
    kv('Stop Loss', r.stopLoss),
    kv('Risk %', r.riskPct),
    kv('Maximum Loss', r.maximumLoss),
    kv('Risk Reward', r.riskReward),
    kv('Position Size', r.positionSize),
    kv('Leverage', r.leverage),
    kv('Reason', r.reason),
  ];
}

function targetPlan(review: TradePlanReview): string[] {
  const t = review.targetPlan;
  return [
    kv('TP1', t.tp1),
    kv('TP2', t.tp2),
    kv('TP3', t.tp3),
    kv('Scale Out', t.scaleOut),
    kv('Break Even', t.breakEven),
    kv('Trailing', t.trailing),
  ];
}

function executionPlan(review: TradePlanReview): string[] {
  const e = review.executionPlan;
  return [
    kv('Current Step', e.currentStep),
    kv('Next Step', e.nextStep),
    kv('Trigger', e.trigger),
    kv('Condition', e.condition),
    kv('Fallback', e.fallback),
  ];
}

function positionManagement(review: TradePlanReview): string[] {
  const p = review.positionManagement;
  return [
    kv('Initial Adviser State', p.initialAdviserState),
    kv('Expected Adviser State', p.expectedAdviserState),
    kv('Protection', p.protection),
    kv('Scale Out', p.scaleOut),
    kv('Close Condition', p.closeCondition),
  ];
}

function ruleReferences(review: TradePlanReview): string[] {
  return table(
    ['Rule ID', 'Rule Name', 'Module', 'Priority', 'Evidence'],
    review.ruleReferences.map((reference) => [
      reference.ruleId,
      reference.ruleName,
      reference.module,
      reference.priority,
      reference.evidence,
    ]),
  );
}

function ruleEvidence(review: TradePlanReview): string[] {
  return review.ruleEvidence.flatMap((item, index) => [
    ...(index > 0 ? [''] : []),
    `${item.ruleId} — ${item.ruleName}`,
    kv('Evidence', evidenceText(item.evidence)),
  ]);
}

function planBlockers(review: TradePlanReview): string[] {
  return table(
    ['Current Blocker', 'Required Unlock', 'Reason', 'Evidence'],
    review.blockers.map((blocker) => [
      blocker.blocker,
      blocker.requiredUnlock,
      blocker.reason,
      evidenceText(blocker.evidence),
    ]),
  );
}

function cancellationPlan(review: TradePlanReview): string[] {
  const c = review.cancellation;
  return [
    kv('Cancel Condition', c.cancelCondition),
    kv('Reason', c.reason),
    kv('Evidence', evidenceText(c.evidence)),
  ];
}

function reviewFocus(): string[] {
  return [
    '1. Entry Plan',
    '2. Risk Plan',
    '3. Target Plan',
    '4. Execution Plan',
    '5. Position Management',
    '6. Blockers',
    '7. Cancellation',
    '8. Rule References',
    '9. Evidence',
    '10. Optimization',
  ];
}

function conflictDetection(review: TradePlanReview): string[] {
  const cross = [
    kv('Entry Decision (frozen reference)', review.crossReferences.entryDecision),
    kv('Position State (frozen reference)', review.crossReferences.positionState),
    kv(
      'Cancellation Triggered (frozen reference)',
      review.crossReferences.cancellationTriggered,
    ),
    '',
  ];
  if (!review.conflict.detected) return [...cross, 'Conflict: NO'];
  return [
    ...cross,
    'Conflict: YES',
    '',
    ...review.conflict.reasons.map((reason) => kv('Reason', reason)),
  ];
}

function aiReview(): string[] {
  return [
    '| Review Item | Result | Severity | Notes |',
    '| --- | --- | --- | --- |',
    '| Wrong Entry Plan | □ | | |',
    '| Wrong Risk Plan | □ | | |',
    '| Wrong TP Plan | □ | | |',
    '| Wrong Execution Plan | □ | | |',
    '| Wrong Position Plan | □ | | |',
    '| Wrong Blocker | □ | | |',
    '| Wrong Cancellation | □ | | |',
    '| Missing Evidence | □ | | |',
    '| Need Optimization | □ | | |',
    '| Code Modification Required | □ | | |',
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
    '| Allowed Files | |',
    '| Forbidden Files | |',
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
    '| Only TradePlan changed | □ |',
    '| RuleBook unchanged | □ |',
    '| Score unchanged | □ |',
    '| Entry unchanged | □ |',
    '| Position Adviser unchanged | □ |',
    '| Public API unchanged | □ |',
    '| Tests PASS | □ |',
    '| Regression PASS | □ |',
    '| Stable Output | □ |',
  ];
}

function nextReview(): string[] {
  return [
    'After Cursor patch:',
    '',
    '1. Export TRADEPLAN_REVIEW.md again.',
    '',
    '2. Review ONLY the modified scope.',
    '',
    '3. If PASS: mark PASS.',
    '',
    'If FAIL: generate another Cursor Prompt.',
  ];
}

function finalVerdict(): string[] {
  return [
    'Reviewer AI selects exactly one:',
    '',
    '- [ ] PASS',
    '- [ ] PASS WITH MINOR ISSUE',
    '- [ ] PASS WITH MAJOR ISSUE',
    '- [ ] INVALID',
  ];
}

/** Render the complete self-contained TRADEPLAN_REVIEW.md Markdown. */
export function formatTradePlanReview(review: TradePlanReview): string {
  return [
    ...reviewMission(),
    '',
    ...section('Metadata', metadata(review)),
    '',
    ...section('MARKET SNAPSHOT', marketSnapshot(review)),
    '',
    ...section('TRADEPLAN SUMMARY', planSummary(review)),
    '',
    ...section('ENTRY PLAN', entryPlan(review)),
    '',
    ...section('RISK PLAN', riskPlan(review)),
    '',
    ...section('TARGET PLAN', targetPlan(review)),
    '',
    ...section('EXECUTION PLAN', executionPlan(review)),
    '',
    ...section('POSITION MANAGEMENT', positionManagement(review)),
    '',
    ...section('RULE REFERENCES', ruleReferences(review)),
    '',
    ...section('EVIDENCE', ruleEvidence(review)),
    '',
    ...section('PLAN BLOCKERS', planBlockers(review)),
    '',
    ...section('CANCELLATION PLAN', cancellationPlan(review)),
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

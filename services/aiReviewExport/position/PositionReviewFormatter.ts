/**
 * TASK 17.4 — Position Review Formatter.
 *
 * Renders POSITION_REVIEW.md — a self-contained AI Review package
 * following the TASK 17.0 AI Audit Standard with the Cursor workflow
 * layout. Markdown only, deterministic, null-safe. No cross-file
 * references, no JSON dump, no recomputation. Review workflow sections
 * are static blank templates for the reviewer AI to fill.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import type { PositionEvidenceItem, PositionReview } from './PositionReviewTypes';

const DIVIDER = '--------------------------------';
const REVIEW_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function evidenceText(evidence: readonly PositionEvidenceItem[]): string {
  return evidence.length > 0
    ? evidence.map((item) => `${item.label}=${item.value}`).join('; ')
    : UNAVAILABLE;
}

function reviewMission(): string[] {
  return [
    '# REVIEW MISSION',
    '',
    'Goal: Review the Position Adviser only.',
    '',
    'Do NOT review: RuleBook, Score Engine, Entry Engine, TradePlan.',
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

function metadata(review: PositionReview): string[] {
  const m = review.metadata;
  return [
    kv('Version', m.version ?? REVIEW_VERSION),
    kv('Trade ID', m.tradeId),
    kv('Position ID', m.positionId),
    kv('Coin', m.coin),
    kv('Side', m.side),
    kv('Strategy', m.strategy),
    kv('Timestamp', m.timestamp),
    kv('Adviser Version', m.adviserVersion),
    kv('Rule Version', m.ruleVersion),
    kv('Engine Version', m.engineVersion),
  ];
}

function positionSnapshot(review: PositionReview): string[] {
  const p = review.positionSnapshot;
  return [
    kv('Entry Price', p.entryPrice),
    kv('Current Price', p.currentPrice),
    kv('PnL %', p.pnlPct),
    kv('PnL USDT', p.pnlUsdt),
    kv('Risk Reward', p.riskReward),
    kv('Stop Loss', p.stopLoss),
    kv('Take Profit', p.takeProfit),
    kv('Trailing Stop', p.trailingStop),
    kv('Break Even', p.breakEven),
    kv('Leverage', p.leverage),
    kv('Position Size', p.positionSize),
    kv('Exposure', p.exposure),
    kv('Holding Time', p.holdingTime),
  ];
}

function marketSnapshot(review: PositionReview): string[] {
  return review.marketSnapshot.map((item) => kv(item.key, item.value));
}

function adviserSummary(review: PositionReview): string[] {
  const s = review.summary;
  return [
    kv('Recommendation', s.recommendation),
    kv('Reason', s.reason),
    kv('Summary', s.summary),
    kv('Confidence', s.confidence),
    kv('Priority', s.priority),
    kv('Adviser State', s.adviserState),
  ];
}

function decisionTree(review: PositionReview): string[] {
  return review.decisionTree.flatMap((step, index) => [
    ...(index > 0 ? ['  |'] : []),
    `${step.stage}: ${step.result} (${step.detail})`,
  ]);
}

function checklist(review: PositionReview): string[] {
  return table(
    [
      'Check ID',
      'Rule ID',
      'Rule Name',
      'Priority',
      'Status',
      'Reason',
      'Recommendation',
      'Evidence',
      'Source',
    ],
    review.checks.map((check) => [
      check.checkId,
      check.ruleId,
      check.ruleName,
      check.priority,
      check.status,
      check.reason,
      check.recommendation,
      evidenceText(check.evidence),
      check.source,
    ]),
  );
}

function ruleReferences(review: PositionReview): string[] {
  return table(
    ['Rule ID', 'Rule Name', 'Module', 'Priority', 'Evidence', 'Triggered', 'Hard Exit'],
    review.ruleReferences.map((reference) => [
      reference.ruleId,
      reference.ruleName,
      reference.module,
      reference.priority,
      reference.evidence,
      reference.triggered,
      reference.hardExit,
    ]),
  );
}

function stopLossPlan(review: PositionReview): string[] {
  const plan = review.stopLossPlan;
  return [
    kv('Current SL', plan.currentSl),
    kv('Suggested SL', plan.suggestedSl),
    kv('Reason', plan.reason),
    kv('Break Even', plan.breakEven),
    kv('Trailing', plan.trailing),
    kv('Protection Type', plan.protectionType),
  ];
}

function takeProfitPlan(review: PositionReview): string[] {
  const plan = review.takeProfitPlan;
  return [
    kv('Current TP', plan.currentTp),
    kv('Suggested TP', plan.suggestedTp),
    kv('Scale Out', plan.scaleOut),
    kv('Remaining', plan.remaining),
    kv('Reason', plan.reason),
  ];
}

function positionManagement(review: PositionReview): string[] {
  const management = review.positionManagement;
  return [
    kv('Initial Adviser State', management.initialAdviserState),
    kv('Current Adviser State', management.currentAdviserState),
    kv('Expected Adviser State', management.expectedAdviserState),
    kv('Protection', management.protection),
    kv('Close Condition', management.closeCondition),
  ];
}

function ruleEvidence(review: PositionReview): string[] {
  return review.ruleEvidence.flatMap((item, index) => [
    ...(index > 0 ? [''] : []),
    `${item.ruleId} — ${item.ruleName}`,
    kv('Evidence', evidenceText(item.evidence)),
  ]);
}

function reviewFocus(): string[] {
  return [
    '1. Recommendation',
    '2. Rule Trigger',
    '3. Stop Loss',
    '4. Take Profit',
    '5. Scale Out',
    '6. Break Even',
    '7. Trailing',
    '8. Evidence',
    '9. Conflict',
    '10. Optimization',
  ];
}

function conflictDetection(review: PositionReview): string[] {
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
    '| Wrong Recommendation | □ | | |',
    '| Wrong Stop Loss | □ | | |',
    '| Wrong Take Profit | □ | | |',
    '| Wrong Scale Out | □ | | |',
    '| Wrong Break Even | □ | | |',
    '| Wrong Trailing | □ | | |',
    '| Wrong Rule | □ | | |',
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
    '| Only Position Adviser changed | □ |',
    '| RuleBook unchanged | □ |',
    '| Score unchanged | □ |',
    '| Entry unchanged | □ |',
    '| TradePlan unchanged | □ |',
    '| API unchanged | □ |',
    '| Tests PASS | □ |',
    '| Regression PASS | □ |',
    '| Stable Output | □ |',
  ];
}

function nextReview(): string[] {
  return [
    'After Cursor patch:',
    '',
    '1. Export POSITION_REVIEW.md again.',
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

/** Render the complete self-contained POSITION_REVIEW.md Markdown. */
export function formatPositionReview(review: PositionReview): string {
  return [
    ...reviewMission(),
    '',
    ...section('Metadata', metadata(review)),
    '',
    ...section('POSITION SNAPSHOT', positionSnapshot(review)),
    '',
    ...section('MARKET SNAPSHOT', marketSnapshot(review)),
    '',
    ...section('ADVISER SUMMARY', adviserSummary(review)),
    '',
    ...section('ADVISER DECISION TREE', decisionTree(review)),
    '',
    ...section('CHECKLIST', checklist(review)),
    '',
    ...section('RULE REFERENCES', ruleReferences(review)),
    '',
    ...section('STOP LOSS PLAN', stopLossPlan(review)),
    '',
    ...section('TAKE PROFIT PLAN', takeProfitPlan(review)),
    '',
    ...section('POSITION MANAGEMENT', positionManagement(review)),
    '',
    ...section('EVIDENCE', ruleEvidence(review)),
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

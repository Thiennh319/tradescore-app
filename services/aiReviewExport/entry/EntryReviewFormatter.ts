/**
 * TASK 17.3 — Entry Review Formatter.
 *
 * Renders ENTRY_REVIEW.md — a self-contained AI Review package following
 * the TASK 17.0 AI Audit Standard and the TASK 17.1.1 workflow layout.
 * Markdown only, deterministic, null-safe. No cross-file references, no
 * JSON dump, no recomputation. Review workflow sections are static blank
 * templates for the reviewer AI to fill.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import type { EntryEvidenceItem, EntryReview } from './EntryReviewTypes';

const DIVIDER = '--------------------------------';
const REVIEW_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function evidenceText(evidence: readonly EntryEvidenceItem[]): string {
  return evidence.length > 0
    ? evidence.map((item) => `${item.label}=${item.value}`).join('; ')
    : UNAVAILABLE;
}

function reviewMission(): string[] {
  return [
    '# REVIEW MISSION',
    '',
    'Goal: Review the Entry Decision only.',
    '',
    'Do NOT review: RuleBook, Score Engine, Position Adviser, TradePlan, UI, Analytics.',
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

function reviewRules(): string[] {
  return [
    'Review ONLY Entry Decision.',
    '',
    'Do NOT review:',
    '',
    '- RuleBook',
    '- Score Engine',
    '- Position Adviser',
    '- TradePlan',
    '- UI',
    '- Analytics',
    '- Store',
    '',
    'Use ONLY information inside this document.',
    '',
    'If an issue exists, the reviewer AI MUST:',
    '',
    '1. Explain',
    '2. Justify',
    '3. Estimate impact',
    '4. Generate Cursor Prompt',
    '5. Wait for next review',
    '',
    'Exporter fills nothing.',
  ];
}

function metadata(review: EntryReview): string[] {
  const m = review.metadata;
  return [
    kv('Version', m.version ?? REVIEW_VERSION),
    kv('Trade ID', m.tradeId),
    kv('Coin', m.coin),
    kv('Side', m.side),
    kv('Timestamp', m.timestamp),
    kv('Entry Version', m.entryVersion),
    kv('Rule Version', m.ruleVersion),
    kv('Engine Version', m.engineVersion),
  ];
}

function marketSnapshot(review: EntryReview): string[] {
  return review.marketSnapshot.map((item) => kv(item.key, item.value));
}

function entrySummary(review: EntryReview): string[] {
  const s = review.summary;
  return [
    kv('Decision', s.decision),
    kv('Confidence', s.confidence),
    kv('Grade', s.grade),
    kv('Recommendation', s.recommendation),
    kv('Reason', s.reason),
    kv('Summary', s.summary),
    kv('RuleBook State', s.rulebookState),
    kv('Passed Checks', s.passedChecks),
    kv('Failed Checks', s.failedChecks),
    kv('Warnings', s.warnings),
    kv('Hard Blocks', s.hardBlocks),
    kv('Group Blocks', s.groupBlocks),
    kv('Soft Blocks', s.softBlocks),
    kv('Unlock Rules', s.unlockRules),
  ];
}

function decisionTree(review: EntryReview): string[] {
  return review.decisionTree.flatMap((step, index) => [
    ...(index > 0 ? ['  |'] : []),
    `${step.stage}: ${step.result} (${step.detail})`,
  ]);
}

function checklist(review: EntryReview): string[] {
  return table(
    [
      'Check ID',
      'Rule ID',
      'Rule Name',
      'Priority',
      'Status',
      'Actual',
      'Expected',
      'Threshold',
      'Difference',
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
      check.actual,
      check.expected,
      check.threshold,
      check.difference,
      check.reason,
      check.recommendation,
      evidenceText(check.evidence),
      check.source,
    ]),
  );
}

function blockers(review: EntryReview): string[] {
  return table(
    ['Type', 'Rule', 'Priority', 'Trigger', 'Reason', 'Override', 'Evidence'],
    review.blockers.map((blocker) => [
      blocker.type,
      blocker.rule,
      blocker.priority,
      blocker.trigger,
      blocker.reason,
      blocker.override,
      evidenceText(blocker.evidence),
    ]),
  );
}

function ruleReferences(review: EntryReview): string[] {
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

function ruleEvidence(review: EntryReview): string[] {
  return review.ruleEvidence.flatMap((item, index) => [
    ...(index > 0 ? [''] : []),
    `${item.ruleId} — ${item.ruleName}`,
    kv('Evidence', evidenceText(item.evidence)),
  ]);
}

function reviewFocus(): string[] {
  return [
    '1. Decision',
    '2. Threshold',
    '3. Blockers',
    '4. Evidence',
    '5. Checklist',
    '6. Rule Dependency',
    '7. Confidence',
    '8. Recommendation',
    '9. Rule Interaction',
    '10. Optimization',
  ];
}

function conflictDetection(review: EntryReview): string[] {
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
    '| Wrong Decision | □ | | |',
    '| Wrong Threshold | □ | | |',
    '| Wrong Blocker | □ | | |',
    '| Missing Check | □ | | |',
    '| Missing Evidence | □ | | |',
    '| Duplicate Evidence | □ | | |',
    '| Wrong Rule | □ | | |',
    '| Logic Conflict | □ | | |',
    '| Need Optimization | □ | | |',
    '| Code Modification Required | □ | | |',
  ];
}

function reviewResult(): string[] {
  return [
    '| Field | Value |',
    '| --- | --- |',
    '| Overall Result | |',
    '| PASS / FAIL | |',
    '| Confidence | |',
    '| Notes | |',
  ];
}

function cursorImplementationPrompt(): string[] {
  return [
    '| Field | Value |',
    '| --- | --- |',
    '| Module | |',
    '| Problem | |',
    '| Current Behaviour | |',
    '| Expected Behaviour | |',
    '| Root Cause | |',
    '| Suggested Fix | |',
    '| Files To Modify | |',
    '| Functions To Modify | |',
    '| Interfaces | |',
    '| Tests | |',
    '| Allowed Files | |',
    '| Forbidden Files | |',
    '| Acceptance Criteria | |',
  ];
}

function implementationConstraints(): string[] {
  return [
    '### Allowed',
    '',
    '- Entry Engine',
    '- Entry Review Export',
    '',
    '### Forbidden',
    '',
    '- RuleBook',
    '- Score Engine',
    '- TradePlan',
    '- Position Adviser',
    '- Trade Engine',
    '- Analytics',
    '- Store',
    '- UI',
    '- CSS',
    '',
    'Architecture: Frozen',
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

function expectedBehaviour(): string[] {
  return [
    '### Before Patch',
    '',
    '...',
    '',
    '### After Patch',
    '',
    '...',
    '',
    'Reviewer fills manually.',
  ];
}

function regressionTarget(): string[] {
  return [
    '### Must remain unchanged',
    '',
    '- [ ] RuleBook',
    '- [ ] Score Engine',
    '- [ ] TradePlan',
    '- [ ] Position Adviser',
    '- [ ] Trade Engine',
    '',
    '### Must retest',
    '',
    '- [ ] Entry Engine',
    '- [ ] Entry Export',
    '- [ ] AI Review Export',
  ];
}

function patchSummary(): string[] {
  return [
    '| Field | Value |',
    '| --- | --- |',
    '| Files Modified | |',
    '| Functions Modified | |',
    '| Rules Modified | |',
    '| Tests Added | |',
    '| Notes | |',
  ];
}

function regressionResult(): string[] {
  return [
    '| Module | Result | Notes |',
    '| --- | --- | --- |',
    '| RuleBook | | |',
    '| Score | | |',
    '| Entry | | |',
    '| Position Adviser | | |',
    '| TradePlan | | |',
    '| AI Export | | |',
    '| Tests | | |',
    '| Overall | | |',
  ];
}

function fixValidationChecklist(): string[] {
  return [
    '| Validation | Status |',
    '| --- | --- |',
    '| Only Entry changed | □ |',
    '| RuleBook unchanged | □ |',
    '| Score unchanged | □ |',
    '| Position Adviser unchanged | □ |',
    '| TradePlan unchanged | □ |',
    '| Trade Engine unchanged | ☐ |',
    '| Public API unchanged | □ |',
    '| Input Contract unchanged | ☐ |',
    '| Tests PASS | □ |',
    '| Regression PASS | □ |',
    '| Stable Output | □ |',
    '| Architecture Frozen | ☐ |',
  ];
}

function nextReview(): string[] {
  return [
    'After Cursor patch:',
    '',
    '1. Export ENTRY_REVIEW.md again.',
    '',
    '2. Review ONLY the modified scope.',
    '',
    '3. If PASS: mark PASS.',
    '',
    'If FAIL: generate another Cursor Prompt.',
  ];
}

function fixHistory(): string[] {
  return [
    '| Round | Problem | Fix | Result |',
    '| --- | --- | --- | --- |',
    '| | | | |',
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

/** Render the complete self-contained ENTRY_REVIEW.md Markdown. */
export function formatEntryReview(review: EntryReview): string {
  return [
    ...reviewMission(),
    '',
    ...section('REVIEW RULES', reviewRules()),
    '',
    ...section('Metadata', metadata(review)),
    '',
    ...section('MARKET SNAPSHOT', marketSnapshot(review)),
    '',
    ...section('ENTRY SUMMARY', entrySummary(review)),
    '',
    ...section('DECISION TREE', decisionTree(review)),
    '',
    ...section('CHECKLIST', checklist(review)),
    '',
    ...section('BLOCKERS', blockers(review)),
    '',
    ...section('RULE REFERENCES', ruleReferences(review)),
    '',
    ...section('EVIDENCE', ruleEvidence(review)),
    '',
    ...section('REVIEW FOCUS', reviewFocus()),
    '',
    ...section('CONFLICT DETECTION', conflictDetection(review)),
    '',
    ...section('AI REVIEW', aiReview()),
    '',
    ...section('REVIEW RESULT', reviewResult()),
    '',
    ...section('CURSOR IMPLEMENTATION PROMPT', cursorImplementationPrompt()),
    '',
    ...section('IMPLEMENTATION CONSTRAINTS', implementationConstraints()),
    '',
    ...section('PATCH REQUIREMENTS', patchRequirements()),
    '',
    ...section('EXPECTED BEHAVIOUR', expectedBehaviour()),
    '',
    ...section('REGRESSION TARGET', regressionTarget()),
    '',
    ...section('PATCH SUMMARY', patchSummary()),
    '',
    ...section('REGRESSION RESULT', regressionResult()),
    '',
    ...section('FIX VALIDATION CHECKLIST', fixValidationChecklist()),
    '',
    ...section('NEXT REVIEW', nextReview()),
    '',
    ...section('FIX HISTORY', fixHistory()),
    '',
    ...aiReviewSpecificationSection(),
    '',
    ...section('FINAL VERDICT', finalVerdict()),
    '',
  ].join('\n');
}

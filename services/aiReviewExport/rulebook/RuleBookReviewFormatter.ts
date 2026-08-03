/**
 * TASK 17.1 / 17.1.1 / 17.5.1 — RuleBook Review Formatter.
 *
 * Renders RULEBOOK_REVIEW.md — a self-contained AI Review package.
 * Markdown only, deterministic, null-safe. No cross-file references, no
 * JSON dump, no recomputation. Review workflow sections are static blank
 * templates for the reviewer AI to fill.
 *
 * TASK 17.5.1 harmonization: REVIEW MISSION, REVIEW FOCUS, and
 * CURSOR IMPLEMENTATION PROMPT naming aligned with Entry / Position /
 * TradePlan. Legacy FIX RECOMMENDATION removed (obsolete — duplicate of
 * AI REVIEW + CURSOR IMPLEMENTATION PROMPT).
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import type {
  ReviewEvidenceItem,
  RuleBookReview,
  RuleBookReviewEvidenceItem,
} from './RuleBookReviewTypes';

const DIVIDER = '--------------------------------';
const REVIEW_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function evidenceText(evidence: readonly ReviewEvidenceItem[]): string {
  return evidence.length > 0
    ? evidence.map((item) => `${item.label}=${item.value}`).join('; ')
    : UNAVAILABLE;
}

function reviewMission(): string[] {
  return [
    '# REVIEW MISSION',
    '',
    'Goal: Review the RuleBook only.',
    '',
    'Do NOT review: Score Engine, Entry Engine, Position Adviser, TradePlan, UI, Analytics.',
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

function metadata(review: RuleBookReview): string[] {
  const m = review.metadata;
  return [
    kv('Version', m.version ?? REVIEW_VERSION),
    kv('Rule Version', m.ruleVersion),
    kv('Engine Version', m.engineVersion),
    kv('Timestamp', m.timestamp),
    kv('Coin', m.coin),
    kv('Side', m.side),
    kv('Trade ID', m.tradeId),
  ];
}

function marketSnapshot(review: RuleBookReview): string[] {
  return review.marketSnapshot.map((item) => kv(item.key, item.value));
}

function ruleSummary(review: RuleBookReview): string[] {
  const s = review.summary;
  return [
    kv('Total Rules', s.totalRules),
    kv('Triggered Rules', s.triggeredRules),
    kv('Passed Rules', s.passedRules),
    kv('Failed Rules', s.failedRules),
    kv('Blocked Rules', s.blockedRules),
    kv('Ignored Rules', s.ignoredRules),
    kv('Warning Rules', s.warningRules),
    kv('RuleBook State', s.rulebookState),
  ];
}

function triggeredRules(review: RuleBookReview): string[] {
  return table(
    ['Rule ID', 'Rule Name', 'Result', 'Priority', 'Reason', 'Evidence'],
    review.triggeredRules.map((rule) => [
      rule.ruleId,
      rule.ruleName,
      rule.result,
      rule.priority,
      rule.reason,
      evidenceText(rule.evidence),
    ]),
  );
}

function blockedRules(review: RuleBookReview): string[] {
  return table(
    ['Rule', 'Trigger', 'Reason', 'Unlock Condition'],
    review.blockedRules.map((rule) => [
      rule.ruleName === UNAVAILABLE ? rule.ruleId : rule.ruleName,
      rule.trigger,
      rule.reason,
      rule.unlockCondition,
    ]),
  );
}

function evidenceBlock(item: RuleBookReviewEvidenceItem): string[] {
  return [
    `${item.ruleId} — ${item.ruleName}`,
    kv('Evidence', evidenceText(item.evidence)),
  ];
}

function ruleEvidence(review: RuleBookReview): string[] {
  return review.ruleEvidence.flatMap((item, index) => [
    ...(index > 0 ? [''] : []),
    ...evidenceBlock(item),
  ]);
}

function ruleDependency(review: RuleBookReview): string[] {
  return review.dependencies.flatMap((dependency, index) => [
    ...(index > 0 ? [''] : []),
    dependency.input,
    '  |',
    dependency.module,
  ]);
}

function reviewFocus(): string[] {
  return [
    '1. RuleBook State',
    '2. Triggered Rules',
    '3. Blocked Rules',
    '4. Evidence',
    '5. Rule Dependency',
    '6. Priority',
    '7. Thresholds',
    '8. Rule Interaction',
    '9. Conflict',
    '10. Optimization',
  ];
}

function conflictDetection(review: RuleBookReview): string[] {
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
    '| Wrong Rule | □ | | |',
    '| Missing Rule | □ | | |',
    '| Duplicate Rule | □ | | |',
    '| Wrong Threshold | □ | | |',
    '| Missing Evidence | □ | | |',
    '| Wrong Priority | □ | | |',
    '| Rule Conflict | □ | | |',
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
    '| Only target module modified | □ |',
    '| Rule logic unchanged | □ |',
    '| Architecture unchanged | □ |',
    '| API unchanged | □ |',
    '| UI unchanged | □ |',
    '| Store unchanged | □ |',
    '| Tests PASS | □ |',
    '| Regression PASS | □ |',
    '| Stable Output | □ |',
  ];
}

function nextReview(): string[] {
  return [
    'Sau khi Cursor hoàn thành patch:',
    '',
    '1. Export lại RULEBOOK_REVIEW.md',
    '',
    '2. Reviewer AI chỉ review đúng các mục đã sửa.',
    '',
    '3. Không audit lại toàn bộ RuleBook nếu không cần.',
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
  ];
}

/** Render the complete self-contained RULEBOOK_REVIEW.md Markdown. */
export function formatRuleBookReview(review: RuleBookReview): string {
  return [
    ...reviewMission(),
    '',
    ...section('Metadata', metadata(review)),
    '',
    ...section('MARKET SNAPSHOT', marketSnapshot(review)),
    '',
    ...section('RULE SUMMARY', ruleSummary(review)),
    '',
    ...section('TRIGGERED RULES', triggeredRules(review)),
    '',
    ...section('BLOCKED RULES', blockedRules(review)),
    '',
    ...section('RULE EVIDENCE', ruleEvidence(review)),
    '',
    ...section('RULE DEPENDENCY', ruleDependency(review)),
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

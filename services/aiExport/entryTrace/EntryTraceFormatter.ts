/**
 * TASK 16.4 — Entry Trace Formatter.
 *
 * Renders a normalized Entry Decision Trace into 03_ENTRY_DECISION.md.
 * Markdown only — no JSON dump, no object dump, no undefined/null leak.
 * Pure and deterministic: same trace → byte-identical output.
 */

import { kv, table, UNAVAILABLE } from '../formatters/markdown';
import { aiReviewSpecificationSection } from '../../aiReviewSpecification';
import { renderTraceSnapshotFieldLines } from '../shared/renderTraceSection';
import type {
  EntryTrace,
  EntryTraceBlockerItem,
  EntryTraceCheckItem,
} from './EntryTraceTypes';

const DIVIDER = '--------------------------------';
const TRACE_VERSION = '1';

function section(title: string, lines: readonly string[]): string[] {
  return [DIVIDER, '', `# ${title}`, '', ...(lines.length > 0 ? lines : [UNAVAILABLE])];
}

function metadata(trace: EntryTrace): string[] {
  const m = trace.metadata;
  return [
    '# Metadata',
    '',
    kv('Version', m.version ?? TRACE_VERSION),
    kv('Trade ID', m.tradeId),
    kv('Coin', m.coin),
    kv('Side', m.side),
    kv('Timestamp', m.timestamp),
    kv('Rule Version', m.ruleVersion),
    kv('Entry Version', m.entryVersion),
    kv('Score Version', m.scoreVersion),
    kv('Engine Version', m.engineVersion),
  ];
}

function entryDecision(trace: EntryTrace): string[] {
  const d = trace.decision;
  return [
    kv('Decision', d.decision ?? null),
    kv('Initial Decision', d.initialDecision ?? null),
    kv('Override', d.override),
    kv('Final Decision', d.finalDecision ?? null),
    kv('Reason', d.reason),
    kv('Summary', d.summary),
    kv('Confidence', d.confidence),
    kv('Grade', d.grade),
  ];
}

function decisionTree(trace: EntryTrace): string[] {
  if (trace.decisionTree.length === 0) return [];
  return trace.decisionTree.flatMap((step, i) => [
    ...(i > 0 ? ['  |'] : []),
    `${step.stage} [${step.result}]${step.detail !== UNAVAILABLE ? ` — ${step.detail}` : ''}`,
  ]);
}

function evidenceLines(evidence: readonly { label: string; value: string }[]): string[] {
  return evidence.length > 0
    ? evidence.map((e) => `- ${e.label}=${e.value}`)
    : [`- ${UNAVAILABLE}`];
}

function checkBlock(check: EntryTraceCheckItem): string[] {
  return [
    `Check ${String(check.index).padStart(3, '0')}`,
    '',
    kv('Check ID', check.id),
    kv('Check Name', check.name),
    kv('Rule ID', check.ruleId),
    kv('Rule Name', check.ruleName),
    kv('Status', check.status),
    kv('Weight', check.weight),
    kv('Priority', check.priority),
    kv('Actual', check.actual),
    kv('Expected', check.expected),
    kv('Threshold', check.threshold),
    kv('Difference', check.difference),
    kv('Reason', check.reason),
    kv('Recommendation', check.recommendation),
    kv('Source', check.source),
    'Evidence:',
    ...evidenceLines(check.evidence),
  ];
}

function checklist(trace: EntryTrace): string[] {
  if (trace.checks.length === 0) return [];
  return trace.checks.flatMap((check, i) => [
    ...(i > 0 ? ['', DIVIDER, ''] : []),
    ...checkBlock(check),
  ]);
}

function blockerBlock(blocker: EntryTraceBlockerItem): string[] {
  return [
    `Blocker ${String(blocker.index).padStart(3, '0')}`,
    kv('Type', blocker.type),
    kv('Trigger', blocker.trigger),
    kv('Override', blocker.override),
    kv('Rule', blocker.rule),
    kv('Reason', blocker.reason),
    kv('Priority', blocker.priority),
    'Evidence:',
    ...evidenceLines(blocker.evidence),
  ];
}

function blockers(trace: EntryTrace): string[] {
  const counts = {
    hard: trace.blockers.filter((b) => b.type === 'HARD').length,
    group: trace.blockers.filter((b) => b.type === 'GROUP').length,
    soft: trace.blockers.filter((b) => b.type === 'SOFT').length,
    unlock: trace.blockers.filter((b) => b.type === 'UNLOCK').length,
  };
  const blocks = trace.blockers.flatMap((blocker, i) => [
    ...(i > 0 ? ['', DIVIDER, ''] : []),
    ...blockerBlock(blocker),
  ]);
  return [
    kv('Hard Block', counts.hard),
    kv('Group Block', counts.group),
    kv('Soft Block', counts.soft),
    kv('Unlock', counts.unlock),
    '',
    ...(blocks.length > 0 ? blocks : [UNAVAILABLE]),
  ];
}

function entryEvidence(trace: EntryTrace): string[] {
  return [
    'One evidence set per check — emitted once in CHECKLIST, cross-referenced here.',
    '',
    ...table(
      [
        'Check',
        'Rule ID',
        'Actual',
        'Expected',
        'Threshold',
        'Difference',
        'Priority',
        'Unit',
        'Reason',
        'Recommendation',
        'Source',
      ],
      trace.checks.map((check) => [
        check.name,
        check.ruleId,
        check.actual,
        check.expected,
        check.threshold,
        check.difference,
        check.priority,
        check.unit,
        check.reason,
        check.recommendation,
        check.source,
      ]),
    ),
  ];
}

function entryContribution(trace: EntryTrace): string[] {
  return [
    'Contributions are copied from the engine — never summed here.',
    '',
    ...(trace.checks.length > 0
      ? trace.checks.map((check) => kv(check.name, check.contribution))
      : [UNAVAILABLE]),
  ];
}

function ruleBookInteraction(trace: EntryTrace): string[] {
  const r = trace.ruleBook;
  return [
    kv('State Before', r.stateBefore),
    '  |',
    kv('State After', r.stateAfter),
    '',
    kv('Trigger Rule', r.triggerRule),
    kv('Reason', r.reason),
  ];
}

/**
 * Single source of truth for the export field "RuleBook State"
 * (DECISION CHAIN + ENTRY SUMMARY). Prefer entrySummary; fall back to
 * ruleBook.stateAfter when callers only populate RULEBOOK INTERACTION.
 */
function exportedRuleBookState(trace: EntryTrace) {
  return trace.entrySummary.ruleBookState ?? trace.ruleBook.stateAfter;
}

function decisionChain(trace: EntryTrace): string[] {
  const d = trace.decision;
  return [
    kv('Market Snapshot', trace.inputSnapshot.length > 0 ? 'PROVIDED' : null),
    '  |',
    kv('Rule Trace', 'SEE 01_RULEBOOK.md'),
    '  |',
    kv('Score Trace', 'SEE 02_SCORE_ENGINE.md'),
    '  |',
    kv('Checklist', trace.checks.length),
    '  |',
    kv('Blockers', trace.blockers.length),
    '  |',
    kv('RuleBook State', exportedRuleBookState(trace)),
    '  |',
    kv('Entry Decision', d.decision ?? null),
    '  |',
    kv('Recommendation', d.recommendation ?? d.summary),
  ];
}

function entryDependency(trace: EntryTrace): string[] {
  return trace.checks.map((check) => `- ${check.name} depends ${check.dependency}`);
}

function conflictDetection(trace: EntryTrace): string[] {
  if (!trace.conflict.detected) return ['Conflict: NO'];
  return [
    'Conflict: YES',
    '',
    ...trace.conflict.reasons.map((reason) => kv('Reason', reason)),
  ];
}

function entrySummary(trace: EntryTrace): string[] {
  const summary = trace.entrySummary;
  return [
    kv('Passed Checks', summary.passedChecks),
    kv('Warnings', summary.warnings),
    kv('Failed Checks', summary.failedChecks),
    kv('Hard Blocks', summary.hardBlocks),
    kv('Group Blocks', summary.groupBlocks),
    kv('Soft Blocks', summary.softBlocks),
    kv('Unlock Rules', summary.unlockRules),
    kv('Decision', summary.decision),
    kv('Confidence', summary.confidence),
    kv('Grade', summary.grade),
    kv('RuleBook State', exportedRuleBookState(trace)),
  ];
}

function aiReview(): string[] {
  return [
    'AI REVIEW CHECKLIST',
    '',
    ...table(
      ['Review Item', 'Result', 'Notes'],
      [
        ['Missing Check', '□', 'Missing Check? YES / NO'],
        [
          'Wrong Threshold',
          '□',
          'Threshold Too Strict? YES / NO; Threshold Too Loose? YES / NO',
        ],
        ['Wrong Decision', '□', 'Wrong Decision? YES / NO'],
        ['Wrong Blocker', '□', 'Wrong Blocker? YES / NO'],
        ['Missing Evidence', '□', 'Missing Evidence? YES / NO'],
        ['Duplicate Evidence', '□', 'Duplicate Evidence? YES / NO'],
        ['RuleBook Error', '□', 'Wrong RuleBook State? YES / NO'],
        ['Score Conflict', '□', 'Conflict? YES / NO'],
        ['Entry Conflict', '□', 'Conflict? YES / NO'],
        ['Need Optimization', '□', 'Need Optimization? YES / NO'],
      ],
    ),
  ];
}

/** Render the full 03_ENTRY_DECISION.md Entry Decision Trace document. */
export function formatEntryTrace(trace: EntryTrace): string {
  return [
    ...metadata(trace),
    '',
    ...section(
      'INPUT SNAPSHOT',
      renderTraceSnapshotFieldLines(trace.inputSnapshot),
    ),
    '',
    ...section('ENTRY DECISION', entryDecision(trace)),
    '',
    ...section('DECISION TREE', decisionTree(trace)),
    '',
    ...section('CHECKLIST', checklist(trace)),
    '',
    ...section('BLOCKERS', blockers(trace)),
    '',
    ...section('ENTRY EVIDENCE', entryEvidence(trace)),
    '',
    ...section('ENTRY CONTRIBUTION', entryContribution(trace)),
    '',
    ...section('RULEBOOK INTERACTION', ruleBookInteraction(trace)),
    '',
    ...section('DECISION CHAIN', decisionChain(trace)),
    '',
    ...section('ENTRY DEPENDENCY', entryDependency(trace)),
    '',
    ...section('CONFLICT DETECTION', conflictDetection(trace)),
    '',
    ...section('ENTRY SUMMARY', entrySummary(trace)),
    '',
    ...section('AI REVIEW', aiReview()),
    '',
    ...aiReviewSpecificationSection(),
    '',
  ].join('\n');
}

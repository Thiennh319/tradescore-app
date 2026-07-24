/**
 * TASK 16.4 — Entry Trace Builder.
 *
 * Normalizes the frozen Entry Engine decision journey for Markdown
 * formatting. Copy only — no check re-evaluation, no score arithmetic.
 * Conflict detection is a structural observation on the copied data
 * (e.g. WAIT without any blocker), never a new engine evaluation.
 */

import { fmt } from '../formatters/markdown';
import type {
  EntryTrace,
  EntryTraceBlocker,
  EntryTraceBlockerItem,
  EntryTraceCheck,
  EntryTraceCheckItem,
  EntryTraceConflict,
  EntryTraceEvidence,
  EntryTraceEvidenceItem,
  EntryTraceInput,
  EntryTraceTreeStep,
  EntryTraceTreeStepItem,
} from './EntryTraceTypes';

function evidenceItems(
  evidence: readonly EntryTraceEvidence[] | null | undefined,
): readonly EntryTraceEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function checkItem(check: EntryTraceCheck, index: number): EntryTraceCheckItem {
  return {
    index: index + 1,
    id: fmt(check.id),
    name: fmt(check.name),
    ruleId: fmt(check.ruleId),
    ruleName: fmt(check.ruleName),
    status: fmt(check.status),
    weight: fmt(check.weight),
    priority: fmt(check.priority),
    reason: fmt(check.reason),
    recommendation: fmt(check.recommendation),
    evidence: evidenceItems(check.evidence),
    actual: fmt(check.actual),
    expected: fmt(check.expected),
    threshold: fmt(check.threshold),
    difference: fmt(check.difference),
    unit: fmt(check.unit),
    source: fmt(check.source),
    contribution: fmt(check.contribution),
    dependency: fmt(check.dependency ?? check.source),
    ignored: check.enabled === false || check.status === 'SKIPPED',
  };
}

function blockerItem(blocker: EntryTraceBlocker, index: number): EntryTraceBlockerItem {
  return {
    index: index + 1,
    type: fmt(blocker.type),
    trigger: fmt(blocker.trigger),
    override: typeof blocker.override === 'boolean' ? blocker.override : null,
    rule: fmt(blocker.rule),
    reason: fmt(blocker.reason),
    priority: fmt(blocker.priority),
    evidence: evidenceItems(blocker.evidence),
  };
}

function treeStepItem(step: EntryTraceTreeStep, index: number): EntryTraceTreeStepItem {
  return {
    index: index + 1,
    stage: fmt(step.stage),
    result: fmt(step.result),
    detail: fmt(step.detail),
  };
}

/**
 * Structural conflict observations on the copied data:
 * - WAIT / AVOID with zero blocking entries → "<DECISION> without blocker"
 * - ENTER while a HARD blocker is present → "ENTER despite hard block"
 */
function detectConflict(
  decision: EntryTraceInput['decision'],
  blockers: readonly EntryTraceBlockerItem[],
): EntryTraceConflict {
  const value = decision?.decision ?? null;
  const blocking = blockers.filter(
    (b) => b.type === 'HARD' || b.type === 'SOFT' || b.type === 'GROUP',
  );
  const hardBlocks = blockers.filter((b) => b.type === 'HARD');
  const reasons: string[] = [];

  if ((value === 'WAIT' || value === 'AVOID') && blocking.length === 0) {
    reasons.push(`${value} without blocker`);
  }
  if (value === 'ENTER' && hardBlocks.length > 0) {
    reasons.push(
      `ENTER despite hard block (${hardBlocks.map((b) => b.rule).join(', ')})`,
    );
  }
  return { detected: reasons.length > 0, reasons };
}

/** Build the normalized Entry Decision Trace from frozen input. O(n). */
export function buildEntryTrace(input: EntryTraceInput): EntryTrace {
  const snapshot = input.inputSnapshot ?? {};
  const blockers = (input.blockers ?? []).map(blockerItem);
  return {
    metadata: input.metadata ?? {},
    inputSnapshot: Object.keys(snapshot)
      .sort()
      .map((key) => ({ key, value: fmt(snapshot[key]) })),
    decision: input.decision ?? {},
    decisionTree: (input.decisionTree ?? []).map(treeStepItem),
    checks: (input.checks ?? []).map(checkItem),
    blockers,
    ruleBook: input.ruleBook ?? {},
    entrySummary: input.entrySummary ?? {},
    conflict: detectConflict(input.decision, blockers),
  };
}

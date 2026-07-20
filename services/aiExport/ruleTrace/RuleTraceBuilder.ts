/**
 * TASK 16.2 — Rule Trace Builder.
 *
 * Normalizes the frozen RuleBook journey into a RuleTrace structure.
 * Pure and deterministic: values are copied verbatim, missing data
 * becomes UNAVAILABLE, nothing is re-evaluated or recalculated.
 * Conflict detection is a structural observation on the copied data
 * (hard block overriding passing rules) — not a new rule evaluation.
 */

import { fmt, UNAVAILABLE } from '../formatters/markdown';
import type {
  RuleTrace,
  RuleTraceBlockType,
  RuleTraceConflict,
  RuleTraceInput,
  RuleTraceItem,
  RuleTraceRule,
  RuleTraceSummary,
} from './RuleTraceTypes';

function normalizeBlockType(value: RuleTraceRule['blockType']): RuleTraceBlockType {
  return value === 'HARD' || value === 'SOFT' || value === 'UNLOCK' ? value : 'NONE';
}

function priorityValue(value: RuleTraceRule['priority']): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toItem(rule: RuleTraceRule, index: number): RuleTraceItem {
  const status = fmt(rule.status ?? null);
  const ignored = rule.enabled === false || rule.status === 'SKIPPED';
  return {
    index: index + 1,
    id: fmt(rule.id),
    title: fmt(rule.title),
    status,
    weight: fmt(rule.weight),
    priority: fmt(rule.priority),
    priorityValue: priorityValue(rule.priority),
    expected: fmt(rule.expected),
    actual: fmt(rule.actual),
    reason: fmt(rule.reason),
    recommendation: fmt(rule.recommendation),
    evidence: (rule.evidence ?? []).map((e) => ({ label: fmt(e.label), value: fmt(e.value) })),
    contribution:
      typeof rule.contribution === 'number' && Number.isFinite(rule.contribution)
        ? rule.contribution
        : null,
    dependency: fmt(rule.dependency),
    blockType: normalizeBlockType(rule.blockType),
    mandatory: rule.mandatory === true,
    ignored,
  };
}

function buildSummary(rules: readonly RuleTraceItem[]): RuleTraceSummary {
  let matchedRules = 0;
  let failedRules = 0;
  let ignoredRules = 0;
  let blockedRules = 0;
  let softBlocks = 0;
  let hardBlocks = 0;
  let unlockRules = 0;
  for (const rule of rules) {
    if (rule.ignored) ignoredRules += 1;
    else if (rule.status === 'PASS') matchedRules += 1;
    else if (rule.status === 'FAIL') failedRules += 1;
    if (rule.blockType === 'HARD') hardBlocks += 1;
    if (rule.blockType === 'SOFT') softBlocks += 1;
    if (rule.blockType === 'UNLOCK') unlockRules += 1;
    if ((rule.blockType === 'HARD' || rule.blockType === 'SOFT') && rule.status === 'FAIL') {
      blockedRules += 1;
    }
  }
  return {
    matchedRules,
    failedRules,
    ignoredRules,
    blockedRules,
    softBlocks,
    hardBlocks,
    unlockRules,
  };
}

/** Priority Tree: sorted by priority desc; unknown priority sinks to the bottom. */
function buildPriorityTree(rules: readonly RuleTraceItem[]): readonly RuleTraceItem[] {
  return [...rules].sort((a, b) => {
    const pa = a.priorityValue ?? Number.NEGATIVE_INFINITY;
    const pb = b.priorityValue ?? Number.NEGATIVE_INFINITY;
    if (pa !== pb) return pb - pa;
    return a.index - b.index;
  });
}

/**
 * Conflict Detection — structural observation on copied statuses:
 * a failing HARD block coexisting with passing rules means the block
 * overrides them (e.g. "Funding Hard Block overrides Trend").
 */
function detectConflict(rules: readonly RuleTraceItem[]): RuleTraceConflict {
  const hardFails = rules.filter((r) => r.blockType === 'HARD' && r.status === 'FAIL');
  const passes = rules.filter((r) => r.status === 'PASS' && !r.ignored);
  if (hardFails.length === 0 || passes.length === 0) {
    return { detected: false, reasons: [] };
  }
  const passTitles = passes.map((r) => r.title).join(', ');
  return {
    detected: true,
    reasons: hardFails.map((r) => `${r.title} Hard Block overrides ${passTitles}`),
  };
}

/** Build the normalized Rule Trace from the frozen RuleBook input. O(n log n). */
export function buildRuleTrace(input: RuleTraceInput): RuleTrace {
  const rules = (input.rules ?? []).map(toItem);
  const snapshot = input.inputSnapshot ?? {};
  const inputSnapshot = Object.keys(snapshot)
    .sort()
    .map((key) => ({ key, value: fmt(snapshot[key]) }));

  const gb = input.groupBreakdown;
  const groupBreakdown = {
    rows: (gb?.rows ?? []).map((row) => ({
      group: fmt(row.group),
      layers: fmt(row.layers),
      rawSum: fmt(row.rawSum),
      rawMax: fmt(row.rawMax),
      groupMax: fmt(row.groupMax),
      groupScore: fmt(row.groupScore),
      notes: fmt(row.notes),
    })),
    decisionTotal: fmt(gb?.decisionTotal),
    vwapNote:
      gb?.vwapNote == null || fmt(gb.vwapNote) === UNAVAILABLE
        ? null
        : fmt(gb.vwapNote),
  };

  return {
    metadata: input.metadata ?? {},
    inputSnapshot,
    rules,
    summary: buildSummary(rules),
    priorityTree: buildPriorityTree(rules),
    conflict: detectConflict(rules),
    decision: input.decision ?? {},
    groupBreakdown,
  };
}

export { UNAVAILABLE };

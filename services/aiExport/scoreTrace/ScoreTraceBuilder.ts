/**
 * TASK 16.3 — Score Trace Builder.
 *
 * Normalizes frozen Score Engine state for Markdown formatting. It performs
 * no arithmetic: component contributions and summary totals remain exactly
 * as supplied by the engine.
 */

import { fmt, fmtExportScore2, UNAVAILABLE } from '../formatters/markdown';
import type {
  ScoreTrace,
  ScoreTraceAdjustment,
  ScoreTraceAdjustmentItem,
  ScoreTraceComponent,
  ScoreTraceComponentItem,
  ScoreTraceEvidence,
  ScoreTraceEvidenceItem,
  ScoreTraceHardBlock,
  ScoreTraceHardBlockItem,
  ScoreTraceInput,
} from './ScoreTraceTypes';

function evidenceItems(
  evidence: readonly ScoreTraceEvidence[] | null | undefined,
): readonly ScoreTraceEvidenceItem[] {
  return (evidence ?? []).map((item) => ({
    label: fmt(item.label),
    value: fmt(item.value),
  }));
}

function componentItem(
  component: ScoreTraceComponent,
  index: number,
): ScoreTraceComponentItem {
  return {
    index: index + 1,
    id: fmt(component.id),
    name: fmt(component.name),
    category: fmt(component.category),
    weight: fmt(component.weight),
    maxScore: fmt(component.maxScore),
    actualScore: fmt(component.actualScore),
    contribution: fmt(component.contribution),
    status: fmt(component.status),
    actual: fmt(component.actual),
    expected: fmt(component.expected),
    reason: fmt(component.reason),
    recommendation: fmt(component.recommendation),
    evidence: evidenceItems(component.evidence),
    sourceModule: fmt(component.sourceModule),
    dependency: fmt(component.dependency ?? component.sourceModule),
    ignored: component.enabled === false || component.status === 'SKIPPED',
  };
}

function adjustmentItem(
  adjustment: ScoreTraceAdjustment,
  index: number,
): ScoreTraceAdjustmentItem {
  return {
    index: index + 1,
    id: fmt(adjustment.id),
    reason: fmt(adjustment.reason),
    contribution: fmt(adjustment.contribution),
    evidence: evidenceItems(adjustment.evidence),
    sourceModule: fmt(adjustment.sourceModule),
  };
}

function hardBlockItem(
  block: ScoreTraceHardBlock,
  index: number,
): ScoreTraceHardBlockItem {
  return {
    index: index + 1,
    id: fmt(block.id),
    rule: fmt(block.rule),
    reason: fmt(block.reason),
    overrideScore:
      typeof block.overrideScore === 'boolean' ? block.overrideScore : null,
    evidence: evidenceItems(block.evidence),
  };
}

/**
 * TASK 17.X F1 — read a copied hard-block flag (boolean or YES/NO/TRUE/
 * FALSE spelling). Returns null when the snapshot did not provide it;
 * nothing is inferred.
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
 * TASK 17.X F1 — structural consistency between the copied HardBlocked
 * flag (summary first, then the copied input snapshot) and the HARD / GROUP
 * BLOCK entries. Observation only — copied values are never altered.
 */
function detectConsistency(input: ScoreTraceInput): ScoreTrace['consistency'] {
  const reasons: string[] = [];
  const flag =
    readHardBlockedFlag(input.summary?.hardBlocked) ??
    readHardBlockedFlag((input.inputSnapshot ?? {})['Hard/Group Blocked State']) ??
    readHardBlockedFlag((input.inputSnapshot ?? {})['HardBlocked State']);
  const hardBlockCount = (input.hardBlocks ?? []).length;

  if (flag === true && hardBlockCount === 0) {
    reasons.push('HardBlocked YES but no hard block entries exported');
  }
  if (flag === false && hardBlockCount > 0) {
    reasons.push(
      `HardBlocked NO but ${hardBlockCount} hard block entr${hardBlockCount === 1 ? 'y' : 'ies'} exported`,
    );
  }

  const overridden = readHardBlockedFlag(input.decisionPolicy?.overridden);
  if (
    overridden === true &&
    fmt(input.decisionPolicy?.overrideRule) === 'UNAVAILABLE'
  ) {
    reasons.push('Decision Override YES but Override Rule UNAVAILABLE');
  }

  return { detected: reasons.length > 0, reasons };
}

/** Build a deterministic, normalized Score Trace. O(n), read-only. */
export function buildScoreTrace(input: ScoreTraceInput): ScoreTrace {
  const snapshot = input.inputSnapshot ?? {};
  const gb = input.groupBreakdown;
  return {
    metadata: input.metadata ?? {},
    inputSnapshot: Object.keys(snapshot)
      .sort()
      .map((key) => ({ key, value: fmt(snapshot[key]) })),
    components: (input.components ?? []).map(componentItem),
    bonuses: (input.bonuses ?? []).map(adjustmentItem),
    penalties: (input.penalties ?? []).map(adjustmentItem),
    hardBlocks: (input.hardBlocks ?? []).map(hardBlockItem),
    summary: input.summary ?? {},
    decisionPolicy: input.decisionPolicy ?? {},
    consistency: detectConsistency(input),
    // TASK 18.7 / 18.6.3 — Raw Sum* / Group Score / Decision Total ≤2 decimals.
    groupBreakdown: {
      rows: (gb?.rows ?? []).map((row) => ({
        group: fmt(row.group),
        layers: fmt(row.layers),
        rawSum: fmtExportScore2(row.rawSum),
        rawMax: fmt(row.rawMax),
        groupMax: fmt(row.groupMax),
        groupScore: fmtExportScore2(row.groupScore),
        notes: fmt(row.notes),
      })),
      decisionTotal: fmtExportScore2(gb?.decisionTotal),
      vwapNote:
        gb?.vwapNote == null || fmt(gb.vwapNote) === UNAVAILABLE
          ? null
          : fmt(gb.vwapNote),
    },
  };
}

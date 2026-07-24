/**
 * TASK 17.5.3.6 — Shared Trace section renderer.
 *
 * Renders Markdown section chrome and section bodies from display-ready DTO
 * values. No Builder / Snapshot reads, no mapping, no normalize, no score math.
 *
 * Kind-specific layouts preserve historical Rule Trace and Score Trace output
 * byte-for-byte.
 */

import type { AiExportScalar } from '../types';
import { fmt, kv, table, UNAVAILABLE } from '../formatters/markdown';
import { renderTraceLayer, type TraceLayerBlockKind } from './renderTraceLayer';
import { renderTraceTable, type TraceTableKind } from './renderTraceTable';
import type { TracePresentationLayer } from '../tracePresentationTypes';

export const TRACE_SECTION_DIVIDER = '--------------------------------';
export const TRACE_DEFAULT_VERSION = '1';

export interface TraceSnapshotEntry {
  readonly key: string;
  readonly value: string;
}

export interface TraceEvidenceItem {
  readonly label: string;
  readonly value: string;
}

export interface TracePriorityRow {
  readonly priority: string;
  readonly title: string;
  readonly status: string;
}

export interface TraceAdjustmentBlock {
  readonly index: number;
  readonly id: string;
  readonly reason: string;
  readonly contribution: string;
  readonly sourceModule: string;
  readonly evidence: readonly TraceEvidenceItem[];
}

export interface TraceHardBlockBlock {
  readonly index: number;
  readonly id: string;
  readonly rule: string;
  readonly reason: string;
  readonly overrideScore: boolean | null;
  readonly evidence: readonly TraceEvidenceItem[];
}

/** Section chrome: divider + `# TITLE` + body (or UNAVAILABLE when empty). */
export function renderTraceSection(
  title: string,
  lines: readonly string[],
): string[] {
  return [
    TRACE_SECTION_DIVIDER,
    '',
    `# ${title}`,
    '',
    ...(lines.length > 0 ? lines : [UNAVAILABLE]),
  ];
}

/** Metadata block (no leading divider — document opener). */
export function renderTraceMetadata(
  fields: readonly { readonly label: string; readonly value: AiExportScalar }[],
): string[] {
  return ['# Metadata', '', ...fields.map((field) => kv(field.label, field.value))];
}

/** INPUT SNAPSHOT section from display-ready key/value rows. */
export function renderTraceInputSnapshot(
  snapshot: readonly TraceSnapshotEntry[],
): string[] {
  return renderTraceSection(
    'INPUT SNAPSHOT',
    snapshot.map((item) => kv(item.key, item.value)),
  );
}

/**
 * Layer / component list section.
 * `rule` keeps the historical trailing blank after each block (and after empty).
 * `component` uses standard empty→UNAVAILABLE chrome.
 */
export function renderTraceLayersSection(
  title: string,
  layers: readonly TracePresentationLayer[],
  kind: TraceLayerBlockKind,
): string[] {
  if (kind === 'rule') {
    const blocks =
      layers.length > 0
        ? layers.flatMap((layer, i) => [
            ...(i > 0 ? [TRACE_SECTION_DIVIDER, ''] : []),
            ...renderTraceLayer(layer, 'rule'),
            '',
          ])
        : [UNAVAILABLE, ''];
    return [TRACE_SECTION_DIVIDER, '', `# ${title}`, '', ...blocks];
  }

  const lines =
    layers.length === 0
      ? []
      : layers.flatMap((layer, index) => [
          ...(index > 0 ? ['', TRACE_SECTION_DIVIDER, ''] : []),
          ...renderTraceLayer(layer, 'component'),
        ]);
  return renderTraceSection(title, lines);
}

/** Table section: title chrome + shared table body. */
export function renderTraceTableSection(
  title: string,
  layers: readonly TracePresentationLayer[],
  kind: TraceTableKind,
): string[] {
  return renderTraceSection(title, renderTraceTable(layers, kind));
}

/** Conflict body only (YES/NO + reasons). Caller may wrap with section chrome. */
function renderTraceConflictBody(
  detected: boolean,
  reasons: readonly string[],
): string[] {
  if (!detected) return ['Conflict: NO'];
  return [
    'Conflict: YES',
    '',
    ...reasons.map((reason) => kv('Reason', reason)),
  ];
}

/** CONFLICT DETECTION as a full section. */
export function renderTraceConflictSection(
  detected: boolean,
  reasons: readonly string[],
): string[] {
  return renderTraceSection(
    'CONFLICT DETECTION',
    renderTraceConflictBody(detected, reasons),
  );
}

/** Dependency lines from preformatted dependsLine on each layer. */
function renderTraceDependencyLines(
  layers: readonly TracePresentationLayer[],
): string[] {
  return layers.map((layer) => layer.dependsLine);
}

/** RULE DEPENDENCY / SCORE DEPENDENCY section. */
export function renderTraceDependencySection(
  title: string,
  layers: readonly TracePresentationLayer[],
): string[] {
  return renderTraceSection(title, renderTraceDependencyLines(layers));
}

/** Priority tree body (Rule Trace). */
function renderTracePriorityTreeBody(
  rows: readonly TracePriorityRow[],
): string[] {
  const lines =
    rows.length > 0
      ? rows.flatMap((r) => [`${r.priority}`, `  ${r.title} [${r.status}]`])
      : [UNAVAILABLE];
  return ['Priority (high wins over low):', '', ...lines];
}

/** PRIORITY TREE section (Rule Trace). */
export function renderTracePriorityTreeSection(
  rows: readonly TracePriorityRow[],
): string[] {
  return renderTraceSection('PRIORITY TREE', renderTracePriorityTreeBody(rows));
}

function signedContribution(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * TASK 18.6 Option B — DISPLAY LAYER SCORES (was SCORE CONTRIBUTION).
 * Per-layer display values for reference; they do NOT sum to Decision Total.
 * `_total` retained for call-site compatibility (Decision Total lives in GROUP BREAKDOWN).
 */
export function renderTraceContributionSection(
  layers: readonly TracePresentationLayer[],
  _total?: AiExportScalar,
): string[] {
  const lines = layers.map((layer) =>
    kv(
      layer.layerName,
      layer.contribution === undefined ? null : signedContribution(layer.contribution),
    ),
  );
  return renderTraceSection('DISPLAY LAYER SCORES', [
    'Display Layer Scores are per-layer normalized values for reference.',
    'They do NOT sum directly to the Decision Total — see Group Breakdown below.',
    '',
    ...(lines.length > 0 ? lines : [UNAVAILABLE]),
  ]);
}

/** Display-ready Group Breakdown row (wire prepares values; no score math here). */
export interface TraceGroupBreakdownRow {
  readonly group: string;
  readonly layers: string;
  readonly rawSum: AiExportScalar;
  readonly rawMax: AiExportScalar;
  readonly groupMax: AiExportScalar;
  readonly groupScore: AiExportScalar;
  readonly notes: AiExportScalar;
}

/**
 * TASK 18.6 Option B — GROUP BREAKDOWN.
 * Group Score + Decision Total are copied from the frozen snapshot.
 * Raw Sum* is reconstructed from Display (rawLayerScores are not in the snapshot).
 */
export function renderTraceGroupBreakdownSection(args: {
  readonly rows: readonly TraceGroupBreakdownRow[];
  readonly decisionTotal: AiExportScalar;
  readonly vwapNote?: string | null;
}): string[] {
  return renderTraceSection('GROUP BREAKDOWN', [
    'Decision Total is copied from the frozen snap.score (Group scale; max 15).',
    'Group Score columns are copied from engine groupScores on the snapshot.',
    '',
    ...table(
      ['Group', 'Layers', 'Raw Sum*', 'Raw Max', 'Group Max', 'Group Score', 'Notes'],
      args.rows.map((row) => [
        row.group,
        row.layers,
        row.rawSum,
        row.rawMax,
        row.groupMax,
        row.groupScore,
        row.notes,
      ]),
    ),
    '',
    kv('Decision Total (snap.score)', args.decisionTotal),
    ...(args.vwapNote ? ['', args.vwapNote] : []),
    '',
    '* Raw Sum is reconstructed from rounded Display Layer Scores. The frozen',
    '  snapshot does not store engine rawLayerScores (snapshot limitation).',
    'Group Score is copied from engine groupScores — it is NOT reverse-fitted',
    '  from Decision Total (e.g. NOT Total − A − B).',
    'Applying convertToGroupScoreV4 to reconstructed Raw Sum may differ from the',
    '  copied Group Score by ≤0.03 due to display rounding. This is expected and',
    '  does not indicate a scoring error.',
  ]);
}

/** RULE SUMMARY section from display-ready kv pairs. */
export function renderTraceSummarySection(
  title: string,
  fields: readonly { readonly label: string; readonly value: AiExportScalar }[],
): string[] {
  return renderTraceSection(
    title,
    fields.map((field) => kv(field.label, field.value)),
  );
}

/**
 * Chain / summary body with `  |` separators between steps
 * (SCORE SUMMARY, DECISION CHAIN, SCORE TIMELINE).
 */
function renderTraceChainBody(
  steps: readonly { readonly label?: string; readonly value?: AiExportScalar }[],
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    if (i > 0) lines.push('  |');
    const step = steps[i];
    if (step.label === undefined) {
      lines.push(String(step.value ?? ''));
    } else {
      lines.push(kv(step.label, step.value));
    }
  }
  return lines;
}

/** Full chain section (e.g. DECISION CHAIN, SCORE TIMELINE, SCORE SUMMARY). */
export function renderTraceChainSection(
  title: string,
  steps: readonly { readonly label?: string; readonly value?: AiExportScalar }[],
): string[] {
  return renderTraceSection(title, renderTraceChainBody(steps));
}

function renderEvidenceLines(
  evidence: readonly TraceEvidenceItem[],
): string[] {
  return evidence.length > 0
    ? evidence.map((item) => `- ${item.label}=${item.value}`)
    : [`- ${UNAVAILABLE}`];
}

/** Bonus / Penalty body lines (Score Trace). */
export function renderTraceAdjustmentLines(
  label: 'Bonus' | 'Penalty',
  adjustments: readonly TraceAdjustmentBlock[],
): string[] {
  return adjustments.flatMap((adjustment, index) => [
    ...(index > 0 ? ['', TRACE_SECTION_DIVIDER, ''] : []),
    `${label} ${String(adjustment.index).padStart(3, '0')}`,
    kv(`${label} ID`, adjustment.id),
    kv('Reason', adjustment.reason),
    kv('Contribution', adjustment.contribution),
    kv('Source Module', adjustment.sourceModule),
    'Evidence:',
    ...renderEvidenceLines(adjustment.evidence),
  ]);
}

/** HARD / GROUP BLOCK body lines (Score Trace). */
export function renderTraceHardBlockLines(
  blocks: readonly TraceHardBlockBlock[],
): string[] {
  return blocks.flatMap((block, index) => [
    ...(index > 0 ? ['', TRACE_SECTION_DIVIDER, ''] : []),
    `Block ${String(block.index).padStart(3, '0')}`,
    kv('Block ID', block.id),
    kv('Rule', block.rule),
    kv('Reason', block.reason),
    kv('Override Score', block.overrideScore),
    'Evidence:',
    ...renderEvidenceLines(block.evidence),
  ]);
}

/** Decision-policy body (Score Trace) — values already display-ready. */
export function renderTraceDecisionPolicyBody(args: {
  readonly decision: AiExportScalar;
  readonly decisionThreshold: AiExportScalar;
  readonly decisionPolicy: AiExportScalar;
  readonly decisionSource: AiExportScalar;
  readonly decisionRule: AiExportScalar;
  readonly decisionMapping: AiExportScalar;
  readonly decisionReason: AiExportScalar;
  readonly overridden: AiExportScalar;
  readonly overrideRule: AiExportScalar;
  readonly overrideModule: AiExportScalar;
  readonly overrideReason: AiExportScalar;
  readonly overrideEvidence: readonly {
    readonly label?: AiExportScalar;
    readonly value?: AiExportScalar;
  }[];
}): string[] {
  return [
    kv('Decision', args.decision),
    kv('Decision Threshold', args.decisionThreshold),
    kv('Decision Policy', args.decisionPolicy),
    kv('Decision Source', args.decisionSource),
    kv('Decision Rule', args.decisionRule),
    kv('Decision Mapping', args.decisionMapping),
    kv('Decision Reason', args.decisionReason),
    '',
    kv('Override', args.overridden),
    kv('Override Rule', args.overrideRule),
    kv('Override Module', args.overrideModule),
    kv('Override Reason', args.overrideReason),
    'Override Evidence:',
    ...renderEvidenceLines(
      args.overrideEvidence.map((item) => ({
        label: fmt(item.label),
        value: fmt(item.value),
      })),
    ),
  ];
}

/** SCORE EXPLAINABILITY body (intro + shared table). */
export function renderTraceExplainabilityBody(
  layers: readonly TracePresentationLayer[],
): string[] {
  return [
    'Evidence is emitted once in SCORE COMPONENTS; this table cross-references',
    'the explainability fields without duplicating evidence.',
    '',
    ...renderTraceTable(layers, 'explainability'),
  ];
}

/** AI REVIEW checklist body (kind-specific wording, historically frozen). */
function renderTraceAiReviewBody(kind: 'rule' | 'score'): string[] {
  if (kind === 'rule') {
    return [
      'AI REVIEW CHECKLIST',
      '',
      '- Rule Conflict? YES / NO',
      '- Priority Conflict? YES / NO',
      '- Missing Rule? YES / NO',
      '- Dead Rule? YES / NO',
      '- Duplicate Rule? YES / NO',
      '- Threshold Issue? YES / NO',
      '- Weight Issue? YES / NO',
      '- Evidence Missing? YES / NO',
      '- Decision Correct? YES / NO',
      '- Need Optimization? YES / NO',
      '',
      'Notes:',
      '...',
    ];
  }
  return [
    'SCORE REVIEW CHECKLIST',
    '',
    '- Missing Component? YES / NO',
    '- Wrong Weight? YES / NO',
    '- Wrong Contribution? YES / NO',
    '- Threshold Too Strict? YES / NO',
    '- Threshold Too Loose? YES / NO',
    '- Duplicate Component? YES / NO',
    '- Dead Component? YES / NO',
    '- Bonus Conflict? YES / NO',
    '- Penalty Conflict? YES / NO',
    '- Override Correct? YES / NO',
    '- HardBlocked Consistent? YES / NO',
    '- Decision Mapping Correct? YES / NO',
    '- Final Score Correct? YES / NO',
    '- Need Optimization? YES / NO',
    '',
    'Notes:',
    '...',
  ];
}

/** AI REVIEW full section. */
export function renderTraceAiReviewSection(kind: 'rule' | 'score'): string[] {
  return renderTraceSection('AI REVIEW', renderTraceAiReviewBody(kind));
}

/** Coin + side joined for DECISION CHAIN Input line (Rule Trace). */
export function renderTraceDecisionInputLabel(
  coin: AiExportScalar,
  side: AiExportScalar,
): string | null {
  const inputLabel = [fmt(coin), fmt(side)]
    .filter((v) => v !== UNAVAILABLE)
    .join(' ');
  return inputLabel.length > 0 ? inputLabel : null;
}

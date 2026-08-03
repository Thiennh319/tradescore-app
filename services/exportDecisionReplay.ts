/**
 * TASK 16.2 — Decision Replay Export (READ ONLY).
 *
 * Exports frozen scorer / decision fields only.
 * Does not re-run rules, indicators, score, or decision engines.
 */

import type { LayerResult, ScorerVersion } from '../constants/scoring';
import { FinalEntryStatus } from '../types/scoring';
import type { SignalRow, SignalRowScorerSnapshot } from './signalBoardScan';
import {
  resolveFinalEntryStatus,
  resolveSignalRow,
} from './signalRowView';
import { collectHardBlockReasons } from './tradePlanDisplay';

const UNAVAILABLE = 'UNAVAILABLE';
const NONE = 'NONE';
const RULE_VERSION = 'TradeScore V4';
const DECISION_VERSION = 'EXPORT_PACKAGE_V1';

const SECTION_BORDER = '==========================';
const COIN_BORDER = '========================================================';
const PART_BORDER = '--------------------------------------------------------';

const ENTER_LABELS = new Set(['CO_THE_VAO', 'VAO_TU_TIN', 'SETUP_NGON']);

export type ReplayDecisionLabel =
  | 'LONG'
  | 'SHORT'
  | 'WAIT'
  | 'BLOCKED'
  | 'UNKNOWN';

export type ReplayDirectionBias =
  | 'Bullish'
  | 'Bearish'
  | 'Neutral'
  | 'Unknown';

function cell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (Array.isArray(value)) {
    return value.filter((part) => part != null && part !== '').join(', ');
  }
  if (typeof value === 'string') return value;
  return String(value);
}

function orUnavailable(value: unknown): string {
  const text = cell(value).trim();
  return text.length > 0 ? text : UNAVAILABLE;
}

/** Export-only decision label from frozen snapshot fields (no re-score). */
export function resolveReplayDecision(
  snap: SignalRowScorerSnapshot,
  finalStatus: FinalEntryStatus | undefined,
): ReplayDecisionLabel {
  if (snap.isAmbiguousDirection) return 'UNKNOWN';
  if (finalStatus === FinalEntryStatus.HARD_BLOCKED || snap.hardBlocked) {
    return 'BLOCKED';
  }
  if (
    snap.awaitingRescore ||
    snap.decisionLabel === 'CHO_TAI_CHAM' ||
    !snap.canEnter ||
    !ENTER_LABELS.has(snap.decisionLabel)
  ) {
    return 'WAIT';
  }
  if (snap.direction === 'LONG') return 'LONG';
  if (snap.direction === 'SHORT') return 'SHORT';
  return 'UNKNOWN';
}

function resolveDirectionBias(snap: SignalRowScorerSnapshot): ReplayDirectionBias {
  if (snap.isAmbiguousDirection) return 'Unknown';
  if (snap.direction === 'LONG') return 'Bullish';
  if (snap.direction === 'SHORT') return 'Bearish';
  return 'Neutral';
}

function formatLayerContribution(layer: LayerResult): string {
  if (layer.score == null || !Number.isFinite(layer.score)) return UNAVAILABLE;
  const sign = layer.score > 0 ? '+' : '';
  return `${sign}${layer.score}`;
}

function extractBlockedLayers(
  reasons: readonly string[],
  layers: readonly LayerResult[],
): string {
  if (reasons.length === 0) return NONE;

  const fromReasons = new Set<string>();
  for (const reason of reasons) {
    const matches = reason.match(/\bL(?:5b|5a|\d+)\b/gi) ?? [];
    for (const match of matches) {
      fromReasons.add(match.toUpperCase().replace('L5A', 'L5').replace('L5B', 'L5b'));
    }
  }
  if (fromReasons.size > 0) return [...fromReasons].join(', ');

  const failedMandatory = layers
    .filter((layer) => layer.isMandatoryViolation || (layer.isMandatory && !layer.passed))
    .map((layer) => layer.name || `L${layer.layer}`);
  if (failedMandatory.length > 0) return failedMandatory.join(', ');

  return UNAVAILABLE;
}

function collectDecisionEvidence(snap: SignalRowScorerSnapshot): string[] {
  const lines: string[] = [];

  for (const layer of snap.layers) {
    const reason = cell(layer.reason).trim();
    if (reason) lines.push(`${layer.name || `L${layer.layer}`}: ${reason}`);
  }

  for (const warning of snap.scoringWarnings ?? []) {
    const text = cell(warning).trim();
    if (text) lines.push(`Warning: ${text}`);
  }

  const sideWarnings =
    snap.direction === 'LONG' ? snap.longWarnings : snap.shortWarnings;
  for (const warning of sideWarnings ?? []) {
    const text = cell(warning).trim();
    if (text) lines.push(`Side Warning: ${text}`);
  }

  if (snap.ambiguousMessage) {
    lines.push(`Ambiguity: ${snap.ambiguousMessage}`);
  }

  if (snap.squeezeWarning) {
    lines.push(`Squeeze: ${snap.squeezeWarning}`);
  }

  return lines;
}

function formatDecisionFlow(layers: readonly LayerResult[]): string[] {
  if (layers.length === 0) {
    return ['(no layers)', '', `Decision Contribution: ${UNAVAILABLE}`];
  }

  const lines: string[] = [];
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    lines.push(`Layer ${i + 1}`);
    lines.push(layer.name || `L${layer.layer}`);
    lines.push(`Result: ${layer.passed ? 'PASS' : 'FAIL'}`);
    lines.push('Consumed: YES');
    lines.push(`Contribution: ${formatLayerContribution(layer)}`);
    if (i < layers.length - 1) lines.push('↓');
  }
  return lines;
}

function formatDecisionContributionSection(layers: readonly LayerResult[]): string[] {
  if (layers.length === 0) {
    return [
      '## Decision Contribution',
      '',
      `Contribution: ${UNAVAILABLE}`,
      '',
    ];
  }

  return [
    '## Decision Contribution',
    '',
    ...layers.map((layer) => {
      const name = layer.name || `L${layer.layer}`;
      return `${name}: ${formatLayerContribution(layer)}`;
    }),
    '',
  ];
}

function formatHardBlockSection(
  snap: SignalRowScorerSnapshot,
  finalStatus: FinalEntryStatus | undefined,
): string[] {
  const reasons = collectHardBlockReasons({
    direction: snap.direction,
    mandatoryViolations: snap.mandatoryViolations,
    groupBlocks: snap.groupBlocks,
    longHardBlocks: snap.longHardBlocks,
    shortHardBlocks: snap.shortHardBlocks,
    hardBlocked: snap.hardBlocked,
  });
  const blocked =
    finalStatus === FinalEntryStatus.HARD_BLOCKED ||
    snap.hardBlocked ||
    reasons.length > 0;

  return [
    '## Hard Block Replay',
    '',
    `Blocked: ${blocked ? 'YES' : 'NO'}`,
    `Reason: ${reasons.length > 0 ? reasons.join(' | ') : NONE}`,
    `Blocked Layer: ${extractBlockedLayers(reasons, snap.layers)}`,
    '',
  ];
}

function formatRecoverySection(snap: SignalRowScorerSnapshot): string[] {
  const recovery =
    snap.awaitingRescore === true || snap.decisionLabel === 'CHO_TAI_CHAM';

  if (!recovery) {
    return [
      '## Recovery Replay',
      '',
      'Recovery: NO',
      `Recovered By: ${NONE}`,
      `Recovery Layer: ${NONE}`,
      '',
    ];
  }

  return [
    '## Recovery Replay',
    '',
    'Recovery: YES',
    `Recovered By: ${
      snap.awaitingRescore === true
        ? 'awaitingRescore (frozen)'
        : 'CHO_TAI_CHAM (frozen)'
    }`,
    'Recovery Layer: 9',
    '',
  ];
}

function formatConfidenceSection(): string[] {
  // Decision-level confidence is not stored on SignalRowScorerSnapshot.
  return [
    '## Confidence Replay',
    '',
    `Confidence: ${UNAVAILABLE}`,
    `Raw Confidence: ${UNAVAILABLE}`,
    'Confidence Source: Decision Snapshot',
    '',
  ];
}

function formatDecisionReplayCoinBlock(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportTimestamp: string,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const finalStatus = resolveFinalEntryStatus(row, scorerVersion);
  const decision = resolveReplayDecision(snap, finalStatus);
  const directionBias = resolveDirectionBias(snap);
  const evidence = collectDecisionEvidence(snap);
  const hasDecisionSnapshot =
    row.v4 != null || row.v3 != null || (row.layers?.length ?? 0) > 0;

  const lines: string[] = [
    COIN_BORDER,
    row.symbol,
    COIN_BORDER,
    '',
    SECTION_BORDER,
    'DECISION REPLAY',
    SECTION_BORDER,
    '',
  ];

  if (!hasDecisionSnapshot && snap.layers.length === 0 && !row.decisionLabel) {
    lines.push(
      '## Decision Metadata',
      '',
      `Decision Snapshot: ${UNAVAILABLE}`,
      `Decision: ${UNAVAILABLE}`,
      `Direction: ${UNAVAILABLE}`,
      `Confidence: ${UNAVAILABLE}`,
      `Decision Score: ${UNAVAILABLE}`,
      `Decision Version: ${DECISION_VERSION}`,
      `Rule Version: ${RULE_VERSION}`,
      `Timestamp (snapshot): ${orUnavailable(exportTimestamp)}`,
      '',
    );
    return lines.join('\n').trimEnd();
  }

  lines.push(
    '## Decision Metadata',
    '',
    `Decision: ${decision}`,
    `Direction: ${snap.direction}`,
    `Decision Label: ${orUnavailable(snap.decisionDisplay || snap.decisionLabel)}`,
    `Final Entry Status: ${orUnavailable(finalStatus ?? row.finalEntryStatus)}`,
    `Confidence: ${UNAVAILABLE}`,
    `Decision Score: ${orUnavailable(snap.score)}`,
    `Long Score: ${orUnavailable(snap.longScore)}`,
    `Short Score: ${orUnavailable(snap.shortScore)}`,
    `Decision Version: ${DECISION_VERSION}`,
    `Rule Version: ${RULE_VERSION}`,
    `Scorer Version: ${scorerVersion}`,
    `Timestamp (snapshot): ${orUnavailable(exportTimestamp)}`,
    '',
    PART_BORDER,
    '',
    '## Decision Flow',
    '',
    ...formatDecisionFlow(snap.layers),
    '',
    `Decision: ${decision}`,
    '',
    PART_BORDER,
    '',
    '## Decision Evidence',
    '',
    ...(evidence.length > 0 ? evidence : [`Evidence: ${UNAVAILABLE}`]),
    '',
    PART_BORDER,
    '',
    '## Direction Replay',
    '',
    `Direction: ${directionBias}`,
    'Source: Decision Snapshot',
    '',
    PART_BORDER,
    '',
    ...formatHardBlockSection(snap, finalStatus),
    PART_BORDER,
    '',
    ...formatRecoverySection(snap),
    PART_BORDER,
    '',
    ...formatConfidenceSection(),
    PART_BORDER,
    '',
    ...formatDecisionContributionSection(snap.layers),
  );

  return lines.join('\n').trimEnd();
}

/** TASK 16.2 — Decision Replay text for one or more coins (export only). */
export function formatDecisionReplayTXT(
  rows: SignalRow[],
  scorerVersion: ScorerVersion = 'v4',
  exportTimestamp: string = new Date().toISOString(),
): string {
  return rows
    .map((row) => formatDecisionReplayCoinBlock(row, scorerVersion, exportTimestamp))
    .join('\n\n');
}

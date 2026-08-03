/**
 * TASK R1.3 — Rule Decision Trace (READ ONLY).
 *
 * Builds decisionTrace from frozen scorer snapshot fields only.
 * Does not re-run rules, indicators, score, or decision engines.
 */

import type { LayerResult, ScorerVersion } from '../constants/scoring';
import { FinalEntryStatus } from '../types/scoring';
import {
  resolveReplayDecision,
  type ReplayDecisionLabel,
} from './exportDecisionReplay';
import type { SignalRow, SignalRowScorerSnapshot } from './signalBoardScan';
import {
  resolveFinalEntryStatus,
  resolveSignalRow,
} from './signalRowView';
import { collectHardBlockReasons } from './tradePlanDisplay';

const UNAVAILABLE = 'UNAVAILABLE';
const COIN_BORDER = '========================================================';
const PART_BORDER = '--------------------------------------------------------';

export type DecisionTracePriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DecisionTraceScoreStep {
  step: string;
  score: number;
  maxScore: number;
  reason: string;
}

/**
 * Pillar-shaped summary for AI readability.
 * Only Group A/B/C + total exist on the frozen scorer snapshot.
 * Missing pillars stay null (export as UNAVAILABLE) — never invented.
 *
 * Mapping (engine group names, not recalculated):
 * - trend   ← groupScores.A (GROUP_A_TREND)
 * - volume  ← groupScores.B (GROUP_B_FLOW — volume/OI/CVD/funding/LS)
 * - context ← groupScores.C (GROUP_C_CONTEXT)
 */
export interface DecisionTraceScoreSummary {
  trend: number | null;
  momentum: number | null;
  volume: number | null;
  context: number | null;
  risk: number | null;
  execution: number | null;
  timing: number | null;
  total: number | null;
}

export interface DecisionTraceDecisionPipeline {
  score: number | null;
  grade: string;
  decision: ReplayDecisionLabel;
  blocked: boolean;
  blockedReasons: string[];
}

export interface DecisionTraceRecommendation {
  priority: DecisionTracePriority;
  reason: string;
}

export interface DecisionTrace {
  scorePipeline: DecisionTraceScoreStep[];
  scoreSummary: DecisionTraceScoreSummary;
  decisionPipeline: DecisionTraceDecisionPipeline;
  recommendationPipeline: DecisionTraceRecommendation[];
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildScorePipeline(layers: readonly LayerResult[]): DecisionTraceScoreStep[] {
  return layers.map((layer) => ({
    step: layer.name || `L${layer.layer}`,
    score: finiteOrNull(layer.score) ?? 0,
    maxScore: finiteOrNull(layer.maxScore) ?? 0,
    reason: layer.reason || UNAVAILABLE,
  }));
}

function buildScoreSummary(snap: SignalRowScorerSnapshot): DecisionTraceScoreSummary {
  const groups = snap.groupScores;
  return {
    trend: finiteOrNull(groups?.A),
    momentum: null,
    volume: finiteOrNull(groups?.B),
    context: finiteOrNull(groups?.C),
    risk: null,
    execution: null,
    timing: null,
    total: finiteOrNull(snap.score),
  };
}

function buildBlockedReasons(
  snap: SignalRowScorerSnapshot,
  finalStatus: FinalEntryStatus | undefined,
): string[] {
  const reasons: string[] = [];

  const hard = collectHardBlockReasons({
    direction: snap.direction,
    mandatoryViolations: snap.mandatoryViolations,
    groupBlocks: snap.groupBlocks,
    longHardBlocks: snap.longHardBlocks,
    shortHardBlocks: snap.shortHardBlocks,
    hardBlocked: snap.hardBlocked,
  });
  reasons.push(...hard);

  for (const block of snap.groupBlocks ?? []) {
    if (!reasons.includes(block)) reasons.push(block);
  }

  const sideBlocks =
    snap.direction === 'LONG'
      ? (snap.longBlockReasons ?? [])
      : (snap.shortBlockReasons ?? []);
  for (const block of sideBlocks) {
    if (!reasons.includes(block)) reasons.push(block);
  }

  for (const layer of snap.layers) {
    if (!layer.isMandatoryViolation && !layer.isMandatory) continue;
    if (layer.passed && !layer.isMandatoryViolation) continue;
    const label = layer.name || `L${layer.layer}`;
    if (!reasons.includes(label)) reasons.push(label);
  }

  if (
    finalStatus === FinalEntryStatus.HARD_BLOCKED ||
    finalStatus === FinalEntryStatus.GROUP_BLOCKED ||
    finalStatus === FinalEntryStatus.SCORE_BLOCKED
  ) {
    const statusReason = `FinalEntryStatus: ${finalStatus}`;
    if (!reasons.includes(statusReason)) reasons.push(statusReason);
  }

  if (snap.isAmbiguousDirection && snap.ambiguousMessage) {
    if (!reasons.includes(snap.ambiguousMessage)) {
      reasons.push(snap.ambiguousMessage);
    }
  }

  return reasons;
}

function buildDecisionPipeline(
  snap: SignalRowScorerSnapshot,
  finalStatus: FinalEntryStatus | undefined,
): DecisionTraceDecisionPipeline {
  const blockedReasons = buildBlockedReasons(snap, finalStatus);
  const decision = resolveReplayDecision(snap, finalStatus);
  const blocked =
    snap.hardBlocked ||
    finalStatus === FinalEntryStatus.HARD_BLOCKED ||
    finalStatus === FinalEntryStatus.GROUP_BLOCKED ||
    finalStatus === FinalEntryStatus.SCORE_BLOCKED ||
    decision === 'BLOCKED' ||
    blockedReasons.length > 0;

  return {
    score: finiteOrNull(snap.score),
    // Letter grade is not stored on SignalRowScorerSnapshot — do not invent.
    grade: UNAVAILABLE,
    decision,
    blocked,
    blockedReasons,
  };
}

function pushUniqueRecommendation(
  out: DecisionTraceRecommendation[],
  seen: Set<string>,
  priority: DecisionTracePriority,
  reason: string,
): void {
  const text = reason.trim();
  if (!text || seen.has(text)) return;
  seen.add(text);
  out.push({ priority, reason: text });
}

function buildRecommendationPipeline(
  snap: SignalRowScorerSnapshot,
  decisionPipeline: DecisionTraceDecisionPipeline,
): DecisionTraceRecommendation[] {
  const out: DecisionTraceRecommendation[] = [];
  const seen = new Set<string>();

  for (const reason of decisionPipeline.blockedReasons) {
    pushUniqueRecommendation(out, seen, 'HIGH', reason);
  }

  for (const warning of snap.scoringWarnings ?? []) {
    pushUniqueRecommendation(out, seen, 'MEDIUM', warning);
  }

  const sideWarnings =
    snap.direction === 'LONG' ? snap.longWarnings : snap.shortWarnings;
  for (const warning of sideWarnings ?? []) {
    pushUniqueRecommendation(out, seen, 'MEDIUM', warning);
  }

  if (snap.squeezeWarning) {
    pushUniqueRecommendation(out, seen, 'MEDIUM', snap.squeezeWarning);
  }

  if (snap.awaitingRescore) {
    pushUniqueRecommendation(
      out,
      seen,
      'MEDIUM',
      'awaitingRescore (frozen) — CHO_TAI_CHAM / L9 session',
    );
  }

  // Failed layers explain score drag — frozen reason only.
  for (const layer of snap.layers) {
    if (layer.passed) continue;
    const deficit =
      Number.isFinite(layer.maxScore) && Number.isFinite(layer.score)
        ? layer.maxScore - layer.score
        : null;
    const reason =
      deficit != null && deficit > 0
        ? `${layer.name || `L${layer.layer}`}: ${layer.reason || UNAVAILABLE} (score ${layer.score}/${layer.maxScore})`
        : `${layer.name || `L${layer.layer}`}: ${layer.reason || UNAVAILABLE}`;
    pushUniqueRecommendation(out, seen, 'LOW', reason);
  }

  return out;
}

/** Build decisionTrace object from frozen scorer snapshot (no re-score). */
export function buildDecisionTrace(
  row: SignalRow,
  scorerVersion: ScorerVersion = 'v4',
): DecisionTrace {
  const snap = resolveSignalRow(row, scorerVersion);
  const finalStatus = resolveFinalEntryStatus(row, scorerVersion);
  const scorePipeline = buildScorePipeline(snap.layers);
  const scoreSummary = buildScoreSummary(snap);
  const decisionPipeline = buildDecisionPipeline(snap, finalStatus);
  const recommendationPipeline = buildRecommendationPipeline(
    snap,
    decisionPipeline,
  );

  return {
    scorePipeline,
    scoreSummary,
    decisionPipeline,
    recommendationPipeline,
  };
}

function summaryCell(value: number | null): string {
  return value == null ? UNAVAILABLE : String(value);
}

function formatDecisionTraceCoinBlock(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string {
  const trace = buildDecisionTrace(row, scorerVersion);
  const lines: string[] = [
    COIN_BORDER,
    row.symbol,
    COIN_BORDER,
    '',
    'decisionTrace',
    '',
    '## scorePipeline',
    '',
  ];

  if (trace.scorePipeline.length === 0) {
    lines.push(`(no layers) ${UNAVAILABLE}`, '');
  } else {
    for (const step of trace.scorePipeline) {
      lines.push(
        `{`,
        `  step: ${step.step}`,
        `  score: ${step.score}`,
        `  maxScore: ${step.maxScore}`,
        `  reason: ${step.reason}`,
        `}`,
        '',
      );
    }
  }

  lines.push(
    PART_BORDER,
    '',
    '## scoreSummary',
    '',
    `{`,
    `  trend: ${summaryCell(trace.scoreSummary.trend)}`,
    `  momentum: ${summaryCell(trace.scoreSummary.momentum)}`,
    `  volume: ${summaryCell(trace.scoreSummary.volume)}`,
    `  context: ${summaryCell(trace.scoreSummary.context)}`,
    `  risk: ${summaryCell(trace.scoreSummary.risk)}`,
    `  execution: ${summaryCell(trace.scoreSummary.execution)}`,
    `  timing: ${summaryCell(trace.scoreSummary.timing)}`,
    `  total: ${summaryCell(trace.scoreSummary.total)}`,
    `}`,
    '',
    PART_BORDER,
    '',
    '## decisionPipeline',
    '',
    `{`,
    `  score: ${summaryCell(trace.decisionPipeline.score)}`,
    `  grade: ${trace.decisionPipeline.grade}`,
    `  decision: ${trace.decisionPipeline.decision}`,
    `  blocked: ${trace.decisionPipeline.blocked}`,
    `  blockedReasons: [`,
    ...(trace.decisionPipeline.blockedReasons.length > 0
      ? trace.decisionPipeline.blockedReasons.map((r) => `    ${r}`)
      : [`    (none)`]),
    `  ]`,
    `}`,
    '',
    PART_BORDER,
    '',
    '## recommendationPipeline',
    '',
  );

  if (trace.recommendationPipeline.length === 0) {
    lines.push(`(none)`, '');
  } else {
    for (const item of trace.recommendationPipeline) {
      lines.push(
        `{`,
        `  priority: ${item.priority}`,
        `  reason: ${item.reason}`,
        `}`,
        '',
      );
    }
  }

  return lines.join('\n').trimEnd();
}

/** TASK R1.3 — Decision Trace text for Audit Package SECTION. */
export function formatDecisionTraceTXT(
  rows: SignalRow[],
  scorerVersion: ScorerVersion = 'v4',
): string {
  return rows
    .map((row) => formatDecisionTraceCoinBlock(row, scorerVersion))
    .join('\n\n');
}

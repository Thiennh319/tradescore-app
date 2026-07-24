/**
 * TASK 17.6 — Trace + AI Review Export wire (App Integration).
 *
 * Read-only dispatcher: maps a frozen SignalRow snapshot into Phase 16
 * Trace / Phase 17 Review inputs and calls the existing public APIs.
 *
 * NEVER re-scans, NEVER re-queries Binance, NEVER re-runs engines.
 * Missing frozen snapshot → soft failure message (no throw).
 */

import { BUILD_INFO } from '../constants/buildInfo';
import {
  LAYER_MAX_POINTS,
  SCORING_GROUPS_V4,
  type ScorerVersion,
} from '../constants/scoring';
import type { EsmBridgeState } from '../store/esmBridgeTypes';
import { getEsmSnapshotForSymbol } from '../store/esmBridgeTypes';
import {
  buildEntryTraceExport,
  buildPositionAdviserTraceExport,
  buildRuleTraceExport,
  buildScoreTraceExport,
  buildTradePlanTraceExport,
} from './aiExport';
import {
  buildEntryReviewExport,
  buildPositionReviewExport,
  buildRuleBookReviewExport,
  buildScoreReviewExport,
  buildTradePlanReviewExport,
} from './aiReviewExport';
import type { SignalRow } from './signalBoardScan';
import { kv, table, UNAVAILABLE } from './aiExport/formatters/markdown';
import {
  layerTraceDependency,
  layerTraceRecommendation,
  layerTraceStatus,
  normalizePsychologyLayerReason,
} from './aiExport/traceLayerPresentation';
import {
  resolveFinalEntryStatus,
  resolveSignalRow,
  resolveTradePlanV3,
} from './signalRowView';

export const REVIEW_EXPORT_UNAVAILABLE = 'No snapshot available.';

export type TraceReviewExportKind =
  | 'trace-rulebook'
  | 'trace-score'
  | 'trace-entry'
  | 'trace-position'
  | 'trace-tradeplan'
  | 'review-rulebook'
  | 'review-score'
  | 'review-entry'
  | 'review-position'
  | 'review-tradeplan';

export const TRACE_REVIEW_FILENAMES: Record<TraceReviewExportKind, string> = {
  'trace-rulebook': '01_RULEBOOK.md',
  'trace-score': '02_SCORE_ENGINE.md',
  'trace-entry': '03_ENTRY_DECISION.md',
  'trace-position': '04_POSITION_ADVISER.md',
  'trace-tradeplan': '05_TRADE_PLAN.md',
  'review-rulebook': 'RULEBOOK_REVIEW.md',
  'review-score': 'SCORE_REVIEW.md',
  'review-entry': 'ENTRY_REVIEW.md',
  'review-position': 'POSITION_REVIEW.md',
  'review-tradeplan': 'TRADEPLAN_REVIEW.md',
};

export type TraceReviewExportResult =
  | { ok: true; markdown: string; filename: string }
  | { ok: false; message: string };

export interface TraceReviewExportContext {
  readonly rows: readonly SignalRow[];
  readonly scorerVersion: ScorerVersion;
  readonly esmBridge?: EsmBridgeState;
  /** Frozen wall-clock for metadata only — caller supplies. */
  readonly exportedAt?: string;
}

function pickFrozenRow(
  rows: readonly SignalRow[],
  scorerVersion: ScorerVersion,
): SignalRow | null {
  if (rows.length === 0) return null;
  const enterable = rows.find((row) => {
    if (row.error) return false;
    return resolveSignalRow(row, scorerVersion).canEnter;
  });
  if (enterable) return enterable;
  return rows.find((row) => !row.error) ?? rows[0] ?? null;
}

/**
 * TASK 17.6.1 — one label, one concept. Every value is copied verbatim
 * from the frozen snapshot (no derive, no infer, no recompute):
 * - "HardBlocked State"          → engine-level hard block STATE flag.
 * - "Total Blocking Events"      → size of the engine's merged block list
 *                                  (hard + score + group). NOT the number of
 *                                  failed mandatory rules (TRACE SELF-DOC).
 * - "Hard Block (Engine / All Sources)" → size of the per-side hard block list.
 * - "Score Block Count"          → size of the per-side score block list.
 * - "Entry Permission"           → engine `canEnter` flag.
 * - "Entry State"                → engine `finalEntryStatus`.
 * - "ADX Gate *"                 → independent ADX gate snapshot.
 * Missing fields stay undefined → rendered as UNAVAILABLE downstream.
 */
function marketSnapshotFromRow(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): Record<string, string | number | boolean | null | undefined> {
  const snap = resolveSignalRow(row, scorerVersion);
  const audit = row.ruleAuditSnapshot;
  const sideHardBlocks =
    snap.direction === 'LONG' ? snap.longHardBlocks : snap.shortHardBlocks;
  const sideScoreBlocks =
    snap.direction === 'LONG' ? snap.longBlockReasons : snap.shortBlockReasons;
  return {
    Price: row.price,
    Trend: row.trend,
    Change24h: row.change24h,
    RegimeConfidence: row.regimeConfidence,
    Funding: row.fundingRate ?? audit?.funding?.ratePct,
    CVD: row.cvdValue ?? audit?.cvd?.value,
    CvdTrend: row.cvdTrend ?? audit?.cvd?.trend,
    TopLSRatio: row.topLSRatio,
    ATR1h: row.atr1h ?? audit?.atr?.atr1h,
    ADX1h: row.adxData?.adx1H ?? audit?.adx?.adx1h,
    ADX4h: row.adxData?.adx4H ?? audit?.adx?.adx4h,
    Score: snap.score,
    Direction: snap.direction,
    Decision: snap.decisionLabel,
    'Entry Permission': snap.canEnter,
    'Entry State': resolveFinalEntryStatus(row, scorerVersion),
    'HardBlocked State': snap.hardBlocked,
    'Hard Block (Engine / All Sources)': sideHardBlocks?.length,
    'Score Block Count': sideScoreBlocks?.length,
    'Group Block Count': (snap.groupBlocks ?? []).length,
    'Total Blocking Events': snap.mandatoryViolations.length,
    'Warning Count': (snap.scoringWarnings ?? []).length,
    'ADX Gate Allowed': row.adxGate?.allowed,
    'ADX Gate Regime': row.adxGate?.regime,
    'ADX Gate Block Reason': row.adxBlockReason,
  };
}

function tradeIdOf(row: SignalRow, scorerVersion: ScorerVersion): string {
  const snap = resolveSignalRow(row, scorerVersion);
  return `${row.symbol}-${snap.direction}-${scorerVersion}`;
}

function buildRulebookReviewMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const layers = snap.layers ?? [];
  const triggered = layers.map((layer) => ({
    ruleId: `L${layer.layer}`,
    ruleName: layer.name,
    result: layerTraceStatus(layer.passed, layer.isMandatoryViolation),
    priority: layer.isMandatory ? 'CRITICAL' : 'NORMAL',
    reason: layer.reason,
    evidence: [
      { label: 'Score', value: layer.score },
      { label: 'Max', value: layer.maxScore },
    ],
  }));
  const blocked = (snap.mandatoryViolations ?? []).map((name, index) => ({
    ruleId: `MV-${index + 1}`,
    ruleName: name,
    trigger: 'Mandatory violation',
    reason: name,
    unlockCondition: 'Resolve mandatory block',
  }));
  return buildRuleBookReviewExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      coin: row.symbol,
      side: snap.direction,
      timestamp: exportedAt,
      ruleVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    marketSnapshot: marketSnapshotFromRow(row, scorerVersion),
    summary: {
      totalRules: layers.length,
      triggeredRules: layers.length,
      passedRules: layers.filter((l) => l.passed).length,
      failedRules: layers.filter((l) => l.isMandatoryViolation).length,
      blockedRules: blocked.length,
      ignoredRules: 0,
      warningRules: layers.filter((l) => !l.passed && !l.isMandatoryViolation).length,
      rulebookState: snap.hardBlocked ? 'BLOCKED' : snap.canEnter ? 'PASS' : 'WAIT',
    },
    triggeredRules: triggered,
    blockedRules: blocked,
    ruleEvidence: triggered.map((rule) => ({
      ruleId: rule.ruleId,
      ruleName: rule.ruleName,
      evidence: rule.evidence,
    })),
    dependencies: layers.map((layer) => ({
      input: layer.name,
      module: `Layer ${layer.layer}`,
    })),
  });
}

/**
 * TASK 17.6.1 — the engine's `hardBlocked` flag is defined as
 * `hardBlocks.length > 0 || groupBlocks.length > 0` (signalBoardScan).
 * Score Trace/Review forward both lists in one section (Hard/Group Block),
 * distinguished by ID prefix (HB- / GB-) and evidence label — not by treating
 * every entry as a Hard Block.
 * (Mandatory rule violations stay in their own channels: penalties /
 * blocked rules / "Total Blocking Events".)
 */
type HardOrGroupBlockEntry = {
  readonly reason: string;
  readonly kind: 'hard' | 'group';
};

function hardBlockEntriesOf(
  snap: ReturnType<typeof resolveSignalRow>,
): readonly HardOrGroupBlockEntry[] {
  // Legacy cached rows carry no per-side lists; their `mandatoryViolations`
  // was the only recorded block list, so it remains the copied fallback.
  const sideHardBlocks =
    snap.direction === 'LONG'
      ? snap.longHardBlocks ?? snap.mandatoryViolations ?? []
      : snap.shortHardBlocks ?? snap.mandatoryViolations ?? [];
  return [
    ...sideHardBlocks.map((reason) => ({ reason, kind: 'hard' as const })),
    ...(snap.groupBlocks ?? []).map((reason) => ({
      reason,
      kind: 'group' as const,
    })),
  ];
}

function evidenceLabelForBlockKind(kind: HardOrGroupBlockEntry['kind']): string {
  return kind === 'hard' ? 'Hard Block' : 'Group Block';
}

function buildScoreReviewMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const layers = snap.layers ?? [];
  const maxScore = layers.reduce((sum, layer) => sum + (layer.maxScore || 0), 0);
  return buildScoreReviewExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      coin: row.symbol,
      side: snap.direction,
      timestamp: exportedAt,
      scoreVersion: scorerVersion,
      ruleVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    marketSnapshot: marketSnapshotFromRow(row, scorerVersion),
    summary: {
      totalScore: snap.score,
      grade: snap.decisionDisplay,
      confidence: snap.winrate,
      status: snap.canEnter ? 'READY' : snap.hardBlocked ? 'BLOCKED' : 'WAIT',
      recommendation: snap.decisionLabel,
      maxScore: maxScore || undefined,
      currentScore: snap.score,
      hardBlocked: snap.hardBlocked,
    },
    hardBlocks: hardBlockEntriesOf(snap).map((entry) => ({
      rule: entry.reason,
      reason: entry.reason,
      priority: 'CRITICAL',
      evidence: [
        { label: evidenceLabelForBlockKind(entry.kind), value: entry.reason },
      ],
    })),
    decision: {
      decision: snap.decisionLabel,
    },
    breakdown: layers.map((layer) => ({
      indicator: layer.name,
      score: layer.score,
      max: layer.maxScore,
      weight: layer.maxScore,
      // Same RuleBook vocabulary as Rule Trace / RuleBook Review:
      // soft fail (score=0, non-mandatory) → WARNING; mandatory → FAIL.
      result: layerTraceStatus(layer.passed, layer.isMandatoryViolation),
      reason: layer.reason,
    })),
    penalties: (snap.mandatoryViolations ?? []).map((name) => ({
      penalty: name,
      reason: name,
      evidence: [{ label: 'Violation', value: name }],
      priority: 'CRITICAL',
    })),
    bonuses: [],
    scoreEvidence: layers.map((layer) => ({
      indicator: layer.name,
      evidence: [
        { label: 'Score', value: layer.score },
        { label: 'Passed', value: layer.passed },
      ],
    })),
    dependencies: layers.map((layer) => ({
      indicator: layer.name,
      module: `Layer ${layer.layer}`,
    })),
    thresholds: layers.map((layer) => ({
      indicator: layer.name,
      actual: layer.score,
      expected: layer.maxScore,
      threshold: layer.maxScore,
      difference: layer.score - layer.maxScore,
      priority: layer.isMandatory ? 'CRITICAL' : 'NORMAL',
    })),
  });
}

function buildEntryReviewMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const layers = snap.layers ?? [];
  // TASK 17.6.1 — hard + group lists forwarded together; Entry Review still
  // separates score blocks. Hard vs Group distinguished via evidence label.
  const hardBlocks = hardBlockEntriesOf(snap);
  const scoreBlocks =
    snap.direction === 'LONG'
      ? snap.longBlockReasons ?? []
      : snap.shortBlockReasons ?? [];
  const decision = snap.canEnter ? 'ENTER' : snap.hardBlocked ? 'BLOCK' : 'WAIT';
  return buildEntryReviewExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      coin: row.symbol,
      side: snap.direction,
      timestamp: exportedAt,
      entryVersion: scorerVersion,
      ruleVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    marketSnapshot: marketSnapshotFromRow(row, scorerVersion),
    summary: {
      decision,
      confidence: snap.winrate,
      grade: snap.decisionDisplay,
      recommendation: snap.decisionLabel,
      reason: snap.decisionDisplay,
      summary: snap.decisionDisplay,
      rulebookState: snap.hardBlocked ? 'BLOCKED' : snap.canEnter ? 'PASS' : 'WAIT',
      passedChecks: layers.filter((l) => l.passed).length,
      failedChecks: layers.filter((l) => !l.passed).length,
      warnings: (snap.scoringWarnings ?? []).join('; ') || undefined,
      hardBlocks: hardBlocks.filter((e) => e.kind === 'hard').length,
      groupBlocks: hardBlocks.filter((e) => e.kind === 'group').length,
      softBlocks: scoreBlocks.length,
    },
    decisionTree: [
      { stage: 'Trend', result: row.trend, detail: `Confidence ${row.regimeConfidence}` },
      { stage: 'Score', result: snap.score, detail: snap.decisionDisplay },
      {
        stage: 'Entry State',
        result: resolveFinalEntryStatus(row, scorerVersion),
        detail: snap.decisionDisplay,
      },
      { stage: 'HardBlocked State', result: snap.hardBlocked ? 'YES' : 'NO', detail: hardBlocks.map((e) => e.reason).join('; ') },
      {
        stage: 'Entry Permission',
        result: snap.canEnter ? 'YES' : 'NO',
        detail: snap.decisionLabel,
      },
      { stage: 'Decision', result: decision, detail: snap.decisionLabel },
    ],
    checks: layers.map((layer) => ({
      checkId: `L${layer.layer}`,
      ruleId: `L${layer.layer}`,
      ruleName: layer.name,
      priority: layer.isMandatory ? 'CRITICAL' : 'NORMAL',
      status: layerTraceStatus(layer.passed, layer.isMandatoryViolation),
      actual: layer.score,
      expected: layer.maxScore,
      threshold: layer.maxScore,
      difference: layer.score - layer.maxScore,
      reason: layer.reason,
      recommendation: layer.passed ? 'OK' : 'Fix layer',
      evidence: [{ label: 'Score', value: layer.score }],
      source: `Layer ${layer.layer}`,
    })),
    blockers: [
      ...hardBlocks.map((entry) => ({
        type: entry.kind === 'hard' ? 'HARD' : 'GROUP',
        rule: entry.reason,
        priority: 'CRITICAL',
        trigger: entry.reason,
        reason: entry.reason,
        override: 'NO',
        evidence: [
          {
            label: evidenceLabelForBlockKind(entry.kind),
            value: entry.reason,
          },
        ],
      })),
      ...scoreBlocks.map((name) => ({
        type: 'SCORE',
        rule: name,
        priority: 'HIGH',
        trigger: name,
        reason: name,
        override: 'NO',
        evidence: [{ label: 'Score Block', value: name }],
      })),
    ],
    ruleReferences: layers.map((layer) => ({
      ruleId: `L${layer.layer}`,
      ruleName: layer.name,
      module: 'Entry',
      priority: layer.isMandatory ? 'CRITICAL' : 'NORMAL',
      evidence: layer.reason,
    })),
    ruleEvidence: layers.map((layer) => ({
      ruleId: `L${layer.layer}`,
      ruleName: layer.name,
      evidence: [
        { label: 'Score', value: layer.score },
        { label: 'Reason', value: layer.reason },
      ],
    })),
  });
}

function buildPositionReviewMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  esmBridge: EsmBridgeState | undefined,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  const esm = esmBridge ? getEsmSnapshotForSymbol(esmBridge, row.symbol) : null;
  const hardBlocks =
    snap.direction === 'LONG' ? snap.longHardBlocks ?? [] : snap.shortHardBlocks ?? [];
  return buildPositionReviewExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      positionId: esm ? `${row.symbol}-esm` : undefined,
      coin: row.symbol,
      side: snap.direction,
      strategy: scorerVersion,
      timestamp: exportedAt,
      adviserVersion: esm ? 'ESM' : undefined,
      ruleVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    positionSnapshot: {
      entryPrice: plan?.recommendedEntry,
      currentPrice: row.price,
      riskReward: plan?.primaryRR,
      stopLoss: plan?.stopLoss?.price,
      takeProfit: plan?.tp1?.price,
      positionSize: plan?.positionSize,
      exposure: plan?.notionalValue,
    },
    marketSnapshot: marketSnapshotFromRow(row, scorerVersion),
    summary: {
      recommendation: snap.hardBlocked ? 'CLOSE' : 'HOLD',
      reason: snap.decisionDisplay,
      summary: snap.decisionDisplay,
      confidence: snap.winrate,
      priority: snap.hardBlocked ? 'CRITICAL' : 'NORMAL',
      adviserState: esm ? 'ESM_PRESENT' : 'PLAN_ONLY',
    },
    decisionTree: [
      { stage: 'Position', result: esm ? 'OPEN_CONTEXT' : 'NO_OPEN', detail: row.symbol },
      { stage: 'Hard Exit', result: hardBlocks.length > 0 ? 'YES' : 'NO', detail: hardBlocks.join('; ') },
      {
        stage: 'Recommendation',
        result: snap.hardBlocked ? 'CLOSE' : 'HOLD',
        detail: snap.decisionLabel,
      },
    ],
    checks: (snap.layers ?? []).map((layer) => ({
      checkId: `L${layer.layer}`,
      ruleId: `L${layer.layer}`,
      ruleName: layer.name,
      priority: layer.isMandatory ? 'CRITICAL' : 'NORMAL',
      status: layerTraceStatus(layer.passed, layer.isMandatoryViolation),
      reason: layer.reason,
      recommendation: layer.passed ? 'HOLD' : 'WATCH',
      evidence: [{ label: 'Score', value: layer.score }],
      source: 'Scorer',
    })),
    ruleReferences: hardBlocks.map((name, index) => ({
      ruleId: `HE-${index + 1}`,
      ruleName: name,
      module: 'Position',
      priority: 'CRITICAL',
      evidence: name,
      triggered: true,
      hardExit: true,
    })),
    stopLossPlan: {
      currentSl: plan?.stopLoss?.price,
      suggestedSl: plan?.stopLoss?.price,
      reason: plan?.stopLoss?.reasoning,
      protectionType: plan?.stopLoss?.type,
    },
    takeProfitPlan: {
      currentTp: plan?.tp1?.price,
      suggestedTp: plan?.tp1?.price,
      scaleOut: plan?.tp1?.sizeToClose,
      reason: plan?.tp1?.reasoning,
    },
    positionManagement: {
      initialAdviserState: 'HOLD',
      expectedAdviserState: 'PROTECT',
      protection: plan?.stopLoss?.type,
      closeCondition: hardBlocks.join('; ') || undefined,
    },
    ruleEvidence: hardBlocks.map((name, index) => ({
      ruleId: `HE-${index + 1}`,
      ruleName: name,
      evidence: [{ label: 'Hard Exit', value: name }],
    })),
  });
}

function buildTradePlanReviewMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  const status =
    plan == null ? 'UNAVAILABLE' : plan.isValid ? (snap.canEnter ? 'READY' : 'WAIT') : 'BLOCKED';
  return buildTradePlanReviewExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      coin: row.symbol,
      side: snap.direction,
      strategy: scorerVersion,
      timestamp: exportedAt,
      tradePlanVersion: scorerVersion,
      ruleVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    marketSnapshot: marketSnapshotFromRow(row, scorerVersion),
    summary: {
      status,
      headline: plan ? `${plan.direction} ${plan.symbol}` : undefined,
      summary: plan?.decision,
      confidence: snap.winrate,
      priority: plan?.isValid ? 'P1' : 'P2',
    },
    entryPlan: {
      entryPrice: plan?.recommendedEntry,
      entryZone:
        plan?.entryZone != null
          ? `${plan.entryZone.rangeLow} - ${plan.entryZone.rangeHigh}`
          : undefined,
      preferredEntry: plan?.entryZone?.optimal ?? plan?.recommendedEntry,
      maximumEntry: plan?.entryZone?.rangeHigh,
      reason: plan?.entryZone?.reasoning,
    },
    riskPlan: {
      stopLoss: plan?.stopLoss?.price,
      maximumLoss: plan?.stopLoss?.maxLossUSDT,
      riskReward: plan?.primaryRR,
      positionSize: plan?.positionSize,
      reason: plan?.stopLoss?.reasoning,
    },
    targetPlan: {
      tp1: plan?.tp1?.price,
      tp2: plan?.tp2?.price,
      tp3: plan?.tp3?.price,
      scaleOut: plan?.tp1?.sizeToClose,
    },
    executionPlan: {
      currentStep: snap.canEnter ? 'READY TO ENTER' : 'WAIT',
      nextStep: snap.canEnter ? 'PLACE ORDER' : 'RESOLVE BLOCKS',
      trigger: snap.decisionLabel,
      condition: snap.decisionDisplay,
      fallback: (plan?.blockReasons ?? []).join('; ') || undefined,
    },
    positionManagement: {
      initialAdviserState: 'HOLD',
      expectedAdviserState: 'PROTECT',
      protection: plan?.stopLoss?.type,
      scaleOut: plan?.tp1?.sizeToClose,
      closeCondition: (plan?.blockReasons ?? []).join('; ') || undefined,
    },
    ruleReferences: (snap.layers ?? []).map((layer) => ({
      ruleId: `L${layer.layer}`,
      ruleName: layer.name,
      module: 'TradePlan',
      priority: layer.isMandatory ? 'CRITICAL' : 'NORMAL',
      evidence: layer.reason,
    })),
    ruleEvidence: (snap.layers ?? []).map((layer) => ({
      ruleId: `L${layer.layer}`,
      ruleName: layer.name,
      evidence: [{ label: 'Score', value: layer.score }],
    })),
    blockers: (plan?.blockReasons ?? []).map((reason) => ({
      blocker: reason,
      requiredUnlock: reason,
      reason,
      evidence: [{ label: 'Block', value: reason }],
    })),
    cancellation: {
      cancelCondition: plan?.isValid === false ? 'Plan invalid' : undefined,
      reason: (plan?.warnings ?? []).join('; ') || undefined,
      evidence: (plan?.warnings ?? []).map((w) => ({ label: 'Warning', value: w })),
    },
    crossReferences: {
      entryDecision: snap.canEnter ? 'ENTER' : 'WAIT',
      positionState: 'OPEN',
      cancellationTriggered: plan?.isValid === false,
    },
  });
}

/**
 * TASK 18.6 Option B — display-ready Group Breakdown for RULEBOOK export.
 *
 * - Group Score: copied from snap.groupScores (engine) — never reverse-fitted
 *   from Decision Total.
 * - Decision Total: copied from snap.score.
 * - Raw Sum*: reconstructed from Display Layer Scores because frozen
 *   SignalRowScorerSnapshot does NOT persist engine rawLayerScores
 *   (see snapshotFromV4 → scoringLayersToDisplayV4 only).
 */
function buildRuleTraceGroupBreakdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): NonNullable<Parameters<typeof buildRuleTraceExport>[0]['groupBreakdown']> {
  const snap = resolveSignalRow(row, scorerVersion);
  const layers = snap.layers ?? [];
  const gs = snap.groupScores ?? { A: 0, B: 0, C: 0 };
  const layerRawMax = 2; // V4 layer raw max (documentation constant for reverse map)

  const displayToRaw = (display: number): number =>
    Math.round((display / LAYER_MAX_POINTS) * layerRawMax * 100) / 100;

  const rawSumFor = (layerIds: readonly number[]): number => {
    let sum = 0;
    for (const id of layerIds) {
      const layer = layers.find((l) => l.layer === id);
      if (layer) sum += displayToRaw(layer.score);
    }
    return Math.round(sum * 100) / 100;
  };

  const groupA = SCORING_GROUPS_V4.GROUP_A_TREND;
  const groupB = SCORING_GROUPS_V4.GROUP_B_FLOW;
  const groupC = SCORING_GROUPS_V4.GROUP_C_CONTEXT;
  const bonus = row.vwapBonus;
  const vwapApplied = bonus?.applied === true;

  return {
    rows: [
      {
        group: 'A',
        layers: 'L1–L4',
        rawSum: rawSumFor(groupA.layers),
        rawMax: groupA.rawMax,
        groupMax: groupA.groupMax,
        // Copied from engine snapshot — not convert(reconstructedRaw), not Total−B−C.
        groupScore: gs.A,
        notes: 'engine groupScores.A',
      },
      {
        group: 'B',
        layers: 'L5a, L5b, L6, L7',
        rawSum: rawSumFor(groupB.layers as unknown as readonly number[]),
        rawMax: groupB.rawMax,
        groupMax: groupB.groupMax,
        groupScore: gs.B,
        notes: vwapApplied
          ? `engine groupScores.B; VWAP bonusRaw ${bonus.bonusRaw} on L5a`
          : 'engine groupScores.B',
      },
      {
        group: 'C',
        layers: 'L8–L10',
        rawSum: rawSumFor(groupC.layers),
        rawMax: groupC.rawMax,
        groupMax: groupC.groupMax,
        groupScore: gs.C,
        notes: 'engine groupScores.C',
      },
    ],
    decisionTotal: snap.score,
    vwapNote: vwapApplied
      ? `VWAP Bonus: applied YES | bonusRaw=${bonus.bonusRaw} added to raw L5a before Group B conversion | ${bonus.reason}`
      : undefined,
  };
}

function buildRuleTraceMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  return buildRuleTraceExport({
    metadata: {
      version: '1',
      generatedAt: exportedAt,
      tradeId: tradeIdOf(row, scorerVersion),
      ruleVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
      coin: row.symbol,
      side: snap.direction,
    },
    inputSnapshot: marketSnapshotFromRow(row, scorerVersion),
    rules: (snap.layers ?? []).map((layer) => {
      const dependency = layerTraceDependency(layer.layer, layer.name);
      return {
        id: `L${layer.layer}`,
        title: layer.name,
        status: layerTraceStatus(layer.passed, layer.isMandatoryViolation),
        weight: layer.maxScore,
        priority: layer.isMandatory ? 100 : 50,
        expected: layer.maxScore,
        actual: layer.score,
        reason: normalizePsychologyLayerReason(layer.reason),
        recommendation: layerTraceRecommendation(layer.passed),
        evidence: [{ label: 'Score', value: layer.score }],
        contribution: layer.score,
        dependency,
        blockType: layer.isMandatoryViolation ? 'HARD' : 'NONE',
        mandatory: layer.isMandatory,
        enabled: true,
      };
    }),
    decision: {
      score: snap.score,
      totalScore: snap.score,
      hardBlock: snap.hardBlocked,
      decision: snap.decisionLabel,
      recommendation: snap.decisionDisplay,
    },
    groupBreakdown: buildRuleTraceGroupBreakdown(row, scorerVersion),
  });
}

function buildScoreTraceMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const layers = snap.layers ?? [];
  return buildScoreTraceExport({
    metadata: {
      version: '1',
      generatedAt: exportedAt,
      tradeId: tradeIdOf(row, scorerVersion),
      scoreVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
      coin: row.symbol,
      side: snap.direction,
    },
    inputSnapshot: marketSnapshotFromRow(row, scorerVersion),
    components: layers.map((layer) => {
      const dependency = layerTraceDependency(layer.layer, layer.name);
      return {
        id: `L${layer.layer}`,
        name: layer.name,
        category: `Layer ${layer.layer}`,
        weight: layer.maxScore,
        maxScore: layer.maxScore,
        actualScore: layer.score,
        contribution: layer.score,
        status: layerTraceStatus(layer.passed, layer.isMandatoryViolation),
        actual: layer.score,
        expected: layer.maxScore,
        reason: normalizePsychologyLayerReason(layer.reason),
        recommendation: layerTraceRecommendation(layer.passed),
        evidence: [{ label: 'Score', value: layer.score }],
        sourceModule: dependency,
        dependency,
        enabled: true,
      };
    }),
    // TASK 17.6.1 — Hard/Group Block entries copy the two lists that define
    // `hardBlocked`; HB-/GB- prefixes and evidence labels distinguish source.
    // Merged block list size is reported separately ("Total Blocking Events").
    hardBlocks: (() => {
      let hardIdx = 0;
      let groupIdx = 0;
      return hardBlockEntriesOf(snap).map((entry) => {
        const id =
          entry.kind === 'hard'
            ? `HB-${++hardIdx}`
            : `GB-${++groupIdx}`;
        return {
          id,
          rule: entry.reason,
          reason: entry.reason,
          overrideScore: true,
          evidence: [
            {
              label: evidenceLabelForBlockKind(entry.kind),
              value: entry.reason,
            },
          ],
        };
      });
    })(),
    bonuses: [],
    penalties: [],
    summary: {
      rawScore: snap.score,
      finalScore: snap.score,
      grade: snap.decisionDisplay,
      decision: snap.decisionLabel,
      hardBlocked: snap.hardBlocked,
    },
  });
}

function buildEntryTraceMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const decision = snap.canEnter ? 'ENTER' : 'WAIT';
  const grade = snap.decisionDisplay;
  const layers = snap.layers ?? [];
  const hardBlocks = hardBlockEntriesOf(snap);
  const checks = layers.map((layer) => {
    const status = layerTraceStatus(layer.passed, layer.isMandatoryViolation);
    return {
      id: `L${layer.layer}`,
      name: layer.name,
      ruleId: `L${layer.layer}`,
      ruleName: layer.name,
      status,
      actual: layer.score,
      expected: layer.maxScore,
      reason: normalizePsychologyLayerReason(layer.reason),
      evidence: [{ label: 'Score', value: layer.score }],
      contribution: layer.score,
      // Same Layer-N vocabulary as RULE DEPENDENCY / SCORE DEPENDENCY.
      dependency: layerTraceDependency(layer.layer, layer.name),
      source: layerTraceDependency(layer.layer, layer.name),
      enabled: true,
    };
  });
  // Single source for export field "RuleBook State" (DECISION CHAIN + ENTRY SUMMARY).
  const ruleBookState = snap.hardBlocked
    ? 'BLOCKED'
    : snap.canEnter
      ? 'PASS'
      : 'WAIT';
  return buildEntryTraceExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      coin: row.symbol,
      side: snap.direction,
      timestamp: exportedAt,
      entryVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    inputSnapshot: marketSnapshotFromRow(row, scorerVersion),
    decision: {
      decision,
      finalDecision: decision,
      reason: snap.decisionDisplay,
      summary: snap.decisionDisplay,
      confidence: snap.winrate,
      grade,
      recommendation: snap.decisionLabel,
    },
    checks,
    // TASK 17.6.1 — blockers copy hard + group lists that define `hardBlocked`;
    // type HARD vs GROUP matches entry.kind. Merged size stays in input snapshot
    // ("Total Blocking Events").
    blockers: hardBlocks.map((entry) => ({
      type: entry.kind === 'hard' ? ('HARD' as const) : ('GROUP' as const),
      rule: entry.reason,
      reason: entry.reason,
      evidence: [
        {
          label: evidenceLabelForBlockKind(entry.kind),
          value: entry.reason,
        },
      ],
    })),
    // ENTRY SUMMARY — Option C: Hard / Group split; Soft stays 0 (no soft source in Trace wire).
    entrySummary: {
      passedChecks: checks.filter((c) => c.status === 'PASS').length,
      warnings: checks.filter((c) => c.status === 'WARNING').length,
      failedChecks: checks.filter((c) => c.status === 'FAIL').length,
      hardBlocks: hardBlocks.filter((e) => e.kind === 'hard').length,
      groupBlocks: hardBlocks.filter((e) => e.kind === 'group').length,
      softBlocks: 0,
      unlockRules: 0,
      decision,
      confidence: snap.winrate,
      grade,
      ruleBookState,
    },
  });
}

function buildPositionTraceMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  return buildPositionAdviserTraceExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      coin: row.symbol,
      side: snap.direction,
      strategy: scorerVersion,
      adviserVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    positionSnapshot: {
      entryPrice: plan?.recommendedEntry,
      currentPrice: row.price,
      stopLoss: plan?.stopLoss?.price,
      takeProfit: plan?.tp1?.price,
      riskReward: plan?.primaryRR,
      positionSize: plan?.positionSize,
    },
    marketSnapshot: marketSnapshotFromRow(row, scorerVersion),
    decision: {
      recommendation: snap.hardBlocked ? 'CLOSE' : 'HOLD',
      reason: snap.decisionDisplay,
      summary: snap.decisionDisplay,
      confidence: snap.winrate,
    },
  });
}

function buildTradePlanTraceMarkdown(
  row: SignalRow,
  scorerVersion: ScorerVersion,
  exportedAt: string | undefined,
): string {
  const snap = resolveSignalRow(row, scorerVersion);
  const plan = resolveTradePlanV3(row, scorerVersion);
  const planStatus = plan?.isValid
    ? snap.canEnter
      ? 'READY'
      : 'WAIT'
    : 'CANCELLED';
  return buildTradePlanTraceExport({
    metadata: {
      version: '1',
      tradeId: tradeIdOf(row, scorerVersion),
      coin: row.symbol,
      side: snap.direction,
      strategy: scorerVersion,
      timestamp: exportedAt,
      tradePlanVersion: scorerVersion,
      engineVersion: BUILD_INFO.version,
    },
    summary: {
      planStatus,
      headline: plan ? `${plan.direction} ${plan.symbol}` : undefined,
      summary: plan?.decision,
      confidence: snap.winrate,
    },
    entryPlan: {
      entryPrice: plan?.recommendedEntry,
      entryZone:
        plan?.entryZone != null
          ? `${plan.entryZone.rangeLow} - ${plan.entryZone.rangeHigh}`
          : undefined,
      preferredEntry: plan?.entryZone?.optimal,
      maximumEntry: plan?.entryZone?.rangeHigh,
      reason: plan?.entryZone?.reasoning,
    },
    riskPlan: {
      stopLoss: plan?.stopLoss?.price,
      riskReward: plan?.primaryRR,
      positionSize: plan?.positionSize,
      maximumLoss: plan?.stopLoss?.maxLossUSDT,
      reason: plan?.stopLoss?.reasoning,
    },
    targetPlan: {
      tp1: plan?.tp1?.price,
      tp2: plan?.tp2?.price,
      tp3: plan?.tp3?.price,
      scaleOut: plan?.tp1?.sizeToClose,
    },
    crossReferences: {
      entryDecision: snap.canEnter ? 'ENTER' : 'WAIT',
      positionState: 'OPEN',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// TRACE SELF-DOCUMENTATION ENHANCEMENT (V1.0.7)
//
// Deterministic appendix rendered onto every Trace export so any AI
// reviewer can understand the exported values WITHOUT source code.
// Rules: copy-only from the frozen snapshot, static documentation text,
// missing values render UNAVAILABLE — never derived, never inferred.
// Engines, builders, and formatters are NOT modified.
// ─────────────────────────────────────────────────────────────────────────

const APPENDIX_DIVIDER = '--------------------------------';

/** Internal engine raw layer maximum (RuleBook: every layer raw max = 2). */
const INTERNAL_LAYER_MAX_DOC = 2;

function appendixSection(title: string, lines: readonly string[]): string[] {
  return [APPENDIX_DIVIDER, '', `# ${title}`, '', ...lines];
}

/** PART 1 — internal vs display score documentation (copy-only). */
function scoreNormalizationLines(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string[] {
  const snap = resolveSignalRow(row, scorerVersion);
  const layers = snap.layers ?? [];
  const bonus = row.vwapBonus;
  return [
    'Every layer is scored internally on a raw scale, then normalized for display.',
    '',
    kv('Internal Layer Max (raw scale)', INTERNAL_LAYER_MAX_DOC),
    kv('Display Layer Max (normalized scale)', LAYER_MAX_POINTS),
    '',
    'Display Formula (documentation — values below are copied, not recomputed):',
    '',
    `display = round((raw / ${INTERNAL_LAYER_MAX_DOC}) x ${LAYER_MAX_POINTS}, 2)`,
    '',
    // Result MUST match Rule Trace / Score Trace Status vocabulary
    // (TASK 18.4 / 18.5): soft fail → WARNING, mandatory → FAIL.
    ...table(
      ['Layer', 'Raw Score (internal)', 'Display Score', 'Display Max', 'Result'],
      layers.map((layer) => [
        layer.name,
        // Frozen snapshot stores DISPLAY values only; raw engine score is
        // not part of the snapshot and is never re-derived here.
        UNAVAILABLE,
        layer.score,
        layer.maxScore,
        layerTraceStatus(layer.passed, layer.isMandatoryViolation),
      ]),
    ),
    '',
    'VWAP Bonus Trace (copied from frozen snapshot, active direction):',
    '',
    kv('Bonus Applied', bonus ? bonus.applied : undefined),
    kv('Bonus Raw (internal scale)', bonus ? bonus.bonusRaw : undefined),
    kv('Bonus Reason', bonus ? bonus.reason : undefined),
    '',
    'NOTES',
    '',
    '- Raw Score is the internal engine score (raw scale, max '
      + `${INTERNAL_LAYER_MAX_DOC} per layer).`,
    '- Display Score is the normalized value shown in this document (max '
      + `${LAYER_MAX_POINTS} per layer).`,
    '- Bonus is always applied to the RAW score BEFORE normalization.',
    '- Bonus Raw MUST NOT be compared directly with Display Scores. A raw '
      + `bonus of +0.5 appears as +${(0.5 / INTERNAL_LAYER_MAX_DOC) * LAYER_MAX_POINTS} `
      + 'on the display scale.',
    '- When the Bonus Reason contains "bonus L5 +", the bonus WAS applied '
      + 'and is already included in the L5 score shown above.',
    '- Raw Score shows UNAVAILABLE because the frozen snapshot stores '
      + 'display values only. This is a snapshot limitation, not a defect.',
  ];
}

/** PART 2 — origin of every blocking event (copy-only, source = list name). */
function hardBlockOriginLines(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string[] {
  const snap = resolveSignalRow(row, scorerVersion);
  const sideHardBlocks =
    snap.direction === 'LONG' ? snap.longHardBlocks : snap.shortHardBlocks;
  const groupBlocks = snap.groupBlocks ?? [];
  const scoreBlocks =
    (snap.direction === 'LONG' ? snap.longBlockReasons : snap.shortBlockReasons) ?? [];
  // Legacy snapshots recorded only the merged block list — the exact source
  // list is not part of those snapshots, so it is reported as such (no guess).
  const engineRows: (readonly (string | number | boolean | undefined)[])[] =
    sideHardBlocks != null
      ? [
          ...sideHardBlocks.map((name) => [
            name,
            'Score Engine hard block list (per-side)',
            'RuleBook Hard Block rules',
            'Scoring layer / market filter',
            name,
          ] as const),
          ...groupBlocks.map((name) => [
            name,
            'Group Block list',
            'RuleBook Group minimum requirements',
            'Group score gate (A/B/C minimum)',
            name,
          ] as const),
          ...scoreBlocks.map((name) => [
            name,
            'Score Block list (blockReasons)',
            'RuleBook Score Block rules (soft, not hard)',
            'Layer score below required minimum',
            name,
          ] as const),
        ]
      : (snap.mandatoryViolations ?? []).map((name) => [
          name,
          'Merged block list (legacy snapshot)',
          'RuleBook (exact source list not recorded in this snapshot)',
          UNAVAILABLE,
          name,
        ] as const);
  const rows: (readonly (string | number | boolean | undefined)[])[] = [
    ...engineRows,
    ...(row.adxBlockReason
      ? [[
          row.adxBlockReason,
          'ADX Gate (independent pre-filter)',
          'ADX Gate — NOT a RuleBook scoring rule',
          'Pre-Entry market regime filter',
          row.adxGate?.message ?? row.adxBlockReason,
        ] as const]
      : []),
  ];
  if (rows.length === 0) {
    return [
      'No blocking events recorded in this frozen snapshot.',
      '',
      'When present, every blocking event lists WHERE it came from (Source),',
      'WHO owns the rule (Owner), and WHY it fired (Reason) — copied verbatim.',
    ];
  }
  return [
    'Every blocking event below is copied verbatim from the frozen snapshot.',
    'Source identifies the exact engine list the entry was copied from.',
    '',
    ...table(['Blocking Event', 'Source', 'Owner', 'Layer / Scope', 'Reason'], rows),
    '',
    kv('Condition / Current Value pairs', UNAVAILABLE),
    '(The frozen snapshot stores block reason strings only; numeric',
    'condition/current pairs are not part of the snapshot.)',
  ];
}

/** PART 3 — structural blocking summary (counts of copied lists). */
function blockingSummaryLines(
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string[] {
  const snap = resolveSignalRow(row, scorerVersion);
  const sideHardBlocks =
    snap.direction === 'LONG' ? snap.longHardBlocks : snap.shortHardBlocks;
  const sideScoreBlocks =
    snap.direction === 'LONG' ? snap.longBlockReasons : snap.shortBlockReasons;
  return [
    kv('Hard Blocks (Engine / All Sources)', sideHardBlocks?.length),
    kv('Group Blocks', (snap.groupBlocks ?? []).length),
    kv('Score Blocks (block reasons)', sideScoreBlocks?.length),
    kv('Total Blocking Events', snap.mandatoryViolations.length),
    '',
    'Total Blocking Events is an exported structural summary: the size of the',
    "engine's merged block list (hard blocks + score blocks + group blocks).",
    'It is NOT the number of failed mandatory rules.',
    'Hard Blocks (Engine / All Sources) counts the per-side engine hard-block list,',
    'which differs from Hard Block (Rule Trace Scope) in RULE SUMMARY.',
  ];
}

/** PART 4 — independent pre-filters (Gate ≠ Rule). */
function preFiltersLines(row: SignalRow): string[] {
  const gate = row.adxGate;
  const adx = row.adxData;
  return [
    'Pre-filters run BEFORE / OUTSIDE RuleBook scoring. A Gate is NOT a Rule:',
    'it never contributes points and never appears in the scoring layers.',
    '',
    'ADX Gate',
    '',
    kv('Type', 'Independent Market Filter'),
    kv('Purpose', 'Detect choppy market (no tradable trend)'),
    kv('Inputs', 'ADX 1H, ADX 4H'),
    kv('Block Condition (documentation)', 'ADX1H < 15 AND ADX4H < 15'),
    kv('Current ADX 1H', adx?.adx1H),
    kv('Current ADX 4H', adx?.adx4H),
    kv('Market Regime', gate?.regime ?? adx?.regime),
    kv('Gate Result', gate ? (gate.allowed ? 'ALLOWED' : 'BLOCKED') : undefined),
    kv('Gate Fired', gate ? gate.block : undefined),
    kv('Gate Message', gate?.message),
    kv('Scope', 'Pre-RuleBook — not part of Rule scoring'),
  ];
}

/** PART 5 — static interpretation guide appended to every trace. */
function traceInterpretationLines(): string[] {
  return [
    'This document contains:',
    '',
    '- Internal Engine values',
    '- Normalized Display values',
    '- Structural Rule relationships',
    '- Runtime snapshot values',
    '',
    'Important Notes',
    '',
    '1. Score pipeline: Raw Scores -> Bonus -> Clamp -> Normalization -> Display Score.',
    '2. Displayed scores are normalized values. They are NOT raw engine scores.',
    '3. Bonus values are applied to Raw Scores. They are NOT directly added to Display Scores.',
    '4. Hard Blocks originate from independent Gates or RuleBook filters. They are not necessarily Score penalties.',
    '5. Reviewer AI MUST evaluate the documented transformations before reporting inconsistencies.',
    '6. If a value appears inconsistent, verify Raw -> Transformation -> Display before concluding that a bug exists.',
    '7. A Gate (see PRE-FILTERS) is NOT a Rule: it blocks entry but never scores points.',
    '8. Missing snapshot values always render UNAVAILABLE — they are never inferred.',
    '9. Display Layer Scores use a per-layer normalize scale (max 1.5 each). Decision Total uses the Group scale (3 groups, each max 5, total max 15). The two scales are independent and must not be added together.',
  ];
}

const TRACE_KINDS: ReadonlySet<TraceReviewExportKind> = new Set([
  'trace-rulebook',
  'trace-score',
  'trace-entry',
  'trace-position',
  'trace-tradeplan',
]);

/** Deterministic self-documentation appendix for Trace exports. */
function traceSelfDocumentationAppendix(
  _kind: TraceReviewExportKind,
  row: SignalRow,
  scorerVersion: ScorerVersion,
): string {
  const lines: string[] = [''];
  // SCORE NORMALIZATION Result uses layerTraceStatus — same vocabulary as
  // Rule Trace / Score Trace Status. Applied to all 5 Trace exports.
  lines.push(
    ...appendixSection(
      'SCORE NORMALIZATION',
      scoreNormalizationLines(row, scorerVersion),
    ),
    '',
    ...appendixSection(
      'HARD BLOCK ORIGIN',
      hardBlockOriginLines(row, scorerVersion),
    ),
    '',
    ...appendixSection('BLOCKING SUMMARY', blockingSummaryLines(row, scorerVersion)),
    '',
    ...appendixSection('PRE-FILTERS', preFiltersLines(row)),
    '',
    ...appendixSection('TRACE INTERPRETATION', traceInterpretationLines()),
    '',
  );
  return lines.join('\n');
}

/**
 * Pure dispatcher: frozen rows in → Markdown out.
 * Does not mutate engines, builders, or formatters.
 */
export function exportTraceOrReviewMarkdown(
  kind: TraceReviewExportKind,
  context: TraceReviewExportContext,
): TraceReviewExportResult {
  const row = pickFrozenRow(context.rows, context.scorerVersion);
  if (row == null) {
    return { ok: false, message: REVIEW_EXPORT_UNAVAILABLE };
  }

  const { scorerVersion, esmBridge, exportedAt } = context;
  const filename = TRACE_REVIEW_FILENAMES[kind];

  try {
    let markdown: string;
    switch (kind) {
      case 'trace-rulebook':
        markdown = buildRuleTraceMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'trace-score':
        markdown = buildScoreTraceMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'trace-entry':
        markdown = buildEntryTraceMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'trace-position':
        markdown = buildPositionTraceMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'trace-tradeplan':
        markdown = buildTradePlanTraceMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'review-rulebook':
        markdown = buildRulebookReviewMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'review-score':
        markdown = buildScoreReviewMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'review-entry':
        markdown = buildEntryReviewMarkdown(row, scorerVersion, exportedAt);
        break;
      case 'review-position':
        markdown = buildPositionReviewMarkdown(row, scorerVersion, esmBridge, exportedAt);
        break;
      case 'review-tradeplan':
        markdown = buildTradePlanReviewMarkdown(row, scorerVersion, exportedAt);
        break;
      default: {
        const _exhaustive: never = kind;
        return { ok: false, message: REVIEW_EXPORT_UNAVAILABLE };
      }
    }
    // TRACE SELF-DOCUMENTATION ENHANCEMENT (V1.0.7) — traces carry a
    // deterministic interpretation appendix so reviewers need no source code.
    if (TRACE_KINDS.has(kind)) {
      markdown += traceSelfDocumentationAppendix(kind, row, scorerVersion);
    }
    return { ok: true, markdown, filename };
  } catch {
    return { ok: false, message: REVIEW_EXPORT_UNAVAILABLE };
  }
}

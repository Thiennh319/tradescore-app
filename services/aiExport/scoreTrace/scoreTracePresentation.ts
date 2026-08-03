/**
 * TASK 17.5.3.3 — Score Trace presentation document + mapper.
 *
 * Maps a normalized ScoreTrace (builder output) into a presentation document
 * whose component rows are TracePresentationLayer. All status / recommendation
 * / dependency / source-module presentation decisions happen here — never in
 * the formatter.
 *
 * Pure and deterministic. Does not touch Engine, RuleBook, Builder, or Snapshot.
 */

import type {
  TracePresentation,
  TracePresentationLayer,
  TracePresentationMetadata,
} from '../tracePresentationTypes';
import {
  formatTraceDependsLine,
  normalizeTraceRecommendation,
  type TraceLayerStatus,
} from '../traceLayerPresentation';
import type {
  ScoreTrace,
  ScoreTraceAdjustmentItem,
  ScoreTraceComponentItem,
  ScoreTraceConsistency,
  ScoreTraceDecisionPolicy,
  ScoreTraceHardBlockItem,
  ScoreTraceMetadata,
  ScoreTraceSummaryInput,
} from './ScoreTraceTypes';

/**
 * Full Score Trace presentation document.
 *
 * Component-facing presentation fields (Status, Recommendation, Dependency,
 * Source Module) live on TracePresentationLayer via `trace.layers`. The
 * non-component sections are display-ready copies of the builder output.
 */
export interface ScoreTracePresentation {
  /** Shared presentation header + component rows (TracePresentation). */
  readonly trace: TracePresentation;
  /** Original metadata scalars — formatter passes them through `kv`/`fmt`. */
  readonly metadata: ScoreTraceMetadata;
  readonly inputSnapshot: readonly { key: string; value: string }[];
  readonly bonuses: readonly ScoreTraceAdjustmentItem[];
  readonly penalties: readonly ScoreTraceAdjustmentItem[];
  readonly hardBlocks: readonly ScoreTraceHardBlockItem[];
  readonly summary: ScoreTraceSummaryInput;
  readonly decisionPolicy: ScoreTraceDecisionPolicy;
  readonly consistency: ScoreTraceConsistency;
  /** TASK 18.7 — Group Breakdown (display-ready). */
  readonly groupBreakdown: ScoreTrace['groupBreakdown'];
}

function asStatus(value: string): TraceLayerStatus | 'SKIPPED' {
  if (value === 'PASS' || value === 'FAIL' || value === 'WARNING' || value === 'SKIPPED') {
    return value;
  }
  return value as TraceLayerStatus;
}

function parseLayerNumber(id: string): number {
  const match = /^L(\d+)/i.exec(id.trim());
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

function toLayer(component: ScoreTraceComponentItem): TracePresentationLayer {
  const recommendation = normalizeTraceRecommendation(component.recommendation);
  const dependency = component.dependency;
  return {
    id: component.id,
    index: component.index,
    layerNumber: parseLayerNumber(component.id),
    layerCode: component.id,
    layerName: component.name,
    status: asStatus(component.status),
    recommendation,
    expected: component.expected,
    actual: component.actual,
    dependency,
    sourceLayer: component.sourceModule,
    dependsLine: formatTraceDependsLine(component.name, dependency),
    mandatory: false,
    reason: component.reason,
    evidence: component.evidence.map((e) => ({ label: e.label, value: e.value })),
    weight: component.weight,
    priority: '',
    blockType: 'NONE',
    evaluationPass: component.status === 'PASS' ? 'YES' : '-',
    evaluationFail: component.status === 'FAIL' ? 'YES' : '-',
    category: component.category,
    maxScore: component.maxScore,
    actualScore: component.actualScore,
    contributionText: component.contribution,
  };
}

function toSharedMetadata(metadata: ScoreTraceMetadata): TracePresentationMetadata {
  return {
    version: metadata.version != null ? String(metadata.version) : undefined,
    generatedAt: metadata.generatedAt != null ? String(metadata.generatedAt) : undefined,
    tradeId: metadata.tradeId != null ? String(metadata.tradeId) : undefined,
    coin: metadata.coin != null ? String(metadata.coin) : undefined,
    side: metadata.side != null ? String(metadata.side) : undefined,
    engineVersion: metadata.engineVersion != null ? String(metadata.engineVersion) : undefined,
    scorerVersion: metadata.scoreVersion != null ? String(metadata.scoreVersion) : undefined,
  };
}

/** Map builder ScoreTrace → Score Trace presentation DTO. */
export function toScoreTracePresentation(trace: ScoreTrace): ScoreTracePresentation {
  const layers = trace.components.map(toLayer);
  return {
    trace: {
      metadata: toSharedMetadata(trace.metadata),
      layers,
    },
    metadata: trace.metadata,
    inputSnapshot: trace.inputSnapshot,
    bonuses: trace.bonuses,
    penalties: trace.penalties,
    hardBlocks: trace.hardBlocks,
    summary: trace.summary,
    decisionPolicy: trace.decisionPolicy,
    consistency: trace.consistency,
    groupBreakdown: trace.groupBreakdown,
  };
}

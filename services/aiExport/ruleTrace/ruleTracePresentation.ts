/**
 * TASK 17.5.3.2 — Rule Trace presentation document + mapper.
 *
 * Maps a normalized RuleTrace (builder output) into a presentation document
 * whose layer rows are TracePresentationLayer. All status / recommendation /
 * dependency / source-module presentation decisions happen here — never in
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
  RuleTrace,
  RuleTraceConflict,
  RuleTraceDecision,
  RuleTraceItem,
  RuleTraceMetadata,
  RuleTraceSummary,
} from './RuleTraceTypes';

/** Priority-tree row already shaped for Markdown rendering. */
export interface RuleTracePresentationPriorityRow {
  readonly priority: string;
  readonly title: string;
  readonly status: string;
}

/**
 * Full Rule Trace presentation document.
 *
 * Layer-facing fields (Status, Recommendation, Dependency, Source Module,
 * evaluation marks) live on TracePresentationLayer via `trace.layers`.
 * Remaining sections are display-ready copies of the builder output.
 */
export interface RuleTracePresentation {
  /** Shared presentation header + layer rows (TracePresentation). */
  readonly trace: TracePresentation;
  /** Original metadata scalars — formatter passes them through `kv`/`fmt`. */
  readonly metadata: RuleTraceMetadata;
  readonly inputSnapshot: readonly { key: string; value: string }[];
  readonly summary: RuleTraceSummary;
  readonly priorityTree: readonly RuleTracePresentationPriorityRow[];
  readonly conflict: RuleTraceConflict;
  readonly decision: RuleTraceDecision;
  readonly groupBreakdown: RuleTrace['groupBreakdown'];
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

function toLayer(rule: RuleTraceItem): TracePresentationLayer {
  const recommendation = normalizeTraceRecommendation(rule.recommendation);
  const dependency = rule.dependency;
  return {
    id: rule.id,
    index: rule.index,
    layerNumber: parseLayerNumber(rule.id),
    layerCode: rule.id,
    layerName: rule.title,
    status: asStatus(rule.status),
    recommendation,
    expected: rule.expected,
    actual: rule.actual,
    contribution: rule.contribution === null ? undefined : rule.contribution,
    dependency,
    sourceLayer: dependency,
    dependsLine: formatTraceDependsLine(rule.title, dependency),
    mandatory: rule.mandatory,
    reason: rule.reason,
    evidence: rule.evidence.map((e) => ({ label: e.label, value: e.value })),
    weight: rule.weight,
    priority: rule.priority,
    blockType: rule.blockType,
    evaluationPass: rule.status === 'PASS' ? 'YES' : '-',
    evaluationFail: rule.status === 'FAIL' ? 'YES' : '-',
  };
}

function toSharedMetadata(metadata: RuleTraceMetadata): TracePresentationMetadata {
  return {
    version: metadata.version != null ? String(metadata.version) : undefined,
    generatedAt: metadata.generatedAt != null ? String(metadata.generatedAt) : undefined,
    tradeId: metadata.tradeId != null ? String(metadata.tradeId) : undefined,
    coin: metadata.coin != null ? String(metadata.coin) : undefined,
    side: metadata.side != null ? String(metadata.side) : undefined,
    engineVersion: metadata.engineVersion != null ? String(metadata.engineVersion) : undefined,
    ruleVersion: metadata.ruleVersion != null ? String(metadata.ruleVersion) : undefined,
  };
}

/** Map builder RuleTrace → Rule Trace presentation DTO. */
export function toRuleTracePresentation(trace: RuleTrace): RuleTracePresentation {
  const layers = trace.rules.map(toLayer);
  return {
    trace: {
      metadata: toSharedMetadata(trace.metadata),
      layers,
    },
    metadata: trace.metadata,
    inputSnapshot: trace.inputSnapshot,
    summary: trace.summary,
    priorityTree: trace.priorityTree.map((r) => ({
      priority: r.priority,
      title: r.title,
      status: r.status,
    })),
    conflict: trace.conflict,
    decision: trace.decision,
    groupBreakdown: trace.groupBreakdown,
  };
}

/**
 * TASK 16.2 — Rule Trace Export. Architecture: FROZEN.
 *
 * Input contracts for the Rule Trace layer. The caller feeds the frozen
 * RuleBook evaluation journey in; the exporter copies values verbatim.
 * READ ONLY: no rule is re-evaluated, no score is recalculated.
 */

import type { AiExportScalar } from '../types';

export type RuleTraceStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

export type RuleTraceBlockType = 'HARD' | 'SOFT' | 'UNLOCK' | 'NONE';

/** One evidence line — one rule cites its own evidence, never duplicated. */
export interface RuleTraceEvidence {
  label?: AiExportScalar;
  value?: AiExportScalar;
}

/** One rule's full evaluation journey, copied from the frozen RuleBook result. */
export interface RuleTraceRule {
  id?: AiExportScalar;
  title?: AiExportScalar;
  status?: RuleTraceStatus | null;
  weight?: AiExportScalar;
  priority?: AiExportScalar;
  expected?: AiExportScalar;
  actual?: AiExportScalar;
  reason?: AiExportScalar;
  recommendation?: AiExportScalar;
  evidence?: readonly RuleTraceEvidence[] | null;
  /** Score contribution as reported by the engine — never recomputed. */
  contribution?: number | null;
  /** Module this rule depends on (e.g. "EMA Module", "OrderBook"). */
  dependency?: AiExportScalar;
  blockType?: RuleTraceBlockType | null;
  mandatory?: boolean | null;
  enabled?: boolean | null;
}

export interface RuleTraceMetadata {
  version?: AiExportScalar;
  generatedAt?: AiExportScalar;
  tradeId?: AiExportScalar;
  ruleVersion?: AiExportScalar;
  engineVersion?: AiExportScalar;
  coin?: AiExportScalar;
  side?: AiExportScalar;
}

/** Frozen decision chain values — copied from the engine, not derived. */
export interface RuleTraceDecision {
  score?: AiExportScalar;
  totalScore?: AiExportScalar;
  hardBlock?: boolean | null;
  decision?: AiExportScalar;
  recommendation?: AiExportScalar;
}

/** TASK 18.6 — display-ready Group Breakdown (prepared by export wire). */
export interface RuleTraceGroupBreakdownRow {
  group?: AiExportScalar;
  layers?: AiExportScalar;
  rawSum?: AiExportScalar;
  rawMax?: AiExportScalar;
  groupMax?: AiExportScalar;
  groupScore?: AiExportScalar;
  notes?: AiExportScalar;
}

export interface RuleTraceGroupBreakdown {
  rows?: readonly RuleTraceGroupBreakdownRow[] | null;
  decisionTotal?: AiExportScalar;
  vwapNote?: AiExportScalar;
}

/** Full frozen input for one Rule Trace export run. */
export interface RuleTraceInput {
  metadata?: RuleTraceMetadata | null;
  /** Raw market inputs the rules evaluated (EMA, Volume, Funding, ...). */
  inputSnapshot?: Readonly<Record<string, AiExportScalar>> | null;
  rules?: readonly RuleTraceRule[] | null;
  decision?: RuleTraceDecision | null;
  /** TASK 18.6 Option B — Group Breakdown (optional; display-ready). */
  groupBreakdown?: RuleTraceGroupBreakdown | null;
}

/** Normalized rule after builder pass — all fields resolved, no undefined. */
export interface RuleTraceItem {
  index: number;
  id: string;
  title: string;
  status: string;
  weight: string;
  priority: string;
  priorityValue: number | null;
  expected: string;
  actual: string;
  reason: string;
  recommendation: string;
  evidence: readonly { label: string; value: string }[];
  contribution: number | null;
  dependency: string;
  blockType: RuleTraceBlockType;
  mandatory: boolean;
  ignored: boolean;
}

export interface RuleTraceSummary {
  matchedRules: number;
  failedRules: number;
  ignoredRules: number;
  blockedRules: number;
  softBlocks: number;
  hardBlocks: number;
  unlockRules: number;
}

export interface RuleTraceConflict {
  detected: boolean;
  reasons: readonly string[];
}

/** Builder output — everything the formatter needs, fully normalized. */
export interface RuleTrace {
  metadata: RuleTraceMetadata;
  inputSnapshot: readonly { key: string; value: string }[];
  rules: readonly RuleTraceItem[];
  summary: RuleTraceSummary;
  /** Rules sorted by priority (desc). Ties keep input order. */
  priorityTree: readonly RuleTraceItem[];
  conflict: RuleTraceConflict;
  decision: RuleTraceDecision;
  /** TASK 18.6 — display-ready group breakdown (may be empty). */
  groupBreakdown: {
    rows: readonly {
      group: string;
      layers: string;
      rawSum: string;
      rawMax: string;
      groupMax: string;
      groupScore: string;
      notes: string;
    }[];
    decisionTotal: string;
    vwapNote: string | null;
  };
}

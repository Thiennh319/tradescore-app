/**
 * TASK 16.3 — Score Trace Export. Architecture: FROZEN.
 *
 * Frozen input contracts only. The export layer copies the Score Engine's
 * recorded values and never derives scores, bonuses, penalties or overrides.
 */

import type { AiExportScalar } from '../types';

export type ScoreTraceStatus = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

export interface ScoreTraceEvidence {
  label?: AiExportScalar;
  value?: AiExportScalar;
}

export interface ScoreTraceMetadata {
  version?: AiExportScalar;
  generatedAt?: AiExportScalar;
  tradeId?: AiExportScalar;
  coin?: AiExportScalar;
  side?: AiExportScalar;
  engineVersion?: AiExportScalar;
  scoreVersion?: AiExportScalar;
}

export interface ScoreTraceComponent {
  id?: AiExportScalar;
  name?: AiExportScalar;
  category?: AiExportScalar;
  weight?: AiExportScalar;
  maxScore?: AiExportScalar;
  actualScore?: AiExportScalar;
  contribution?: AiExportScalar;
  status?: ScoreTraceStatus | null;
  actual?: AiExportScalar;
  expected?: AiExportScalar;
  reason?: AiExportScalar;
  recommendation?: AiExportScalar;
  evidence?: readonly ScoreTraceEvidence[] | null;
  sourceModule?: AiExportScalar;
  dependency?: AiExportScalar;
  enabled?: boolean | null;
}

export interface ScoreTraceAdjustment {
  id?: AiExportScalar;
  reason?: AiExportScalar;
  contribution?: AiExportScalar;
  evidence?: readonly ScoreTraceEvidence[] | null;
  sourceModule?: AiExportScalar;
}

export interface ScoreTraceHardBlock {
  id?: AiExportScalar;
  rule?: AiExportScalar;
  reason?: AiExportScalar;
  overrideScore?: boolean | null;
  evidence?: readonly ScoreTraceEvidence[] | null;
}

/**
 * Every summary value is supplied by the engine. The builder does not sum
 * components or adjustments.
 */
export interface ScoreTraceSummaryInput {
  rawScore?: AiExportScalar;
  bonus?: AiExportScalar;
  penalty?: AiExportScalar;
  override?: AiExportScalar;
  finalScore?: AiExportScalar;
  grade?: AiExportScalar;
  decision?: AiExportScalar;
  /** Copied hard-block flag from the engine snapshot (TASK 17.X F1). */
  hardBlocked?: AiExportScalar;
}

/**
 * Decision policy copied from the engine snapshot (TASK 17.X F3/F4/F5).
 * Copy-only: missing fields render UNAVAILABLE, never derived or inferred.
 */
export interface ScoreTraceDecisionPolicy {
  decisionThreshold?: AiExportScalar;
  decisionPolicy?: AiExportScalar;
  decisionSource?: AiExportScalar;
  decisionRule?: AiExportScalar;
  decisionMapping?: AiExportScalar;
  decisionReason?: AiExportScalar;
  overridden?: AiExportScalar;
  overrideRule?: AiExportScalar;
  overrideModule?: AiExportScalar;
  overrideReason?: AiExportScalar;
  overrideEvidence?: readonly ScoreTraceEvidence[] | null;
}

export interface ScoreTraceInput {
  metadata?: ScoreTraceMetadata | null;
  inputSnapshot?: Readonly<Record<string, AiExportScalar>> | null;
  components?: readonly ScoreTraceComponent[] | null;
  bonuses?: readonly ScoreTraceAdjustment[] | null;
  penalties?: readonly ScoreTraceAdjustment[] | null;
  hardBlocks?: readonly ScoreTraceHardBlock[] | null;
  summary?: ScoreTraceSummaryInput | null;
  /** TASK 17.X — decision policy copied from the engine snapshot. */
  decisionPolicy?: ScoreTraceDecisionPolicy | null;
  /**
   * TASK 18.7 — Group Breakdown (display-ready; same contract as Rule Trace Option B).
   * Optional: older callers omit it.
   */
  groupBreakdown?: {
    rows?: readonly {
      group?: AiExportScalar;
      layers?: AiExportScalar;
      rawSum?: AiExportScalar;
      rawMax?: AiExportScalar;
      groupMax?: AiExportScalar;
      groupScore?: AiExportScalar;
      notes?: AiExportScalar;
    }[] | null;
    decisionTotal?: AiExportScalar;
    vwapNote?: AiExportScalar;
  } | null;
}

export interface ScoreTraceEvidenceItem {
  label: string;
  value: string;
}

export interface ScoreTraceComponentItem {
  index: number;
  id: string;
  name: string;
  category: string;
  weight: string;
  maxScore: string;
  actualScore: string;
  contribution: string;
  status: string;
  actual: string;
  expected: string;
  reason: string;
  recommendation: string;
  evidence: readonly ScoreTraceEvidenceItem[];
  sourceModule: string;
  dependency: string;
  ignored: boolean;
}

export interface ScoreTraceAdjustmentItem {
  index: number;
  id: string;
  reason: string;
  contribution: string;
  evidence: readonly ScoreTraceEvidenceItem[];
  sourceModule: string;
}

export interface ScoreTraceHardBlockItem {
  index: number;
  id: string;
  rule: string;
  reason: string;
  overrideScore: boolean | null;
  evidence: readonly ScoreTraceEvidenceItem[];
}

/** Structural consistency observation on copied values (TASK 17.X F1). */
export interface ScoreTraceConsistency {
  detected: boolean;
  reasons: readonly string[];
}

export interface ScoreTrace {
  metadata: ScoreTraceMetadata;
  inputSnapshot: readonly { key: string; value: string }[];
  components: readonly ScoreTraceComponentItem[];
  bonuses: readonly ScoreTraceAdjustmentItem[];
  penalties: readonly ScoreTraceAdjustmentItem[];
  hardBlocks: readonly ScoreTraceHardBlockItem[];
  summary: ScoreTraceSummaryInput;
  decisionPolicy: ScoreTraceDecisionPolicy;
  consistency: ScoreTraceConsistency;
  /** TASK 18.7 — display-ready Group Breakdown (strings already fmt'd). */
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

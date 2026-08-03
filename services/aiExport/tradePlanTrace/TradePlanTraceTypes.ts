/**
 * TASK 16.6 — TradePlan Trace Export. Architecture: FROZEN.
 *
 * Frozen input contracts for the TradePlan trace. The exporter copies the
 * plan the system already created — it never creates a new plan, never
 * recalculates risk/targets, and never touches the TradePlan Engine.
 */

import type { AiExportScalar } from '../types';

export type TradePlanStatus = 'READY' | 'WAIT' | 'CANCELLED' | 'ACTIVE';

export interface TradePlanTraceEvidence {
  label?: AiExportScalar;
  value?: AiExportScalar;
}

export interface TradePlanTraceMetadata {
  version?: AiExportScalar;
  tradeId?: AiExportScalar;
  coin?: AiExportScalar;
  side?: AiExportScalar;
  strategy?: AiExportScalar;
  timestamp?: AiExportScalar;
  tradePlanVersion?: AiExportScalar;
  ruleVersion?: AiExportScalar;
  engineVersion?: AiExportScalar;
}

export interface TradePlanSummary {
  planStatus?: TradePlanStatus | null;
  headline?: AiExportScalar;
  summary?: AiExportScalar;
  confidence?: AiExportScalar;
  priority?: AiExportScalar;
}

export interface TradePlanEntryPlan {
  entryPrice?: AiExportScalar;
  entryZone?: AiExportScalar;
  preferredEntry?: AiExportScalar;
  maximumEntry?: AiExportScalar;
  reason?: AiExportScalar;
}

export interface TradePlanRiskPlan {
  stopLoss?: AiExportScalar;
  riskPct?: AiExportScalar;
  maximumLoss?: AiExportScalar;
  riskReward?: AiExportScalar;
  positionSize?: AiExportScalar;
  leverage?: AiExportScalar;
  reason?: AiExportScalar;
}

export interface TradePlanTargetPlan {
  tp1?: AiExportScalar;
  tp2?: AiExportScalar;
  tp3?: AiExportScalar;
  scaleOut?: AiExportScalar;
  trailing?: AiExportScalar;
  breakEven?: AiExportScalar;
}

export interface TradePlanExecutionPlan {
  currentStep?: AiExportScalar;
  nextStep?: AiExportScalar;
  trigger?: AiExportScalar;
  condition?: AiExportScalar;
  fallback?: AiExportScalar;
}

export interface TradePlanPositionManagement {
  initialAdviserState?: AiExportScalar;
  expectedAdviserState?: AiExportScalar;
  protection?: AiExportScalar;
  scaleOut?: AiExportScalar;
  closeCondition?: AiExportScalar;
}

export interface TradePlanRuleReference {
  ruleId?: AiExportScalar;
  ruleName?: AiExportScalar;
  decisionSource?: AiExportScalar;
  evidenceReference?: AiExportScalar;
}

/** Copied verbatim from the engine — never derived here. */
export interface TradePlanContribution {
  entry?: AiExportScalar;
  risk?: AiExportScalar;
  targets?: AiExportScalar;
  management?: AiExportScalar;
  timing?: AiExportScalar;
}

export interface TradePlanBlocker {
  blocker?: AiExportScalar;
  requiredUnlock?: AiExportScalar;
  reason?: AiExportScalar;
  evidence?: readonly TradePlanTraceEvidence[] | null;
}

export interface TradePlanCancellation {
  cancelCondition?: AiExportScalar;
  reason?: AiExportScalar;
  evidence?: readonly TradePlanTraceEvidence[] | null;
}

/**
 * Frozen values copied from other engines, used only for structural
 * conflict observation (e.g. plan READY while Entry decided WAIT).
 */
export interface TradePlanCrossReferences {
  entryDecision?: AiExportScalar;
  positionState?: AiExportScalar;
}

/** Full frozen input for one TradePlan Trace export run. */
export interface TradePlanTraceInput {
  metadata?: TradePlanTraceMetadata | null;
  summary?: TradePlanSummary | null;
  entryPlan?: TradePlanEntryPlan | null;
  riskPlan?: TradePlanRiskPlan | null;
  targetPlan?: TradePlanTargetPlan | null;
  executionPlan?: TradePlanExecutionPlan | null;
  positionManagement?: TradePlanPositionManagement | null;
  ruleReferences?: readonly TradePlanRuleReference[] | null;
  contribution?: TradePlanContribution | null;
  blockers?: readonly TradePlanBlocker[] | null;
  cancellation?: TradePlanCancellation | null;
  crossReferences?: TradePlanCrossReferences | null;
}

export interface TradePlanEvidenceItem {
  label: string;
  value: string;
}

export interface TradePlanRuleReferenceItem {
  index: number;
  ruleId: string;
  ruleName: string;
  decisionSource: string;
  evidenceReference: string;
}

export interface TradePlanBlockerItem {
  index: number;
  blocker: string;
  requiredUnlock: string;
  reason: string;
  evidence: readonly TradePlanEvidenceItem[];
}

export interface TradePlanCancellationItem {
  cancelCondition: string;
  reason: string;
  evidence: readonly TradePlanEvidenceItem[];
}

export interface TradePlanConflict {
  detected: boolean;
  reasons: readonly string[];
}

/** Builder output — normalized and ready for formatting. */
export interface TradePlanTrace {
  metadata: TradePlanTraceMetadata;
  summary: TradePlanSummary;
  entryPlan: TradePlanEntryPlan;
  riskPlan: TradePlanRiskPlan;
  targetPlan: TradePlanTargetPlan;
  executionPlan: TradePlanExecutionPlan;
  positionManagement: TradePlanPositionManagement;
  ruleReferences: readonly TradePlanRuleReferenceItem[];
  contribution: TradePlanContribution;
  blockers: readonly TradePlanBlockerItem[];
  cancellation: TradePlanCancellationItem;
  crossReferences: TradePlanCrossReferences;
  conflict: TradePlanConflict;
}

/**
 * TASK 16.5 — Position Adviser Trace Export. Architecture: FROZEN.
 *
 * Frozen contracts only. The exporter copies the Position Adviser's recorded
 * journey and never recalculates PnL, risk, stops, targets or recommendations.
 */

import type { AiExportScalar } from '../types';

export type AdviserRecommendation = 'HOLD' | 'MOVE SL' | 'SCALE OUT' | 'CLOSE';
export type AdviserCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'SKIPPED';

export interface AdviserTraceEvidence {
  label?: AiExportScalar;
  value?: AiExportScalar;
}

export interface PositionAdviserTraceMetadata {
  version?: AiExportScalar;
  tradeId?: AiExportScalar;
  positionId?: AiExportScalar;
  coin?: AiExportScalar;
  side?: AiExportScalar;
  strategy?: AiExportScalar;
  openedTime?: AiExportScalar;
  holdingDuration?: AiExportScalar;
  ruleVersion?: AiExportScalar;
  adviserVersion?: AiExportScalar;
  engineVersion?: AiExportScalar;
}

export interface PositionTraceSnapshot {
  entryPrice?: AiExportScalar;
  currentPrice?: AiExportScalar;
  pnlPct?: AiExportScalar;
  pnlUsdt?: AiExportScalar;
  riskReward?: AiExportScalar;
  unrealizedProfit?: AiExportScalar;
  stopLoss?: AiExportScalar;
  takeProfit?: AiExportScalar;
  trailingStop?: AiExportScalar;
  breakEven?: AiExportScalar;
  leverage?: AiExportScalar;
  positionSize?: AiExportScalar;
  exposure?: AiExportScalar;
  holdingTime?: AiExportScalar;
  currentAdviserState?: AiExportScalar;
}

export interface PositionAdviserDecision {
  recommendation?: AdviserRecommendation | null;
  reason?: AiExportScalar;
  summary?: AiExportScalar;
  confidence?: AiExportScalar;
  priority?: AiExportScalar;
}

export interface AdviserDecisionTreeStep {
  stage?: AiExportScalar;
  result?: AiExportScalar;
  detail?: AiExportScalar;
}

export interface AdviserTraceCheck {
  id?: AiExportScalar;
  name?: AiExportScalar;
  status?: AdviserCheckStatus | null;
  priority?: AiExportScalar;
  reason?: AiExportScalar;
  recommendation?: AiExportScalar;
  evidence?: readonly AdviserTraceEvidence[] | null;
  source?: AiExportScalar;
  dependency?: AiExportScalar;
  contribution?: AiExportScalar;
  enabled?: boolean | null;
}

export interface AdviserTraceRule {
  id?: AiExportScalar;
  name?: AiExportScalar;
  triggered?: boolean | null;
  priority?: AiExportScalar;
  reason?: AiExportScalar;
  evidence?: readonly AdviserTraceEvidence[] | null;
  override?: boolean | null;
  /** Explicit engine signal used for structural HOLD conflict detection. */
  hardExit?: boolean | null;
}

export interface PositionActionPlan {
  currentAction?: AiExportScalar;
  suggestedAction?: AiExportScalar;
  reason?: AiExportScalar;
  expectedEffect?: AiExportScalar;
  risk?: AiExportScalar;
}

export interface StopLossPlan {
  currentStopLoss?: AiExportScalar;
  suggestedStopLoss?: AiExportScalar;
  reason?: AiExportScalar;
  protectionType?: AiExportScalar;
  breakEven?: AiExportScalar;
  trailing?: AiExportScalar;
  /**
   * Explicit Adviser output. The exporter never compares stop prices itself.
   * Used only for structural MOVE SL conflict reporting.
   */
  worsensProtection?: boolean | null;
}

export interface TakeProfitPlan {
  currentTakeProfit?: AiExportScalar;
  suggestedTakeProfit?: AiExportScalar;
  scaleOutPct?: AiExportScalar;
  remainingPct?: AiExportScalar;
  reason?: AiExportScalar;
}

export interface AdviserRiskReview {
  currentRisk?: AiExportScalar;
  allowedRisk?: AiExportScalar;
  drawdown?: AiExportScalar;
  exposure?: AiExportScalar;
  ruleStatus?: AiExportScalar;
}

export interface AdviserContribution {
  name?: AiExportScalar;
  contribution?: AiExportScalar;
  reason?: AiExportScalar;
}

export interface PositionAdviserTraceInput {
  metadata?: PositionAdviserTraceMetadata | null;
  positionSnapshot?: PositionTraceSnapshot | null;
  marketSnapshot?: Readonly<Record<string, AiExportScalar>> | null;
  decision?: PositionAdviserDecision | null;
  decisionTree?: readonly AdviserDecisionTreeStep[] | null;
  checks?: readonly AdviserTraceCheck[] | null;
  rules?: readonly AdviserTraceRule[] | null;
  positionAction?: PositionActionPlan | null;
  stopLossPlan?: StopLossPlan | null;
  takeProfitPlan?: TakeProfitPlan | null;
  riskReview?: AdviserRiskReview | null;
  contributions?: readonly AdviserContribution[] | null;
}

export interface AdviserEvidenceItem {
  label: string;
  value: string;
}

export interface AdviserCheckItem {
  index: number;
  id: string;
  name: string;
  status: string;
  priority: string;
  reason: string;
  recommendation: string;
  evidence: readonly AdviserEvidenceItem[];
  source: string;
  dependency: string;
  contribution: string;
  ignored: boolean;
}

export interface AdviserRuleItem {
  index: number;
  id: string;
  name: string;
  triggered: boolean | null;
  priority: string;
  reason: string;
  evidence: readonly AdviserEvidenceItem[];
  override: boolean | null;
  hardExit: boolean;
}

export interface AdviserTreeStepItem {
  index: number;
  stage: string;
  result: string;
  detail: string;
}

export interface AdviserContributionItem {
  name: string;
  contribution: string;
  reason: string;
}

export interface AdviserConflict {
  detected: boolean;
  reasons: readonly string[];
}

export interface PositionAdviserTrace {
  metadata: PositionAdviserTraceMetadata;
  positionSnapshot: PositionTraceSnapshot;
  marketSnapshot: readonly { key: string; value: string }[];
  decision: PositionAdviserDecision;
  decisionTree: readonly AdviserTreeStepItem[];
  checks: readonly AdviserCheckItem[];
  rules: readonly AdviserRuleItem[];
  positionAction: PositionActionPlan;
  stopLossPlan: StopLossPlan;
  takeProfitPlan: TakeProfitPlan;
  riskReview: AdviserRiskReview;
  contributions: readonly AdviserContributionItem[];
  conflict: AdviserConflict;
}

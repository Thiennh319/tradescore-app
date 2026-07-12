/**
 * Pipeline Orchestrator — type models (Task 02.7.2).
 *
 * **Purpose:** Coordinate full ESM pipeline from {@link SignalBoardAdapterResult}.
 * **Does NOT** contain rules, decisions, transitions, or evaluation logic.
 *
 * @module entryStateManager/pipelineOrchestratorTypes
 */

import type { ActionEngineResult } from './actionTypes';
import type { ActionRuntimeResult } from './actionRuntimeTypes';
import type { ConflictResolverResult } from './conflictResolverTypes';
import type { DecisionEngineResult } from './decisionEngineTypes';
import type { FinalDecisionResult } from './finalDecisionTypes';
import type { PriorityResolverResult } from './priorityResolverTypes';
import type { RuntimeDispatcherResult } from './runtimeDispatcherTypes';
import type { RuntimeExecutorResult } from './runtimeExecutorTypes';
import type { SignalBoardAdapterResult } from './signalBoardAdapterTypes';
import type { EntryStateMachineResult } from './stateMachineTypes';
import type { TriggerAggregateResult } from './triggerAggregatorTypes';

/** Orchestrator input — adapter output + scan correlation id. */
export interface PipelineOrchestratorContext {
  adapterResult: SignalBoardAdapterResult;
  scanId: string;
}

/**
 * Full pipeline output — one result per stage, plus orchestrator metadata.
 *
 * `halted` is true when any stage reports `halted: true`.
 */
export interface PipelineOrchestratorResult {
  aggregateResult: TriggerAggregateResult;
  priorityResult: PriorityResolverResult;
  conflictResult: ConflictResolverResult;
  decisionResult: DecisionEngineResult;
  finalDecisionResult: FinalDecisionResult;
  stateMachineResult: EntryStateMachineResult;
  actionEngineResult: ActionEngineResult;
  actionRuntimeResult: ActionRuntimeResult;
  runtimeDispatcherResult: RuntimeDispatcherResult;
  runtimeExecutorResult: RuntimeExecutorResult;
  halted: boolean;
  message: string;
  context: PipelineOrchestratorContext;
}

/** Context validation result. */
export interface PipelineOrchestratorContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result — stage integrity and scanId consistency. */
export interface PipelineOrchestratorResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

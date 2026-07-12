/**
 * Pipeline Orchestrator — scaffold (Task 02.7.2).
 *
 * **Purpose:** Sole coordinator for the full ESM pipeline after SignalBoardAdapter.
 * **Does NOT** evaluate rules, decide, transition, retry, or wire production.
 *
 * @module entryStateManager/pipelineOrchestrator
 */

import { buildActionEngineResult, validateActionEngineResult } from './actionEngine';
import type { ActionEngineContext } from './actionTypes';
import { buildActionRuntimeResult, validateActionRuntimeResult } from './actionRuntime';
import type { ActionRuntimeContext } from './actionRuntimeTypes';
import { resolveConflicts } from './conflictResolver';
import type { ConflictResolverContext } from './conflictResolverTypes';
import { buildDecisionEngineResult, validateDecisionEngineResult } from './decisionEngine';
import type { DecisionEngineContext } from './decisionEngineTypes';
import { buildFinalDecisionResult, validateFinalDecisionResult } from './finalDecisionEngine';
import type { FinalDecisionContext } from './finalDecisionTypes';
import { isRecord } from './pipelineValidationUtils';
import { resolvePriority } from './priorityResolver';
import type { PriorityResolverContext } from './priorityResolverTypes';
import { buildRuntimeDispatcherResult, validateRuntimeDispatcherResult } from './runtimeDispatcher';
import type { RuntimeDispatcherContext } from './runtimeDispatcherTypes';
import { buildRuntimeExecutorResult, validateRuntimeExecutorResult } from './runtimeExecutor';
import type { RuntimeExecutorContext } from './runtimeExecutorTypes';
import { validateSignalBoardAdapterResult } from './signalBoardAdapter';
import { buildEntryStateMachineResult, validateEntryStateMachineResult } from './stateMachine';
import { EntryState, type EntryStateMachineContext } from './stateMachineTypes';
import { aggregateTriggers } from './triggerAggregator';
import type {
  PipelineOrchestratorContext,
  PipelineOrchestratorContextValidationResult,
  PipelineOrchestratorResult,
  PipelineOrchestratorResultValidationResult,
} from './pipelineOrchestratorTypes';

/** Default state-machine current state for orchestrator scaffold (Task 02.7.2). */
export const ORCHESTRATOR_DEFAULT_CURRENT_STATE = EntryState.WATCH;

function validateScanId(scanId: string | undefined, errors: string[], label = 'scanId'): void {
  if (typeof scanId !== 'string' || !scanId.trim()) {
    errors.push(`${label} must be a non-empty string`);
  }
}

function stageHasHalted(
  ...stages: ReadonlyArray<{ halted: boolean }>
): boolean {
  return stages.some((stage) => stage.halted);
}

function buildOrchestratorMessage(
  halted: boolean,
  stages: ReadonlyArray<{ name: string; halted: boolean; message: string }>,
): string {
  if (!halted) {
    return 'Pipeline orchestration complete — scaffold only (Task 02.7.2)';
  }
  const haltedMessages = stages
    .filter((stage) => stage.halted)
    .map((stage) => `${stage.name}: ${stage.message}`);
  return haltedMessages.join(' | ') || 'Pipeline halted';
}

function validateStageScanId(
  stageScanId: string | undefined,
  expectedScanId: string,
  label: string,
  errors: string[],
): void {
  if (stageScanId !== undefined && stageScanId !== expectedScanId) {
    errors.push(`${label}.scanId must match orchestrator scanId`);
  }
}

/** Validates orchestrator input — adapter integrity and scanId alignment. */
export function validatePipelineOrchestratorContext(
  context: PipelineOrchestratorContext,
): PipelineOrchestratorContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  validateScanId(context.scanId, errors);

  if (context.adapterResult === undefined) {
    errors.push('adapterResult is required');
  } else {
    const adapterValidation = validateSignalBoardAdapterResult(context.adapterResult);
    if (!adapterValidation.valid) {
      for (const err of adapterValidation.errors) {
        errors.push(`adapterResult: ${err}`);
      }
    }
    if (
      typeof context.scanId === 'string'
      && context.scanId.trim()
      && context.adapterResult.scanId !== context.scanId
    ) {
      errors.push('scanId must match adapterResult.scanId');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates orchestrator output — delegated stage validators and scanId consistency. */
export function validatePipelineOrchestratorResult(
  result: PipelineOrchestratorResult,
): PipelineOrchestratorResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!isRecord(result.context)) {
    errors.push('context must be an object');
    return { valid: false, errors };
  }

  validateScanId(result.context.scanId, errors, 'context.scanId');

  const expectedScanId = result.context.scanId;

  const stageValidators: Array<{ label: string; run: () => { valid: boolean; errors: readonly string[] } }> = [
    { label: 'decisionResult', run: () => validateDecisionEngineResult(result.decisionResult) },
    { label: 'finalDecisionResult', run: () => validateFinalDecisionResult(result.finalDecisionResult) },
    { label: 'stateMachineResult', run: () => validateEntryStateMachineResult(result.stateMachineResult) },
    { label: 'actionEngineResult', run: () => validateActionEngineResult(result.actionEngineResult) },
    { label: 'actionRuntimeResult', run: () => validateActionRuntimeResult(result.actionRuntimeResult) },
    { label: 'runtimeDispatcherResult', run: () => validateRuntimeDispatcherResult(result.runtimeDispatcherResult) },
    { label: 'runtimeExecutorResult', run: () => validateRuntimeExecutorResult(result.runtimeExecutorResult) },
  ];

  for (const { label, run } of stageValidators) {
    const validation = run();
    if (!validation.valid) {
      for (const err of validation.errors) {
        errors.push(`${label}: ${err}`);
      }
    }
  }

  if (!isRecord(result.aggregateResult)) {
    errors.push('aggregateResult must be an object');
  } else {
    if (typeof result.aggregateResult.halted !== 'boolean') {
      errors.push('aggregateResult.halted must be boolean');
    }
    validateStageScanId(result.aggregateResult.context?.scanId, expectedScanId, 'aggregateResult.context', errors);
  }

  if (!isRecord(result.priorityResult)) {
    errors.push('priorityResult must be an object');
  } else {
    validateStageScanId(result.priorityResult.context?.scanId, expectedScanId, 'priorityResult.context', errors);
  }

  if (!isRecord(result.conflictResult)) {
    errors.push('conflictResult must be an object');
  } else {
    validateStageScanId(result.conflictResult.context?.scanId, expectedScanId, 'conflictResult.context', errors);
  }

  if (typeof result.halted !== 'boolean') {
    errors.push('halted must be boolean');
  }

  const expectedOrchestratorHalted = stageHasHalted(
    result.aggregateResult,
    result.priorityResult,
    result.conflictResult,
    result.decisionResult,
    result.finalDecisionResult,
    result.stateMachineResult,
    result.actionEngineResult,
    result.actionRuntimeResult,
    result.runtimeDispatcherResult,
    result.runtimeExecutorResult,
  );
  if (result.halted !== expectedOrchestratorHalted) {
    errors.push('halted must reflect any stage halted state');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Runs the full ESM pipeline synchronously — orchestration only.
 *
 * Throws when context validation fails. Does not catch downstream exceptions.
 */
export function buildPipelineOrchestratorResult(
  context: PipelineOrchestratorContext,
): PipelineOrchestratorResult {
  const validation = validatePipelineOrchestratorContext(context);
  if (!validation.valid) {
    throw new Error(
      `invalid PipelineOrchestratorContext: ${validation.errors.join('; ')}`,
    );
  }

  const scanId = context.scanId.trim();
  const adapterResult = context.adapterResult;

  const aggregateResult = aggregateTriggers(adapterResult.aggregateContext);

  const priorityContext: PriorityResolverContext = {
    aggregateResult,
    scanId,
  };
  const priorityResult = resolvePriority(priorityContext);

  const conflictContext: ConflictResolverContext = {
    priorityResult,
    scanId,
  };
  const conflictResult = resolveConflicts(conflictContext);

  const decisionContext: DecisionEngineContext = {
    conflictResult,
    scanId,
  };
  const decisionResult = buildDecisionEngineResult(decisionContext);

  const finalDecisionContext: FinalDecisionContext = {
    decisionResult,
    scanId,
  };
  const finalDecisionResult = buildFinalDecisionResult(finalDecisionContext);

  const stateMachineContext: EntryStateMachineContext = {
    finalDecisionResult,
    currentState: ORCHESTRATOR_DEFAULT_CURRENT_STATE,
    scanId,
  };
  const stateMachineResult = buildEntryStateMachineResult(stateMachineContext);

  const actionEngineContext: ActionEngineContext = {
    stateMachineResult,
    scanId,
  };
  const actionEngineResult = buildActionEngineResult(actionEngineContext);

  const actionRuntimeContext: ActionRuntimeContext = {
    actionEngineResult,
    scanId,
  };
  const actionRuntimeResult = buildActionRuntimeResult(actionRuntimeContext);

  const runtimeDispatcherContext: RuntimeDispatcherContext = {
    actionRuntimeResult,
    scanId,
  };
  const runtimeDispatcherResult = buildRuntimeDispatcherResult(runtimeDispatcherContext);

  const runtimeExecutorContext: RuntimeExecutorContext = {
    runtimeDispatcherResult,
    scanId,
  };
  const runtimeExecutorResult = buildRuntimeExecutorResult(runtimeExecutorContext);

  const stages = [
    { name: 'aggregate', halted: aggregateResult.halted, message: aggregateResult.message },
    { name: 'priority', halted: priorityResult.halted, message: priorityResult.message },
    { name: 'conflict', halted: conflictResult.halted, message: conflictResult.message },
    { name: 'decision', halted: decisionResult.halted, message: decisionResult.message },
    { name: 'finalDecision', halted: finalDecisionResult.halted, message: finalDecisionResult.message },
    { name: 'stateMachine', halted: stateMachineResult.halted, message: stateMachineResult.message },
    { name: 'actionEngine', halted: actionEngineResult.halted, message: actionEngineResult.message },
    { name: 'actionRuntime', halted: actionRuntimeResult.halted, message: actionRuntimeResult.message },
    { name: 'runtimeDispatcher', halted: runtimeDispatcherResult.halted, message: runtimeDispatcherResult.message },
    { name: 'runtimeExecutor', halted: runtimeExecutorResult.halted, message: runtimeExecutorResult.message },
  ];

  const halted = stageHasHalted(...stages);

  const result: PipelineOrchestratorResult = {
    aggregateResult,
    priorityResult,
    conflictResult,
    decisionResult,
    finalDecisionResult,
    stateMachineResult,
    actionEngineResult,
    actionRuntimeResult,
    runtimeDispatcherResult,
    runtimeExecutorResult,
    halted,
    message: buildOrchestratorMessage(halted, stages),
    context: {
      adapterResult,
      scanId,
    },
  };

  return result;
}

/** Namespace for integration discoverability. */
export const PipelineOrchestrator = {
  buildPipelineOrchestratorResult,
  validatePipelineOrchestratorContext,
  validatePipelineOrchestratorResult,
  ORCHESTRATOR_DEFAULT_CURRENT_STATE,
} as const;

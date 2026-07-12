/**
 * Integration Harness — scaffold (Task 02.7.3).
 *
 * **Purpose:** Single integration layer: adapter → orchestrator → inject currentState.
 * **Does NOT** execute actions, wire production, or mutate upstream modules.
 *
 * @module entryStateManager/integrationHarness
 */

import { buildActionEngineResult } from './actionEngine';
import type { ActionEngineContext } from './actionTypes';
import { buildActionRuntimeResult } from './actionRuntime';
import type { ActionRuntimeContext } from './actionRuntimeTypes';
import type {
  IntegrationHarnessContext,
  IntegrationHarnessContextValidationResult,
  IntegrationHarnessResult,
  IntegrationHarnessResultValidationResult,
} from './integrationHarnessTypes';
import { isRecord } from './pipelineValidationUtils';
import {
  buildPipelineOrchestratorResult,
  validatePipelineOrchestratorResult,
} from './pipelineOrchestrator';
import type { PipelineOrchestratorResult } from './pipelineOrchestratorTypes';
import {
  buildSignalBoardAdapterResult,
  validateSignalBoardAdapterContext,
  validateSignalBoardAdapterResult,
} from './signalBoardAdapter';
import type {
  SignalBoardAdapterContext,
  SignalBoardTriggerSnapshot,
} from './signalBoardAdapterTypes';
import { buildRuntimeDispatcherResult } from './runtimeDispatcher';
import type { RuntimeDispatcherContext } from './runtimeDispatcherTypes';
import { buildRuntimeExecutorResult } from './runtimeExecutor';
import type { RuntimeExecutorContext } from './runtimeExecutorTypes';
import { buildEntryStateMachineResult, isStateMachineEntryState } from './stateMachine';
import type { EntryState, EntryStateMachineContext } from './stateMachineTypes';

function copySignalBoardScan(
  snapshot: IntegrationHarnessContext['signalBoardScan'],
): IntegrationHarnessContext['signalBoardScan'] {
  return {
    symbol: snapshot.symbol,
    price: snapshot.price,
    direction: snapshot.direction,
    canEnter: snapshot.canEnter,
    hardBlocked: snapshot.hardBlocked,
    decisionLabel: snapshot.decisionLabel,
    decisionDisplay: snapshot.decisionDisplay,
  };
}

function copyMarketSnapshot(
  snapshot: IntegrationHarnessContext['marketSnapshot'],
): IntegrationHarnessContext['marketSnapshot'] {
  return {
    symbol: snapshot.symbol,
    markPrice: snapshot.markPrice,
    timestamp: snapshot.timestamp,
  };
}

function copyTriggerSnapshot(triggerSnapshot: SignalBoardTriggerSnapshot): SignalBoardTriggerSnapshot {
  return {
    hardBlockResult: triggerSnapshot.hardBlockResult,
    recoveryResult: triggerSnapshot.recoveryResult,
    unlockResult: triggerSnapshot.unlockResult,
    confirmationResult: triggerSnapshot.confirmationResult,
    noiseResult: triggerSnapshot.noiseResult,
    aggregateResult: triggerSnapshot.aggregateResult,
    priorityResult: triggerSnapshot.priorityResult,
    conflictResult: triggerSnapshot.conflictResult,
  };
}

function copyHarnessContext(context: IntegrationHarnessContext): IntegrationHarnessContext {
  return {
    signalBoardScan: copySignalBoardScan(context.signalBoardScan),
    marketSnapshot: copyMarketSnapshot(context.marketSnapshot),
    triggerSnapshot: copyTriggerSnapshot(context.triggerSnapshot),
    currentState: context.currentState,
    scanId: context.scanId,
    timestamp: context.timestamp,
  };
}

function toAdapterContext(context: IntegrationHarnessContext): SignalBoardAdapterContext {
  return {
    signalBoardScan: copySignalBoardScan(context.signalBoardScan),
    marketSnapshot: copyMarketSnapshot(context.marketSnapshot),
    triggerSnapshot: copyTriggerSnapshot(context.triggerSnapshot),
    scanId: context.scanId.trim(),
    timestamp: context.timestamp.trim(),
  };
}

function stageHasHalted(
  ...stages: ReadonlyArray<{ halted: boolean }>
): boolean {
  return stages.some((stage) => stage.halted);
}

function buildInjectedPipelineMessage(halted: boolean, pipelineMessage: string): string {
  if (halted) {
    return `Integration harness halted — ${pipelineMessage}`;
  }
  return 'Integration harness complete — scaffold only (Task 02.7.3)';
}

/**
 * Re-runs state machine tail with injected currentState — does not modify orchestrator module.
 */
function injectCurrentStateIntoPipeline(
  pipelineResult: PipelineOrchestratorResult,
  currentState: EntryState,
  scanId: string,
): PipelineOrchestratorResult {
  const stateMachineContext: EntryStateMachineContext = {
    finalDecisionResult: pipelineResult.finalDecisionResult,
    currentState,
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

  const tailStages = [
    stateMachineResult,
    actionEngineResult,
    actionRuntimeResult,
    runtimeDispatcherResult,
    runtimeExecutorResult,
  ];
  const headHalted = stageHasHalted(
    pipelineResult.aggregateResult,
    pipelineResult.priorityResult,
    pipelineResult.conflictResult,
    pipelineResult.decisionResult,
    pipelineResult.finalDecisionResult,
  );
  const tailHalted = stageHasHalted(...tailStages);
  const halted = headHalted || tailHalted;

  const stages = [
    { name: 'aggregate', halted: pipelineResult.aggregateResult.halted, message: pipelineResult.aggregateResult.message },
    { name: 'priority', halted: pipelineResult.priorityResult.halted, message: pipelineResult.priorityResult.message },
    { name: 'conflict', halted: pipelineResult.conflictResult.halted, message: pipelineResult.conflictResult.message },
    { name: 'decision', halted: pipelineResult.decisionResult.halted, message: pipelineResult.decisionResult.message },
    { name: 'finalDecision', halted: pipelineResult.finalDecisionResult.halted, message: pipelineResult.finalDecisionResult.message },
    { name: 'stateMachine', halted: stateMachineResult.halted, message: stateMachineResult.message },
    { name: 'actionEngine', halted: actionEngineResult.halted, message: actionEngineResult.message },
    { name: 'actionRuntime', halted: actionRuntimeResult.halted, message: actionRuntimeResult.message },
    { name: 'runtimeDispatcher', halted: runtimeDispatcherResult.halted, message: runtimeDispatcherResult.message },
    { name: 'runtimeExecutor', halted: runtimeExecutorResult.halted, message: runtimeExecutorResult.message },
  ];
  const haltedMessages = stages
    .filter((stage) => stage.halted)
    .map((stage) => `${stage.name}: ${stage.message}`);
  const message = halted
    ? haltedMessages.join(' | ') || 'Pipeline halted'
    : 'Pipeline orchestration complete — scaffold only (Task 02.7.2)';

  return {
    ...pipelineResult,
    stateMachineResult,
    actionEngineResult,
    actionRuntimeResult,
    runtimeDispatcherResult,
    runtimeExecutorResult,
    halted,
    message,
  };
}

/** Validates harness input — delegates adapter validation + currentState guard. */
export function validateIntegrationHarnessContext(
  context: IntegrationHarnessContext,
): IntegrationHarnessContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  const adapterValidation = validateSignalBoardAdapterContext(toAdapterContext(context));
  if (!adapterValidation.valid) {
    for (const err of adapterValidation.errors) {
      errors.push(err);
    }
  }

  if (!isStateMachineEntryState(context.currentState)) {
    errors.push('currentState must be a valid state machine EntryState');
  }

  return { valid: errors.length === 0, errors };
}

/** Validates harness output — adapter, pipeline, halted, and currentState passthrough. */
export function validateIntegrationHarnessResult(
  result: IntegrationHarnessResult,
): IntegrationHarnessResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  const adapterValidation = validateSignalBoardAdapterResult(result.adapterResult);
  if (!adapterValidation.valid) {
    for (const err of adapterValidation.errors) {
      errors.push(`adapterResult: ${err}`);
    }
  }

  const pipelineValidation = validatePipelineOrchestratorResult(result.pipelineResult);
  if (!pipelineValidation.valid) {
    for (const err of pipelineValidation.errors) {
      errors.push(`pipelineResult: ${err}`);
    }
  }

  if (typeof result.halted !== 'boolean') {
    errors.push('halted must be boolean');
  } else if (result.halted !== result.pipelineResult.halted) {
    errors.push('halted must match pipelineResult.halted');
  }

  if (!isRecord(result.context)) {
    errors.push('context must be an object');
  } else if (!isStateMachineEntryState(result.context.currentState)) {
    errors.push('context.currentState must be a valid state machine EntryState');
  } else if (
    result.pipelineResult.stateMachineResult.currentState !== result.context.currentState
  ) {
    errors.push('pipelineResult.stateMachineResult.currentState must match context.currentState');
  }

  if (result.context.scanId !== result.adapterResult.scanId) {
    errors.push('context.scanId must match adapterResult.scanId');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Runs integration harness — adapter, orchestrator, inject currentState.
 *
 * Throws when context validation fails. Does not catch downstream exceptions.
 */
export function buildIntegrationHarnessResult(
  context: IntegrationHarnessContext,
): IntegrationHarnessResult {
  const validation = validateIntegrationHarnessContext(context);
  if (!validation.valid) {
    throw new Error(
      `invalid IntegrationHarnessContext: ${validation.errors.join('; ')}`,
    );
  }

  const resolvedContext = copyHarnessContext(context);
  const scanId = resolvedContext.scanId.trim();
  const currentState = resolvedContext.currentState;

  const adapterResult = buildSignalBoardAdapterResult(toAdapterContext(resolvedContext));

  const pipelineResult = injectCurrentStateIntoPipeline(
    buildPipelineOrchestratorResult({ adapterResult, scanId }),
    currentState,
    scanId,
  );

  const halted = pipelineResult.halted;

  return {
    adapterResult,
    pipelineResult,
    halted,
    message: buildInjectedPipelineMessage(halted, pipelineResult.message),
    context: resolvedContext,
  };
}

/** Namespace for integration discoverability. */
export const IntegrationHarness = {
  buildIntegrationHarnessResult,
  validateIntegrationHarnessContext,
  validateIntegrationHarnessResult,
} as const;

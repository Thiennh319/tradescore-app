/**
 * Position Adviser Adapter — read-only mapping (Task 02.8.1 / frozen 02.8.4).
 *
 * **Purpose:** Map {@link IntegrationHarnessResult} → {@link PositionAdviserInput} summaries.
 * **Does NOT** call Position Adviser, score, recommend, or mutate harness output.
 *
 * @module entryStateManager/positionAdviserAdapter
 */

import { validateIntegrationHarnessResult } from './integrationHarness';
import type { IntegrationHarnessResult } from './integrationHarnessTypes';
import { isRecord, validateRequiredNonEmptyString } from './pipelineValidationUtils';
import type {
  PositionAdviserActionItem,
  PositionAdviserActionSummary,
  PositionAdviserAdapterContext,
  PositionAdviserAdapterContextValidationResult,
  PositionAdviserAdapterResult,
  PositionAdviserAdapterResultValidationResult,
  PositionAdviserDecisionSummary,
  PositionAdviserRuntimeItem,
  PositionAdviserRuntimeSummary,
  PositionAdviserStateSummary,
} from './positionAdviserAdapterTypes';

function mapDecisionSummary(harnessResult: IntegrationHarnessResult): PositionAdviserDecisionSummary {
  const finalDecisionResult = harnessResult.pipelineResult.finalDecisionResult;
  const decisionResult = harnessResult.pipelineResult.decisionResult;
  const finalDecision = finalDecisionResult.finalDecision;

  return {
    finalDecisionPresent: finalDecision !== null,
    triggerKind: finalDecision?.triggerKind ?? null,
    triggerId: finalDecision?.triggerId ?? null,
    priority: finalDecision?.priority ?? null,
    candidateCount: decisionResult.candidateCount,
    decisionCount: finalDecisionResult.decisionCount,
    halted: finalDecisionResult.halted,
  };
}

function mapStateSummary(harnessResult: IntegrationHarnessResult): PositionAdviserStateSummary {
  const stateMachineResult = harnessResult.pipelineResult.stateMachineResult;

  return {
    currentState: stateMachineResult.currentState,
    nextState: stateMachineResult.nextState,
    transitionPerformed: stateMachineResult.transitionPerformed,
    availableTransitionCount: stateMachineResult.availableTransitions.length,
    halted: stateMachineResult.halted,
  };
}

function mapActionSummary(harnessResult: IntegrationHarnessResult): PositionAdviserActionSummary {
  const actionEngineResult = harnessResult.pipelineResult.actionEngineResult;
  const actions: PositionAdviserActionItem[] = actionEngineResult.actions.map((action) => ({
    actionId: action.actionId,
    actionType: action.actionType,
    fromState: action.fromState,
    toState: action.toState,
    reason: action.reason,
  }));

  return {
    actionCount: actionEngineResult.actionCount,
    actions,
    halted: actionEngineResult.halted,
  };
}

function mapRuntimeSummary(harnessResult: IntegrationHarnessResult): PositionAdviserRuntimeSummary {
  const runtimeExecutorResult = harnessResult.pipelineResult.runtimeExecutorResult;
  const executions: PositionAdviserRuntimeItem[] = runtimeExecutorResult.executionPlan.map((item) => ({
    executionId: item.executionId,
    dispatchId: item.dispatchId,
    actionId: item.actionId,
    executionOrder: item.executionOrder,
    executionStatus: item.executionStatus,
  }));

  return {
    executionCount: runtimeExecutorResult.executionCount,
    executions,
    halted: runtimeExecutorResult.halted,
  };
}

function buildAdapterMessage(harnessResult: IntegrationHarnessResult): string {
  if (harnessResult.halted) {
    return `Position adviser adapter mapped (halted) — read-only (Task 02.8.1)`;
  }
  return 'Position adviser adapter mapped — read-only (Task 02.8.1)';
}

/** Validates adapter input — harness required and integrity check. */
export function validatePositionAdviserAdapterContext(
  context: PositionAdviserAdapterContext,
): PositionAdviserAdapterContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.harnessResult === undefined) {
    errors.push('harnessResult is required');
    return { valid: false, errors };
  }

  const harnessValidation = validateIntegrationHarnessResult(context.harnessResult);
  if (!harnessValidation.valid) {
    for (const err of harnessValidation.errors) {
      errors.push(`harnessResult: ${err}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates adapter output — summaries, scanId/timestamp, context passthrough. */
export function validatePositionAdviserAdapterResult(
  result: PositionAdviserAdapterResult,
): PositionAdviserAdapterResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!isRecord(result.decisionSummary)) {
    errors.push('decisionSummary must be an object');
  }
  if (!isRecord(result.stateSummary)) {
    errors.push('stateSummary must be an object');
  }
  if (!isRecord(result.actionSummary)) {
    errors.push('actionSummary must be an object');
  }
  if (!isRecord(result.runtimeSummary)) {
    errors.push('runtimeSummary must be an object');
  }

  validateRequiredNonEmptyString(result.scanId, 'scanId', errors);
  validateRequiredNonEmptyString(result.timestamp, 'timestamp', errors);
  if (typeof result.message !== 'string') {
    errors.push('message must be a string');
  }

  if (!isRecord(result.context)) {
    errors.push('context must be an object');
  } else {
    const harnessScanId = result.context.context?.scanId;
    const harnessTimestamp = result.context.context?.timestamp;
    if (harnessScanId !== result.scanId) {
      errors.push('scanId must match harnessResult.context.scanId');
    }
    if (harnessTimestamp !== result.timestamp) {
      errors.push('timestamp must match harnessResult.context.timestamp');
    }
  }

  if (!Array.isArray(result.actionSummary?.actions)) {
    errors.push('actionSummary.actions must be an array');
  }
  if (!Array.isArray(result.runtimeSummary?.executions)) {
    errors.push('runtimeSummary.executions must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Maps harness pipeline output → Position Adviser input summaries.
 *
 * Field copy only — does not invoke Position Adviser.
 */
export function buildPositionAdviserAdapterResult(
  context: PositionAdviserAdapterContext,
): PositionAdviserAdapterResult {
  const validation = validatePositionAdviserAdapterContext(context);
  if (!validation.valid) {
    throw new Error(
      `invalid PositionAdviserAdapterContext: ${validation.errors.join('; ')}`,
    );
  }

  const harnessResult = context.harnessResult;
  const scanId = harnessResult.context.scanId;
  const timestamp = harnessResult.context.timestamp;

  return {
    decisionSummary: mapDecisionSummary(harnessResult),
    stateSummary: mapStateSummary(harnessResult),
    actionSummary: mapActionSummary(harnessResult),
    runtimeSummary: mapRuntimeSummary(harnessResult),
    scanId,
    timestamp,
    message: buildAdapterMessage(harnessResult),
    context: harnessResult,
  };
}

/** Namespace for discoverability. */
export const PositionAdviserAdapter = {
  buildPositionAdviserAdapterResult,
  validatePositionAdviserAdapterContext,
  validatePositionAdviserAdapterResult,
} as const;

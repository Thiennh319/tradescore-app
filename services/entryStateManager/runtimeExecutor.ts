/**
 * Runtime Executor — scaffold (Task 02.6.6).
 *
 * **Builds** {@link RuntimeExecutionItem} plan from {@link RuntimeDispatcherResult}.
 * **Does NOT** execute, async dispatch, or wire production.
 *
 * @module entryStateManager/runtimeExecutor
 */

import { validateRuntimeDispatcherContext } from './runtimeDispatcher';
import {
  RuntimeDispatchStatus,
  type RuntimeDispatchItem,
  type RuntimeDispatcherContext,
  type RuntimeDispatcherResult,
} from './runtimeDispatcherTypes';
import {
  RuntimeExecutionStatus,
  type RuntimeExecutionItem,
  type RuntimeExecutorContext,
  type RuntimeExecutorContextValidationResult,
  type RuntimeExecutorResult,
  type RuntimeExecutorResultValidationResult,
} from './runtimeExecutorTypes';
import { EntryState } from './stateMachineTypes';
import {
  isRecord,
  validateHaltedCountConsistency,
  validateSequentialOrdersFromOne,
  validateUniqueNumericValues,
  validateUniqueValues,
} from './pipelineValidationUtils';

const RUNTIME_EXECUTION_STATUS_VALUES = new Set<string>(Object.values(RuntimeExecutionStatus));

export function isRuntimeExecutionStatus(value: unknown): value is RuntimeExecutionStatus {
  return typeof value === 'string' && RUNTIME_EXECUTION_STATUS_VALUES.has(value);
}

export function buildExecutionId(executionOrder: number): string {
  return `EXECUTION-${String(executionOrder).padStart(3, '0')}`;
}

function resolveExecutionStatus(dispatchItem: RuntimeDispatchItem): RuntimeExecutionStatus {
  if (dispatchItem.dispatchStatus === RuntimeDispatchStatus.SKIPPED) {
    return RuntimeExecutionStatus.SKIPPED;
  }
  return RuntimeExecutionStatus.READY;
}

function createMissingDispatcherFallback(): RuntimeDispatcherResult {
  const context = {
    actionRuntimeResult: {
      runtimeActions: [],
      actionCount: 0,
      halted: true,
      message: 'Missing runtimeDispatcherResult',
      context: { actionEngineResult: { halted: true, context: {} } },
      actionEngineResult: {
        actions: [],
        actionCount: 0,
        halted: true,
        message: '',
        context: { stateMachineResult: { halted: true, context: {} } },
        stateMachineResult: {
          currentState: EntryState.IDLE,
          availableTransitions: [],
          nextState: null,
          transitionPerformed: false,
          halted: true,
          message: '',
          context: { finalDecisionResult: { halted: true, context: {} } },
        },
      },
    },
  } as RuntimeDispatcherContext;

  return {
    actionRuntimeResult: context.actionRuntimeResult,
    dispatchPlan: [],
    dispatchCount: 0,
    halted: true,
    message: 'Missing runtimeDispatcherResult',
    context,
  };
}

function validateExecutionPlan(executionPlan: readonly RuntimeExecutionItem[], errors: string[]): void {
  const executionIds = executionPlan.map((item) => item.executionId);
  validateUniqueValues(executionIds, 'executionPlan must not contain duplicate executionId', errors);

  const dispatchIds = executionPlan.map((item) => item.dispatchId);
  validateUniqueValues(dispatchIds, 'executionPlan must not contain duplicate dispatchId', errors);

  const orders = executionPlan.map((item) => item.executionOrder);
  validateUniqueNumericValues(orders, 'executionOrder must be unique', errors);
  validateSequentialOrdersFromOne(orders, errors);

  for (const item of executionPlan) {
    if (!isRuntimeExecutionStatus(item.executionStatus)) {
      errors.push(`invalid executionStatus: ${String(item.executionStatus)}`);
    }
    if (typeof item.executionId !== 'string' || item.executionId.length === 0) {
      errors.push('executionId must be a non-empty string');
    }
    if (typeof item.dispatchId !== 'string' || item.dispatchId.length === 0) {
      errors.push('dispatchId must be a non-empty string');
    }
    if (typeof item.actionId !== 'string' || item.actionId.length === 0) {
      errors.push('actionId must be a non-empty string');
    }
    if (!isRecord(item.metadata)) {
      errors.push('metadata must be an object');
    }
  }
}

/**
 * Validates runtime executor context — dispatcher integrity.
 */
export function validateRuntimeExecutorContext(
  context: RuntimeExecutorContext,
): RuntimeExecutorContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.runtimeDispatcherResult === undefined) {
    errors.push('Missing runtimeDispatcherResult');
    return { valid: false, errors };
  }

  const runtimeDispatcherResult = context.runtimeDispatcherResult;

  if (!isRecord(runtimeDispatcherResult)) {
    errors.push('runtimeDispatcherResult must be an object');
    return { valid: false, errors };
  }

  if (typeof runtimeDispatcherResult.halted !== 'boolean') {
    errors.push('runtimeDispatcherResult.halted must be boolean');
  } else if (runtimeDispatcherResult.halted) {
    errors.push('runtimeDispatcherResult is halted');
  }

  if (!isRecord(runtimeDispatcherResult.context)) {
    errors.push('runtimeDispatcherResult.context must be an object');
  } else {
    const dispatcherValidation = validateRuntimeDispatcherContext(runtimeDispatcherResult.context);
    if (!dispatcherValidation.valid) {
      for (const err of dispatcherValidation.errors) {
        errors.push(`runtimeDispatcherResult.context: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates runtime executor result — executionCount, order, status integrity.
 */
export function validateRuntimeExecutorResult(
  result: RuntimeExecutorResult,
): RuntimeExecutorResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!Array.isArray(result.executionPlan)) {
    errors.push('executionPlan must be an array');
    return { valid: false, errors };
  }

  if (result.executionCount !== result.executionPlan.length) {
    errors.push('executionCount must match executionPlan.length');
  }

  validateExecutionPlan(result.executionPlan, errors);
  validateHaltedCountConsistency(result.halted, result.executionCount, 'executionCount', errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Builds execution plan from dispatch items — **does not execute**.
 */
export function buildExecutionPlan(
  runtimeDispatcherResult: RuntimeDispatcherResult,
): readonly RuntimeExecutionItem[] {
  return runtimeDispatcherResult.dispatchPlan.map((dispatchItem) => ({
    executionId: buildExecutionId(dispatchItem.executionOrder),
    dispatchId: dispatchItem.dispatchId,
    actionId: dispatchItem.actionId,
    executionOrder: dispatchItem.executionOrder,
    executionStatus: resolveExecutionStatus(dispatchItem),
    metadata: {
      actionType: dispatchItem.metadata.actionType,
      fromState: dispatchItem.metadata.fromState,
      toState: dispatchItem.metadata.toState,
      reason: dispatchItem.metadata.reason,
      dispatchStatus: dispatchItem.dispatchStatus,
    },
  }));
}

function buildExecutorMessage(
  halted: boolean,
  errors: readonly string[],
  executionCount: number,
): string {
  if (halted && errors.length > 0) {
    return errors.join('; ');
  }
  if (executionCount === 0) {
    return 'No execution items planned — scaffold only (Task 02.6.6)';
  }
  return `Planned ${executionCount} execution item(s) — scaffold only (Task 02.6.6)`;
}

/**
 * Builds runtime executor result — validate, plan, return without execution.
 */
export function buildRuntimeExecutorResult(
  context: RuntimeExecutorContext,
): RuntimeExecutorResult {
  const validation = validateRuntimeExecutorContext(context);
  const runtimeDispatcherResult = context.runtimeDispatcherResult ?? createMissingDispatcherFallback();
  const halted = !validation.valid;
  const executionPlan = validation.valid ? buildExecutionPlan(runtimeDispatcherResult) : [];
  const executionCount = executionPlan.length;

  return {
    runtimeDispatcherResult,
    executionPlan,
    executionCount,
    halted,
    message: buildExecutorMessage(halted, validation.errors, executionCount),
    context,
  };
}

/** Namespace for discoverability. */
export const RuntimeExecutor = {
  buildRuntimeExecutorResult,
  buildExecutionPlan,
  buildExecutionId,
  validateRuntimeExecutorContext,
  validateRuntimeExecutorResult,
  isRuntimeExecutionStatus,
} as const;

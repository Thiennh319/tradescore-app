/**
 * Action Runtime — execution plan builder (Task 02.6.4).
 *
 * **Builds** {@link RuntimeAction} plan from {@link ActionEngineResult}.
 * **Does NOT** execute, dispatch, journal, or wire production.
 *
 * @module entryStateManager/actionRuntime
 */

import { validateActionEngineContext } from './actionEngine';
import { EntryActionType, type ActionEngineResult, type EntryAction } from './actionTypes';
import {
  RuntimeActionStatus,
  type ActionRuntimeContext,
  type ActionRuntimeContextValidationResult,
  type ActionRuntimeResult,
  type ActionRuntimeResultValidationResult,
  type RuntimeAction,
} from './actionRuntimeTypes';
import { EntryState } from './stateMachineTypes';
import {
  isRecord,
  validateHaltedCountConsistency,
  validateSequentialOrdersFromOne,
  validateUniqueNumericValues,
  validateUniqueValues,
} from './pipelineValidationUtils';

const RUNTIME_ACTION_STATUS_VALUES = new Set<string>(Object.values(RuntimeActionStatus));

export function isRuntimeActionStatus(value: unknown): value is RuntimeActionStatus {
  return typeof value === 'string' && RUNTIME_ACTION_STATUS_VALUES.has(value);
}

function resolveRuntimeStatus(action: EntryAction): RuntimeActionStatus {
  if (action.actionType === EntryActionType.NO_ACTION) {
    return RuntimeActionStatus.SKIPPED;
  }
  return RuntimeActionStatus.PENDING;
}

function createMissingActionEngineFallback(): ActionEngineResult {
  const context = {
    stateMachineResult: {
      currentState: EntryState.IDLE,
      availableTransitions: [],
      nextState: null,
      transitionPerformed: false,
      halted: true,
      message: 'Missing actionEngineResult',
      context: {
        finalDecisionResult: {
          decisionResult: {
            conflictResult: {
              priorityResult: {
                aggregateResult: {
                  triggerCount: 0,
                  halted: true,
                  message: '',
                  context: {},
                },
                priorityGroups: [],
                highestPriority: null,
                halted: true,
                message: '',
                context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
              },
              conflictGroups: [],
              conflictCount: 0,
              resolvedConflicts: [],
              resolvedCount: 0,
              unresolvedCount: 0,
              halted: true,
              message: '',
              context: {
                priorityResult: {
                  aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                  priorityGroups: [],
                  highestPriority: null,
                  halted: true,
                  message: '',
                  context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                },
              },
            },
            decisionCandidates: [],
            candidateCount: 0,
            halted: true,
            message: '',
            context: {
              conflictResult: {
                priorityResult: {
                  aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                  priorityGroups: [],
                  highestPriority: null,
                  halted: true,
                  message: '',
                  context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                },
                conflictGroups: [],
                conflictCount: 0,
                resolvedConflicts: [],
                resolvedCount: 0,
                unresolvedCount: 0,
                halted: true,
                message: '',
                context: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                },
              },
            },
          },
          finalDecision: null,
          decisionCount: 0,
          halted: true,
          message: '',
          context: {
            decisionResult: {
              conflictResult: {
                priorityResult: {
                  aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                  priorityGroups: [],
                  highestPriority: null,
                  halted: true,
                  message: '',
                  context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                },
                conflictGroups: [],
                conflictCount: 0,
                resolvedConflicts: [],
                resolvedCount: 0,
                unresolvedCount: 0,
                halted: true,
                message: '',
                context: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                },
              },
              decisionCandidates: [],
              candidateCount: 0,
              halted: true,
              message: '',
              context: {
                conflictResult: {
                  priorityResult: {
                    aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                    priorityGroups: [],
                    highestPriority: null,
                    halted: true,
                    message: '',
                    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                  },
                  conflictGroups: [],
                  conflictCount: 0,
                  resolvedConflicts: [],
                  resolvedCount: 0,
                  unresolvedCount: 0,
                  halted: true,
                  message: '',
                  context: {
                    priorityResult: {
                      aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} },
                      priorityGroups: [],
                      highestPriority: null,
                      halted: true,
                      message: '',
                      context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
                    },
                  },
                },
              },
            },
          },
        },
        currentState: EntryState.IDLE,
      },
    },
  };

  return {
    stateMachineResult: context.stateMachineResult,
    actions: [],
    actionCount: 0,
    halted: true,
    message: 'Missing actionEngineResult',
    context,
  };
}

function validateRuntimeActions(runtimeActions: readonly RuntimeAction[], errors: string[]): void {
  const actionIds = runtimeActions.map((action) => action.actionId);
  validateUniqueValues(actionIds, 'runtimeActions must not contain duplicate actionId', errors);

  const orders = runtimeActions.map((action) => action.executionOrder);
  validateUniqueNumericValues(orders, 'executionOrder must be unique', errors);
  validateSequentialOrdersFromOne(orders, errors);

  for (const action of runtimeActions) {
    if (!isRuntimeActionStatus(action.status)) {
      errors.push(`invalid status: ${String(action.status)}`);
    }
    if (typeof action.actionId !== 'string' || action.actionId.length === 0) {
      errors.push('actionId must be a non-empty string');
    }
    if (!isRecord(action.metadata)) {
      errors.push('metadata must be an object');
    }
  }
}

/**
 * Validates action runtime context — action engine integrity.
 */
export function validateActionRuntimeContext(
  context: ActionRuntimeContext,
): ActionRuntimeContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.actionEngineResult === undefined) {
    errors.push('Missing actionEngineResult');
    return { valid: false, errors };
  }

  const actionEngineResult = context.actionEngineResult;

  if (!isRecord(actionEngineResult)) {
    errors.push('actionEngineResult must be an object');
    return { valid: false, errors };
  }

  if (typeof actionEngineResult.halted !== 'boolean') {
    errors.push('actionEngineResult.halted must be boolean');
  } else if (actionEngineResult.halted) {
    errors.push('actionEngineResult is halted');
  }

  if (!isRecord(actionEngineResult.context)) {
    errors.push('actionEngineResult.context must be an object');
  } else {
    const engineValidation = validateActionEngineContext(actionEngineResult.context);
    if (!engineValidation.valid) {
      for (const err of engineValidation.errors) {
        errors.push(`actionEngineResult.context: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates action runtime result — actionCount, execution order, status integrity.
 */
export function validateActionRuntimeResult(
  result: ActionRuntimeResult,
): ActionRuntimeResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!Array.isArray(result.runtimeActions)) {
    errors.push('runtimeActions must be an array');
    return { valid: false, errors };
  }

  if (result.actionCount !== result.runtimeActions.length) {
    errors.push('actionCount must match runtimeActions.length');
  }

  validateRuntimeActions(result.runtimeActions, errors);
  validateHaltedCountConsistency(result.halted, result.actionCount, 'actionCount', errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Builds runtime action plan from entry actions — **does not execute**.
 */
export function buildRuntimeActions(
  actionEngineResult: ActionEngineResult,
): readonly RuntimeAction[] {
  return actionEngineResult.actions.map((action, index) => ({
    actionId: action.actionId,
    actionType: action.actionType,
    executionOrder: index + 1,
    status: resolveRuntimeStatus(action),
    metadata: {
      fromState: action.fromState,
      toState: action.toState,
      reason: action.reason,
    },
  }));
}

function buildRuntimeMessage(
  halted: boolean,
  errors: readonly string[],
  actionCount: number,
): string {
  if (halted && errors.length > 0) {
    return errors.join('; ');
  }
  if (actionCount === 0) {
    return 'No runtime actions planned — plan only (Task 02.6.4)';
  }
  return `Planned ${actionCount} runtime action(s) — plan only (Task 02.6.4)`;
}

/**
 * Builds action runtime result — validate, plan, return without execution.
 */
export function buildActionRuntimeResult(context: ActionRuntimeContext): ActionRuntimeResult {
  const validation = validateActionRuntimeContext(context);
  const actionEngineResult = context.actionEngineResult ?? createMissingActionEngineFallback();
  const halted = !validation.valid;
  const runtimeActions = validation.valid ? buildRuntimeActions(actionEngineResult) : [];
  const actionCount = runtimeActions.length;

  return {
    actionEngineResult,
    runtimeActions,
    actionCount,
    halted,
    message: buildRuntimeMessage(halted, validation.errors, actionCount),
    context,
  };
}

/** Namespace for discoverability. */
export const ActionRuntime = {
  buildActionRuntimeResult,
  buildRuntimeActions,
  validateActionRuntimeContext,
  validateActionRuntimeResult,
  isRuntimeActionStatus,
} as const;

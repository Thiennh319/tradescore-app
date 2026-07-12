/**
 * Entry / Exit Actions — scaffold engine (Task 02.6.3 + Fix 02.6.3).
 *
 * **Collects** {@link EntryAction} placeholders via {@link ACTION_POLICY}.
 * **Does NOT** execute, dispatch, journal, or wire production.
 *
 * @module entryStateManager/actionEngine
 */

import { ACTION_POLICY } from './actionPolicy';
import {
  EntryActionType,
  type ActionEngineContext,
  type ActionEngineContextValidationResult,
  type ActionEngineResult,
  type ActionEngineResultValidationResult,
  type EntryAction,
} from './actionTypes';
import { validateEntryStateMachineContext } from './stateMachine';
import { EntryState, type EntryStateMachineResult } from './stateMachineTypes';
import { getPolicyTransitionReason } from './transitionPolicy';

const ENTRY_ACTION_TYPE_VALUES = new Set<string>(Object.values(EntryActionType));

import {
  isRecord,
  validateHaltedCountConsistency,
  validateSequentialOrdersFromOne,
  validateUniqueValues,
} from './pipelineValidationUtils';

export function isEntryActionType(value: unknown): value is EntryActionType {
  return typeof value === 'string' && ENTRY_ACTION_TYPE_VALUES.has(value);
}

/** @deprecated Use {@link ACTION_POLICY.buildActionId} — delegates for backward compatibility. */
export function buildActionId(fromState: EntryState, toState: EntryState): string | null {
  return ACTION_POLICY.buildActionId(fromState, toState);
}

function resolveActionReason(
  stateMachineResult: EntryStateMachineResult,
  fromState: EntryState,
  toState: EntryState,
): string {
  const matched = stateMachineResult.availableTransitions.find(
    (transition) => transition.fromState === fromState && transition.toState === toState,
  );
  if (matched) {
    return matched.reason;
  }
  return getPolicyTransitionReason(fromState, toState) ?? `Action placeholder for ${fromState} → ${toState}`;
}

function createMissingStateMachineFallback(): EntryStateMachineResult {
  const context = {
    finalDecisionResult: {
      decisionResult: {
        conflictResult: {
          priorityResult: {
            aggregateResult: {
              triggerCount: 0,
              halted: true,
              message: 'Missing stateMachineResult',
              context: {},
            },
            priorityGroups: [],
            highestPriority: null,
            halted: true,
            message: 'Missing stateMachineResult',
            context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
          },
          conflictGroups: [],
          conflictCount: 0,
          resolvedConflicts: [],
          resolvedCount: 0,
          unresolvedCount: 0,
          halted: true,
          message: 'Missing stateMachineResult',
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
        message: 'Missing stateMachineResult',
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
      message: 'Missing stateMachineResult',
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
  };

  return {
    currentState: EntryState.IDLE,
    availableTransitions: [],
    nextState: null,
    transitionPerformed: false,
    halted: true,
    message: 'Missing stateMachineResult',
    context,
  };
}

function validateActionPolicyMetadata(action: EntryAction, errors: string[]): void {
  const metadata = ACTION_POLICY.getActionMetadata(action.fromState, action.toState);
  if (!metadata) {
    errors.push(`unsupported transition for policy validation: ${action.fromState} → ${action.toState}`);
    return;
  }

  if (action.actionId !== metadata.actionId) {
    errors.push(`actionId mismatch for ${action.fromState} → ${action.toState}`);
  }

  if (action.actionType !== metadata.actionType) {
    errors.push(`actionType mismatch for ${action.fromState} → ${action.toState}`);
  }

  if (action.fromState !== metadata.fromState || action.toState !== metadata.toState) {
    errors.push(`fromState/toState mismatch for policy metadata`);
  }
}

function validateActions(actions: readonly EntryAction[], errors: string[]): void {
  const actionIds = actions.map((action) => action.actionId);
  validateUniqueValues(actionIds, 'actions must not contain duplicate actionId', errors);

  for (const action of actions) {
    if (!isEntryActionType(action.actionType)) {
      errors.push(`invalid actionType: ${String(action.actionType)}`);
    }
    if (typeof action.actionId !== 'string' || action.actionId.length === 0) {
      errors.push('actionId must be a non-empty string');
    }
    if (typeof action.reason !== 'string' || action.reason.length === 0) {
      errors.push('reason must be a non-empty string');
    }
    if (!Object.values(EntryState).includes(action.fromState)) {
      errors.push(`invalid fromState: ${String(action.fromState)}`);
    }
    if (!Object.values(EntryState).includes(action.toState)) {
      errors.push(`invalid toState: ${String(action.toState)}`);
    }
    validateActionPolicyMetadata(action, errors);
  }
}

/**
 * Validates action engine context — state machine integrity.
 */
export function validateActionEngineContext(
  context: ActionEngineContext,
): ActionEngineContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.stateMachineResult === undefined) {
    errors.push('Missing stateMachineResult');
    return { valid: false, errors };
  }

  const stateMachineResult = context.stateMachineResult;

  if (!isRecord(stateMachineResult)) {
    errors.push('stateMachineResult must be an object');
    return { valid: false, errors };
  }

  if (typeof stateMachineResult.halted !== 'boolean') {
    errors.push('stateMachineResult.halted must be boolean');
  } else if (stateMachineResult.halted) {
    errors.push('stateMachineResult is halted');
  }

  if (!isRecord(stateMachineResult.context)) {
    errors.push('stateMachineResult.context must be an object');
  } else {
    const stateValidation = validateEntryStateMachineContext(stateMachineResult.context);
    if (!stateValidation.valid) {
      for (const err of stateValidation.errors) {
        errors.push(`stateMachineResult.context: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates action engine result — actionCount, policy metadata, halted consistency.
 */
export function validateActionEngineResult(
  result: ActionEngineResult,
): ActionEngineResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!Array.isArray(result.actions)) {
    errors.push('actions must be an array');
    return { valid: false, errors };
  }

  if (result.actionCount !== result.actions.length) {
    errors.push('actionCount must match actions.length');
  }

  validateActions(result.actions, errors);
  validateHaltedCountConsistency(result.halted, result.actionCount, 'actionCount', errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Collects action placeholders from resolved state machine transition via policy.
 */
export function collectActions(stateMachineResult: EntryStateMachineResult): readonly EntryAction[] {
  if (
    stateMachineResult.halted ||
    !stateMachineResult.transitionPerformed ||
    stateMachineResult.nextState === null
  ) {
    return [];
  }

  const fromState = stateMachineResult.currentState;
  const toState = stateMachineResult.nextState;
  const metadata = ACTION_POLICY.getActionMetadata(fromState, toState);

  if (metadata === null) {
    return [];
  }

  const actionId = ACTION_POLICY.buildActionId(fromState, toState);
  if (actionId === null) {
    return [];
  }

  return [
    {
      actionId,
      actionType: metadata.actionType,
      fromState: metadata.fromState,
      toState: metadata.toState,
      reason: resolveActionReason(stateMachineResult, fromState, toState),
    },
  ];
}

function buildActionMessage(
  halted: boolean,
  errors: readonly string[],
  actionCount: number,
): string {
  if (halted && errors.length > 0) {
    return errors.join('; ');
  }
  if (actionCount === 0) {
    return 'No actions collected — scaffold only (Task 02.6.3)';
  }
  return `Collected ${actionCount} action placeholder(s) — scaffold only (Task 02.6.3)`;
}

/**
 * Builds action engine scaffold result — validate, collect, return without execution.
 */
export function buildActionEngineResult(context: ActionEngineContext): ActionEngineResult {
  const validation = validateActionEngineContext(context);
  const stateMachineResult = context.stateMachineResult ?? createMissingStateMachineFallback();
  const halted = !validation.valid;
  const actions = validation.valid ? collectActions(stateMachineResult) : [];
  const actionCount = actions.length;

  return {
    stateMachineResult,
    actions,
    actionCount,
    halted,
    message: buildActionMessage(halted, validation.errors, actionCount),
    context,
  };
}

/** Namespace for discoverability. */
export const ActionEngine = {
  buildActionEngineResult,
  collectActions,
  validateActionEngineContext,
  validateActionEngineResult,
  buildActionId,
  isEntryActionType,
} as const;

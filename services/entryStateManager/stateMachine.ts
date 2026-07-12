/**
 * Entry State Machine — transition runtime (Task 02.6.1 scaffold + 02.6.2 runtime).
 *
 * **Builds** {@link AvailableTransition} and resolves {@link EntryStateMachineResult#nextState}.
 * **Does NOT** mutate currentState, run actions, or wire production.
 *
 * @module entryStateManager/stateMachine
 */

import { validateFinalDecisionContext } from './finalDecisionEngine';
import type { FinalDecisionResult } from './finalDecisionTypes';
import {
  EntryState,
  type AvailableTransition,
  type EntryStateMachineContext,
  type EntryStateMachineContextValidationResult,
  type EntryStateMachineResult,
  type EntryStateMachineResultValidationResult,
} from './stateMachineTypes';
import { TRANSITION_POLICY, getPolicyTransitionReason, listPolicyTransitionTargets } from './transitionPolicy';
import { isRecord } from './pipelineValidationUtils';

const ENTRY_STATE_VALUES = new Set<string>(Object.values(EntryState));

export function isStateMachineEntryState(value: unknown): value is EntryState {
  return typeof value === 'string' && ENTRY_STATE_VALUES.has(value);
}

function transitionKey(transition: AvailableTransition): string {
  return `${transition.fromState}->${transition.toState}`;
}

function validateAvailableTransitions(
  transitions: readonly AvailableTransition[],
  errors: string[],
): void {
  const keys = transitions.map(transitionKey);
  if (keys.length !== new Set(keys).size) {
    errors.push('availableTransitions must not contain duplicate fromState/toState pairs');
  }

  for (const transition of transitions) {
    if (!isStateMachineEntryState(transition.fromState)) {
      errors.push(`invalid fromState: ${String(transition.fromState)}`);
    }
    if (!isStateMachineEntryState(transition.toState)) {
      errors.push(`invalid toState: ${String(transition.toState)}`);
    }
    if (typeof transition.reason !== 'string' || transition.reason.length === 0) {
      errors.push('transition reason must be a non-empty string');
    }
  }
}

function validateHaltedConsistency(
  halted: boolean,
  currentState: EntryState,
  contextState: EntryState,
  errors: string[],
): void {
  if (currentState !== contextState) {
    errors.push('currentState must match context.currentState — runtime does not mutate state');
  }

  if (!halted && !isStateMachineEntryState(currentState)) {
    errors.push('currentState must be a valid EntryState when not halted');
  }
}

function validateTransitionOutcome(
  transitionPerformed: boolean,
  nextState: EntryState | null,
  errors: string[],
): void {
  if (typeof transitionPerformed !== 'boolean') {
    errors.push('transitionPerformed must be boolean');
  }

  if (nextState !== null && !isStateMachineEntryState(nextState)) {
    errors.push(`nextState is not a valid EntryState: ${String(nextState)}`);
  }

  if (transitionPerformed && nextState === null) {
    errors.push('transitionPerformed requires nextState');
  }

  if (!transitionPerformed && nextState !== null) {
    errors.push('nextState must be null when transitionPerformed is false');
  }
}

function createMissingFinalDecisionFallback(): FinalDecisionResult {
  return {
    decisionResult: {
      conflictResult: {
        priorityResult: {
          aggregateResult: {
            triggerCount: 0,
            halted: true,
            message: 'Missing finalDecisionResult',
            context: {},
          },
          priorityGroups: [],
          highestPriority: null,
          halted: true,
          message: 'Missing finalDecisionResult',
          context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
        },
        conflictGroups: [],
        conflictCount: 0,
        resolvedConflicts: [],
        resolvedCount: 0,
        unresolvedCount: 0,
        halted: true,
        message: 'Missing finalDecisionResult',
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
      message: 'Missing finalDecisionResult',
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
    message: 'Missing finalDecisionResult',
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
  };
}

/**
 * Validates state machine context — final decision integrity and state enum.
 */
export function validateEntryStateMachineContext(
  context: EntryStateMachineContext,
): EntryStateMachineContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (!isStateMachineEntryState(context.currentState)) {
    errors.push(`currentState is not a valid EntryState: ${String(context.currentState)}`);
  }

  if (context.finalDecisionResult === undefined) {
    errors.push('Missing finalDecisionResult');
    return { valid: false, errors };
  }

  const finalDecisionResult = context.finalDecisionResult;

  if (!isRecord(finalDecisionResult)) {
    errors.push('finalDecisionResult must be an object');
    return { valid: false, errors };
  }

  if (typeof finalDecisionResult.halted !== 'boolean') {
    errors.push('finalDecisionResult.halted must be boolean');
  } else if (finalDecisionResult.halted) {
    errors.push('finalDecisionResult is halted');
  }

  if (!isRecord(finalDecisionResult.context)) {
    errors.push('finalDecisionResult.context must be an object');
  } else {
    const finalValidation = validateFinalDecisionContext({
      decisionResult: finalDecisionResult.decisionResult,
      scanId: context.scanId,
    });
    if (!finalValidation.valid) {
      for (const err of finalValidation.errors) {
        errors.push(`finalDecisionResult: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates state machine result — transitions, transition outcome, halted consistency.
 */
export function validateEntryStateMachineResult(
  result: EntryStateMachineResult,
): EntryStateMachineResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (!isStateMachineEntryState(result.currentState)) {
    errors.push(`currentState is not a valid EntryState: ${String(result.currentState)}`);
  }

  if (!Array.isArray(result.availableTransitions)) {
    errors.push('availableTransitions must be an array');
    return { valid: false, errors };
  }

  validateAvailableTransitions(result.availableTransitions, errors);
  validateHaltedConsistency(
    result.halted,
    result.currentState,
    result.context.currentState,
    errors,
  );
  validateTransitionOutcome(result.transitionPerformed, result.nextState, errors);

  if (result.halted && result.availableTransitions.length > 0) {
    errors.push('halted result must have empty availableTransitions');
  }

  if (result.halted && result.transitionPerformed) {
    errors.push('halted result cannot perform transition');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds available transition descriptors from policy graph — **does not execute**.
 */
export function buildAvailableTransitions(
  currentState: EntryState,
): readonly AvailableTransition[] {
  return listPolicyTransitionTargets(currentState).map((edge) => ({
    fromState: currentState,
    toState: edge.toState,
    reason: edge.reason,
  }));
}

export interface ResolvedNextState {
  nextState: EntryState | null;
  transitionPerformed: boolean;
}

/**
 * Resolves proposed next state from policy — **does not mutate currentState**.
 */
export function resolveNextState(
  currentState: EntryState,
  availableTransitions: readonly AvailableTransition[],
  finalDecisionResult: FinalDecisionResult,
): ResolvedNextState {
  for (const transition of availableTransitions) {
    if (
      transition.fromState === currentState &&
      TRANSITION_POLICY.canTransition(currentState, transition.toState, finalDecisionResult)
    ) {
      return {
        nextState: transition.toState,
        transitionPerformed: true,
      };
    }
  }

  return {
    nextState: null,
    transitionPerformed: false,
  };
}

function buildRuntimeMessageFixed(
  halted: boolean,
  errors: readonly string[],
  currentState: EntryState,
  transitionPerformed: boolean,
  nextState: EntryState | null,
): string {
  if (halted && errors.length > 0) {
    return errors.join('; ');
  }
  if (transitionPerformed && nextState !== null) {
    const reason = getPolicyTransitionReason(currentState, nextState);
    return reason
      ? `Transition resolved: ${currentState} → ${nextState} (${reason})`
      : `Transition resolved: ${currentState} → ${nextState}`;
  }
  return 'No valid transition resolved — runtime only (Task 02.6.2)';
}

/**
 * Builds state machine result — validate, list transitions, resolve next state.
 */
export function buildEntryStateMachineResult(
  context: EntryStateMachineContext,
): EntryStateMachineResult {
  const validation = validateEntryStateMachineContext(context);
  const finalDecisionResult = context.finalDecisionResult ?? createMissingFinalDecisionFallback();
  const currentState = isStateMachineEntryState(context.currentState)
    ? context.currentState
    : EntryState.IDLE;
  const halted = !validation.valid;
  const resolvedContext: EntryStateMachineContext = {
    ...context,
    finalDecisionResult,
    currentState,
  };

  if (halted) {
    return {
      currentState,
      availableTransitions: [],
      nextState: null,
      transitionPerformed: false,
      halted: true,
      message: buildRuntimeMessageFixed(true, validation.errors, currentState, false, null),
      context: resolvedContext,
    };
  }

  const availableTransitions = buildAvailableTransitions(currentState);
  const { nextState, transitionPerformed } = resolveNextState(
    currentState,
    availableTransitions,
    finalDecisionResult,
  );

  return {
    currentState,
    availableTransitions,
    nextState,
    transitionPerformed,
    halted: false,
    message: buildRuntimeMessageFixed(
      false,
      [],
      currentState,
      transitionPerformed,
      nextState,
    ),
    context: resolvedContext,
  };
}

/** Namespace for discoverability. */
export const EntryStateMachine = {
  buildEntryStateMachineResult,
  buildAvailableTransitions,
  resolveNextState,
  validateEntryStateMachineContext,
  validateEntryStateMachineResult,
  isStateMachineEntryState,
} as const;

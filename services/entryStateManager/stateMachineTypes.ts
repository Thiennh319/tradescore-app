/**
 * Entry State Machine — type models (Task 02.6.1).
 *
 * **Purpose:** Scaffold context/result for state machine layer.
 *
 * **MUST NOT:** Execute transitions, mutate state, or wire production.
 *
 * @module entryStateManager/stateMachineTypes
 */

import type { FinalDecisionResult } from './finalDecisionTypes';

/**
 * Full lifecycle entry states — State Machine layer only (Task 02.6.1).
 *
 * **Do not extend** without RuleBook approval.
 */
export enum EntryState {
  IDLE = 'IDLE',
  WATCH = 'WATCH',
  READY = 'READY',
  BLOCKED = 'BLOCKED',
  LOCKED = 'LOCKED',
  ENTRY = 'ENTRY',
  ACTIVE = 'ACTIVE',
  EXIT = 'EXIT',
}

/** Describes a possible transition — metadata only, not executed. */
export interface AvailableTransition {
  fromState: EntryState;
  toState: EntryState;
  reason: string;
}

/**
 * Input for state machine scaffold — read-only {@link FinalDecisionResult}.
 */
export interface EntryStateMachineContext {
  finalDecisionResult: FinalDecisionResult;
  currentState: EntryState;
  scanId?: string;
}

/**
 * State machine runtime output — available transitions and proposed next state.
 */
export interface EntryStateMachineResult {
  currentState: EntryState;
  availableTransitions: readonly AvailableTransition[];
  nextState: EntryState | null;
  transitionPerformed: boolean;
  halted: boolean;
  message: string;
  context: EntryStateMachineContext;
}

/** Context validation result. */
export interface EntryStateMachineContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result. */
export interface EntryStateMachineResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

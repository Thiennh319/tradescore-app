/**
 * Entry / Exit Actions — type models (Task 02.6.3).
 *
 * **Purpose:** Action metadata scaffold from {@link EntryStateMachineResult}.
 *
 * **MUST NOT:** Execute actions, dispatch events, or wire production.
 *
 * @module entryStateManager/actionTypes
 */

import type { EntryStateMachineResult } from './stateMachineTypes';
import type { EntryState } from './stateMachineTypes';

/** Scaffold action types — metadata only, no execution (Task 02.6.3). */
export enum EntryActionType {
  NO_ACTION = 'NO_ACTION',
  PREPARE_ENTRY = 'PREPARE_ENTRY',
  CONFIRM_ENTRY = 'CONFIRM_ENTRY',
  OPEN_POSITION = 'OPEN_POSITION',
  MONITOR_POSITION = 'MONITOR_POSITION',
  PREPARE_EXIT = 'PREPARE_EXIT',
  CLOSE_POSITION = 'CLOSE_POSITION',
  RESET_STATE = 'RESET_STATE',
}

/** Policy metadata for a supported transition→action mapping (Fix 02.6.3). */
export interface ActionPolicyMetadata {
  actionId: string;
  actionType: EntryActionType;
  fromState: EntryState;
  toState: EntryState;
}

/** One action placeholder — describes work to perform in future runtime. */
export interface EntryAction {
  actionId: string;
  actionType: EntryActionType;
  fromState: EntryState;
  toState: EntryState;
  reason: string;
}

/** Input for action engine — read-only {@link EntryStateMachineResult}. */
export interface ActionEngineContext {
  stateMachineResult: EntryStateMachineResult;
  scanId?: string;
}

/** Action engine scaffold output — collected actions only, no execution. */
export interface ActionEngineResult {
  stateMachineResult: EntryStateMachineResult;
  actions: readonly EntryAction[];
  actionCount: number;
  halted: boolean;
  message: string;
  context: ActionEngineContext;
}

/** Context validation result. */
export interface ActionEngineContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result. */
export interface ActionEngineResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/**
 * Action Runtime — type models (Task 02.6.4).
 *
 * **Purpose:** Runtime execution plan metadata from {@link ActionEngineResult}.
 *
 * **MUST NOT:** Execute actions, dispatch events, or wire production.
 *
 * @module entryStateManager/actionRuntimeTypes
 */

import type { EntryActionType } from './actionTypes';
import type { ActionEngineResult } from './actionTypes';
import type { EntryState } from './stateMachineTypes';

/** Runtime action status — plan only, no execution outcomes (Task 02.6.4). */
export enum RuntimeActionStatus {
  PENDING = 'PENDING',
  SKIPPED = 'SKIPPED',
}

/** Metadata carried into runtime plan — no side effects. */
export interface RuntimeActionMetadata {
  fromState: EntryState;
  toState: EntryState;
  reason: string;
}

/** One planned runtime action — metadata only, not executed. */
export interface RuntimeAction {
  actionId: string;
  actionType: EntryActionType;
  executionOrder: number;
  status: RuntimeActionStatus;
  metadata: RuntimeActionMetadata;
}

/** Input for action runtime — read-only {@link ActionEngineResult}. */
export interface ActionRuntimeContext {
  actionEngineResult: ActionEngineResult;
  scanId?: string;
}

/** Action runtime output — execution plan only. */
export interface ActionRuntimeResult {
  actionEngineResult: ActionEngineResult;
  runtimeActions: readonly RuntimeAction[];
  actionCount: number;
  halted: boolean;
  message: string;
  context: ActionRuntimeContext;
}

/** Context validation result. */
export interface ActionRuntimeContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result. */
export interface ActionRuntimeResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

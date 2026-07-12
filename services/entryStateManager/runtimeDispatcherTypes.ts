/**
 * Runtime Dispatcher — type models (Task 02.6.5).
 *
 * **Purpose:** Dispatch plan metadata from {@link ActionRuntimeResult}.
 *
 * **MUST NOT:** Execute actions, dispatch production, or wire side effects.
 *
 * @module entryStateManager/runtimeDispatcherTypes
 */

import type { EntryActionType } from './actionTypes';
import type { ActionRuntimeResult } from './actionRuntimeTypes';
import type { EntryState } from './stateMachineTypes';

/** Dispatch queue status — plan only, no execution outcomes (Task 02.6.5). */
export enum RuntimeDispatchStatus {
  QUEUED = 'QUEUED',
  SKIPPED = 'SKIPPED',
}

/** Metadata carried into dispatch plan — no side effects. */
export interface RuntimeDispatchMetadata {
  actionType: EntryActionType;
  fromState: EntryState;
  toState: EntryState;
  reason: string;
}

/** One planned dispatch item — metadata only, not executed. */
export interface RuntimeDispatchItem {
  dispatchId: string;
  actionId: string;
  executionOrder: number;
  dispatchStatus: RuntimeDispatchStatus;
  metadata: RuntimeDispatchMetadata;
}

/** Input for runtime dispatcher — read-only {@link ActionRuntimeResult}. */
export interface RuntimeDispatcherContext {
  actionRuntimeResult: ActionRuntimeResult;
  scanId?: string;
}

/** Runtime dispatcher output — dispatch plan only. */
export interface RuntimeDispatcherResult {
  actionRuntimeResult: ActionRuntimeResult;
  dispatchPlan: readonly RuntimeDispatchItem[];
  dispatchCount: number;
  halted: boolean;
  message: string;
  context: RuntimeDispatcherContext;
}

/** Context validation result. */
export interface RuntimeDispatcherContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result. */
export interface RuntimeDispatcherResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

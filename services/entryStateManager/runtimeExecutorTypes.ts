/**
 * Runtime Executor — type models (Task 02.6.6).
 *
 * **Purpose:** Execution plan metadata from {@link RuntimeDispatcherResult}.
 *
 * **MUST NOT:** Execute dispatch items or wire production.
 *
 * @module entryStateManager/runtimeExecutorTypes
 */

import type { EntryActionType } from './actionTypes';
import type { RuntimeDispatchStatus } from './runtimeDispatcherTypes';
import type { RuntimeDispatcherResult } from './runtimeDispatcherTypes';
import type { EntryState } from './stateMachineTypes';

/** Execution readiness status — plan only, no outcomes (Task 02.6.6). */
export enum RuntimeExecutionStatus {
  READY = 'READY',
  SKIPPED = 'SKIPPED',
}

/** Metadata carried into execution plan — no side effects. */
export interface RuntimeExecutionMetadata {
  actionType: EntryActionType;
  fromState: EntryState;
  toState: EntryState;
  reason: string;
  dispatchStatus: RuntimeDispatchStatus;
}

/** One planned execution item — metadata only, not executed. */
export interface RuntimeExecutionItem {
  executionId: string;
  dispatchId: string;
  actionId: string;
  executionOrder: number;
  executionStatus: RuntimeExecutionStatus;
  metadata: RuntimeExecutionMetadata;
}

/** Input for runtime executor — read-only {@link RuntimeDispatcherResult}. */
export interface RuntimeExecutorContext {
  runtimeDispatcherResult: RuntimeDispatcherResult;
  scanId?: string;
}

/** Runtime executor output — execution plan only. */
export interface RuntimeExecutorResult {
  runtimeDispatcherResult: RuntimeDispatcherResult;
  executionPlan: readonly RuntimeExecutionItem[];
  executionCount: number;
  halted: boolean;
  message: string;
  context: RuntimeExecutorContext;
}

/** Context validation result. */
export interface RuntimeExecutorContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result. */
export interface RuntimeExecutorResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

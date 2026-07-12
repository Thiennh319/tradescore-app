/**
 * Entry State Validator — result models (Task 02.3.1).
 *
 * **Purpose:** Standardized read-only validation responses.
 * **Do not use in:** Throwing exceptions or mutating state.
 *
 * @module entryStateManager/validationResult
 */

import type { EntryState } from './enums';
import type { EsmErrorCode } from './errorCodes';
import type { TransitionCategory } from './transitionMetadata';
import type { EntryTransitionDefinition, EntryTransitionId } from './transitionTypes';
import type { EntryStateDefinition } from './entryStateMetadata';

/**
 * Normalized validation output — always returned, never thrown.
 *
 * Validator **must not** modify application state or trigger transitions.
 */
export interface EntryStateValidationResult {
  /** Whether the checked item passed validation. */
  valid: boolean;
  /** {@link EsmErrorCode} when `valid === false`; otherwise `null`. */
  errorCode: EsmErrorCode | null;
  /** Human-readable summary for audit / logs. */
  message: string;
  /** RuleBook or Business Workflow reference when applicable. */
  ruleReference: string | null;
  /** Transition ID when validating a transition; otherwise `null`. */
  transitionId: EntryTransitionId | null;
  /** Category from transition metadata when applicable. */
  transitionCategory: TransitionCategory | null;
  /** Populated when validating an {@link EntryState}. */
  state?: EntryState;
  /** State metadata when `validateEntryState` succeeds. */
  stateDefinition?: EntryStateDefinition;
  /** Full transition row when `validateTransition` resolves a matrix entry. */
  transitionDefinition?: EntryTransitionDefinition;
}

/** Successful validation — helper for consistent shape. */
export function validationSuccess(
  partial: Omit<EntryStateValidationResult, 'valid' | 'errorCode'> & {
    message: string;
  },
): EntryStateValidationResult {
  return {
    valid: true,
    errorCode: null,
    ruleReference: partial.ruleReference ?? null,
    transitionId: partial.transitionId ?? null,
    transitionCategory: partial.transitionCategory ?? null,
    message: partial.message,
    state: partial.state,
    stateDefinition: partial.stateDefinition,
    transitionDefinition: partial.transitionDefinition,
  };
}

/** Failed validation — helper; never throws. */
export function validationFailure(
  errorCode: EsmErrorCode,
  message: string,
  partial: Partial<EntryStateValidationResult> = {},
): EntryStateValidationResult {
  return {
    valid: false,
    errorCode,
    message,
    ruleReference: partial.ruleReference ?? null,
    transitionId: partial.transitionId ?? null,
    transitionCategory: partial.transitionCategory ?? null,
    state: partial.state,
    stateDefinition: partial.stateDefinition,
    transitionDefinition: partial.transitionDefinition,
  };
}

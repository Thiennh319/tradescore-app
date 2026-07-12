/**
 * Entry State Mapping — type contracts (Task 02.9.0).
 *
 * **Purpose:** SSOT types for mapping Production FinalEntryStatus ↔ RuleBook ↔ StateMachine.
 * **Do not use in:** Direct enum comparison outside {@link EntryStateMapping}.
 *
 * @module entryStateManager/entryStateMappingTypes
 */

import type { FinalEntryStatus } from '../../types/scoring';
import type { EntryState as RuleBookEntryState } from './enums';
import type { EntryState as StateMachineEntryState } from './stateMachineTypes';

/** Stable error code for mapping failures. */
export enum EntryStateMappingErrorCode {
  UNKNOWN_FINAL_ENTRY_STATUS = 'ESM_MAP_001',
  UNKNOWN_RULEBOOK_ENTRY_STATE = 'ESM_MAP_002',
  UNKNOWN_STATE_MACHINE_ENTRY_STATE = 'ESM_MAP_003',
  NOT_YET_MAPPED = 'ESM_MAP_004',
  VALIDATION_FAILED = 'ESM_MAP_005',
}

/** Documented reason when a value cannot be mapped without additional context. */
export interface EntryStateNotYetMappedReason {
  readonly sourceLayer: 'FinalEntryStatus' | 'RuleBookEntryState' | 'StateMachineEntryState';
  readonly sourceValue: string;
  readonly targetLayer: 'FinalEntryStatus' | 'RuleBookEntryState' | 'StateMachineEntryState';
  readonly reason: string;
}

/** One documented forward mapping row. */
export interface EntryStateMappingRow<
  TSource extends string = string,
  TTarget extends string = string,
> {
  readonly source: TSource;
  readonly target: TTarget;
  readonly evidence: string;
}

/** Result of {@link validateEntryStateMapping}. */
export interface EntryStateMappingValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Canonical FinalEntryStatus → RuleBook map keys. */
export type MappedFinalEntryStatus = FinalEntryStatus;

/** Canonical RuleBook → StateMachine map keys. */
export type MappedRuleBookEntryState = RuleBookEntryState;

/** StateMachine values with a defined RuleBook reverse mapping. */
export type MappedStateMachineEntryState = Extract<
  StateMachineEntryState,
  RuleBookEntryState
>;

export type { FinalEntryStatus, RuleBookEntryState, StateMachineEntryState };

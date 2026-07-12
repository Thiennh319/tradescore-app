/**
 * Entry State Mapping Bridge — SSOT (Task 02.9.0 / frozen 02.9.0).
 *
 * **Purpose:** Sole official mapping layer between Production FinalEntryStatus,
 * RuleBook EntryState (4-state), and StateMachine EntryState (8-state).
 *
 * **MUST NOT** be bypassed by UI Integration — no direct enum comparison elsewhere.
 *
 * Pure, deterministic, synchronous, read-only. No side effects. No production wiring.
 *
 * @module entryStateManager/entryStateMapping
 * @see entryStateMetadata.ts — documented FinalEntryStatus ↔ RuleBook semantics
 * @see finalEntryStatus.ts — production FinalEntryStatus computation
 */

import { FinalEntryStatus } from '../../types/scoring';
import { ENTRY_STATE_IDS } from './entryStateMetadata';
import { EntryState as RuleBookEntryState } from './enums';
import { ENTRY_STATE_MAPPING_FROZEN_VERSION } from './metadata';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import {
  EntryStateMappingErrorCode,
  type EntryStateMappingRow,
  type EntryStateMappingValidationResult,
  type EntryStateNotYetMappedReason,
} from './entryStateMappingTypes';

export { ENTRY_STATE_MAPPING_FROZEN_VERSION } from './metadata';
export { EntryStateMappingErrorCode } from './entryStateMappingTypes';
export class EntryStateMappingError extends Error {
  readonly code: EntryStateMappingErrorCode;

  constructor(code: EntryStateMappingErrorCode, message: string) {
    super(message);
    this.name = 'EntryStateMappingError';
    this.code = code;
  }
}

/**
 * Canonical FinalEntryStatus → RuleBook EntryState mapping table.
 *
 * Evidence sourced from entryStateMetadata.ts and finalEntryStatus.ts only.
 */
export const FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP: Readonly<
  Record<FinalEntryStatus, RuleBookEntryState>
> = {
  [FinalEntryStatus.ENTRY_VALID]: RuleBookEntryState.READY,
  [FinalEntryStatus.WAIT_ENTRY]: RuleBookEntryState.WATCH,
  [FinalEntryStatus.SCORE_BLOCKED]: RuleBookEntryState.BLOCKED,
  [FinalEntryStatus.GROUP_BLOCKED]: RuleBookEntryState.BLOCKED,
  [FinalEntryStatus.HARD_BLOCKED]: RuleBookEntryState.BLOCKED,
} as const;

/** Documented mapping rows with evidence strings. */
export const FINAL_ENTRY_STATUS_TO_RULEBOOK_ROWS: readonly EntryStateMappingRow<
  FinalEntryStatus,
  RuleBookEntryState
>[] = [
  {
    source: FinalEntryStatus.ENTRY_VALID,
    target: RuleBookEntryState.READY,
    evidence:
      'entryStateMetadata.ts READY.businessMeaning: "Tương đương FinalEntryStatus.ENTRY_VALID (§1.1)"',
  },
  {
    source: FinalEntryStatus.WAIT_ENTRY,
    target: RuleBookEntryState.WATCH,
    evidence:
      'finalEntryStatus.ts: WAIT_ENTRY when !tradePlanValid; entryStateMetadata.ts WATCH.whenToUse: "plan/R:R chưa sẵn"',
  },
  {
    source: FinalEntryStatus.SCORE_BLOCKED,
    target: RuleBookEntryState.BLOCKED,
    evidence:
      'entryStateMetadata.ts BLOCKED.businessMeaning: "Map HARD/GROUP/SCORE_BLOCKED"',
  },
  {
    source: FinalEntryStatus.GROUP_BLOCKED,
    target: RuleBookEntryState.BLOCKED,
    evidence:
      'entryStateMetadata.ts BLOCKED.businessMeaning: "Map HARD/GROUP/SCORE_BLOCKED"',
  },
  {
    source: FinalEntryStatus.HARD_BLOCKED,
    target: RuleBookEntryState.BLOCKED,
    evidence:
      'entryStateMetadata.ts BLOCKED.businessMeaning: "Map HARD/GROUP/SCORE_BLOCKED"',
  },
] as const;

/**
 * Canonical RuleBook EntryState → StateMachine EntryState mapping table.
 *
 * Four overlapping states share identical string values in both enums.
 */
export const RULEBOOK_TO_STATE_MACHINE_MAP: Readonly<
  Record<RuleBookEntryState, StateMachineEntryState>
> = {
  [RuleBookEntryState.READY]: StateMachineEntryState.READY,
  [RuleBookEntryState.WATCH]: StateMachineEntryState.WATCH,
  [RuleBookEntryState.LOCKED]: StateMachineEntryState.LOCKED,
  [RuleBookEntryState.BLOCKED]: StateMachineEntryState.BLOCKED,
} as const;

export const RULEBOOK_TO_STATE_MACHINE_ROWS: readonly EntryStateMappingRow<
  RuleBookEntryState,
  StateMachineEntryState
>[] = [
  {
    source: RuleBookEntryState.READY,
    target: StateMachineEntryState.READY,
    evidence: 'stateMachineTypes.ts + enums.ts: identical READY string value',
  },
  {
    source: RuleBookEntryState.WATCH,
    target: StateMachineEntryState.WATCH,
    evidence: 'stateMachineTypes.ts + enums.ts: identical WATCH string value',
  },
  {
    source: RuleBookEntryState.LOCKED,
    target: StateMachineEntryState.LOCKED,
    evidence: 'stateMachineTypes.ts + enums.ts: identical LOCKED string value',
  },
  {
    source: RuleBookEntryState.BLOCKED,
    target: StateMachineEntryState.BLOCKED,
    evidence: 'stateMachineTypes.ts + enums.ts: identical BLOCKED string value',
  },
] as const;

/**
 * StateMachine EntryState values with NO RuleBook reverse mapping.
 *
 * RuleBook §1 defines exactly four states; entryStateMetadata.ts L57 forbids IDLE extension.
 */
export const STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK: readonly EntryStateNotYetMappedReason[] = [
  {
    sourceLayer: 'StateMachineEntryState',
    sourceValue: StateMachineEntryState.IDLE,
    targetLayer: 'RuleBookEntryState',
    reason:
      'entryStateMetadata.ts L57: RuleBook forbids IDLE; StateMachine IDLE is pre-WATCH lifecycle only',
  },
  {
    sourceLayer: 'StateMachineEntryState',
    sourceValue: StateMachineEntryState.ENTRY,
    targetLayer: 'RuleBookEntryState',
    reason:
      'RuleBook §1 covers pre-entry states only; ENTRY is post-commit lifecycle (stateMachineTypes.ts)',
  },
  {
    sourceLayer: 'StateMachineEntryState',
    sourceValue: StateMachineEntryState.ACTIVE,
    targetLayer: 'RuleBookEntryState',
    reason:
      'RuleBook §1 covers pre-entry states only; ACTIVE is open-position lifecycle (stateMachineTypes.ts)',
  },
  {
    sourceLayer: 'StateMachineEntryState',
    sourceValue: StateMachineEntryState.EXIT,
    targetLayer: 'RuleBookEntryState',
    reason:
      'RuleBook §1 covers pre-entry states only; EXIT is post-entry lifecycle (stateMachineTypes.ts)',
  },
] as const;

/**
 * RuleBook EntryState values with NO unique FinalEntryStatus reverse mapping.
 *
 * Many-to-one collapse (three block types → BLOCKED) and LOCKED requires lock-zone context.
 */
export const RULEBOOK_NOT_YET_MAPPED_TO_FINAL: readonly EntryStateNotYetMappedReason[] = [
  {
    sourceLayer: 'RuleBookEntryState',
    sourceValue: RuleBookEntryState.LOCKED,
    targetLayer: 'FinalEntryStatus',
    reason:
      'No FinalEntryStatus value for LOCKED; requires Entry Lock Zone context (entryStateMetadata.ts LOCKED.businessMeaning)',
  },
  {
    sourceLayer: 'RuleBookEntryState',
    sourceValue: RuleBookEntryState.BLOCKED,
    targetLayer: 'FinalEntryStatus',
    reason:
      'BLOCKED collapses SCORE_BLOCKED, GROUP_BLOCKED, HARD_BLOCKED — reverse mapping ambiguous without block metadata',
  },
  {
    sourceLayer: 'RuleBookEntryState',
    sourceValue: RuleBookEntryState.WATCH,
    targetLayer: 'FinalEntryStatus',
    reason:
      'WATCH is broader than WAIT_ENTRY (entryStateMetadata.ts WATCH.whenToUse groups A–E §1.2); reverse mapping lossy',
  },
] as const;

const ALL_FINAL_ENTRY_STATUSES = Object.values(FinalEntryStatus) as FinalEntryStatus[];
const ALL_STATE_MACHINE_STATES = Object.values(StateMachineEntryState) as StateMachineEntryState[];

function assertKnownFinalEntryStatus(value: string): asserts value is FinalEntryStatus {
  if (!ALL_FINAL_ENTRY_STATUSES.includes(value as FinalEntryStatus)) {
    throw new EntryStateMappingError(
      EntryStateMappingErrorCode.UNKNOWN_FINAL_ENTRY_STATUS,
      `unknown FinalEntryStatus: ${JSON.stringify(value)}`,
    );
  }
}

function assertKnownRuleBookEntryState(value: string): asserts value is RuleBookEntryState {
  if (!(ENTRY_STATE_IDS as readonly string[]).includes(value)) {
    throw new EntryStateMappingError(
      EntryStateMappingErrorCode.UNKNOWN_RULEBOOK_ENTRY_STATE,
      `unknown RuleBook EntryState: ${JSON.stringify(value)}`,
    );
  }
}

function assertKnownStateMachineEntryState(
  value: string,
): asserts value is StateMachineEntryState {
  if (!ALL_STATE_MACHINE_STATES.includes(value as StateMachineEntryState)) {
    throw new EntryStateMappingError(
      EntryStateMappingErrorCode.UNKNOWN_STATE_MACHINE_ENTRY_STATE,
      `unknown StateMachine EntryState: ${JSON.stringify(value)}`,
    );
  }
}

function findNotYetMappedStateMachine(
  state: StateMachineEntryState,
): EntryStateNotYetMappedReason | undefined {
  return STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK.find((row) => row.sourceValue === state);
}

/** Type guard — true if value is a production {@link FinalEntryStatus}. */
export function isFinalEntryStatus(value: string): value is FinalEntryStatus {
  return ALL_FINAL_ENTRY_STATUSES.includes(value as FinalEntryStatus);
}

/** Type guard — true if value is a RuleBook {@link RuleBookEntryState}. */
export function isRuleBookEntryState(value: string): value is RuleBookEntryState {
  return (ENTRY_STATE_IDS as readonly string[]).includes(value);
}

/** Type guard — true if value is a StateMachine layer {@link StateMachineEntryState}. */
export function isMappingStateMachineEntryState(
  value: string,
): value is StateMachineEntryState {
  return ALL_STATE_MACHINE_STATES.includes(value as StateMachineEntryState);
}

/**
 * Maps production {@link FinalEntryStatus} → RuleBook {@link RuleBookEntryState}.
 *
 * @throws {EntryStateMappingError} on unknown status
 */
export function mapFinalEntryStatusToEntryState(
  status: FinalEntryStatus,
): RuleBookEntryState {
  assertKnownFinalEntryStatus(status);
  return FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP[status];
}

/**
 * Maps RuleBook {@link RuleBookEntryState} → StateMachine {@link StateMachineEntryState}.
 *
 * @throws {EntryStateMappingError} on unknown state
 */
export function mapEntryStateToStateMachine(
  state: RuleBookEntryState,
): StateMachineEntryState {
  assertKnownRuleBookEntryState(state);
  return RULEBOOK_TO_STATE_MACHINE_MAP[state];
}

/**
 * Maps StateMachine {@link StateMachineEntryState} → RuleBook {@link RuleBookEntryState}.
 *
 * IDLE, ENTRY, ACTIVE, EXIT throw NOT_YET_MAPPED — no RuleBook equivalent in source.
 *
 * @throws {EntryStateMappingError} on unknown or not-yet-mapped state
 */
export function mapStateMachineToEntryState(
  state: StateMachineEntryState,
): RuleBookEntryState {
  assertKnownStateMachineEntryState(state);

  const notYetMapped = findNotYetMappedStateMachine(state);
  if (notYetMapped) {
    throw new EntryStateMappingError(
      EntryStateMappingErrorCode.NOT_YET_MAPPED,
      `StateMachine EntryState ${state} is NOT_YET_MAPPED to RuleBook EntryState: ${notYetMapped.reason}`,
    );
  }

  return state as RuleBookEntryState;
}

/**
 * Composite: FinalEntryStatus → StateMachine EntryState (via RuleBook).
 *
 * @throws {EntryStateMappingError} on unknown status
 */
export function mapFinalEntryStatusToStateMachine(
  status: FinalEntryStatus,
): StateMachineEntryState {
  const ruleBookState = mapFinalEntryStatusToEntryState(status);
  return mapEntryStateToStateMachine(ruleBookState);
}

/**
 * Validates mapping tables — completeness, consistency, round-trip, no conflicting rows.
 *
 * @throws {EntryStateMappingError} when validation fails and `throwOnError` is true (default)
 */
export function validateEntryStateMapping(
  options: { throwOnError?: boolean } = {},
): EntryStateMappingValidationResult {
  const { throwOnError = false } = options;
  const errors: string[] = [];

  for (const status of ALL_FINAL_ENTRY_STATUSES) {
    if (FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP[status] === undefined) {
      errors.push(`missing FinalEntryStatus mapping: ${status}`);
    }
  }

  for (const state of ENTRY_STATE_IDS) {
    if (RULEBOOK_TO_STATE_MACHINE_MAP[state] === undefined) {
      errors.push(`missing RuleBook EntryState mapping: ${state}`);
    }
  }

  for (const row of FINAL_ENTRY_STATUS_TO_RULEBOOK_ROWS) {
    if (FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP[row.source] !== row.target) {
      errors.push(
        `FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP mismatch for ${row.source}: table vs row`,
      );
    }
  }

  for (const row of RULEBOOK_TO_STATE_MACHINE_ROWS) {
    if (RULEBOOK_TO_STATE_MACHINE_MAP[row.source] !== row.target) {
      errors.push(
        `RULEBOOK_TO_STATE_MACHINE_MAP mismatch for ${row.source}: table vs row`,
      );
    }
  }

  const finalTargets = new Set(Object.values(FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP));
  if (finalTargets.size === 0) {
    errors.push('FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP has no targets');
  }

  for (const ruleBookState of ENTRY_STATE_IDS) {
    const sm = mapEntryStateToStateMachine(ruleBookState);
    const roundTrip = mapStateMachineToEntryState(sm);
    if (roundTrip !== ruleBookState) {
      errors.push(
        `round-trip failed RuleBook ${ruleBookState} → StateMachine ${sm} → ${roundTrip}`,
      );
    }
  }

  for (const smState of ALL_STATE_MACHINE_STATES) {
    const documented = findNotYetMappedStateMachine(smState);
    const canMap = documented === undefined;
    try {
      const result = mapStateMachineToEntryState(smState);
      if (!canMap) {
        errors.push(
          `StateMachine ${smState} mapped to ${result} but is documented NOT_YET_MAPPED`,
        );
      }
    } catch (error) {
      if (
        canMap
        || !(error instanceof EntryStateMappingError)
        || error.code !== EntryStateMappingErrorCode.NOT_YET_MAPPED
      ) {
        errors.push(
          `unexpected error mapping StateMachine ${smState}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK.length !== 4) {
    errors.push(
      `expected 4 NOT_YET_MAPPED StateMachine states, got ${STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK.length}`,
    );
  }

  const result: EntryStateMappingValidationResult = {
    valid: errors.length === 0,
    errors,
  };

  if (!result.valid && throwOnError) {
    throw new EntryStateMappingError(
      EntryStateMappingErrorCode.VALIDATION_FAILED,
      `entry state mapping validation failed: ${errors.join('; ')}`,
    );
  }

  return result;
}

/** Namespace for mapping discoverability. */
export const EntryStateMapping = {
  ENTRY_STATE_MAPPING_FROZEN_VERSION,
  FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP,
  FINAL_ENTRY_STATUS_TO_RULEBOOK_ROWS,
  RULEBOOK_TO_STATE_MACHINE_MAP,
  RULEBOOK_TO_STATE_MACHINE_ROWS,
  STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK,
  RULEBOOK_NOT_YET_MAPPED_TO_FINAL,
  mapFinalEntryStatusToEntryState,
  mapEntryStateToStateMachine,
  mapStateMachineToEntryState,
  mapFinalEntryStatusToStateMachine,
  validateEntryStateMapping,
  isFinalEntryStatus,
  isRuleBookEntryState,
  isMappingStateMachineEntryState,
  EntryStateMappingError,
  EntryStateMappingErrorCode,
} as const;

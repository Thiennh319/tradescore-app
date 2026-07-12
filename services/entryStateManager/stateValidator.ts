/**
 * Entry State Validator — read-only validation API (Task 02.3.1).
 *
 * **Purpose:** Verify EntryState values and transition matrix data.
 *
 * **MUST NOT:**
 * - Change or assign application state
 * - Execute transitions or state machine steps
 * - Run hysteresis, setup lock, or commit score logic
 * - Call Score Engine, Rule Engine, or production modules
 *
 * **MAY ONLY:** Read locked enums/matrix metadata and return {@link EntryStateValidationResult}.
 *
 * @module entryStateManager/stateValidator
 */

import { EntryState } from './enums';
import { ESM_ERROR_CODE_LABELS, EsmErrorCode } from './errorCodes';
import { ENTRY_STATE_DEFINITIONS, ENTRY_STATE_IDS, isEntryState } from './entryStateMetadata';
import {
  TRANSITION_CATEGORY_PRIORITY,
  TRANSITION_SOURCE_MODULES,
  TransitionAuditLabel,
  TransitionCategory,
} from './transitionMetadata';
import { findTransitionDefinition } from './transitionValidation';
import type { EntryTransitionDefinition } from './transitionTypes';
import {
  validationFailure,
  validationSuccess,
  type EntryStateValidationResult,
} from './validationResult';

const VALID_AUDIT_LABELS = new Set<string>(Object.values(TransitionAuditLabel));
const VALID_CATEGORIES = new Set<string>(Object.values(TransitionCategory));

/**
 * Validate an EntryState value against enum + RuleBook metadata.
 *
 * **Read-only** — does not mutate state.
 */
export function validateEntryState(value: string): EntryStateValidationResult {
  if (!isEntryState(value)) {
    return validationFailure(
      EsmErrorCode.ESM_002,
      `${ESM_ERROR_CODE_LABELS[EsmErrorCode.ESM_002]}: "${value}" is not a RuleBook EntryState`,
    );
  }

  const state = value as EntryState;

  if (!(ENTRY_STATE_IDS as readonly string[]).includes(state)) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `${ESM_ERROR_CODE_LABELS[EsmErrorCode.ESM_005]}: state "${state}" missing from ENTRY_STATE_IDS`,
      { state },
    );
  }

  const stateDefinition = ENTRY_STATE_DEFINITIONS[state];
  if (!stateDefinition) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `${ESM_ERROR_CODE_LABELS[EsmErrorCode.ESM_005]}: no metadata for state "${state}"`,
      { state, ruleReference: 'RuleBook V2 §1' },
    );
  }

  if (stateDefinition.id !== state) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `${ESM_ERROR_CODE_LABELS[EsmErrorCode.ESM_005]}: metadata id mismatch for "${state}"`,
      { state, ruleReference: 'RuleBook V2 §1' },
    );
  }

  return validationSuccess({
    message: `EntryState "${state}" is valid`,
    ruleReference: 'RuleBook V2 §1',
    state,
    stateDefinition,
  });
}

/**
 * Validate a transition pair against the locked Transition Matrix.
 *
 * **Does not perform** the transition — lookup and structural `allowed` flag only.
 */
export function validateTransition(
  from: string,
  to: string,
): EntryStateValidationResult {
  const fromResult = validateEntryState(from);
  if (!fromResult.valid) {
    return {
      ...fromResult,
      message: `Invalid from state: ${fromResult.message}`,
    };
  }

  const toResult = validateEntryState(to);
  if (!toResult.valid) {
    return {
      ...toResult,
      message: `Invalid to state: ${toResult.message}`,
    };
  }

  const fromState = from as EntryState;
  const toState = to as EntryState;
  const definition = findTransitionDefinition(fromState, toState);

  if (!definition) {
    return validationFailure(
      EsmErrorCode.ESM_001,
      `${ESM_ERROR_CODE_LABELS[EsmErrorCode.ESM_001]}: no matrix entry for ${from} → ${to}`,
      { state: fromState, ruleReference: 'Business Workflow 02.2.2.1' },
    );
  }

  const metadataResult = validateTransitionMetadata(definition);
  if (!metadataResult.valid) {
    return metadataResult;
  }

  if (!definition.allowed) {
    return validationFailure(
      EsmErrorCode.ESM_001,
      `${ESM_ERROR_CODE_LABELS[EsmErrorCode.ESM_001]}: ${from} → ${to} is structurally forbidden`,
      {
        ruleReference: definition.ruleReference,
        transitionId: definition.transitionId,
        transitionCategory: definition.transitionCategory,
        transitionDefinition: definition,
        state: fromState,
      },
    );
  }

  return validationSuccess({
    message: `Transition ${from} → ${to} is structurally allowed`,
    ruleReference: definition.ruleReference,
    transitionId: definition.transitionId,
    transitionCategory: definition.transitionCategory,
    transitionDefinition: definition,
    state: fromState,
  });
}

/**
 * Validate transition metadata fields on a matrix row.
 *
 * **Read-only** — does not repair or persist data.
 */
export function validateTransitionMetadata(
  definition: EntryTransitionDefinition,
): EntryStateValidationResult {
  if (!definition.transitionId || !definition.fromState || !definition.toState) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `${ESM_ERROR_CODE_LABELS[EsmErrorCode.ESM_005]}: incomplete transition identity fields`,
      { transitionId: definition.transitionId ?? null },
    );
  }

  if (!definition.transitionReason?.trim()) {
    return validationFailure(EsmErrorCode.ESM_005, 'Missing transitionReason', {
      transitionId: definition.transitionId,
      ruleReference: definition.ruleReference,
    });
  }

  if (!VALID_CATEGORIES.has(definition.transitionCategory)) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `Invalid transitionCategory: ${definition.transitionCategory}`,
      {
        transitionId: definition.transitionId,
        transitionCategory: definition.transitionCategory,
      },
    );
  }

  if (definition.priority < 0) {
    return validationFailure(EsmErrorCode.ESM_005, 'Priority must not be negative', {
      transitionId: definition.transitionId,
    });
  }

  const expectedPriority = TRANSITION_CATEGORY_PRIORITY[definition.transitionCategory];
  if (definition.priority !== expectedPriority) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `Priority ${definition.priority} does not match category default ${expectedPriority}`,
      {
        transitionId: definition.transitionId,
        transitionCategory: definition.transitionCategory,
        ruleReference: definition.ruleReference,
      },
    );
  }

  if (!definition.sourceModule?.trim()) {
    return validationFailure(EsmErrorCode.ESM_005, 'sourceModule must not be empty', {
      transitionId: definition.transitionId,
    });
  }

  if (!TRANSITION_SOURCE_MODULES.includes(definition.sourceModule)) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `Unknown sourceModule: ${definition.sourceModule}`,
      { transitionId: definition.transitionId },
    );
  }

  if (!VALID_AUDIT_LABELS.has(definition.auditLabel)) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      `Invalid auditLabel: ${definition.auditLabel}`,
      { transitionId: definition.transitionId },
    );
  }

  if (!definition.ruleReference?.trim()) {
    return validationFailure(EsmErrorCode.ESM_005, 'Missing ruleReference', {
      transitionId: definition.transitionId,
    });
  }

  if (!definition.allowed && definition.auditLabel !== TransitionAuditLabel.ENTRY_INVALID) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      'Forbidden transition must use ENTRY_INVALID auditLabel',
      {
        transitionId: definition.transitionId,
        transitionCategory: definition.transitionCategory,
        ruleReference: definition.ruleReference,
      },
    );
  }

  if (definition.allowed && definition.auditLabel === TransitionAuditLabel.ENTRY_INVALID) {
    return validationFailure(
      EsmErrorCode.ESM_005,
      'Allowed transition must not use ENTRY_INVALID auditLabel',
      { transitionId: definition.transitionId },
    );
  }

  return validationSuccess({
    message: `Transition metadata valid for ${definition.transitionId}`,
    ruleReference: definition.ruleReference,
    transitionId: definition.transitionId,
    transitionCategory: definition.transitionCategory,
    transitionDefinition: definition,
    state: definition.fromState,
  });
}

/** Namespace object for discoverability — same read-only functions. */
export const EntryStateValidator = {
  validateEntryState,
  validateTransition,
  validateTransitionMetadata,
} as const;

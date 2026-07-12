/**
 * Transition matrix data validation — **no state evaluation**.
 *
 * @module entryStateManager/transitionValidation
 */

import { EntryState } from './enums';
import { ENTRY_STATE_IDS } from './entryStateMetadata';
import {
  ENTRY_FORBIDDEN_TRANSITIONS,
  ENTRY_SKIP_WATCH_FORBIDDEN_PAIRS,
  ENTRY_TRANSITION_MATRIX,
  ENTRY_TRANSITION_METADATA_TABLE,
  entryTransitionId,
} from './transitionMatrix';
import { TRANSITION_SOURCE_MODULES } from './transitionMetadata';
import { TransitionAuditLabel } from './transitionMetadata';
import type { EntryTransitionDefinition, TransitionMatrixValidationResult } from './transitionTypes';

const REQUIRED_METADATA_KEYS: (keyof EntryTransitionDefinition)[] = [
  'transitionId',
  'fromState',
  'toState',
  'transitionReason',
  'transitionCategory',
  'priority',
  'sourceModule',
  'auditLabel',
  'ruleReference',
];

/** Lookup by from/to — data read only. */
export function findTransitionDefinition(
  from: EntryState,
  to: EntryState,
): EntryTransitionDefinition | undefined {
  return ENTRY_TRANSITION_MATRIX.find((t) => t.fromState === from && t.toState === to);
}

/** Structural allowed flag from matrix data. */
export function isStructurallyAllowed(from: EntryState, to: EntryState): boolean {
  return findTransitionDefinition(from, to)?.allowed === true;
}

/** Validates matrix integrity, workflow rules, and metadata completeness. */
export function validateTransitionMatrixData(): TransitionMatrixValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();

  for (const t of ENTRY_TRANSITION_MATRIX) {
    if (seenIds.has(t.transitionId)) {
      errors.push(`Duplicate transitionId: ${t.transitionId}`);
    }
    seenIds.add(t.transitionId);

    const pairKey = `${t.fromState}→${t.toState}`;
    if (seenPairs.has(pairKey)) {
      errors.push(`Duplicate pair: ${pairKey}`);
    }
    seenPairs.add(pairKey);

    if (t.transitionId !== entryTransitionId(t.fromState, t.toState)) {
      errors.push(`transitionId mismatch on ${pairKey}`);
    }

    for (const key of REQUIRED_METADATA_KEYS) {
      const val = t[key];
      if (val === undefined || val === null || val === '') {
        errors.push(`Missing metadata ${key} on ${t.transitionId}`);
      }
    }

    if (t.priority < 0) {
      errors.push(`Negative priority on ${t.transitionId}`);
    }

    if (!TRANSITION_SOURCE_MODULES.includes(t.sourceModule)) {
      errors.push(`Unknown sourceModule on ${t.transitionId}: ${t.sourceModule}`);
    }

    if (!t.allowed && t.auditLabel !== TransitionAuditLabel.ENTRY_INVALID) {
      errors.push(
        `Forbidden transition ${t.transitionId} should use ENTRY_INVALID auditLabel`,
      );
    }

    if (t.allowed && t.auditLabel === TransitionAuditLabel.ENTRY_INVALID) {
      errors.push(`Allowed transition ${t.transitionId} must not use ENTRY_INVALID`);
    }
  }

  const expectedCount = ENTRY_STATE_IDS.length ** 2;
  if (ENTRY_TRANSITION_MATRIX.length !== expectedCount) {
    errors.push(`Matrix size ${ENTRY_TRANSITION_MATRIX.length} !== ${expectedCount}`);
  }

  for (const from of ENTRY_STATE_IDS) {
    for (const to of ENTRY_STATE_IDS) {
      if (!seenPairs.has(`${from}→${to}`)) {
        errors.push(`Missing transition: ${from} → ${to}`);
      }
    }
  }

  for (const f of ENTRY_FORBIDDEN_TRANSITIONS) {
    if (f.allowed) {
      errors.push(`Forbidden list contains allowed=true: ${f.transitionId}`);
    }
  }

  for (const [from, to] of ENTRY_SKIP_WATCH_FORBIDDEN_PAIRS) {
    if (isStructurallyAllowed(from, to)) {
      errors.push(`Skip-WATCH violation: ${from} → ${to}`);
    }
  }

  if (ENTRY_TRANSITION_METADATA_TABLE.length !== ENTRY_TRANSITION_MATRIX.length) {
    errors.push('METADATA_TABLE length mismatch vs MATRIX');
  }

  return { valid: errors.length === 0, errors };
}

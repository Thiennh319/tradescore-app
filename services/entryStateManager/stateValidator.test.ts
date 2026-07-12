/**
 * Entry State Validator — unit test skeleton (Task 02.3.1).
 */

import { describe, expect, it } from 'vitest';
import { EntryState } from './enums';
import { EsmErrorCode } from './errorCodes';
import { findTransitionDefinition } from './transitionValidation';
import {
  EntryStateValidator,
  validateEntryState,
  validateTransition,
  validateTransitionMetadata,
} from './stateValidator';

describe('EntryStateValidator — skeleton', () => {
  describe('validateEntryState', () => {
    it('accepts a valid RuleBook state', () => {
      const result = validateEntryState(EntryState.READY);
      expect(result.valid).toBe(true);
      expect(result.errorCode).toBeNull();
      expect(result.state).toBe(EntryState.READY);
      expect(result.stateDefinition?.id).toBe(EntryState.READY);
    });

    it('rejects an unknown state string', () => {
      const result = validateEntryState('UNKNOWN');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(EsmErrorCode.ESM_002);
    });
  });

  describe('validateTransition', () => {
    it('accepts a structurally allowed transition', () => {
      const result = validateTransition(EntryState.WATCH, EntryState.READY);
      expect(result.valid).toBe(true);
      expect(result.transitionId).toBe('ESM-T-WATCH-READY');
      expect(result.transitionDefinition?.transitionReason).toBe('Conditions Confirmed');
    });

    it('rejects a structurally forbidden transition', () => {
      const result = validateTransition(EntryState.WATCH, EntryState.LOCKED);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(EsmErrorCode.ESM_001);
      expect(result.transitionDefinition?.allowed).toBe(false);
    });
  });

  describe('validateTransitionMetadata', () => {
    it('accepts metadata from the locked matrix', () => {
      const def = findTransitionDefinition(EntryState.READY, EntryState.LOCKED);
      expect(def).toBeDefined();
      const result = validateTransitionMetadata(def!);
      expect(result.valid).toBe(true);
      expect(result.transitionCategory).toBe(def!.transitionCategory);
    });
  });

  describe('EntryStateValidator namespace', () => {
    it('exposes the same API', () => {
      expect(EntryStateValidator.validateEntryState(EntryState.BLOCKED).valid).toBe(true);
    });
  });
});

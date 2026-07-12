/**
 * Entry State Mapping Bridge — tests (Task 02.9.0).
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import { EntryState as RuleBookEntryState } from './enums';
import {
  ENTRY_STATE_MAPPING_FROZEN_VERSION,
  EntryStateMapping,
  EntryStateMappingError,
  EntryStateMappingErrorCode,
  FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP,
  FINAL_ENTRY_STATUS_TO_RULEBOOK_ROWS,
  RULEBOOK_TO_STATE_MACHINE_MAP,
  RULEBOOK_TO_STATE_MACHINE_ROWS,
  STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK,
  mapEntryStateToStateMachine,
  mapFinalEntryStatusToEntryState,
  mapFinalEntryStatusToStateMachine,
  mapStateMachineToEntryState,
  validateEntryStateMapping,
} from './entryStateMapping';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';

describe('EntryStateMapping — Task 02.9.0', () => {
  describe('freeze declaration', () => {
    it('ENTRY_STATE_MAPPING_FROZEN_VERSION is 2.0.0', () => {
      expect(ENTRY_STATE_MAPPING_FROZEN_VERSION).toBe('2.0.0');
      expect(EntryStateMapping.ENTRY_STATE_MAPPING_FROZEN_VERSION).toBe('2.0.0');
    });
  });

  describe('mapFinalEntryStatusToEntryState — every FinalEntryStatus', () => {
    it('ENTRY_VALID → READY', () => {
      expect(mapFinalEntryStatusToEntryState(FinalEntryStatus.ENTRY_VALID)).toBe(
        RuleBookEntryState.READY,
      );
    });

    it('WAIT_ENTRY → WATCH', () => {
      expect(mapFinalEntryStatusToEntryState(FinalEntryStatus.WAIT_ENTRY)).toBe(
        RuleBookEntryState.WATCH,
      );
    });

    it('SCORE_BLOCKED → BLOCKED', () => {
      expect(mapFinalEntryStatusToEntryState(FinalEntryStatus.SCORE_BLOCKED)).toBe(
        RuleBookEntryState.BLOCKED,
      );
    });

    it('GROUP_BLOCKED → BLOCKED', () => {
      expect(mapFinalEntryStatusToEntryState(FinalEntryStatus.GROUP_BLOCKED)).toBe(
        RuleBookEntryState.BLOCKED,
      );
    });

    it('HARD_BLOCKED → BLOCKED', () => {
      expect(mapFinalEntryStatusToEntryState(FinalEntryStatus.HARD_BLOCKED)).toBe(
        RuleBookEntryState.BLOCKED,
      );
    });
  });

  describe('mapEntryStateToStateMachine — every RuleBook EntryState', () => {
    it('READY → READY', () => {
      expect(mapEntryStateToStateMachine(RuleBookEntryState.READY)).toBe(
        StateMachineEntryState.READY,
      );
    });

    it('WATCH → WATCH', () => {
      expect(mapEntryStateToStateMachine(RuleBookEntryState.WATCH)).toBe(
        StateMachineEntryState.WATCH,
      );
    });

    it('LOCKED → LOCKED', () => {
      expect(mapEntryStateToStateMachine(RuleBookEntryState.LOCKED)).toBe(
        StateMachineEntryState.LOCKED,
      );
    });

    it('BLOCKED → BLOCKED', () => {
      expect(mapEntryStateToStateMachine(RuleBookEntryState.BLOCKED)).toBe(
        StateMachineEntryState.BLOCKED,
      );
    });
  });

  describe('mapStateMachineToEntryState — every StateMachine EntryState', () => {
    it('READY → READY', () => {
      expect(mapStateMachineToEntryState(StateMachineEntryState.READY)).toBe(
        RuleBookEntryState.READY,
      );
    });

    it('WATCH → WATCH', () => {
      expect(mapStateMachineToEntryState(StateMachineEntryState.WATCH)).toBe(
        RuleBookEntryState.WATCH,
      );
    });

    it('LOCKED → LOCKED', () => {
      expect(mapStateMachineToEntryState(StateMachineEntryState.LOCKED)).toBe(
        RuleBookEntryState.LOCKED,
      );
    });

    it('BLOCKED → BLOCKED', () => {
      expect(mapStateMachineToEntryState(StateMachineEntryState.BLOCKED)).toBe(
        RuleBookEntryState.BLOCKED,
      );
    });

    it('IDLE — NOT_YET_MAPPED', () => {
      expect(() => mapStateMachineToEntryState(StateMachineEntryState.IDLE)).toThrow(
        EntryStateMappingError,
      );
      try {
        mapStateMachineToEntryState(StateMachineEntryState.IDLE);
      } catch (error) {
        expect(error).toBeInstanceOf(EntryStateMappingError);
        expect((error as EntryStateMappingError).code).toBe(
          EntryStateMappingErrorCode.NOT_YET_MAPPED,
        );
        expect((error as EntryStateMappingError).message).toContain('IDLE');
      }
    });

    it('ENTRY — NOT_YET_MAPPED', () => {
      expect(() => mapStateMachineToEntryState(StateMachineEntryState.ENTRY)).toThrow(
        EntryStateMappingError,
      );
    });

    it('ACTIVE — NOT_YET_MAPPED', () => {
      expect(() => mapStateMachineToEntryState(StateMachineEntryState.ACTIVE)).toThrow(
        EntryStateMappingError,
      );
    });

    it('EXIT — NOT_YET_MAPPED', () => {
      expect(() => mapStateMachineToEntryState(StateMachineEntryState.EXIT)).toThrow(
        EntryStateMappingError,
      );
    });
  });

  describe('mapFinalEntryStatusToStateMachine — composite', () => {
    it('ENTRY_VALID → StateMachine READY', () => {
      expect(mapFinalEntryStatusToStateMachine(FinalEntryStatus.ENTRY_VALID)).toBe(
        StateMachineEntryState.READY,
      );
    });

    it('HARD_BLOCKED → StateMachine BLOCKED', () => {
      expect(mapFinalEntryStatusToStateMachine(FinalEntryStatus.HARD_BLOCKED)).toBe(
        StateMachineEntryState.BLOCKED,
      );
    });
  });

  describe('invalid values — no silent fallback', () => {
    it('unknown FinalEntryStatus throws', () => {
      expect(() =>
        mapFinalEntryStatusToEntryState('INVALID' as FinalEntryStatus),
      ).toThrow(EntryStateMappingError);
      try {
        mapFinalEntryStatusToEntryState('INVALID' as FinalEntryStatus);
      } catch (error) {
        expect((error as EntryStateMappingError).code).toBe(
          EntryStateMappingErrorCode.UNKNOWN_FINAL_ENTRY_STATUS,
        );
      }
    });

    it('unknown RuleBook EntryState throws', () => {
      expect(() =>
        mapEntryStateToStateMachine('INVALID' as RuleBookEntryState),
      ).toThrow(EntryStateMappingError);
    });

    it('unknown StateMachine EntryState throws', () => {
      expect(() =>
        mapStateMachineToEntryState('INVALID' as StateMachineEntryState),
      ).toThrow(EntryStateMappingError);
    });
  });

  describe('mapping consistency', () => {
    it('FINAL_ENTRY_STATUS_TO_RULEBOOK_ROWS align with map table', () => {
      for (const row of FINAL_ENTRY_STATUS_TO_RULEBOOK_ROWS) {
        expect(FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP[row.source]).toBe(row.target);
        expect(mapFinalEntryStatusToEntryState(row.source)).toBe(row.target);
      }
    });

    it('RULEBOOK_TO_STATE_MACHINE_ROWS align with map table', () => {
      for (const row of RULEBOOK_TO_STATE_MACHINE_ROWS) {
        expect(RULEBOOK_TO_STATE_MACHINE_MAP[row.source]).toBe(row.target);
        expect(mapEntryStateToStateMachine(row.source)).toBe(row.target);
      }
    });

    it('all five FinalEntryStatus values are mapped', () => {
      expect(Object.keys(FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP)).toHaveLength(5);
    });

    it('three block types collapse to BLOCKED', () => {
      const blockedStatuses = [
        FinalEntryStatus.SCORE_BLOCKED,
        FinalEntryStatus.GROUP_BLOCKED,
        FinalEntryStatus.HARD_BLOCKED,
      ];
      for (const status of blockedStatuses) {
        expect(mapFinalEntryStatusToEntryState(status)).toBe(RuleBookEntryState.BLOCKED);
      }
    });

    it('STATE_MACHINE_NOT_YET_MAPPED documents exactly IDLE, ENTRY, ACTIVE, EXIT', () => {
      expect(STATE_MACHINE_NOT_YET_MAPPED_TO_RULEBOOK.map((r) => r.sourceValue).sort()).toEqual(
        [
          StateMachineEntryState.ACTIVE,
          StateMachineEntryState.ENTRY,
          StateMachineEntryState.EXIT,
          StateMachineEntryState.IDLE,
        ].sort(),
      );
    });
  });

  describe('determinism', () => {
    it('identical inputs produce identical outputs', () => {
      const status = FinalEntryStatus.WAIT_ENTRY;
      const first = mapFinalEntryStatusToStateMachine(status);
      const second = mapFinalEntryStatusToStateMachine(status);
      expect(first).toBe(second);
    });

    it('round-trip RuleBook → StateMachine → RuleBook for all four states', () => {
      const states = [
        RuleBookEntryState.READY,
        RuleBookEntryState.WATCH,
        RuleBookEntryState.LOCKED,
        RuleBookEntryState.BLOCKED,
      ];
      for (const state of states) {
        const sm = mapEntryStateToStateMachine(state);
        const back = mapStateMachineToEntryState(sm);
        expect(back).toBe(state);
      }
    });
  });

  describe('validateEntryStateMapping', () => {
    it('passes for canonical tables', () => {
      const result = validateEntryStateMapping();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('throwOnError does not throw when valid', () => {
      expect(() => validateEntryStateMapping({ throwOnError: true })).not.toThrow();
    });
  });

  describe('namespace API', () => {
    it('EntryStateMapping exposes all public functions', () => {
      expect(EntryStateMapping.mapFinalEntryStatusToEntryState).toBe(
        mapFinalEntryStatusToEntryState,
      );
      expect(EntryStateMapping.mapEntryStateToStateMachine).toBe(mapEntryStateToStateMachine);
      expect(EntryStateMapping.mapStateMachineToEntryState).toBe(mapStateMachineToEntryState);
      expect(EntryStateMapping.mapFinalEntryStatusToStateMachine).toBe(
        mapFinalEntryStatusToStateMachine,
      );
      expect(EntryStateMapping.validateEntryStateMapping).toBe(validateEntryStateMapping);
    });

    it('type guards work', () => {
      expect(EntryStateMapping.isFinalEntryStatus(FinalEntryStatus.ENTRY_VALID)).toBe(true);
      expect(EntryStateMapping.isFinalEntryStatus('INVALID')).toBe(false);
      expect(EntryStateMapping.isRuleBookEntryState(RuleBookEntryState.READY)).toBe(true);
      expect(EntryStateMapping.isMappingStateMachineEntryState(StateMachineEntryState.IDLE)).toBe(
        true,
      );
    });
  });

  describe('no mutation', () => {
    it('mapping does not mutate input enum references', () => {
      const status = FinalEntryStatus.ENTRY_VALID;
      const before = JSON.stringify(status);
      mapFinalEntryStatusToEntryState(status);
      expect(JSON.stringify(status)).toBe(before);
    });

    it('mapping tables are not mutated by reads', () => {
      const snapshot = JSON.stringify(FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP);
      mapFinalEntryStatusToEntryState(FinalEntryStatus.ENTRY_VALID);
      expect(JSON.stringify(FINAL_ENTRY_STATUS_TO_RULEBOOK_MAP)).toBe(snapshot);
    });
  });
});

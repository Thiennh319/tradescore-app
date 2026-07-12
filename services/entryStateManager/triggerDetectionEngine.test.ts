/**
 * Trigger Detection Engine — unit test skeleton (Task 02.4.1).
 *
 * No detection logic tests — catalog & docs only.
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { EntryTriggerKind } from './evaluationTypes';
import {
  TRIGGER_EDGE_CASE_SPECS,
  TRIGGER_FAILURE_SCENARIO_SPECS,
  TRIGGER_TYPE_CATALOG,
  TRIGGER_TYPE_CATALOG_LIST,
  validateTriggerCatalog,
} from './triggerDetectionCatalog';
import {
  TriggerDetectionEngine,
  createEmptyTriggerDetectionResult,
} from './triggerDetectionEngine';

const minimalContext = () => ({
  currentEntryState: EntryState.WATCH,
  marketSnapshot: { symbol: 'BTCUSDT', markPrice: 100, timestamp: '2026-07-11T00:00:00Z' },
  signalSnapshot: {
    direction: EsmDirection.LONG,
    canEnter: false,
    decision: 'CHO_THEM',
    hardBlocks: [],
    tradePlanValid: true,
    entryScore: 8.5,
  },
  candidateTransitions: [],
  ruleSnapshot: {
    rulebookVersion: 'RuleBook V2.0.0',
    hardBlocks: [],
    groupBlocks: [],
    decision: 'CHO_THEM',
    placeholderNote: 'test',
  },
});

describe('TriggerDetectionEngine — skeleton', () => {
  describe('TRIGGER_TYPE_CATALOG', () => {
    it('defines exactly 5 trigger kinds', () => {
      expect(TRIGGER_TYPE_CATALOG_LIST).toHaveLength(5);
      expect(TRIGGER_TYPE_CATALOG[EntryTriggerKind.HardBlock].priority).toBe(100);
    });

    it('passes catalog validation', () => {
      const result = validateTriggerCatalog();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('createEmptyTriggerDetectionResult', () => {
    it('returns no triggers (not implemented)', () => {
      const result = createEmptyTriggerDetectionResult(minimalContext());
      expect(result.triggers).toHaveLength(0);
      expect(result.halted).toBe(false);
    });

    it('exposes namespace API', () => {
      const result = TriggerDetectionEngine.createEmptyTriggerDetectionResult(minimalContext());
      expect(result.sortedByPriority).toHaveLength(0);
    });
  });

  describe('edge cases & failures (docs)', () => {
    it('documents edge cases', () => {
      expect(TRIGGER_EDGE_CASE_SPECS.length).toBeGreaterThanOrEqual(5);
      expect(TRIGGER_EDGE_CASE_SPECS.some((e) => e.id === 'EDGE-001')).toBe(true);
    });

    it('documents failure scenarios', () => {
      expect(TRIGGER_FAILURE_SCENARIO_SPECS.length).toBeGreaterThanOrEqual(5);
    });
  });
});

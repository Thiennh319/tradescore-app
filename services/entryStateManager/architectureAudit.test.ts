/**
 * ESM architecture audit — regression guards (Task 02.6.7).
 */

import { describe, expect, it } from 'vitest';
import { ACTION_POLICY } from './actionPolicy';
import { CONFLICT_POLICY, CONFLICT_RESOLUTION_POLICY } from './conflictResolutionPolicy';
import { MODULE_VERSION, ENTRY_STATE_MAPPING_FROZEN_VERSION } from './metadata';
import { EntryStateMapping, validateEntryStateMapping } from './entryStateMapping';
import {
  isRecord,
  validateHaltedCountConsistency,
  validateSequentialOrdersFromOne,
  validateUniqueValues,
} from './pipelineValidationUtils';
import { TRANSITION_POLICY } from './transitionPolicy';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import {
  ActionEngine,
  ActionRuntime,
  ConflictResolver,
  DecisionEngine,
  EntryStateMachine,
  FinalDecisionEngine,
  PriorityResolver,
  RuntimeDispatcher,
  RuntimeExecutor,
  TriggerAggregator,
} from './index';

describe('ESM architecture audit — Task 02.6.7', () => {
  it('MODULE_VERSION is 2.0.0 — entry state mapping bridge frozen', () => {
    expect(MODULE_VERSION).toBe('2.0.0');
  });

  it('ENTRY_STATE_MAPPING_FROZEN_VERSION matches module', () => {
    expect(ENTRY_STATE_MAPPING_FROZEN_VERSION).toBe(MODULE_VERSION);
  });

  it('CONFLICT_POLICY is alias of CONFLICT_RESOLUTION_POLICY', () => {
    expect(CONFLICT_POLICY).toBe(CONFLICT_RESOLUTION_POLICY);
    expect(CONFLICT_POLICY.catalogSource).toBe('TRIGGER_TYPE_CATALOG');
  });

  it('policy SSOT objects are defined', () => {
    expect(ACTION_POLICY.getActionForTransition).toBeTypeOf('function');
    expect(TRANSITION_POLICY.canTransition).toBeTypeOf('function');
    expect(CONFLICT_RESOLUTION_POLICY.resolveByCatalogPriority).toBeTypeOf('function');
    expect(Object.keys(TRIGGER_TYPE_CATALOG).length).toBe(5);
  });

  it('pipeline namespaces expose validate/build entry points', () => {
    expect(TriggerAggregator.aggregateTriggers).toBeTypeOf('function');
    expect(PriorityResolver.resolvePriority).toBeTypeOf('function');
    expect(ConflictResolver.resolveConflicts).toBeTypeOf('function');
    expect(DecisionEngine.buildDecisionEngineResult).toBeTypeOf('function');
    expect(FinalDecisionEngine.buildFinalDecisionResult).toBeTypeOf('function');
    expect(EntryStateMachine.buildEntryStateMachineResult).toBeTypeOf('function');
    expect(ActionEngine.buildActionEngineResult).toBeTypeOf('function');
    expect(ActionRuntime.buildActionRuntimeResult).toBeTypeOf('function');
    expect(RuntimeDispatcher.buildRuntimeDispatcherResult).toBeTypeOf('function');
    expect(RuntimeExecutor.buildRuntimeExecutorResult).toBeTypeOf('function');
  });

  it('shared pipeline validation helpers — isRecord', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });

  it('shared pipeline validation helpers — halted count consistency', () => {
    const errors: string[] = [];
    validateHaltedCountConsistency(true, 1, 'actionCount', errors);
    expect(errors[0]).toBe('halted result must have actionCount 0');
    validateHaltedCountConsistency(false, 1, 'actionCount', errors);
    expect(errors).toHaveLength(1);
  });

  it('shared pipeline validation helpers — sequential orders', () => {
    const errors: string[] = [];
    validateSequentialOrdersFromOne([1, 2, 3], errors);
    expect(errors).toHaveLength(0);
    validateSequentialOrdersFromOne([1, 3], errors);
    expect(errors.some((e) => e.includes('sequential'))).toBe(true);
  });

  it('shared pipeline validation helpers — unique values', () => {
    const errors: string[] = [];
    validateUniqueValues(['a', 'a'], 'duplicate', errors);
    expect(errors[0]).toBe('duplicate');
  });

  it('deterministic id prefixes — no UUID in policy tables', () => {
    const transitions = ACTION_POLICY.listSupportedTransitions();
    for (const row of transitions) {
      expect(row.actionId).toMatch(/^ENTRY-ACTION-\d{3}$/);
    }
    expect(TRANSITION_POLICY).toBeDefined();
  });

  it('EntryStateMapping — validateEntryStateMapping passes', () => {
    expect(validateEntryStateMapping().valid).toBe(true);
  });

  it('EntryStateMapping namespace — exposes mapping API', () => {
    expect(EntryStateMapping.mapFinalEntryStatusToEntryState).toBeTypeOf('function');
    expect(EntryStateMapping.mapEntryStateToStateMachine).toBeTypeOf('function');
    expect(EntryStateMapping.mapStateMachineToEntryState).toBeTypeOf('function');
    expect(EntryStateMapping.validateEntryStateMapping).toBe(validateEntryStateMapping);
    expect(EntryStateMapping.ENTRY_STATE_MAPPING_FROZEN_VERSION).toBe(
      ENTRY_STATE_MAPPING_FROZEN_VERSION,
    );
  });
});

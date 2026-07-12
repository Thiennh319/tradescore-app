/**
 * Entry / Exit Actions — scaffold tests (Task 02.6.3 + Fix 02.6.3).
 */

import { describe, expect, it } from 'vitest';
import { EntryState as DomainEntryState, EsmDirection } from './enums';
import {
  ActionEngine,
  buildActionEngineResult,
  buildActionId,
  collectActions,
  validateActionEngineContext,
  validateActionEngineResult,
} from './actionEngine';
import { ACTION_POLICY } from './actionPolicy';
import { EntryActionType } from './actionTypes';
import type { ActionEngineContext } from './actionTypes';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildDecisionEngineResult } from './decisionEngine';
import { buildFinalDecisionResult } from './finalDecisionEngine';
import type { FinalDecisionResult } from './finalDecisionTypes';
import { resolveConflicts } from './conflictResolver';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
import { buildEntryStateMachineResult } from './stateMachine';
import { EntryState, type EntryStateMachineContext, type EntryStateMachineResult } from './stateMachineTypes';

const ACTION_IDS = {
  IDLE_WATCH: 'ENTRY-ACTION-001',
  WATCH_READY: 'ENTRY-ACTION-002',
  READY_ENTRY: 'ENTRY-ACTION-003',
  ENTRY_ACTIVE: 'ENTRY-ACTION-004',
  ACTIVE_EXIT: 'ENTRY-ACTION-005',
  EXIT_IDLE: 'ENTRY-ACTION-006',
} as const;

const clearOutput = () => ({
  hardBlocks: [] as string[],
  groupBlocks: [] as string[],
  blockReasons: [] as string[],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const baseSignalSnapshot = {
  direction: EsmDirection.LONG,
  canEnter: true,
  decision: 'VAO_TU_TIN',
  hardBlocks: [] as string[],
  tradePlanValid: true,
  entryScore: 9.0,
};

const baseMarketSnapshot = {
  symbol: 'BTCUSDT',
  markPrice: 100000,
  timestamp: '2026-07-11T00:00:00Z',
};

const hardBlockDetect = () =>
  detectHardBlock({
    normalizedRuleOutput: normalizeRuleOutput({
      ...clearOutput(),
      hardBlocks: ['L3 MACD vi phạm — score < 1'],
    }),
    currentEntryState: DomainEntryState.BLOCKED,
    candidateTransitions: [],
    signalSnapshot: baseSignalSnapshot,
    marketSnapshot: baseMarketSnapshot,
  });

const buildConflictResult = (slots: Parameters<typeof aggregateTriggers>[0] = {}) => {
  const aggregateResult = aggregateTriggers(slots);
  const priorityResult = resolvePriority({ aggregateResult, scanId: slots.scanId });
  return resolveConflicts({ priorityResult, scanId: slots.scanId });
};

const buildFinalDecision = (scanId?: string): FinalDecisionResult => {
  const conflictResult = buildConflictResult({ hardBlockResult: hardBlockDetect(), scanId });
  const decisionResult = buildDecisionEngineResult({ conflictResult, scanId });
  return buildFinalDecisionResult({ decisionResult, scanId });
};

const buildStateMachineResult = (
  currentState: EntryState,
  scanId = 'scan-action-001',
): EntryStateMachineResult => {
  const context: EntryStateMachineContext = {
    finalDecisionResult: buildFinalDecision(scanId),
    currentState,
    scanId,
  };
  return buildEntryStateMachineResult(context);
};

const actionContext = (
  currentState: EntryState,
  overrides: Partial<ActionEngineContext> = {},
): ActionEngineContext => ({
  stateMachineResult: buildStateMachineResult(currentState),
  scanId: 'scan-action-001',
  ...overrides,
});

describe('ActionEngine — scaffold', () => {
  it('IDLE → WATCH produces NO_ACTION', () => {
    const result = buildActionEngineResult(actionContext(EntryState.IDLE));
    expect(result.halted).toBe(false);
    expect(result.actionCount).toBe(1);
    expect(result.actions[0].actionType).toBe(EntryActionType.NO_ACTION);
    expect(result.actions[0].actionId).toBe(ACTION_IDS.IDLE_WATCH);
    expect(result.actions[0].fromState).toBe(EntryState.IDLE);
    expect(result.actions[0].toState).toBe(EntryState.WATCH);
    expect(validateActionEngineResult(result).valid).toBe(true);
  });

  it('WATCH → READY produces PREPARE_ENTRY', () => {
    const result = buildActionEngineResult(actionContext(EntryState.WATCH));
    expect(result.actions[0].actionType).toBe(EntryActionType.PREPARE_ENTRY);
    expect(result.actions[0].actionId).toBe(ACTION_IDS.WATCH_READY);
    expect(result.actions[0].toState).toBe(EntryState.READY);
  });

  it('READY → ENTRY produces CONFIRM_ENTRY', () => {
    const result = buildActionEngineResult(actionContext(EntryState.READY));
    expect(result.actions[0].actionType).toBe(EntryActionType.CONFIRM_ENTRY);
    expect(result.actions[0].actionId).toBe(ACTION_IDS.READY_ENTRY);
    expect(result.actions[0].toState).toBe(EntryState.ENTRY);
  });

  it('ENTRY → ACTIVE produces OPEN_POSITION', () => {
    const result = buildActionEngineResult(actionContext(EntryState.ENTRY));
    expect(result.actions[0].actionType).toBe(EntryActionType.OPEN_POSITION);
    expect(result.actions[0].actionId).toBe(ACTION_IDS.ENTRY_ACTIVE);
    expect(result.actions[0].toState).toBe(EntryState.ACTIVE);
  });

  it('ACTIVE → EXIT produces PREPARE_EXIT', () => {
    const result = buildActionEngineResult(actionContext(EntryState.ACTIVE));
    expect(result.actions[0].actionType).toBe(EntryActionType.PREPARE_EXIT);
    expect(result.actions[0].actionId).toBe(ACTION_IDS.ACTIVE_EXIT);
    expect(result.actions[0].toState).toBe(EntryState.EXIT);
  });

  it('EXIT → IDLE produces RESET_STATE', () => {
    const result = buildActionEngineResult(actionContext(EntryState.EXIT));
    expect(result.actions[0].actionType).toBe(EntryActionType.RESET_STATE);
    expect(result.actions[0].actionId).toBe(ACTION_IDS.EXIT_IDLE);
    expect(result.actions[0].toState).toBe(EntryState.IDLE);
  });

  it('actionCount equals actions.length', () => {
    const result = buildActionEngineResult(actionContext(EntryState.WATCH));
    expect(result.actionCount).toBe(result.actions.length);
    expect(collectActions(result.stateMachineResult)).toEqual(result.actions);
  });

  it('unique actionId validation — rejects duplicates', () => {
    const base = buildActionEngineResult(actionContext(EntryState.READY));
    const duplicate = {
      ...base.actions[0],
      reason: 'duplicate reason',
    };
    const invalid = {
      ...base,
      actions: [base.actions[0], duplicate],
      actionCount: 2,
    };
    const validation = validateActionEngineResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('actionId'))).toBe(true);
  });

  it('validation — invalid context and halted state machine', () => {
    const missing = {} as ActionEngineContext;
    expect(validateActionEngineContext(missing).valid).toBe(false);

    const haltedResult = {
      ...buildStateMachineResult(EntryState.WATCH),
      halted: true,
      transitionPerformed: false,
      nextState: null,
    };
    expect(
      validateActionEngineContext({ stateMachineResult: haltedResult }).valid,
    ).toBe(false);

    const haltedAction = buildActionEngineResult({ stateMachineResult: haltedResult });
    expect(haltedAction.halted).toBe(true);
    expect(haltedAction.actionCount).toBe(0);
  });

  it('ActionEngine namespace exposes build, collect, validate, and helpers', () => {
    expect(ActionEngine.buildActionEngineResult).toBe(buildActionEngineResult);
    expect(ActionEngine.collectActions).toBe(collectActions);
    expect(ActionEngine.validateActionEngineContext).toBe(validateActionEngineContext);
    expect(ActionEngine.validateActionEngineResult).toBe(validateActionEngineResult);
    expect(ActionEngine.buildActionId).toBe(buildActionId);
  });

  it('deterministic output — same input yields identical actions', () => {
    const context = actionContext(EntryState.ENTRY);
    const first = buildActionEngineResult(context);
    const second = buildActionEngineResult(context);
    expect(second).toEqual(first);
    expect(second.actions[0].actionId).toBe(ACTION_IDS.ENTRY_ACTIVE);
    expect(buildActionId(EntryState.ENTRY, EntryState.ACTIVE)).toBe(ACTION_IDS.ENTRY_ACTIVE);
  });

  it('does not execute actions — metadata only, no execute handler', () => {
    const result = buildActionEngineResult(actionContext(EntryState.ACTIVE));
    for (const action of result.actions) {
      expect(action).not.toHaveProperty('execute');
      expect(action).not.toHaveProperty('dispatch');
      expect(action).not.toHaveProperty('then');
      expect(typeof action.actionId).toBe('string');
      expect(typeof action.reason).toBe('string');
    }
    expect(result.stateMachineResult.currentState).toBe(EntryState.ACTIVE);
  });
});

describe('ActionEngine — Fix 02.6.3 policy cleanup', () => {
  it('ActionEngine always uses ACTION_POLICY for collection', () => {
    const fromState = EntryState.READY;
    const toState = EntryState.ENTRY;
    const stateMachineResult = buildStateMachineResult(fromState);
    const expectedType = ACTION_POLICY.getActionForTransition(fromState, toState);
    const expectedId = ACTION_POLICY.buildActionId(fromState, toState);

    const actions = collectActions(stateMachineResult);
    expect(expectedType).toBe(EntryActionType.CONFIRM_ENTRY);
    expect(actions[0].actionType).toBe(expectedType);
    expect(actions[0].actionId).toBe(expectedId);
  });

  it('buildActionId is stable and policy-backed', () => {
    expect(ACTION_POLICY.buildActionId(EntryState.IDLE, EntryState.WATCH)).toBe(ACTION_IDS.IDLE_WATCH);
    expect(ACTION_POLICY.buildActionId(EntryState.EXIT, EntryState.IDLE)).toBe(ACTION_IDS.EXIT_IDLE);
    expect(buildActionId(EntryState.WATCH, EntryState.READY)).toBe(ACTION_IDS.WATCH_READY);
    expect(buildActionId(EntryState.BLOCKED, EntryState.WATCH)).toBeNull();
  });

  it('action metadata matches ACTION_POLICY', () => {
    const result = buildActionEngineResult(actionContext(EntryState.WATCH));
    const action = result.actions[0];
    const metadata = ACTION_POLICY.getActionMetadata(action.fromState, action.toState);

    expect(metadata).not.toBeNull();
    expect(action.actionId).toBe(metadata?.actionId);
    expect(action.actionType).toBe(metadata?.actionType);
    expect(action.fromState).toBe(metadata?.fromState);
    expect(action.toState).toBe(metadata?.toState);
    expect(ACTION_POLICY.listSupportedTransitions()).toHaveLength(6);
    expect(ACTION_POLICY.isSupportedTransition(EntryState.ENTRY, EntryState.ACTIVE)).toBe(true);
  });
});

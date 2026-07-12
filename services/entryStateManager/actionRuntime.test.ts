/**
 * Action Runtime — tests (Task 02.6.4).
 */

import { describe, expect, it } from 'vitest';
import { EntryState as DomainEntryState, EsmDirection } from './enums';
import { buildActionEngineResult } from './actionEngine';
import type { ActionEngineContext, ActionEngineResult } from './actionTypes';
import { EntryActionType } from './actionTypes';
import {
  ActionRuntime,
  buildActionRuntimeResult,
  buildRuntimeActions,
  validateActionRuntimeContext,
  validateActionRuntimeResult,
} from './actionRuntime';
import { RuntimeActionStatus } from './actionRuntimeTypes';
import type { ActionRuntimeContext } from './actionRuntimeTypes';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildDecisionEngineResult } from './decisionEngine';
import { buildFinalDecisionResult } from './finalDecisionEngine';
import type { FinalDecisionResult } from './finalDecisionTypes';
import { resolveConflicts } from './conflictResolver';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
import { buildEntryStateMachineResult } from './stateMachine';
import { EntryState, type EntryStateMachineContext } from './stateMachineTypes';

const ACTION_IDS = {
  WATCH_READY: 'ENTRY-ACTION-002',
  ENTRY_ACTIVE: 'ENTRY-ACTION-004',
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

const buildActionResult = (currentState: EntryState): ActionEngineResult => {
  const context: EntryStateMachineContext = {
    finalDecisionResult: buildFinalDecision('scan-runtime-001'),
    currentState,
    scanId: 'scan-runtime-001',
  };
  const engineContext: ActionEngineContext = {
    stateMachineResult: buildEntryStateMachineResult(context),
    scanId: 'scan-runtime-001',
  };
  return buildActionEngineResult(engineContext);
};

const runtimeContext = (
  currentState: EntryState,
  overrides: Partial<ActionRuntimeContext> = {},
): ActionRuntimeContext => ({
  actionEngineResult: buildActionResult(currentState),
  scanId: 'scan-runtime-001',
  ...overrides,
});

describe('ActionRuntime — plan only', () => {
  it('valid context passes validation', () => {
    const context = runtimeContext(EntryState.WATCH);
    const validation = validateActionRuntimeContext(context);
    expect(validation.valid).toBe(true);

    const result = buildActionRuntimeResult(context);
    expect(result.halted).toBe(false);
    expect(result.actionCount).toBeGreaterThan(0);
    expect(validateActionRuntimeResult(result).valid).toBe(true);
  });

  it('invalid context — missing actionEngineResult', () => {
    const context = {} as ActionRuntimeContext;
    const validation = validateActionRuntimeContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('actionEngineResult');

    const result = buildActionRuntimeResult(context);
    expect(result.halted).toBe(true);
    expect(result.actionCount).toBe(0);
  });

  it('empty actions — zero runtime plan', () => {
    const emptyEngineResult: ActionEngineResult = {
      ...buildActionResult(EntryState.BLOCKED),
      actions: [],
      actionCount: 0,
    };
    const result = buildActionRuntimeResult({ actionEngineResult: emptyEngineResult });
    expect(result.runtimeActions).toHaveLength(0);
    expect(result.actionCount).toBe(0);
    expect(validateActionRuntimeResult(result).valid).toBe(true);
  });

  it('runtime action created from entry action', () => {
    const result = buildActionRuntimeResult(runtimeContext(EntryState.ENTRY));
    expect(result.runtimeActions).toHaveLength(1);
    expect(result.runtimeActions[0].actionId).toBe(ACTION_IDS.ENTRY_ACTIVE);
    expect(result.runtimeActions[0].actionType).toBe(EntryActionType.OPEN_POSITION);
    expect(result.runtimeActions[0].metadata.fromState).toBe(EntryState.ENTRY);
    expect(result.runtimeActions[0].metadata.toState).toBe(EntryState.ACTIVE);
  });

  it('executionOrder starts at 1', () => {
    const result = buildActionRuntimeResult(runtimeContext(EntryState.WATCH));
    expect(result.runtimeActions[0].executionOrder).toBe(1);
  });

  it('executionOrder is sequential for multiple actions', () => {
    const engineResult = buildActionResult(EntryState.WATCH);
    const multiActionEngine: ActionEngineResult = {
      ...engineResult,
      actions: [
        engineResult.actions[0],
        {
          actionId: 'ENTRY-ACTION-099',
          actionType: EntryActionType.MONITOR_POSITION,
          fromState: EntryState.WATCH,
          toState: EntryState.READY,
          reason: 'secondary placeholder',
        },
      ],
      actionCount: 2,
    };
    const runtimeActions = buildRuntimeActions(multiActionEngine);
    expect(runtimeActions.map((action) => action.executionOrder)).toEqual([1, 2]);
  });

  it('status=PENDING for executable action types', () => {
    const result = buildActionRuntimeResult(runtimeContext(EntryState.WATCH));
    expect(result.runtimeActions[0].status).toBe(RuntimeActionStatus.PENDING);
  });

  it('actionCount validation — rejects mismatch', () => {
    const base = buildActionRuntimeResult(runtimeContext(EntryState.ENTRY));
    const invalid = {
      ...base,
      actionCount: 2,
    };
    const validation = validateActionRuntimeResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('actionCount'))).toBe(true);
  });

  it('deterministic output — same input yields identical plan', () => {
    const context = runtimeContext(EntryState.WATCH);
    const first = buildActionRuntimeResult(context);
    const second = buildActionRuntimeResult(context);
    expect(second).toEqual(first);
    expect(second.runtimeActions[0].actionId).toBe(ACTION_IDS.WATCH_READY);
  });

  it('ActionRuntime namespace exposes build, validate, and helpers', () => {
    expect(ActionRuntime.buildActionRuntimeResult).toBe(buildActionRuntimeResult);
    expect(ActionRuntime.buildRuntimeActions).toBe(buildRuntimeActions);
    expect(ActionRuntime.validateActionRuntimeContext).toBe(validateActionRuntimeContext);
    expect(ActionRuntime.validateActionRuntimeResult).toBe(validateActionRuntimeResult);
  });

  it('validateActionRuntimeResult — rejects duplicate executionOrder', () => {
    const base = buildActionRuntimeResult(runtimeContext(EntryState.ENTRY));
    const invalid = {
      ...base,
      runtimeActions: [
        { ...base.runtimeActions[0], executionOrder: 1 },
        { ...base.runtimeActions[0], actionId: 'ENTRY-ACTION-099', executionOrder: 1 },
      ],
      actionCount: 2,
    };
    const validation = validateActionRuntimeResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('executionOrder'))).toBe(true);
  });

  it('does not execute actions — plan metadata only', () => {
    const result = buildActionRuntimeResult(runtimeContext(EntryState.ACTIVE));
    for (const action of result.runtimeActions) {
      expect(action).not.toHaveProperty('execute');
      expect(action).not.toHaveProperty('dispatch');
      expect(action).not.toHaveProperty('then');
    }
    expect(result.actionEngineResult).toBe(result.context.actionEngineResult);
  });
});

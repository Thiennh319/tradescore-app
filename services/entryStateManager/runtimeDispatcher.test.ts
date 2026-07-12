/**
 * Runtime Dispatcher — scaffold tests (Task 02.6.5).
 */

import { describe, expect, it } from 'vitest';
import { EntryState as DomainEntryState, EsmDirection } from './enums';
import { buildActionEngineResult } from './actionEngine';
import type { ActionEngineContext, ActionEngineResult } from './actionTypes';
import { buildActionRuntimeResult } from './actionRuntime';
import type { ActionRuntimeContext, ActionRuntimeResult } from './actionRuntimeTypes';
import { RuntimeActionStatus } from './actionRuntimeTypes';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildDecisionEngineResult } from './decisionEngine';
import { buildFinalDecisionResult } from './finalDecisionEngine';
import type { FinalDecisionResult } from './finalDecisionTypes';
import { resolveConflicts } from './conflictResolver';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
import {
  RuntimeDispatcher,
  buildDispatchId,
  buildDispatchPlan,
  buildRuntimeDispatcherResult,
  validateRuntimeDispatcherContext,
  validateRuntimeDispatcherResult,
} from './runtimeDispatcher';
import { RuntimeDispatchStatus } from './runtimeDispatcherTypes';
import type { RuntimeDispatcherContext } from './runtimeDispatcherTypes';
import { buildEntryStateMachineResult } from './stateMachine';
import { EntryState, type EntryStateMachineContext } from './stateMachineTypes';

const ACTION_IDS = {
  IDLE_WATCH: 'ENTRY-ACTION-001',
  WATCH_READY: 'ENTRY-ACTION-002',
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
    finalDecisionResult: buildFinalDecision('scan-dispatch-001'),
    currentState,
    scanId: 'scan-dispatch-001',
  };
  const engineContext: ActionEngineContext = {
    stateMachineResult: buildEntryStateMachineResult(context),
    scanId: 'scan-dispatch-001',
  };
  return buildActionEngineResult(engineContext);
};

const buildRuntimeResult = (currentState: EntryState): ActionRuntimeResult => {
  const runtimeContext: ActionRuntimeContext = {
    actionEngineResult: buildActionResult(currentState),
    scanId: 'scan-dispatch-001',
  };
  return buildActionRuntimeResult(runtimeContext);
};

const dispatcherContext = (
  currentState: EntryState,
  overrides: Partial<RuntimeDispatcherContext> = {},
): RuntimeDispatcherContext => ({
  actionRuntimeResult: buildRuntimeResult(currentState),
  scanId: 'scan-dispatch-001',
  ...overrides,
});

describe('RuntimeDispatcher — scaffold', () => {
  it('valid context passes validation', () => {
    const context = dispatcherContext(EntryState.WATCH);
    const validation = validateRuntimeDispatcherContext(context);
    expect(validation.valid).toBe(true);

    const result = buildRuntimeDispatcherResult(context);
    expect(result.halted).toBe(false);
    expect(result.dispatchCount).toBeGreaterThan(0);
    expect(validateRuntimeDispatcherResult(result).valid).toBe(true);
  });

  it('invalid context — missing actionRuntimeResult', () => {
    const context = {} as RuntimeDispatcherContext;
    const validation = validateRuntimeDispatcherContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('actionRuntimeResult');

    const result = buildRuntimeDispatcherResult(context);
    expect(result.halted).toBe(true);
    expect(result.dispatchCount).toBe(0);
  });

  it('empty runtime actions — zero dispatch plan', () => {
    const emptyRuntime: ActionRuntimeResult = {
      ...buildRuntimeResult(EntryState.BLOCKED),
      runtimeActions: [],
      actionCount: 0,
    };
    const result = buildRuntimeDispatcherResult({ actionRuntimeResult: emptyRuntime });
    expect(result.dispatchPlan).toHaveLength(0);
    expect(result.dispatchCount).toBe(0);
    expect(validateRuntimeDispatcherResult(result).valid).toBe(true);
  });

  it('dispatch item created from runtime action', () => {
    const result = buildRuntimeDispatcherResult(dispatcherContext(EntryState.WATCH));
    expect(result.dispatchPlan).toHaveLength(1);
    expect(result.dispatchPlan[0].actionId).toBe(ACTION_IDS.WATCH_READY);
    expect(result.dispatchPlan[0].dispatchId).toBe('DISPATCH-001');
    expect(result.dispatchPlan[0].metadata.fromState).toBe(EntryState.WATCH);
    expect(result.dispatchPlan[0].metadata.toState).toBe(EntryState.READY);
  });

  it('dispatchCount validation — rejects mismatch', () => {
    const base = buildRuntimeDispatcherResult(dispatcherContext(EntryState.WATCH));
    const invalid = {
      ...base,
      dispatchCount: 2,
    };
    const validation = validateRuntimeDispatcherResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('dispatchCount'))).toBe(true);
  });

  it('dispatchId is deterministic', () => {
    expect(buildDispatchId(1)).toBe('DISPATCH-001');
    expect(buildDispatchId(2)).toBe('DISPATCH-002');
    const result = buildRuntimeDispatcherResult(dispatcherContext(EntryState.ENTRY));
    expect(result.dispatchPlan[0].dispatchId).toBe('DISPATCH-001');
  });

  it('QUEUED mapping for PENDING runtime action', () => {
    const result = buildRuntimeDispatcherResult(dispatcherContext(EntryState.WATCH));
    expect(result.actionRuntimeResult.runtimeActions[0].status).toBe(RuntimeActionStatus.PENDING);
    expect(result.dispatchPlan[0].dispatchStatus).toBe(RuntimeDispatchStatus.QUEUED);
  });

  it('SKIPPED mapping for SKIPPED runtime action', () => {
    const result = buildRuntimeDispatcherResult(dispatcherContext(EntryState.IDLE));
    expect(result.actionRuntimeResult.runtimeActions[0].status).toBe(RuntimeActionStatus.SKIPPED);
    expect(result.dispatchPlan[0].dispatchStatus).toBe(RuntimeDispatchStatus.SKIPPED);
    expect(result.dispatchPlan[0].actionId).toBe(ACTION_IDS.IDLE_WATCH);
  });

  it('executionOrder preserved from runtime actions', () => {
    const runtimeResult = buildRuntimeResult(EntryState.WATCH);
    const plan = buildDispatchPlan(runtimeResult);
    expect(plan[0].executionOrder).toBe(runtimeResult.runtimeActions[0].executionOrder);
    expect(plan[0].executionOrder).toBe(1);
  });

  it('validateRuntimeDispatcherResult — rejects duplicate dispatchId', () => {
    const base = buildRuntimeDispatcherResult(dispatcherContext(EntryState.WATCH));
    const invalid = {
      ...base,
      dispatchPlan: [
        base.dispatchPlan[0],
        { ...base.dispatchPlan[0], actionId: 'ENTRY-ACTION-099' },
      ],
      dispatchCount: 2,
    };
    const validation = validateRuntimeDispatcherResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('dispatchId'))).toBe(true);
  });

  it('RuntimeDispatcher namespace exposes build, validate, and helpers', () => {
    expect(RuntimeDispatcher.buildRuntimeDispatcherResult).toBe(buildRuntimeDispatcherResult);
    expect(RuntimeDispatcher.buildDispatchPlan).toBe(buildDispatchPlan);
    expect(RuntimeDispatcher.buildDispatchId).toBe(buildDispatchId);
    expect(RuntimeDispatcher.validateRuntimeDispatcherContext).toBe(validateRuntimeDispatcherContext);
    expect(RuntimeDispatcher.validateRuntimeDispatcherResult).toBe(validateRuntimeDispatcherResult);
  });

  it('does not execute dispatch — plan metadata only', () => {
    const result = buildRuntimeDispatcherResult(dispatcherContext(EntryState.ACTIVE));
    for (const item of result.dispatchPlan) {
      expect(item).not.toHaveProperty('execute');
      expect(item).not.toHaveProperty('dispatch');
      expect(item).not.toHaveProperty('then');
    }
    expect(result.actionRuntimeResult).toBe(result.context.actionRuntimeResult);
  });
});

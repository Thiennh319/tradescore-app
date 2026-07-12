/**
 * Runtime Executor — scaffold tests (Task 02.6.6).
 */

import { describe, expect, it } from 'vitest';
import { EntryState as DomainEntryState, EsmDirection } from './enums';
import { buildActionEngineResult } from './actionEngine';
import type { ActionEngineContext, ActionEngineResult } from './actionTypes';
import { buildActionRuntimeResult } from './actionRuntime';
import type { ActionRuntimeContext, ActionRuntimeResult } from './actionRuntimeTypes';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildDecisionEngineResult } from './decisionEngine';
import { buildFinalDecisionResult } from './finalDecisionEngine';
import type { FinalDecisionResult } from './finalDecisionTypes';
import { resolveConflicts } from './conflictResolver';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
import { buildRuntimeDispatcherResult } from './runtimeDispatcher';
import type { RuntimeDispatcherContext, RuntimeDispatcherResult } from './runtimeDispatcherTypes';
import { RuntimeDispatchStatus } from './runtimeDispatcherTypes';
import {
  RuntimeExecutor,
  buildExecutionId,
  buildExecutionPlan,
  buildRuntimeExecutorResult,
  validateRuntimeExecutorContext,
  validateRuntimeExecutorResult,
} from './runtimeExecutor';
import { RuntimeExecutionStatus } from './runtimeExecutorTypes';
import type { RuntimeExecutorContext } from './runtimeExecutorTypes';
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
    finalDecisionResult: buildFinalDecision('scan-executor-001'),
    currentState,
    scanId: 'scan-executor-001',
  };
  const engineContext: ActionEngineContext = {
    stateMachineResult: buildEntryStateMachineResult(context),
    scanId: 'scan-executor-001',
  };
  return buildActionEngineResult(engineContext);
};

const buildRuntimeResult = (currentState: EntryState): ActionRuntimeResult => {
  const runtimeContext: ActionRuntimeContext = {
    actionEngineResult: buildActionResult(currentState),
    scanId: 'scan-executor-001',
  };
  return buildActionRuntimeResult(runtimeContext);
};

const buildDispatcherResult = (currentState: EntryState): RuntimeDispatcherResult => {
  const dispatcherContext: RuntimeDispatcherContext = {
    actionRuntimeResult: buildRuntimeResult(currentState),
    scanId: 'scan-executor-001',
  };
  return buildRuntimeDispatcherResult(dispatcherContext);
};

const executorContext = (
  currentState: EntryState,
  overrides: Partial<RuntimeExecutorContext> = {},
): RuntimeExecutorContext => ({
  runtimeDispatcherResult: buildDispatcherResult(currentState),
  scanId: 'scan-executor-001',
  ...overrides,
});

describe('RuntimeExecutor — scaffold', () => {
  it('valid context passes validation', () => {
    const context = executorContext(EntryState.WATCH);
    const validation = validateRuntimeExecutorContext(context);
    expect(validation.valid).toBe(true);

    const result = buildRuntimeExecutorResult(context);
    expect(result.halted).toBe(false);
    expect(result.executionCount).toBeGreaterThan(0);
    expect(validateRuntimeExecutorResult(result).valid).toBe(true);
  });

  it('invalid context — missing runtimeDispatcherResult', () => {
    const context = {} as RuntimeExecutorContext;
    const validation = validateRuntimeExecutorContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('runtimeDispatcherResult');

    const result = buildRuntimeExecutorResult(context);
    expect(result.halted).toBe(true);
    expect(result.executionCount).toBe(0);
  });

  it('empty dispatch plan — zero execution plan', () => {
    const emptyDispatcher: RuntimeDispatcherResult = {
      ...buildDispatcherResult(EntryState.BLOCKED),
      dispatchPlan: [],
      dispatchCount: 0,
    };
    const result = buildRuntimeExecutorResult({ runtimeDispatcherResult: emptyDispatcher });
    expect(result.executionPlan).toHaveLength(0);
    expect(result.executionCount).toBe(0);
    expect(validateRuntimeExecutorResult(result).valid).toBe(true);
  });

  it('execution item created from dispatch item', () => {
    const result = buildRuntimeExecutorResult(executorContext(EntryState.WATCH));
    expect(result.executionPlan).toHaveLength(1);
    expect(result.executionPlan[0].actionId).toBe(ACTION_IDS.WATCH_READY);
    expect(result.executionPlan[0].dispatchId).toBe('DISPATCH-001');
    expect(result.executionPlan[0].executionId).toBe('EXECUTION-001');
    expect(result.executionPlan[0].metadata.fromState).toBe(EntryState.WATCH);
    expect(result.executionPlan[0].metadata.toState).toBe(EntryState.READY);
  });

  it('executionCount validation — rejects mismatch', () => {
    const base = buildRuntimeExecutorResult(executorContext(EntryState.WATCH));
    const invalid = {
      ...base,
      executionCount: 2,
    };
    const validation = validateRuntimeExecutorResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('executionCount'))).toBe(true);
  });

  it('executionId is deterministic', () => {
    expect(buildExecutionId(1)).toBe('EXECUTION-001');
    expect(buildExecutionId(2)).toBe('EXECUTION-002');
    const result = buildRuntimeExecutorResult(executorContext(EntryState.ENTRY));
    expect(result.executionPlan[0].executionId).toBe('EXECUTION-001');
  });

  it('READY mapping for QUEUED dispatch item', () => {
    const result = buildRuntimeExecutorResult(executorContext(EntryState.WATCH));
    expect(result.runtimeDispatcherResult.dispatchPlan[0].dispatchStatus).toBe(
      RuntimeDispatchStatus.QUEUED,
    );
    expect(result.executionPlan[0].executionStatus).toBe(RuntimeExecutionStatus.READY);
  });

  it('SKIPPED mapping for SKIPPED dispatch item', () => {
    const result = buildRuntimeExecutorResult(executorContext(EntryState.IDLE));
    expect(result.runtimeDispatcherResult.dispatchPlan[0].dispatchStatus).toBe(
      RuntimeDispatchStatus.SKIPPED,
    );
    expect(result.executionPlan[0].executionStatus).toBe(RuntimeExecutionStatus.SKIPPED);
    expect(result.executionPlan[0].actionId).toBe(ACTION_IDS.IDLE_WATCH);
  });

  it('executionOrder preserved from dispatch plan', () => {
    const dispatcherResult = buildDispatcherResult(EntryState.WATCH);
    const plan = buildExecutionPlan(dispatcherResult);
    expect(plan[0].executionOrder).toBe(dispatcherResult.dispatchPlan[0].executionOrder);
    expect(plan[0].executionOrder).toBe(1);
  });

  it('validateRuntimeExecutorResult — rejects duplicate executionId', () => {
    const base = buildRuntimeExecutorResult(executorContext(EntryState.WATCH));
    const invalid = {
      ...base,
      executionPlan: [
        base.executionPlan[0],
        { ...base.executionPlan[0], dispatchId: 'DISPATCH-099', actionId: 'ENTRY-ACTION-099' },
      ],
      executionCount: 2,
    };
    const validation = validateRuntimeExecutorResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('executionId'))).toBe(true);
  });

  it('RuntimeExecutor namespace exposes build, validate, and helpers', () => {
    expect(RuntimeExecutor.buildRuntimeExecutorResult).toBe(buildRuntimeExecutorResult);
    expect(RuntimeExecutor.buildExecutionPlan).toBe(buildExecutionPlan);
    expect(RuntimeExecutor.buildExecutionId).toBe(buildExecutionId);
    expect(RuntimeExecutor.validateRuntimeExecutorContext).toBe(validateRuntimeExecutorContext);
    expect(RuntimeExecutor.validateRuntimeExecutorResult).toBe(validateRuntimeExecutorResult);
  });

  it('does not execute runtime — execution plan metadata only', () => {
    const result = buildRuntimeExecutorResult(executorContext(EntryState.ACTIVE));
    for (const item of result.executionPlan) {
      expect(item).not.toHaveProperty('execute');
      expect(item).not.toHaveProperty('dispatch');
      expect(item).not.toHaveProperty('then');
    }
    expect(result.runtimeDispatcherResult).toBe(result.context.runtimeDispatcherResult);
  });
});

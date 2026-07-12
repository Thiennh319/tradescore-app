/**
 * Integration Harness — tests (Task 02.7.3).
 */

import { describe, expect, it, vi } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import {
  IntegrationHarness,
  buildIntegrationHarnessResult,
  validateIntegrationHarnessContext,
  validateIntegrationHarnessResult,
} from './integrationHarness';
import type { IntegrationHarnessContext } from './integrationHarnessTypes';
import * as pipelineOrchestratorModule from './pipelineOrchestrator';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import * as signalBoardAdapterModule from './signalBoardAdapter';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const SCAN_ID = 'scan-harness-001';

const baseMarketSnapshot = {
  symbol: 'BTCUSDT',
  markPrice: 100000,
  timestamp: '2026-07-12T00:00:00Z',
};

const baseSignalBoardScan = {
  symbol: 'BTCUSDT',
  price: 100000,
  direction: 'LONG',
  canEnter: true,
  hardBlocked: false,
};

const baseSignalSnapshot = {
  direction: EsmDirection.LONG,
  canEnter: true,
  decision: 'VAO_TU_TIN',
  hardBlocks: [] as string[],
  tradePlanValid: true,
  entryScore: 9.0,
};

const clearOutput = () => ({
  hardBlocks: [] as string[],
  groupBlocks: [] as string[],
  blockReasons: [] as string[],
  adxGateBlocked: false,
  tradePlanValid: true,
  decision: 'VAO_TU_TIN',
});

const hardBlockContext = (): HardBlockDetectionContext => ({
  normalizedRuleOutput: normalizeRuleOutput({
    ...clearOutput(),
    hardBlocks: ['L3 MACD vi phạm — score < 1'],
  }),
  currentEntryState: EntryState.BLOCKED,
  candidateTransitions: [],
  signalSnapshot: baseSignalSnapshot,
  marketSnapshot: baseMarketSnapshot,
});

const buildHarnessContext = (
  overrides: Partial<IntegrationHarnessContext> = {},
): IntegrationHarnessContext => {
  const hardBlockResult = detectHardBlock(hardBlockContext());
  return {
    signalBoardScan: { ...baseSignalBoardScan },
    marketSnapshot: { ...baseMarketSnapshot },
    triggerSnapshot: { hardBlockResult },
    currentState: StateMachineEntryState.IDLE,
    scanId: SCAN_ID,
    timestamp: '2026-07-12T00:00:00Z',
    ...overrides,
  };
};

describe('IntegrationHarness — Task 02.7.3', () => {
  it('validateIntegrationHarnessContext — valid context passes', () => {
    expect(validateIntegrationHarnessContext(buildHarnessContext()).valid).toBe(true);
  });

  it('validateIntegrationHarnessContext — invalid scanId fails', () => {
    const validation = validateIntegrationHarnessContext(buildHarnessContext({ scanId: '' }));
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('scanId'))).toBe(true);
  });

  it('validateIntegrationHarnessContext — invalid currentState fails', () => {
    const validation = validateIntegrationHarnessContext(
      buildHarnessContext({ currentState: 'INVALID' as StateMachineEntryState }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('currentState'))).toBe(true);
  });

  it('currentState passthrough — injected state appears in pipeline result', () => {
    const result = buildIntegrationHarnessResult(
      buildHarnessContext({ currentState: StateMachineEntryState.READY }),
    );
    expect(result.pipelineResult.stateMachineResult.currentState).toBe(StateMachineEntryState.READY);
    expect(result.context.currentState).toBe(StateMachineEntryState.READY);
    expect(validateIntegrationHarnessResult(result).valid).toBe(true);
  });

  it('adapter called — buildSignalBoardAdapterResult invoked', () => {
    const spy = vi.spyOn(signalBoardAdapterModule, 'buildSignalBoardAdapterResult');
    buildIntegrationHarnessResult(buildHarnessContext());
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('orchestrator called — buildPipelineOrchestratorResult invoked', () => {
    const spy = vi.spyOn(pipelineOrchestratorModule, 'buildPipelineOrchestratorResult');
    buildIntegrationHarnessResult(buildHarnessContext());
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('deterministic — identical inputs produce identical outputs', () => {
    const context = buildHarnessContext();
    const first = buildIntegrationHarnessResult(context);
    const second = buildIntegrationHarnessResult(context);
    expect(first.halted).toBe(second.halted);
    expect(first.pipelineResult.aggregateResult.triggerCount).toBe(
      second.pipelineResult.aggregateResult.triggerCount,
    );
    expect(first.pipelineResult.stateMachineResult.currentState).toBe(
      second.pipelineResult.stateMachineResult.currentState,
    );
  });

  it('no mutation — harness does not mutate input context', () => {
    const context = buildHarnessContext();
    const before = JSON.stringify(context);
    buildIntegrationHarnessResult(context);
    expect(JSON.stringify(context)).toBe(before);
  });

  it('halted propagation — invalid detector halts harness', () => {
    const hardBlockResult = detectHardBlock(hardBlockContext());
    const invalidHardBlock = { ...hardBlockResult, priority: 999 };
    const result = buildIntegrationHarnessResult(
      buildHarnessContext({
        triggerSnapshot: { hardBlockResult: invalidHardBlock },
      }),
    );
    expect(result.pipelineResult.aggregateResult.halted).toBe(true);
    expect(result.halted).toBe(true);
    expect(result.message).toContain('halted');
  });

  it('validateIntegrationHarnessResult — halted mismatch fails', () => {
    const result = buildIntegrationHarnessResult(buildHarnessContext());
    const broken = { ...result, halted: !result.halted };
    const validation = validateIntegrationHarnessResult(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('halted must match'))).toBe(true);
  });

  it('validateIntegrationHarnessResult — currentState mismatch fails', () => {
    const result = buildIntegrationHarnessResult(buildHarnessContext());
    const broken = {
      ...result,
      context: { ...result.context, currentState: StateMachineEntryState.ACTIVE },
    };
    const validation = validateIntegrationHarnessResult(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('currentState'))).toBe(true);
  });

  it('buildIntegrationHarnessResult — throws on invalid context', () => {
    expect(() => buildIntegrationHarnessResult(buildHarnessContext({ scanId: '' }))).toThrow(
      /invalid IntegrationHarnessContext/,
    );
  });

  it('IntegrationHarness namespace exposes public API', () => {
    expect(IntegrationHarness.buildIntegrationHarnessResult).toBe(buildIntegrationHarnessResult);
    expect(IntegrationHarness.validateIntegrationHarnessContext).toBe(
      validateIntegrationHarnessContext,
    );
    expect(IntegrationHarness.validateIntegrationHarnessResult).toBe(
      validateIntegrationHarnessResult,
    );
  });

  it('full integration success — adapter and pipeline results present', () => {
    const result = buildIntegrationHarnessResult(buildHarnessContext());
    expect(result.adapterResult.scanId).toBe(SCAN_ID);
    expect(result.pipelineResult.finalDecisionResult.finalDecision).not.toBeNull();
    expect(result.pipelineResult.runtimeExecutorResult.executionCount).toBeGreaterThanOrEqual(0);
    expect(validateIntegrationHarnessResult(result).valid).toBe(true);
  });

  it('regression — orchestrator and adapter tests unaffected', () => {
    const result = buildIntegrationHarnessResult(
      buildHarnessContext({ currentState: StateMachineEntryState.WATCH }),
    );
    expect(result.halted).toBe(false);
    expect(result.pipelineResult.priorityResult.aggregateResult).toBe(
      result.pipelineResult.aggregateResult,
    );
  });
});

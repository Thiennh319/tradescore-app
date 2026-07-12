/**
 * Pipeline Orchestrator — tests (Task 02.7.2).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { buildSignalBoardAdapterResult } from './signalBoardAdapter';
import type { SignalBoardAdapterContext, SignalBoardAdapterResult } from './signalBoardAdapterTypes';
import {
  PipelineOrchestrator,
  buildPipelineOrchestratorResult,
  validatePipelineOrchestratorContext,
  validatePipelineOrchestratorResult,
} from './pipelineOrchestrator';
import type { PipelineOrchestratorContext } from './pipelineOrchestratorTypes';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const SCAN_ID = 'scan-orchestrator-001';

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

const buildAdapterResult = (scanId = SCAN_ID): SignalBoardAdapterResult => {
  const hardBlockResult = detectHardBlock(hardBlockContext());
  const adapterContext: SignalBoardAdapterContext = {
    signalBoardScan: { ...baseSignalBoardScan },
    marketSnapshot: { ...baseMarketSnapshot },
    triggerSnapshot: { hardBlockResult },
    scanId,
    timestamp: '2026-07-12T00:00:00Z',
  };
  return buildSignalBoardAdapterResult(adapterContext);
};

const buildOrchestratorContext = (
  overrides: Partial<PipelineOrchestratorContext> = {},
): PipelineOrchestratorContext => ({
  adapterResult: buildAdapterResult(),
  scanId: SCAN_ID,
  ...overrides,
});

describe('PipelineOrchestrator — Task 02.7.2', () => {
  it('validatePipelineOrchestratorContext — valid context passes', () => {
    const validation = validatePipelineOrchestratorContext(buildOrchestratorContext());
    expect(validation.valid).toBe(true);
  });

  it('validatePipelineOrchestratorContext — missing scanId fails', () => {
    const validation = validatePipelineOrchestratorContext(
      buildOrchestratorContext({ scanId: '' }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('scanId'))).toBe(true);
  });

  it('validatePipelineOrchestratorContext — missing adapterResult fails', () => {
    const broken = {
      scanId: SCAN_ID,
    } as PipelineOrchestratorContext;
    const validation = validatePipelineOrchestratorContext(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('adapterResult'))).toBe(true);
  });

  it('validatePipelineOrchestratorContext — scanId mismatch with adapter fails', () => {
    const validation = validatePipelineOrchestratorContext(
      buildOrchestratorContext({ scanId: 'other-scan' }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('match adapterResult.scanId'))).toBe(true);
  });

  it('full pipeline success — all stages produce results', () => {
    const result = buildPipelineOrchestratorResult(buildOrchestratorContext());
    expect(result.halted).toBe(false);
    expect(result.aggregateResult.triggerCount).toBe(1);
    expect(result.priorityResult.highestPriority).not.toBeNull();
    expect(result.conflictResult.conflictCount).toBeGreaterThanOrEqual(0);
    expect(result.decisionResult.candidateCount).toBeGreaterThan(0);
    expect(result.finalDecisionResult.finalDecision).not.toBeNull();
    expect(result.stateMachineResult.currentState).toBe(StateMachineEntryState.WATCH);
    expect(result.actionEngineResult.actionCount).toBeGreaterThanOrEqual(0);
    expect(result.runtimeExecutorResult.executionCount).toBeGreaterThanOrEqual(0);
    expect(validatePipelineOrchestratorResult(result).valid).toBe(true);
  });

  it('halted propagation — invalid detector metadata halts aggregate stage', () => {
    const hardBlockResult = detectHardBlock(hardBlockContext());
    const invalidHardBlock = { ...hardBlockResult, priority: 999 };
    const adapterResult = buildSignalBoardAdapterResult({
      signalBoardScan: { ...baseSignalBoardScan },
      marketSnapshot: { ...baseMarketSnapshot },
      triggerSnapshot: { hardBlockResult: invalidHardBlock },
      scanId: SCAN_ID,
      timestamp: '2026-07-12T00:00:00Z',
    });
    const result = buildPipelineOrchestratorResult({ adapterResult, scanId: SCAN_ID });
    expect(result.aggregateResult.halted).toBe(true);
    expect(result.halted).toBe(true);
    expect(result.message).toContain('aggregate:');
  });

  it('deterministic — identical inputs produce identical outputs', () => {
    const context = buildOrchestratorContext();
    const first = buildPipelineOrchestratorResult(context);
    const second = buildPipelineOrchestratorResult(context);
    expect(first.halted).toBe(second.halted);
    expect(first.message).toBe(second.message);
    expect(first.aggregateResult.triggerCount).toBe(second.aggregateResult.triggerCount);
    expect(first.runtimeExecutorResult.executionCount).toBe(second.runtimeExecutorResult.executionCount);
    expect(first.finalDecisionResult.finalDecision?.triggerId).toBe(
      second.finalDecisionResult.finalDecision?.triggerId,
    );
  });

  it('scanId consistency — propagated through all stage contexts', () => {
    const result = buildPipelineOrchestratorResult(buildOrchestratorContext());
    expect(result.aggregateResult.context.scanId).toBe(SCAN_ID);
    expect(result.priorityResult.context.scanId).toBe(SCAN_ID);
    expect(result.conflictResult.context.scanId).toBe(SCAN_ID);
    expect(result.decisionResult.context.scanId).toBe(SCAN_ID);
    expect(result.finalDecisionResult.context.scanId).toBe(SCAN_ID);
    expect(result.stateMachineResult.context.scanId).toBe(SCAN_ID);
    expect(result.actionEngineResult.context.scanId).toBe(SCAN_ID);
    expect(result.actionRuntimeResult.context.scanId).toBe(SCAN_ID);
    expect(result.runtimeDispatcherResult.context.scanId).toBe(SCAN_ID);
    expect(result.runtimeExecutorResult.context.scanId).toBe(SCAN_ID);
  });

  it('no mutation — orchestrator does not mutate input context', () => {
    const context = buildOrchestratorContext();
    const before = JSON.stringify(context);
    buildPipelineOrchestratorResult(context);
    expect(JSON.stringify(context)).toBe(before);
  });

  it('validatePipelineOrchestratorResult — invalid halted flag fails', () => {
    const result = buildPipelineOrchestratorResult(buildOrchestratorContext());
    const broken = { ...result, halted: !result.halted };
    const validation = validatePipelineOrchestratorResult(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('halted must reflect'))).toBe(true);
  });

  it('buildPipelineOrchestratorResult — throws on invalid context', () => {
    expect(() => buildPipelineOrchestratorResult(buildOrchestratorContext({ scanId: '' }))).toThrow(
      /invalid PipelineOrchestratorContext/,
    );
  });

  it('PipelineOrchestrator namespace exposes public API', () => {
    expect(PipelineOrchestrator.buildPipelineOrchestratorResult).toBe(buildPipelineOrchestratorResult);
    expect(PipelineOrchestrator.validatePipelineOrchestratorContext).toBe(
      validatePipelineOrchestratorContext,
    );
    expect(PipelineOrchestrator.validatePipelineOrchestratorResult).toBe(
      validatePipelineOrchestratorResult,
    );
    expect(PipelineOrchestrator.ORCHESTRATOR_DEFAULT_CURRENT_STATE).toBe(StateMachineEntryState.WATCH);
  });

  it('adapter integration — adapter then orchestrator end-to-end', () => {
    const adapterResult = buildAdapterResult();
    const result = buildPipelineOrchestratorResult({ adapterResult, scanId: SCAN_ID });
    expect(result.context.adapterResult.scanId).toBe(SCAN_ID);
    expect(result.aggregateResult.hardBlockResult?.detected).toBe(true);
  });

  it('passthrough chain — each stage references upstream output', () => {
    const result = buildPipelineOrchestratorResult(buildOrchestratorContext());
    expect(result.priorityResult.aggregateResult).toBe(result.aggregateResult);
    expect(result.conflictResult.priorityResult).toBe(result.priorityResult);
    expect(result.decisionResult.conflictResult).toBe(result.conflictResult);
    expect(result.finalDecisionResult.decisionResult).toBe(result.decisionResult);
    expect(result.stateMachineResult.context.finalDecisionResult).toBe(result.finalDecisionResult);
    expect(result.actionEngineResult.stateMachineResult).toBe(result.stateMachineResult);
    expect(result.actionRuntimeResult.actionEngineResult).toBe(result.actionEngineResult);
    expect(result.runtimeDispatcherResult.actionRuntimeResult).toBe(result.actionRuntimeResult);
    expect(result.runtimeExecutorResult.runtimeDispatcherResult).toBe(result.runtimeDispatcherResult);
  });

  it('regression — existing adapter validation still passes after orchestration', () => {
    const adapterResult = buildAdapterResult();
    const orchestratorContext = buildOrchestratorContext({ adapterResult });
    expect(validatePipelineOrchestratorContext(orchestratorContext).valid).toBe(true);
    const result = buildPipelineOrchestratorResult(orchestratorContext);
    expect(validatePipelineOrchestratorResult(result).valid).toBe(true);
  });
});

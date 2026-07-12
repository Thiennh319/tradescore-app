/**
 * Position Adviser Adapter — tests (Task 02.8.1).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildIntegrationHarnessResult } from './integrationHarness';
import type { IntegrationHarnessContext } from './integrationHarnessTypes';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  PositionAdviserAdapter,
  buildPositionAdviserAdapterResult,
  validatePositionAdviserAdapterContext,
  validatePositionAdviserAdapterResult,
} from './positionAdviserAdapter';
import type { PositionAdviserAdapterContext } from './positionAdviserAdapterTypes';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const SCAN_ID = 'scan-pa-adapter-001';
const TIMESTAMP = '2026-07-12T00:00:00Z';

const baseMarketSnapshot = {
  symbol: 'BTCUSDT',
  markPrice: 100000,
  timestamp: TIMESTAMP,
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

const buildHarnessResult = () => {
  const hardBlockResult = detectHardBlock(hardBlockContext());
  const harnessContext: IntegrationHarnessContext = {
    signalBoardScan: { ...baseSignalBoardScan },
    marketSnapshot: { ...baseMarketSnapshot },
    triggerSnapshot: { hardBlockResult },
    currentState: StateMachineEntryState.WATCH,
    scanId: SCAN_ID,
    timestamp: TIMESTAMP,
  };
  return buildIntegrationHarnessResult(harnessContext);
};

const buildAdapterContext = (
  overrides: Partial<PositionAdviserAdapterContext> = {},
): PositionAdviserAdapterContext => ({
  harnessResult: buildHarnessResult(),
  ...overrides,
});

describe('PositionAdviserAdapter — Task 02.8.1', () => {
  it('validatePositionAdviserAdapterContext — valid context passes', () => {
    expect(validatePositionAdviserAdapterContext(buildAdapterContext()).valid).toBe(true);
  });

  it('validatePositionAdviserAdapterContext — missing harnessResult fails', () => {
    const broken = {} as PositionAdviserAdapterContext;
    const validation = validatePositionAdviserAdapterContext(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('harnessResult'))).toBe(true);
  });

  it('mapping decision summary — copies final decision fields', () => {
    const result = buildPositionAdviserAdapterResult(buildAdapterContext());
    expect(result.decisionSummary.finalDecisionPresent).toBe(true);
    expect(result.decisionSummary.triggerKind).toBe('HardBlock');
    expect(result.decisionSummary.candidateCount).toBeGreaterThan(0);
    expect(result.decisionSummary.halted).toBe(false);
  });

  it('mapping state summary — copies state machine fields', () => {
    const result = buildPositionAdviserAdapterResult(buildAdapterContext());
    expect(result.stateSummary.currentState).toBe(StateMachineEntryState.WATCH);
    expect(result.stateSummary.availableTransitionCount).toBeGreaterThan(0);
    expect(typeof result.stateSummary.transitionPerformed).toBe('boolean');
  });

  it('mapping action summary — copies action engine fields', () => {
    const result = buildPositionAdviserAdapterResult(buildAdapterContext());
    expect(result.actionSummary.actionCount).toBe(result.actionSummary.actions.length);
    if (result.actionSummary.actionCount > 0) {
      expect(result.actionSummary.actions[0].actionId).toMatch(/^ENTRY-ACTION-\d{3}$/);
    }
  });

  it('mapping runtime summary — copies executor plan fields', () => {
    const result = buildPositionAdviserAdapterResult(buildAdapterContext());
    expect(result.runtimeSummary.executionCount).toBe(result.runtimeSummary.executions.length);
    if (result.runtimeSummary.executionCount > 0) {
      expect(result.runtimeSummary.executions[0].executionId).toMatch(/^EXECUTION-\d{3}$/);
    }
  });

  it('scanId and timestamp consistency', () => {
    const result = buildPositionAdviserAdapterResult(buildAdapterContext());
    expect(result.scanId).toBe(SCAN_ID);
    expect(result.timestamp).toBe(TIMESTAMP);
    expect(result.context.context.scanId).toBe(SCAN_ID);
    expect(validatePositionAdviserAdapterResult(result).valid).toBe(true);
  });

  it('deterministic — identical inputs produce identical outputs', () => {
    const context = buildAdapterContext();
    const first = buildPositionAdviserAdapterResult(context);
    const second = buildPositionAdviserAdapterResult(context);
    expect(first.decisionSummary.triggerId).toBe(second.decisionSummary.triggerId);
    expect(first.stateSummary.currentState).toBe(second.stateSummary.currentState);
    expect(first.runtimeSummary.executionCount).toBe(second.runtimeSummary.executionCount);
  });

  it('no mutation — adapter does not mutate harness result', () => {
    const context = buildAdapterContext();
    const before = JSON.stringify(context.harnessResult);
    buildPositionAdviserAdapterResult(context);
    expect(JSON.stringify(context.harnessResult)).toBe(before);
  });

  it('validatePositionAdviserAdapterResult — scanId mismatch fails', () => {
    const result = buildPositionAdviserAdapterResult(buildAdapterContext());
    const broken = { ...result, scanId: 'other-scan' };
    const validation = validatePositionAdviserAdapterResult(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('scanId'))).toBe(true);
  });

  it('validatePositionAdviserAdapterResult — timestamp mismatch fails', () => {
    const result = buildPositionAdviserAdapterResult(buildAdapterContext());
    const broken = { ...result, timestamp: 'other-time' };
    const validation = validatePositionAdviserAdapterResult(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('timestamp'))).toBe(true);
  });

  it('buildPositionAdviserAdapterResult — throws on invalid context', () => {
    expect(() => buildPositionAdviserAdapterResult({} as PositionAdviserAdapterContext)).toThrow(
      /invalid PositionAdviserAdapterContext/,
    );
  });

  it('PositionAdviserAdapter namespace exposes public API', () => {
    expect(PositionAdviserAdapter.buildPositionAdviserAdapterResult).toBe(
      buildPositionAdviserAdapterResult,
    );
    expect(PositionAdviserAdapter.validatePositionAdviserAdapterContext).toBe(
      validatePositionAdviserAdapterContext,
    );
    expect(PositionAdviserAdapter.validatePositionAdviserAdapterResult).toBe(
      validatePositionAdviserAdapterResult,
    );
  });

  it('context passthrough — result.context is harness result reference', () => {
    const context = buildAdapterContext();
    const result = buildPositionAdviserAdapterResult(context);
    expect(result.context).toBe(context.harnessResult);
    expect(result.context.pipelineResult.finalDecisionResult).toBeDefined();
  });

  it('regression — integration harness wiring still produces valid adapter output', () => {
    const harnessResult = buildHarnessResult();
    const result = buildPositionAdviserAdapterResult({ harnessResult });
    expect(validatePositionAdviserAdapterResult(result).valid).toBe(true);
    expect(result.decisionSummary.finalDecisionPresent).toBe(true);
  });
});

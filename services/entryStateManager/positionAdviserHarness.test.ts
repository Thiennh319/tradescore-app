/**
 * Position Adviser Integration Harness — tests (Task 02.8.2).
 */

import { describe, expect, it, vi } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildIntegrationHarnessResult } from './integrationHarness';
import type { IntegrationHarnessContext } from './integrationHarnessTypes';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  buildPositionAdviserAdapterResult,
} from './positionAdviserAdapter';
import * as positionAdviserAdapterModule from './positionAdviserAdapter';
import {
  PositionAdviserIntegrationHarness,
  buildPositionAdviserHarnessFromIntegration,
  buildPositionAdviserHarnessResult,
  validatePositionAdviserHarnessContext,
  validatePositionAdviserHarnessResult,
} from './positionAdviserHarness';
import type { PositionAdviserHarnessContext } from './positionAdviserHarnessTypes';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const SCAN_ID = 'scan-pa-harness-001';
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

const buildIntegrationResult = () => {
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

const buildAdapterResult = () => buildPositionAdviserAdapterResult({
  harnessResult: buildIntegrationResult(),
});

const buildHarnessContext = (
  overrides: Partial<PositionAdviserHarnessContext> = {},
): PositionAdviserHarnessContext => {
  const adapterResult = buildAdapterResult();
  return {
    adapterResult,
    scanId: SCAN_ID,
    timestamp: TIMESTAMP,
    ...overrides,
  };
};

describe('PositionAdviserIntegrationHarness — Task 02.8.2', () => {
  it('validatePositionAdviserHarnessContext — valid context passes', () => {
    expect(validatePositionAdviserHarnessContext(buildHarnessContext()).valid).toBe(true);
  });

  it('validatePositionAdviserHarnessContext — missing adapterResult fails', () => {
    const broken = {
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
    } as PositionAdviserHarnessContext;
    const validation = validatePositionAdviserHarnessContext(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('adapterResult'))).toBe(true);
  });

  it('validatePositionAdviserHarnessContext — scanId mismatch fails', () => {
    const validation = validatePositionAdviserHarnessContext(
      buildHarnessContext({ scanId: 'other-scan' }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('scanId'))).toBe(true);
  });

  it('adapter passthrough — result.adapterResult is context reference', () => {
    const context = buildHarnessContext();
    const result = buildPositionAdviserHarnessResult(context);
    expect(result.adapterResult).toBe(context.adapterResult);
    expect(result.positionAdviserInput.scanId).toBe(SCAN_ID);
  });

  it('scanId and timestamp consistency', () => {
    const result = buildPositionAdviserHarnessResult(buildHarnessContext());
    expect(result.scanId).toBe(SCAN_ID);
    expect(result.timestamp).toBe(TIMESTAMP);
    expect(result.context.scanId).toBe(SCAN_ID);
    expect(result.context.timestamp).toBe(TIMESTAMP);
    expect(validatePositionAdviserHarnessResult(result).valid).toBe(true);
  });

  it('positionAdviserInput passthrough — summaries match adapter', () => {
    const context = buildHarnessContext();
    const result = buildPositionAdviserHarnessResult(context);
    expect(result.positionAdviserInput.decisionSummary).toBe(context.adapterResult.decisionSummary);
    expect(result.positionAdviserInput.stateSummary).toBe(context.adapterResult.stateSummary);
    expect(result.positionAdviserInput.actionSummary).toBe(context.adapterResult.actionSummary);
    expect(result.positionAdviserInput.runtimeSummary).toBe(context.adapterResult.runtimeSummary);
  });

  it('deterministic — identical inputs produce identical outputs', () => {
    const context = buildHarnessContext();
    const first = buildPositionAdviserHarnessResult(context);
    const second = buildPositionAdviserHarnessResult(context);
    expect(first.halted).toBe(second.halted);
    expect(first.positionAdviserInput.decisionSummary.triggerId).toBe(
      second.positionAdviserInput.decisionSummary.triggerId,
    );
  });

  it('no mutation — harness does not mutate input context', () => {
    const context = buildHarnessContext();
    const before = JSON.stringify(context);
    buildPositionAdviserHarnessResult(context);
    expect(JSON.stringify(context)).toBe(before);
  });

  it('halted propagation — reflects integration harness halted state', () => {
    const hardBlockResult = detectHardBlock(hardBlockContext());
    const invalidHardBlock = { ...hardBlockResult, priority: 999 };
    const harnessContext: IntegrationHarnessContext = {
      signalBoardScan: { ...baseSignalBoardScan },
      marketSnapshot: { ...baseMarketSnapshot },
      triggerSnapshot: { hardBlockResult: invalidHardBlock },
      currentState: StateMachineEntryState.WATCH,
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
    };
    const integrationResult = buildIntegrationHarnessResult(harnessContext);
    expect(integrationResult.halted).toBe(true);
    const adapterResult = buildPositionAdviserAdapterResult({ harnessResult: integrationResult });
    const result = buildPositionAdviserHarnessResult({
      adapterResult,
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
    });
    expect(result.halted).toBe(true);
    expect(result.message).toContain('halted');
  });

  it('validatePositionAdviserHarnessResult — halted mismatch fails', () => {
    const result = buildPositionAdviserHarnessResult(buildHarnessContext());
    const broken = { ...result, halted: !result.halted };
    const validation = validatePositionAdviserHarnessResult(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('halted'))).toBe(true);
  });

  it('buildPositionAdviserHarnessResult — throws on invalid context', () => {
    expect(() => buildPositionAdviserHarnessResult(buildHarnessContext({ scanId: '' }))).toThrow(
      /invalid PositionAdviserHarnessContext/,
    );
  });

  it('buildPositionAdviserHarnessFromIntegration — full chain integration → adapter → harness', () => {
    const spy = vi.spyOn(positionAdviserAdapterModule, 'buildPositionAdviserAdapterResult');
    const integrationResult = buildIntegrationResult();
    const result = buildPositionAdviserHarnessFromIntegration(integrationResult);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.adapterResult.context).toBe(integrationResult);
    expect(validatePositionAdviserHarnessResult(result).valid).toBe(true);
    spy.mockRestore();
  });

  it('PositionAdviserIntegrationHarness namespace exposes public API', () => {
    expect(PositionAdviserIntegrationHarness.buildPositionAdviserHarnessResult).toBe(
      buildPositionAdviserHarnessResult,
    );
    expect(PositionAdviserIntegrationHarness.validatePositionAdviserHarnessContext).toBe(
      validatePositionAdviserHarnessContext,
    );
    expect(PositionAdviserIntegrationHarness.validatePositionAdviserHarnessResult).toBe(
      validatePositionAdviserHarnessResult,
    );
  });

  it('context passthrough — result.context matches resolved harness context', () => {
    const result = buildPositionAdviserHarnessResult(buildHarnessContext());
    expect(result.context.adapterResult).toBe(result.adapterResult);
    expect(result.context.scanId).toBe(result.scanId);
  });

  it('regression — position adviser adapter tests unaffected', () => {
    const adapterResult = buildAdapterResult();
    const result = buildPositionAdviserHarnessResult({
      adapterResult,
      scanId: SCAN_ID,
      timestamp: TIMESTAMP,
    });
    expect(result.positionAdviserInput.decisionSummary.finalDecisionPresent).toBe(true);
    expect(validatePositionAdviserHarnessResult(result).valid).toBe(true);
  });
});

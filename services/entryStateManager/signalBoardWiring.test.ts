/**
 * Signal Board Wiring — tests (Task 02.7.4).
 */

import { describe, expect, it, vi } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import * as integrationHarnessModule from './integrationHarness';
import { FEATURE_FLAG } from './metadata';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  SignalBoardWiring,
  DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
  isEntryStateManagerEnabled,
  runEntryStateManagerPipeline,
  validateSignalBoardWiringContext,
  validateSignalBoardWiringResult,
} from './signalBoardWiring';
import type { SignalBoardWiringContext } from './signalBoardWiring';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const SCAN_ID = 'scan-wiring-001';

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

const buildWiringContext = (
  overrides: Partial<SignalBoardWiringContext> = {},
): SignalBoardWiringContext => {
  const hardBlockResult = detectHardBlock(hardBlockContext());
  return {
    signalBoardScan: { ...baseSignalBoardScan },
    marketSnapshot: { ...baseMarketSnapshot },
    triggerSnapshot: { hardBlockResult },
    currentState: StateMachineEntryState.WATCH,
    scanId: SCAN_ID,
    timestamp: '2026-07-12T00:00:00Z',
    entryStateManagerEnabled: DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
    ...overrides,
  };
};

describe('SignalBoardWiring — Task 02.7.4', () => {
  it('DEFAULT_ENTRY_STATE_MANAGER_ENABLED is false — production off', () => {
    expect(DEFAULT_ENTRY_STATE_MANAGER_ENABLED).toBe(false);
    expect(FEATURE_FLAG).toBe('ENTRY_STATE_MANAGER_ENABLED');
  });

  it('FEATURE_FLAG OFF — returns null and skips harness', () => {
    const spy = vi.spyOn(integrationHarnessModule, 'buildIntegrationHarnessResult');
    const result = runEntryStateManagerPipeline(buildWiringContext());
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('FEATURE_FLAG ON — runs harness and returns result', () => {
    const result = runEntryStateManagerPipeline(
      buildWiringContext({ entryStateManagerEnabled: true }),
    );
    expect(result).not.toBeNull();
    expect(result?.adapterResult.scanId).toBe(SCAN_ID);
    expect(result?.pipelineResult.aggregateResult.triggerCount).toBe(1);
  });

  it('harness called when FEATURE_FLAG ON', () => {
    const spy = vi.spyOn(integrationHarnessModule, 'buildIntegrationHarnessResult');
    runEntryStateManagerPipeline(buildWiringContext({ entryStateManagerEnabled: true }));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('validateSignalBoardWiringContext — valid context passes', () => {
    expect(validateSignalBoardWiringContext(buildWiringContext()).valid).toBe(true);
    expect(
      validateSignalBoardWiringContext(buildWiringContext({ entryStateManagerEnabled: true })).valid,
    ).toBe(true);
  });

  it('validateSignalBoardWiringContext — invalid scanId fails', () => {
    const validation = validateSignalBoardWiringContext(buildWiringContext({ scanId: '' }));
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('scanId'))).toBe(true);
  });

  it('validateSignalBoardWiringContext — invalid feature flag type fails', () => {
    const broken = {
      ...buildWiringContext(),
      entryStateManagerEnabled: 'yes',
    } as unknown as SignalBoardWiringContext;
    const validation = validateSignalBoardWiringContext(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('entryStateManagerEnabled'))).toBe(true);
  });

  it('validateSignalBoardWiringResult — OFF requires null harness result', () => {
    const context = buildWiringContext();
    expect(validateSignalBoardWiringResult(null, context).valid).toBe(true);
    const validation = validateSignalBoardWiringResult(
      runEntryStateManagerPipeline(buildWiringContext({ entryStateManagerEnabled: true })),
      context,
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('must be null'))).toBe(true);
  });

  it('validateSignalBoardWiringResult — ON requires valid harness result', () => {
    const context = buildWiringContext({ entryStateManagerEnabled: true });
    const result = runEntryStateManagerPipeline(context);
    expect(validateSignalBoardWiringResult(result, context).valid).toBe(true);
    expect(validateSignalBoardWiringResult(null, context).valid).toBe(false);
  });

  it('deterministic — identical inputs produce identical outputs', () => {
    const context = buildWiringContext({ entryStateManagerEnabled: true });
    const first = runEntryStateManagerPipeline(context);
    const second = runEntryStateManagerPipeline(context);
    expect(first?.halted).toBe(second?.halted);
    expect(first?.pipelineResult.aggregateResult.triggerCount).toBe(
      second?.pipelineResult.aggregateResult.triggerCount,
    );
  });

  it('no mutation — wiring does not mutate input context', () => {
    const context = buildWiringContext({ entryStateManagerEnabled: true });
    const before = JSON.stringify(context);
    runEntryStateManagerPipeline(context);
    expect(JSON.stringify(context)).toBe(before);
  });

  it('isEntryStateManagerEnabled — only true enables pipeline', () => {
    expect(isEntryStateManagerEnabled(false)).toBe(false);
    expect(isEntryStateManagerEnabled(true)).toBe(true);
  });

  it('runEntryStateManagerPipeline — throws on invalid context', () => {
    expect(() => runEntryStateManagerPipeline(buildWiringContext({ scanId: '' }))).toThrow(
      /invalid SignalBoardWiringContext/,
    );
  });

  it('SignalBoardWiring namespace exposes public API', () => {
    expect(SignalBoardWiring.runEntryStateManagerPipeline).toBe(runEntryStateManagerPipeline);
    expect(SignalBoardWiring.validateSignalBoardWiringContext).toBe(validateSignalBoardWiringContext);
    expect(SignalBoardWiring.validateSignalBoardWiringResult).toBe(validateSignalBoardWiringResult);
    expect(SignalBoardWiring.FEATURE_FLAG).toBe(FEATURE_FLAG);
  });

  it('regression — harness integration still valid when flag on', () => {
    const context = buildWiringContext({ entryStateManagerEnabled: true });
    const result = runEntryStateManagerPipeline(context);
    expect(result?.pipelineResult.stateMachineResult.currentState).toBe(
      StateMachineEntryState.WATCH,
    );
    expect(validateSignalBoardWiringResult(result, context).valid).toBe(true);
  });
});

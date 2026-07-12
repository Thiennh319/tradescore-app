/**
 * Position Adviser Wiring — tests (Task 02.8.3).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildIntegrationHarnessResult } from './integrationHarness';
import type { IntegrationHarnessContext } from './integrationHarnessTypes';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  buildPositionAdviserHarnessFromIntegration,
} from './positionAdviserHarness';
import {
  PositionAdviserWiring,
  DEFAULT_POSITION_ADVISER_ENABLED,
  FEATURE_FLAG,
  isPositionAdviserEnabled,
  runPositionAdviserPipeline,
  validatePositionAdviserWiringContext,
  validatePositionAdviserWiringResult,
} from './positionAdviserWiring';
import type { PositionAdviserWiringContext } from './positionAdviserWiring';
import { EntryState as StateMachineEntryState } from './stateMachineTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';

const SCAN_ID = 'scan-pa-wiring-001';
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
  const integrationContext: IntegrationHarnessContext = {
    signalBoardScan: { ...baseSignalBoardScan },
    marketSnapshot: { ...baseMarketSnapshot },
    triggerSnapshot: { hardBlockResult },
    currentState: StateMachineEntryState.WATCH,
    scanId: SCAN_ID,
    timestamp: TIMESTAMP,
  };
  return buildPositionAdviserHarnessFromIntegration(buildIntegrationHarnessResult(integrationContext));
};

const buildWiringContext = (
  overrides: Partial<PositionAdviserWiringContext> = {},
): PositionAdviserWiringContext => ({
  harnessResult: buildHarnessResult(),
  positionAdviserEnabled: DEFAULT_POSITION_ADVISER_ENABLED,
  ...overrides,
});

describe('PositionAdviserWiring — Task 02.8.3', () => {
  it('DEFAULT_POSITION_ADVISER_ENABLED is false — production off', () => {
    expect(DEFAULT_POSITION_ADVISER_ENABLED).toBe(false);
    expect(FEATURE_FLAG).toBe('POSITION_ADVISER_ENABLED');
  });

  it('FEATURE_FLAG OFF — returns null', () => {
    const result = runPositionAdviserPipeline(buildWiringContext());
    expect(result).toBeNull();
    expect(validatePositionAdviserWiringResult(result, buildWiringContext()).valid).toBe(true);
  });

  it('FEATURE_FLAG ON — returns harness result passthrough', () => {
    const context = buildWiringContext({ positionAdviserEnabled: true });
    const result = runPositionAdviserPipeline(context);
    expect(result).toBe(context.harnessResult);
    expect(result?.scanId).toBe(SCAN_ID);
    expect(result?.positionAdviserInput.decisionSummary.finalDecisionPresent).toBe(true);
  });

  it('validatePositionAdviserWiringContext — valid context passes', () => {
    expect(validatePositionAdviserWiringContext(buildWiringContext()).valid).toBe(true);
    expect(
      validatePositionAdviserWiringContext(buildWiringContext({ positionAdviserEnabled: true })).valid,
    ).toBe(true);
  });

  it('validatePositionAdviserWiringContext — missing harnessResult fails', () => {
    const broken = {
      positionAdviserEnabled: false,
    } as PositionAdviserWiringContext;
    const validation = validatePositionAdviserWiringContext(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('harnessResult'))).toBe(true);
  });

  it('validatePositionAdviserWiringContext — invalid feature flag type fails', () => {
    const broken = {
      ...buildWiringContext(),
      positionAdviserEnabled: 'yes',
    } as unknown as PositionAdviserWiringContext;
    const validation = validatePositionAdviserWiringContext(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('positionAdviserEnabled'))).toBe(true);
  });

  it('validatePositionAdviserWiringResult — OFF requires null', () => {
    const context = buildWiringContext();
    expect(validatePositionAdviserWiringResult(null, context).valid).toBe(true);
    const validation = validatePositionAdviserWiringResult(
      buildHarnessResult(),
      context,
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('must be null'))).toBe(true);
  });

  it('validatePositionAdviserWiringResult — ON requires harness result', () => {
    const context = buildWiringContext({ positionAdviserEnabled: true });
    const result = runPositionAdviserPipeline(context);
    expect(validatePositionAdviserWiringResult(result, context).valid).toBe(true);
    expect(validatePositionAdviserWiringResult(null, context).valid).toBe(false);
  });

  it('deterministic — identical inputs produce identical outputs', () => {
    const context = buildWiringContext({ positionAdviserEnabled: true });
    const first = runPositionAdviserPipeline(context);
    const second = runPositionAdviserPipeline(context);
    expect(first).toBe(second);
    expect(first?.halted).toBe(second?.halted);
  });

  it('no mutation — wiring does not mutate input context', () => {
    const context = buildWiringContext({ positionAdviserEnabled: true });
    const before = JSON.stringify(context);
    runPositionAdviserPipeline(context);
    expect(JSON.stringify(context)).toBe(before);
  });

  it('isPositionAdviserEnabled — only true enables pipeline', () => {
    expect(isPositionAdviserEnabled(false)).toBe(false);
    expect(isPositionAdviserEnabled(true)).toBe(true);
  });

  it('runPositionAdviserPipeline — throws on invalid context', () => {
    const broken = buildWiringContext();
    const invalidHarness = {
      ...broken.harnessResult,
      scanId: 'mismatch',
    };
    expect(() => runPositionAdviserPipeline({
      harnessResult: invalidHarness,
      positionAdviserEnabled: true,
    })).toThrow(/invalid PositionAdviserWiringContext/);
  });

  it('PositionAdviserWiring namespace exposes public API', () => {
    expect(PositionAdviserWiring.runPositionAdviserPipeline).toBe(runPositionAdviserPipeline);
    expect(PositionAdviserWiring.validatePositionAdviserWiringContext).toBe(
      validatePositionAdviserWiringContext,
    );
    expect(PositionAdviserWiring.validatePositionAdviserWiringResult).toBe(
      validatePositionAdviserWiringResult,
    );
    expect(PositionAdviserWiring.FEATURE_FLAG).toBe(FEATURE_FLAG);
  });

  it('FEATURE_FLAG OFF — harness result not consumed (null discard)', () => {
    const context = buildWiringContext({ positionAdviserEnabled: false });
    const result = runPositionAdviserPipeline(context);
    expect(result).toBeNull();
    expect(context.harnessResult.positionAdviserInput).toBeDefined();
  });

  it('regression — position adviser harness output still valid', () => {
    const harnessResult = buildHarnessResult();
    const context = buildWiringContext({ harnessResult, positionAdviserEnabled: true });
    const result = runPositionAdviserPipeline(context);
    expect(result?.adapterResult).toBe(harnessResult.adapterResult);
    expect(validatePositionAdviserWiringResult(result, context).valid).toBe(true);
  });
});

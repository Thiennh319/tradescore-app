/**
 * Signal Board Scan adapter — tests (Task 02.7.1).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { detectNoise } from './noiseDetectionEngine';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import {
  SignalBoardAdapter,
  buildSignalBoardAdapterResult,
  validateSignalBoardAdapterContext,
  validateSignalBoardAdapterResult,
} from './signalBoardAdapter';
import type { SignalBoardAdapterContext } from './signalBoardAdapterTypes';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';
import type { NoiseDetectionContext } from './noiseDetectionTypes';

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
  decisionLabel: 'VAO_TU_TIN',
  decisionDisplay: 'Vào tự tin',
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

const noiseContext = (): NoiseDetectionContext => ({
  normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
  currentEntryState: EntryState.READY,
  candidateTransitions: [],
  signalSnapshot: { ...baseSignalSnapshot, canEnter: false },
  marketSnapshot: baseMarketSnapshot,
  noiseSignalSnapshot: {
    macdNoiseHint: 'MACD histogram flip 1 scan',
    rsiNoiseHint: null,
    emaFlipHint: null,
    cvdFlipHint: null,
    volumeSpikeHint: null,
    scoreFluctuationHint: null,
    shortTermReversalHint: null,
  },
});

const buildValidContext = (
  overrides: Partial<SignalBoardAdapterContext> = {},
): SignalBoardAdapterContext => {
  const hardBlockResult = detectHardBlock(hardBlockContext());
  return {
    signalBoardScan: { ...baseSignalBoardScan },
    marketSnapshot: { ...baseMarketSnapshot },
    triggerSnapshot: { hardBlockResult },
    scanId: 'scan-sb-001',
    timestamp: '2026-07-12T00:00:00Z',
    ...overrides,
  };
};

describe('SignalBoardAdapter — Task 02.7.1', () => {
  it('validateSignalBoardAdapterContext — valid context passes', () => {
    const context = buildValidContext();
    expect(validateSignalBoardAdapterContext(context).valid).toBe(true);
  });

  it('validateSignalBoardAdapterContext — missing scanId fails', () => {
    const context = buildValidContext({ scanId: '' });
    const validation = validateSignalBoardAdapterContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('scanId'))).toBe(true);
  });

  it('validateSignalBoardAdapterContext — missing timestamp fails', () => {
    const context = buildValidContext({ timestamp: '' });
    const validation = validateSignalBoardAdapterContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('timestamp'))).toBe(true);
  });

  it('validateSignalBoardAdapterContext — missing signalBoardScan fails', () => {
    const context = buildValidContext();
    const broken = { ...context, signalBoardScan: undefined } as unknown as SignalBoardAdapterContext;
    const validation = validateSignalBoardAdapterContext(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('signalBoardScan'))).toBe(true);
  });

  it('validateSignalBoardAdapterContext — symbol mismatch fails', () => {
    const context = buildValidContext({
      marketSnapshot: { ...baseMarketSnapshot, symbol: 'ETHUSDT' },
    });
    const validation = validateSignalBoardAdapterContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('symbol'))).toBe(true);
  });

  it('buildSignalBoardAdapterResult — maps detector slots to aggregateContext', () => {
    const context = buildValidContext();
    const result = buildSignalBoardAdapterResult(context);
    expect(result.aggregateContext.hardBlockResult?.detected).toBe(true);
    expect(result.aggregateContext.scanId).toBe('scan-sb-001');
    expect(result.scanId).toBe('scan-sb-001');
    expect(result.timestamp).toBe('2026-07-12T00:00:00Z');
  });

  it('buildSignalBoardAdapterResult — wires priority, conflict, decision contexts with scanId', () => {
    const result = buildSignalBoardAdapterResult(buildValidContext());
    expect(result.priorityContext.scanId).toBe('scan-sb-001');
    expect(result.conflictContext.scanId).toBe('scan-sb-001');
    expect(result.decisionContext.scanId).toBe('scan-sb-001');
    expect(result.priorityContext.aggregateResult.triggerCount).toBe(1);
    expect(result.conflictContext.priorityResult.aggregateResult).toBe(
      result.priorityContext.aggregateResult,
    );
    expect(result.decisionContext.conflictResult.context.priorityResult).toBe(
      result.conflictContext.priorityResult,
    );
  });

  it('buildSignalBoardAdapterResult — does not mutate input', () => {
    const context = buildValidContext();
    const scanBefore = JSON.stringify(context.signalBoardScan);
    const triggerBefore = JSON.stringify(context.triggerSnapshot);
    const marketBefore = JSON.stringify(context.marketSnapshot);
    buildSignalBoardAdapterResult(context);
    expect(JSON.stringify(context.signalBoardScan)).toBe(scanBefore);
    expect(JSON.stringify(context.triggerSnapshot)).toBe(triggerBefore);
    expect(JSON.stringify(context.marketSnapshot)).toBe(marketBefore);
  });

  it('validateSignalBoardAdapterResult — valid mapped result passes', () => {
    const result = buildSignalBoardAdapterResult(buildValidContext());
    expect(validateSignalBoardAdapterResult(result).valid).toBe(true);
  });

  it('validateSignalBoardAdapterResult — mismatched scanId in aggregateContext fails', () => {
    const result = buildSignalBoardAdapterResult(buildValidContext());
    const broken = {
      ...result,
      aggregateContext: { ...result.aggregateContext, scanId: 'other' },
    };
    const validation = validateSignalBoardAdapterResult(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('aggregateContext.scanId'))).toBe(true);
  });

  it('integration smoke — adapt then aggregateTriggers continues pipeline', () => {
    const adapted = buildSignalBoardAdapterResult(buildValidContext());
    const aggregate = aggregateTriggers(adapted.aggregateContext);
    expect(aggregate.halted).toBe(false);
    expect(aggregate.triggerCount).toBe(1);
    expect(aggregate.hardBlockResult?.detected).toBe(true);
    expect(aggregate.context.scanId).toBe('scan-sb-001');
  });

  it('integration smoke — multi-slot trigger snapshot maps all detectors', () => {
    const hardBlockResult = detectHardBlock(hardBlockContext());
    const noiseResult = detectNoise(noiseContext());
    const context = buildValidContext({
      triggerSnapshot: { hardBlockResult, noiseResult },
    });
    const result = buildSignalBoardAdapterResult(context);
    expect(result.aggregateContext.hardBlockResult).toBeDefined();
    expect(result.aggregateContext.noiseResult).toBeDefined();
    const aggregate = aggregateTriggers(result.aggregateContext);
    expect(aggregate.triggerCount).toBe(2);
  });

  it('staged snapshot passthrough — uses bundled aggregateResult when provided', () => {
    const context = buildValidContext();
    const aggregateResult = aggregateTriggers({
      hardBlockResult: context.triggerSnapshot.hardBlockResult,
      scanId: context.scanId,
    });
    const result = buildSignalBoardAdapterResult({
      ...context,
      triggerSnapshot: {
        ...context.triggerSnapshot,
        aggregateResult,
      },
    });
    expect(result.priorityContext.aggregateResult).toBe(aggregateResult);
    expect(result.priorityContext.aggregateResult.message).not.toBe('signal-board-adapter-mapped');
  });

  it('SignalBoardAdapter namespace exposes public API', () => {
    expect(SignalBoardAdapter.buildSignalBoardAdapterResult).toBe(buildSignalBoardAdapterResult);
    expect(SignalBoardAdapter.validateSignalBoardAdapterContext).toBe(validateSignalBoardAdapterContext);
    expect(SignalBoardAdapter.validateSignalBoardAdapterResult).toBe(validateSignalBoardAdapterResult);
  });

  it('buildSignalBoardAdapterResult — throws on invalid context', () => {
    expect(() => buildSignalBoardAdapterResult(buildValidContext({ scanId: '' }))).toThrow(
      /invalid SignalBoardAdapterContext/,
    );
  });
});

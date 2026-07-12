/**
 * Trigger Aggregator — scaffold tests (Task 02.5.1).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectConfirmation } from './confirmationDetectionEngine';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { detectNoise } from './noiseDetectionEngine';
import { detectRecovery } from './recoveryDetectionEngine';
import { detectUnlock } from './unlockDetectionEngine';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  TriggerAggregator,
  aggregateTriggers,
  validateTriggerAggregatorContext,
} from './triggerAggregator';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';
import type { NoiseDetectionContext } from './noiseDetectionTypes';
import type { TriggerAggregatorContext } from './triggerAggregatorTypes';

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

const undetectedNoiseContext = (): NoiseDetectionContext => ({
  ...noiseContext(),
  noiseSignalSnapshot: {
    macdNoiseHint: null,
    rsiNoiseHint: null,
    emaFlipHint: null,
    cvdFlipHint: null,
    volumeSpikeHint: null,
    scoreFluctuationHint: null,
    shortTermReversalHint: null,
  },
});

describe('TriggerAggregator — scaffold', () => {
  it('valid context with single detector passes validation', () => {
    const hardBlockResult = detectHardBlock(hardBlockContext());
    const context: TriggerAggregatorContext = { hardBlockResult, scanId: 'scan-001' };
    expect(validateTriggerAggregatorContext(context).valid).toBe(true);
    const aggregate = aggregateTriggers(context);
    expect(aggregate.halted).toBe(false);
    expect(aggregate.triggerCount).toBe(1);
    expect(aggregate.hardBlockResult?.detected).toBe(true);
    expect(aggregate.context.scanId).toBe('scan-001');
  });

  it('invalid context — wrong priority fails validation and halts', () => {
    const hardBlockResult = {
      ...detectHardBlock(hardBlockContext()),
      priority: 99,
    };
    const context: TriggerAggregatorContext = { hardBlockResult };
    const validation = validateTriggerAggregatorContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('priority'))).toBe(true);
    const aggregate = aggregateTriggers(context);
    expect(aggregate.halted).toBe(true);
    expect(aggregate.triggerCount).toBe(0);
  });

  it('full detectors — all five slots aggregated', () => {
    const context: TriggerAggregatorContext = {
      hardBlockResult: detectHardBlock(hardBlockContext()),
      recoveryResult: detectRecovery({
        normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
        currentEntryState: EntryState.BLOCKED,
        candidateTransitions: [],
        signalSnapshot: baseSignalSnapshot,
        marketSnapshot: baseMarketSnapshot,
        recoverySignalSnapshot: {
          blockClearedHint: 'hard blocks cleared',
          rulesNormalizedHint: null,
          tradePlanRecoveredHint: null,
          marketStableHint: null,
          signalReturnedHint: null,
          readyForWatchHint: null,
        },
      }),
      unlockResult: detectUnlock({
        normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
        currentEntryState: EntryState.LOCKED,
        candidateTransitions: [],
        signalSnapshot: baseSignalSnapshot,
        marketSnapshot: baseMarketSnapshot,
        unlockSignalSnapshot: {
          lockZoneExitedHint: 'price exited lock zone',
          priceRecoveredHint: null,
          confirmationReturnedHint: null,
          riskNormalizedHint: null,
          signalStableHint: null,
          readyForWatchHint: null,
        },
      }),
      confirmationResult: detectConfirmation({
        normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
        currentEntryState: EntryState.WATCH,
        candidateTransitions: [],
        signalSnapshot: baseSignalSnapshot,
        marketSnapshot: baseMarketSnapshot,
        confirmationSignalSnapshot: {
          emaConfirmedHint: 'EMA aligned',
          trendConfirmedHint: null,
          scoreConfirmedHint: null,
          tradePlanConfirmedHint: null,
          volumeConfirmedHint: null,
          directionConfirmedHint: null,
        },
      }),
      noiseResult: detectNoise(noiseContext()),
    };

    const aggregate = aggregateTriggers(context);
    expect(validateTriggerAggregatorContext(context).valid).toBe(true);
    expect(aggregate.halted).toBe(false);
    expect(aggregate.triggerCount).toBe(5);
    expect(aggregate.hardBlockResult).toBeDefined();
    expect(aggregate.recoveryResult).toBeDefined();
    expect(aggregate.unlockResult).toBeDefined();
    expect(aggregate.confirmationResult).toBeDefined();
    expect(aggregate.noiseResult).toBeDefined();
  });

  it('partial detectors — only supplied slots counted', () => {
    const context: TriggerAggregatorContext = {
      hardBlockResult: detectHardBlock(hardBlockContext()),
      noiseResult: detectNoise(noiseContext()),
    };
    const aggregate = aggregateTriggers(context);
    expect(aggregate.triggerCount).toBe(2);
    expect(aggregate.recoveryResult).toBeUndefined();
    expect(aggregate.unlockResult).toBeUndefined();
    expect(aggregate.confirmationResult).toBeUndefined();
  });

  it('empty context — triggerCount=0, not halted', () => {
    const context: TriggerAggregatorContext = {};
    expect(validateTriggerAggregatorContext(context).valid).toBe(true);
    const aggregate = aggregateTriggers(context);
    expect(aggregate.triggerCount).toBe(0);
    expect(aggregate.halted).toBe(false);
    expect(aggregate.message).toContain('triggerCount=0');
  });

  it('triggerCount counts valid slots — not detected=true', () => {
    const detected = detectNoise(noiseContext());
    const undetected = detectConfirmation({
      normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
      currentEntryState: EntryState.WATCH,
      candidateTransitions: [],
      signalSnapshot: baseSignalSnapshot,
      marketSnapshot: baseMarketSnapshot,
      confirmationSignalSnapshot: {
        emaConfirmedHint: null,
        trendConfirmedHint: null,
        scoreConfirmedHint: null,
        tradePlanConfirmedHint: null,
        volumeConfirmedHint: null,
        directionConfirmedHint: null,
      },
    });
    expect(detected.detected).toBe(true);
    expect(undetected.detected).toBe(false);

    const aggregate = aggregateTriggers({
      noiseResult: detected,
      confirmationResult: undetected,
    });
    expect(aggregate.triggerCount).toBe(2);
    expect(aggregate.noiseResult?.detected).toBe(true);
    expect(aggregate.confirmationResult?.detected).toBe(false);
  });

  it('halted=true when metadata validation fails — wrong triggerId', () => {
    const hardBlockResult = {
      ...detectHardBlock(hardBlockContext()),
      triggerId: 'ESM-TRIG-Invalid',
    };
    const aggregate = aggregateTriggers({ hardBlockResult });
    expect(aggregate.halted).toBe(true);
    expect(aggregate.message).toContain('triggerId');
    expect(aggregate.triggerCount).toBe(0);
  });

  it('invalid slot type fails validation', () => {
    const context = {
      hardBlockResult: 'not-an-object',
    } as unknown as TriggerAggregatorContext;
    const validation = validateTriggerAggregatorContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('must be an object');
  });

  it('TriggerAggregator namespace exposes aggregate and validate', () => {
    expect(TriggerAggregator.aggregateTriggers).toBe(aggregateTriggers);
    expect(TriggerAggregator.validateTriggerAggregatorContext).toBe(validateTriggerAggregatorContext);
  });

  it('aggregate does not sort or filter by detected flag', () => {
    const noiseResult = detectNoise(undetectedNoiseContext());
    const hardBlockResult = detectHardBlock(hardBlockContext());
    const aggregate = aggregateTriggers({ noiseResult, hardBlockResult });
    expect(aggregate.noiseResult).toBe(noiseResult);
    expect(aggregate.hardBlockResult).toBe(hardBlockResult);
    expect(aggregate.triggerCount).toBe(2);
  });
});

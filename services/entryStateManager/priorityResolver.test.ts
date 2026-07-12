/**
 * Priority Resolver — scaffold tests (Task 02.5.2).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { detectNoise } from './noiseDetectionEngine';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import {
  PriorityResolver,
  resolvePriority,
  validatePriorityResolverContext,
} from './priorityResolver';
import { aggregateTriggers } from './triggerAggregator';
import type { HardBlockDetectionContext } from './hardBlockDetectionTypes';
import type { NoiseDetectionContext } from './noiseDetectionTypes';
import type { PriorityResolverContext } from './priorityResolverTypes';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { EntryTriggerKind } from './evaluationTypes';

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

const buildAggregate = () =>
  aggregateTriggers({
    hardBlockResult: detectHardBlock(hardBlockContext()),
    noiseResult: detectNoise(noiseContext()),
    scanId: 'scan-priority-001',
  });

describe('PriorityResolver — scaffold', () => {
  it('valid context passes validation', () => {
    const aggregateResult = buildAggregate();
    const context: PriorityResolverContext = {
      aggregateResult,
      scanId: 'scan-priority-001',
    };
    expect(validatePriorityResolverContext(context).valid).toBe(true);
    const resolved = resolvePriority(context);
    expect(resolved.halted).toBe(false);
    expect(resolved.priorityGroups).toHaveLength(2);
    expect(resolved.context.scanId).toBe('scan-priority-001');
  });

  it('invalid context — missing aggregateResult', () => {
    const context = {} as PriorityResolverContext;
    const validation = validatePriorityResolverContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('aggregateResult');
    const resolved = resolvePriority(context);
    expect(resolved.halted).toBe(true);
    expect(resolved.priorityGroups).toHaveLength(0);
  });

  it('empty aggregate — highestPriority=null', () => {
    const aggregateResult = aggregateTriggers({});
    const context: PriorityResolverContext = { aggregateResult };
    const resolved = resolvePriority(context);
    expect(validatePriorityResolverContext(context).valid).toBe(true);
    expect(resolved.aggregateResult.triggerCount).toBe(0);
    expect(resolved.highestPriority).toBeNull();
    expect(resolved.priorityGroups).toHaveLength(0);
    expect(resolved.message).toContain('highestPriority=null');
  });

  it('priority metadata read from TRIGGER_TYPE_CATALOG', () => {
    const aggregateResult = buildAggregate();
    const resolved = resolvePriority({ aggregateResult });
    const hardBlockGroup = resolved.priorityGroups.find(
      (g) => g.entries[0]?.triggerKind === EntryTriggerKind.HardBlock,
    );
    const noiseGroup = resolved.priorityGroups.find(
      (g) => g.entries[0]?.triggerKind === EntryTriggerKind.Noise,
    );
    expect(hardBlockGroup?.catalogPriority).toBe(
      TRIGGER_TYPE_CATALOG[EntryTriggerKind.HardBlock].priority,
    );
    expect(noiseGroup?.catalogPriority).toBe(
      TRIGGER_TYPE_CATALOG[EntryTriggerKind.Noise].priority,
    );
    expect(hardBlockGroup?.entries[0].triggerId).toBe(
      TRIGGER_TYPE_CATALOG[EntryTriggerKind.HardBlock].triggerId,
    );
  });

  it('highestPriority reads max catalog priority among present slots', () => {
    const aggregateResult = buildAggregate();
    const resolved = resolvePriority({ aggregateResult });
    expect(resolved.highestPriority).toBe(100);
    expect(resolved.highestPriority).toBe(
      TRIGGER_TYPE_CATALOG[EntryTriggerKind.HardBlock].priority,
    );
  });

  it('highestPriority for single low-priority trigger', () => {
    const aggregateResult = aggregateTriggers({
      noiseResult: detectNoise(noiseContext()),
    });
    const resolved = resolvePriority({ aggregateResult });
    expect(resolved.highestPriority).toBe(50);
    expect(resolved.priorityGroups).toHaveLength(1);
  });

  it('halted when wrong priority in aggregate slot', () => {
    const aggregateResult = {
      ...buildAggregate(),
      hardBlockResult: {
        ...detectHardBlock(hardBlockContext()),
        priority: 42,
      },
    };
    const validation = validatePriorityResolverContext({ aggregateResult });
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('priority'))).toBe(true);
    const resolved = resolvePriority({ aggregateResult });
    expect(resolved.halted).toBe(true);
    expect(resolved.priorityGroups).toHaveLength(0);
  });

  it('halted when aggregateResult.triggerCount mismatch', () => {
    const aggregateResult = {
      ...buildAggregate(),
      triggerCount: 99,
    };
    const validation = validatePriorityResolverContext({ aggregateResult });
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('triggerCount'))).toBe(true);
  });

  it('priorityGroups preserve fixed slot order — not sorted by priority', () => {
    const aggregateResult = buildAggregate();
    const resolved = resolvePriority({ aggregateResult });
    expect(resolved.priorityGroups[0].entries[0].slotKey).toBe('hardBlockResult');
    expect(resolved.priorityGroups[1].entries[0].slotKey).toBe('noiseResult');
    expect(resolved.priorityGroups[0].catalogPriority).toBeGreaterThan(
      resolved.priorityGroups[1].catalogPriority,
    );
  });

  it('PriorityResolver namespace exposes resolve and validate', () => {
    expect(PriorityResolver.resolvePriority).toBe(resolvePriority);
    expect(PriorityResolver.validatePriorityResolverContext).toBe(
      validatePriorityResolverContext,
    );
  });
});

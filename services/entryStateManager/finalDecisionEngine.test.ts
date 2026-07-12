/**
 * Final Decision Runtime — tests (Task 02.5.6).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectConfirmation } from './confirmationDetectionEngine';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { detectNoise } from './noiseDetectionEngine';
import { detectRecovery } from './recoveryDetectionEngine';
import { detectUnlock } from './unlockDetectionEngine';
import { buildDecisionEngineResult } from './decisionEngine';
import { DecisionCandidateStatus } from './decisionEngineTypes';
import type { DecisionEngineResult } from './decisionEngineTypes';
import {
  FinalDecisionEngine,
  buildFinalDecisionResult,
  collectEligibleCandidates,
  validateFinalDecisionContext,
  validateFinalDecisionResult,
} from './finalDecisionEngine';
import type { FinalDecisionContext } from './finalDecisionTypes';
import { resolveConflicts } from './conflictResolver';
import { ConflictResolutionMethod } from './conflictResolverTypes';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
import { EntryTriggerKind } from './evaluationTypes';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';

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
    currentEntryState: EntryState.BLOCKED,
    candidateTransitions: [],
    signalSnapshot: baseSignalSnapshot,
    marketSnapshot: baseMarketSnapshot,
  });

const confirmationDetect = () =>
  detectConfirmation({
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
  });

const noiseDetect = () =>
  detectNoise({
    normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
    currentEntryState: EntryState.READY,
    candidateTransitions: [],
    signalSnapshot: { ...baseSignalSnapshot, canEnter: false },
    marketSnapshot: baseMarketSnapshot,
    noiseSignalSnapshot: {
      macdNoiseHint: 'MACD flip',
      rsiNoiseHint: null,
      emaFlipHint: null,
      cvdFlipHint: null,
      volumeSpikeHint: null,
      scoreFluctuationHint: null,
      shortTermReversalHint: null,
    },
  });

const buildConflictResult = (slots: Parameters<typeof aggregateTriggers>[0] = {}) => {
  const aggregateResult = aggregateTriggers(slots);
  const priorityResult = resolvePriority({ aggregateResult, scanId: slots.scanId });
  return resolveConflicts({ priorityResult, scanId: slots.scanId });
};

const buildDecisionResult = (
  slots: Parameters<typeof aggregateTriggers>[0] = {},
): DecisionEngineResult => {
  const conflictResult = buildConflictResult(slots);
  return buildDecisionEngineResult({ conflictResult, scanId: slots.scanId });
};

describe('FinalDecisionEngine — runtime', () => {
  it('one eligible — selects final decision', () => {
    const decisionResult = buildDecisionResult({ hardBlockResult: hardBlockDetect() });
    const context: FinalDecisionContext = { decisionResult, scanId: 'scan-final-001' };
    const result = buildFinalDecisionResult(context);

    expect(validateFinalDecisionContext(context).valid).toBe(true);
    expect(result.halted).toBe(false);
    expect(result.decisionCount).toBe(1);
    expect(result.finalDecision).not.toBeNull();
    expect(result.finalDecision?.triggerKind).toBe(EntryTriggerKind.HardBlock);
    expect(result.finalDecision?.triggerId).toBe(TRIGGER_TYPE_CATALOG.HardBlock.triggerId);
    expect(result.finalDecision?.priority).toBe(TRIGGER_TYPE_CATALOG.HardBlock.priority);
    expect(result.message).toBe('Final decision selected.');
    expect(validateFinalDecisionResult(result).valid).toBe(true);
  });

  it('multiple eligible — halted with zero decision count', () => {
    const decisionResult = buildDecisionResult({
      hardBlockResult: hardBlockDetect(),
      noiseResult: noiseDetect(),
    });
    const eligible = collectEligibleCandidates(decisionResult);
    expect(eligible.length).toBeGreaterThan(1);

    const result = buildFinalDecisionResult({ decisionResult });
    expect(result.halted).toBe(true);
    expect(result.decisionCount).toBe(0);
    expect(result.finalDecision).toBeNull();
    expect(result.message).toBe('Multiple eligible candidates.');
    expect(validateFinalDecisionResult(result).valid).toBe(true);
  });

  it('unresolved candidate — halted with unresolved message', () => {
    const decisionResult = buildDecisionResult({
      recoveryResult: detectRecovery({
        normalizedRuleOutput: normalizeRuleOutput(clearOutput()),
        currentEntryState: EntryState.BLOCKED,
        candidateTransitions: [],
        signalSnapshot: baseSignalSnapshot,
        marketSnapshot: baseMarketSnapshot,
        recoverySignalSnapshot: {
          blockClearedHint: 'blocks cleared',
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
          lockZoneExitedHint: 'exited',
          priceRecoveredHint: null,
          confirmationReturnedHint: null,
          riskNormalizedHint: null,
          signalStableHint: null,
          readyForWatchHint: null,
        },
      }),
    });

    const result = buildFinalDecisionResult({ decisionResult });
    expect(result.halted).toBe(true);
    expect(result.decisionCount).toBe(0);
    expect(result.finalDecision).toBeNull();
    expect(result.message).toBe('Unresolved decision candidates.');
  });

  it('all blocked — not halted, zero decision count', () => {
    const decisionResult = buildDecisionResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
    });
    const blocked = decisionResult.decisionCandidates.filter(
      (c) => c.decisionStatus === DecisionCandidateStatus.BLOCKED,
    );
    expect(blocked.length).toBeGreaterThan(0);
    expect(collectEligibleCandidates(decisionResult)).toHaveLength(1);

    const onlyBlocked: DecisionEngineResult = {
      ...decisionResult,
      decisionCandidates: blocked,
      candidateCount: blocked.length,
    };
    const result = buildFinalDecisionResult({ decisionResult: onlyBlocked });
    expect(result.halted).toBe(false);
    expect(result.decisionCount).toBe(0);
    expect(result.finalDecision).toBeNull();
    expect(result.message).toBe('All candidates blocked.');
  });

  it('empty candidates — no decision candidate message', () => {
    const decisionResult = buildDecisionResult({});
    const result = buildFinalDecisionResult({ decisionResult });
    expect(result.halted).toBe(false);
    expect(result.decisionCount).toBe(0);
    expect(result.finalDecision).toBeNull();
    expect(result.message).toBe('No decision candidate.');
  });

  it('invalid context — missing decisionResult', () => {
    const context = {} as FinalDecisionContext;
    const validation = validateFinalDecisionContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('decisionResult');

    const result = buildFinalDecisionResult(context);
    expect(result.halted).toBe(true);
    expect(result.decisionCount).toBe(0);
    expect(result.finalDecision).toBeNull();
  });

  it('halted decisionResult — context validation fails', () => {
    const decisionResult = {
      ...buildDecisionResult({}),
      halted: true,
      message: 'forced halt',
    };
    const validation = validateFinalDecisionContext({ decisionResult });
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('halted'))).toBe(true);

    const result = buildFinalDecisionResult({ decisionResult });
    expect(result.halted).toBe(true);
    expect(result.decisionCount).toBe(0);
  });

  it('decisionCount validation — rejects inconsistent count', () => {
    const decisionResult = buildDecisionResult({ hardBlockResult: hardBlockDetect() });
    const base = buildFinalDecisionResult({ decisionResult });
    const invalid = {
      ...base,
      decisionCount: 2,
      finalDecision: base.finalDecision,
    };
    const validation = validateFinalDecisionResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('decisionCount'))).toBe(true);
  });

  it('finalDecision validation — must belong to decisionCandidates', () => {
    const decisionResult = buildDecisionResult({ hardBlockResult: hardBlockDetect() });
    const base = buildFinalDecisionResult({ decisionResult });
    const invalid = {
      ...base,
      finalDecision: {
        triggerKind: EntryTriggerKind.Noise,
        triggerId: TRIGGER_TYPE_CATALOG.Noise.triggerId,
        priority: TRIGGER_TYPE_CATALOG.Noise.priority,
      },
    };
    const validation = validateFinalDecisionResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('decisionCandidates'))).toBe(true);
  });

  it('catalog metadata validation — triggerId and priority must match catalog', () => {
    const decisionResult = buildDecisionResult({ hardBlockResult: hardBlockDetect() });
    const base = buildFinalDecisionResult({ decisionResult });
    const invalid = {
      ...base,
      finalDecision: base.finalDecision
        ? { ...base.finalDecision, priority: 999 }
        : null,
    };
    const validation = validateFinalDecisionResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('priority mismatch'))).toBe(true);
  });

  it('FinalDecisionEngine namespace exposes build, collect, validate context and result', () => {
    expect(FinalDecisionEngine.buildFinalDecisionResult).toBe(buildFinalDecisionResult);
    expect(FinalDecisionEngine.collectEligibleCandidates).toBe(collectEligibleCandidates);
    expect(FinalDecisionEngine.validateFinalDecisionContext).toBe(validateFinalDecisionContext);
    expect(FinalDecisionEngine.validateFinalDecisionResult).toBe(validateFinalDecisionResult);
  });

  it('deterministic output — same input yields identical result', () => {
    const decisionResult = buildDecisionResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
    });
    const context: FinalDecisionContext = { decisionResult, scanId: 'scan-deterministic' };
    const first = buildFinalDecisionResult(context);
    const second = buildFinalDecisionResult(context);

    expect(second).toEqual(first);
    expect(second.decisionResult).toBe(decisionResult);
    expect(second.finalDecision?.resolvedBy).toBe(ConflictResolutionMethod.CATALOG_PRIORITY);
  });
});

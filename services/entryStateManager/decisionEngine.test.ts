/**
 * Decision Engine — scaffold tests (Task 02.5.5).
 */

import { describe, expect, it } from 'vitest';
import { EntryState, EsmDirection } from './enums';
import { detectConfirmation } from './confirmationDetectionEngine';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { detectNoise } from './noiseDetectionEngine';
import { detectRecovery } from './recoveryDetectionEngine';
import { detectUnlock } from './unlockDetectionEngine';
import {
  DecisionEngine,
  buildDecisionEngineResult,
  collectDecisionCandidates,
  validateDecisionEngineContext,
  validateDecisionEngineResult,
} from './decisionEngine';
import { DecisionCandidateStatus } from './decisionEngineTypes';
import type { DecisionEngineContext } from './decisionEngineTypes';
import { resolveConflicts } from './conflictResolver';
import { ConflictResolutionMethod } from './conflictResolverTypes';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
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

const buildConflictResult = (slots: Parameters<typeof aggregateTriggers>[0] = {}) => {
  const aggregateResult = aggregateTriggers(slots);
  const priorityResult = resolvePriority({ aggregateResult, scanId: slots.scanId });
  return resolveConflicts({ priorityResult, scanId: slots.scanId });
};

describe('DecisionEngine — scaffold', () => {
  it('valid context passes validation', () => {
    const conflictResult = buildConflictResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
      scanId: 'scan-decision-001',
    });
    const context: DecisionEngineContext = {
      conflictResult,
      scanId: 'scan-decision-001',
    };
    expect(validateDecisionEngineContext(context).valid).toBe(true);
    const result = buildDecisionEngineResult(context);
    expect(result.halted).toBe(false);
    expect(result.candidateCount).toBeGreaterThan(0);
    expect(result.context.scanId).toBe('scan-decision-001');
  });

  it('invalid context — missing conflictResult', () => {
    const context = {} as DecisionEngineContext;
    const validation = validateDecisionEngineContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('conflictResult');
    const result = buildDecisionEngineResult(context);
    expect(result.halted).toBe(true);
    expect(result.candidateCount).toBe(0);
  });

  it('empty conflict result — no decision candidates', () => {
    const conflictResult = buildConflictResult({});
    const result = buildDecisionEngineResult({ conflictResult });
    expect(validateDecisionEngineContext({ conflictResult }).valid).toBe(true);
    expect(result.candidateCount).toBe(0);
    expect(result.decisionCandidates).toHaveLength(0);
    expect(result.message).toContain('empty conflict result');
  });

  it('creates DecisionCandidate with trigger metadata', () => {
    const conflictResult = buildConflictResult({
      noiseResult: detectNoise({
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
      }),
    });
    const candidates = collectDecisionCandidates(conflictResult);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].triggerKind).toBe(EntryTriggerKind.Noise);
    expect(candidates[0].triggerId).toBe('ESM-TRIG-Noise');
    expect(candidates[0].priority).toBe(50);
    expect(candidates[0].sourceTriggerResult).toBe('noiseResult');
    expect(candidates[0]).not.toHaveProperty('detected');
  });

  it('candidateCount equals decisionCandidates length', () => {
    const conflictResult = buildConflictResult({
      hardBlockResult: hardBlockDetect(),
      noiseResult: detectNoise({
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
      }),
    });
    const result = buildDecisionEngineResult({ conflictResult });
    expect(result.candidateCount).toBe(result.decisionCandidates.length);
    expect(result.candidateCount).toBe(2);
  });

  it('ELIGIBLE candidate — catalog priority winner', () => {
    const conflictResult = buildConflictResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
    });
    const result = buildDecisionEngineResult({ conflictResult });
    const winner = result.decisionCandidates.find(
      (c) => c.triggerKind === EntryTriggerKind.HardBlock,
    );
    expect(winner?.decisionStatus).toBe(DecisionCandidateStatus.ELIGIBLE);
    expect(winner?.resolvedConflictId).toBe('CONFLICT-EDGE-001');
    expect(winner?.resolvedBy).toBe(ConflictResolutionMethod.CATALOG_PRIORITY);
  });

  it('BLOCKED candidate — suppressed by higher catalog priority', () => {
    const conflictResult = buildConflictResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
    });
    const result = buildDecisionEngineResult({ conflictResult });
    const suppressed = result.decisionCandidates.find(
      (c) => c.triggerKind === EntryTriggerKind.Confirmation,
    );
    expect(suppressed?.decisionStatus).toBe(DecisionCandidateStatus.BLOCKED);
    expect(suppressed?.resolvedConflictId).toBe('CONFLICT-EDGE-001');
  });

  it('UNRESOLVED candidate — same catalog priority tie', () => {
    const conflictResult = buildConflictResult({
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
    const result = buildDecisionEngineResult({ conflictResult });
    const recovery = result.decisionCandidates.find(
      (c) => c.triggerKind === EntryTriggerKind.Recovery,
    );
    const unlock = result.decisionCandidates.find((c) => c.triggerKind === EntryTriggerKind.Unlock);
    expect(recovery?.decisionStatus).toBe(DecisionCandidateStatus.UNRESOLVED);
    expect(unlock?.decisionStatus).toBe(DecisionCandidateStatus.UNRESOLVED);
    expect(recovery?.resolvedBy).toBe(ConflictResolutionMethod.SAME_PRIORITY);
  });

  it('halted when conflictResult.halted=true', () => {
    const conflictResult = {
      ...buildConflictResult({}),
      halted: true,
      message: 'forced halt',
    };
    expect(validateDecisionEngineContext({ conflictResult }).valid).toBe(false);
    const result = buildDecisionEngineResult({ conflictResult });
    expect(result.halted).toBe(true);
    expect(result.decisionCandidates).toHaveLength(0);
  });

  it('DecisionCandidate does not expose detected field', () => {
    const conflictResult = buildConflictResult({
      hardBlockResult: hardBlockDetect(),
      confirmationResult: confirmationDetect(),
    });
    const result = buildDecisionEngineResult({ conflictResult });
    for (const candidate of result.decisionCandidates) {
      expect(candidate).not.toHaveProperty('detected');
    }
  });

  it('validateDecisionEngineResult checks candidateCount', () => {
    const result = buildDecisionEngineResult({
      conflictResult: buildConflictResult({ hardBlockResult: hardBlockDetect() }),
    });
    expect(validateDecisionEngineResult(result).valid).toBe(true);
    expect(result.candidateCount).toBe(result.decisionCandidates.length);
  });

  it('DecisionEngine namespace exposes build, collect, validate context and result', () => {
    expect(DecisionEngine.buildDecisionEngineResult).toBe(buildDecisionEngineResult);
    expect(DecisionEngine.collectDecisionCandidates).toBe(collectDecisionCandidates);
    expect(DecisionEngine.validateDecisionEngineContext).toBe(validateDecisionEngineContext);
    expect(DecisionEngine.validateDecisionEngineResult).toBe(validateDecisionEngineResult);
  });

  it('passthrough conflictResult unchanged', () => {
    const conflictResult = buildConflictResult({});
    const result = buildDecisionEngineResult({ conflictResult });
    expect(result.conflictResult).toBe(conflictResult);
    expect(result.conflictResult.priorityResult).toBe(conflictResult.priorityResult);
  });
});

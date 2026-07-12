/**
 * Entry State Machine — scaffold tests (Task 02.6.1).
 */

import { describe, expect, it } from 'vitest';
import { EntryState as DomainEntryState, EsmDirection } from './enums';
import { detectHardBlock } from './hardBlockDetectionEngine';
import { buildDecisionEngineResult } from './decisionEngine';
import { buildFinalDecisionResult } from './finalDecisionEngine';
import type { FinalDecisionResult } from './finalDecisionTypes';
import { resolveConflicts } from './conflictResolver';
import { normalizeRuleOutput } from './normalizedRuleOutput';
import { aggregateTriggers } from './triggerAggregator';
import { resolvePriority } from './priorityResolver';
import {
  EntryStateMachine,
  buildAvailableTransitions,
  buildEntryStateMachineResult,
  isStateMachineEntryState,
  resolveNextState,
  validateEntryStateMachineContext,
  validateEntryStateMachineResult,
} from './stateMachine';
import { EntryState } from './stateMachineTypes';
import type { AvailableTransition, EntryStateMachineContext } from './stateMachineTypes';
import { TRANSITION_POLICY } from './transitionPolicy';

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
    currentEntryState: DomainEntryState.BLOCKED,
    candidateTransitions: [],
    signalSnapshot: baseSignalSnapshot,
    marketSnapshot: baseMarketSnapshot,
  });

const buildConflictResult = (slots: Parameters<typeof aggregateTriggers>[0] = {}) => {
  const aggregateResult = aggregateTriggers(slots);
  const priorityResult = resolvePriority({ aggregateResult, scanId: slots.scanId });
  return resolveConflicts({ priorityResult, scanId: slots.scanId });
};

const buildFinalDecision = (scanId?: string): FinalDecisionResult => {
  const conflictResult = buildConflictResult({ hardBlockResult: hardBlockDetect(), scanId });
  const decisionResult = buildDecisionEngineResult({ conflictResult, scanId });
  return buildFinalDecisionResult({ decisionResult, scanId });
};

const validContext = (overrides: Partial<EntryStateMachineContext> = {}): EntryStateMachineContext => ({
  finalDecisionResult: buildFinalDecision('scan-sm-001'),
  currentState: EntryState.WATCH,
  scanId: 'scan-sm-001',
  ...overrides,
});

describe('EntryStateMachine — scaffold', () => {
  it('valid context passes validation', () => {
    const context = validContext();
    const validation = validateEntryStateMachineContext(context);
    expect(validation.valid).toBe(true);

    const result = buildEntryStateMachineResult(context);
    expect(result.halted).toBe(false);
    expect(result.currentState).toBe(EntryState.WATCH);
    expect(result.availableTransitions.length).toBeGreaterThan(0);
    expect(validateEntryStateMachineResult(result).valid).toBe(true);
  });

  it('invalid context — missing finalDecisionResult', () => {
    const context = {
      currentState: EntryState.WATCH,
    } as EntryStateMachineContext;
    const validation = validateEntryStateMachineContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('finalDecisionResult');

    const result = buildEntryStateMachineResult(context);
    expect(result.halted).toBe(true);
    expect(result.availableTransitions).toHaveLength(0);
  });

  it('invalid state — rejects unknown currentState', () => {
    const context = validContext({ currentState: 'INVALID' as EntryState });
    const validation = validateEntryStateMachineContext(context);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('currentState'))).toBe(true);
  });

  it('halted FinalDecision — context validation fails', () => {
    const finalDecisionResult = {
      ...buildFinalDecision(),
      halted: true,
      message: 'forced halt',
    };
    const validation = validateEntryStateMachineContext(
      validContext({ finalDecisionResult }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('halted'))).toBe(true);

    const result = buildEntryStateMachineResult(validContext({ finalDecisionResult }));
    expect(result.halted).toBe(true);
    expect(result.availableTransitions).toHaveLength(0);
  });

  it('availableTransitions array — built from currentState placeholder', () => {
    const result = buildEntryStateMachineResult(validContext({ currentState: EntryState.READY }));
    expect(Array.isArray(result.availableTransitions)).toBe(true);
    expect(result.availableTransitions.length).toBeGreaterThan(0);
    for (const transition of result.availableTransitions) {
      expect(transition.fromState).toBe(EntryState.READY);
      expect(isStateMachineEntryState(transition.toState)).toBe(true);
      expect(transition.reason.length).toBeGreaterThan(0);
    }
    expect(result.availableTransitions.some((t) => t.toState === EntryState.ENTRY)).toBe(true);
  });

  it('duplicate transition validation — rejects duplicate pairs', () => {
    const context = validContext();
    const base = buildEntryStateMachineResult(context);
    const duplicate: AvailableTransition = {
      fromState: EntryState.WATCH,
      toState: EntryState.READY,
      reason: 'duplicate',
    };
    const invalid = {
      ...base,
      availableTransitions: [...base.availableTransitions, duplicate],
    };
    const validation = validateEntryStateMachineResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('currentState validation — rejects mutated state in result', () => {
    const context = validContext({ currentState: EntryState.BLOCKED });
    const base = buildEntryStateMachineResult(context);
    const invalid = {
      ...base,
      currentState: EntryState.WATCH,
    };
    const validation = validateEntryStateMachineResult(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes('currentState'))).toBe(true);
  });

  it('empty transition list — valid when halted', () => {
    const context = {} as EntryStateMachineContext;
    const result = buildEntryStateMachineResult(context);
    expect(result.availableTransitions).toHaveLength(0);
    expect(result.halted).toBe(true);
    expect(validateEntryStateMachineResult(result).valid).toBe(true);
  });

  it('EntryStateMachine namespace exposes build, validate, and helpers', () => {
    expect(EntryStateMachine.buildEntryStateMachineResult).toBe(buildEntryStateMachineResult);
    expect(EntryStateMachine.buildAvailableTransitions).toBe(buildAvailableTransitions);
    expect(EntryStateMachine.validateEntryStateMachineContext).toBe(validateEntryStateMachineContext);
    expect(EntryStateMachine.validateEntryStateMachineResult).toBe(validateEntryStateMachineResult);
    expect(EntryStateMachine.isStateMachineEntryState).toBe(isStateMachineEntryState);
  });

  it('deterministic output — same input yields identical result', () => {
    const context = validContext({ currentState: EntryState.LOCKED });
    const first = buildEntryStateMachineResult(context);
    const second = buildEntryStateMachineResult(context);
    expect(second).toEqual(first);
    expect(second.availableTransitions).toEqual(buildAvailableTransitions(EntryState.LOCKED));
  });

  it('validateResult — passes for scaffold output', () => {
    const result = buildEntryStateMachineResult(validContext({ currentState: EntryState.IDLE }));
    expect(validateEntryStateMachineResult(result).valid).toBe(true);
    expect(result.availableTransitions).toEqual([
      {
        fromState: EntryState.IDLE,
        toState: EntryState.WATCH,
        reason: 'Pipeline activated — awaiting setup',
      },
    ]);
    expect(result.transitionPerformed).toBe(true);
    expect(result.nextState).toBe(EntryState.WATCH);
  });

  it('scaffold only — does not change currentState', () => {
    const context = validContext({ currentState: EntryState.BLOCKED });
    const result = buildEntryStateMachineResult(context);
    expect(result.currentState).toBe(EntryState.BLOCKED);
    expect(result.context.currentState).toBe(EntryState.BLOCKED);
    expect(result.availableTransitions.every((t) => t.fromState === EntryState.BLOCKED)).toBe(true);
    expect(result.availableTransitions.some((t) => t.toState === EntryState.WATCH)).toBe(true);
  });
});

describe('EntryStateMachine — transition runtime (Task 02.6.2)', () => {
  it('IDLE → WATCH when FinalDecision present', () => {
    const context = validContext({ currentState: EntryState.IDLE });
    const result = buildEntryStateMachineResult(context);
    expect(result.transitionPerformed).toBe(true);
    expect(result.nextState).toBe(EntryState.WATCH);
    expect(result.currentState).toBe(EntryState.IDLE);
    expect(validateEntryStateMachineResult(result).valid).toBe(true);
  });

  it('WATCH → READY when FinalDecision present', () => {
    const result = buildEntryStateMachineResult(validContext({ currentState: EntryState.WATCH }));
    expect(result.transitionPerformed).toBe(true);
    expect(result.nextState).toBe(EntryState.READY);
    expect(result.currentState).toBe(EntryState.WATCH);
  });

  it('READY → ENTRY when exactly one FinalDecision', () => {
    const result = buildEntryStateMachineResult(validContext({ currentState: EntryState.READY }));
    expect(result.context.finalDecisionResult.decisionCount).toBe(1);
    expect(result.transitionPerformed).toBe(true);
    expect(result.nextState).toBe(EntryState.ENTRY);
  });

  it('ENTRY → ACTIVE — always valid placeholder', () => {
    const finalDecisionResult = buildFinalDecision();
    const result = buildEntryStateMachineResult({
      finalDecisionResult,
      currentState: EntryState.ENTRY,
    });
    expect(result.transitionPerformed).toBe(true);
    expect(result.nextState).toBe(EntryState.ACTIVE);
  });

  it('ACTIVE → EXIT — placeholder transition', () => {
    const result = buildEntryStateMachineResult({
      finalDecisionResult: buildFinalDecision(),
      currentState: EntryState.ACTIVE,
    });
    expect(result.transitionPerformed).toBe(true);
    expect(result.nextState).toBe(EntryState.EXIT);
  });

  it('EXIT → IDLE — placeholder transition', () => {
    const result = buildEntryStateMachineResult({
      finalDecisionResult: buildFinalDecision(),
      currentState: EntryState.EXIT,
    });
    expect(result.transitionPerformed).toBe(true);
    expect(result.nextState).toBe(EntryState.IDLE);
  });

  it('transitionPerformed=false when no policy match', () => {
    const finalDecisionResult = {
      ...buildFinalDecision(),
      finalDecision: null,
      decisionCount: 0,
    };
    const result = buildEntryStateMachineResult({
      finalDecisionResult,
      currentState: EntryState.READY,
    });
    expect(result.transitionPerformed).toBe(false);
    expect(result.nextState).toBeNull();
  });

  it('invalid transition — policy rejects unmatched edge', () => {
    const finalDecisionResult = buildFinalDecision();
    expect(
      TRANSITION_POLICY.canTransition(EntryState.READY, EntryState.WATCH, finalDecisionResult),
    ).toBe(false);
    expect(
      TRANSITION_POLICY.canTransition(EntryState.BLOCKED, EntryState.WATCH, finalDecisionResult),
    ).toBe(false);
  });

  it('policy validation — WATCH → BLOCKED when halted', () => {
    const haltedResult = {
      ...buildFinalDecision(),
      halted: true,
      finalDecision: null,
      decisionCount: 0,
    };
    expect(
      TRANSITION_POLICY.canTransition(EntryState.WATCH, EntryState.BLOCKED, haltedResult),
    ).toBe(true);
    expect(
      TRANSITION_POLICY.canTransition(EntryState.WATCH, EntryState.READY, haltedResult),
    ).toBe(false);
  });

  it('namespace export includes resolveNextState', () => {
    expect(EntryStateMachine.resolveNextState).toBe(resolveNextState);
  });

  it('deterministic output — same input yields identical transition resolution', () => {
    const context = validContext({ currentState: EntryState.ENTRY });
    const first = buildEntryStateMachineResult(context);
    const second = buildEntryStateMachineResult(context);
    expect(second).toEqual(first);
    expect(second.nextState).toBe(EntryState.ACTIVE);
  });

  it('currentState does not mutate after transition resolution', () => {
    const context = validContext({ currentState: EntryState.WATCH });
    const result = buildEntryStateMachineResult(context);
    expect(result.currentState).toBe(EntryState.WATCH);
    expect(result.context.currentState).toBe(EntryState.WATCH);
    expect(result.nextState).toBe(EntryState.READY);
    expect(result.transitionPerformed).toBe(true);
  });
});

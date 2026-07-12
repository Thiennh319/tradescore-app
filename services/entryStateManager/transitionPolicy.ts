/**
 * Transition Policy — sole authority for state transition rules (Task 02.6.2).
 *
 * **Purpose:** Define which state transitions are permitted given {@link FinalDecisionResult}.
 * **MUST NOT:** Mutate state, execute actions, or call production modules.
 *
 * @module entryStateManager/transitionPolicy
 */

import type { FinalDecisionResult } from './finalDecisionTypes';
import { EntryState } from './stateMachineTypes';

/** Transition rule evaluator — read-only policy surface. */
export interface TransitionPolicy {
  canTransition(
    currentState: EntryState,
    targetState: EntryState,
    finalDecision: FinalDecisionResult,
  ): boolean;
}

interface TransitionEdge {
  toState: EntryState;
  reason: string;
}

const TRANSITION_REASONS: Readonly<Record<EntryState, readonly TransitionEdge[]>> = {
  [EntryState.IDLE]: [
    { toState: EntryState.WATCH, reason: 'Pipeline activated — awaiting setup' },
  ],
  [EntryState.WATCH]: [
    { toState: EntryState.READY, reason: 'Conditions Confirmed' },
    { toState: EntryState.BLOCKED, reason: 'Hard Block Activated' },
    { toState: EntryState.LOCKED, reason: 'Price Entered Lock Zone' },
  ],
  [EntryState.READY]: [
    { toState: EntryState.ENTRY, reason: 'Entry signal confirmed' },
    { toState: EntryState.WATCH, reason: 'Momentum Weakened' },
    { toState: EntryState.LOCKED, reason: 'Price Entered Lock Zone' },
    { toState: EntryState.BLOCKED, reason: 'Hard Block Activated' },
  ],
  [EntryState.BLOCKED]: [{ toState: EntryState.WATCH, reason: 'Hard Block Cleared' }],
  [EntryState.LOCKED]: [{ toState: EntryState.WATCH, reason: 'Price Left Lock Zone' }],
  [EntryState.ENTRY]: [{ toState: EntryState.ACTIVE, reason: 'Position opened' }],
  [EntryState.ACTIVE]: [{ toState: EntryState.EXIT, reason: 'Exit signal' }],
  [EntryState.EXIT]: [{ toState: EntryState.IDLE, reason: 'Cycle complete' }],
};

function hasFinalDecision(finalDecision: FinalDecisionResult): boolean {
  return finalDecision.finalDecision !== null;
}

function canTransitionIdleToWatch(
  currentState: EntryState,
  targetState: EntryState,
  finalDecision: FinalDecisionResult,
): boolean {
  return (
    currentState === EntryState.IDLE &&
    targetState === EntryState.WATCH &&
    hasFinalDecision(finalDecision)
  );
}

function canTransitionWatchToReady(
  currentState: EntryState,
  targetState: EntryState,
  finalDecision: FinalDecisionResult,
): boolean {
  return (
    currentState === EntryState.WATCH &&
    targetState === EntryState.READY &&
    hasFinalDecision(finalDecision)
  );
}

function canTransitionWatchToBlocked(
  currentState: EntryState,
  targetState: EntryState,
  finalDecision: FinalDecisionResult,
): boolean {
  return (
    currentState === EntryState.WATCH &&
    targetState === EntryState.BLOCKED &&
    finalDecision.halted === true
  );
}

function canTransitionReadyToEntry(
  currentState: EntryState,
  targetState: EntryState,
  finalDecision: FinalDecisionResult,
): boolean {
  return (
    currentState === EntryState.READY &&
    targetState === EntryState.ENTRY &&
    finalDecision.decisionCount === 1 &&
    hasFinalDecision(finalDecision)
  );
}

function canTransitionEntryToActive(
  currentState: EntryState,
  targetState: EntryState,
): boolean {
  return currentState === EntryState.ENTRY && targetState === EntryState.ACTIVE;
}

function canTransitionActiveToExit(
  currentState: EntryState,
  targetState: EntryState,
): boolean {
  return currentState === EntryState.ACTIVE && targetState === EntryState.EXIT;
}

function canTransitionExitToIdle(
  currentState: EntryState,
  targetState: EntryState,
): boolean {
  return currentState === EntryState.EXIT && targetState === EntryState.IDLE;
}

/**
 * Sole policy object for state transition rules — **no logic elsewhere**.
 */
export const TRANSITION_POLICY: TransitionPolicy = {
  canTransition(
    currentState: EntryState,
    targetState: EntryState,
    finalDecision: FinalDecisionResult,
  ): boolean {
    return (
      canTransitionIdleToWatch(currentState, targetState, finalDecision) ||
      canTransitionWatchToReady(currentState, targetState, finalDecision) ||
      canTransitionWatchToBlocked(currentState, targetState, finalDecision) ||
      canTransitionReadyToEntry(currentState, targetState, finalDecision) ||
      canTransitionEntryToActive(currentState, targetState) ||
      canTransitionActiveToExit(currentState, targetState) ||
      canTransitionExitToIdle(currentState, targetState)
    );
  },
};

/** Lists descriptive target states for a source state — does not evaluate policy. */
export function listPolicyTransitionTargets(currentState: EntryState): readonly TransitionEdge[] {
  return TRANSITION_REASONS[currentState] ?? [];
}

/** Resolves transition reason for a directed edge. */
export function getPolicyTransitionReason(
  currentState: EntryState,
  targetState: EntryState,
): string | undefined {
  return listPolicyTransitionTargets(currentState).find((edge) => edge.toState === targetState)
    ?.reason;
}

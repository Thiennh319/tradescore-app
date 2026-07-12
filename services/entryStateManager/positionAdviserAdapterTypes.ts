/**
 * Position Adviser Adapter — type models (Task 02.8.1).
 *
 * **Purpose:** Read-only mapping from {@link IntegrationHarnessResult} to adviser input shape.
 * **Does NOT** import or invoke Position Adviser — adapter-owned contracts only.
 *
 * @module entryStateManager/positionAdviserAdapterTypes
 */

import type { EntryActionType } from './actionTypes';
import type { EntryTriggerKind } from './evaluationTypes';
import type { IntegrationHarnessResult } from './integrationHarnessTypes';
import type { RuntimeExecutionStatus } from './runtimeExecutorTypes';
import type { EntryState } from './stateMachineTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';

/** Decision layer summary — field copy from harness pipeline final decision. */
export interface PositionAdviserDecisionSummary {
  finalDecisionPresent: boolean;
  triggerKind: EntryTriggerKind | null;
  triggerId: TriggerTypeId | null;
  priority: number | null;
  candidateCount: number;
  decisionCount: number;
  halted: boolean;
}

/** State machine summary — field copy from harness pipeline state machine. */
export interface PositionAdviserStateSummary {
  currentState: EntryState;
  nextState: EntryState | null;
  transitionPerformed: boolean;
  availableTransitionCount: number;
  halted: boolean;
}

/** One action row in adviser input — metadata only. */
export interface PositionAdviserActionItem {
  actionId: string;
  actionType: EntryActionType;
  fromState: EntryState;
  toState: EntryState;
  reason: string;
}

/** Action engine summary — field copy from harness pipeline actions. */
export interface PositionAdviserActionSummary {
  actionCount: number;
  actions: readonly PositionAdviserActionItem[];
  halted: boolean;
}

/** One runtime execution row in adviser input — metadata only. */
export interface PositionAdviserRuntimeItem {
  executionId: string;
  dispatchId: string;
  actionId: string;
  executionOrder: number;
  executionStatus: RuntimeExecutionStatus;
}

/** Runtime executor summary — field copy from harness pipeline execution plan. */
export interface PositionAdviserRuntimeSummary {
  executionCount: number;
  executions: readonly PositionAdviserRuntimeItem[];
  halted: boolean;
}

/**
 * Position Adviser input model — adapter-owned, future adviser integration (Task 02.8.2+).
 *
 * Summaries only — no scoring or recommendation.
 */
export interface PositionAdviserInput {
  decisionSummary: PositionAdviserDecisionSummary;
  stateSummary: PositionAdviserStateSummary;
  actionSummary: PositionAdviserActionSummary;
  runtimeSummary: PositionAdviserRuntimeSummary;
  scanId: string;
  timestamp: string;
}

/** Adapter context — read-only harness result. */
export interface PositionAdviserAdapterContext {
  harnessResult: IntegrationHarnessResult;
}

/** Adapter output — mapped summaries + harness passthrough. */
export interface PositionAdviserAdapterResult extends PositionAdviserInput {
  message: string;
  context: IntegrationHarnessResult;
}

/** Context validation result. */
export interface PositionAdviserAdapterContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result — summary integrity and passthrough. */
export interface PositionAdviserAdapterResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

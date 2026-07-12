/**
 * Final Decision Runtime — type models (Task 02.5.6).
 *
 * **Purpose:** Select a single {@link FinalDecision} from {@link DecisionEngineResult}.
 *
 * **MUST NOT:** Choose EntryState, execute Transition, or call State Machine.
 *
 * @module entryStateManager/finalDecisionTypes
 */

import type { ConflictResolutionMethod } from './conflictResolverTypes';
import type { DecisionEngineResult } from './decisionEngineTypes';
import type { EntryTriggerKind } from './evaluationTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';

/**
 * Final pipeline decision — metadata only, no EntryState or Transition.
 */
export interface FinalDecision {
  triggerKind: EntryTriggerKind;
  triggerId: TriggerTypeId;
  priority: number;
  resolvedConflictId?: string;
  resolvedBy?: ConflictResolutionMethod;
  sourceTriggerResult?: string;
}

/**
 * Input for final decision runtime — read-only {@link DecisionEngineResult}.
 */
export interface FinalDecisionContext {
  decisionResult: DecisionEngineResult;
  scanId?: string;
}

/**
 * Final decision runtime output — end of Decision Pipeline (no State Machine).
 */
export interface FinalDecisionResult {
  decisionResult: DecisionEngineResult;
  finalDecision: FinalDecision | null;
  decisionCount: number;
  halted: boolean;
  message: string;
  context: FinalDecisionContext;
}

/** Context validation result — decision result integrity only. */
export interface FinalDecisionContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation — decision count and final decision integrity. */
export interface FinalDecisionResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

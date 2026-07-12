/**
 * Decision Engine — type models (Task 02.5.5).
 *
 * **Purpose:** Build {@link DecisionCandidate} placeholders from {@link ConflictResolverResult}.
 *
 * **MUST NOT:** Choose EntryState, execute Transition, or call State Machine.
 *
 * @module entryStateManager/decisionEngineTypes
 */

import type { EntryTriggerKind } from './evaluationTypes';
import type { ConflictResolutionMethod, ConflictResolverResult } from './conflictResolverTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';

/** Scaffold decision candidate status — not final EntryState decision (Task 02.5.6). */
export enum DecisionCandidateStatus {
  ELIGIBLE = 'ELIGIBLE',
  BLOCKED = 'BLOCKED',
  UNRESOLVED = 'UNRESOLVED',
}

/**
 * One decision candidate — placeholder derived from conflict resolution output.
 *
 * **Does not** commit final pipeline decision.
 * **Does not** duplicate Detection Layer `detected` state (Fix 02.5.5).
 */
export interface DecisionCandidate {
  triggerKind: EntryTriggerKind;
  triggerId: TriggerTypeId;
  priority: number;
  /** Optional aggregate slot trace — not runtime detection state. */
  sourceTriggerResult?: string;
  /** Conflict group id when candidate is tied to a resolved conflict row. */
  resolvedConflictId?: string;
  resolvedBy?: ConflictResolutionMethod;
  decisionStatus: DecisionCandidateStatus;
}

/**
 * Input for decision engine — read-only {@link ConflictResolverResult}.
 */
export interface DecisionEngineContext {
  conflictResult: ConflictResolverResult;
  scanId?: string;
}

/**
 * Decision engine scaffold output — candidates only, no final decision.
 */
export interface DecisionEngineResult {
  conflictResult: ConflictResolverResult;
  decisionCandidates: readonly DecisionCandidate[];
  candidateCount: number;
  halted: boolean;
  message: string;
  context: DecisionEngineContext;
}

/** Context validation result — conflict result integrity only. */
export interface DecisionEngineContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation — candidate count and integrity (Fix 02.5.5). */
export interface DecisionEngineResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

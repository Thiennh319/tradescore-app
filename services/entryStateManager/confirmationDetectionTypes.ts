/**
 * Confirmation Detection Engine — type models (Task 02.4.6 / 02.4.7).
 *
 * **Purpose:** Scaffold contracts for Confirmation trigger detection.
 *
 * **MUST NOT:** Decide READY/WATCH/LOCKED/BLOCKED, transition, or re-run rules.
 * Answers only: "Các điều kiện xác nhận hiện đã đủ hay chưa?" — placeholder in 02.4.6.
 *
 * @module entryStateManager/confirmationDetectionTypes
 */

import type { EntryState } from './enums';
import type { TransitionAuditLabel, TransitionSourceModule } from './transitionMetadata';
import type {
  EntryStateMarketSnapshot,
  EntryStateSignalSnapshot,
  EntryTransitionCandidate,
} from './evaluationTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { ConfirmationEvidenceKind } from './confirmationEvidenceKinds';
import type { ConfirmationSignalSnapshot } from './confirmationSignalAdapter';

/**
 * One confirmation evidence row — passthrough from app confirmation hints.
 */
export interface ConfirmationEvidence {
  kind: ConfirmationEvidenceKind;
  description: string;
  rawValue: string;
  reason: string;
  /**
   * RuleBook confirmation taxonomy ID when available.
   * **RuleBook V2 has no `CF-*` IDs** — null until approved.
   */
  originRuleId: string | null;
  sourceModule: TransitionSourceModule;
  /** ISO8601 — placeholder when scan timestamp unavailable. */
  timestamp: string;
}

/**
 * Input for Confirmation detection — read-only bundle.
 */
export interface ConfirmationDetectionContext {
  normalizedRuleOutput: NormalizedRuleOutput;
  currentEntryState: EntryState;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  candidateTransitions: readonly EntryTransitionCandidate[];
  /** Optional passthrough confirmation hints — integration supplies; absent → no evidence. */
  confirmationSignalSnapshot?: ConfirmationSignalSnapshot;
  scanId?: string;
}

/**
 * Confirmation detection output — **does not** transition or mutate state.
 */
export interface ConfirmationDetectionResult {
  detected: boolean;
  triggerId: TriggerTypeId;
  priority: number;
  sourceModule: TransitionSourceModule;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  evidence: readonly ConfirmationEvidence[];
  originRuleIds: readonly string[];
  evidenceCount: number;
  detectionMessage: string;
  halted: boolean;
  context: ConfirmationDetectionContext;
}

/** Context validation result — structure only. */
export interface ConfirmationContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation — metadata & evidence integrity (Task 02.4.7). */
export interface ConfirmationDetectionValidationResult {
  valid: boolean;
  errors: readonly string[];
}

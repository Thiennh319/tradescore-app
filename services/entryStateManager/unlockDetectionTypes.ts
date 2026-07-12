/**
 * Unlock Detection Engine — type models (Task 02.4.10 / 02.4.11).
 *
 * **Purpose:** Scaffold contracts for Unlock trigger detection.
 *
 * **MUST NOT:** Decide READY/WATCH/LOCKED/BLOCKED, transition, or re-run rules.
 * Describes conditions to exit LOCKED — placeholder in 02.4.10.
 *
 * @module entryStateManager/unlockDetectionTypes
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
import type { UnlockEvidenceKind } from './unlockEvidenceKinds';
import type { UnlockSignalSnapshot } from './unlockSignalAdapter';

/**
 * One unlock evidence row — passthrough from app unlock hints.
 */
export interface UnlockEvidence {
  kind: UnlockEvidenceKind;
  description: string;
  rawValue: string;
  reason: string;
  /**
   * RuleBook unlock taxonomy ID when available.
   * **RuleBook V2 has no `UL-*` IDs** — null until approved.
   */
  originRuleId: string | null;
  sourceModule: TransitionSourceModule;
  /** ISO8601 — placeholder when scan timestamp unavailable. */
  timestamp: string;
}

/**
 * Input for Unlock detection — read-only bundle.
 */
export interface UnlockDetectionContext {
  normalizedRuleOutput: NormalizedRuleOutput;
  currentEntryState: EntryState;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  candidateTransitions: readonly EntryTransitionCandidate[];
  /** Optional passthrough unlock hints — integration supplies; absent → no evidence. */
  unlockSignalSnapshot?: UnlockSignalSnapshot;
  scanId?: string;
}

/**
 * Unlock detection output — **does not** transition or mutate state.
 */
export interface UnlockDetectionResult {
  detected: boolean;
  triggerId: TriggerTypeId;
  priority: number;
  sourceModule: TransitionSourceModule;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  evidence: readonly UnlockEvidence[];
  originRuleIds: readonly string[];
  evidenceCount: number;
  detectionMessage: string;
  halted: boolean;
  context: UnlockDetectionContext;
}

/** Context validation result — structure only. */
export interface UnlockContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation — metadata & evidence integrity (Task 02.4.11). */
export interface UnlockDetectionValidationResult {
  valid: boolean;
  errors: readonly string[];
}

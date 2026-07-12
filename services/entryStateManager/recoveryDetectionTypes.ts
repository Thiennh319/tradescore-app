/**
 * Recovery Detection Engine — type models (Task 02.4.8 / 02.4.9).
 *
 * **Purpose:** Scaffold contracts for Recovery trigger detection.
 *
 * **MUST NOT:** Decide READY/WATCH/LOCKED/BLOCKED, transition, or re-run rules.
 * Describes ability to exit BLOCKED and begin recovery — placeholder in 02.4.8.
 *
 * @module entryStateManager/recoveryDetectionTypes
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
import type { RecoveryEvidenceKind } from './recoveryEvidenceKinds';
import type { RecoverySignalSnapshot } from './recoverySignalAdapter';

/**
 * One recovery evidence row — passthrough from app recovery hints.
 */
export interface RecoveryEvidence {
  kind: RecoveryEvidenceKind;
  description: string;
  rawValue: string;
  reason: string;
  /**
   * RuleBook recovery taxonomy ID when available.
   * **RuleBook V2 has no `RC-*` IDs** — null until approved.
   */
  originRuleId: string | null;
  sourceModule: TransitionSourceModule;
  /** ISO8601 — placeholder when scan timestamp unavailable. */
  timestamp: string;
}

/**
 * Input for Recovery detection — read-only bundle.
 */
export interface RecoveryDetectionContext {
  normalizedRuleOutput: NormalizedRuleOutput;
  currentEntryState: EntryState;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  candidateTransitions: readonly EntryTransitionCandidate[];
  /** Optional passthrough recovery hints — integration supplies; absent → no evidence. */
  recoverySignalSnapshot?: RecoverySignalSnapshot;
  scanId?: string;
}

/**
 * Recovery detection output — **does not** transition or mutate state.
 */
export interface RecoveryDetectionResult {
  detected: boolean;
  triggerId: TriggerTypeId;
  priority: number;
  sourceModule: TransitionSourceModule;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  evidence: readonly RecoveryEvidence[];
  originRuleIds: readonly string[];
  evidenceCount: number;
  detectionMessage: string;
  halted: boolean;
  context: RecoveryDetectionContext;
}

/** Context validation result — structure only. */
export interface RecoveryContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation — metadata & evidence integrity (Task 02.4.9). */
export interface RecoveryDetectionValidationResult {
  valid: boolean;
  errors: readonly string[];
}

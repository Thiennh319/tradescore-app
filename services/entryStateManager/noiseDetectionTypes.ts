/**
 * Noise Detection Engine — type models (Task 02.4.4).
 *
 * **Purpose:** Scaffold contracts for Noise trigger detection.
 *
 * **MUST NOT:** Decide READY/WATCH/LOCKED/BLOCKED, transition, or re-run rules.
 * Answers only: "Có dấu hiệu nhiễu hay không?" — placeholder in 02.4.4.
 *
 * @module entryStateManager/noiseDetectionTypes
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
import type { NoiseEvidenceKind } from './noiseEvidenceKinds';
import type { NoiseSignalSnapshot } from './noiseSignalAdapter';

/**
 * One noise evidence row — passthrough from app noise hints.
 */
export interface NoiseEvidence {
  kind: NoiseEvidenceKind;
  description: string;
  rawValue: string;
  /** Passthrough reason text — same as rawValue from hint. */
  reason: string;
  /**
   * RuleBook noise taxonomy ID when available.
   * **RuleBook V2 has no `NB-*` IDs** — null until approved.
   */
  originRuleId: string | null;
  sourceModule: TransitionSourceModule;
  /** ISO8601 — placeholder when scan timestamp unavailable. */
  timestamp: string;
}

/**
 * Input for Noise detection — read-only bundle.
 */
export interface NoiseDetectionContext {
  normalizedRuleOutput: NormalizedRuleOutput;
  currentEntryState: EntryState;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  candidateTransitions: readonly EntryTransitionCandidate[];
  /** Optional passthrough noise hints — integration supplies; absent → no evidence. */
  noiseSignalSnapshot?: NoiseSignalSnapshot;
  scanId?: string;
}

/**
 * Noise detection output — **does not** transition or mutate state.
 */
export interface NoiseDetectionResult {
  detected: boolean;
  triggerId: TriggerTypeId;
  priority: number;
  sourceModule: TransitionSourceModule;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  evidence: readonly NoiseEvidence[];
  /** Distinct non-null origin rule IDs from evidence. */
  originRuleIds: readonly string[];
  evidenceCount: number;
  detectionMessage: string;
  halted: boolean;
  context: NoiseDetectionContext;
}

/** Context validation result — structure only. */
export interface NoiseContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation — metadata & evidence integrity (Task 02.4.5). */
export interface NoiseDetectionValidationResult {
  valid: boolean;
  errors: readonly string[];
}

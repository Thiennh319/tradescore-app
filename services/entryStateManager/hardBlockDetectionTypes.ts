/**
 * HardBlock Detection Engine — type models (Task 02.4.2 / 02.4.3).
 *
 * **Purpose:** Read-only contracts for HardBlock trigger detection.
 *
 * **MUST NOT:** Decide transitions, change state, re-run Rule/Score Engine, or create new rules.
 *
 * Detection **reuses** existing rule output via {@link NormalizedRuleOutput}.
 *
 * @module entryStateManager/hardBlockDetectionTypes
 */

import type { EntryState } from './enums';
import type { TransitionAuditLabel, TransitionSourceModule } from './transitionMetadata';
import type {
  EntryStateMarketSnapshot,
  EntryStateSignalSnapshot,
  EntryTransitionCandidate,
} from './evaluationTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';
import type { HardBlockTaxonomyId } from './hardBlockIds';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';

/**
 * @deprecated Use {@link NormalizedRuleOutput}. Kept for Task 02.4.2 import compat.
 */
export type HardBlockRuleEngineOutput = NormalizedRuleOutput;

/**
 * Evidence kinds for audit — descriptive labels only.
 */
export type HardBlockEvidenceKind =
  | 'EXISTING_HARD_BLOCK_ACTIVE'
  | 'RULE_ENGINE_RETURNED_BLOCK'
  | 'GROUP_BLOCK_ACTIVE'
  | 'ADX_BELOW_THRESHOLD'
  | 'TRADE_PLAN_INVALID'
  | 'BLOCK_REASONS_PRESENT';

/**
 * One audit evidence row — passthrough from rule output.
 */
export interface HardBlockEvidence {
  kind: HardBlockEvidenceKind;
  description: string;
  rawValue: string;
  /** RuleBook §6 taxonomy ID when mappable; `null` when app has no ID (e.g. trade plan invalid). */
  originRuleId: HardBlockTaxonomyId | string | null;
  sourceModule: TransitionSourceModule;
  /** ISO8601 — placeholder when scan timestamp unavailable. */
  timestamp: string;
}

/**
 * Input for HardBlock detection — read-only bundle.
 */
export interface HardBlockDetectionContext {
  /** Normalized Rule Engine output — sole data source for detection. */
  normalizedRuleOutput: NormalizedRuleOutput;
  currentEntryState: EntryState;
  candidateTransitions: readonly EntryTransitionCandidate[];
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  scanId?: string;
}

/**
 * HardBlock detection output — **does not** transition or mutate state.
 */
export interface HardBlockDetectionResult {
  detected: boolean;
  triggerId: TriggerTypeId;
  reason: string;
  evidence: readonly HardBlockEvidence[];
  sourceModule: TransitionSourceModule;
  priority: number;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  /** Distinct origin rule IDs from evidence (nulls excluded). */
  originRuleIds: readonly (HardBlockTaxonomyId | string)[];
  evidenceCount: number;
  detectionMessage: string;
  halted: boolean;
  context: HardBlockDetectionContext;
}

/** Context validation result — structure only. */
export interface HardBlockContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation — metadata & evidence integrity (Task 02.4.3). */
export interface HardBlockDetectionValidationResult {
  valid: boolean;
  errors: readonly string[];
}

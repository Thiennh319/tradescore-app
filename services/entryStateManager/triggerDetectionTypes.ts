/**
 * Trigger Detection Engine — type models (Task 02.4.1).
 *
 * **Purpose:** Contracts for trigger detection layer (detect only — never decide state).
 *
 * **Trigger Detection Engine MUST NOT:**
 * - Select or execute transitions
 * - Change EntryState, Store, or Journal
 * - Call UI, Entry Engine, or production scan
 *
 * **MAY ONLY:** Return {@link TriggerDetectionResult} describing detected triggers (Task 02.4.2+).
 *
 * @module entryStateManager/triggerDetectionTypes
 */

import type { EntryState } from './enums';
import type { TransitionAuditLabel, TransitionCategory, TransitionSourceModule } from './transitionMetadata';
import type {
  EntryStateMarketSnapshot,
  EntryStateSignalSnapshot,
  EntryTransitionCandidate,
  EntryTriggerKind,
} from './evaluationTypes';
import type { EntryTransitionId } from './transitionTypes';

/** Stable trigger type ID — format `ESM-TRIG-{KIND}`. */
export type TriggerTypeId = `ESM-TRIG-${EntryTriggerKind}`;

/**
 * Rule snapshot placeholder — future binding to ruleAuditSnapshot / Rule Engine output.
 *
 * **Not populated from production** in Task 02.4.1.
 */
export interface TriggerDetectionRuleSnapshotPlaceholder {
  rulebookVersion: string;
  hardBlocks: readonly string[];
  groupBlocks: readonly string[];
  decision: string;
  /** Notes that live rule evaluation is a later task. */
  placeholderNote: string;
}

/**
 * Input context for trigger detection — read-only bundle.
 *
 * **Does not call** Score Engine, Rule Engine, or scan services.
 */
export interface TriggerDetectionContext {
  currentEntryState: EntryState;
  marketSnapshot: EntryStateMarketSnapshot;
  signalSnapshot: EntryStateSignalSnapshot;
  /** From pipeline step 3 — matrix candidates only. */
  candidateTransitions: readonly EntryTransitionCandidate[];
  ruleSnapshot: TriggerDetectionRuleSnapshotPlaceholder;
  scanId?: string;
}

/**
 * Static trigger type definition — catalog row (no runtime detection).
 *
 * Maps {@link EntryTriggerKind} to audit metadata for Journal / Export / AI validation.
 */
export interface TriggerTypeDefinition {
  triggerId: TriggerTypeId;
  triggerType: EntryTriggerKind;
  triggerCategory: TransitionCategory;
  sourceModule: TransitionSourceModule;
  priority: number;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  description: string;
}

/**
 * One detected trigger instance — output item (Task 02.4.2+ will populate).
 *
 * Task 02.4.1: interface only; lists remain empty in scaffold.
 */
export interface DetectedTrigger {
  triggerId: TriggerTypeId;
  triggerType: EntryTriggerKind;
  triggerCategory: TransitionCategory;
  sourceModule: TransitionSourceModule;
  priority: number;
  auditLabel: TransitionAuditLabel;
  ruleReference: string;
  description: string;
  /** Placeholder 0–1 — not computed in Task 02.4.1. */
  confidencePlaceholder: number | null;
  detectionMessage: string;
  relatedTransitionId?: EntryTransitionId;
}

/**
 * Trigger detection output — **does not** choose state or transition.
 */
export interface TriggerDetectionResult {
  /** Detected triggers (empty until detection task). */
  triggers: readonly DetectedTrigger[];
  /** Same triggers sorted by priority desc — metadata order description. */
  sortedByPriority: readonly DetectedTrigger[];
  /** Summary for audit log. */
  detectionMessage: string;
  /** True when context validation fails — detection skipped. */
  halted: boolean;
  /** Optional failure reason code label — documentation only. */
  failureScenarioId?: string;
  context: TriggerDetectionContext;
}

/** Documented edge case — description only, no handler. */
export interface TriggerEdgeCaseSpec {
  id: string;
  title: string;
  description: string;
  involvedKinds: readonly EntryTriggerKind[];
  expectedBehavior: string;
}

/** Documented failure scenario — documentation only. */
export interface TriggerFailureScenarioSpec {
  id: string;
  title: string;
  description: string;
  detectionAction: string;
}

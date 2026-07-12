/**
 * Priority Resolver — type models (Task 02.5.2).
 *
 * **Purpose:** Validate aggregate output and collect catalog priority metadata.
 *
 * **MUST NOT:** Sort runtime, resolve conflicts, decide state, or transition.
 *
 * @module entryStateManager/priorityResolverTypes
 */

import type { EntryTriggerKind } from './evaluationTypes';
import type { TriggerAggregateResult } from './triggerAggregatorTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';

/** Detector slot keys aligned with {@link TriggerAggregateResult}. */
export type PriorityResolverSlotKey =
  | 'hardBlockResult'
  | 'recoveryResult'
  | 'unlockResult'
  | 'confirmationResult'
  | 'noiseResult';

/**
 * One catalog-backed priority entry — placeholder for future grouping (Task 02.5.3+).
 *
 * Priority is read from `TRIGGER_TYPE_CATALOG` only.
 */
export interface PriorityGroupEntryPlaceholder {
  slotKey: PriorityResolverSlotKey;
  triggerId: TriggerTypeId;
  triggerKind: EntryTriggerKind;
  catalogPriority: number;
}

/**
 * Priority group placeholder — **not sorted at runtime** in Task 02.5.2.
 *
 * Scaffold uses one group per present detector slot in fixed slot order.
 */
export interface PriorityGroupPlaceholder {
  catalogPriority: number;
  entries: readonly PriorityGroupEntryPlaceholder[];
}

/**
 * Input for priority resolution — read-only {@link TriggerAggregateResult}.
 */
export interface PriorityResolverContext {
  aggregateResult: TriggerAggregateResult;
  scanId?: string;
}

/**
 * Priority resolution output — aggregate passthrough + catalog metadata placeholders.
 *
 * `highestPriority` is the max catalog priority among present slots — not runtime-sorted.
 */
export interface PriorityResolverResult {
  aggregateResult: TriggerAggregateResult;
  /** Placeholder groups — fixed slot order, no runtime sort. */
  priorityGroups: readonly PriorityGroupPlaceholder[];
  /** Max catalog priority among present triggers; `null` when none present. */
  highestPriority: number | null;
  halted: boolean;
  message: string;
  context: PriorityResolverContext;
}

/** Context validation result — aggregate integrity and catalog priority checks. */
export interface PriorityResolverContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

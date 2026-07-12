/**
 * Conflict Resolver — type models (Task 02.5.3 / 02.5.4).
 *
 * **Purpose:** Detect potential trigger conflicts and resolve by catalog priority.
 *
 * **MUST NOT:** Produce final entry Decision, change State, or execute Transition.
 *
 * @module entryStateManager/conflictResolverTypes
 */

import type { EntryTriggerKind } from './evaluationTypes';
import type {
  PriorityGroupEntryPlaceholder,
  PriorityResolverResult,
  PriorityResolverSlotKey,
} from './priorityResolverTypes';
import type { TriggerTypeId } from './triggerDetectionTypes';

/** Conflict group resolution outcome — per-group only (not final Decision). */
export enum ConflictResolutionStatus {
  UNRESOLVED = 'UNRESOLVED',
  RESOLVED = 'RESOLVED',
}

/** Conflict group category — derived from deterministic groupId prefix. */
export type ConflictKind = 'SAME_PRIORITY' | 'EDGE_CASE';

/** One member in a conflict group. */
export interface ConflictGroupMemberPlaceholder {
  slotKey: PriorityResolverSlotKey;
  triggerId: TriggerTypeId;
  triggerKind: EntryTriggerKind;
  catalogPriority: number;
}

/**
 * Conflict group — documented potential conflict (Task 02.5.3).
 */
export interface ConflictGroupPlaceholder {
  groupId: string;
  members: readonly ConflictGroupMemberPlaceholder[];
  reason: string;
}

/** How resolution was applied within a conflict group (Fix 02.5.4). */
export enum ConflictResolutionMethod {
  CATALOG_PRIORITY = 'CATALOG_PRIORITY',
  SAME_PRIORITY = 'SAME_PRIORITY',
}

/**
 * Per-group conflict resolution — trigger-level only (Task 02.5.4).
 *
 * **Not** a final pipeline Decision — Task 02.5.5.
 */
export interface ResolvedConflict {
  groupId: string;
  conflictKind: ConflictKind;
  status: ConflictResolutionStatus;
  /** Set when {@link status} is RESOLVED; `null` when UNRESOLVED. */
  winningTrigger: ConflictGroupMemberPlaceholder | null;
  /** Triggers suppressed by catalog priority within this group. */
  suppressedTriggers: readonly ConflictGroupMemberPlaceholder[];
  /** How resolution was attempted — for Decision Engine (Task 02.5.5). */
  resolvedBy: ConflictResolutionMethod | null;
  reason: string;
}

/**
 * Input for conflict detection / resolution — read-only {@link PriorityResolverResult}.
 */
export interface ConflictResolverContext {
  priorityResult: PriorityResolverResult;
  scanId?: string;
}

/**
 * Conflict resolver output — detection + per-group resolution metadata.
 */
export interface ConflictResolverResult {
  priorityResult: PriorityResolverResult;
  conflictGroups: readonly ConflictGroupPlaceholder[];
  conflictCount: number;
  resolvedConflicts: readonly ResolvedConflict[];
  resolvedCount: number;
  unresolvedCount: number;
  halted: boolean;
  message: string;
  context: ConflictResolverContext;
}

/** Context validation result — priority result integrity only. */
export interface ConflictResolverContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Flat trigger entry used internally for conflict analysis. */
export type ConflictAnalysisEntry = PriorityGroupEntryPlaceholder;

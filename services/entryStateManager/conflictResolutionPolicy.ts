/**
 * Conflict resolution policy — catalog priority only (Task 02.5.4 / Fix 02.5.4).
 *
 * **Sole module** that reads `TRIGGER_TYPE_CATALOG` for conflict winner selection.
 * **Does NOT** decide final entry state, transition, or production action.
 *
 * @module entryStateManager/conflictResolutionPolicy
 */

import { EntryTriggerKind } from './evaluationTypes';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import type { ConflictGroupMemberPlaceholder } from './conflictResolverTypes';
import {
  ConflictResolutionMethod,
  ConflictResolutionStatus,
} from './conflictResolverTypes';

/** Outcome of {@link CONFLICT_RESOLUTION_POLICY.resolveByCatalogPriority}. */
export interface CatalogPriorityResolutionOutcome {
  status: ConflictResolutionStatus;
  winningTrigger: ConflictGroupMemberPlaceholder | null;
  suppressedTriggers: readonly ConflictGroupMemberPlaceholder[];
  resolvedBy: ConflictResolutionMethod | null;
  reason: string;
}

function policyPriorityForKind(kind: EntryTriggerKind): number {
  return TRIGGER_TYPE_CATALOG[kind].priority;
}

function compareCatalogPriority(a: number, b: number): -1 | 0 | 1 {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function highestCatalogPriority(members: readonly ConflictGroupMemberPlaceholder[]): number {
  let highest = policyPriorityForKind(members[0].triggerKind);
  for (let i = 1; i < members.length; i += 1) {
    const priority = policyPriorityForKind(members[i].triggerKind);
    if (compareCatalogPriority(priority, highest) > 0) {
      highest = priority;
    }
  }
  return highest;
}

function membersAtCatalogPriority(
  members: readonly ConflictGroupMemberPlaceholder[],
  priority: number,
): ConflictGroupMemberPlaceholder[] {
  return members.filter((member) => policyPriorityForKind(member.triggerKind) === priority);
}

/**
 * Locked resolution policy — catalog-backed priority comparison only.
 *
 * Same catalog priority → {@link ConflictResolutionStatus.UNRESOLVED} (no tie-break).
 */
export const CONFLICT_RESOLUTION_POLICY = {
  catalogSource: 'TRIGGER_TYPE_CATALOG' as const,
  samePriorityStatus: ConflictResolutionStatus.UNRESOLVED,

  getPriorityForKind(kind: EntryTriggerKind): number {
    return policyPriorityForKind(kind);
  },

  getTriggerIdForKind(kind: EntryTriggerKind): string {
    return TRIGGER_TYPE_CATALOG[kind].triggerId;
  },

  /**
   * Select winning trigger by catalog priority — **only** place for winner logic.
   */
  getWinningTrigger(
    members: readonly ConflictGroupMemberPlaceholder[],
  ): ConflictGroupMemberPlaceholder | null {
    const outcome = CONFLICT_RESOLUTION_POLICY.resolveByCatalogPriority(members);
    return outcome.winningTrigger;
  },

  /**
   * Resolve a member set by catalog priority — single policy entry for conflict resolution.
   */
  resolveByCatalogPriority(
    members: readonly ConflictGroupMemberPlaceholder[],
  ): CatalogPriorityResolutionOutcome {
    if (members.length < 2) {
      return {
        status: ConflictResolutionStatus.UNRESOLVED,
        winningTrigger: null,
        suppressedTriggers: [],
        resolvedBy: null,
        reason: 'Insufficient members for conflict resolution',
      };
    }

    const topPriority = highestCatalogPriority(members);
    const topMembers = membersAtCatalogPriority(members, topPriority);

    if (topMembers.length !== 1) {
      return {
        status: CONFLICT_RESOLUTION_POLICY.samePriorityStatus,
        winningTrigger: null,
        suppressedTriggers: [],
        resolvedBy: ConflictResolutionMethod.SAME_PRIORITY,
        reason: `Same catalog priority ${topPriority} — no automatic winner`,
      };
    }

    const winningTrigger = topMembers[0];
    const suppressedTriggers = members.filter(
      (member) => member.triggerId !== winningTrigger.triggerId,
    );

    return {
      status: ConflictResolutionStatus.RESOLVED,
      winningTrigger,
      suppressedTriggers,
      resolvedBy: ConflictResolutionMethod.CATALOG_PRIORITY,
      reason: `Catalog priority ${topPriority} — ${winningTrigger.triggerKind} over suppressed trigger(s)`,
    };
  },
} as const;

/** Canonical SSOT alias — same object as {@link CONFLICT_RESOLUTION_POLICY} (Task 02.6.7). */
export const CONFLICT_POLICY = CONFLICT_RESOLUTION_POLICY;

export type ConflictResolutionPolicy = typeof CONFLICT_RESOLUTION_POLICY;

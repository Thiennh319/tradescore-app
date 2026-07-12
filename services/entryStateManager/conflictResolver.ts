/**
 * Conflict Resolver — detection + resolution runtime (Task 02.5.3 / 02.5.4).
 *
 * **Validates** {@link PriorityResolverResult}, **groups** conflicts, **resolves** by catalog priority.
 * **Does NOT** produce final Decision, change State, execute Transition, or mutate priority/aggregate.
 *
 * @module entryStateManager/conflictResolver
 */

import { CONFLICT_EDGE_CASE_SPECS, samePriorityConflictGroupId } from './conflictEdgeCaseSpecs';
import { CONFLICT_RESOLUTION_POLICY } from './conflictResolutionPolicy';
import { validatePriorityResolverContext } from './priorityResolver';
import type {
  ConflictGroupMemberPlaceholder,
  ConflictGroupPlaceholder,
  ConflictKind,
  ConflictResolverContext,
  ConflictResolverContextValidationResult,
  ConflictResolverResult,
  ResolvedConflict,
} from './conflictResolverTypes';
import { ConflictResolutionStatus } from './conflictResolverTypes';
import type { PriorityGroupEntryPlaceholder, PriorityResolverResult } from './priorityResolverTypes';
import { EntryTriggerKind } from './evaluationTypes';
import { isRecord } from './pipelineValidationUtils';

function flattenPriorityEntries(
  priorityResult: PriorityResolverResult,
): readonly PriorityGroupEntryPlaceholder[] {
  const entries: PriorityGroupEntryPlaceholder[] = [];
  for (const group of priorityResult.priorityGroups) {
    for (const entry of group.entries) {
      entries.push(entry);
    }
  }
  return entries;
}

function readHighestFromGroups(priorityGroups: PriorityResolverResult['priorityGroups']): number | null {
  if (priorityGroups.length === 0) {
    return null;
  }
  let highest = priorityGroups[0].catalogPriority;
  for (let i = 1; i < priorityGroups.length; i += 1) {
    if (priorityGroups[i].catalogPriority > highest) {
      highest = priorityGroups[i].catalogPriority;
    }
  }
  return highest;
}

function toMember(entry: PriorityGroupEntryPlaceholder): ConflictGroupMemberPlaceholder {
  return {
    slotKey: entry.slotKey,
    triggerId: entry.triggerId,
    triggerKind: entry.triggerKind,
    catalogPriority: entry.catalogPriority,
  };
}

function kindsPresent(entries: readonly PriorityGroupEntryPlaceholder[]): Set<EntryTriggerKind> {
  return new Set(entries.map((e) => e.triggerKind));
}

function entriesForKinds(
  entries: readonly PriorityGroupEntryPlaceholder[],
  kinds: readonly EntryTriggerKind[],
): ConflictGroupMemberPlaceholder[] {
  const kindSet = new Set(kinds);
  return entries.filter((e) => kindSet.has(e.triggerKind)).map(toMember);
}

function validatePriorityResult(priorityResult: PriorityResolverResult, errors: string[]): void {
  if (!isRecord(priorityResult)) {
    errors.push('priorityResult must be an object');
    return;
  }

  if (!isRecord(priorityResult.aggregateResult)) {
    errors.push('priorityResult.aggregateResult must be an object');
  } else if (priorityResult.aggregateResult.halted) {
    errors.push('priorityResult.aggregateResult is halted');
  }

  if (!Array.isArray(priorityResult.priorityGroups)) {
    errors.push('priorityResult.priorityGroups must be an array');
  } else {
    for (let i = 0; i < priorityResult.priorityGroups.length; i += 1) {
      const group = priorityResult.priorityGroups[i];
      if (typeof group.catalogPriority !== 'number') {
        errors.push(`priorityResult.priorityGroups[${i}].catalogPriority must be a number`);
      }
      if (!Array.isArray(group.entries)) {
        errors.push(`priorityResult.priorityGroups[${i}].entries must be an array`);
      }
    }
  }

  if (
    priorityResult.highestPriority !== null &&
    typeof priorityResult.highestPriority !== 'number'
  ) {
    errors.push('priorityResult.highestPriority must be number or null');
  }

  if (Array.isArray(priorityResult.priorityGroups)) {
    const expectedHighest = readHighestFromGroups(priorityResult.priorityGroups);
    if (priorityResult.highestPriority !== expectedHighest) {
      errors.push('priorityResult.highestPriority must match priorityGroups metadata');
    }
  }

  if (typeof priorityResult.halted !== 'boolean') {
    errors.push('priorityResult.halted must be boolean');
  } else if (priorityResult.halted) {
    errors.push('priorityResult.halted must be false');
  }

  if (typeof priorityResult.message !== 'string') {
    errors.push('priorityResult.message must be a string');
  }

  if (!isRecord(priorityResult.context)) {
    errors.push('priorityResult.context must be an object');
  } else {
    const priorityValidation = validatePriorityResolverContext(priorityResult.context);
    if (!priorityValidation.valid) {
      for (const err of priorityValidation.errors) {
        errors.push(`priorityResult.context: ${err}`);
      }
    }
  }
}

function collectSamePriorityConflicts(
  entries: readonly PriorityGroupEntryPlaceholder[],
): ConflictGroupPlaceholder[] {
  const byPriority = new Map<number, PriorityGroupEntryPlaceholder[]>();

  for (const entry of entries) {
    const list = byPriority.get(entry.catalogPriority) ?? [];
    list.push(entry);
    byPriority.set(entry.catalogPriority, list);
  }

  const groups: ConflictGroupPlaceholder[] = [];
  for (const [priority, members] of byPriority) {
    if (members.length < 2) {
      continue;
    }
    groups.push({
      groupId: samePriorityConflictGroupId(priority),
      members: members.map(toMember),
      reason: `Potential conflict only: ${members.length} triggers share catalog priority ${priority}.`,
    });
  }

  return groups;
}

function collectEdgeCaseConflicts(
  entries: readonly PriorityGroupEntryPlaceholder[],
): ConflictGroupPlaceholder[] {
  const present = kindsPresent(entries);
  const groups: ConflictGroupPlaceholder[] = [];

  for (const spec of CONFLICT_EDGE_CASE_SPECS) {
    if (spec.involvedKinds.length < 2) {
      continue;
    }
    const allPresent = spec.involvedKinds.every((kind) => present.has(kind));
    if (!allPresent) {
      continue;
    }

    const members = entriesForKinds(entries, spec.involvedKinds);
    if (members.length < 2) {
      continue;
    }

    groups.push({
      groupId: spec.edgeId,
      members,
      reason: spec.description,
    });
  }

  return groups;
}

/**
 * Analyzes {@link PriorityResolverResult} for potential conflicts — grouping only.
 *
 * **No resolve, winner, loser, or priority override.**
 */
export function detectPotentialConflicts(
  priorityResult: PriorityResolverResult,
): readonly ConflictGroupPlaceholder[] {
  const entries = flattenPriorityEntries(priorityResult);
  if (entries.length < 2) {
    return [];
  }

  const samePriority = collectSamePriorityConflicts(entries);
  const edgeCases = collectEdgeCaseConflicts(entries);

  const seen = new Set<string>();
  const merged: ConflictGroupPlaceholder[] = [];

  for (const group of [...samePriority, ...edgeCases]) {
    const memberKey = group.members
      .map((m) => m.triggerId)
      .sort()
      .join('|');
    const dedupeKey = `${group.groupId}::${memberKey}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    merged.push(group);
  }

  return merged;
}

function conflictKindFromGroupId(groupId: string): ConflictKind {
  return groupId.startsWith('CONFLICT-SAME-PRIORITY-') ? 'SAME_PRIORITY' : 'EDGE_CASE';
}

/**
 * Resolves one conflict group by {@link CONFLICT_RESOLUTION_POLICY} catalog priority.
 *
 * Same catalog priority → {@link ConflictResolutionStatus.UNRESOLVED} — no tie-break.
 */
export function resolveConflictGroup(group: ConflictGroupPlaceholder): ResolvedConflict {
  const conflictKind = conflictKindFromGroupId(group.groupId);
  const outcome = CONFLICT_RESOLUTION_POLICY.resolveByCatalogPriority(group.members);

  return {
    groupId: group.groupId,
    conflictKind,
    status: outcome.status,
    winningTrigger: outcome.winningTrigger,
    suppressedTriggers: outcome.suppressedTriggers,
    resolvedBy: outcome.resolvedBy,
    reason: outcome.reason,
  };
}

function resolveAllConflictGroups(
  groups: readonly ConflictGroupPlaceholder[],
): readonly ResolvedConflict[] {
  return groups.map(resolveConflictGroup);
}

function countByStatus(
  resolved: readonly ResolvedConflict[],
  status: ConflictResolutionStatus,
): number {
  return resolved.filter((row) => row.status === status).length;
}

function buildConflictMessage(
  halted: boolean,
  conflictCount: number,
  resolvedCount: number,
  unresolvedCount: number,
  errors: readonly string[],
): string {
  if (halted) {
    return errors.join('; ');
  }
  if (conflictCount === 0) {
    return 'No potential conflicts detected — nothing to resolve';
  }
  return `Detected ${conflictCount} conflict group(s) — resolved=${resolvedCount}, unresolved=${unresolvedCount}`;
}

function createMissingPriorityFallback(): PriorityResolverResult {
  return {
    aggregateResult: {
      triggerCount: 0,
      halted: true,
      message: 'Missing priorityResult',
      context: {},
    },
    priorityGroups: [],
    highestPriority: null,
    halted: true,
    message: 'Missing priorityResult',
    context: { aggregateResult: { triggerCount: 0, halted: true, message: '', context: {} } },
  };
}

/**
 * Validates conflict resolver context — priority result must be valid and not halted.
 */
export function validateConflictResolverContext(
  context: ConflictResolverContext,
): ConflictResolverContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.priorityResult === undefined) {
    errors.push('Missing priorityResult');
    return { valid: false, errors };
  }

  validatePriorityResult(context.priorityResult, errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Conflict resolution runtime — validate, detect groups, resolve by catalog priority.
 *
 * **Does NOT** produce final Decision, change State, or execute Transition.
 */
export function resolveConflicts(context: ConflictResolverContext): ConflictResolverResult {
  const validation = validateConflictResolverContext(context);
  const priorityResult = context.priorityResult ?? createMissingPriorityFallback();
  const conflictGroups = validation.valid ? detectPotentialConflicts(priorityResult) : [];
  const resolvedConflicts = validation.valid ? resolveAllConflictGroups(conflictGroups) : [];
  const conflictCount = conflictGroups.length;
  const resolvedCount = countByStatus(resolvedConflicts, ConflictResolutionStatus.RESOLVED);
  const unresolvedCount = countByStatus(resolvedConflicts, ConflictResolutionStatus.UNRESOLVED);
  const halted = !validation.valid;

  return {
    priorityResult,
    conflictGroups,
    conflictCount,
    resolvedConflicts,
    resolvedCount,
    unresolvedCount,
    halted,
    message: buildConflictMessage(
      halted,
      conflictCount,
      resolvedCount,
      unresolvedCount,
      validation.errors,
    ),
    context,
  };
}

/** Namespace for discoverability. */
export const ConflictResolver = {
  detectPotentialConflicts,
  resolveConflictGroup,
  resolveConflicts,
  validateConflictResolverContext,
} as const;

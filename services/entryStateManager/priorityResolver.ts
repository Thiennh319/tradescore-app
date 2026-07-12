/**
 * Priority Resolver — scaffold (Task 02.5.2).
 *
 * **Validates** {@link TriggerAggregateResult} and **reads** priority from `TRIGGER_TYPE_CATALOG`.
 * **Does NOT** sort runtime, resolve conflicts, decide state, or transition.
 *
 * @module entryStateManager/priorityResolver
 */

import { EntryTriggerKind } from './evaluationTypes';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { validateTriggerAggregatorContext } from './triggerAggregator';
import type { TriggerAggregateResult } from './triggerAggregatorTypes';
import type {
  PriorityGroupEntryPlaceholder,
  PriorityGroupPlaceholder,
  PriorityResolverContext,
  PriorityResolverContextValidationResult,
  PriorityResolverResult,
  PriorityResolverSlotKey,
} from './priorityResolverTypes';
import { isRecord } from './pipelineValidationUtils';

interface PrioritySlotSpec {
  key: PriorityResolverSlotKey;
  kind: EntryTriggerKind;
}

const PRIORITY_SLOTS: readonly PrioritySlotSpec[] = [
  { key: 'hardBlockResult', kind: EntryTriggerKind.HardBlock },
  { key: 'recoveryResult', kind: EntryTriggerKind.Recovery },
  { key: 'unlockResult', kind: EntryTriggerKind.Unlock },
  { key: 'confirmationResult', kind: EntryTriggerKind.Confirmation },
  { key: 'noiseResult', kind: EntryTriggerKind.Noise },
];

function countPresentSlots(aggregateResult: TriggerAggregateResult): number {
  let count = 0;
  for (const spec of PRIORITY_SLOTS) {
    if (aggregateResult[spec.key] !== undefined) {
      count += 1;
    }
  }
  return count;
}

function validateAggregateResult(aggregateResult: TriggerAggregateResult, errors: string[]): void {
  if (!isRecord(aggregateResult)) {
    errors.push('aggregateResult must be an object');
    return;
  }

  if (typeof aggregateResult.triggerCount !== 'number' || aggregateResult.triggerCount < 0) {
    errors.push('aggregateResult.triggerCount must be a non-negative number');
  }
  if (typeof aggregateResult.halted !== 'boolean') {
    errors.push('aggregateResult.halted must be boolean');
  }
  if (typeof aggregateResult.message !== 'string') {
    errors.push('aggregateResult.message must be a string');
  }
  if (!isRecord(aggregateResult.context)) {
    errors.push('aggregateResult.context must be an object');
    return;
  }

  const contextValidation = validateTriggerAggregatorContext(aggregateResult.context);
  if (!contextValidation.valid) {
    for (const err of contextValidation.errors) {
      errors.push(`aggregateResult.context: ${err}`);
    }
  }

  const presentCount = countPresentSlots(aggregateResult);
  if (aggregateResult.triggerCount !== presentCount) {
    errors.push(
      `aggregateResult.triggerCount must match present detector slots (${presentCount})`,
    );
  }

  for (const spec of PRIORITY_SLOTS) {
    const value = aggregateResult[spec.key];
    if (value === undefined) {
      continue;
    }

    const label = spec.key;
    const catalog = TRIGGER_TYPE_CATALOG[spec.kind];

    if (!isRecord(value)) {
      errors.push(`${label} must be an object`);
      continue;
    }

    if (value.triggerId !== catalog.triggerId) {
      errors.push(`${label}.triggerId must be ${catalog.triggerId}`);
    }
    if (value.priority !== catalog.priority) {
      errors.push(`${label}.priority must be ${catalog.priority} (catalog)`);
    }
    if (value.sourceModule !== catalog.sourceModule) {
      errors.push(`${label}.sourceModule must be ${catalog.sourceModule}`);
    }
    if (value.auditLabel !== catalog.auditLabel) {
      errors.push(`${label}.auditLabel must be ${catalog.auditLabel}`);
    }
  }
}

function collectPriorityGroups(
  aggregateResult: TriggerAggregateResult,
): readonly PriorityGroupPlaceholder[] {
  const groups: PriorityGroupPlaceholder[] = [];

  for (const spec of PRIORITY_SLOTS) {
    const value = aggregateResult[spec.key];
    if (value === undefined) {
      continue;
    }

    const catalog = TRIGGER_TYPE_CATALOG[spec.kind];
    const entry: PriorityGroupEntryPlaceholder = {
      slotKey: spec.key,
      triggerId: catalog.triggerId,
      triggerKind: spec.kind,
      catalogPriority: catalog.priority,
    };

    groups.push({
      catalogPriority: catalog.priority,
      entries: [entry],
    });
  }

  return groups;
}

function readHighestCatalogPriority(
  priorityGroups: readonly PriorityGroupPlaceholder[],
): number | null {
  if (priorityGroups.length === 0) {
    return null;
  }

  let highest = priorityGroups[0].catalogPriority;
  for (let i = 1; i < priorityGroups.length; i += 1) {
    const priority = priorityGroups[i].catalogPriority;
    if (priority > highest) {
      highest = priority;
    }
  }
  return highest;
}

function buildResolveMessage(
  halted: boolean,
  triggerCount: number,
  highestPriority: number | null,
  errors: readonly string[],
): string {
  if (halted) {
    return errors.join('; ');
  }
  if (triggerCount === 0) {
    return 'No triggers present — highestPriority=null';
  }
  return `Priority metadata collected for ${triggerCount} trigger(s) — highest catalog priority=${highestPriority}`;
}

/**
 * Validates priority resolver context — aggregate integrity and catalog metadata.
 *
 * **Does not** sort or resolve conflicts.
 */
export function validatePriorityResolverContext(
  context: PriorityResolverContext,
): PriorityResolverContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  if (context.aggregateResult === undefined) {
    errors.push('Missing aggregateResult');
    return { valid: false, errors };
  }

  validateAggregateResult(context.aggregateResult, errors);

  if (context.aggregateResult.halted) {
    errors.push('aggregateResult is halted');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Resolves priority metadata from aggregate — validate then collect catalog values.
 *
 * **No runtime sort, conflict resolution, decision, or transition.**
 */
function createMissingAggregateFallback(): TriggerAggregateResult {
  return {
    triggerCount: 0,
    halted: true,
    message: 'Missing aggregateResult',
    context: {},
  };
}

export function resolvePriority(context: PriorityResolverContext): PriorityResolverResult {
  const validation = validatePriorityResolverContext(context);
  const aggregateResult = context.aggregateResult ?? createMissingAggregateFallback();
  const priorityGroups = validation.valid ? collectPriorityGroups(aggregateResult) : [];
  const highestPriority = validation.valid ? readHighestCatalogPriority(priorityGroups) : null;
  const halted = !validation.valid;

  return {
    aggregateResult,
    priorityGroups,
    highestPriority,
    halted,
    message: buildResolveMessage(
      halted,
      aggregateResult.triggerCount,
      highestPriority,
      validation.errors,
    ),
    context,
  };
}

/** Namespace for discoverability. */
export const PriorityResolver = {
  resolvePriority,
  validatePriorityResolverContext,
} as const;

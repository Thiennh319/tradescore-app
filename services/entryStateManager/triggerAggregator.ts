/**
 * Trigger Aggregator — scaffold (Task 02.5.1).
 *
 * **Collects** frozen Detection Layer results. **Validates** context and metadata.
 * **Does NOT** sort, filter by detected, merge, resolve priority, conflict, decision, or transition.
 *
 * @module entryStateManager/triggerAggregator
 */

import { EntryTriggerKind } from './evaluationTypes';
import { validateConfirmationDetectionResult } from './confirmationDetectionEngine';
import { validateHardBlockDetectionResult } from './hardBlockDetectionEngine';
import { validateNoiseDetectionResult } from './noiseDetectionEngine';
import { validateRecoveryDetectionResult } from './recoveryDetectionEngine';
import { validateUnlockDetectionResult } from './unlockDetectionEngine';
import { TRIGGER_TYPE_CATALOG } from './triggerDetectionCatalog';
import { TRANSITION_SOURCE_MODULES } from './transitionMetadata';
import type { TriggerTypeDefinition } from './triggerDetectionTypes';
import type {
  TriggerAggregateResult,
  TriggerAggregatorContext,
  TriggerAggregatorContextValidationResult,
} from './triggerAggregatorTypes';
import { isRecord } from './pipelineValidationUtils';

type DetectorSlotKey =
  | 'hardBlockResult'
  | 'recoveryResult'
  | 'unlockResult'
  | 'confirmationResult'
  | 'noiseResult';

interface DetectorSlotSpec<T> {
  key: DetectorSlotKey;
  kind: EntryTriggerKind;
  validateResult: (result: T) => { valid: boolean; errors: readonly string[] };
}

const DETECTOR_SLOTS: readonly DetectorSlotSpec<unknown>[] = [
  {
    key: 'hardBlockResult',
    kind: EntryTriggerKind.HardBlock,
    validateResult: validateHardBlockDetectionResult,
  },
  {
    key: 'recoveryResult',
    kind: EntryTriggerKind.Recovery,
    validateResult: validateRecoveryDetectionResult,
  },
  {
    key: 'unlockResult',
    kind: EntryTriggerKind.Unlock,
    validateResult: validateUnlockDetectionResult,
  },
  {
    key: 'confirmationResult',
    kind: EntryTriggerKind.Confirmation,
    validateResult: validateConfirmationDetectionResult,
  },
  {
    key: 'noiseResult',
    kind: EntryTriggerKind.Noise,
    validateResult: validateNoiseDetectionResult,
  },
];

function validateCatalogMetadata(
  label: string,
  result: Record<string, unknown>,
  catalog: TriggerTypeDefinition,
  errors: string[],
): void {
  if (typeof result.triggerId !== 'string' || !result.triggerId.trim()) {
    errors.push(`${label}.triggerId must be non-empty string`);
    return;
  }
  if (result.triggerId !== catalog.triggerId) {
    errors.push(`${label}.triggerId must be ${catalog.triggerId}`);
  }
  if (result.priority !== catalog.priority) {
    errors.push(`${label}.priority must be ${catalog.priority}`);
  }
  if (result.sourceModule !== catalog.sourceModule) {
    errors.push(`${label}.sourceModule must be ${catalog.sourceModule}`);
  }
  if (result.auditLabel !== catalog.auditLabel) {
    errors.push(`${label}.auditLabel must be ${catalog.auditLabel}`);
  }
  if (typeof result.ruleReference !== 'string' || !result.ruleReference.trim()) {
    errors.push(`${label}.ruleReference must be non-empty string`);
  } else if (result.ruleReference !== catalog.ruleReference) {
    errors.push(`${label}.ruleReference must match catalog`);
  }
  if (typeof result.sourceModule === 'string' && !TRANSITION_SOURCE_MODULES.includes(result.sourceModule as never)) {
    errors.push(`${label}.sourceModule is not a known transition source module`);
  }
}

function validateDetectorSlot(
  context: TriggerAggregatorContext,
  spec: DetectorSlotSpec<unknown>,
): { present: boolean; valid: boolean; errors: string[] } {
  const value = context[spec.key];
  if (value === undefined) {
    return { present: false, valid: false, errors: [] };
  }

  const slotErrors: string[] = [];
  const label = spec.key;

  if (!isRecord(value)) {
    slotErrors.push(`${label} must be an object`);
    return { present: true, valid: false, errors: slotErrors };
  }

  const catalog = TRIGGER_TYPE_CATALOG[spec.kind];
  validateCatalogMetadata(label, value, catalog, slotErrors);

  if (typeof value.detected !== 'boolean') {
    slotErrors.push(`${label}.detected must be boolean`);
  }
  if (!Array.isArray(value.evidence)) {
    slotErrors.push(`${label}.evidence must be an array`);
  }
  if (!isRecord(value.context)) {
    slotErrors.push(`${label}.context must be an object`);
  }

  const resultValidation = spec.validateResult(value);
  if (!resultValidation.valid) {
    for (const err of resultValidation.errors) {
      slotErrors.push(`${label}: ${err}`);
    }
  }

  return { present: true, valid: slotErrors.length === 0, errors: slotErrors };
}

function countValidDetectorSlots(context: TriggerAggregatorContext): number {
  let count = 0;
  for (const spec of DETECTOR_SLOTS) {
    const { present, valid } = validateDetectorSlot(context, spec);
    if (present && valid) {
      count += 1;
    }
  }
  return count;
}

function buildAggregateMessage(triggerCount: number, halted: boolean, errors: readonly string[]): string {
  if (halted) {
    return errors.join('; ');
  }
  if (triggerCount === 0) {
    return 'No detector results supplied — triggerCount=0';
  }
  return `Aggregated ${triggerCount} detector result(s) — no priority or conflict resolution`;
}

/**
 * Validates aggregator context — detector result integrity and catalog metadata.
 *
 * **Does not** evaluate rules or re-run detectors.
 */
export function validateTriggerAggregatorContext(
  context: TriggerAggregatorContext,
): TriggerAggregatorContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (context.scanId !== undefined && typeof context.scanId !== 'string') {
    errors.push('scanId must be a string when provided');
  }

  for (const spec of DETECTOR_SLOTS) {
    const { present, errors: slotErrors } = validateDetectorSlot(context, spec);
    if (present) {
      errors.push(...slotErrors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Aggregates detector results — validate then collect.
 *
 * **No sort, filter, merge, priority, conflict, decision, or transition.**
 *
 * `triggerCount` = number of valid detector result slots — not `detected=true` count.
 */
export function aggregateTriggers(context: TriggerAggregatorContext): TriggerAggregateResult {
  const validation = validateTriggerAggregatorContext(context);
  const triggerCount = countValidDetectorSlots(context);
  const halted = !validation.valid;

  return {
    hardBlockResult: context.hardBlockResult,
    recoveryResult: context.recoveryResult,
    unlockResult: context.unlockResult,
    confirmationResult: context.confirmationResult,
    noiseResult: context.noiseResult,
    triggerCount,
    halted,
    message: buildAggregateMessage(triggerCount, halted, validation.errors),
    context,
  };
}

/** Namespace for discoverability. */
export const TriggerAggregator = {
  aggregateTriggers,
  validateTriggerAggregatorContext,
} as const;

/**
 * Position Adviser Wiring — FEATURE_FLAG integration (Task 02.8.3 / frozen 02.8.4).
 *
 * **Purpose:** Gate {@link PositionAdviserHarnessResult} for future Position Adviser.
 * **Does NOT** call Position Adviser, score, recommend, or wire production.
 *
 * @module entryStateManager/positionAdviserWiring
 */

import {
  validatePositionAdviserHarnessResult,
} from './positionAdviserHarness';
import type { PositionAdviserHarnessResult } from './positionAdviserHarnessTypes';
import {
  DEFAULT_POSITION_ADVISER_ENABLED,
  POSITION_ADVISER_FEATURE_FLAG,
} from './metadata';
import { isRecord, validateRequiredBoolean } from './pipelineValidationUtils';

/** Feature flag key — alias of {@link POSITION_ADVISER_FEATURE_FLAG} from metadata SSOT. */
export const FEATURE_FLAG = POSITION_ADVISER_FEATURE_FLAG;

export { DEFAULT_POSITION_ADVISER_ENABLED };

/**
 * Wiring input — harness output + explicit feature flag value.
 *
 * `positionAdviserEnabled` mirrors {@link FEATURE_FLAG} at call site; default false.
 */
export interface PositionAdviserWiringContext {
  harnessResult: PositionAdviserHarnessResult;
  positionAdviserEnabled: boolean;
}

/** Context validation result. */
export interface PositionAdviserWiringContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result — FEATURE_FLAG skip/run rules + harness integrity when run. */
export interface PositionAdviserWiringResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

function copyWiringContext(context: PositionAdviserWiringContext): PositionAdviserWiringContext {
  return {
    harnessResult: context.harnessResult,
    positionAdviserEnabled: context.positionAdviserEnabled,
  };
}

/** Resolves whether Position Adviser pipeline should proceed — explicit boolean only. */
export function isPositionAdviserEnabled(enabled: boolean): boolean {
  return enabled === true;
}

/** Validates wiring input — harness integrity + feature flag boolean. */
export function validatePositionAdviserWiringContext(
  context: PositionAdviserWiringContext,
): PositionAdviserWiringContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  validateRequiredBoolean(context.positionAdviserEnabled, 'positionAdviserEnabled', errors);

  if (context.harnessResult === undefined) {
    errors.push('harnessResult is required');
    return { valid: errors.length === 0, errors };
  }

  const harnessValidation = validatePositionAdviserHarnessResult(context.harnessResult);
  if (!harnessValidation.valid) {
    for (const err of harnessValidation.errors) {
      errors.push(`harnessResult: ${err}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates wiring output — FEATURE_FLAG skip/run rules + harness integrity when run.
 */
export function validatePositionAdviserWiringResult(
  result: PositionAdviserHarnessResult | null,
  context: PositionAdviserWiringContext,
): PositionAdviserWiringResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  validateRequiredBoolean(context.positionAdviserEnabled, 'context.positionAdviserEnabled', errors);

  if (!context.positionAdviserEnabled) {
    if (result !== null) {
      errors.push(`result must be null when ${FEATURE_FLAG} is off`);
    }
    return { valid: errors.length === 0, errors };
  }

  if (result === null) {
    errors.push(`result is required when ${FEATURE_FLAG} is on`);
    return { valid: false, errors };
  }

  const harnessValidation = validatePositionAdviserHarnessResult(result);
  if (!harnessValidation.valid) {
    for (const err of harnessValidation.errors) {
      errors.push(`result: ${err}`);
    }
  }

  if (context.harnessResult !== result) {
    errors.push('result must be context.harnessResult passthrough when flag is on');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Gates Position Adviser harness output when {@link FEATURE_FLAG} is enabled.
 *
 * Returns `null` when flag is off — result discarded; no side effects.
 * Does not invoke Position Adviser. Throws when context validation fails.
 */
export function runPositionAdviserPipeline(
  context: PositionAdviserWiringContext,
): PositionAdviserHarnessResult | null {
  const validation = validatePositionAdviserWiringContext(context);
  if (!validation.valid) {
    throw new Error(
      `invalid PositionAdviserWiringContext: ${validation.errors.join('; ')}`,
    );
  }

  const resolvedContext = copyWiringContext(context);

  if (!isPositionAdviserEnabled(resolvedContext.positionAdviserEnabled)) {
    return null;
  }

  return resolvedContext.harnessResult;
}

/** Namespace for wiring discoverability. */
export const PositionAdviserWiring = {
  runPositionAdviserPipeline,
  validatePositionAdviserWiringContext,
  validatePositionAdviserWiringResult,
  isPositionAdviserEnabled,
  DEFAULT_POSITION_ADVISER_ENABLED,
  FEATURE_FLAG,
} as const;

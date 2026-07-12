/**
 * Position Adviser Integration Harness — scaffold (Task 02.8.2 / frozen 02.8.4).
 *
 * **Purpose:** Sole orchestration layer between Position Adviser Adapter and future adviser.
 * **Does NOT** call Position Adviser, score, recommend, or mutate inputs.
 *
 * @module entryStateManager/positionAdviserHarness
 */

import { isRecord, validateRequiredNonEmptyString } from './pipelineValidationUtils';
import {
  buildPositionAdviserAdapterResult,
  validatePositionAdviserAdapterResult,
} from './positionAdviserAdapter';
import type { PositionAdviserInput } from './positionAdviserAdapterTypes';
import type {
  PositionAdviserHarnessContext,
  PositionAdviserHarnessContextValidationResult,
  PositionAdviserHarnessResult,
  PositionAdviserHarnessResultValidationResult,
} from './positionAdviserHarnessTypes';
import type { IntegrationHarnessResult } from './integrationHarnessTypes';

function copyHarnessContext(context: PositionAdviserHarnessContext): PositionAdviserHarnessContext {
  return {
    adapterResult: context.adapterResult,
    scanId: context.scanId,
    timestamp: context.timestamp,
  };
}

function toPositionAdviserInput(adapterResult: PositionAdviserHarnessContext['adapterResult']): PositionAdviserInput {
  return {
    decisionSummary: adapterResult.decisionSummary,
    stateSummary: adapterResult.stateSummary,
    actionSummary: adapterResult.actionSummary,
    runtimeSummary: adapterResult.runtimeSummary,
    scanId: adapterResult.scanId,
    timestamp: adapterResult.timestamp,
  };
}

function resolveHalted(adapterResult: PositionAdviserHarnessContext['adapterResult']): boolean {
  return adapterResult.context.halted;
}

function buildHarnessMessage(halted: boolean): string {
  if (halted) {
    return 'Position adviser harness complete (halted) — scaffold only (Task 02.8.2)';
  }
  return 'Position adviser harness complete — scaffold only (Task 02.8.2)';
}

/** Validates harness input — adapter integrity and scan metadata alignment. */
export function validatePositionAdviserHarnessContext(
  context: PositionAdviserHarnessContext,
): PositionAdviserHarnessContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  validateRequiredNonEmptyString(context.scanId, 'scanId', errors);
  validateRequiredNonEmptyString(context.timestamp, 'timestamp', errors);

  if (context.adapterResult === undefined) {
    errors.push('adapterResult is required');
    return { valid: errors.length === 0, errors };
  }

  const adapterValidation = validatePositionAdviserAdapterResult(context.adapterResult);
  if (!adapterValidation.valid) {
    for (const err of adapterValidation.errors) {
      errors.push(`adapterResult: ${err}`);
    }
  }

  if (context.adapterResult.scanId !== context.scanId.trim()) {
    errors.push('scanId must match adapterResult.scanId');
  }
  if (context.adapterResult.timestamp !== context.timestamp.trim()) {
    errors.push('timestamp must match adapterResult.timestamp');
  }
  if (context.adapterResult.context.context.scanId !== context.scanId.trim()) {
    errors.push('scanId must match adapterResult.context.context.scanId');
  }
  if (context.adapterResult.context.context.timestamp !== context.timestamp.trim()) {
    errors.push('timestamp must match adapterResult.context.context.timestamp');
  }

  return { valid: errors.length === 0, errors };
}

/** Validates harness output — adapter/input passthrough and halted consistency. */
export function validatePositionAdviserHarnessResult(
  result: PositionAdviserHarnessResult,
): PositionAdviserHarnessResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(result)) {
    return { valid: false, errors: ['result must be an object'] };
  }

  if (result.adapterResult === undefined) {
    errors.push('adapterResult is required');
  } else {
    const adapterValidation = validatePositionAdviserAdapterResult(result.adapterResult);
    if (!adapterValidation.valid) {
      for (const err of adapterValidation.errors) {
        errors.push(`adapterResult: ${err}`);
      }
    }
  }

  if (!isRecord(result.positionAdviserInput)) {
    errors.push('positionAdviserInput must be an object');
  } else {
    if (result.positionAdviserInput.scanId !== result.scanId) {
      errors.push('positionAdviserInput.scanId must match result.scanId');
    }
    if (result.positionAdviserInput.timestamp !== result.timestamp) {
      errors.push('positionAdviserInput.timestamp must match result.timestamp');
    }
  }

  if (typeof result.halted !== 'boolean') {
    errors.push('halted must be boolean');
  } else if (result.adapterResult !== undefined && result.halted !== result.adapterResult.context.halted) {
    errors.push('halted must match adapterResult.context.halted');
  }

  if (!isRecord(result.context)) {
    errors.push('context must be an object');
  } else if (result.context.scanId !== result.scanId) {
    errors.push('context.scanId must match result.scanId');
  } else if (result.context.timestamp !== result.timestamp) {
    errors.push('context.timestamp must match result.timestamp');
  } else if (result.adapterResult !== undefined && result.context.adapterResult !== result.adapterResult) {
    errors.push('context.adapterResult must match result.adapterResult');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds position adviser harness result — adapter passthrough + input projection.
 *
 * Does not invoke Position Adviser. Throws when context validation fails.
 */
export function buildPositionAdviserHarnessResult(
  context: PositionAdviserHarnessContext,
): PositionAdviserHarnessResult {
  const validation = validatePositionAdviserHarnessContext(context);
  if (!validation.valid) {
    throw new Error(
      `invalid PositionAdviserHarnessContext: ${validation.errors.join('; ')}`,
    );
  }

  const resolvedContext = copyHarnessContext(context);
  const scanId = resolvedContext.scanId.trim();
  const timestamp = resolvedContext.timestamp.trim();
  const adapterResult = resolvedContext.adapterResult;
  const positionAdviserInput = toPositionAdviserInput(adapterResult);
  const halted = resolveHalted(adapterResult);

  return {
    adapterResult,
    positionAdviserInput,
    scanId,
    timestamp,
    halted,
    message: buildHarnessMessage(halted),
    context: {
      adapterResult,
      scanId,
      timestamp,
    },
  };
}

/**
 * End-to-end chain helper — IntegrationHarnessResult → adviser adapter → harness.
 *
 * Orchestration only; does not call Position Adviser.
 */
export function buildPositionAdviserHarnessFromIntegration(
  integrationResult: IntegrationHarnessResult,
): PositionAdviserHarnessResult {
  const adapterResult = buildPositionAdviserAdapterResult({
    harnessResult: integrationResult,
  });
  return buildPositionAdviserHarnessResult({
    adapterResult,
    scanId: integrationResult.context.scanId,
    timestamp: integrationResult.context.timestamp,
  });
}

/** Namespace for integration discoverability. */
export const PositionAdviserIntegrationHarness = {
  buildPositionAdviserHarnessResult,
  buildPositionAdviserHarnessFromIntegration,
  validatePositionAdviserHarnessContext,
  validatePositionAdviserHarnessResult,
} as const;

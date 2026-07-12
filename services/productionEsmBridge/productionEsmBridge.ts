/**
 * Production → ESM Bridge — read-only integration entry (UL-01).
 *
 * **Purpose:** Prove production SignalRow can safely enter frozen ESM via public API.
 * **Does NOT** store, render, execute, or change production behavior.
 *
 * @module productionEsmBridge/productionEsmBridge
 */

import {
  DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
  runEntryStateManagerPipeline,
  validateSignalBoardWiringResult,
} from '../entryStateManager';
import { mapSignalRowToWiringContext } from './signalRowMapper';
import type {
  ProductionEsmBridgeInput,
  ProductionEsmBridgeInputValidationResult,
  ProductionEsmBridgeSnapshot,
  ProductionEsmBridgeSnapshotValidationResult,
} from './productionEsmBridgeTypes';
import { PRODUCTION_ESM_BRIDGE_VERSION } from './productionEsmBridgeTypes';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validates bridge input — structure only; does not run ESM. */
export function validateProductionEsmBridgeInput(
  input: ProductionEsmBridgeInput,
): ProductionEsmBridgeInputValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['input must be an object'] };
  }

  if (!input.signalRow || typeof input.signalRow !== 'object') {
    errors.push('signalRow is required');
  } else if (!isNonEmptyString(input.signalRow.symbol)) {
    errors.push('signalRow.symbol must be a non-empty string');
  }

  if (!isNonEmptyString(input.scanId)) {
    errors.push('scanId must be a non-empty string');
  }

  if (!isNonEmptyString(input.timestamp)) {
    errors.push('timestamp must be a non-empty string');
  }

  if (
    input.entryStateManagerEnabled !== undefined
    && typeof input.entryStateManagerEnabled !== 'boolean'
  ) {
    errors.push('entryStateManagerEnabled must be boolean when provided');
  }

  return { valid: errors.length === 0, errors };
}

/** Validates bridge snapshot — flag rules + harness integrity when enabled. */
export function validateProductionEsmBridgeSnapshot(
  snapshot: ProductionEsmBridgeSnapshot,
  input: ProductionEsmBridgeInput,
): ProductionEsmBridgeSnapshotValidationResult {
  const errors: string[] = [];

  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['snapshot must be an object'] };
  }

  if (snapshot.bridgeVersion !== PRODUCTION_ESM_BRIDGE_VERSION) {
    errors.push('bridgeVersion mismatch');
  }

  if (snapshot.scanId !== input.scanId.trim()) {
    errors.push('snapshot.scanId must match input.scanId');
  }

  if (snapshot.symbol !== input.signalRow.symbol) {
    errors.push('snapshot.symbol must match signalRow.symbol');
  }

  const wiringContext = mapSignalRowToWiringContext(input);
  const wiringValidation = validateSignalBoardWiringResult(
    snapshot.harnessResult,
    wiringContext,
  );
  if (!wiringValidation.valid) {
    for (const err of wiringValidation.errors) {
      errors.push(`harnessResult: ${err}`);
    }
  }

  if (!snapshot.entryStateManagerEnabled && snapshot.harnessResult !== null) {
    errors.push('harnessResult must be null when entryStateManagerEnabled is false');
  }

  if (snapshot.entryStateManagerEnabled && snapshot.harnessResult === null) {
    errors.push('harnessResult is required when entryStateManagerEnabled is true');
  }

  if (snapshot.halted !== (snapshot.harnessResult?.halted ?? false)) {
    errors.push('snapshot.halted must match harnessResult.halted when present');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Runs read-only Production → ESM bridge.
 *
 * Returns snapshot metadata always. `harnessResult` is null when flag is off.
 * Does not store, render, or execute. Throws on invalid input.
 */
export function runProductionEsmBridge(
  input: ProductionEsmBridgeInput,
): ProductionEsmBridgeSnapshot {
  const validation = validateProductionEsmBridgeInput(input);
  if (!validation.valid) {
    throw new Error(
      `invalid ProductionEsmBridgeInput: ${validation.errors.join('; ')}`,
    );
  }

  const mapped = mapSignalRowToWiringContext(input);
  const {
    entryStateManagerEnabled,
    currentState,
    scanId,
    timestamp,
    signalBoardScan,
    ...wiringRest
  } = mapped;

  const harnessResult = runEntryStateManagerPipeline({
    ...wiringRest,
    signalBoardScan,
    currentState,
    scanId,
    timestamp,
    entryStateManagerEnabled,
  });

  const enabled = entryStateManagerEnabled === true;

  return {
    bridgeVersion: PRODUCTION_ESM_BRIDGE_VERSION,
    scanId,
    timestamp,
    symbol: input.signalRow.symbol,
    entryStateManagerEnabled: enabled,
    mappedCurrentState: currentState,
    harnessResult,
    halted: harnessResult?.halted ?? false,
    message: enabled
      ? (harnessResult?.message ?? 'Production ESM bridge complete')
      : 'Production ESM bridge skipped — ENTRY_STATE_MANAGER_ENABLED is off',
  };
}

/** Namespace for bridge discoverability. */
export const ProductionEsmBridge = {
  PRODUCTION_ESM_BRIDGE_VERSION,
  runProductionEsmBridge,
  validateProductionEsmBridgeInput,
  validateProductionEsmBridgeSnapshot,
  DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
} as const;

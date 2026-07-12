/**
 * Signal Board Wiring — FEATURE_FLAG integration (Task 02.7.4).
 *
 * **Purpose:** Wire SignalBoardScan snapshot → Integration Harness when flag allows.
 * **Does NOT** update UI, store, journal, or execute orders.
 *
 * @module entryStateManager/signalBoardWiring
 */

import {
  buildIntegrationHarnessResult,
  validateIntegrationHarnessContext,
  validateIntegrationHarnessResult,
} from './integrationHarness';
import type {
  IntegrationHarnessContext,
  IntegrationHarnessResult,
} from './integrationHarnessTypes';
import { FEATURE_FLAG } from './metadata';
import { isRecord } from './pipelineValidationUtils';
import type {
  SignalBoardScanSnapshot,
  SignalBoardTriggerSnapshot,
} from './signalBoardAdapterTypes';
import type { EntryStateMarketSnapshot } from './evaluationTypes';
import type { EntryState } from './stateMachineTypes';

/** Default FEATURE_FLAG value — production remains off until explicitly enabled. */
export const DEFAULT_ENTRY_STATE_MANAGER_ENABLED = false as const;

/**
 * Wiring input — scan snapshot bundle + explicit feature flag value.
 *
 * `entryStateManagerEnabled` mirrors {@link FEATURE_FLAG} at call site; default false.
 */
export interface SignalBoardWiringContext {
  signalBoardScan: SignalBoardScanSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  triggerSnapshot: SignalBoardTriggerSnapshot;
  currentState: EntryState;
  scanId: string;
  timestamp: string;
  entryStateManagerEnabled: boolean;
}

/** Context validation result. */
export interface SignalBoardWiringContextValidationResult {
  valid: boolean;
  errors: readonly string[];
}

/** Result validation result — FEATURE_FLAG behavior + harness passthrough. */
export interface SignalBoardWiringResultValidationResult {
  valid: boolean;
  errors: readonly string[];
}

function copySignalBoardScan(snapshot: SignalBoardScanSnapshot): SignalBoardScanSnapshot {
  return {
    symbol: snapshot.symbol,
    price: snapshot.price,
    direction: snapshot.direction,
    canEnter: snapshot.canEnter,
    hardBlocked: snapshot.hardBlocked,
    decisionLabel: snapshot.decisionLabel,
    decisionDisplay: snapshot.decisionDisplay,
  };
}

function copyMarketSnapshot(snapshot: EntryStateMarketSnapshot): EntryStateMarketSnapshot {
  return {
    symbol: snapshot.symbol,
    markPrice: snapshot.markPrice,
    timestamp: snapshot.timestamp,
  };
}

function copyTriggerSnapshot(triggerSnapshot: SignalBoardTriggerSnapshot): SignalBoardTriggerSnapshot {
  return {
    hardBlockResult: triggerSnapshot.hardBlockResult,
    recoveryResult: triggerSnapshot.recoveryResult,
    unlockResult: triggerSnapshot.unlockResult,
    confirmationResult: triggerSnapshot.confirmationResult,
    noiseResult: triggerSnapshot.noiseResult,
    aggregateResult: triggerSnapshot.aggregateResult,
    priorityResult: triggerSnapshot.priorityResult,
    conflictResult: triggerSnapshot.conflictResult,
  };
}

function copyWiringContext(context: SignalBoardWiringContext): SignalBoardWiringContext {
  return {
    signalBoardScan: copySignalBoardScan(context.signalBoardScan),
    marketSnapshot: copyMarketSnapshot(context.marketSnapshot),
    triggerSnapshot: copyTriggerSnapshot(context.triggerSnapshot),
    currentState: context.currentState,
    scanId: context.scanId,
    timestamp: context.timestamp,
    entryStateManagerEnabled: context.entryStateManagerEnabled,
  };
}

function toHarnessContext(context: SignalBoardWiringContext): IntegrationHarnessContext {
  return {
    signalBoardScan: copySignalBoardScan(context.signalBoardScan),
    marketSnapshot: copyMarketSnapshot(context.marketSnapshot),
    triggerSnapshot: copyTriggerSnapshot(context.triggerSnapshot),
    currentState: context.currentState,
    scanId: context.scanId.trim(),
    timestamp: context.timestamp.trim(),
  };
}

/** Resolves whether ESM pipeline should run — explicit boolean only. */
export function isEntryStateManagerEnabled(enabled: boolean): boolean {
  return enabled === true;
}

/** Validates wiring input — harness fields + feature flag boolean. */
export function validateSignalBoardWiringContext(
  context: SignalBoardWiringContext,
): SignalBoardWiringContextValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (typeof context.entryStateManagerEnabled !== 'boolean') {
    errors.push('entryStateManagerEnabled must be boolean');
  }

  const harnessValidation = validateIntegrationHarnessContext(toHarnessContext(context));
  if (!harnessValidation.valid) {
    for (const err of harnessValidation.errors) {
      errors.push(err);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates wiring output — FEATURE_FLAG skip/run rules + harness integrity when run.
 */
export function validateSignalBoardWiringResult(
  harnessResult: IntegrationHarnessResult | null,
  context: SignalBoardWiringContext,
): SignalBoardWiringResultValidationResult {
  const errors: string[] = [];

  if (!isRecord(context)) {
    return { valid: false, errors: ['context must be an object'] };
  }

  if (typeof context.entryStateManagerEnabled !== 'boolean') {
    errors.push('context.entryStateManagerEnabled must be boolean');
  }

  if (!context.entryStateManagerEnabled) {
    if (harnessResult !== null) {
      errors.push(`harnessResult must be null when ${FEATURE_FLAG} is off`);
    }
    return { valid: errors.length === 0, errors };
  }

  if (harnessResult === null) {
    errors.push(`harnessResult is required when ${FEATURE_FLAG} is on`);
    return { valid: false, errors };
  }

  const harnessValidation = validateIntegrationHarnessResult(harnessResult);
  if (!harnessValidation.valid) {
    for (const err of harnessValidation.errors) {
      errors.push(`harnessResult: ${err}`);
    }
  }

  if (harnessResult.context.scanId !== context.scanId.trim()) {
    errors.push('harnessResult.context.scanId must match wiring context scanId');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Runs ESM pipeline from SignalBoard snapshot when {@link FEATURE_FLAG} is enabled.
 *
 * Returns `null` when flag is off — result is discarded; no side effects.
 * Throws when context validation fails. Does not catch harness exceptions.
 */
export function runEntryStateManagerPipeline(
  context: SignalBoardWiringContext,
): IntegrationHarnessResult | null {
  const validation = validateSignalBoardWiringContext(context);
  if (!validation.valid) {
    throw new Error(
      `invalid SignalBoardWiringContext: ${validation.errors.join('; ')}`,
    );
  }

  const resolvedContext = copyWiringContext(context);

  if (!isEntryStateManagerEnabled(resolvedContext.entryStateManagerEnabled)) {
    return null;
  }

  return buildIntegrationHarnessResult(toHarnessContext(resolvedContext));
}

/** Namespace for wiring discoverability. */
export const SignalBoardWiring = {
  runEntryStateManagerPipeline,
  validateSignalBoardWiringContext,
  validateSignalBoardWiringResult,
  isEntryStateManagerEnabled,
  DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
  FEATURE_FLAG,
} as const;

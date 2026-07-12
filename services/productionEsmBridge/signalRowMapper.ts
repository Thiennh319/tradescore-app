/**
 * SignalRow → ESM wiring context mapper (UL-01 / UL-01.1).
 *
 * **Purpose:** Transport production {@link SignalRow} into frozen {@link SignalBoardWiringContext}.
 * **Does NOT** infer runtime state, call ESM pipeline, or wire production scan.
 *
 * @module productionEsmBridge/signalRowMapper
 */

import {
  DEFAULT_ENTRY_STATE_MANAGER_ENABLED,
  ORCHESTRATOR_DEFAULT_CURRENT_STATE,
  type SignalBoardWiringContext,
  type StateMachineEntryState,
} from '../entryStateManager';
import type { SignalRow } from '../signalBoardScan';
import type { ProductionEsmBridgeInput } from './productionEsmBridgeTypes';
import { createEmptyTriggerSnapshot } from './triggerSnapshotFactory';

/** Thrown when mapper input is invalid — no silent fallback. */
export class ProductionEsmBridgeMapperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionEsmBridgeMapperError';
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveCurrentState(
  callerState?: StateMachineEntryState,
): StateMachineEntryState {
  return callerState ?? ORCHESTRATOR_DEFAULT_CURRENT_STATE;
}

/**
 * Maps production {@link SignalRow} → frozen {@link SignalBoardWiringContext}.
 *
 * Pure, deterministic, synchronous, read-only transport only.
 */
export function mapSignalRowToWiringContext(
  input: ProductionEsmBridgeInput,
): SignalBoardWiringContext {
  if (!input || typeof input !== 'object') {
    throw new ProductionEsmBridgeMapperError('input must be an object');
  }

  if (!input.signalRow || typeof input.signalRow !== 'object') {
    throw new ProductionEsmBridgeMapperError('signalRow is required');
  }

  if (!isNonEmptyString(input.scanId)) {
    throw new ProductionEsmBridgeMapperError('scanId must be a non-empty string');
  }

  if (!isNonEmptyString(input.timestamp)) {
    throw new ProductionEsmBridgeMapperError('timestamp must be a non-empty string');
  }

  const row = input.signalRow;
  const scanId = input.scanId.trim();
  const timestamp = input.timestamp.trim();
  const entryStateManagerEnabled =
    input.entryStateManagerEnabled ?? DEFAULT_ENTRY_STATE_MANAGER_ENABLED;
  const currentState = resolveCurrentState(input.currentState);
  const snapshot = row.v4 ?? row.v3;

  return {
    signalBoardScan: {
      symbol: row.symbol,
      price: row.price,
      direction: snapshot?.direction ?? row.direction,
      canEnter: snapshot?.canEnter ?? row.canEnter,
      hardBlocked: snapshot?.hardBlocked ?? row.hardBlocked,
      decisionLabel: snapshot?.decisionLabel ?? row.decisionLabel,
      decisionDisplay: snapshot?.decisionDisplay ?? row.decisionDisplay,
    },
    marketSnapshot: {
      symbol: row.symbol,
      markPrice: row.price ?? 0,
      timestamp,
    },
    triggerSnapshot: createEmptyTriggerSnapshot(),
    currentState,
    scanId,
    timestamp,
    entryStateManagerEnabled,
  };
}

/** Namespace for mapper discoverability. */
export const SignalRowMapper = {
  mapSignalRowToWiringContext,
} as const;

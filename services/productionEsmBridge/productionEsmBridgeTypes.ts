/**
 * Production → ESM Bridge — type contracts (UL-01 / UL-01.1).
 *
 * **Purpose:** Read-only integration boundary outside frozen entryStateManager.
 * **Do not use in:** UI rendering, store persistence, or order execution.
 *
 * @module productionEsmBridge/productionEsmBridgeTypes
 */

import type { IntegrationHarnessResult } from '../entryStateManager/integrationHarnessTypes';
import type { StateMachineEntryState } from '../entryStateManager';
import type { SignalRow } from '../signalBoardScan';
import type { ProductionEsmScanContext } from './signalRowScanContext';

/** Bridge module semantic version — UL-01.1 transport cleanup. */
export const PRODUCTION_ESM_BRIDGE_VERSION = 'UL-01.1' as const;

/** Read-only bridge input — production SignalRow + scan metadata. */
export interface ProductionEsmBridgeInput {
  /** Production scan row — read-only; bridge does not mutate. */
  readonly signalRow: SignalRow;
  /** Correlation id for ESM pipeline — caller-supplied, non-empty. */
  readonly scanId: string;
  /** ISO8601 scan timestamp — caller-supplied, non-empty. */
  readonly timestamp: string;
  /**
   * Optional state-machine current state from caller (e.g. future store bridge).
   * When omitted, {@link ORCHESTRATOR_DEFAULT_CURRENT_STATE} is used — no inference.
   */
  readonly currentState?: StateMachineEntryState;
  /**
   * Mirrors ENTRY_STATE_MANAGER_ENABLED — default false (production off).
   */
  readonly entryStateManagerEnabled?: boolean;
}

/**
 * Read-only ESM snapshot produced by the bridge.
 *
 * `harnessResult` is null when feature flag is off — not stored or consumed by UI.
 */
export interface ProductionEsmBridgeSnapshot {
  readonly bridgeVersion: typeof PRODUCTION_ESM_BRIDGE_VERSION;
  readonly scanId: string;
  readonly timestamp: string;
  readonly symbol: string;
  readonly entryStateManagerEnabled: boolean;
  readonly mappedCurrentState: StateMachineEntryState;
  readonly harnessResult: IntegrationHarnessResult | null;
  readonly halted: boolean;
  readonly message: string;
  /** Read-only scorer context copied from SignalRow at bridge time — UL Review explanation only. */
  readonly scanContext: ProductionEsmScanContext;
}

/** Input validation result. */
export interface ProductionEsmBridgeInputValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Snapshot validation result. */
export interface ProductionEsmBridgeSnapshotValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

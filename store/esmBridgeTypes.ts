/**
 * ESM Bridge Store — type contracts (UL-02 / UL-03.1).
 *
 * **Purpose:** Dedicated store namespace for ProductionEsmBridge snapshots.
 * **Do not use in:** Business logic, EntryState inference, or evaluation.
 *
 * @module store/esmBridgeTypes
 */

import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';

/** Store bridge semantic version. */
export const ESM_STORE_BRIDGE_VERSION = 'UL-03.1' as const;

/** Lifecycle status for the ESM bridge namespace. */
export type EsmBridgeStatus = 'idle' | 'stored' | 'skipped';

/**
 * Dedicated ESM bridge namespace on {@link TradeStoreState}.
 *
 * Data only — no evaluation, no recommendations, no EntryState conversion.
 */
export interface EsmBridgeState {
  /** Read-only bridge snapshots keyed by symbol (e.g. BTCUSDT). */
  readonly snapshotBySymbol: Readonly<Record<string, ProductionEsmBridgeSnapshot>>;
  /** Unix ms when each symbol snapshot was written. */
  readonly lastUpdatedBySymbol: Readonly<Record<string, number>>;
  /** True when any stored snapshot has entryStateManagerEnabled. */
  readonly enabled: boolean;
  /** idle = empty; stored = at least one enabled snapshot; skipped = all flag off. */
  readonly status: EsmBridgeStatus;
}

/** Default namespace — no snapshots stored. */
export const DEFAULT_ESM_BRIDGE_STATE: EsmBridgeState = {
  snapshotBySymbol: {},
  lastUpdatedBySymbol: {},
  enabled: false,
  status: 'idle',
};

/** Read-only lookup — UI uses snapshotBySymbol[row.symbol]. */
export function getEsmSnapshotForSymbol(
  state: EsmBridgeState,
  symbol: string,
): ProductionEsmBridgeSnapshot | null {
  return state.snapshotBySymbol[symbol] ?? null;
}

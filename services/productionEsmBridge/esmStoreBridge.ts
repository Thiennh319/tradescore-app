/**
 * ESM Store Bridge — write path from ProductionEsmBridge to useTradeStore (UL-02).
 *
 * **Purpose:** Sole write adapter: snapshot → store.updateEsmSnapshot.
 * **Does NOT** run production bridge, render UI, or execute ESM.
 *
 * @module productionEsmBridge/esmStoreBridge
 */

import {
  mergeEsmSnapshotIntoBridgeState,
  validateStorableEsmSnapshot,
} from '../../store/esmBridgeStoreUtils';
import { areEsmSnapshotsMateriallyEqual } from '../../store/esmSnapshotDelta';
import type { EsmBridgeState } from '../../store/esmBridgeTypes';
import { ESM_STORE_BRIDGE_VERSION } from '../../store/esmBridgeTypes';
import type { ProductionEsmBridgeSnapshot } from './productionEsmBridgeTypes';

/** Minimal store write surface — avoids coupling to full TradeStore. */
export interface EsmSnapshotStoreWriter {
  updateEsmSnapshot: (
    snapshot: ProductionEsmBridgeSnapshot,
    options?: WriteEsmSnapshotOptions,
  ) => void;
}

/** Minimal store read surface for delta writes. */
export interface EsmSnapshotStoreReader {
  esmBridge: EsmBridgeState;
}

/** Optional injectable clock for deterministic tests. */
export interface WriteEsmSnapshotOptions {
  now?: number;
  /** When true, skip write if material fields unchanged (UL-04.1). */
  skipIfUnchanged?: boolean;
}

/**
 * Pure builder for store partial — used by store action and tests.
 */
export function buildEsmBridgeStorePatch(
  prev: EsmBridgeState,
  snapshot: ProductionEsmBridgeSnapshot,
  options: WriteEsmSnapshotOptions = {},
): { esmBridge: EsmBridgeState } {
  const validation = validateStorableEsmSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(
      `invalid ProductionEsmBridgeSnapshot for store: ${validation.errors.join('; ')}`,
    );
  }

  return {
    esmBridge: mergeEsmSnapshotIntoBridgeState(prev, snapshot, options.now),
  };
}

/**
 * Write path: ProductionEsmBridge snapshot → store namespace.
 *
 * When skipIfUnchanged is true, no-op if material fields match existing snapshot.
 */
export function writeEsmSnapshotToStore(
  snapshot: ProductionEsmBridgeSnapshot,
  store: EsmSnapshotStoreWriter,
  options: WriteEsmSnapshotOptions = {},
): boolean {
  const validation = validateStorableEsmSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(
      `invalid ProductionEsmBridgeSnapshot for store: ${validation.errors.join('; ')}`,
    );
  }

  store.updateEsmSnapshot(snapshot, options);
  return true;
}

/**
 * Delta-aware store write — returns false when skipped (unchanged material fields).
 */
export function writeEsmSnapshotToStoreIfChanged(
  snapshot: ProductionEsmBridgeSnapshot,
  store: EsmSnapshotStoreWriter & EsmSnapshotStoreReader,
  options: WriteEsmSnapshotOptions = {},
): boolean {
  const validation = validateStorableEsmSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(
      `invalid ProductionEsmBridgeSnapshot for store: ${validation.errors.join('; ')}`,
    );
  }

  const skipIfUnchanged = options.skipIfUnchanged !== false;
  const previous = store.esmBridge.snapshotBySymbol[snapshot.symbol];
  if (skipIfUnchanged && previous && areEsmSnapshotsMateriallyEqual(previous, snapshot)) {
    return false;
  }

  store.updateEsmSnapshot(snapshot, options);
  return true;
}

/** Namespace for store bridge discoverability. */
export const EsmStoreBridge = {
  ESM_STORE_BRIDGE_VERSION,
  buildEsmBridgeStorePatch,
  writeEsmSnapshotToStore,
  writeEsmSnapshotToStoreIfChanged,
  validateStorableEsmSnapshot,
} as const;

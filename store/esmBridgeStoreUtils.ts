/**
 * ESM Bridge Store — pure helpers (UL-02 / UL-03.1).
 *
 * **Purpose:** Copy snapshots and build store namespace state without business logic.
 *
 * @module store/esmBridgeStoreUtils
 */

import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import type { EsmBridgeState, EsmBridgeStatus } from './esmBridgeTypes';
import { DEFAULT_ESM_BRIDGE_STATE } from './esmBridgeTypes';

/** Thrown when snapshot storage validation fails. */
export class EsmBridgeStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EsmBridgeStoreError';
  }
}

function resolveAggregateStatus(
  snapshotBySymbol: Readonly<Record<string, ProductionEsmBridgeSnapshot>>,
): EsmBridgeStatus {
  const symbols = Object.keys(snapshotBySymbol);
  if (symbols.length === 0) return 'idle';
  if (symbols.some((key) => snapshotBySymbol[key]?.entryStateManagerEnabled === true)) {
    return 'stored';
  }
  return 'skipped';
}

/**
 * Deep-copies a bridge snapshot for immutable store retention.
 *
 * Pure, deterministic, synchronous, read-only on input.
 */
export function copyProductionEsmBridgeSnapshot(
  snapshot: ProductionEsmBridgeSnapshot,
): ProductionEsmBridgeSnapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new EsmBridgeStoreError('snapshot must be an object');
  }
  return structuredClone(snapshot);
}

/**
 * Merges one snapshot into the per-symbol map — data only.
 *
 * @param now — injectable for deterministic tests (default Date.now())
 */
export function mergeEsmSnapshotIntoBridgeState(
  prev: EsmBridgeState,
  snapshot: ProductionEsmBridgeSnapshot,
  now: number = Date.now(),
): EsmBridgeState {
  if (!Number.isFinite(now)) {
    throw new EsmBridgeStoreError('now must be a finite number');
  }

  const symbol = snapshot.symbol;
  const snapshotBySymbol = {
    ...prev.snapshotBySymbol,
    [symbol]: copyProductionEsmBridgeSnapshot(snapshot),
  };
  const lastUpdatedBySymbol = {
    ...prev.lastUpdatedBySymbol,
    [symbol]: now,
  };

  return {
    snapshotBySymbol,
    lastUpdatedBySymbol,
    enabled: Object.values(snapshotBySymbol).some((s) => s.entryStateManagerEnabled === true),
    status: resolveAggregateStatus(snapshotBySymbol),
  };
}

/**
 * Builds {@link EsmBridgeState} from a single snapshot into an empty namespace.
 *
 * @deprecated Prefer {@link mergeEsmSnapshotIntoBridgeState} — kept for tests.
 */
export function buildEsmBridgeStateFromSnapshot(
  snapshot: ProductionEsmBridgeSnapshot,
  now: number = Date.now(),
): EsmBridgeState {
  return mergeEsmSnapshotIntoBridgeState(DEFAULT_ESM_BRIDGE_STATE, snapshot, now);
}

/** Validates snapshot is storable — null harness allowed when flag off. */
export function validateStorableEsmSnapshot(
  snapshot: ProductionEsmBridgeSnapshot,
): { valid: boolean; errors: readonly string[] } {
  const errors: string[] = [];

  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['snapshot must be an object'] };
  }

  if (typeof snapshot.scanId !== 'string' || !snapshot.scanId.trim()) {
    errors.push('snapshot.scanId must be a non-empty string');
  }

  if (typeof snapshot.symbol !== 'string' || !snapshot.symbol.trim()) {
    errors.push('snapshot.symbol must be a non-empty string');
  }

  if (typeof snapshot.entryStateManagerEnabled !== 'boolean') {
    errors.push('snapshot.entryStateManagerEnabled must be boolean');
  }

  if (!snapshot.entryStateManagerEnabled && snapshot.harnessResult !== null) {
    errors.push('harnessResult must be null when entryStateManagerEnabled is false');
  }

  if (snapshot.entryStateManagerEnabled && snapshot.harnessResult === null) {
    errors.push('harnessResult is required when entryStateManagerEnabled is true');
  }

  return { valid: errors.length === 0, errors };
}

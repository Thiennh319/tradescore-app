/**
 * Trigger Snapshot Factory — canonical empty trigger bundle (UL-01.1).
 *
 * **Purpose:** Sole bridge-owned factory for {@link SignalBoardTriggerSnapshot}.
 * **Does NOT** run detection or import detector engines.
 *
 * Future detector integration replaces this factory — not bridge mapper logic.
 *
 * @module productionEsmBridge/triggerSnapshotFactory
 */

import type { SignalBoardTriggerSnapshot } from '../entryStateManager';

/**
 * Canonical empty trigger snapshot for production bridge transport.
 *
 * All optional detector slots undefined — integration supplies real results later.
 */
export const CANONICAL_EMPTY_TRIGGER_SNAPSHOT: Readonly<SignalBoardTriggerSnapshot> = Object.freeze(
  {},
);

/**
 * Returns the canonical empty {@link SignalBoardTriggerSnapshot}.
 *
 * Pure, deterministic, synchronous, read-only. No side effects.
 */
export function createEmptyTriggerSnapshot(): SignalBoardTriggerSnapshot {
  return { ...CANONICAL_EMPTY_TRIGGER_SNAPSHOT };
}

/** Namespace for factory discoverability. */
export const TriggerSnapshotFactory = {
  CANONICAL_EMPTY_TRIGGER_SNAPSHOT,
  createEmptyTriggerSnapshot,
} as const;

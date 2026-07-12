/**
 * Unlock signal adapter — field-copy boundary (Task 02.4.10 / 02.4.11).
 *
 * **Purpose:** Copy existing app unlock hints into {@link UnlockSignalSnapshot}.
 * **Does NOT** transform, normalize, infer, or import scorer modules.
 *
 * @module entryStateManager/unlockSignalAdapter
 */

import type { EntryStateMarketSnapshot, EntryStateSignalSnapshot } from './evaluationTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { UnlockEvidenceKind } from './unlockEvidenceKinds';

/**
 * Passthrough slots for unlock hints from integration layer.
 */
export interface UnlockSignalSnapshot {
  lockZoneExitedHint: string | null;
  priceRecoveredHint: string | null;
  confirmationReturnedHint: string | null;
  riskNormalizedHint: string | null;
  signalStableHint: string | null;
  readyForWatchHint: string | null;
}

/** Maps {@link UnlockEvidenceKind} → snapshot slot key. */
export const UNLOCK_KIND_TO_SIGNAL_SLOT: Readonly<
  Record<UnlockEvidenceKind, keyof UnlockSignalSnapshot>
> = {
  UNLOCK_LOCK_ZONE_EXITED: 'lockZoneExitedHint',
  UNLOCK_PRICE_RECOVERED: 'priceRecoveredHint',
  UNLOCK_CONFIRMATION_RETURNED: 'confirmationReturnedHint',
  UNLOCK_RISK_NORMALIZED: 'riskNormalizedHint',
  UNLOCK_SIGNAL_STABLE: 'signalStableHint',
  UNLOCK_READY_FOR_WATCH: 'readyForWatchHint',
};

export interface UnlockSignalAdapterInput {
  normalizedRuleOutput: NormalizedRuleOutput;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  unlockSignalSnapshot?: UnlockSignalSnapshot;
}

/** Empty snapshot — all hints null. */
export function createEmptyUnlockSignalSnapshot(): UnlockSignalSnapshot {
  return {
    lockZoneExitedHint: null,
    priceRecoveredHint: null,
    confirmationReturnedHint: null,
    riskNormalizedHint: null,
    signalStableHint: null,
    readyForWatchHint: null,
  };
}

/**
 * Copies unlock hints — **no transform, no inference**.
 *
 * When `unlockSignalSnapshot` is supplied, returns a field-for-field copy.
 * Otherwise returns empty snapshot (all null).
 */
export function adaptUnlockSignalsFromContext(
  input: UnlockSignalAdapterInput,
): UnlockSignalSnapshot {
  const src = input.unlockSignalSnapshot;
  if (!src) {
    return createEmptyUnlockSignalSnapshot();
  }
  return {
    lockZoneExitedHint: src.lockZoneExitedHint,
    priceRecoveredHint: src.priceRecoveredHint,
    confirmationReturnedHint: src.confirmationReturnedHint,
    riskNormalizedHint: src.riskNormalizedHint,
    signalStableHint: src.signalStableHint,
    readyForWatchHint: src.readyForWatchHint,
  };
}

/** Alias for runtime flow docs — same as {@link adaptUnlockSignalsFromContext}. */
export const adaptUnlockSignals = adaptUnlockSignalsFromContext;

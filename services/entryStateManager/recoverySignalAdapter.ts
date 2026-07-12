/**
 * Recovery signal adapter — field-copy boundary (Task 02.4.8 / 02.4.9).
 *
 * **Purpose:** Copy existing app recovery hints into {@link RecoverySignalSnapshot}.
 * **Does NOT** transform, normalize, infer, or import scorer modules.
 *
 * @module entryStateManager/recoverySignalAdapter
 */

import type { EntryStateMarketSnapshot, EntryStateSignalSnapshot } from './evaluationTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { RecoveryEvidenceKind } from './recoveryEvidenceKinds';

/**
 * Passthrough slots for recovery hints from integration layer.
 */
export interface RecoverySignalSnapshot {
  blockClearedHint: string | null;
  rulesNormalizedHint: string | null;
  tradePlanRecoveredHint: string | null;
  marketStableHint: string | null;
  signalReturnedHint: string | null;
  readyForWatchHint: string | null;
}

/** Maps {@link RecoveryEvidenceKind} → snapshot slot key. */
export const RECOVERY_KIND_TO_SIGNAL_SLOT: Readonly<
  Record<RecoveryEvidenceKind, keyof RecoverySignalSnapshot>
> = {
  RECOVERY_BLOCK_CLEARED: 'blockClearedHint',
  RECOVERY_RULES_NORMALIZED: 'rulesNormalizedHint',
  RECOVERY_TRADEPLAN_VALID: 'tradePlanRecoveredHint',
  RECOVERY_MARKET_STABLE: 'marketStableHint',
  RECOVERY_SIGNAL_RETURNED: 'signalReturnedHint',
  RECOVERY_READY_FOR_WATCH: 'readyForWatchHint',
};

export interface RecoverySignalAdapterInput {
  normalizedRuleOutput: NormalizedRuleOutput;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  recoverySignalSnapshot?: RecoverySignalSnapshot;
}

/** Empty snapshot — all hints null. */
export function createEmptyRecoverySignalSnapshot(): RecoverySignalSnapshot {
  return {
    blockClearedHint: null,
    rulesNormalizedHint: null,
    tradePlanRecoveredHint: null,
    marketStableHint: null,
    signalReturnedHint: null,
    readyForWatchHint: null,
  };
}

/**
 * Copies recovery hints — **no transform, no inference**.
 *
 * When `recoverySignalSnapshot` is supplied, returns a field-for-field copy.
 * Otherwise returns empty snapshot (all null).
 */
export function adaptRecoverySignalsFromContext(
  input: RecoverySignalAdapterInput,
): RecoverySignalSnapshot {
  const src = input.recoverySignalSnapshot;
  if (!src) {
    return createEmptyRecoverySignalSnapshot();
  }
  return {
    blockClearedHint: src.blockClearedHint,
    rulesNormalizedHint: src.rulesNormalizedHint,
    tradePlanRecoveredHint: src.tradePlanRecoveredHint,
    marketStableHint: src.marketStableHint,
    signalReturnedHint: src.signalReturnedHint,
    readyForWatchHint: src.readyForWatchHint,
  };
}

/** Alias for runtime flow docs — same as {@link adaptRecoverySignalsFromContext}. */
export const adaptRecoverySignals = adaptRecoverySignalsFromContext;

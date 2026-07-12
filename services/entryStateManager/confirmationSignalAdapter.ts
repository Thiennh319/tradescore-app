/**
 * Confirmation signal adapter — field-copy boundary (Task 02.4.6 / 02.4.7).
 *
 * **Purpose:** Copy existing app confirmation hints into {@link ConfirmationSignalSnapshot}.
 * **Does NOT** transform, normalize, infer, or import scorer modules.
 *
 * @module entryStateManager/confirmationSignalAdapter
 */

import type { EntryStateMarketSnapshot, EntryStateSignalSnapshot } from './evaluationTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { ConfirmationEvidenceKind } from './confirmationEvidenceKinds';

/**
 * Passthrough slots for confirmation hints from integration layer.
 */
export interface ConfirmationSignalSnapshot {
  emaConfirmedHint: string | null;
  trendConfirmedHint: string | null;
  scoreConfirmedHint: string | null;
  tradePlanConfirmedHint: string | null;
  volumeConfirmedHint: string | null;
  directionConfirmedHint: string | null;
}

/** Maps {@link ConfirmationEvidenceKind} → snapshot slot key. */
export const CONFIRMATION_KIND_TO_SIGNAL_SLOT: Readonly<
  Record<ConfirmationEvidenceKind, keyof ConfirmationSignalSnapshot>
> = {
  EMA_CONFIRMED: 'emaConfirmedHint',
  TREND_CONFIRMED: 'trendConfirmedHint',
  SCORE_CONFIRMED: 'scoreConfirmedHint',
  TRADEPLAN_CONFIRMED: 'tradePlanConfirmedHint',
  VOLUME_CONFIRMED: 'volumeConfirmedHint',
  DIRECTION_CONFIRMED: 'directionConfirmedHint',
};

export interface ConfirmationSignalAdapterInput {
  normalizedRuleOutput: NormalizedRuleOutput;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  confirmationSignalSnapshot?: ConfirmationSignalSnapshot;
}

/** Empty snapshot — all hints null. */
export function createEmptyConfirmationSignalSnapshot(): ConfirmationSignalSnapshot {
  return {
    emaConfirmedHint: null,
    trendConfirmedHint: null,
    scoreConfirmedHint: null,
    tradePlanConfirmedHint: null,
    volumeConfirmedHint: null,
    directionConfirmedHint: null,
  };
}

/**
 * Copies confirmation hints — **no transform, no inference**.
 *
 * When `confirmationSignalSnapshot` is supplied, returns a field-for-field copy.
 * Otherwise returns empty snapshot (all null).
 */
export function adaptConfirmationSignalsFromContext(
  input: ConfirmationSignalAdapterInput,
): ConfirmationSignalSnapshot {
  const src = input.confirmationSignalSnapshot;
  if (!src) {
    return createEmptyConfirmationSignalSnapshot();
  }
  return {
    emaConfirmedHint: src.emaConfirmedHint,
    trendConfirmedHint: src.trendConfirmedHint,
    scoreConfirmedHint: src.scoreConfirmedHint,
    tradePlanConfirmedHint: src.tradePlanConfirmedHint,
    volumeConfirmedHint: src.volumeConfirmedHint,
    directionConfirmedHint: src.directionConfirmedHint,
  };
}

/** Alias for runtime flow docs — same as {@link adaptConfirmationSignalsFromContext}. */
export const adaptConfirmationSignals = adaptConfirmationSignalsFromContext;

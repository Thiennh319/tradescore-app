/**
 * Noise signal adapter — field-copy boundary (Task 02.4.4 / 02.4.5).
 *
 * **Purpose:** Copy existing app noise hints into {@link NoiseSignalSnapshot}.
 * **Does NOT** transform, normalize, infer, or import scorer modules.
 *
 * @module entryStateManager/noiseSignalAdapter
 */

import type { EntryStateMarketSnapshot, EntryStateSignalSnapshot } from './evaluationTypes';
import type { NormalizedRuleOutput } from './normalizedRuleOutput';
import type { NoiseEvidenceKind } from './noiseEvidenceKinds';

/**
 * Passthrough slots for noise hints from integration layer.
 *
 * Each field holds a string from existing app modules, or `null`.
 */
export interface NoiseSignalSnapshot {
  macdNoiseHint: string | null;
  rsiNoiseHint: string | null;
  emaFlipHint: string | null;
  cvdFlipHint: string | null;
  volumeSpikeHint: string | null;
  scoreFluctuationHint: string | null;
  shortTermReversalHint: string | null;
}

/** Maps {@link NoiseEvidenceKind} → snapshot slot key. */
export const NOISE_KIND_TO_SIGNAL_SLOT: Readonly<
  Record<NoiseEvidenceKind, keyof NoiseSignalSnapshot>
> = {
  MACD_NOISE: 'macdNoiseHint',
  RSI_NOISE: 'rsiNoiseHint',
  EMA_NOISE: 'emaFlipHint',
  CVD_NOISE: 'cvdFlipHint',
  VOLUME_SPIKE: 'volumeSpikeHint',
  SCORE_FLUCTUATION: 'scoreFluctuationHint',
  SHORT_TERM_REVERSAL: 'shortTermReversalHint',
};

export interface NoiseSignalAdapterInput {
  normalizedRuleOutput: NormalizedRuleOutput;
  signalSnapshot: EntryStateSignalSnapshot;
  marketSnapshot: EntryStateMarketSnapshot;
  /** Pre-built snapshot from integration — field copy only. */
  noiseSignalSnapshot?: NoiseSignalSnapshot;
}

/** Empty snapshot — all hints null. */
export function createEmptyNoiseSignalSnapshot(): NoiseSignalSnapshot {
  return {
    macdNoiseHint: null,
    rsiNoiseHint: null,
    emaFlipHint: null,
    cvdFlipHint: null,
    volumeSpikeHint: null,
    scoreFluctuationHint: null,
    shortTermReversalHint: null,
  };
}

/**
 * Copies noise hints — **no transform, no inference**.
 *
 * When `noiseSignalSnapshot` is supplied, returns a field-for-field copy.
 * Otherwise returns empty snapshot (all null).
 */
export function adaptNoiseSignalsFromContext(
  input: NoiseSignalAdapterInput,
): NoiseSignalSnapshot {
  const src = input.noiseSignalSnapshot;
  if (!src) {
    return createEmptyNoiseSignalSnapshot();
  }
  return {
    macdNoiseHint: src.macdNoiseHint,
    rsiNoiseHint: src.rsiNoiseHint,
    emaFlipHint: src.emaFlipHint,
    cvdFlipHint: src.cvdFlipHint,
    volumeSpikeHint: src.volumeSpikeHint,
    scoreFluctuationHint: src.scoreFluctuationHint,
    shortTermReversalHint: src.shortTermReversalHint,
  };
}

/** Alias for runtime flow docs — same as {@link adaptNoiseSignalsFromContext}. */
export const adaptNoiseSignals = adaptNoiseSignalsFromContext;

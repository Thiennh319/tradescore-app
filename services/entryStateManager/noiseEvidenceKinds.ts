/**
 * Noise evidence kind taxonomy — declaration only (Task 02.4.4).
 *
 * Maps to future passthrough from existing V4 noise / hysteresis signals.
 * **No detection logic** — kinds only.
 *
 * @module entryStateManager/noiseEvidenceKinds
 */

/**
 * Noise evidence kinds for audit export.
 *
 * **Do not add** without RuleBook approval.
 */
export type NoiseEvidenceKind =
  | 'MACD_NOISE'
  | 'RSI_NOISE'
  | 'EMA_NOISE'
  | 'CVD_NOISE'
  | 'VOLUME_SPIKE'
  | 'SCORE_FLUCTUATION'
  | 'SHORT_TERM_REVERSAL';

/** All declared noise evidence kinds — for validation / export. */
export const NOISE_EVIDENCE_KINDS: readonly NoiseEvidenceKind[] = [
  'MACD_NOISE',
  'RSI_NOISE',
  'EMA_NOISE',
  'CVD_NOISE',
  'VOLUME_SPIKE',
  'SCORE_FLUCTUATION',
  'SHORT_TERM_REVERSAL',
] as const;

/**
 * Human-readable descriptions per kind — audit documentation only.
 */
export const NOISE_EVIDENCE_KIND_DESCRIPTIONS: Readonly<Record<NoiseEvidenceKind, string>> = {
  MACD_NOISE: 'MACD histogram short-term oscillation — RuleBook §4.4 / §3',
  RSI_NOISE: 'RSI sweet-zone deviation — single scan — RuleBook §4.4',
  EMA_NOISE: 'EMA flip / short-term cross noise',
  CVD_NOISE: 'CVD flip or minor delta reversal',
  VOLUME_SPIKE: 'Minor volume spike — not whale exit',
  SCORE_FLUCTUATION: 'Live layer score drift < 1đ — RuleBook §4.4',
  SHORT_TERM_REVERSAL: 'Short-term momentum reversal — not hard block',
};

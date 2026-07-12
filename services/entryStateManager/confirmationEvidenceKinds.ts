/**
 * Confirmation evidence kind taxonomy — declaration only (Task 02.4.6).
 *
 * Maps to future passthrough from existing app confirmation signals.
 * **No detection logic** — kinds only.
 *
 * @module entryStateManager/confirmationEvidenceKinds
 */

/**
 * Confirmation evidence kinds for audit export.
 *
 * **Do not add** without RuleBook approval.
 */
export type ConfirmationEvidenceKind =
  | 'EMA_CONFIRMED'
  | 'TREND_CONFIRMED'
  | 'SCORE_CONFIRMED'
  | 'TRADEPLAN_CONFIRMED'
  | 'VOLUME_CONFIRMED'
  | 'DIRECTION_CONFIRMED';

/** All declared confirmation evidence kinds — for validation / export. */
export const CONFIRMATION_EVIDENCE_KINDS: readonly ConfirmationEvidenceKind[] = [
  'EMA_CONFIRMED',
  'TREND_CONFIRMED',
  'SCORE_CONFIRMED',
  'TRADEPLAN_CONFIRMED',
  'VOLUME_CONFIRMED',
  'DIRECTION_CONFIRMED',
] as const;

/**
 * Human-readable descriptions per kind — audit documentation only.
 */
export const CONFIRMATION_EVIDENCE_KIND_DESCRIPTIONS: Readonly<
  Record<ConfirmationEvidenceKind, string>
> = {
  EMA_CONFIRMED: 'EMA alignment confirmed — passthrough from existing layer output',
  TREND_CONFIRMED: 'Trend structure confirmed — passthrough from existing rules',
  SCORE_CONFIRMED: 'Entry score threshold confirmed — RuleBook §1.1',
  TRADEPLAN_CONFIRMED: 'Trade plan valid and ready — RuleBook §1.4',
  VOLUME_CONFIRMED: 'Volume confirmation — passthrough from existing signals',
  DIRECTION_CONFIRMED: 'Direction clarity confirmed — RuleBook §3 / ambiguity exit',
};

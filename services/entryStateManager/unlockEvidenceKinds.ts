/**
 * Unlock evidence kind taxonomy — declaration only (Task 02.4.10).
 *
 * Maps to future passthrough from existing app unlock signals.
 * **No detection logic** — kinds only.
 *
 * @module entryStateManager/unlockEvidenceKinds
 */

/**
 * Unlock evidence kinds for audit export.
 *
 * **Do not add** without RuleBook approval.
 */
export type UnlockEvidenceKind =
  | 'UNLOCK_LOCK_ZONE_EXITED'
  | 'UNLOCK_PRICE_RECOVERED'
  | 'UNLOCK_CONFIRMATION_RETURNED'
  | 'UNLOCK_RISK_NORMALIZED'
  | 'UNLOCK_SIGNAL_STABLE'
  | 'UNLOCK_READY_FOR_WATCH';

/** All declared unlock evidence kinds — for validation / export. */
export const UNLOCK_EVIDENCE_KINDS: readonly UnlockEvidenceKind[] = [
  'UNLOCK_LOCK_ZONE_EXITED',
  'UNLOCK_PRICE_RECOVERED',
  'UNLOCK_CONFIRMATION_RETURNED',
  'UNLOCK_RISK_NORMALIZED',
  'UNLOCK_SIGNAL_STABLE',
  'UNLOCK_READY_FOR_WATCH',
] as const;

/**
 * Human-readable descriptions per kind — audit documentation only.
 */
export const UNLOCK_EVIDENCE_KIND_DESCRIPTIONS: Readonly<Record<UnlockEvidenceKind, string>> = {
  UNLOCK_LOCK_ZONE_EXITED:
    'Price exited entry lock zone — RuleBook §4.1 / setup lock',
  UNLOCK_PRICE_RECOVERED: 'Price recovered from lock zone — passthrough from existing signals',
  UNLOCK_CONFIRMATION_RETURNED:
    'Confirmation signals returned after lock — passthrough from scan output',
  UNLOCK_RISK_NORMALIZED: 'Risk conditions normalized — passthrough from existing rules',
  UNLOCK_SIGNAL_STABLE: 'Signal stable after lock — passthrough from layer output',
  UNLOCK_READY_FOR_WATCH:
    'Unlock complete — ready for WATCH — Business Workflow',
};

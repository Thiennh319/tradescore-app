/**
 * Recovery evidence kind taxonomy — declaration only (Task 02.4.8).
 *
 * Maps to future passthrough from existing app recovery signals.
 * **No detection logic** — kinds only.
 *
 * @module entryStateManager/recoveryEvidenceKinds
 */

/**
 * Recovery evidence kinds for audit export.
 *
 * **Do not add** without RuleBook approval.
 */
export type RecoveryEvidenceKind =
  | 'RECOVERY_BLOCK_CLEARED'
  | 'RECOVERY_RULES_NORMALIZED'
  | 'RECOVERY_TRADEPLAN_VALID'
  | 'RECOVERY_MARKET_STABLE'
  | 'RECOVERY_SIGNAL_RETURNED'
  | 'RECOVERY_READY_FOR_WATCH';

/** All declared recovery evidence kinds — for validation / export. */
export const RECOVERY_EVIDENCE_KINDS: readonly RecoveryEvidenceKind[] = [
  'RECOVERY_BLOCK_CLEARED',
  'RECOVERY_RULES_NORMALIZED',
  'RECOVERY_TRADEPLAN_VALID',
  'RECOVERY_MARKET_STABLE',
  'RECOVERY_SIGNAL_RETURNED',
  'RECOVERY_READY_FOR_WATCH',
] as const;

/**
 * Human-readable descriptions per kind — audit documentation only.
 */
export const RECOVERY_EVIDENCE_KIND_DESCRIPTIONS: Readonly<Record<RecoveryEvidenceKind, string>> = {
  RECOVERY_BLOCK_CLEARED:
    'Hard block cleared — passthrough from existing hardBlocks[] empty snapshot',
  RECOVERY_RULES_NORMALIZED:
    'Rule output normalized — no active blocks — RuleBook §2.2 recovery',
  RECOVERY_TRADEPLAN_VALID: 'Trade plan recovered valid — RuleBook §1.4',
  RECOVERY_MARKET_STABLE: 'Market conditions stable — passthrough from existing signals',
  RECOVERY_SIGNAL_RETURNED: 'Signal quality returned — passthrough from scan output',
  RECOVERY_READY_FOR_WATCH:
    'Recovery complete — ready for WATCH — Business Workflow 02.2.2.1',
};

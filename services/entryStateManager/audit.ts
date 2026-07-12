/**
 * Entry State Manager — audit export field shapes.
 *
 * **Purpose:** Type-safe ESM section for export packages per RuleBook §7.
 * **Used by:** `exportService.ts`, `exportEntrySltpAuditPackage.ts` (Task 02.5+).
 * **Do not use in:** CSV columns that predate `audit-v2.1` without compatibility layer.
 *
 * @module entryStateManager/audit
 * @see RuleBook V2.0.0 (LOCKED) — §7
 */

import type {
  EntryState,
  EsmDirection,
  EsmScorerVersion,
  HardBlockPriority,
  LockStatus,
} from './enums';
import type {
  EntryLockZoneBounds,
  EntryStateTransitionLabel,
  HysteresisConfig,
} from './types';

/**
 * Mandatory audit fields — RuleBook §7.1.
 *
 * **Used by:** Export SECTION: ENTRY STATE (ESM).
 * **Do not use in:** Runtime trading gates.
 */
export interface EntryStateAuditFields {
  entry_state: EntryState;
  previous_state: EntryState | null;
  transition: EntryStateTransitionLabel | null;
  transition_reason: string | null;
  commit_score: number | null;
  lock_status: LockStatus;
  lock_reason: string | null;
  hard_block_priority: HardBlockPriority | null;
  consecutive_scan_count: number;
  rule_version: string;
  audit_version: string;
  timestamp: string;
}

/**
 * Recommended supplemental audit fields — RuleBook §7.2.
 *
 * **Used by:** Full audit replay package (RuleBook Part C/D).
 * **Do not use in:** Legacy `audit-v1` parsers.
 */
export interface EntryStateAuditSupplement {
  symbol: string;
  direction: EsmDirection;
  scorer_version: EsmScorerVersion;
  entry_score: number | null;
  hard_blocks: readonly string[];
  hysteresis_config: HysteresisConfig;
  lock_zone_bounds: EntryLockZoneBounds | null;
}

/**
 * Full ESM audit section — RuleBook §7.3.
 *
 * **Used by:** `audit-v2.1` export footer and GPT audit prompts.
 * **Do not use in:** Replacing existing `ruleAuditSnapshot` block.
 */
export interface EntryStateAuditSection
  extends EntryStateAuditFields,
    EntryStateAuditSupplement {}

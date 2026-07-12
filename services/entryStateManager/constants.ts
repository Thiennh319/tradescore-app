/**
 * Entry State Manager — default configuration constants.
 *
 * **Purpose:** Schema defaults from RuleBook V2; not applied at runtime until Task 02.3+.
 * **Used by:** `EntryStateManagerConfig` builders, tests, export snapshots.
 * **Do not use in:** Scoring, hard-block evaluation, or UI display logic.
 *
 * @module entryStateManager/constants
 * @see RuleBook V2.0.0 (LOCKED) — §3.2, §4.1, §7.1, §9.5
 */

import { AUDIT_VERSION, FEATURE_FLAG, MODULE_VERSION, RULEBOOK_VERSION } from './metadata';
import { LockZoneMode } from './enums';
import type { HysteresisConfig, LockZoneConfig } from './types';

/**
 * @deprecated Prefer {@link RULEBOOK_VERSION} from `./metadata`. Kept for barrel backward compat.
 * RuleBook version stamped on audit export (§7.1).
 */
export const ESM_RULEBOOK_VERSION = RULEBOOK_VERSION;

/**
 * @deprecated Prefer {@link AUDIT_VERSION} from `./metadata`. Kept for barrel backward compat.
 * Audit export schema target (§7.1).
 */
export const ESM_AUDIT_VERSION = AUDIT_VERSION;

/**
 * @deprecated Prefer {@link MODULE_VERSION} from `./metadata`. Kept for barrel backward compat.
 * Module version — bump when ESM runtime ships.
 */
export const ESM_MODULE_VERSION = MODULE_VERSION;

/**
 * @deprecated Prefer {@link FEATURE_FLAG} from `./metadata`. Kept for barrel backward compat.
 * Feature flag storage key (§9.5).
 */
export const ESM_FEATURE_FLAG_KEY = FEATURE_FLAG;

/**
 * Default hysteresis parameters — RuleBook §3.2.
 * Config data only; counters are not updated until Task 02.3.
 */
export const ESM_DEFAULT_HYSTERESIS_CONFIG: HysteresisConfig = {
  enterReadyScans: 2,
  exitReadyScans: 2,
  enterBlockedScans: 1,
  exitBlockedScans: 2,
  ambiguityEnterScans: 2,
  ambiguityExitScans: 2,
};

/**
 * Default entry lock zone — RuleBook §4.1.
 * Zone bounds are not computed until Task 02.4.
 */
export const ESM_DEFAULT_LOCK_ZONE_CONFIG: LockZoneConfig = {
  mode: LockZoneMode.PERCENT,
  percent: 0.005,
  atrMultiplier: 0.25,
  minDistancePercent: null,
};

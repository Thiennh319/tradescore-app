/**
 * Canonical module metadata for Entry State Manager.
 *
 * **Purpose:** Single source for version stamps, feature flag key, and audit labels.
 * **Used by:** `constants.ts`, export packages (Task 02.5+), integration layers.
 * **Do not use in:** Score Engine, Rule Engine, or UI — read via ESM integration only.
 *
 * @module entryStateManager/metadata
 * @see RuleBook V2.0.0 (LOCKED) — §7.1, §9.5
 */

/** Human-readable module identifier. */
export const MODULE_NAME = 'EntryStateManager' as const;

/** Semantic version of the ESM implementation (scaffold / runtime). Bump per ESM task. */
export const MODULE_VERSION = '2.0.0' as const;

/** Locked RuleBook version this module implements. */
export const RULEBOOK_VERSION = 'RuleBook V2.0.0' as const;

/** Target audit export schema version for ESM sections. */
export const AUDIT_VERSION = 'audit-v2.1' as const;

/** Feature flag key — ESM off by default until integration task wires it. */
export const FEATURE_FLAG = 'ENTRY_STATE_MANAGER_ENABLED' as const;

/** Position Adviser integration feature flag — off by default (Task 02.8.3 / frozen 02.8.4). */
export const POSITION_ADVISER_FEATURE_FLAG = 'POSITION_ADVISER_ENABLED' as const;

/** Default Position Adviser flag value — production remains off until explicitly enabled. */
export const DEFAULT_POSITION_ADVISER_ENABLED = false as const;

/** Position Adviser Integration stack semantic freeze marker (Task 02.8.4). */
export const POSITION_ADVISER_INTEGRATION_FROZEN_VERSION = '1.9.0' as const;

/** Entry State Mapping Bridge semantic freeze marker (Task 02.9.0). */
export const ENTRY_STATE_MAPPING_FROZEN_VERSION = '2.0.0' as const;

/**
 * Bundled metadata object for logging, export footers, and diagnostics.
 * **Do not use** to drive trading decisions.
 */
export const ESM_MODULE_METADATA = {
  moduleName: MODULE_NAME,
  moduleVersion: MODULE_VERSION,
  rulebookVersion: RULEBOOK_VERSION,
  auditVersion: AUDIT_VERSION,
  featureFlag: FEATURE_FLAG,
} as const;

export type EsmModuleMetadata = typeof ESM_MODULE_METADATA;

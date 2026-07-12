/**
 * Hard-block taxonomy ID unions — RuleBook V2 §6.
 *
 * **Purpose:** Stable IDs for audit and ESM priority mapping.
 * **Used by:** Export hard-block classification, future ESM BLOCKED reasons.
 * **Do not use in:** Altering `HARD_BLOCK_RULES_V4` or scorer evaluation.
 *
 * @module entryStateManager/hardBlockIds
 */

/**
 * Critical-tier hard block IDs — RuleBook §6.1.
 *
 * **Used by:** `HardBlockPriority.CRITICAL` mapping.
 * **Do not use in:** Instant cancel without `shouldCancelLockedPlan` integration.
 */
export type HardBlockCriticalId =
  | 'HB-CRIT-01'
  | 'HB-CRIT-02'
  | 'HB-CRIT-03'
  | 'HB-CRIT-04';

/**
 * High-tier hard block IDs — RuleBook §6.2.
 *
 * **Used by:** `HardBlockPriority.HIGH` mapping.
 * **Do not use in:** Group-block evaluation (`groupBlocks[]`).
 */
export type HardBlockHighId =
  | 'HB-HIGH-01'
  | 'HB-HIGH-02'
  | 'HB-HIGH-03'
  | 'HB-HIGH-04'
  | 'HB-HIGH-05'
  | 'HB-HIGH-06';

/**
 * Medium-tier hard block IDs — RuleBook §6.3.
 *
 * **Used by:** `HardBlockPriority.MEDIUM` mapping.
 * **Do not use in:** Low-tier soft warnings.
 */
export type HardBlockMediumId =
  | 'HB-MED-01'
  | 'HB-MED-02'
  | 'HB-MED-03'
  | 'HB-MED-04'
  | 'HB-MED-05';

/**
 * Low-tier warning IDs — RuleBook §6.4.
 *
 * **Used by:** WATCH-only soft classification.
 * **Do not use in:** `hardBlocks[]` array membership tests.
 */
export type HardBlockLowId =
  | 'HB-LOW-01'
  | 'HB-LOW-02'
  | 'HB-LOW-03'
  | 'HB-LOW-04';

/**
 * Union of all documented hard-block taxonomy IDs — RuleBook §6.
 *
 * **Used by:** Typed audit payloads.
 * **Do not use in:** Replacing raw `hardBlocks: string[]` in V1.0.5 export.
 */
export type HardBlockTaxonomyId =
  | HardBlockCriticalId
  | HardBlockHighId
  | HardBlockMediumId
  | HardBlockLowId;

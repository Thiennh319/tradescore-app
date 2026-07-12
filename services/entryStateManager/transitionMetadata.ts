/**
 * Transition metadata enums and priority reference — Task 02.2.2.2.
 *
 * **Purpose:** Audit / Journal / Export labels for transition matrix rows.
 * **Do not use in:** Runtime priority resolution or module invocation.
 *
 * @module entryStateManager/transitionMetadata
 */

/**
 * Transition category — fixed set only (Task 02.2.2.2).
 *
 * **Used by:** Export, AI rule validation, journal event tagging.
 */
export enum TransitionCategory {
  Confirmation = 'Confirmation',
  Recovery = 'Recovery',
  Protection = 'Protection',
  HardBlock = 'HardBlock',
  Unlock = 'Unlock',
  NoiseFilter = 'NoiseFilter',
}

/**
 * Audit export label for transition events.
 *
 * **Used by:** Audit package, Trade Journal V2, GPT rule validation.
 */
export enum TransitionAuditLabel {
  ENTRY_RECOVERY = 'ENTRY_RECOVERY',
  ENTRY_CONFIRM = 'ENTRY_CONFIRM',
  ENTRY_LOCK = 'ENTRY_LOCK',
  ENTRY_BLOCK = 'ENTRY_BLOCK',
  ENTRY_UNLOCK = 'ENTRY_UNLOCK',
  ENTRY_NOISE_FILTER = 'ENTRY_NOISE_FILTER',
  /** Forbidden / invalid edge — workflow guard (not a runtime transition). */
  ENTRY_INVALID = 'ENTRY_INVALID',
}

/**
 * Declared source module — **declaration only**, never imported at runtime.
 */
export type TransitionSourceModule =
  | 'RuleEngine'
  | 'RiskEngine'
  | 'EntryStateManager'
  | 'PositionAdviser'
  | 'WhaleDetector'
  | 'CVDFilter';

/**
 * Reference priority by category — metadata defaults (Task 02.2.2.2).
 * Not used for runtime ordering.
 */
export const TRANSITION_CATEGORY_PRIORITY: Readonly<Record<TransitionCategory, number>> = {
  [TransitionCategory.HardBlock]: 100,
  [TransitionCategory.Protection]: 90,
  [TransitionCategory.Recovery]: 70,
  [TransitionCategory.Unlock]: 70,
  [TransitionCategory.Confirmation]: 60,
  [TransitionCategory.NoiseFilter]: 50,
};

/** All declared source modules — for validation. */
export const TRANSITION_SOURCE_MODULES: readonly TransitionSourceModule[] = [
  'RuleEngine',
  'RiskEngine',
  'EntryStateManager',
  'PositionAdviser',
  'WhaleDetector',
  'CVDFilter',
] as const;

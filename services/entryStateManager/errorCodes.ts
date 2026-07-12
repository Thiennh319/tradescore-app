/**
 * Entry State Manager error codes — taxonomy only.
 *
 * **Purpose:** Stable identifiers for future ESM runtime errors and audit trails.
 * **Used by:** State machine (Task 02.2+), integration guards, export error sections.
 * **Do not use in:** Throwing/handling exceptions at scaffold stage — definitions only.
 *
 * @module entryStateManager/errorCodes
 */

/**
 * ESM error code registry.
 *
 * Each member maps to a RuleBook violation or invalid ESM operation.
 * Human-readable labels are in JSDoc; runtime messages are a later task.
 */
export enum EsmErrorCode {
  /** ESM_001 — Transition not allowed by RuleBook §2 transition matrix. */
  ESM_001 = 'ESM_001',
  /** ESM_002 — State value outside {@link EntryState} or corrupt persisted record. */
  ESM_002 = 'ESM_002',
  /** ESM_003 — Lock status / lock zone inconsistent with RuleBook §4. */
  ESM_003 = 'ESM_003',
  /** ESM_004 — Commit score out of range 0–100 or used as entry gate (forbidden §5). */
  ESM_004 = 'ESM_004',
  /** ESM_005 — Operation violates locked RuleBook V2 rule (generic). */
  ESM_005 = 'ESM_005',
  /** ESM_006 — ESM invoked while {@link FEATURE_FLAG} is disabled. */
  ESM_006 = 'ESM_006',
}

/** Human-readable label per error code — for docs and future error formatting. */
export const ESM_ERROR_CODE_LABELS: Readonly<Record<EsmErrorCode, string>> = {
  [EsmErrorCode.ESM_001]: 'Invalid Transition',
  [EsmErrorCode.ESM_002]: 'Unknown State',
  [EsmErrorCode.ESM_003]: 'Invalid Lock',
  [EsmErrorCode.ESM_004]: 'Invalid Commit Score',
  [EsmErrorCode.ESM_005]: 'Rule Violation',
  [EsmErrorCode.ESM_006]: 'Feature Disabled',
};

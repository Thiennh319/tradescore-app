/**
 * Normalized Rule Output — adapter boundary (Task 02.4.3).
 *
 * **Purpose:** Decouple HardBlock Detection from scorerV3/V4/CVDX.
 * Detection reads **only** {@link NormalizedRuleOutput} — field copy from Rule Engine.
 *
 * **MUST NOT:** Re-evaluate rules or import scorer modules.
 *
 * @module entryStateManager/normalizedRuleOutput
 */

/**
 * Canonical read-only shape for Rule Engine output at ESM boundary.
 *
 * Populated by integration from `EntryStateManagerInput` / scan row — not computed here.
 */
export interface NormalizedRuleOutput {
  hardBlocks: readonly string[];
  groupBlocks: readonly string[];
  blockReasons: readonly string[];
  adxGateBlocked: boolean;
  tradePlanValid: boolean;
  decision: string;
}

/** Input slice shared by {@link EntryStateManagerInput} and legacy mapper. */
export type NormalizedRuleOutputInput = NormalizedRuleOutput;

/**
 * Placeholder mapper — **field copy only** (no scorer import).
 *
 * Integration: `scorerV4` / `signalBoardScan` → `EntryStateManagerInput` → this mapper.
 */
export function normalizeRuleOutput(input: NormalizedRuleOutputInput): NormalizedRuleOutput {
  return {
    hardBlocks: input.hardBlocks,
    groupBlocks: input.groupBlocks,
    blockReasons: input.blockReasons,
    adxGateBlocked: input.adxGateBlocked,
    tradePlanValid: input.tradePlanValid,
    decision: input.decision,
  };
}

/** @deprecated Use {@link normalizeRuleOutput} — alias for Task 02.4.2 compat. */
export function normalizeRuleOutputFromManagerInput(
  input: NormalizedRuleOutputInput,
): NormalizedRuleOutput {
  return normalizeRuleOutput(input);
}

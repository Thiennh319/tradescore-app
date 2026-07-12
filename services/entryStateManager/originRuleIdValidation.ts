/**
 * Shared originRuleId validation — Detection Layer (Task 02.4.R).
 *
 * **Purpose:** Unified taxonomy pattern for HB/NB/CF/RC/UL families.
 * Per-detector validators delegate here — API unchanged.
 *
 * @module entryStateManager/originRuleIdValidation
 */

/** RuleBook taxonomy families — extensible when RuleBook adds IDs. */
export const ORIGIN_RULE_ID_PATTERNS = {
  HB: /^HB-(CRIT|HIGH|MED|LOW)-\d{2}$/,
  NB: /^NB-(LOW|MED|HIGH)-\d{2}$/,
  CF: /^CF-(LOW|MED|HIGH)-\d{2}$/,
  RC: /^RC-(LOW|MED|HIGH)-\d{2}$/,
  UL: /^UL-(LOW|MED|HIGH)-\d{2}$/,
} as const;

export type OriginRuleIdFamily = keyof typeof ORIGIN_RULE_ID_PATTERNS;

/**
 * Validate originRuleId for a taxonomy family, or `null`.
 */
export function isValidOriginRuleId(
  id: string | null | undefined,
  family: OriginRuleIdFamily,
): boolean {
  if (id == null) return true;
  return ORIGIN_RULE_ID_PATTERNS[family].test(id);
}

/** Validate against any known ESM origin-rule family pattern. */
export function isValidAnyEsmOriginRuleId(id: string | null | undefined): boolean {
  if (id == null) return true;
  return (Object.values(ORIGIN_RULE_ID_PATTERNS) as RegExp[]).some((pattern) =>
    pattern.test(id),
  );
}

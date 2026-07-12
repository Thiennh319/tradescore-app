/**
 * Noise originRuleId validation — RuleBook taxonomy (Task 02.4.5).
 *
 * RuleBook V2 has no `NB-*` IDs yet — all passthrough evidence uses `null`.
 *
 * @module entryStateManager/noiseOriginRuleId
 */

import { isValidOriginRuleId } from './originRuleIdValidation';

/** Validate originRuleId is null or future RuleBook `NB-*` format. */
export function isValidNoiseOriginRuleId(id: string | null | undefined): boolean {
  return isValidOriginRuleId(id, 'NB');
}

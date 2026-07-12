/**
 * Unlock originRuleId validation — RuleBook taxonomy (Task 02.4.11).
 *
 * RuleBook V2 has no `UL-*` IDs yet — all passthrough evidence uses `null`.
 *
 * @module entryStateManager/unlockOriginRuleId
 */

import { isValidOriginRuleId } from './originRuleIdValidation';

/** Validate originRuleId is null or future RuleBook `UL-*` format. */
export function isValidUnlockOriginRuleId(id: string | null | undefined): boolean {
  return isValidOriginRuleId(id, 'UL');
}

/**
 * Recovery originRuleId validation — RuleBook taxonomy (Task 02.4.9).
 *
 * RuleBook V2 has no `RC-*` IDs yet — all passthrough evidence uses `null`.
 *
 * @module entryStateManager/recoveryOriginRuleId
 */

import { isValidOriginRuleId } from './originRuleIdValidation';

/** Validate originRuleId is null or future RuleBook `RC-*` format. */
export function isValidRecoveryOriginRuleId(id: string | null | undefined): boolean {
  return isValidOriginRuleId(id, 'RC');
}

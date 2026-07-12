/**
 * Confirmation originRuleId validation — RuleBook taxonomy (Task 02.4.7).
 *
 * RuleBook V2 has no `CF-*` IDs yet — all passthrough evidence uses `null`.
 *
 * @module entryStateManager/confirmationOriginRuleId
 */

import { isValidOriginRuleId } from './originRuleIdValidation';

/** Validate originRuleId is null or future RuleBook `CF-*` format. */
export function isValidConfirmationOriginRuleId(id: string | null | undefined): boolean {
  return isValidOriginRuleId(id, 'CF');
}

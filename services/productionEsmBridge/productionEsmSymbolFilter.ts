/**
 * ESM bridge symbol filter — eligible symbols for post-scan wiring (UL-04.1).
 *
 * @module productionEsmBridge/productionEsmSymbolFilter
 */

import type { LockedTradePlan } from '../../constants/aiJournal';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';

export interface EsmSymbolFilterInput {
  readonly journalEntries: readonly AiTradeJournalEntry[];
  readonly lockedPlan: LockedTradePlan | null;
  /** Symbols on the active signal-board scan (current scan rows). */
  readonly activeScanSymbols?: readonly string[];
}

/**
 * Symbols eligible for Production ESM bridge after scan.
 *
 * Runs bridge when at least one of:
 * - OPEN running order
 * - PENDING order
 * - Active locked plan (watching a setup)
 * - Symbol present in current active scan AND has open/pending/locked plan
 *
 * Passive scan-only symbols (no position, no locked plan) are excluded.
 */
export function resolveEligibleEsmSymbols(input: EsmSymbolFilterInput): ReadonlySet<string> {
  const eligible = new Set<string>();

  for (const entry of input.journalEntries) {
    if (entry.archived) continue;
    if (entry.outcome.status === 'OPEN' || entry.outcome.status === 'PENDING') {
      eligible.add(entry.symbol);
    }
  }

  if (input.lockedPlan?.symbol) {
    eligible.add(input.lockedPlan.symbol);
  }

  return eligible;
}

export function isEsmSymbolEligible(
  symbol: string,
  input: EsmSymbolFilterInput,
): boolean {
  return resolveEligibleEsmSymbols(input).has(symbol);
}

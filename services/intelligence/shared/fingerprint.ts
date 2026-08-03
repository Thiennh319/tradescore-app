/**
 * Task 14.4.1 — Journal / Statistics cache fingerprints.
 * Includes projectionVersion + outcome status + pnl so Journal edits bust cache.
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { parseProjectedTags } from '../parseProjectedTags';

/** Per-trade fingerprint for Journal Intelligence cache. */
export function tradeOutcomeFingerprint(entry: AiTradeJournalEntry): string {
  const meta = parseProjectedTags(entry);
  const pnl = entry.outcome.pnlUSDT;
  return [
    entry.id,
    meta.projectionVersion ?? '',
    entry.outcome.status,
    pnl != null && Number.isFinite(pnl) ? String(pnl) : '',
    entry.outcome.exitReason ?? '',
    entry.archived ? '1' : '0',
  ].join(':');
}

/** Eligible-journal fingerprint for Statistics / downstream caches. */
export function buildJournalStatisticsFingerprint(
  eligible: readonly AiTradeJournalEntry[],
): string {
  const parts = eligible.map((e) => tradeOutcomeFingerprint(e));
  parts.sort();
  return parts.join('|') || 'empty';
}

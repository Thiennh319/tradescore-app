import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';

/** Ghép lệnh legacy (tradeJournal) với entry OPEN tương ứng trong aiTradeJournal. */
export function resolveAiOpenForLegacy(
  legacy: StoredTradeJournalEntry,
  aiTradeJournal: AiTradeJournalEntry[],
  currentOpenDataTrade: AiTradeJournalEntry | null,
): AiTradeJournalEntry | null {
  const openMatches = aiTradeJournal.filter(
    (e) => e.symbol === legacy.symbol && e.outcome.status === 'OPEN' && !e.archived,
  );
  const sortRecent = (list: AiTradeJournalEntry[]) =>
    [...list].sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
  const byDirection = openMatches.filter((e) => e.scoring.direction === legacy.direction);
  if (byDirection.length > 0) return sortRecent(byDirection);
  if (openMatches.length > 0) return sortRecent(openMatches);
  if (
    currentOpenDataTrade?.symbol === legacy.symbol &&
    currentOpenDataTrade.outcome.status === 'OPEN' &&
    !currentOpenDataTrade.archived
  ) {
    return currentOpenDataTrade;
  }
  return null;
}

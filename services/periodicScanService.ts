import type { AppTradeSymbol } from '../constants/scoring';
import { fetchTickerPrice } from './binanceApi';
import { isPendingEntryFilled } from '../utils/pendingOrderFill';
import {
  loadPersistedJournal,
  updatePersistedJournalEntry,
} from './tradeStorePersist';

/**
 * Khớp lệnh chờ từ AsyncStorage — dùng khi app chạy ngầm / background task.
 */
export async function fillPendingOrdersPersisted(): Promise<boolean> {
  const journal = await loadPersistedJournal();
  const pending = journal.filter((e) => e.status === 'PENDING');
  if (pending.length === 0) return false;

  const symbols = [...new Set(pending.map((e) => e.symbol))] as AppTradeSymbol[];
  const prices = new Map<string, number>();

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const ticker = await fetchTickerPrice(symbol);
        prices.set(symbol, ticker.price);
      } catch {
        // bỏ qua
      }
    }),
  );

  let filledAny = false;

  for (const entry of pending) {
    const mark = prices.get(entry.symbol);
    if (mark == null || !Number.isFinite(mark)) continue;
    if (!isPendingEntryFilled(entry.direction, mark, entry.entryPrice)) continue;

    await updatePersistedJournalEntry(entry.id, {
      status: 'OPEN',
      entryTime: Date.now(),
    });
    filledAny = true;
  }

  return filledAny;
}

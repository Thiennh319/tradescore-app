import type { AppTradeSymbol } from '../constants/scoring';
import { resolveActualEntryPrice } from '../services/orderFillResolution';
import { useTradeStore } from '../store/useTradeStore';
import { isPendingEntryFilled } from '../utils/pendingOrderFill';

/**
 * Kiểm tra lệnh chờ và chuyển OPEN khi giá chạm entry limit (giống Binance).
 * LONG: mark <= entry · SHORT: mark >= entry
 *
 * Entry thực tế dùng resolveActualEntryPrice (limit + stop/trigger).
 */
export async function fillPendingOrdersAtPrices(
  prices: Map<string, number>,
): Promise<boolean> {
  const {
    tradeJournal,
    aiTradeJournal,
    updateJournalEntry,
    confirmOrderFilled,
  } = useTradeStore.getState();
  const pending = tradeJournal.filter((e) => e.status === 'PENDING');
  if (pending.length === 0) return false;

  let filledAny = false;

  for (const entry of pending) {
    const mark = prices.get(entry.symbol);
    if (mark == null || !Number.isFinite(mark)) continue;
    if (!isPendingEntryFilled(entry.direction, mark, entry.entryPrice)) continue;

    const aiPending = aiTradeJournal.find(
      (e) => e.symbol === entry.symbol && e.outcome.status === 'PENDING',
    );

    if (aiPending) {
      await confirmOrderFilled(
        aiPending.id,
        mark,
        entry.stopLoss ?? aiPending.plan.slActual,
        entry.size ?? aiPending.plan.sizeActual,
      );
    } else {
      const resolved = resolveActualEntryPrice(entry.direction, entry.entryPrice, mark);
      await updateJournalEntry(entry.id, {
        status: 'OPEN',
        entryTime: Date.now(),
        entryPrice: resolved?.actualEntryPrice ?? mark,
      });
    }
    filledAny = true;
  }

  return filledAny;
}

export async function fillPendingOrdersFromSymbols(
  symbols: AppTradeSymbol[],
  fetchPrice: (symbol: AppTradeSymbol) => Promise<number | null>,
): Promise<boolean> {
  const prices = new Map<string, number>();
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const price = await fetchPrice(symbol);
        if (price != null && Number.isFinite(price)) {
          prices.set(symbol, price);
        }
      } catch {
        // bỏ qua
      }
    }),
  );
  if (prices.size === 0) return false;
  return fillPendingOrdersAtPrices(prices);
}

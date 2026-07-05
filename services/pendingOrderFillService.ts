import type { AppTradeSymbol } from '../constants/scoring';
import { resolveActualEntryPrice } from '../services/orderFillResolution';
import { useTradeStore } from '../store/useTradeStore';
import { isPendingEntryFilled } from '../utils/pendingOrderFill';

function resolvePendingLimitPrice(entry: {
  outcome: { limitOrderPrice?: number };
  market: { entryPrice: number };
}): number {
  return entry.outcome.limitOrderPrice ?? entry.market.entryPrice;
}

/**
 * Kiểm tra lệnh chờ và chuyển OPEN khi giá chạm entry limit (giống Binance).
 * LONG: mark <= entry · SHORT: mark >= entry
 *
 * Nguồn chính: aiTradeJournal (limitOrderPrice). Legacy tradeJournal đồng bộ theo symbol.
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

  const pendingAi = aiTradeJournal.filter((e) => e.outcome.status === 'PENDING');
  if (pendingAi.length === 0) return false;

  let filledAny = false;

  for (const entry of pendingAi) {
    const mark = prices.get(entry.symbol);
    if (mark == null || !Number.isFinite(mark)) continue;

    const limitPrice = resolvePendingLimitPrice(entry);
    if (!isPendingEntryFilled(entry.scoring.direction, mark, limitPrice)) continue;

    const legacyPending = tradeJournal.find(
      (e) => e.symbol === entry.symbol && e.status === 'PENDING',
    );

    await confirmOrderFilled(
      entry.id,
      mark,
      legacyPending?.stopLoss ?? entry.plan.slActual,
      legacyPending?.size ?? entry.plan.sizeActual,
    );
    filledAny = true;
  }

  // Legacy-only pending (không có bản ghi AI) — giữ tương thích dữ liệu cũ
  const pendingLegacy = tradeJournal.filter((e) => e.status === 'PENDING');
  for (const entry of pendingLegacy) {
    const hasAiPending = aiTradeJournal.some(
      (ai) => ai.symbol === entry.symbol && ai.outcome.status === 'PENDING',
    );
    if (hasAiPending) continue;

    const mark = prices.get(entry.symbol);
    if (mark == null || !Number.isFinite(mark)) continue;
    if (!isPendingEntryFilled(entry.direction, mark, entry.entryPrice)) continue;

    const resolved = resolveActualEntryPrice(entry.direction, entry.entryPrice, mark);
    await updateJournalEntry(entry.id, {
      status: 'OPEN',
      entryTime: Date.now(),
      entryPrice: resolved?.actualEntryPrice ?? mark,
    });
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

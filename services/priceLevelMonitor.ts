import type { AppTradeSymbol } from '../constants/scoring';
import { fetchTickerPrice } from './binanceApi';
import { isSessionNotificationsEnabled } from './notificationPreferences';
import { showPriceAlertNotification } from './priceAlertNotification';
import { autoCloseOnSlHit } from './autoCloseOnSlHit';
import { useTradeStore } from '../store/useTradeStore';
import { detectNewPriceLevelHits } from '../utils/priceLevelHit';

/**
 * Theo dõi SL/TP cho lệnh OPEN:
 * - SL chạm → tự đóng + ghi nhật ký (luôn chạy)
 * - TP chạm → thông báo OS (khi bật toggle thông báo)
 */
export async function runPriceLevelMonitor(options?: {
  offlineClose?: boolean;
}): Promise<void> {
  const store = useTradeStore.getState();
  if (!store.hydrated) {
    await store.hydrate();
  }

  const { tradeJournal, updateJournalEntry } = useTradeStore.getState();
  const openEntries = tradeJournal.filter((e) => e.status === 'OPEN');
  if (openEntries.length === 0) return;

  const symbols = [...new Set(openEntries.map((e) => e.symbol))];
  const prices = new Map<string, number>();

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const ticker = await fetchTickerPrice(symbol as AppTradeSymbol);
        prices.set(symbol, ticker.price);
      } catch {
        // bỏ qua symbol lỗi tạm thời
      }
    }),
  );

  const notificationsEnabled = await isSessionNotificationsEnabled();

  for (const entry of openEntries) {
    const markPrice = prices.get(entry.symbol);
    if (markPrice == null) continue;

    const hits = detectNewPriceLevelHits(entry, markPrice);
    if (hits.length === 0) continue;

    const slHit = hits.find((h) => h.kind === 'SL');
    if (slHit) {
      const closed = await autoCloseOnSlHit(entry, markPrice, {
        offlineClose: options?.offlineClose,
      });
      if (closed) {
        if (notificationsEnabled) {
          await showPriceAlertNotification(entry, slHit, markPrice);
        }
        continue;
      }
    }

    if (!notificationsEnabled) continue;

    let fired = [...(entry.priceAlertsFired ?? [])];
    for (const hit of hits) {
      if (fired.includes(hit.kind)) continue;
      const sent = await showPriceAlertNotification(entry, hit, markPrice);
      if (sent) {
        fired = [...fired, hit.kind];
      }
    }

    if (fired.length !== (entry.priceAlertsFired?.length ?? 0)) {
      await updateJournalEntry(entry.id, { priceAlertsFired: fired });
    }
  }
}

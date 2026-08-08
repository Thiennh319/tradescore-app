import { useRef } from 'react';
import type { AppTradeSymbol } from '../constants/scoring';
import { fetchTickerPrice, isBinanceTrafficBlocked } from '../services/binanceApi';
import { fillPendingOrdersFromSymbols } from '../services/pendingOrderFillService';
import { useTradeStore } from '../store/useTradeStore';
import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
import { useResumeableBinanceInterval } from './useResumeableBinanceInterval';

/**
 * Theo dõi lệnh chờ (PENDING) — tự chuyển OPEN khi giá chạm entry limit.
 * LONG: giá <= entry · SHORT: giá >= entry (giống Binance limit).
 * Pauses while Binance 429/418 gate is active.
 */
export function usePendingOrderFill(): void {
  const runningRef = useRef(false);

  useResumeableBinanceInterval(async () => {
    if (runningRef.current || isBinanceTrafficBlocked()) return;
    runningRef.current = true;

    try {
      const { tradeJournal } = useTradeStore.getState();
      const pending = tradeJournal.filter((e) => e.status === 'PENDING');
      if (pending.length === 0) return;

      const symbols = [...new Set(pending.map((e) => e.symbol))] as AppTradeSymbol[];
      await fillPendingOrdersFromSymbols(symbols, async (symbol) => {
        const ticker = await fetchTickerPrice(symbol);
        return ticker.price;
      });
    } finally {
      runningRef.current = false;
    }
  }, SCAN_INTERVAL_MS);
}

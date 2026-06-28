import type { useTradeStore } from '../store/useTradeStore';

type TradeStore = typeof useTradeStore;

export function registerNativePersistGuard(_store: TradeStore): () => void {
  return () => {};
}

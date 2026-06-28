import type { useTradeStore } from '../store/useTradeStore';
import { isWebPlatform } from '../utils/isWebPlatform';
import { subscribeSnapshotUpdates } from './webTabSync';

type TradeStore = typeof useTradeStore;

/** Đăng ký đồng bộ tab (web, cùng port). */
export function registerWebTabSync(store: TradeStore): () => void {
  if (!isWebPlatform()) return () => {};

  return subscribeSnapshotUpdates((snapshot) => {
    void store.getState().syncFromRemoteSnapshot(snapshot);
  });
}

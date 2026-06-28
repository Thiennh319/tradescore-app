import { Platform } from 'react-native';
import type { useTradeStore } from '../store/useTradeStore';

type TradeStore = typeof useTradeStore;

/** Ghi snapshot trước khi đóng tab / ẩn trang / đóng EXE (WebView2). */
export function registerWebPersistGuard(store: TradeStore): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};

  const flush = () => {
    void store.getState().flushPersistedState();
  };

  (window as Window & { __tradescoreFlushPersist?: () => Promise<void> }).__tradescoreFlushPersist =
    () => store.getState().flushPersistedState();

  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  return () => {
    delete (window as Window & { __tradescoreFlushPersist?: () => Promise<void> })
      .__tradescoreFlushPersist;
    window.removeEventListener('beforeunload', flush);
    window.removeEventListener('pagehide', flush);
  };
}

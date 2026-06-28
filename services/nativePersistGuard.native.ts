import { AppState } from 'react-native';
import type { useTradeStore } from '../store/useTradeStore';

type TradeStore = typeof useTradeStore;

/** Android/iOS: flush khi vào background, re-hydrate khi quay lại foreground. */
export function registerNativePersistGuard(store: TradeStore): () => void {
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'background' || next === 'inactive') {
      void store.getState().flushPersistedState();
    } else if (next === 'active') {
      void store.getState().hydrate();
    }
  });

  return () => sub.remove();
}

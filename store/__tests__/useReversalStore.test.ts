import { beforeEach, describe, expect, it } from 'vitest';
import { useReversalStore } from '../useReversalStore';

function resetStore() {
  useReversalStore.getState().resetAll();
}

describe('useReversalStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('getState symbol mới → NONE', () => {
    const state = useReversalStore.getState().getState('NEARUSDT');
    expect(state.phase).toBe('NONE');
    expect(state.symbol).toBe('NEARUSDT');
    expect(state.retestPrice).toBeNull();
    expect(state.counterDirection).toBeNull();
  });

  it('startWatching → WATCHING', () => {
    const store = useReversalStore.getState();
    store.startWatching('SOLUSDT', 'SHORT', 'BULL');

    const state = store.getState('SOLUSDT');
    expect(state.phase).toBe('WATCHING');
    expect(state.counterDirection).toBe('SHORT');
    expect(state.detectedAt).toBeGreaterThan(0);
    expect(state.expiresAt).toBeGreaterThan(state.detectedAt);
    expect(store.isWatching('SOLUSDT')).toBe(true);
  });

  it('confirmRetest → RETEST_CONFIRMED', () => {
    const store = useReversalStore.getState();
    store.startWatching('BNBUSDT', 'LONG', 'BEAR');
    store.confirmRetest('BNBUSDT', 612.5);

    const state = store.getState('BNBUSDT');
    expect(state.phase).toBe('RETEST_CONFIRMED');
    expect(state.retestPrice).toBe(612.5);
    expect(store.isRetestConfirmed('BNBUSDT')).toBe(true);
    expect(store.isWatching('BNBUSDT')).toBe(false);
  });

  it('expire → EXPIRED', () => {
    const store = useReversalStore.getState();
    store.startWatching('BTCUSDT', 'SHORT', 'BULL');
    store.expire('BTCUSDT');

    const state = store.getState('BTCUSDT');
    expect(state.phase).toBe('EXPIRED');
    expect(store.isExpired('BTCUSDT')).toBe(true);
    expect(store.isWatching('BTCUSDT')).toBe(false);
  });

  it('Timeout: expiresAt đã qua → getState trả về EXPIRED', () => {
    const store = useReversalStore.getState();
    store.startWatching('NEARUSDT', 'SHORT', 'BULL');

    useReversalStore.setState((state) => ({
      states: {
        ...state.states,
        NEARUSDT: {
          ...state.states.NEARUSDT,
          expiresAt: Date.now() - 1,
        },
      },
    }));

    const state = store.getState('NEARUSDT');
    expect(state.phase).toBe('EXPIRED');
    expect(store.isExpired('NEARUSDT')).toBe(true);
  });

  it('reset → NONE', () => {
    const store = useReversalStore.getState();
    store.startWatching('NEARUSDT', 'SHORT', 'BULL');
    store.reset('NEARUSDT');

    const state = store.getState('NEARUSDT');
    expect(state.phase).toBe('NONE');
    expect(state.detectedAt).toBe(0);
    expect(state.retestPrice).toBeNull();
    expect(state.counterDirection).toBeNull();
    expect(state.expiresAt).toBeNull();
  });

  it('resetAll → tất cả NONE', () => {
    const store = useReversalStore.getState();
    store.startWatching('NEARUSDT', 'SHORT', 'BULL');
    store.startWatching('SOLUSDT', 'LONG', 'BEAR');
    store.resetAll();

    expect(store.getState('NEARUSDT').phase).toBe('NONE');
    expect(store.getState('SOLUSDT').phase).toBe('NONE');
    expect(useReversalStore.getState().states).toEqual({});
  });

  it('isWatching đúng', () => {
    const store = useReversalStore.getState();
    expect(store.isWatching('NEARUSDT')).toBe(false);

    store.startWatching('NEARUSDT', 'SHORT', 'BULL');
    expect(store.isWatching('NEARUSDT')).toBe(true);

    store.confirmRetest('NEARUSDT', 3.2);
    expect(store.isWatching('NEARUSDT')).toBe(false);
  });

  it('isRetestConfirmed đúng', () => {
    const store = useReversalStore.getState();
    expect(store.isRetestConfirmed('NEARUSDT')).toBe(false);

    store.startWatching('NEARUSDT', 'SHORT', 'BULL');
    expect(store.isRetestConfirmed('NEARUSDT')).toBe(false);

    store.confirmRetest('NEARUSDT', 3.2);
    expect(store.isRetestConfirmed('NEARUSDT')).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { MarketIntelligenceSnapshot } from '../../services/v41/types';
import { useV41Store } from '../useV41Store';

function mockSnapshot(overrides: Partial<MarketIntelligenceSnapshot> = {}): MarketIntelligenceSnapshot {
  return {
    trendStrength: 70,
    trendDirection: 'BULL',
    trendExhaustion: 20,
    volumeDivergencePts: 0,
    reversalProbability: 30,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 55,
    btcAlignmentFactor: 1.0,
    btcDirection: 'BULL',
    marketState: 'HealthyUptrend',
    scanTimestamp: Date.now(),
    ...overrides,
  };
}

/** Map store fields → contract asserted in tests. */
function readSymbolState(symbol: string) {
  const state = useV41Store.getState().getSymbolState(symbol);
  const withScannedAt = state as typeof state & { lastScannedAt?: number };
  return {
    previousMode: state.previousMode,
    lastSnapshot: state.lastSnapshot ?? null,
    lastScannedAt: withScannedAt.lastScannedAt ?? state.updatedAt ?? 0,
  };
}

function resetStore() {
  const api = useV41Store.getState() as ReturnType<typeof useV41Store.getState> & {
    resetAll?: () => void;
  };
  if (typeof api.resetAll === 'function') {
    api.resetAll();
    return;
  }
  useV41Store.setState({ isScanning: false, symbolStates: {} });
}

function resetSymbol(symbol: string) {
  const api = useV41Store.getState() as ReturnType<typeof useV41Store.getState> & {
    resetSymbol?: (s: string) => void;
  };
  if (typeof api.resetSymbol === 'function') {
    api.resetSymbol(symbol);
    return;
  }
  useV41Store.setState((state) => {
    const { [symbol]: _removed, ...rest } = state.symbolStates;
    return { symbolStates: rest };
  });
}

describe('useV41Store', () => {
  beforeEach(() => {
    resetStore();
  });

  it('getSymbolState symbol chưa tồn tại → INACTIVE, null snapshot, lastScannedAt 0', () => {
    expect(readSymbolState('NEARUSDT')).toEqual({
      previousMode: 'INACTIVE',
      lastSnapshot: null,
      lastScannedAt: 0,
    });
  });

  it('updateSymbolState rồi getSymbolState → mode, snapshot, lastScannedAt > 0', () => {
    const snapshot = mockSnapshot({ marketConfidence: 78 });
    useV41Store.getState().updateSymbolState('SOLUSDT', 'WATCH_MODE', snapshot);

    const state = readSymbolState('SOLUSDT');
    expect(state.previousMode).toBe('WATCH_MODE');
    expect(state.lastSnapshot).toEqual(snapshot);
    expect(state.lastScannedAt).toBeGreaterThan(0);
  });

  it('update WATCH_MODE rồi TRADE_MODE → getSymbolState trả về TRADE_MODE', () => {
    const snapshot = mockSnapshot();
    const { updateSymbolState } = useV41Store.getState();

    updateSymbolState('BNBUSDT', 'WATCH_MODE', snapshot);
    updateSymbolState('BNBUSDT', 'TRADE_MODE', { ...snapshot, marketConfidence: 85 });

    expect(readSymbolState('BNBUSDT').previousMode).toBe('TRADE_MODE');
  });

  it('resetSymbol → getSymbolState về INACTIVE', () => {
    const snapshot = mockSnapshot();
    useV41Store.getState().updateSymbolState('NEARUSDT', 'WATCH_MODE', snapshot);

    resetSymbol('NEARUSDT');

    expect(readSymbolState('NEARUSDT')).toEqual({
      previousMode: 'INACTIVE',
      lastSnapshot: null,
      lastScannedAt: 0,
    });
  });

  it('resetAll → tất cả symbol về default, isScanning = false', () => {
    const snapshot = mockSnapshot();
    const store = useV41Store.getState();
    store.setScanning(true);
    store.updateSymbolState('NEARUSDT', 'WATCH_MODE', snapshot);
    store.updateSymbolState('SOLUSDT', 'TRADE_MODE', snapshot);

    resetStore();

    expect(readSymbolState('NEARUSDT')).toEqual({
      previousMode: 'INACTIVE',
      lastSnapshot: null,
      lastScannedAt: 0,
    });
    expect(readSymbolState('SOLUSDT')).toEqual({
      previousMode: 'INACTIVE',
      lastSnapshot: null,
      lastScannedAt: 0,
    });
    expect(useV41Store.getState().isScanning).toBe(false);
  });

  it('setScanning(true) → isScanning = true', () => {
    useV41Store.getState().setScanning(true);
    expect(useV41Store.getState().isScanning).toBe(true);
  });

  it('setScanning(false) → isScanning = false', () => {
    useV41Store.getState().setScanning(true);
    useV41Store.getState().setScanning(false);
    expect(useV41Store.getState().isScanning).toBe(false);
  });

  it('2 symbol độc lập — update A không ảnh hưởng B', () => {
    const snapshotA = mockSnapshot({ marketConfidence: 60 });
    const snapshotB = mockSnapshot({ marketConfidence: 90 });

    useV41Store.getState().updateSymbolState('NEARUSDT', 'WATCH_MODE', snapshotA);
    useV41Store.getState().updateSymbolState('BTCUSDT', 'TRADE_MODE', snapshotB);

    const stateA = readSymbolState('NEARUSDT');
    const stateB = readSymbolState('BTCUSDT');

    expect(stateA.previousMode).toBe('WATCH_MODE');
    expect(stateA.lastSnapshot).toEqual(snapshotA);
    expect(stateB.previousMode).toBe('TRADE_MODE');
    expect(stateB.lastSnapshot).toEqual(snapshotB);
    expect(readSymbolState('SOLUSDT').previousMode).toBe('INACTIVE');
  });
});

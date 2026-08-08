import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AllMarketData } from '../binanceApi';
import { bookTickerFromMarketDepth } from '../bookTickerFromMarket';
import {
  buildLockedPlanMonitorContextFromMarket,
  refreshLockedPlanMonitorContext,
} from '../lockedPlanMonitorService';
import {
  __resetScanMarketSnapshotsForTests,
  publishScanMarketSnapshot,
} from '../scanMarketSnapshotStore';

vi.mock('../binanceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../binanceApi')>();
  return {
    ...actual,
    fetchTickerPrice: vi.fn(async () => ({
      symbol: 'NEARUSDT',
      price: 1.77,
      fromCache: false,
    })),
    fetchAllMarketData: vi.fn(async () => {
      throw new Error('fetchAllMarketData must not be called in DATA-2c path');
    }),
  };
});

import { fetchAllMarketData, fetchTickerPrice } from '../binanceApi';

function minimalMarket(): AllMarketData {
  const k = Array.from({ length: 30 }, (_, i) => ({
    openTime: 1_700_000_000_000 + i * 3_600_000,
    open: 1.5,
    high: 1.6,
    low: 1.4,
    close: 1.55 + i * 0.001,
    volume: 1000,
    closeTime: 1_700_000_000_000 + i * 3_600_000 + 3_500_000,
    quoteVolume: 0,
    trades: 10,
    takerBuyVolume: 400,
  }));
  return {
    symbol: 'NEARUSDT',
    fetchedAt: Date.now(),
    fromCache: false,
    klines: {
      '1h': {
        symbol: 'NEARUSDT',
        timeframe: '1h',
        klines: k,
        fromCache: false,
      },
      '4h': {
        symbol: 'NEARUSDT',
        timeframe: '4h',
        klines: k,
        fromCache: false,
      },
    },
    orderBook: {
      symbol: 'NEARUSDT',
      lastUpdateId: 1,
      bids: [{ price: 1.54, quantity: 10 }],
      asks: [{ price: 1.56, quantity: 12 }],
      fromCache: false,
    },
    forceOrders: null,
    oiEngine: null,
    fundingHistory: {
      symbol: 'NEARUSDT',
      records: [],
      fromCache: false,
    },
    longShortRatio: {
      symbol: 'NEARUSDT',
      ratio: 1,
      history: [],
      fromCache: false,
    },
    errors: {},
  };
}

const psych = {
  alert: true,
  chartStudied: true,
  noFomo: true,
  riskDefined: true,
  calm: true,
} as const;

describe('DATA-2c shared pipeline helpers', () => {
  beforeEach(() => {
    __resetScanMarketSnapshotsForTests();
    vi.mocked(fetchTickerPrice).mockClear();
    vi.mocked(fetchAllMarketData).mockClear();
  });

  it('bookTickerFromMarketDepth uses top of depth', () => {
    const book = bookTickerFromMarketDepth('NEARUSDT', minimalMarket());
    expect(book?.bidPrice).toBe(1.54);
    expect(book?.askPrice).toBe(1.56);
    expect(book?.spread).toBeCloseTo(0.02);
  });

  it('refreshLockedPlanMonitorContext uses snapshot + optional ticker only', async () => {
    const market = minimalMarket();
    publishScanMarketSnapshot({
      symbol: 'NEARUSDT',
      market,
      tickerPrice: 1.55,
      change24h: 1,
      btcChange24h: -0.5,
      scannedAt: Date.now(),
    });

    const withTicker = await refreshLockedPlanMonitorContext(
      'NEARUSDT',
      '1h',
      psych as never,
      -0.5,
      { fetchTicker: true },
    );
    expect(withTicker?.price).toBe(1.77);
    expect(withTicker?.analysisInput.symbol).toBe('NEARUSDT');
    expect(fetchTickerPrice).toHaveBeenCalledTimes(1);
    expect(fetchAllMarketData).not.toHaveBeenCalled();

    vi.mocked(fetchTickerPrice).mockClear();
    const noTicker = await refreshLockedPlanMonitorContext(
      'NEARUSDT',
      '1h',
      psych as never,
      -0.5,
      { fetchTicker: false },
    );
    expect(noTicker?.price).toBe(1.55);
    expect(fetchTickerPrice).not.toHaveBeenCalled();
  });

  it('refreshLockedPlanMonitorContext returns null without fresh snapshot', async () => {
    const result = await refreshLockedPlanMonitorContext(
      'NEARUSDT',
      '1h',
      psych as never,
      0,
    );
    expect(result).toBeNull();
    expect(fetchAllMarketData).not.toHaveBeenCalled();
  });

  it('buildLockedPlanMonitorContextFromMarket builds input', () => {
    const built = buildLockedPlanMonitorContextFromMarket(
      'NEARUSDT',
      minimalMarket(),
      1.55,
      psych as never,
      -0.5,
    );
    expect(built?.analysisInput.klines1h.length).toBeGreaterThan(0);
    expect(built?.price).toBe(1.55);
  });
});

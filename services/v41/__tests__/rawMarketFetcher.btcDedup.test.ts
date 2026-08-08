import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Kline } from '../../binanceApi';

const fetchKlines = vi.fn();
const fetchTickerPrice = vi.fn();
const binancePublicFetch = vi.fn();

vi.mock('../../binanceApi', () => ({
  fetchKlines: (...args: unknown[]) => fetchKlines(...args),
  fetchTickerPrice: (...args: unknown[]) => fetchTickerPrice(...args),
  binancePublicFetch: (...args: unknown[]) => binancePublicFetch(...args),
}));

import {
  fetchRawMarketV41,
  fetchSharedBtcMarketV41,
} from '../rawMarketFetcher';

function closedKline(i: number, close = 100 + i): Kline {
  const openTime = 1_700_000_000_000 + i * 3_600_000;
  return {
    openTime,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
    closeTime: openTime + 3_600_000 - 60_000, // closed in the past relative to typical Date.now
    quoteVolume: 0,
    trades: 10,
    takerBuyVolume: 400,
  };
}

function klinesResult(symbol: string, timeframe: string, closes: number[]) {
  return {
    symbol,
    timeframe,
    klines: closes.map((c, i) => closedKline(i, c)),
    fromCache: false,
  };
}

describe('V41 BTC fetch dedup (DATA-2b)', () => {
  beforeEach(() => {
    fetchKlines.mockReset();
    fetchTickerPrice.mockReset();
    binancePublicFetch.mockReset();
    fetchTickerPrice.mockResolvedValue({
      symbol: 'NEARUSDT',
      price: 1.5,
      fromCache: false,
    });

    fetchKlines.mockImplementation(async (symbol: string, timeframe: string) => {
      if (symbol === 'BTCUSDT' && timeframe === '4h') {
        return klinesResult('BTCUSDT', '4h', [60000, 60100, 60200]);
      }
      if (symbol === 'BTCUSDT' && timeframe === '1h') {
        return klinesResult('BTCUSDT', '1h', [60000, 60050, 60100]);
      }
      if (timeframe === '4h') {
        return klinesResult(symbol, '4h', [1, 1.1, 1.2]);
      }
      if (timeframe === '1h') {
        return klinesResult(symbol, '1h', [1, 1.05, 1.1]);
      }
      if (timeframe === '30m') {
        return klinesResult(symbol, '30m', [1, 1.02, 1.04]);
      }
      return klinesResult(symbol, timeframe, [1, 2, 3]);
    });
  });

  it('fetchSharedBtcMarketV41 hits BTC 4H + 1H once', async () => {
    const shared = await fetchSharedBtcMarketV41();
    expect(shared.btcKlines4H.length).toBeGreaterThan(0);
    expect(shared.btcKlines1H.length).toBeGreaterThan(0);

    const btc4h = fetchKlines.mock.calls.filter(
      (c) => c[0] === 'BTCUSDT' && c[1] === '4h',
    );
    const btc1h = fetchKlines.mock.calls.filter(
      (c) => c[0] === 'BTCUSDT' && c[1] === '1h',
    );
    expect(btc4h).toHaveLength(1);
    expect(btc1h).toHaveLength(1);
  });

  it('4-coin cycle with shared BTC: BTC 4H/1H fetched once total (not ×4)', async () => {
    const shared = await fetchSharedBtcMarketV41();
    fetchKlines.mockClear();

    const symbols = ['NEARUSDT', 'SOLUSDT', 'BNBUSDT', 'BTCUSDT'] as const;
    const snaps = await Promise.all(
      symbols.map((s) => fetchRawMarketV41(s, shared)),
    );

    const btc4h = fetchKlines.mock.calls.filter(
      (c) => c[0] === 'BTCUSDT' && c[1] === '4h',
    );
    const btc1h = fetchKlines.mock.calls.filter(
      (c) => c[0] === 'BTCUSDT' && c[1] === '1h',
    );
    expect(btc4h).toHaveLength(0);
    expect(btc1h).toHaveLength(0);

    // Same shared reference / identical closes for all coins
    for (const snap of snaps) {
      expect(snap.btcKlines).toBe(shared.btcKlines4H);
      expect(snap.btcKlines1H).toBe(shared.btcKlines1H);
      expect(snap.btcKlines.map((k) => k.close)).toEqual(
        shared.btcKlines4H.map((k) => k.close),
      );
    }
  });

  it('without sharedBtc, legacy path still fetches BTC per call', async () => {
    await fetchRawMarketV41('NEARUSDT');
    await fetchRawMarketV41('SOLUSDT');

    const btc4h = fetchKlines.mock.calls.filter(
      (c) => c[0] === 'BTCUSDT' && c[1] === '4h',
    );
    expect(btc4h.length).toBe(2);
  });
});

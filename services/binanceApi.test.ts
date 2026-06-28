import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetApiGuardForTests,
  calculateFundingMetrics,
  fetchAllMarketData,
  fetchBookTicker,
  fetchDeepOrderBook,
  fetchForceOrders,
  fetchFundingRateHistory,
  fetchKlines,
  fetchTickerPrice,
  fundingRatesNewestFirst,
} from './binanceApi';

const store = new Map<string, string>();

function installForceOrderWebSocketMock() {
  class MockWebSocket {
    static OPEN = 1;
    url: string;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    readyState = 0;

    constructor(url: string) {
      this.url = url;
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
        if (url.includes('@forceOrder')) {
          this.onmessage?.({
            data: JSON.stringify({
              e: 'forceOrder',
              E: 1,
              o: {
                s: 'BTCUSDT',
                S: 'SELL',
                q: '0.01',
                p: '65000',
                ap: '65000',
                l: '0.01',
                X: 'FILLED',
                T: 1,
              },
            }),
          });
        }
      });
    }

    close() {
      this.readyState = 3;
    }
  }

  vi.stubGlobal('WebSocket', MockWebSocket);
}

vi.mock('./storage', () => ({
  storageGetItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  storageSetItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
}));

const klineRow = [
  1499040000000,
  '100',
  '110',
  '90',
  '105',
  '1000',
  1499644799999,
  '50000',
  100,
  '500',
  '25000',
  '0',
];

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  return vi.fn((input: string | URL) => {
    const url = String(input);
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) return Promise.resolve(handler());
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
}

describe('binanceApi', () => {
  beforeEach(() => {
    __resetApiGuardForTests();
    store.clear();
    installForceOrderWebSocketMock();
    vi.stubGlobal('fetch', mockFetch({}));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchKlines parses candle data', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/fapi/v1/klines': () =>
          new Response(JSON.stringify([klineRow]), { status: 200 }),
      }),
    );

    const result = await fetchKlines('BTCUSDT', '1h', 10);

    expect(result.fromCache).toBe(false);
    expect(result.timeframe).toBe('1h');
    expect(result.klines[0]).toMatchObject({
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1000,
    });
  });

  it('fetchTickerPrice returns last traded price', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/fapi/v1/ticker/price': () =>
          new Response(JSON.stringify({ symbol: 'BTCUSDT', price: '65000.50' }), { status: 200 }),
      }),
    );

    const ticker = await fetchTickerPrice('BTCUSDT');
    expect(ticker.price).toBe(65000.5);
    expect(ticker.fromCache).toBe(false);
  });

  it('fetchBookTicker returns bid/ask spread', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/fapi/v1/ticker/bookTicker': () =>
          new Response(
            JSON.stringify({
              symbol: 'BTCUSDT',
              bidPrice: '64999',
              bidQty: '1',
              askPrice: '65001',
              askQty: '1',
            }),
            { status: 200 },
          ),
      }),
    );

    const book = await fetchBookTicker('BTCUSDT');
    expect(book.spread).toBe(2);
  });

  it('fetchForceOrders uses public WebSocket without API headers', async () => {
    const orders = await fetchForceOrders('BTCUSDT', 5);
    expect(orders.fromCache).toBe(false);
    expect(orders.orders).toHaveLength(1);
    expect(orders.orders[0].side).toBe('SELL');
    expect(orders.orders[0].price).toBe(65000);
  });

  it('fetchDeepOrderBook requests limit=1000', async () => {
    const fetchMock = mockFetch({
      '/fapi/v1/depth': () =>
        new Response(
          JSON.stringify({
            lastUpdateId: 1,
            bids: [['100', '1.5']],
            asks: [['101', '2']],
          }),
          { status: 200 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);

    const book = await fetchDeepOrderBook('ETHUSDT');

    expect(String(fetchMock.mock.calls[0][0])).toContain('limit=1000');
    expect(book.bids[0]).toEqual({ price: 100, quantity: 1.5 });
    expect(book.fromCache).toBe(false);
  });

  it('returns fromCache on network failure when cache exists', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/fapi/v1/fundingRate': () =>
          new Response(
            JSON.stringify([
              { symbol: 'BTCUSDT', fundingRate: '0.0001', fundingTime: 1, markPrice: '50000' },
              { symbol: 'BTCUSDT', fundingRate: '0.0002', fundingTime: 2, markPrice: '50000' },
            ]),
            { status: 200 },
          ),
      }),
    );

    const live = await fetchFundingRateHistory('BTCUSDT');
    expect(live).toEqual([0.0002, 0.0001]);

    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/fapi/v1/fundingRate': () => Promise.reject(new Error('network down')),
      }),
    );

    const cached = await fetchFundingRateHistory('BTCUSDT');
    expect(cached).toEqual([0.0002, 0.0001]);
  });

  it('fetchFundingRateHistory requests limit=16 and returns newest at index 0', async () => {
    const fetchMock = mockFetch({
      '/fapi/v1/fundingRate': () =>
        new Response(
          JSON.stringify(
            Array.from({ length: 16 }, (_, i) => ({
              symbol: 'BNBUSDT',
              fundingRate: String(0.0001 + i * 0.00001),
              fundingTime: i + 1,
              markPrice: '600',
            })),
          ),
          { status: 200 },
        ),
    });
    vi.stubGlobal('fetch', fetchMock);

    const rates = await fetchFundingRateHistory('BNBUSDT');

    expect(String(fetchMock.mock.calls[0][0])).toContain('limit=16');
    expect(rates).toHaveLength(16);
    expect(rates![0]).toBeCloseTo(0.0001 + 15 * 0.00001, 8);
    expect(rates![15]).toBeCloseTo(0.0001, 8);
  });

  it('fetchFundingRateHistory returns null and warns when API fails without cache', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/fapi/v1/fundingRate': () => Promise.reject(new Error('HTTP 503')),
      }),
    );

    const rates = await fetchFundingRateHistory('NEARUSDT');

    expect(rates).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('funding_history_fetch_failed');
    warnSpy.mockRestore();
  });

  it('calculateFundingMetrics computes avg8, avg16, velocity, acceleration', () => {
    const rates = Array.from({ length: 16 }, (_, i) => 0.0016 - i * 0.0001);

    const metrics = calculateFundingMetrics(rates)!;

    expect(metrics.fundingCurrent).toBe(0.0016);
    expect(metrics.fundingAvg8).toBeCloseTo(0.00125, 6);
    expect(metrics.fundingAvg16).toBeCloseTo(0.00085, 6);
    expect(metrics.fundingVelocity).toBeCloseTo(0.00035, 6);
    expect(metrics.fundingAcceleration).toBeCloseTo(0.0004, 6);
  });

  it('fundingRatesNewestFirst sorts by fundingTime descending', () => {
    const rates = fundingRatesNewestFirst([
      { symbol: 'BTCUSDT', fundingRate: 0.0001, fundingTime: 100, markPrice: 1 },
      { symbol: 'BTCUSDT', fundingRate: 0.0003, fundingTime: 300, markPrice: 1 },
      { symbol: 'BTCUSDT', fundingRate: 0.0002, fundingTime: 200, markPrice: 1 },
    ]);
    expect(rates).toEqual([0.0003, 0.0002, 0.0001]);
  });

  it('fetchAllMarketData uses allSettled and collects partial results', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/fapi/v1/klines': () =>
          new Response(JSON.stringify([klineRow]), { status: 200 }),
        '/fapi/v1/depth': () =>
          new Response(
            JSON.stringify({ lastUpdateId: 1, bids: [], asks: [] }),
            { status: 200 },
          ),
        '/fapi/v1/openInterest': () =>
          new Response(
            JSON.stringify({ openInterest: '1000', symbol: 'BTCUSDT', time: 1 }),
            { status: 200 },
          ),
        '/futures/data/openInterestHist': () =>
          new Response(
            JSON.stringify([
              { symbol: 'BTCUSDT', sumOpenInterest: '900', sumOpenInterestValue: '1', timestamp: 1 },
              { symbol: 'BTCUSDT', sumOpenInterest: '1000', sumOpenInterestValue: '1', timestamp: 2 },
            ]),
            { status: 200 },
          ),
        '/fapi/v1/fundingRate': () =>
          new Response(
            JSON.stringify([{ symbol: 'BTCUSDT', fundingRate: '0.0001', fundingTime: 1, markPrice: '1' }]),
            { status: 200 },
          ),
      }),
    );

    const data = await fetchAllMarketData('BTCUSDT', 10, 5);

    expect(data.symbol).toBe('BTCUSDT');
    expect(data.klines['5m']?.klines).toHaveLength(1);
    expect(data.klines['1d']?.klines).toHaveLength(1);
    expect(data.orderBook).not.toBeNull();
    expect(data.oiEngine?.deltaOI).toBe(100);
    expect(data.fundingHistory?.records).toHaveLength(1);
    expect(data.forceOrders?.orders.length).toBeGreaterThanOrEqual(0);
    expect(data.errors.forceOrders).toBeUndefined();
  });
});

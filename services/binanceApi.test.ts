import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __getBinanceConcurrencyForTests,
  __resetApiGuardForTests,
  __setBinanceBlockForTests,
  BINANCE_IP_BAN_MIN_MS,
  BINANCE_MAX_CONCURRENT,
  BINANCE_RATE_LIMIT_DEFAULT_MS,
  BinanceTrafficBlockedError,
  calculateFundingMetrics,
  fetchAllMarketData,
  fetchBookTicker,
  fetchDeepOrderBook,
  fetchForceOrders,
  fetchFundingRateHistory,
  fetchKlines,
  fetchTickerPrice,
  fundingRatesNewestFirst,
  getBinanceBlockState,
  isBinanceTrafficBlocked,
  msUntilBinanceTrafficAllowed,
  parseBannedUntilMs,
  parseRetryAfterMs,
  subscribeBinanceBlockState,
  withBinanceConcurrency,
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

  describe('429 / 418 traffic gate', () => {
    it('parseRetryAfterMs supports seconds and HTTP-date', () => {
      expect(parseRetryAfterMs('12')).toBe(12_000);
      expect(parseRetryAfterMs(null)).toBeNull();
      const future = new Date(Date.now() + 30_000).toUTCString();
      const ms = parseRetryAfterMs(future);
      expect(ms).toBeGreaterThan(25_000);
      expect(ms).toBeLessThanOrEqual(30_000);
    });

    it('parseBannedUntilMs reads Binance body', () => {
      const until = Date.now() + 60_000;
      expect(parseBannedUntilMs(`{"code":-1003,"msg":"banned until ${until}"}`)).toBe(until);
      expect(parseBannedUntilMs('no ban')).toBeNull();
    });

    it('HTTP 429 + Retry-After activates rate_limit backoff and blocks further fetch', async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ msg: 'Too many requests' }), {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'Retry-After': '7' },
          }),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchTickerPrice('BTCUSDT')).rejects.toThrow(/HTTP 429/);

      const state = getBinanceBlockState();
      expect(state.blocked).toBe(true);
      expect(state.kind).toBe('rate_limit');
      expect(msUntilBinanceTrafficAllowed()).toBeGreaterThanOrEqual(6_500);
      expect(msUntilBinanceTrafficAllowed()).toBeLessThanOrEqual(7_000);

      fetchMock.mockClear();
      await expect(fetchTickerPrice('BTCUSDT')).rejects.toBeInstanceOf(BinanceTrafficBlockedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('HTTP 429 without Retry-After uses default backoff', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(new Response('{}', { status: 429, statusText: 'Too Many Requests' })),
        ),
      );

      await expect(fetchTickerPrice('BTCUSDT')).rejects.toThrow(/HTTP 429/);
      expect(getBinanceBlockState().kind).toBe('rate_limit');
      expect(msUntilBinanceTrafficAllowed()).toBeGreaterThanOrEqual(
        BINANCE_RATE_LIMIT_DEFAULT_MS - 50,
      );
    });

    it('HTTP 418 activates ip_ban ≥ BINANCE_IP_BAN_MIN_MS and notifies listeners', async () => {
      const untilBody = Date.now() + 2 * 60_000;
      const listener = vi.fn();
      const unsub = subscribeBinanceBlockState(listener);

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ msg: `banned until ${untilBody}` }), {
              status: 418,
              statusText: "I'm a teapot",
            }),
          ),
        ),
      );

      await expect(fetchTickerPrice('BTCUSDT')).rejects.toThrow(/HTTP 418/);
      unsub();

      expect(listener).toHaveBeenCalled();
      const state = getBinanceBlockState();
      expect(state.kind).toBe('ip_ban');
      expect(state.blocked).toBe(true);
      expect(state.untilMs).toBeGreaterThanOrEqual(Date.now() + BINANCE_IP_BAN_MIN_MS - 1000);
      // body until is only 2m < 10m floor → floor wins
      expect(state.untilMs).toBeGreaterThanOrEqual(Date.now() + BINANCE_IP_BAN_MIN_MS - 2000);
    });

    it('HTTP 418 with far banned-until uses body deadline', async () => {
      const untilBody = Date.now() + 45 * 60_000;
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(JSON.stringify({ msg: `Way too many requests; banned until ${untilBody}` }), {
              status: 418,
              statusText: "I'm a teapot",
            }),
          ),
        ),
      );

      await expect(fetchKlines('NEARUSDT', '1h', 5)).rejects.toThrow(/HTTP 418/);
      expect(getBinanceBlockState().untilMs).toBe(untilBody);
    });

    it('after block expires, traffic resume and fetch works again', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            new Response('{}', {
              status: 429,
              statusText: 'Too Many Requests',
              headers: { 'Retry-After': '1' },
            }),
          )
          .mockResolvedValueOnce(
            new Response(JSON.stringify({ symbol: 'BTCUSDT', price: '65000.0' }), {
              status: 200,
            }),
          );
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchTickerPrice('BTCUSDT')).rejects.toThrow(/HTTP 429/);
        expect(isBinanceTrafficBlocked()).toBe(true);

        await vi.advanceTimersByTimeAsync(1_100);
        expect(isBinanceTrafficBlocked()).toBe(false);

        const ok = await fetchTickerPrice('BTCUSDT');
        expect(ok.price).toBe(65000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('concurrency queue never exceeds BINANCE_MAX_CONCURRENT under burst', async () => {
      __resetApiGuardForTests();
      let inFlight = 0;
      let observedPeak = 0;

      const jobs = Array.from({ length: 12 }, () =>
        withBinanceConcurrency(async () => {
          inFlight += 1;
          observedPeak = Math.max(observedPeak, inFlight);
          expect(inFlight).toBeLessThanOrEqual(BINANCE_MAX_CONCURRENT);
          await new Promise((r) => setTimeout(r, 30));
          inFlight -= 1;
        }),
      );

      await Promise.all(jobs);
      expect(observedPeak).toBe(BINANCE_MAX_CONCURRENT);
      expect(__getBinanceConcurrencyForTests().active).toBe(0);
      expect(__getBinanceConcurrencyForTests().peak).toBeLessThanOrEqual(BINANCE_MAX_CONCURRENT);
    });

    it('block rejects concurrency waiters without hanging', async () => {
      __resetApiGuardForTests();
      const releaseSlots: Array<() => void> = [];

      const holders = Array.from({ length: BINANCE_MAX_CONCURRENT }, () =>
        withBinanceConcurrency(
          () =>
            new Promise<void>((resolve) => {
              releaseSlots.push(resolve);
            }),
        ),
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(__getBinanceConcurrencyForTests().active).toBe(BINANCE_MAX_CONCURRENT);

      const queued = Array.from({ length: 5 }, () =>
        withBinanceConcurrency(async () => 'should-not-run'),
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(__getBinanceConcurrencyForTests().waiting).toBe(5);

      __setBinanceBlockForTests('ip_ban', Date.now() + 60_000, 'test flush queue');

      const settled = await Promise.allSettled(queued);
      expect(settled.every((s) => s.status === 'rejected')).toBe(true);
      expect(
        settled.every(
          (s) =>
            s.status === 'rejected' && s.reason instanceof BinanceTrafficBlockedError,
        ),
      ).toBe(true);

      for (const release of releaseSlots) release();
      await Promise.allSettled(holders);
      expect(__getBinanceConcurrencyForTests().waiting).toBe(0);
      expect(__getBinanceConcurrencyForTests().active).toBe(0);
    });

    it('__setBinanceBlockForTests pauses until cleared by expiry', () => {
      __setBinanceBlockForTests('ip_ban', Date.now() + 5_000, 'manual');
      expect(isBinanceTrafficBlocked()).toBe(true);
      __setBinanceBlockForTests('ip_ban', Date.now() - 1_000, 'expired already');
      // until in the past → getBinanceBlockState clears
      expect(isBinanceTrafficBlocked()).toBe(false);
    });
  });
});

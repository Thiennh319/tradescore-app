import {
  BINANCE_BASE_URL,
  TIMEFRAMES,
  type Timeframe,
  type TradeSymbol,
} from '../constants/scoring';
import { storageGetItem, storageSetItem } from './storage';

// ─── Config ────────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 8000;
const MIN_REQUEST_GAP_MS = 120;
const CACHE_PREFIX = '@tradescore/binance/v1/';
const DEFAULT_CACHE_TTL_MS = 60_000;
const ORDERBOOK_CACHE_TTL_MS = 15_000;
const TICKER_CACHE_TTL_MS = 3_000;
const FORCE_ORDERS_WS_COLLECT_MS = 2_000;
const FORCE_ORDERS_CACHE_TTL_MS = 45_000;
const BINANCE_WS_BASE = 'wss://fstream.binance.com/ws';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CacheMeta {
  fromCache: boolean;
  cachedAt?: number;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  /** Taker buy base asset volume — Binance trả ở field index 9 (optional cho fixture cũ) */
  takerBuyVolume?: number;
  /** Taker buy quote asset volume — field index 10 (optional cho fixture cũ) */
  takerBuyQuoteVolume?: number;
}

export interface KlinesResult extends CacheMeta {
  symbol: TradeSymbol;
  timeframe: Timeframe;
  klines: Kline[];
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface DeepOrderBookResult extends CacheMeta {
  symbol: TradeSymbol;
  lastUpdateId: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface ForceOrder {
  symbol: TradeSymbol;
  price: number;
  avgPrice: number;
  origQty: number;
  executedQty: number;
  side: 'BUY' | 'SELL';
  time: number;
  status: string;
}

export interface ForceOrdersResult extends CacheMeta {
  symbol: TradeSymbol;
  orders: ForceOrder[];
}

export interface OpenInterestSnapshot {
  openInterest: number;
  symbol: TradeSymbol;
  time: number;
}

export interface OpenInterestHistPoint {
  symbol: TradeSymbol;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
  timestamp: number;
}

export interface OIEngineResult extends CacheMeta {
  symbol: TradeSymbol;
  current: OpenInterestSnapshot;
  history: OpenInterestHistPoint[];
  deltaOI: number;
}

export interface FundingRateRecord {
  symbol: TradeSymbol;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
}

export interface FundingRateHistoryResult extends CacheMeta {
  symbol: TradeSymbol;
  records: FundingRateRecord[];
}

/** Metrics derived from 16 funding rates (newest at index 0). */
export interface FundingMetrics {
  fundingCurrent: number;
  fundingAvg8: number;
  fundingAvg16: number;
  fundingVelocity: number;
  fundingAcceleration: number;
}

export const FUNDING_RATE_HISTORY_LIMIT = 16;

export interface LongShortRatioPoint {
  symbol: TradeSymbol;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
  timestamp: number;
}

export interface LongShortRatioResult extends CacheMeta {
  symbol: TradeSymbol;
  /** Tỉ lệ Long/Short từ tài khoản top trader Binance (gần nhất) */
  ratio: number;
  history: LongShortRatioPoint[];
}

/** Period hợp lệ cho /futures/data/openInterestHist & topLongShortAccountRatio. */
export type StatsPeriod = '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d';

const STATS_PERIOD_MAP: Record<Timeframe, StatsPeriod> = {
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

export function statsPeriodFor(timeframe: Timeframe): StatsPeriod {
  return STATS_PERIOD_MAP[timeframe] ?? '5m';
}

export interface TickerPriceResult extends CacheMeta {
  symbol: TradeSymbol;
  price: number;
}

export interface BookTickerResult extends CacheMeta {
  symbol: TradeSymbol;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
  spread: number;
}

export type KlinesByTimeframe = Partial<Record<Timeframe, KlinesResult>>;

export interface AllMarketData {
  symbol: TradeSymbol;
  fetchedAt: number;
  fromCache: boolean;
  klines: KlinesByTimeframe;
  orderBook: DeepOrderBookResult | null;
  forceOrders: ForceOrdersResult | null;
  oiEngine: OIEngineResult | null;
  fundingHistory: FundingRateHistoryResult | null;
  longShortRatio: LongShortRatioResult | null;
  errors: Partial<Record<string, string>>;
}

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
}

// ─── Anti-spam: throttle + in-flight dedup ─────────────────────────────────────

let lastRequestAt = 0;
const inflightRequests = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, MIN_REQUEST_GAP_MS - (now - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function withDedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

// ─── Cache layer ───────────────────────────────────────────────────────────────

function cacheKey(suffix: string): string {
  return `${CACHE_PREFIX}${suffix}`;
}

async function readCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await storageGetItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { data, cachedAt: Date.now() };
    await storageSetItem(key, JSON.stringify(envelope));
  } catch {
    // cache write failure must not crash the app
  }
}

async function loadFromCache<T extends CacheMeta>(
  key: string,
  attachMeta: (data: Omit<T, 'fromCache' | 'cachedAt'>, cachedAt: number) => T,
): Promise<T | null> {
  const cached = await readCache<Omit<T, 'fromCache' | 'cachedAt'>>(key);
  if (!cached) return null;
  return attachMeta(cached.data, cached.cachedAt);
}

// ─── HTTP core ─────────────────────────────────────────────────────────────────

function buildUrl(path: string, params: Record<string, string | number>): string {
  const url = new URL(path.startsWith('http') ? path : `${BINANCE_BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function binanceGet<TPayload>(
  path: string,
  params: Record<string, string | number>,
  storageKey: string,
  parse: (json: unknown) => TPayload,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<{ payload: TPayload; fromCache: boolean; cachedAt?: number }> {
  const key = cacheKey(storageKey);
  const requestKey = `${path}?${JSON.stringify(params)}`;

  return withDedup(requestKey, async () => {
    await throttle();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(buildUrl(path, params), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json: unknown = await response.json();
      const payload = parse(json);
      await writeCache(key, payload);

      return { payload, fromCache: false };
    } catch (error) {
      const cached = await readCache<TPayload>(key);
      if (cached && Date.now() - cached.cachedAt <= ttlMs * 10) {
        return {
          payload: cached.data,
          fromCache: true,
          cachedAt: cached.cachedAt,
        };
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
}

// ─── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Binance trả nến đang hình thành (chưa đóng) ở cuối mảng — giá/high/low/volume
 * của nó thay đổi từng giây. Nếu chấm điểm trên nến này thì web và APK fetch lệch
 * vài giây sẽ ra RSI/Bollinger/CVD khác nhau → điểm khác → quyết định lật.
 *
 * Loại bỏ nến chưa đóng (closeTime còn ở tương lai so với lúc đọc) để mọi thiết bị
 * chấm trên đúng cùng tập nến đã đóng. Kiểm tra theo Date.now() lúc đọc nên kết quả
 * tự căn khớp ngay cả khi vừa sang nến mới và một bên còn phục vụ cache.
 */
function dropUnclosedCandle(klines: Kline[]): Kline[] {
  if (klines.length === 0) return klines;
  const last = klines[klines.length - 1];
  return last.closeTime > Date.now() ? klines.slice(0, -1) : klines;
}

function parseKlines(json: unknown): Kline[] {
  if (!Array.isArray(json)) return [];
  return json.map((row) => {
    const r = row as (string | number)[];
    return {
      openTime: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
      closeTime: Number(r[6]),
      quoteVolume: Number(r[7]),
      trades: Number(r[8]),
      takerBuyVolume: Number(r[9]),
      takerBuyQuoteVolume: Number(r[10]),
    };
  });
}

function parseOrderBook(json: unknown): Omit<DeepOrderBookResult, 'fromCache' | 'cachedAt'> {
  const o = json as {
    lastUpdateId: number;
    bids: [string, string][];
    asks: [string, string][];
  };
  const toLevel = ([price, qty]: [string, string]): OrderBookLevel => ({
    price: Number(price),
    quantity: Number(qty),
  });
  return {
    symbol: '',
    lastUpdateId: o.lastUpdateId,
    bids: (o.bids ?? []).map(toLevel),
    asks: (o.asks ?? []).map(toLevel),
  };
}

function parseWsForceOrder(
  o: Record<string, string | number>,
  fallbackSymbol: TradeSymbol,
): ForceOrder {
  return {
    symbol: String(o.s ?? fallbackSymbol),
    price: Number(o.p),
    avgPrice: Number(o.ap),
    origQty: Number(o.q),
    executedQty: Number(o.l ?? o.q),
    side: o.S as 'BUY' | 'SELL',
    time: Number(o.T),
    status: String(o.X ?? 'FILLED'),
  };
}

/**
 * Public market liquidation stream — no API key / signature.
 * Binance REST `GET /fapi/v1/forceOrders` is USER_DATA (signed, per-account).
 * Market-wide liquidations moved to WebSocket `{symbol}@forceOrder` (changelog 2021-04-27).
 */
function collectForceOrdersWebSocket(
  symbol: TradeSymbol,
  limit: number,
): Promise<ForceOrder[]> {
  return new Promise((resolve, reject) => {
    const orders: ForceOrder[] = [];
    const stream = `${symbol.toLowerCase()}@forceOrder`;
    let settled = false;

    const finish = (result: ForceOrder[] | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(collectTimer);
      clearTimeout(hardTimer);
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    const ws = new WebSocket(`${BINANCE_WS_BASE}/${stream}`);

    const collectTimer = setTimeout(() => finish(orders), FORCE_ORDERS_WS_COLLECT_MS);
    const hardTimer = setTimeout(
      () => finish(new Error('Force order WebSocket timeout')),
      REQUEST_TIMEOUT_MS,
    );

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          e?: string;
          o?: Record<string, string | number>;
        };
        if (msg.e === 'forceOrder' && msg.o) {
          orders.push(parseWsForceOrder(msg.o, symbol));
          if (orders.length >= limit) finish(orders);
        }
      } catch {
        // skip malformed frames
      }
    };

    ws.onerror = () => finish(new Error('Force order WebSocket error'));
  });
}

function parseOpenInterest(json: unknown): OpenInterestSnapshot {
  const o = json as Record<string, string | number>;
  return {
    openInterest: Number(o.openInterest),
    symbol: String(o.symbol),
    time: Number(o.time),
  };
}

function parseOpenInterestHist(json: unknown): OpenInterestHistPoint[] {
  if (!Array.isArray(json)) return [];
  return json.map((item) => {
    const o = item as Record<string, string | number>;
    return {
      symbol: String(o.symbol),
      sumOpenInterest: Number(o.sumOpenInterest),
      sumOpenInterestValue: Number(o.sumOpenInterestValue),
      timestamp: Number(o.timestamp),
    };
  });
}

function parseFundingRates(json: unknown): FundingRateRecord[] {
  if (!Array.isArray(json)) return [];
  return json.map((item) => {
    const o = item as Record<string, string | number>;
    return {
      symbol: String(o.symbol),
      fundingRate: Number(o.fundingRate),
      fundingTime: Number(o.fundingTime),
      markPrice: Number(o.markPrice ?? 0),
    };
  });
}

function parseLongShortRatio(json: unknown): LongShortRatioPoint[] {
  if (!Array.isArray(json)) return [];
  return json.map((item) => {
    const o = item as Record<string, string | number>;
    return {
      symbol: String(o.symbol ?? ''),
      longAccount: Number(o.longAccount ?? 0),
      shortAccount: Number(o.shortAccount ?? 0),
      longShortRatio: Number(o.longShortRatio ?? 1),
      timestamp: Number(o.timestamp ?? 0),
    };
  });
}

function parseTickerPrice(json: unknown): number {
  const o = json as Record<string, string>;
  return Number(o.price);
}

function parseBookTicker(json: unknown): Omit<BookTickerResult, 'symbol' | 'fromCache' | 'cachedAt'> {
  const o = json as Record<string, string>;
  const bidPrice = Number(o.bidPrice);
  const askPrice = Number(o.askPrice);
  return {
    bidPrice,
    bidQty: Number(o.bidQty),
    askPrice,
    askQty: Number(o.askQty),
    spread: askPrice - bidPrice,
  };
}

function computeDeltaOI(history: OpenInterestHistPoint[]): number {
  if (history.length < 2) return 0;
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const first = sorted[0].sumOpenInterest;
  const last = sorted[sorted.length - 1].sumOpenInterest;
  return last - first;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Binance trả ascending — đảo để mới nhất ở index 0. */
export function fundingRatesNewestFirst(records: FundingRateRecord[]): number[] {
  return [...records]
    .sort((a, b) => b.fundingTime - a.fundingTime)
    .map((r) => r.fundingRate);
}

/**
 * Tính metrics từ mảng funding rate — index 0 = mới nhất.
 * Dùng cho L6 nâng cao (phase sau); không thay đổi scoring hiện tại.
 */
export function calculateFundingMetrics(rates: number[]): FundingMetrics | null {
  if (rates.length === 0) return null;

  const fundingCurrent = rates[0];
  const window8 = rates.slice(0, Math.min(8, rates.length));
  const window16 = rates.slice(0, Math.min(16, rates.length));
  const fundingAvg8 = average(window8);
  const fundingAvg16 = average(window16);

  return {
    fundingCurrent,
    fundingAvg8,
    fundingAvg16,
    fundingVelocity: fundingCurrent - fundingAvg8,
    fundingAcceleration: fundingAvg8 - fundingAvg16,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function fetchKlines(
  symbol: TradeSymbol,
  timeframe: Timeframe,
  limit = 200,
): Promise<KlinesResult> {
  const storageKey = `klines:${symbol}:${timeframe}:${limit}`;

  const { payload, fromCache, cachedAt } = await binanceGet(
    '/fapi/v1/klines',
    { symbol, interval: timeframe, limit },
    storageKey,
    parseKlines,
  );

  return {
    symbol,
    timeframe,
    klines: dropUnclosedCandle(payload),
    fromCache,
    cachedAt,
  };
}

/** Lightweight last price — poll every few seconds for near-realtime UI */
export async function fetchTickerPrice(symbol: TradeSymbol): Promise<TickerPriceResult> {
  const storageKey = `ticker:${symbol}`;

  const { payload, fromCache, cachedAt } = await binanceGet(
    '/fapi/v1/ticker/price',
    { symbol },
    storageKey,
    parseTickerPrice,
    TICKER_CACHE_TTL_MS,
  );

  return { symbol, price: payload, fromCache, cachedAt };
}

/** 24h price change percent — used for BTC condition layer on alt pairs */
export async function fetch24hTickerChange(symbol: TradeSymbol): Promise<number> {
  const storageKey = `ticker24h:${symbol}`;

  const { payload, fromCache, cachedAt } = await binanceGet(
    '/fapi/v1/ticker/24hr',
    { symbol },
    storageKey,
    (json) => Number((json as { priceChangePercent: string }).priceChangePercent),
    TICKER_CACHE_TTL_MS,
  );

  return payload;
}

/** Best bid/ask — complements ticker for spread display */
export async function fetchBookTicker(symbol: TradeSymbol): Promise<BookTickerResult> {
  const storageKey = `bookTicker:${symbol}`;

  const { payload, fromCache, cachedAt } = await binanceGet(
    '/fapi/v1/ticker/bookTicker',
    { symbol },
    storageKey,
    parseBookTicker,
    TICKER_CACHE_TTL_MS,
  );

  return { symbol, ...payload, fromCache, cachedAt };
}

export async function fetchDeepOrderBook(symbol: TradeSymbol): Promise<DeepOrderBookResult> {
  const storageKey = `depth:${symbol}:1000`;

  const { payload, fromCache, cachedAt } = await binanceGet(
    '/fapi/v1/depth',
    { symbol, limit: 1000 },
    storageKey,
    parseOrderBook,
    ORDERBOOK_CACHE_TTL_MS,
  );

  return {
    ...payload,
    symbol,
    fromCache,
    cachedAt,
  };
}

/**
 * Market liquidation orders for a symbol (public, no signed headers).
 * Uses WebSocket `@forceOrder` — never sends `X-MBX-APIKEY` or HMAC signature.
 */
export async function fetchForceOrders(
  symbol: TradeSymbol,
  limit = 100,
): Promise<ForceOrdersResult> {
  const storageKey = `forceOrders:${symbol}:${limit}`;
  const key = cacheKey(storageKey);

  return withDedup(`forceOrders:ws:${symbol}:${limit}`, async () => {
    await throttle();

    const cached = await readCache<ForceOrder[]>(key);
    if (cached && Date.now() - cached.cachedAt <= FORCE_ORDERS_CACHE_TTL_MS) {
      return {
        symbol,
        orders: cached.data.slice(0, limit),
        fromCache: true,
        cachedAt: cached.cachedAt,
      };
    }

    try {
      const orders = await collectForceOrdersWebSocket(symbol, limit);
      await writeCache(key, orders);
      return { symbol, orders: orders.slice(0, limit), fromCache: false };
    } catch (error) {
      if (cached) {
        return {
          symbol,
          orders: cached.data.slice(0, limit),
          fromCache: true,
          cachedAt: cached.cachedAt,
        };
      }
      throw error;
    }
  });
}

export async function fetchOIEngine(
  symbol: TradeSymbol,
  period: StatsPeriod = '5m',
  limit = 30,
): Promise<OIEngineResult> {
  const storageKey = `oiEngine:${symbol}:${period}:${limit}`;

  return withDedup(storageKey, async () => {
    await throttle();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const [oiRes, histRes] = await Promise.all([
        fetch(buildUrl('/fapi/v1/openInterest', { symbol }), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        }),
        fetch(
          buildUrl('/futures/data/openInterestHist', {
            symbol,
            period,
            limit,
          }),
          { signal: controller.signal, headers: { Accept: 'application/json' } },
        ),
      ]);

      if (!oiRes.ok) throw new Error(`openInterest HTTP ${oiRes.status}`);
      if (!histRes.ok) throw new Error(`openInterestHist HTTP ${histRes.status}`);

      const current = parseOpenInterest(await oiRes.json());
      const history = parseOpenInterestHist(await histRes.json());

      const payload: Omit<OIEngineResult, 'fromCache' | 'cachedAt'> = {
        symbol,
        current,
        history,
        deltaOI: computeDeltaOI(history),
      };

      await writeCache(cacheKey(storageKey), payload);

      return { ...payload, fromCache: false };
    } catch (error) {
      const fallback = await loadFromCache<OIEngineResult>(cacheKey(storageKey), (data, cachedAt) => ({
        ...data,
        fromCache: true,
        cachedAt,
      }));
      if (fallback) return fallback;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
}

async function fetchFundingRateHistoryResult(
  symbol: TradeSymbol,
  limit = FUNDING_RATE_HISTORY_LIMIT,
): Promise<FundingRateHistoryResult> {
  const storageKey = `fundingRate:${symbol}:${limit}`;

  const { payload, fromCache, cachedAt } = await binanceGet(
    '/fapi/v1/fundingRate',
    { symbol, limit },
    storageKey,
    parseFundingRates,
  );

  const records = [...payload].sort((a, b) => a.fundingTime - b.fundingTime);

  return {
    symbol,
    records,
    fromCache,
    cachedAt,
  };
}

/**
 * Lấy 16 funding rate gần nhất — mới nhất ở index 0.
 * Fail → null + warning (fallback L6 dùng fundingCurrent từ snapshot hiện có).
 */
export async function fetchFundingRateHistory(symbol: TradeSymbol): Promise<number[] | null> {
  try {
    const result = await fetchFundingRateHistoryResult(symbol, FUNDING_RATE_HISTORY_LIMIT);
    const rates = fundingRatesNewestFirst(result.records);
    return rates.length > 0 ? rates : null;
  } catch {
    console.warn('funding_history_fetch_failed');
    return null;
  }
}

/**
 * Tỉ lệ Long/Short từ tài khoản top trader Binance Futures.
 * Endpoint: /futures/data/topLongShortAccountRatio (no auth, market-wide).
 */
export async function fetchLongShortRatio(
  symbol: TradeSymbol,
  period: StatsPeriod = '1h',
  limit = 30,
): Promise<LongShortRatioResult> {
  const storageKey = `lsRatio:${symbol}:${period}:${limit}`;

  const { payload, fromCache, cachedAt } = await binanceGet(
    '/futures/data/topLongShortAccountRatio',
    { symbol, period, limit },
    storageKey,
    parseLongShortRatio,
  );

  const sorted = [...payload].sort((a, b) => a.timestamp - b.timestamp);
  const ratio = sorted.length > 0 ? sorted[sorted.length - 1].longShortRatio : 1;

  return {
    symbol,
    ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
    history: sorted,
    fromCache,
    cachedAt,
  };
}

export async function fetchAllMarketData(
  symbol: TradeSymbol,
  klineLimit = 220,
  fundingLimit = FUNDING_RATE_HISTORY_LIMIT,
  oiPeriod: StatsPeriod = '5m',
  lsPeriod: StatsPeriod = '1h',
  mtfKlineLimit = 80,
): Promise<AllMarketData> {
  const klineTasks = TIMEFRAMES.map((tf) => ({
    tf,
    limit: tf === '5m' || tf === '15m' ? mtfKlineLimit : klineLimit,
    promise: fetchKlines(symbol, tf, tf === '5m' || tf === '15m' ? mtfKlineLimit : klineLimit),
  }));

  const [klineSettled, otherSettled] = await Promise.all([
    Promise.allSettled(klineTasks.map((t) => t.promise)),
    Promise.allSettled([
      fetchDeepOrderBook(symbol),
      fetchForceOrders(symbol),
      fetchOIEngine(symbol, oiPeriod),
      fetchFundingRateHistoryResult(symbol, fundingLimit),
      fetchLongShortRatio(symbol, lsPeriod),
    ]),
  ]);

  const klines: KlinesByTimeframe = {};
  const errors: Partial<Record<string, string>> = {};
  let anyFromCache = false;

  klineTasks.forEach(({ tf }, i) => {
    const result = klineSettled[i];
    if (result.status === 'fulfilled') {
      klines[tf] = result.value;
      if (result.value.fromCache) anyFromCache = true;
    } else {
      errors[`klines:${tf}`] = String(result.reason);
    }
  });

  const [orderBookResult, forceOrdersResult, oiEngineResult, fundingResult, lsRatioResult] =
    otherSettled;

  if (fundingResult.status === 'rejected') {
    console.warn('funding_history_fetch_failed');
  }

  const unwrap = <T extends CacheMeta>(
    result: PromiseSettledResult<T>,
    key: string,
  ): T | null => {
    if (result.status === 'fulfilled') {
      if (result.value.fromCache) anyFromCache = true;
      return result.value;
    }
    errors[key] = String(result.reason);
    return null;
  };

  return {
    symbol,
    fetchedAt: Date.now(),
    fromCache: anyFromCache,
    klines,
    orderBook: unwrap(orderBookResult, 'orderBook'),
    forceOrders: unwrap(forceOrdersResult, 'forceOrders'),
    oiEngine: unwrap(oiEngineResult, 'oiEngine'),
    fundingHistory: unwrap(fundingResult, 'fundingHistory'),
    longShortRatio: unwrap(lsRatioResult, 'longShortRatio'),
    errors,
  };
}

/** Reset throttle state — for tests only */
export function __resetApiGuardForTests(): void {
  lastRequestAt = 0;
  inflightRequests.clear();
}

export { fetchAnalysisDataForSymbol } from './symbolAnalysisFetch';
export type { SymbolAnalysisResult } from './symbolAnalysisFetch';

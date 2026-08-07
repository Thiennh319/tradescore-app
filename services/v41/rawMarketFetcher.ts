import { BINANCE_BASE_URL, type TradeSymbol } from '../../constants/scoring';
import { fetchKlines, fetchTickerPrice, type Kline } from '../binanceApi';

export interface KlineV41 {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuyVolume: number;
  closeTime: number;
}

export interface RawMarketSnapshot {
  symbol: string;
  klines: KlineV41[];
  btcKlines: KlineV41[];
  klines30M: KlineV41[];
  klines1H: KlineV41[];
  btcKlines1H: KlineV41[];
  fetchedAt: number;
  fundingRate?: number;
  /**
   * Giá gần realtime cho UI / Trade Session Current+PnL.
   * Không dùng close nến 4H đã đóng (có thể đứng đến ~4h).
   */
  liveMarkPrice?: number;
}

const KLINES_INTERVAL = '4h' as const;
const KLINES_LIMIT = 250;
const KLINES_LIMIT_MTF = 100;
const CLOSED_CANDLE_BUFFER_MS = 1000;

/** Chuyển mảng raw Binance klines → KlineV41. */
export function adaptBinanceKline(raw: (string | number)[]): KlineV41 {
  return {
    openTime: Number(raw[0]),
    open: parseFloat(String(raw[1])),
    high: parseFloat(String(raw[2])),
    low: parseFloat(String(raw[3])),
    close: parseFloat(String(raw[4])),
    volume: parseFloat(String(raw[5])),
    takerBuyVolume: parseFloat(String(raw[9])),
    closeTime: Number(raw[6]),
  };
}

function binanceKlineToV41(kline: Kline): KlineV41 {
  return {
    openTime: kline.openTime,
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
    volume: kline.volume,
    takerBuyVolume: kline.takerBuyVolume ?? 0,
    closeTime: kline.closeTime,
  };
}

/** Chỉ giữ nến đã đóng: closeTime < now − 1s. */
export function filterClosedKlinesV41(klines: KlineV41[]): KlineV41[] {
  const cutoff = Date.now() - CLOSED_CANDLE_BUFFER_MS;
  return klines.filter((k) => k.closeTime < cutoff);
}

/** Close của nến đang chạy — chỉ khi closeTime còn ở tương lai (nến chưa đóng). */
export function resolveFormingCandleClose(klinesIncludingOpen: KlineV41[]): number | undefined {
  const last = klinesIncludingOpen.at(-1);
  if (last == null || !Number.isFinite(last.close) || last.close <= 0) return undefined;
  if (!(last.closeTime > Date.now())) return undefined;
  return last.close;
}

/**
 * Ưu tiên ticker price; fallback close nến 4H đang chạy (chưa đóng).
 * Không dùng close nến 4H đã đóng làm live mark.
 */
export function resolveLiveMarkPrice(params: {
  tickerPrice?: number | null;
  formingFourHClose?: number | null;
}): number | undefined {
  const ticker = params.tickerPrice;
  if (ticker != null && Number.isFinite(ticker) && ticker > 0) return ticker;
  const forming = params.formingFourHClose;
  if (forming != null && Number.isFinite(forming) && forming > 0) return forming;
  return undefined;
}

/**
 * Fetch ngắn 4H **giữ** nến đang chạy — không qua fetchKlines (đã dropUnclosedCandle).
 * Chỉ gọi khi ticker fail để recover live mark.
 */
export async function fetchFormingFourHCloseV41(symbol: TradeSymbol): Promise<number | undefined> {
  try {
    const url =
      `${BINANCE_BASE_URL}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}` +
      `&interval=4h&limit=2`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) return undefined;
    const bars = (json as (string | number)[][]).map(adaptBinanceKline);
    return resolveFormingCandleClose(bars);
  } catch (error) {
    console.error(`[v41] fetchFormingFourHCloseV41 failed for ${symbol}:`, error);
    return undefined;
  }
}

async function fetchClosedKlinesV41(
  symbol: TradeSymbol,
  interval: '30m' | '1h',
  limit: number,
): Promise<KlineV41[]> {
  try {
    const result = await fetchKlines(symbol, interval, limit);
    return filterClosedKlinesV41(result.klines.map(binanceKlineToV41));
  } catch (error) {
    console.error(`[v41] fetchClosedKlinesV41 failed for ${symbol} ${interval}:`, error);
    return [];
  }
}

async function fetchFundingRateV41(symbol: TradeSymbol): Promise<number | undefined> {
  try {
    const url = `${BINANCE_BASE_URL}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) return undefined;

    const row = json[0] as Record<string, unknown>;
    const rate = parseFloat(String(row.fundingRate));
    return Number.isFinite(rate) ? rate : undefined;
  } catch (error) {
    console.error(`[v41] fetchFundingRate failed for ${symbol}:`, error);
    return undefined;
  }
}

/**
 * Fetch klines 4H symbol + BTCUSDT song song (limit 250).
 * Bước 0 — Raw Market Data Layer (V4.1).
 */
export async function fetchRawMarketV41(symbol: string): Promise<RawMarketSnapshot> {
  const tradeSymbol = symbol as TradeSymbol;

  try {
    const [symbolResult, btcResult, klines30M, klines1H, btcKlines1H, fundingRate, tickerResult] =
      await Promise.all([
      fetchKlines(tradeSymbol, KLINES_INTERVAL, KLINES_LIMIT),
      fetchKlines('BTCUSDT', KLINES_INTERVAL, KLINES_LIMIT),
      fetchClosedKlinesV41(tradeSymbol, '30m', KLINES_LIMIT_MTF),
      fetchClosedKlinesV41(tradeSymbol, '1h', KLINES_LIMIT_MTF),
      fetchClosedKlinesV41('BTCUSDT', '1h', KLINES_LIMIT_MTF),
      fetchFundingRateV41(tradeSymbol),
      fetchTickerPrice(tradeSymbol).catch((error) => {
        console.error(`[v41] fetchTickerPrice failed for ${symbol}:`, error);
        return null;
      }),
    ]);

    const symbolKlinesAll = symbolResult.klines.map(binanceKlineToV41);
    const klines = filterClosedKlinesV41(symbolKlinesAll);
    const btcKlines = filterClosedKlinesV41(btcResult.klines.map(binanceKlineToV41));

    const tickerPrice =
      tickerResult?.price != null && Number.isFinite(tickerResult.price) && tickerResult.price > 0
        ? tickerResult.price
        : null;

    // fetchKlines() đã dropUnclosedCandle — close “cuối” thường là nến đã đóng, không phải forming.
    let formingFourHClose = resolveFormingCandleClose(symbolKlinesAll);
    if (tickerPrice == null && formingFourHClose == null) {
      formingFourHClose = await fetchFormingFourHCloseV41(tradeSymbol);
    }

    const liveMarkPrice = resolveLiveMarkPrice({
      tickerPrice,
      formingFourHClose,
    });

    if (liveMarkPrice == null) {
      console.warn(
        `[v41] liveMarkPrice unavailable for ${symbol}: ticker=${tickerPrice ?? 'fail'} ` +
          `forming4H=${formingFourHClose ?? 'fail'} — scan will fall back to closed-4H close (may stale ≤4h)`,
      );
    } else if (tickerPrice == null) {
      console.warn(
        `[v41] liveMarkPrice for ${symbol} using forming-4H close=${liveMarkPrice} ` +
          `(ticker failed/unavailable)`,
      );
    }

    return {
      symbol: tradeSymbol,
      klines,
      btcKlines,
      klines30M,
      klines1H,
      btcKlines1H,
      fundingRate,
      liveMarkPrice,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`fetchRawMarketV41 failed for ${symbol}: ${detail}`);
  }
}

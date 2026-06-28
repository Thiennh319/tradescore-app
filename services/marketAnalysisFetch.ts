import type { AnalysisTimeframe, AppTradeSymbol } from '../constants/scoring';
import {
  fetch24hTickerChange,
  fetchAllMarketData,
  fetchTickerPrice,
  statsPeriodFor,
  type AllMarketData,
  type TickerPriceResult,
} from './binanceApi';

/** Tham số fetch thống nhất — Signal Board, EXE Web, APK phải cùng pipeline. */
export const MARKET_KLINE_LIMIT = 220;
export const MARKET_KLINE_LIMIT_MTF = 80;
export const MARKET_LS_DEPTH = 12;

/** BTC 24h % — luôn dùng ticker API (không ước lượng từ klines). */
export async function fetchBtcChange24hPct(): Promise<number> {
  try {
    return await fetch24hTickerChange('BTCUSDT');
  } catch {
    return 0;
  }
}

export interface MarketFetchBundle {
  market: AllMarketData;
  ticker: TickerPriceResult;
  btcChange24h: number;
}

/** Fetch market + giá + BTC 24h — cùng statsPeriod theo khung phân tích. */
export async function fetchMarketAnalysisBundle(
  symbol: AppTradeSymbol,
  timeframe: AnalysisTimeframe,
): Promise<MarketFetchBundle> {
  const [market, ticker, btcChange24h] = await Promise.all([
    fetchAllMarketData(
      symbol,
      MARKET_KLINE_LIMIT,
      MARKET_LS_DEPTH,
      statsPeriodFor(timeframe),
      '1h',
      MARKET_KLINE_LIMIT_MTF,
    ),
    fetchTickerPrice(symbol),
    fetchBtcChange24hPct(),
  ]);
  return { market, ticker, btcChange24h };
}

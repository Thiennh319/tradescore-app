/**
 * Build BookTicker-compatible view from depth top-of-book (Unified scan already has depth).
 * Avoids a separate /ticker/bookTicker request when shared snapshot is used.
 */
import type { AppTradeSymbol } from '../constants/scoring';
import type { AllMarketData, BookTickerResult } from './binanceApi';

export function bookTickerFromMarketDepth(
  symbol: AppTradeSymbol,
  market: AllMarketData,
): BookTickerResult | null {
  const book = market.orderBook;
  const bid = book?.bids[0];
  const ask = book?.asks[0];
  if (bid == null || ask == null) return null;
  if (!(bid.price > 0) || !(ask.price > 0)) return null;
  return {
    symbol,
    bidPrice: bid.price,
    bidQty: bid.quantity,
    askPrice: ask.price,
    askQty: ask.quantity,
    spread: ask.price - bid.price,
    fromCache: market.fromCache,
    cachedAt: market.orderBook?.cachedAt,
  };
}

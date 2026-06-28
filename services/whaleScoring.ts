import type { TradeDirection } from '../constants/scoring';
import { isWhaleActiveInMarket, type WhaleMarketMode } from './whaleMarketBehavior';

/** Supporting signal only — must not dominate EMA, structure, funding, or risk filters. */
export const WHALE_ALIGN_BONUS_MAX = 0.5;

export const WHALE_TRADE_MIN_USD = 100_000;

export function scoreL13WhaleDelta(
  direction: TradeDirection,
  whaleOrderDeltaUsd: number,
  marketMode?: WhaleMarketMode | string,
): { score: number; groupBlock: string | null } {
  if (marketMode != null && !isWhaleActiveInMarket(marketMode)) {
    return { score: 0, groupBlock: null };
  }

  if (Math.abs(whaleOrderDeltaUsd) < WHALE_TRADE_MIN_USD) {
    return { score: 0, groupBlock: null };
  }

  const bearish = whaleOrderDeltaUsd < 0;
  const bullish = whaleOrderDeltaUsd > 0;

  if (direction === 'SHORT' && bearish) {
    return { score: WHALE_ALIGN_BONUS_MAX, groupBlock: null };
  }
  if (direction === 'LONG' && bullish) {
    return { score: WHALE_ALIGN_BONUS_MAX, groupBlock: null };
  }

  return {
    score: 0,
    groupBlock: `L13 Whale Delta ngược hướng ${direction} ($${whaleOrderDeltaUsd.toFixed(0)})`,
  };
}

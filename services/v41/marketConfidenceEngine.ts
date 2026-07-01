import type { TrendDirection } from './types';

export type BTCStrengthBand = 'STRONG' | 'WEAK' | 'SIDEWAY';

export interface BTCContext {
  btcDirection: TrendDirection;
  btcStrengthBand: BTCStrengthBand;
}

/**
 * Theo V4.1_FORMULAS.md Engine 4 — BTCAlignmentFactor (0.5-1.0).
 * altDirection: hướng trend của coin đang xét (từ Engine 1)
 * btc: context BTC tự tính riêng trong V4.1
 */
export function resolveBTCAlignmentFactor(
  altDirection: TrendDirection,
  btc: BTCContext,
): number {
  if (altDirection === 'NEUTRAL') return 0.7; // tương đương BTC sideway

  const sameDirection =
    (altDirection === 'BULL' && btc.btcDirection === 'BULL') ||
    (altDirection === 'BEAR' && btc.btcDirection === 'BEAR');

  if (sameDirection && btc.btcStrengthBand === 'STRONG') return 1.0;
  if (sameDirection && btc.btcStrengthBand !== 'STRONG') return 0.8;
  if (btc.btcDirection === 'NEUTRAL' || btc.btcStrengthBand === 'SIDEWAY')
    return 0.7;
  return 0.5; // ngược hướng
}

/**
 * Engine 4 — Market Confidence (0-100).
 * Theo V4.1_FORMULAS.md Engine 4:
 * MarketConfidence = TrendStrength × (1 - TrendExhaustion/100)
 *                    × BTCAlignmentFactor
 * Clamp 0-100.
 */
export function calculateMarketConfidence(
  trendStrength: number,
  trendExhaustion: number,
  altDirection: TrendDirection,
  btc: BTCContext,
): {
  marketConfidence: number;
  btcAlignmentFactor: number;
} {
  const btcAlignmentFactor = resolveBTCAlignmentFactor(altDirection, btc);
  const raw =
    trendStrength * (1 - trendExhaustion / 100) * btcAlignmentFactor;
  const marketConfidence = Math.min(100, Math.max(0, raw));
  return { marketConfidence, btcAlignmentFactor };
}

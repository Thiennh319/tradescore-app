import type { KlineV41 } from './indicators';
import { calculateTrendStrength } from './trendStrengthEngine';
import type { TrendDirection } from './types';

export type BtcStrengthBand = 'strong' | 'moderate' | 'weak' | 'none';

export interface BTCContext {
  btcTrendStrength: number;
  btcDirection: TrendDirection;
  btcStrengthBand: BtcStrengthBand;
  btcAlignmentFactor: number;
}

const MIN_KLINES_FOR_BTC_CONTEXT = 220;
const DEFAULT_BTC_ALIGNMENT_FACTOR = 0.75;

const FALLBACK_BTC_CONTEXT: BTCContext = {
  btcTrendStrength: 50,
  btcDirection: 'NEUTRAL',
  btcStrengthBand: 'none',
  btcAlignmentFactor: DEFAULT_BTC_ALIGNMENT_FACTOR,
};

function clamp0100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Map btcTrendStrength → strength band.
 * ≥80 strong · 50–79 moderate · 25–49 weak · <25 none
 */
export function resolveBtcStrengthBand(btcTrendStrength: number): BtcStrengthBand {
  if (btcTrendStrength >= 80) return 'strong';
  if (btcTrendStrength >= 50) return 'moderate';
  if (btcTrendStrength >= 25) return 'weak';
  return 'none';
}

/**
 * Build BTC context từ klines BTCUSDT 4H.
 * Engine 1 scoring (EMA alignment + ADX + EMA50 slope) qua calculateTrendStrength.
 * btcAlignmentFactor cố định 0.75 — orchestrator tính theo alt direction sau.
 */
export function buildBTCContext(btcKlines4H: KlineV41[]): BTCContext {
  if (btcKlines4H.length < MIN_KLINES_FOR_BTC_CONTEXT) {
    return { ...FALLBACK_BTC_CONTEXT };
  }

  const { trendStrength, trendDirection } = calculateTrendStrength(btcKlines4H);
  const btcTrendStrength = clamp0100(trendStrength);

  return {
    btcTrendStrength,
    btcDirection: trendDirection,
    btcStrengthBand: resolveBtcStrengthBand(btcTrendStrength),
    btcAlignmentFactor: DEFAULT_BTC_ALIGNMENT_FACTOR,
  };
}

import type { MarketState, TrendDirection } from './types';

export interface MarketStateInput {
  trendStrength: number;
  trendExhaustion: number;
  trendDirection: TrendDirection;
  volumeDivergencePts: 0 | 20;
}

/**
 * Market State Engine — 15 rules waterfall (dừng rule đầu tiên khớp).
 * Theo V4.1_FORMULAS.md Market State.
 */
export function calculateMarketState(params: MarketStateInput): MarketState {
  const {
    trendStrength: ts,
    trendExhaustion: ex,
    trendDirection: dir,
    volumeDivergencePts: vol,
  } = params;

  // Rule 1
  if (dir === 'NEUTRAL' || ts < 25) {
    return 'Transition';
  }

  if (dir === 'BULL') {
    // Rule 2
    if (ts >= 80 && ex < 40) return 'StrongUptrend';
    // Rule 3
    if (ts >= 80 && ex >= 70 && vol === 20) return 'Distribution';
    // Rule 4
    if (ts >= 80 && ex >= 70) return 'LateUptrend';
    // Rule 5
    if (ts >= 50 && ex < 70) return 'HealthyUptrend';
    // Rule 6
    if (ts >= 25 && ex >= 70) return 'LateUptrend';
    // Rule 7
    if (ts >= 25 && ex < 70) return 'HealthyUptrend';
  }

  if (dir === 'BEAR') {
    // Rule 8
    if (ts >= 80 && ex < 40) return 'StrongDowntrend';
    // Rule 9
    if (ts >= 80 && ex >= 70) return 'Accumulation';
    // Rule 10
    if (ts >= 50 && ts <= 79 && ex >= 70 && vol === 20) return 'Accumulation';
    // Rule 11
    if (ts >= 50 && ts <= 79 && ex >= 70 && vol !== 20) return 'WeakDowntrend';
    // Rule 12
    if (ts >= 50 && ex < 70) return 'WeakDowntrend';
    // Rule 13
    if (ts >= 25 && ex >= 70) return 'Accumulation';
    // Rule 14
    if (ts >= 25 && ex < 70) return 'WeakDowntrend';
  }

  // Rule 15
  return 'Transition';
}

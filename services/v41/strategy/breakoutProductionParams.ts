/**
 * SSOT — production Confirm-B params for every symbol on
 * `SYMBOLS_USING_BREAKOUT_STRATEGY`.
 *
 * Validated on XRP (V41-XRP-1 / XRP-2): NEAR default + dedupe occupancy-B.
 * Do NOT swap in sweep near-miss combos (e.g. WIDTH=3 / TP1_RR=2.5) — those
 * fail concentration / small-n gates.
 *
 * Per-symbol overrides are intentionally absent: XRP must not inherit a
 * leftover SOL research combo (SOL was never on the allow-list anyway).
 */

import {
  BREAKOUT_RETEST_BAND_PCT,
  BREAKOUT_RETEST_MAX_BARS,
  BREAKOUT_TP1_RR,
  type ScanBreakoutParams,
} from '../breakoutDetector';

/** Max hold / signal max-age (1H bars) — also used as level-dedupe TIMEOUT ceiling. */
export const BREAKOUT_PRODUCTION_MAX_HOLD_1H = 80;

export const BREAKOUT_PRODUCTION_PARAMS = {
  lookbackN: 20,
  consolidationMode: 'width' as const,
  maxWidthPct: 5,
  confirmMode: 'retest' as const,
  slMode: 'atr_break_level' as const,
  atrMult: 1,
  requireStrongBreakout: false,
  retestMaxBars: BREAKOUT_RETEST_MAX_BARS, // 10
  retestBandPct: BREAKOUT_RETEST_BAND_PCT, // 0.005
  tp1Rr: BREAKOUT_TP1_RR, // 1.5
  dedupeByBrokenLevel: true,
  maxHoldBarsForLevelDedupe: BREAKOUT_PRODUCTION_MAX_HOLD_1H,
} as const satisfies Omit<ScanBreakoutParams, 'klines1H'>;

/** Build scan params for the live RC3 breakout path (NEAR + XRP). */
export function buildProductionBreakoutScanParams(
  klines1H: ScanBreakoutParams['klines1H'],
): ScanBreakoutParams {
  return {
    klines1H,
    ...BREAKOUT_PRODUCTION_PARAMS,
  };
}

/**
 * V4.1 symbol → strategy routing (Phương án B).
 * Wired into scanV41 (Path A off) + buildRc3ViewModelFromRow (breakout adapter).
 */

export type V41SymbolStrategy = 'trend_reversal' | 'breakout';

/**
 * Symbols that use Confirm B + ATR SL breakout instead of Trend Reversal.
 * Keep explicit allow-list — default remains trend_reversal.
 *
 * V41-XRP-3: add XRPUSDT (NEAR default + dedupe). SOLUSDT was never on this
 * list (V41-SOL-4: OOS âm → stay trend_reversal).
 */
export const SYMBOLS_USING_BREAKOUT_STRATEGY: readonly string[] = [
  'NEARUSDT',
  'XRPUSDT',
];

export function resolveSymbolStrategy(symbol: string): V41SymbolStrategy {
  const normalized = symbol.trim().toUpperCase();
  if (SYMBOLS_USING_BREAKOUT_STRATEGY.includes(normalized)) {
    return 'breakout';
  }
  return 'trend_reversal';
}

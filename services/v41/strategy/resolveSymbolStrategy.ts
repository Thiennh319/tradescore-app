/**
 * V4.1 symbol → strategy routing (Phương án B).
 * Pure lookup — chưa wire vào scan / buildRc3ViewModelFromRow.
 */

export type V41SymbolStrategy = 'trend_reversal' | 'breakout';

/**
 * Symbols that use Confirm B + ATR SL breakout instead of Trend Reversal.
 * Keep explicit allow-list — default remains trend_reversal.
 */
export const SYMBOLS_USING_BREAKOUT_STRATEGY: readonly string[] = ['NEARUSDT'];

export function resolveSymbolStrategy(symbol: string): V41SymbolStrategy {
  const normalized = symbol.trim().toUpperCase();
  if (SYMBOLS_USING_BREAKOUT_STRATEGY.includes(normalized)) {
    return 'breakout';
  }
  return 'trend_reversal';
}

import { describe, expect, it } from 'vitest';
import {
  resolveSymbolStrategy,
  SYMBOLS_USING_BREAKOUT_STRATEGY,
} from '../resolveSymbolStrategy';

describe('resolveSymbolStrategy', () => {
  it('maps NEARUSDT → breakout', () => {
    expect(resolveSymbolStrategy('NEARUSDT')).toBe('breakout');
  });

  it('is case-insensitive for NEAR', () => {
    expect(resolveSymbolStrategy('nearusdt')).toBe('breakout');
    expect(resolveSymbolStrategy(' NearUSDT ')).toBe('breakout');
  });

  it('maps other RC3 symbols → trend_reversal', () => {
    expect(resolveSymbolStrategy('BTCUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('SOLUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('BNBUSDT')).toBe('trend_reversal');
  });

  it('defaults unknown symbols to trend_reversal', () => {
    expect(resolveSymbolStrategy('ADAUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('')).toBe('trend_reversal');
  });

  it('allow-list is explicit NEAR only', () => {
    expect(SYMBOLS_USING_BREAKOUT_STRATEGY).toEqual(['NEARUSDT']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  resolveSymbolStrategy,
  SYMBOLS_USING_BREAKOUT_STRATEGY,
} from '../resolveSymbolStrategy';

describe('resolveSymbolStrategy', () => {
  it('maps NEARUSDT → breakout', () => {
    expect(resolveSymbolStrategy('NEARUSDT')).toBe('breakout');
  });

  it('maps XRPUSDT → breakout (V41-XRP-3 production allow-list)', () => {
    expect(resolveSymbolStrategy('XRPUSDT')).toBe('breakout');
    expect(resolveSymbolStrategy('xrpusdt')).toBe('breakout');
    expect(resolveSymbolStrategy(' XrpUSDT ')).toBe('breakout');
  });

  it('is case-insensitive for NEAR', () => {
    expect(resolveSymbolStrategy('nearusdt')).toBe('breakout');
    expect(resolveSymbolStrategy(' NearUSDT ')).toBe('breakout');
  });

  it('maps other RC3 symbols → trend_reversal (SOL never on breakout allow-list)', () => {
    expect(resolveSymbolStrategy('BTCUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('SOLUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('BNBUSDT')).toBe('trend_reversal');
  });

  it('defaults unknown symbols to trend_reversal', () => {
    expect(resolveSymbolStrategy('ADAUSDT')).toBe('trend_reversal');
    expect(resolveSymbolStrategy('')).toBe('trend_reversal');
  });

  it('allow-list is NEAR + XRP (SOL not present)', () => {
    expect(SYMBOLS_USING_BREAKOUT_STRATEGY).toEqual(['NEARUSDT', 'XRPUSDT']);
    expect(SYMBOLS_USING_BREAKOUT_STRATEGY).not.toContain('SOLUSDT');
  });
});

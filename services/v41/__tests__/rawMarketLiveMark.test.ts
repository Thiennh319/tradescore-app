import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterClosedKlinesV41,
  resolveFormingCandleClose,
  resolveLiveMarkPrice,
  type KlineV41,
} from '../rawMarketFetcher';

function kline(partial: Partial<KlineV41> & Pick<KlineV41, 'openTime' | 'closeTime' | 'close'>): KlineV41 {
  return {
    open: partial.close,
    high: partial.close,
    low: partial.close,
    volume: 1,
    takerBuyVolume: 0.5,
    ...partial,
  };
}

describe('resolveLiveMarkPrice / forming candle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers ticker over forming 4H close', () => {
    expect(
      resolveLiveMarkPrice({ tickerPrice: 1.635, formingFourHClose: 1.642 }),
    ).toBe(1.635);
  });

  it('ticker fail → falls back to forming close (not closed-only)', () => {
    expect(
      resolveLiveMarkPrice({ tickerPrice: null, formingFourHClose: 1.635 }),
    ).toBe(1.635);
  });

  it('forming close only when candle still open (closeTime > now)', () => {
    const now = Date.now();
    const closed = kline({
      openTime: now - 8 * 3600_000,
      closeTime: now - 4 * 3600_000 - 60_000,
      close: 1.642,
    });
    const forming = kline({
      openTime: now - 4 * 3600_000,
      closeTime: now + 60_000,
      close: 1.635,
    });
    const all = [closed, forming];
    expect(filterClosedKlinesV41(all).at(-1)?.close).toBe(1.642);
    expect(resolveFormingCandleClose(all)).toBe(1.635);
  });

  it('rejects last closed bar as forming (fetchKlines dropUnclosed case)', () => {
    const now = Date.now();
    const closedOnly = [
      kline({
        openTime: now - 8 * 3600_000,
        closeTime: now - 60_000,
        close: 1.642,
      }),
    ];
    expect(resolveFormingCandleClose(closedOnly)).toBeUndefined();
    expect(
      resolveLiveMarkPrice({ tickerPrice: null, formingFourHClose: resolveFormingCandleClose(closedOnly) }),
    ).toBeUndefined();
  });

  it('ticker + forming both fail → undefined (caller may fall back to closed-4H with warn)', () => {
    expect(
      resolveLiveMarkPrice({ tickerPrice: null, formingFourHClose: null }),
    ).toBeUndefined();
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearKeyLevelsCache,
  getKeyLevels,
  getKeyLevelsCached,
  type KeyLevel,
} from './indicators';
import type { Kline } from './binanceApi';

const emaStub = {
  ema20: 99,
  ema50: 98,
  ema200: 95,
  priceVsEma20: 'above' as const,
  priceVsEma50: 'above' as const,
  priceVsEma200: 'above' as const,
  alignment: 'BULLISH' as const,
};

function makeKline(price: number, openTime: number): Kline {
  return {
    openTime,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume: 1000,
    closeTime: openTime + 3_600_000,
    quoteVolume: 1000,
    trades: 100,
    takerBuyBaseVolume: 500,
    takerBuyQuoteVolume: 500,
  };
}

/** 50 nến 1H quanh 100 — đủ cho swing detection */
function sampleKlines(center = 100): Kline[] {
  return Array.from({ length: 50 }, (_, i) =>
    makeKline(center + (i % 5) - 2, 1_700_000_000_000 + i * 3_600_000),
  );
}

function manyWhaleWalls(count: number, currentPrice: number) {
  const bidWalls = Array.from({ length: count }, (_, i) => ({
    price: currentPrice - (i + 1) * 0.5,
    distancePct: -((i + 1) * 0.5),
    multiplier: 12,
  }));
  const askWalls = Array.from({ length: count }, (_, i) => ({
    price: currentPrice + (i + 1) * 0.5,
    distancePct: (i + 1) * 0.5,
    multiplier: 12,
  }));
  return { bidWalls, askWalls };
}

describe('getKeyLevelsCached', () => {
  beforeEach(() => {
    clearKeyLevelsCache();
  });

  it('cache hit giữ tối đa 8 support/resistance sau merge whale walls', () => {
    const symbol = 'BTCUSDT';
    const klines1h = sampleKlines(100);
    const klines4h = sampleKlines(100);
    const whaleWalls = manyWhaleWalls(12, 100);

    getKeyLevelsCached(symbol, klines1h, klines4h, 100, emaStub, emaStub, whaleWalls);

    const cached = getKeyLevelsCached(
      symbol,
      klines1h,
      klines4h,
      100.5,
      emaStub,
      emaStub,
      manyWhaleWalls(12, 100.5),
    );

    expect(cached.supports.length).toBeLessThanOrEqual(8);
    expect(cached.resistances.length).toBeLessThanOrEqual(8);
    expect(cached.supports.every((s: KeyLevel) => s.price < 100.5)).toBe(true);
    expect(cached.resistances.every((r: KeyLevel) => r.price > 100.5)).toBe(true);
  });

  it('cache miss trả cùng format với getKeyLevels', () => {
    const klines1h = sampleKlines(100);
    const klines4h = sampleKlines(100);
    const whaleWalls = manyWhaleWalls(3, 100);
    const fresh = getKeyLevels(klines1h, klines4h, 100, emaStub, emaStub, whaleWalls);
    clearKeyLevelsCache();
    const cached = getKeyLevelsCached(
      'ETHUSDT',
      klines1h,
      klines4h,
      100,
      emaStub,
      emaStub,
      whaleWalls,
    );
    expect(cached.supports.length).toBe(fresh.supports.length);
    expect(cached.resistances.length).toBe(fresh.resistances.length);
  });
});

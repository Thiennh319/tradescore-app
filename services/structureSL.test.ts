import { describe, expect, it } from 'vitest';
import type { Kline } from './binanceApi';
import {
  STRUCTURE_SL_DEFAULTS,
  calculateStructureSL,
  findRecentSwingHigh,
  findRecentSwingLow,
  resolveStructureSlLookback,
  resolveStructureSlMinCandlesBack,
} from './structureSL';

function makeKline(
  index: number,
  low: number,
  high: number,
  overrides: Partial<Kline> = {},
): Kline {
  const mid = (low + high) / 2;
  return {
    openTime: index * 3_600_000,
    open: mid,
    high,
    low,
    close: mid,
    volume: 1_000,
    closeTime: index * 3_600_000 + 3_599_999,
    quoteVolume: mid * 1_000,
    trades: 50,
    ...overrides,
  };
}

/** Tạo chuỗi nến phẳng, chèn swing low tại pivotIndex. */
function klinesWithSwingLow(pivotIndex: number, pivotLow: number, total = 30): Kline[] {
  const baseLow = pivotLow + 5;
  const baseHigh = baseLow + 10;
  const klines: Kline[] = [];
  for (let i = 0; i < total; i += 1) {
    if (i === pivotIndex) {
      klines.push(makeKline(i, pivotLow, pivotLow + 8));
    } else {
      klines.push(makeKline(i, baseLow, baseHigh));
    }
  }
  return klines;
}

/** Tạo chuỗi nến phẳng, chèn swing high tại pivotIndex. */
function klinesWithSwingHigh(pivotIndex: number, pivotHigh: number, total = 30): Kline[] {
  const baseLow = 80;
  const baseHigh = 100;
  const klines: Kline[] = [];
  for (let i = 0; i < total; i += 1) {
    if (i === pivotIndex) {
      klines.push(makeKline(i, pivotHigh - 8, pivotHigh));
    } else {
      klines.push(makeKline(i, baseLow, baseHigh));
    }
  }
  return klines;
}

describe('findRecentSwingLow', () => {
  it('tìm swing low gần nhất trong lookback', () => {
    const klines = klinesWithSwingLow(20, 90);
    const swing = findRecentSwingLow(klines);
    expect(swing).not.toBeNull();
    expect(swing!.price).toBe(90);
    expect(swing!.type).toBe('LOW');
    expect(swing!.index).toBe(20);
  });
});

describe('findRecentSwingHigh', () => {
  it('tìm swing high gần nhất trong lookback', () => {
    const klines = klinesWithSwingHigh(20, 120);
    const swing = findRecentSwingHigh(klines);
    expect(swing).not.toBeNull();
    expect(swing!.price).toBe(120);
    expect(swing!.type).toBe('HIGH');
  });
});

describe('resolveStructureSlLookback', () => {
  it('ADX 40 → lookback 40', () => {
    expect(resolveStructureSlLookback(40)).toBe(40);
  });

  it('ADX 30 → lookback 30', () => {
    expect(resolveStructureSlLookback(30)).toBe(30);
  });

  it('ADX 20 → lookback 20', () => {
    expect(resolveStructureSlLookback(20)).toBe(20);
  });

  it('ADX undefined → lookback 20', () => {
    expect(resolveStructureSlLookback(undefined)).toBe(20);
  });
});

describe('resolveStructureSlMinCandlesBack', () => {
  it('ADX ≥ 35 → MIN_CANDLES_BACK 2', () => {
    expect(resolveStructureSlMinCandlesBack(46)).toBe(2);
  });

  it('ADX < 35 → MIN_CANDLES_BACK 3', () => {
    expect(resolveStructureSlMinCandlesBack(30)).toBe(3);
  });
});

describe('calculateStructureSL', () => {
  const entryPrice = 100;
  const bufferPct = STRUCTURE_SL_DEFAULTS.BUFFER_PCT;

  it('LONG: swing low hợp lệ → dùng structure', () => {
    const klines = klinesWithSwingLow(20, 95);
    const atrSL = 96;
    const result = calculateStructureSL({
      direction: 'LONG',
      entryPrice,
      atrSL,
      klines4H: klines,
      bufferPct,
    });

    const expectedStructureSL = 95 * (1 - bufferPct / 100);
    expect(result.slSource).toBe('STRUCTURE');
    expect(result.swingPrice).toBe(95);
    // Capped: swing SL thô ~94.72 vượt MAX_STRUCTURE_SL_PCT 3.5%
    // → capped tại entry × (1 − 0.035) = 96.5
    expect(expectedStructureSL).toBeCloseTo(94.715, 2);
    expect(result.slPrice).toBeCloseTo(96.5, 6);
    expect(result.candlesBack).toBe(klines.length - 1 - 20);
    expect(result.candlesBack).toBeGreaterThanOrEqual(STRUCTURE_SL_DEFAULTS.MIN_CANDLES_BACK);
  });

  it('LONG: swing low > entry sau buffer → fallback ATR', () => {
    const klines = klinesWithSwingLow(20, 102);
    const atrSL = 88;
    const result = calculateStructureSL({
      direction: 'LONG',
      entryPrice,
      atrSL,
      klines4H: klines,
    });

    expect(result.slSource).toBe('ATR_FALLBACK');
    expect(result.slPrice).toBe(atrSL);
    expect(result.swingPrice).toBe(0);
  });

  it('LONG: không có swing → fallback ATR', () => {
    const flat = Array.from({ length: 10 }, (_, i) => makeKline(i, 95, 105));
    const atrSL = 87;
    const result = calculateStructureSL({
      direction: 'LONG',
      entryPrice,
      atrSL,
      klines4H: flat,
      lookback: 8,
    });

    expect(result.slSource).toBe('ATR_FALLBACK');
    expect(result.slPrice).toBe(atrSL);
    expect(result.candlesBack).toBe(0);
  });

  it('SHORT: swing high hợp lệ → dùng structure', () => {
    const klines = klinesWithSwingHigh(20, 112);
    const atrSL = 110;
    const result = calculateStructureSL({
      direction: 'SHORT',
      entryPrice,
      atrSL,
      klines4H: klines,
      bufferPct,
    });

    const expectedStructureSL = 112 * (1 + bufferPct / 100);
    expect(result.slSource).toBe('STRUCTURE');
    expect(result.swingPrice).toBe(112);
    // Capped: swing SL thô ~112.34 vượt MAX_STRUCTURE_SL_PCT 3.5%
    // → capped tại entry × (1 + 0.035) = 103.5
    expect(expectedStructureSL).toBeCloseTo(112.336, 2);
    expect(result.slPrice).toBeCloseTo(103.5, 6);
  });

  it('SHORT: swing high < entry sau buffer → fallback ATR', () => {
    const klines = klinesWithSwingHigh(20, 98);
    const atrSL = 112;
    const result = calculateStructureSL({
      direction: 'SHORT',
      entryPrice,
      atrSL,
      klines4H: klines,
    });

    expect(result.slSource).toBe('ATR_FALLBACK');
    expect(result.slPrice).toBe(atrSL);
  });

  it('LONG: structure xa hơn ATR → lấy structure', () => {
    const klines = klinesWithSwingLow(20, 92);
    const atrSL = 94;
    const result = calculateStructureSL({
      direction: 'LONG',
      entryPrice,
      atrSL,
      klines4H: klines,
      bufferPct,
    });

    const structureSL = 92 * (1 - bufferPct / 100);
    expect(result.slSource).toBe('STRUCTURE');
    // Capped: swing low 92 → SL thô ~91.72 vượt MAX_STRUCTURE_SL_PCT 3.5%
    // → capped tại entry × (1 − 0.035) = 96.5 (thay vì min(structure, atrSL)=91.72)
    expect(structureSL).toBeCloseTo(91.724, 2);
    expect(result.slPrice).toBeCloseTo(96.5, 6);
  });

  it('LONG: ATR xa hơn structure → lấy ATR', () => {
    const klines = klinesWithSwingLow(20, 96);
    const atrSL = 88;
    const result = calculateStructureSL({
      direction: 'LONG',
      entryPrice,
      atrSL,
      klines4H: klines,
      bufferPct,
    });

    expect(result.slSource).toBe('STRUCTURE');
    const structureSL = 96 * (1 - bufferPct / 100);
    expect(structureSL).toBeGreaterThan(atrSL);
    // min(structure ~95.71, atrSL 88) = 88, nhưng cap 3.5% đẩy lên entry × (1 − 0.035) = 96.5
    expect(result.slPrice).toBeCloseTo(96.5, 6);
  });

  it('ADX 40 mở rộng lookback 40 — tìm swing xa hơn (trước đó ATR_FALLBACK)', () => {
    const klines = klinesWithSwingHigh(10, 112, 50);
    const atrSL = 110;

    const weakTrend = calculateStructureSL({
      direction: 'SHORT',
      entryPrice,
      atrSL,
      klines4H: klines,
      adxValue: 20,
    });
    expect(weakTrend.slSource).toBe('ATR_FALLBACK');

    const strongTrend = calculateStructureSL({
      direction: 'SHORT',
      entryPrice,
      atrSL,
      klines4H: klines,
      adxValue: 40,
    });
    expect(strongTrend.slSource).toBe('STRUCTURE');
    expect(strongTrend.swingPrice).toBe(112);
  });
});

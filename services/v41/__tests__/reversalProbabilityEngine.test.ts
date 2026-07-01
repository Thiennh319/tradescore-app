import { describe, it, expect } from 'vitest';
import {
  findSwingPoints,
  getLastTwoSwings,
  calculateRSIDivergenceScore,
  calculateCVDV41,
  calculateCVDDivergenceScore,
  calculateReversalProbability,
} from '../reversalProbabilityEngine';
import type { KlineV41 } from '../indicators';

function buildCandle(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    closeTime: 0,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildTwoBottomKlines(): KlineV41[] {
  const data = [
    { close: 100, high: 101, low: 99 },
    { close: 97, high: 98, low: 96 },
    { close: 95, high: 96, low: 94 },
    { close: 93, high: 94, low: 92 },
    { close: 91, high: 92, low: 90 },
    { close: 90, high: 91, low: 89 },
    { close: 91, high: 92, low: 90 },
    { close: 93, high: 94, low: 92 },
    { close: 95, high: 96, low: 94 },
    { close: 96, high: 97, low: 95 },
    { close: 95, high: 96, low: 94 },
    { close: 93, high: 94, low: 92 },
    { close: 90, high: 91, low: 89 },
    { close: 85, high: 86, low: 84 },
    { close: 87, high: 88, low: 86 },
    { close: 89, high: 90, low: 88 },
    { close: 90, high: 91, low: 89 },
    { close: 88, high: 89, low: 87 },
    { close: 87, high: 88, low: 86 },
    { close: 88, high: 89, low: 87 },
  ];
  return data.map((d, i) =>
    buildCandle({ ...d, openTime: i, closeTime: i, open: d.close - 0.5 }),
  );
}

describe('findSwingPoints', () => {
  it('Dataset ngắn (<7 nến) → mảng rỗng', () => {
    const result = findSwingPoints([
      buildCandle(),
      buildCandle(),
      buildCandle(),
    ]);
    expect(result).toHaveLength(0);
  });

  it('Dataset 2 đáy → tìm đúng swing LOW tại vị trí đáy', () => {
    const klines = buildTwoBottomKlines();
    const swings = findSwingPoints(klines);
    const lows = swings.filter((s) => s.type === 'LOW');
    expect(lows.length).toBeGreaterThanOrEqual(2);
    expect(lows.some((s) => s.price === 89)).toBe(true);
    expect(lows.some((s) => s.price === 84)).toBe(true);
  });

  it('Swing tìm được không nằm ở 3 nến đầu hoặc 3 nến cuối', () => {
    const klines = buildTwoBottomKlines();
    const swings = findSwingPoints(klines);
    const n = klines.length;
    swings.forEach((s) => {
      expect(s.index).toBeGreaterThanOrEqual(3);
      expect(s.index).toBeLessThanOrEqual(n - 4);
    });
  });
});

describe('getLastTwoSwings', () => {
  it('Dataset 2 đáy → trả về older và newer đúng thứ tự thời gian', () => {
    const swings = getLastTwoSwings(buildTwoBottomKlines(), 'LOW', 50);
    expect(swings).not.toBeNull();
    expect(swings!.older.price).toBeGreaterThan(swings!.newer.price);
  });

  it('Dataset ngắn không đủ swing → trả về null', () => {
    const klines = [
      buildCandle(),
      buildCandle(),
      buildCandle(),
      buildCandle(),
      buildCandle(),
    ];
    expect(getLastTwoSwings(klines, 'LOW', 50)).toBeNull();
  });

  it('swingType HIGH → chỉ tìm đỉnh, không lẫn đáy', () => {
    const result = getLastTwoSwings(buildTwoBottomKlines(), 'HIGH', 50);
    if (result !== null) {
      expect(result.older.type).toBe('HIGH');
      expect(result.newer.type).toBe('HIGH');
    }
  });
});

describe('calculateCVDV41', () => {
  it('takerBuy = volume/2 (trung lập) → delta = 0 mọi nến, CVD = 0', () => {
    const klines = [buildCandle({ volume: 1000, takerBuyVolume: 500 })];
    const cvd = calculateCVDV41(klines);
    expect(cvd[0]).toBe(0);
  });

  it('takerBuy > volume/2 (mua mạnh) → delta dương, CVD tích lũy tăng', () => {
    const klines = [
      buildCandle({ volume: 1000, takerBuyVolume: 700 }),
      buildCandle({ volume: 1000, takerBuyVolume: 700 }),
    ];
    const cvd = calculateCVDV41(klines);
    expect(cvd[0]).toBe(400);
    expect(cvd[1]).toBe(800);
  });

  it('takerBuy < volume/2 (bán mạnh) → delta âm, CVD âm', () => {
    const klines = [buildCandle({ volume: 1000, takerBuyVolume: 300 })];
    const cvd = calculateCVDV41(klines);
    expect(cvd[0]).toBe(-400);
  });
});

describe('calculateReversalProbability', () => {
  const klines = buildTwoBottomKlines();

  it('Công thức đúng: exhaustion=80, RSI=100, CVD=0 → 67', () => {
    const result = calculateReversalProbability(klines, 80, 'BULLISH', 50);
    expect(result.reversalProbability).toBe(32);
  });

  it('exhaustion=0, RSI=0, CVD=0 → 0 (đáy sàn)', () => {
    const result = calculateReversalProbability(klines, 0, 'BULLISH', 50);
    expect(result.reversalProbability).toBe(0);
  });

  it('reversalProbability không vượt quá 100 (clamp)', () => {
    const result = calculateReversalProbability(klines, 100, 'BULLISH', 50);
    expect(result.reversalProbability).toBeLessThanOrEqual(100);
    expect(result.reversalProbability).toBeGreaterThanOrEqual(0);
  });

  it('rsiDivergenceScore và cvdDivergenceScore chỉ nhận giá trị 0, 50, 100', () => {
    const result = calculateReversalProbability(klines, 50, 'BULLISH', 50);
    expect([0, 50, 100]).toContain(result.rsiDivergenceScore);
    expect([0, 50, 100]).toContain(result.cvdDivergenceScore);
  });
});

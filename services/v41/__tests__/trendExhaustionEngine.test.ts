import { describe, it, expect } from 'vitest';
import {
  calculateRSIExtremeScore,
  calculateDistanceEMA20Score,
  calculateVolumeDivergenceScore,
  calculateCandleStreakScore,
  calculateTrendExhaustion,
} from '../trendExhaustionEngine';
import type { KlineV41 } from '../indicators';

function buildCandle(
  overrides: Partial<KlineV41> = {},
): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    closeTime: 0,
    takerBuyVolume: 500, // 50% trung lập — không dùng trong test này
    ...overrides,
  };
}

function buildUptrendKlines(
  count: number,
  options: { lastVolume?: number; baseVolume?: number } = {},
): KlineV41[] {
  const { lastVolume, baseVolume = 1000 } = options;
  const klines: KlineV41[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + i;
    const isLast = i === count - 1;
    klines.push(
      buildCandle({
        openTime: i,
        open: close - 1,
        high: close + 0.5,
        low: close - 1.5,
        close,
        volume: isLast && lastVolume !== undefined ? lastVolume : baseVolume,
        closeTime: i,
      }),
    );
  }
  return klines;
}

function buildStreakKlines(count: number, color: 'green' | 'red'): KlineV41[] {
  const klines: KlineV41[] = [];
  for (let i = 0; i < count; i++) {
    const open = 100;
    const close = color === 'green' ? 102 : 98;
    klines.push(
      buildCandle({ openTime: i, open, close, closeTime: i }),
    );
  }
  return klines;
}

function buildExhaustedUptrendKlines(count: number): KlineV41[] {
  // Uptrend mạnh liên tục, volume nến cuối yếu — mô phỏng đúng
  // dataset đã dùng ở Đoạn 5c (15 nến xanh tăng mạnh, vol cuối thấp)
  const klines: KlineV41[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + i * 3; // tăng mạnh để RSI cao, distance EMA20 lớn
    const isLast = i === count - 1;
    klines.push(
      buildCandle({
        openTime: i,
        open: close - 2,
        high: close + 0.5,
        low: close - 2.5,
        close,
        volume: isLast ? 400 : 1000, // nến cuối volume yếu
        closeTime: i,
      }),
    );
  }
  return klines;
}

function buildShortKlines(count: number): KlineV41[] {
  // Quá ngắn, không đủ cho RSI(14) hoặc EMA20
  return buildCandle ? Array.from({ length: count }, (_, i) =>
    buildCandle({ openTime: i, close: 100 + i, closeTime: i }),
  ) : [];
}

describe('calculateRSIExtremeScore', () => {
  it('RSI=80 (>75) → 30', () => {
    expect(calculateRSIExtremeScore(80)).toBe(30);
  });

  it('RSI=75 (đúng biên, KHÔNG >75) → 20', () => {
    expect(calculateRSIExtremeScore(75)).toBe(20);
  });

  it('RSI=50 (trung tính) → 0', () => {
    expect(calculateRSIExtremeScore(50)).toBe(0);
  });

  it('RSI=NaN → 0', () => {
    expect(calculateRSIExtremeScore(NaN)).toBe(0);
  });
});

describe('calculateDistanceEMA20Score', () => {
  it('distance=9% (>8) → 30', () => {
    expect(calculateDistanceEMA20Score(9)).toBe(30);
  });

  it('distance=8% (đúng biên, KHÔNG >8) → 20', () => {
    expect(calculateDistanceEMA20Score(8)).toBe(20);
  });

  it('distance=-9% (âm, |−9|>8) → 30', () => {
    expect(calculateDistanceEMA20Score(-9)).toBe(30);
  });

  it('distance=2% (<3) → 0', () => {
    expect(calculateDistanceEMA20Score(2)).toBe(0);
  });
});

describe('calculateVolumeDivergenceScore', () => {
  it('BULL + new high + volume yếu (<80% MA20) → 20', () => {
    const klines = buildUptrendKlines(25, { lastVolume: 500, baseVolume: 1000 });
    expect(calculateVolumeDivergenceScore(klines, 'BULL')).toBe(20);
  });

  it('BULL + new high + volume mạnh (>=80% MA20) → 0', () => {
    const klines = buildUptrendKlines(25, { lastVolume: 1500, baseVolume: 1000 });
    expect(calculateVolumeDivergenceScore(klines, 'BULL')).toBe(0);
  });

  it('BEAR direction nhưng giá đang uptrend (không new low) → 0', () => {
    const klines = buildUptrendKlines(25, { lastVolume: 500, baseVolume: 1000 });
    expect(calculateVolumeDivergenceScore(klines, 'BEAR')).toBe(0);
  });

  it('NEUTRAL → luôn 0 dù volume yếu', () => {
    const klines = buildUptrendKlines(25, { lastVolume: 500, baseVolume: 1000 });
    expect(calculateVolumeDivergenceScore(klines, 'NEUTRAL')).toBe(0);
  });

  it('Không đủ 21 nến → 0', () => {
    const klines = buildUptrendKlines(15, { lastVolume: 500 });
    expect(calculateVolumeDivergenceScore(klines, 'BULL')).toBe(0);
  });
});

describe('calculateCandleStreakScore', () => {
  it('10 nến xanh liên tiếp → 20', () => {
    expect(calculateCandleStreakScore(buildStreakKlines(10, 'green'))).toBe(20);
  });

  it('6 nến xanh liên tiếp → 12', () => {
    expect(calculateCandleStreakScore(buildStreakKlines(6, 'green'))).toBe(12);
  });

  it('4 nến xanh liên tiếp → 0', () => {
    expect(calculateCandleStreakScore(buildStreakKlines(4, 'green'))).toBe(0);
  });

  it('10 nến đỏ liên tiếp → 20 (không phân biệt xanh/đỏ)', () => {
    expect(calculateCandleStreakScore(buildStreakKlines(10, 'red'))).toBe(20);
  });

  it('Mảng rỗng → 0', () => {
    expect(calculateCandleStreakScore([])).toBe(0);
  });
});

describe('calculateTrendExhaustion', () => {
  it('Dataset exhausted (uptrend mạnh + volume cuối yếu + streak dài) → trendExhaustion cao', () => {
    const klines = buildExhaustedUptrendKlines(25);
    const result = calculateTrendExhaustion(klines, 'BULL');
    expect(result.trendExhaustion).toBeGreaterThan(50);
    expect(result.rsiExtremeScore).toBeGreaterThan(0);
    expect(result.candleStreakScore).toBeGreaterThan(0);
  });

  it('Dataset quá ngắn (thiếu RSI/EMA20) → trả về 0 toàn bộ', () => {
    const klines = buildShortKlines(10); // < 14+1 cho RSI, < 20 cho EMA20
    const result = calculateTrendExhaustion(klines, 'BULL');
    expect(result.trendExhaustion).toBe(0);
    expect(result.rsiExtremeScore).toBe(0);
    expect(result.distanceEMA20Score).toBe(0);
    expect(result.volumeDivergencePts).toBe(0);
    expect(result.candleStreakScore).toBe(0);
  });

  it('trendExhaustion không vượt quá 100 (cap an toàn)', () => {
    const klines = buildExhaustedUptrendKlines(25);
    const result = calculateTrendExhaustion(klines, 'BULL');
    expect(result.trendExhaustion).toBeLessThanOrEqual(100);
  });

  it('volumeDivergencePts chỉ nhận giá trị 0 hoặc 20 (type literal)', () => {
    const klines = buildExhaustedUptrendKlines(25);
    const result = calculateTrendExhaustion(klines, 'BULL');
    expect([0, 20]).toContain(result.volumeDivergencePts);
  });

  it('Tổng 4 thành phần khớp đúng trendExhaustion trả về', () => {
    const klines = buildExhaustedUptrendKlines(25);
    const result = calculateTrendExhaustion(klines, 'BULL');
    const expectedSum = Math.min(
      100,
      result.rsiExtremeScore +
        result.distanceEMA20Score +
        result.volumeDivergencePts +
        result.candleStreakScore,
    );
    expect(result.trendExhaustion).toBe(expectedSum);
  });
});

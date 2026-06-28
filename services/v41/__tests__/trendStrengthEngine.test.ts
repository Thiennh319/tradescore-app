import { describe, it, expect } from 'vitest';
import {
  resolveTrendDirection,
  calculateEMAAlignmentScore,
  calculateADXScore,
  calculateSlopeScore,
  calculateTrendStrength,
} from '../trendStrengthEngine';
import type { KlineV41 } from '../indicators';

function buildPerfectUptrendKlines(count: number): KlineV41[] {
  const klines: KlineV41[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 * Math.pow(1.005, i);
    klines.push({
      openTime: i,
      open: close,
      high: close * 1.005,
      low: close * 0.995,
      close,
      volume: 1000,
      closeTime: i,
      takerBuyVolume: 500, // 50% trung lập — không dùng trong test này
    });
  }
  return klines;
}

function buildNoisyUptrendKlines(count: number): KlineV41[] {
  const klines: KlineV41[] = [];
  for (let i = 0; i < count; i++) {
    const close = 100 + i * 0.3 + Math.sin(i) * 1;
    klines.push({
      openTime: i,
      open: close,
      high: close + 1.5,
      low: close - 1.5,
      close,
      volume: 1000,
      closeTime: i,
      takerBuyVolume: 500, // 50% trung lập — không dùng trong test này
    });
  }
  return klines;
}

function buildFlatKlines(count: number, basePrice: number = 100): KlineV41[] {
  const klines: KlineV41[] = [];
  for (let i = 0; i < count; i++) {
    klines.push({
      openTime: i,
      open: basePrice,
      high: basePrice + 0.5,
      low: basePrice - 0.5,
      close: basePrice,
      volume: 1000,
      closeTime: i,
      takerBuyVolume: 500, // 50% trung lập — không dùng trong test này
    });
  }
  return klines;
}

describe('resolveTrendDirection', () => {
  it('BULL: price > ema20 > ema50', () => {
    expect(resolveTrendDirection(110, 108, 105)).toBe('BULL');
  });

  it('BEAR: price < ema20 < ema50', () => {
    expect(resolveTrendDirection(95, 98, 102)).toBe('BEAR');
  });

  it('NEUTRAL: mâu thuẫn', () => {
    expect(resolveTrendDirection(105, 108, 100)).toBe('NEUTRAL');
  });
});

describe('calculateEMAAlignmentScore', () => {
  it('BULL full stack → 40', () => {
    expect(calculateEMAAlignmentScore('BULL', 110, 108, 105, 100)).toBe(40);
  });

  it('BULL nhưng EMA200 lệch → 30', () => {
    expect(calculateEMAAlignmentScore('BULL', 110, 108, 105, 112)).toBe(30);
  });

  it('NEUTRAL → 0', () => {
    expect(calculateEMAAlignmentScore('NEUTRAL', 105, 108, 100, 95)).toBe(0);
  });
});

describe('calculateADXScore', () => {
  it('ADX=45 (>40) → 35', () => {
    expect(calculateADXScore(45)).toBe(35);
  });

  it('ADX=40 (đúng biên, KHÔNG >40) → 25', () => {
    expect(calculateADXScore(40)).toBe(25);
  });

  it('ADX=25 (đúng biên >=25) → 25', () => {
    expect(calculateADXScore(25)).toBe(25);
  });

  it('ADX=24.9 (dưới biên 25) → 15', () => {
    expect(calculateADXScore(24.9)).toBe(15);
  });

  it('ADX=20 (đúng biên >=20) → 15', () => {
    expect(calculateADXScore(20)).toBe(15);
  });

  it('ADX=19.9 (dưới biên 20) → 0', () => {
    expect(calculateADXScore(19.9)).toBe(0);
  });

  it('ADX=NaN → 0', () => {
    expect(calculateADXScore(NaN)).toBe(0);
  });
});

describe('calculateSlopeScore', () => {
  it('slope=2.5% → 25', () => {
    expect(calculateSlopeScore(2.5)).toBe(25);
  });

  it('slope=-2.5% (âm) → 25', () => {
    expect(calculateSlopeScore(-2.5)).toBe(25);
  });

  it('slope=2.0% (đúng biên, KHÔNG >2) → 15', () => {
    expect(calculateSlopeScore(2.0)).toBe(15);
  });

  it('slope=1.0% (đúng biên >=1) → 15', () => {
    expect(calculateSlopeScore(1.0)).toBe(15);
  });

  it('slope=0.99% (dưới biên 1%) → 8', () => {
    expect(calculateSlopeScore(0.99)).toBe(8);
  });

  it('slope=0.3% (đúng biên >=0.3) → 8', () => {
    expect(calculateSlopeScore(0.3)).toBe(8);
  });

  it('slope=0.29% (dưới biên 0.3%) → 0', () => {
    expect(calculateSlopeScore(0.29)).toBe(0);
  });

  it('slope=NaN → 0', () => {
    expect(calculateSlopeScore(NaN)).toBe(0);
  });
});

describe('calculateTrendStrength', () => {
  it('Dataset hoàn hảo 220 nến uptrend compound → trendStrength=100, BULL', () => {
    const klines = buildPerfectUptrendKlines(220);
    const result = calculateTrendStrength(klines);
    expect(result.trendStrength).toBe(100);
    expect(result.trendDirection).toBe('BULL');
    expect(result.emaAlignmentScore).toBe(40);
    expect(result.adxScore).toBe(35);
    expect(result.slopeScore).toBe(25);
  });

  it('Dataset có nhiễu 220 nến → trendStrength=90, BULL, chỉ slopeScore giảm', () => {
    const klines = buildNoisyUptrendKlines(220);
    const result = calculateTrendStrength(klines);
    expect(result.trendStrength).toBe(90);
    expect(result.trendDirection).toBe('BULL');
    expect(result.emaAlignmentScore).toBe(40);
    expect(result.adxScore).toBe(35);
    expect(result.slopeScore).toBe(15);
  });

  it('Dataset đi ngang (flat) → trendStrength thấp, NEUTRAL hoặc score thấp', () => {
    const klines = buildFlatKlines(220, 100);
    const result = calculateTrendStrength(klines);
    expect(result.trendStrength).toBeLessThan(30);
  });

  it('Dataset quá ngắn (chưa đủ 200 nến cho EMA200) → trả về 0 + NEUTRAL', () => {
    const klines = buildPerfectUptrendKlines(50);
    const result = calculateTrendStrength(klines);
    expect(result.trendStrength).toBe(0);
    expect(result.trendDirection).toBe('NEUTRAL');
  });
});

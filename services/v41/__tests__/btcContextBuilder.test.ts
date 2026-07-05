import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import { calculateTrendStrength } from '../trendStrengthEngine';
import {
  buildBTCContext,
  resolveBtcStrengthBand,
} from '../btcContextBuilder';

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
      takerBuyVolume: 500,
    });
  }
  return klines;
}

function buildPerfectDowntrendKlines(count: number): KlineV41[] {
  const klines: KlineV41[] = [];
  for (let i = 0; i < count; i++) {
    const close = 10_000 * Math.pow(0.995, i);
    klines.push({
      openTime: i,
      open: close,
      high: close * 1.005,
      low: close * 0.995,
      close,
      volume: 1000,
      closeTime: i,
      takerBuyVolume: 500,
    });
  }
  return klines;
}

function buildFlatKlines(count: number, basePrice = 100): KlineV41[] {
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
      takerBuyVolume: 500,
    });
  }
  return klines;
}

describe('resolveBtcStrengthBand', () => {
  it('≥80 → strong', () => {
    expect(resolveBtcStrengthBand(80)).toBe('strong');
    expect(resolveBtcStrengthBand(100)).toBe('strong');
  });

  it('50–79 → moderate', () => {
    expect(resolveBtcStrengthBand(79)).toBe('moderate');
    expect(resolveBtcStrengthBand(50)).toBe('moderate');
  });

  it('25–49 → weak', () => {
    expect(resolveBtcStrengthBand(49)).toBe('weak');
    expect(resolveBtcStrengthBand(25)).toBe('weak');
  });

  it('<25 → none', () => {
    expect(resolveBtcStrengthBand(24)).toBe('none');
    expect(resolveBtcStrengthBand(0)).toBe('none');
  });
});

describe('buildBTCContext', () => {
  it('BULL perfect → BULL, alignmentScore=40', () => {
    const klines = buildPerfectUptrendKlines(220);
    const ctx = buildBTCContext(klines);
    const engine = calculateTrendStrength(klines);

    expect(ctx.btcDirection).toBe('BULL');
    expect(engine.emaAlignmentScore).toBe(40);
    expect(ctx.btcStrengthBand).toBe('strong');
    expect(ctx.btcAlignmentFactor).toBe(0.75);
  });

  it('BEAR klines → BEAR', () => {
    const klines = buildPerfectDowntrendKlines(220);
    const ctx = buildBTCContext(klines);

    expect(ctx.btcDirection).toBe('BEAR');
    expect(ctx.btcTrendStrength).toBeGreaterThan(0);
  });

  it('NEUTRAL klines → NEUTRAL, score=0', () => {
    const klines = buildFlatKlines(220);
    const ctx = buildBTCContext(klines);
    const engine = calculateTrendStrength(klines);

    expect(ctx.btcDirection).toBe('NEUTRAL');
    expect(engine.emaAlignmentScore).toBe(0);
    expect(engine.trendStrength).toBe(0);
    expect(ctx.btcTrendStrength).toBe(0);
    expect(ctx.btcStrengthBand).toBe('none');
  });

  it('klines rỗng → fallback NEUTRAL', () => {
    const ctx = buildBTCContext([]);

    expect(ctx).toEqual({
      btcTrendStrength: 50,
      btcDirection: 'NEUTRAL',
      btcStrengthBand: 'none',
      btcAlignmentFactor: 0.75,
    });
  });

  it('klines < 220 → fallback NEUTRAL', () => {
    const ctx = buildBTCContext(buildPerfectUptrendKlines(100));

    expect(ctx.btcDirection).toBe('NEUTRAL');
    expect(ctx.btcTrendStrength).toBe(50);
    expect(ctx.btcStrengthBand).toBe('none');
  });

  it('btcTrendStrength không vượt 100', () => {
    const ctx = buildBTCContext(buildPerfectUptrendKlines(250));
    expect(ctx.btcTrendStrength).toBeLessThanOrEqual(100);
    expect(ctx.btcTrendStrength).toBe(100);
  });
});

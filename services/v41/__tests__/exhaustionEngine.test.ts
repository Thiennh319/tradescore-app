import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import { computeExhaustion } from '../exhaustionEngine';

function buildKline(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    closeTime: 1,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildFlatKlines(
  count: number,
  overrides: Partial<KlineV41> | ((index: number) => Partial<KlineV41>) = {},
): KlineV41[] {
  return Array.from({ length: count }, (_, index) => {
    const patch = typeof overrides === 'function' ? overrides(index) : overrides;
    return buildKline({ openTime: index, closeTime: index + 1, ...patch });
  });
}

/** 21 nến volume 1000 + nến capitulation: volume ×3, wick dưới dài, close nửa trên. */
function buildCapitulationKlines(count = 22): KlineV41[] {
  const klines = buildFlatKlines(count - 1, { volume: 1000, open: 100, close: 100 });
  klines.push(
    buildKline({
      openTime: count - 1,
      closeTime: count,
      open: 96,
      close: 100,
      high: 101,
      low: 88,
      volume: 3500,
      takerBuyVolume: 1800,
    }),
  );
  return klines;
}

/** 5 nến volume giảm dần. */
function buildVolumeFadeKlines(count = 22): KlineV41[] {
  const klines = buildFlatKlines(count - 5, { volume: 2000, open: 100, close: 100 });
  const fadeVolumes = [1500, 1200, 900, 600, 300];
  for (let i = 0; i < fadeVolumes.length; i++) {
    klines.push(
      buildKline({
        openTime: count - 5 + i,
        closeTime: count - 4 + i,
        volume: fadeVolumes[i],
        open: 100,
        close: 100,
      }),
    );
  }
  return klines;
}

describe('computeExhaustion', () => {
  it('volume ×3 + wick dài + close nửa trên → CAPITULATION, direction LONG', () => {
    const result = computeExhaustion({
      klines1H: buildCapitulationKlines(),
      trendExhaustion: 30,
      trendDirection: 'BEAR',
    });

    expect(result.exhaustionDetected).toBe(true);
    expect(result.exhaustionType).toBe('CAPITULATION');
    expect(result.direction).toBe('LONG');
    expect(result.exhaustionStrength).toBe(80);
    expect(result.confThreshold).toBe(55);
    expect(result.eqThreshold).toBe(75);
    expect(result.tpMultiplier).toBe(1.2);
    expect(result.slMultiplier).toBe(0.8);
  });

  it('volume giảm dần 5 nến + EX≥70 → VOLUME_FADE', () => {
    const result = computeExhaustion({
      klines1H: buildVolumeFadeKlines(),
      trendExhaustion: 75,
      trendDirection: 'BULL',
    });

    expect(result.exhaustionDetected).toBe(true);
    expect(result.exhaustionType).toBe('VOLUME_FADE');
    expect(result.direction).toBe('SHORT');
    expect(result.exhaustionStrength).toBe(65);
    expect(result.confThreshold).toBe(60);
    expect(result.eqThreshold).toBe(80);
    expect(result.tpMultiplier).toBe(1.0);
    expect(result.slMultiplier).toBe(1.0);
  });

  it('funding < -0.03% → FUNDING_EXTREME LONG', () => {
    const result = computeExhaustion({
      klines1H: buildFlatKlines(22),
      trendExhaustion: 20,
      trendDirection: 'BEAR',
      fundingRate: -0.0004,
    });

    expect(result.exhaustionType).toBe('FUNDING_EXTREME');
    expect(result.direction).toBe('LONG');
    expect(result.exhaustionStrength).toBe(75);
    expect(result.confThreshold).toBe(55);
    expect(result.eqThreshold).toBe(75);
  });

  it('funding > +0.03% → FUNDING_EXTREME SHORT', () => {
    const result = computeExhaustion({
      klines1H: buildFlatKlines(22),
      trendExhaustion: 20,
      trendDirection: 'BULL',
      fundingRate: 0.0004,
    });

    expect(result.exhaustionType).toBe('FUNDING_EXTREME');
    expect(result.direction).toBe('SHORT');
    expect(result.exhaustionStrength).toBe(75);
    expect(result.tpMultiplier).toBe(1.2);
    expect(result.slMultiplier).toBe(0.8);
  });

  it('không có gì → NONE', () => {
    const result = computeExhaustion({
      klines1H: buildFlatKlines(22),
      trendExhaustion: 30,
      trendDirection: 'NEUTRAL',
    });

    expect(result.exhaustionDetected).toBe(false);
    expect(result.exhaustionType).toBe('NONE');
    expect(result.direction).toBe('NONE');
    expect(result.exhaustionStrength).toBe(0);
  });

  it('CAPITULATION > FUNDING ưu tiên', () => {
    const result = computeExhaustion({
      klines1H: buildCapitulationKlines(),
      trendExhaustion: 30,
      trendDirection: 'BEAR',
      fundingRate: 0.0005,
    });

    expect(result.exhaustionType).toBe('CAPITULATION');
    expect(result.direction).toBe('LONG');
  });

  it('VOLUME_FADE BEAR trend → direction LONG', () => {
    const result = computeExhaustion({
      klines1H: buildVolumeFadeKlines(),
      trendExhaustion: 80,
      trendDirection: 'BEAR',
    });

    expect(result.exhaustionType).toBe('VOLUME_FADE');
    expect(result.direction).toBe('LONG');
  });

  it('exhaustionStrength đúng theo từng loại', () => {
    expect(
      computeExhaustion({
        klines1H: buildCapitulationKlines(),
        trendExhaustion: 10,
        trendDirection: 'BEAR',
      }).exhaustionStrength,
    ).toBe(80);

    expect(
      computeExhaustion({
        klines1H: buildVolumeFadeKlines(),
        trendExhaustion: 70,
        trendDirection: 'BULL',
      }).exhaustionStrength,
    ).toBe(65);

    expect(
      computeExhaustion({
        klines1H: buildFlatKlines(22),
        trendExhaustion: 10,
        trendDirection: 'BULL',
        fundingRate: -0.0005,
      }).exhaustionStrength,
    ).toBe(75);
  });
});

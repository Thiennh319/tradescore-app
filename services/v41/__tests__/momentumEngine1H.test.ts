import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import { computeMomentum1H } from '../momentumEngine1H';

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

/** 21 nến volume 1000 + nến cuối xanh volume spike. */
function buildBuyVolumeSpikeKlines(count = 22): KlineV41[] {
  const klines = buildFlatKlines(count - 1, { volume: 1000, open: 100, close: 100 });
  klines.push(
    buildKline({
      openTime: count - 1,
      closeTime: count,
      open: 100,
      close: 105,
      high: 106,
      low: 99,
      volume: 2000,
      takerBuyVolume: 1200,
    }),
  );
  return klines;
}

/** 3 nến cuối CVD dương (takerBuy > 50% volume). */
function buildCvdRisingKlines(count = 22): KlineV41[] {
  return buildFlatKlines(count, (index) => {
    if (index >= count - 3) {
      return { volume: 1000, takerBuyVolume: 700, open: 100, close: 100 };
    }
    return { volume: 1000, takerBuyVolume: 500, open: 100, close: 100 };
  });
}

/** 21 nến volume 1000 + nến cuối đỏ volume spike. */
function buildSellVolumeSpikeKlines(count = 22): KlineV41[] {
  const klines = buildFlatKlines(count - 1, { volume: 1000, open: 100, close: 100 });
  klines.push(
    buildKline({
      openTime: count - 1,
      closeTime: count,
      open: 100,
      close: 95,
      high: 101,
      low: 94,
      volume: 2000,
      takerBuyVolume: 400,
    }),
  );
  return klines;
}

/** 3 nến cuối CVD âm (takerBuy < 50% volume). */
function buildCvdFallingKlines(count = 22): KlineV41[] {
  return buildFlatKlines(count, (index) => {
    if (index >= count - 3) {
      return { volume: 1000, takerBuyVolume: 300, open: 100, close: 100 };
    }
    return { volume: 1000, takerBuyVolume: 500, open: 100, close: 100 };
  });
}

/** Cả BUY_VOLUME_SPIKE + CVD_RISING trên cùng bộ klines. */
function buildFullLongMomentumKlines(count = 22): KlineV41[] {
  const klines = buildFlatKlines(count - 1, { volume: 1000, open: 100, close: 100, takerBuyVolume: 500 });
  klines.push(
    buildKline({
      openTime: count - 1,
      closeTime: count,
      open: 100,
      close: 105,
      high: 106,
      low: 99,
      volume: 2000,
      takerBuyVolume: 1400,
    }),
  );
  for (let i = count - 3; i < count - 1; i++) {
    klines[i] = {
      ...klines[i],
      volume: 1000,
      takerBuyVolume: 700,
    };
  }
  return klines;
}

/** Cả SELL_VOLUME_SPIKE + CVD_FALLING. */
function buildFullShortMomentumKlines(count = 22): KlineV41[] {
  const klines = buildFlatKlines(count - 1, { volume: 1000, open: 100, close: 100, takerBuyVolume: 500 });
  klines.push(
    buildKline({
      openTime: count - 1,
      closeTime: count,
      open: 100,
      close: 95,
      high: 101,
      low: 94,
      volume: 2000,
      takerBuyVolume: 200,
    }),
  );
  for (let i = count - 3; i < count - 1; i++) {
    klines[i] = {
      ...klines[i],
      volume: 1000,
      takerBuyVolume: 300,
    };
  }
  return klines;
}

describe('computeMomentum1H', () => {
  it('BUY_VOLUME_SPIKE klines hợp lệ → signalsLong có signal', () => {
    const result = computeMomentum1H(buildBuyVolumeSpikeKlines());

    expect(result.signalsLong).toContain('BUY_VOLUME_SPIKE_1H');
    expect(result.momentumLong).toBeGreaterThanOrEqual(1);
  });

  it('CVD_RISING 3 nến dương → signalsLong có signal', () => {
    const result = computeMomentum1H(buildCvdRisingKlines());

    expect(result.signalsLong).toContain('CVD_RISING_1H');
    expect(result.momentumLong).toBeGreaterThanOrEqual(1);
  });

  it('cả 2 LONG signals → momentumConfirmedLong = true', () => {
    const result = computeMomentum1H(buildFullLongMomentumKlines());

    expect(result.signalsLong).toContain('BUY_VOLUME_SPIKE_1H');
    expect(result.signalsLong).toContain('CVD_RISING_1H');
    expect(result.momentumLong).toBe(2);
    expect(result.momentumConfirmedLong).toBe(true);
  });

  it('chỉ 1 LONG signal → confirmed = false', () => {
    const result = computeMomentum1H(buildBuyVolumeSpikeKlines());

    expect(result.momentumLong).toBe(1);
    expect(result.momentumConfirmedLong).toBe(false);
  });

  it('SELL_VOLUME_SPIKE → SHORT signal', () => {
    const result = computeMomentum1H(buildSellVolumeSpikeKlines());

    expect(result.signalsShort).toContain('SELL_VOLUME_SPIKE_1H');
    expect(result.momentumShort).toBeGreaterThanOrEqual(1);
  });

  it('CVD_FALLING → SHORT signal', () => {
    const result = computeMomentum1H(buildCvdFallingKlines());

    expect(result.signalsShort).toContain('CVD_FALLING_1H');
    expect(result.momentumShort).toBeGreaterThanOrEqual(1);
  });

  it('cả 2 SHORT → momentumConfirmedShort = true', () => {
    const result = computeMomentum1H(buildFullShortMomentumKlines());

    expect(result.signalsShort).toContain('SELL_VOLUME_SPIKE_1H');
    expect(result.signalsShort).toContain('CVD_FALLING_1H');
    expect(result.momentumShort).toBe(2);
    expect(result.momentumConfirmedShort).toBe(true);
  });

  it('klines < 22 → fallback', () => {
    const result = computeMomentum1H(buildFlatKlines(21));

    expect(result).toEqual({
      momentumLong: 0,
      momentumShort: 0,
      momentumConfirmedLong: false,
      momentumConfirmedShort: false,
      signalsLong: [],
      signalsShort: [],
      tpMultiplier: 1.0,
      slMultiplier: 1.0,
    });
  });

  it('tpMultiplier đúng theo score', () => {
    expect(computeMomentum1H(buildFullLongMomentumKlines()).tpMultiplier).toBe(1.3);
    expect(computeMomentum1H(buildBuyVolumeSpikeKlines()).tpMultiplier).toBe(1.1);
    expect(computeMomentum1H(buildFlatKlines(22)).tpMultiplier).toBe(1.0);
  });
});

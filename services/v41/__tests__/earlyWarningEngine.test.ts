import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import { computeRawEarlyWarning } from '../earlyWarningEngine';

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

/** Giá ổn định rồi sập mạnh — close cuối dưới EMA20. */
function buildBelowEma20Klines(count = 25, lastClose = 80): KlineV41[] {
  const klines = buildFlatKlines(count - 1, { close: 100, open: 100 });
  klines.push(
    buildKline({
      openTime: count - 1,
      closeTime: count,
      open: 95,
      high: 96,
      low: lastClose - 1,
      close: lastClose,
    }),
  );
  return klines;
}

/** 3 nến cuối áp lực bán mạnh, giá phẳng trên EMA. */
function buildSellPressureKlines(count = 25): KlineV41[] {
  return buildFlatKlines(count, (index) => ({
    close: 100,
    open: 100,
    volume: 1000,
    takerBuyVolume: index >= count - 3 ? 300 : 500,
  }));
}

/** Volume nến cuối cao hơn MA20 × 1.2. */
function withHighVolumeLast(klines: KlineV41[], volume = 2500): KlineV41[] {
  const copy = klines.map((kline) => ({ ...kline }));
  copy[copy.length - 1] = { ...copy[copy.length - 1], volume };
  return copy;
}

/** Volume nến cuối thấp — không confirm. */
function withLowVolumeLast(klines: KlineV41[], volume = 1000): KlineV41[] {
  const copy = klines.map((kline) => ({ ...kline }));
  copy[copy.length - 1] = { ...copy[copy.length - 1], volume };
  return copy;
}

function compute(params: {
  klines30M?: KlineV41[];
  klines1H?: KlineV41[];
  btcKlines1H?: KlineV41[];
  trendDirection?: 'BULL' | 'BEAR' | 'NEUTRAL';
}) {
  return computeRawEarlyWarning({
    klines30M: params.klines30M ?? [],
    klines1H: params.klines1H ?? [],
    btcKlines1H: params.btcKlines1H ?? [],
    trendDirection: params.trendDirection ?? 'NEUTRAL',
  });
}

describe('computeRawEarlyWarning', () => {
  it('0 tín hiệu → CLEAR', () => {
    const klines30M = buildFlatKlines(25, { close: 100, open: 100 });
    const result = compute({ klines30M, klines1H: buildFlatKlines(25) });

    expect(result.rawSeverity).toBe('CLEAR');
    expect(result.signalCount).toBe(0);
    expect(result.signals30M).toEqual([]);
    expect(result.signals1H).toEqual([]);
  });

  it('klines rỗng → CLEAR', () => {
    const result = compute({});
    expect(result.rawSeverity).toBe('CLEAR');
    expect(result.signalCount).toBe(0);
    expect(result.volumeConfirmed).toBe(false);
  });

  it('PRICE_BELOW_EMA20_30M → WARNING_SOFT', () => {
    const klines30M = withLowVolumeLast(buildBelowEma20Klines());
    const result = compute({ klines30M });

    expect(result.signals30M).toContain('PRICE_BELOW_EMA20_30M');
    expect(result.rawSeverity).toBe('WARNING_SOFT');
    expect(result.volumeConfirmed).toBe(false);
  });

  it('PRICE_BELOW_EMA20_1H + volume thấp → WARNING_SOFT', () => {
    const klines30M = buildFlatKlines(25, { close: 100, volume: 1000 });
    const klines1H = withLowVolumeLast(buildBelowEma20Klines());
    const result = compute({ klines30M, klines1H });

    expect(result.signals1H).toContain('PRICE_BELOW_EMA20_1H');
    expect(result.rawSeverity).toBe('WARNING_SOFT');
    expect(result.volumeConfirmed).toBe(false);
  });

  it('PRICE_BELOW_EMA20_1H + volume cao → WARNING_HARD', () => {
    const klines30M = withHighVolumeLast(buildFlatKlines(25, { close: 100, volume: 1000 }));
    const klines1H = buildBelowEma20Klines();
    const result = compute({ klines30M, klines1H });

    expect(result.signals1H).toContain('PRICE_BELOW_EMA20_1H');
    expect(result.volumeConfirmed).toBe(true);
    expect(result.rawSeverity).toBe('WARNING_HARD');
  });

  it('2 tín hiệu + volume cao → BLOCK', () => {
    const klines30M = withHighVolumeLast(buildBelowEma20Klines());
    const klines1H = buildBelowEma20Klines();
    const result = compute({ klines30M, klines1H });

    expect(result.signalCount).toBeGreaterThanOrEqual(2);
    expect(result.volumeConfirmed).toBe(true);
    expect(result.rawSeverity).toBe('BLOCK');
    expect(result.blockMessage).toContain('không vào lệnh');
  });

  it('2 tín hiệu + volume thấp → WARNING_SOFT (không đủ confirm)', () => {
    const klines30M = withLowVolumeLast(buildBelowEma20Klines());
    const klines1H = buildBelowEma20Klines();
    const result = compute({ klines30M, klines1H });

    expect(result.signalCount).toBeGreaterThanOrEqual(2);
    expect(result.volumeConfirmed).toBe(false);
    expect(result.rawSeverity).toBe('WARNING_SOFT');
  });

  it('BTC_REVERSAL_1H + volume → WARNING_HARD', () => {
    const klines30M = withHighVolumeLast(buildFlatKlines(25, { close: 100, volume: 1000 }));
    const klines1H = buildFlatKlines(25, { close: 100 });
    const btcKlines1H = buildBelowEma20Klines();
    const result = compute({ klines30M, klines1H, btcKlines1H });

    expect(result.signals1H).toContain('BTC_REVERSAL_1H');
    expect(result.volumeConfirmed).toBe(true);
    expect(result.rawSeverity).toBe('WARNING_HARD');
  });

  it('SELL_PRESSURE 3 nến → WARNING_SOFT', () => {
    const klines30M = withLowVolumeLast(buildSellPressureKlines());
    const result = compute({ klines30M });

    expect(result.signals30M).toContain('SELL_PRESSURE_30M');
    expect(result.signals30M).not.toContain('PRICE_BELOW_EMA20_30M');
    expect(result.rawSeverity).toBe('WARNING_SOFT');
  });

  it("direction BULL → 'LONG'", () => {
    const result = compute({
      klines30M: buildFlatKlines(25),
      trendDirection: 'BULL',
    });
    expect(result.direction).toBe('LONG');
  });

  it("direction BEAR → 'SHORT'", () => {
    const result = compute({
      klines30M: buildFlatKlines(25),
      trendDirection: 'BEAR',
    });
    expect(result.direction).toBe('SHORT');
  });
});

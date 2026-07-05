import { describe, expect, it } from 'vitest';
import type { Kline } from './binanceApi';
import {
  VWAP_DEFAULTS,
  calculateVWAP,
  getVWAPEntrySignal,
} from './vwapService';

const SESSION_START = Date.UTC(2026, 6, 3, 0, 0, 0);

function sessionKline(
  offsetMinutes: number,
  high: number,
  low: number,
  close: number,
  volume = 1_000,
): Kline {
  const openTime = SESSION_START + offsetMinutes * 60_000;
  return {
    openTime,
    open: close,
    high,
    low,
    close,
    volume,
    closeTime: openTime + 899_999,
    quoteVolume: close * volume,
    trades: 10,
  };
}

function flatSessionKlines(count: number, price = 100, volume = 1_000): Kline[] {
  return Array.from({ length: count }, (_, i) =>
    sessionKline(i * 15, price + 1, price - 1, price, volume),
  );
}

describe('calculateVWAP', () => {
  it('klines hợp lệ → vwap > 0, bands đúng thứ tự', () => {
    const klines = [
      sessionKline(0, 102, 98, 100),
      sessionKline(15, 104, 100, 102),
      sessionKline(30, 106, 102, 104),
      sessionKline(45, 108, 104, 106),
      sessionKline(60, 110, 106, 108),
    ];
    const result = calculateVWAP(klines, 108);

    expect(result).not.toBeNull();
    expect(result!.vwap).toBeGreaterThan(0);
    expect(result!.lowerBand2).toBeLessThanOrEqual(result!.lowerBand1);
    expect(result!.lowerBand1).toBeLessThanOrEqual(result!.vwap);
    expect(result!.vwap).toBeLessThanOrEqual(result!.upperBand1);
    expect(result!.upperBand1).toBeLessThanOrEqual(result!.upperBand2);
    expect(result!.candleCount).toBe(5);
    expect(result!.sessionStart).toBe(SESSION_START);
  });

  it('klines rỗng → null', () => {
    expect(calculateVWAP([], 100)).toBeNull();
  });

  it('< 5 nến trong ngày → null', () => {
    const klines = flatSessionKlines(4);
    expect(calculateVWAP(klines, 100)).toBeNull();
  });

  it('zone NEAR_VWAP khi giá ≈ vwap', () => {
    const klines = flatSessionKlines(6, 200);
    const result = calculateVWAP(klines, 200.5);
    expect(result?.zone).toBe('NEAR_VWAP');
    expect(result?.isNearVwap).toBe(true);
  });

  it('zone ABOVE_BAND2 khi giá cao', () => {
    const klines = flatSessionKlines(6, 100);
    const result = calculateVWAP(klines, 150);
    expect(result?.zone).toBe('ABOVE_BAND2');
  });
});

describe('getVWAPEntrySignal', () => {
  it('LONG IDEAL khi isNearVwap', () => {
    const klines = flatSessionKlines(6, 100);
    const vwap = calculateVWAP(klines, 100)!;
    const signal = getVWAPEntrySignal(vwap, 'LONG');
    expect(signal.quality).toBe('IDEAL');
    expect(signal.suggestedEntry).toBe(vwap.vwap);
    expect(signal.entryReason).toContain('VWAP');
  });

  it('LONG POOR khi dưới lowerBand2', () => {
    const klines = flatSessionKlines(6, 100);
    const vwap = calculateVWAP(klines, 50)!;
    expect(vwap.zone).toBe('BELOW_BAND2');
    const signal = getVWAPEntrySignal(vwap, 'LONG');
    expect(signal.quality).toBe('POOR');
    expect(signal.suggestedEntry).toBeNull();
  });

  it('SHORT IDEAL khi isNearVwap', () => {
    const klines = flatSessionKlines(6, 80);
    const vwap = calculateVWAP(klines, 80.2)!;
    const signal = getVWAPEntrySignal(vwap, 'SHORT');
    expect(signal.quality).toBe('IDEAL');
    expect(signal.suggestedEntry).toBe(vwap.vwap);
  });
});

describe('isPullingBackToVwap', () => {
  it('true khi giá trên VWAP trong ngưỡng pullback (không near)', () => {
    const klines = flatSessionKlines(6, 100);
    const price = 100 * (1 + 1.5 / 100);
    const result = calculateVWAP(klines, price);
    expect(result?.isNearVwap).toBe(false);
    expect(result?.priceVsVwap).toBeGreaterThan(0);
    expect(Math.abs(result!.priceVsVwap)).toBeLessThanOrEqual(
      VWAP_DEFAULTS.PULLBACK_THRESHOLD_PCT,
    );
    expect(result?.isPullingBackToVwap).toBe(true);
  });

  it('LONG GOOD khi pullback về VWAP từ trên', () => {
    const klines = flatSessionKlines(6, 100);
    const price = 100 * (1 + 1.2 / 100);
    const vwap = calculateVWAP(klines, price)!;
    const signal = getVWAPEntrySignal(vwap, 'LONG');
    expect(signal.quality).toBe('GOOD');
    expect(signal.suggestedEntry).toBe(vwap.vwap);
  });
});

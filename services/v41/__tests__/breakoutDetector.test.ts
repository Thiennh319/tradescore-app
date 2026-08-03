import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import {
  barTouchesLevel,
  buildBreakoutLevels,
  computeDonchianRange,
  detectBreakoutAtIndex,
  findRetestBarIndex,
  isStrongBreakoutCandle,
  isWidthConsolidation,
  tryImmediateBreakoutSetup,
  tryRetestBreakoutSetup,
} from '../breakoutDetector';

function k(
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
  takerBuyVolume = 50,
): KlineV41 {
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume,
    closeTime: openTime + 3_599_999,
    takerBuyVolume,
  };
}

/** Flat-ish range then optional breakout candle. */
function buildRangeSeries(opts: {
  n: number;
  mid?: number;
  halfWidth?: number;
  breakout?: 'up' | 'down' | null;
}): KlineV41[] {
  const mid = opts.mid ?? 100;
  const hw = opts.halfWidth ?? 1;
  const out: KlineV41[] = [];
  const t0 = 1_700_000_000_000;
  for (let i = 0; i < opts.n; i++) {
    out.push(
      k(
        t0 + i * 3_600_000,
        mid,
        mid + hw,
        mid - hw,
        mid + (i % 2 === 0 ? hw * 0.2 : -hw * 0.2),
        100,
        50,
      ),
    );
  }
  if (opts.breakout === 'up') {
    const i = opts.n;
    out.push(
      k(t0 + i * 3_600_000, mid + hw, mid + hw * 3, mid + hw * 0.5, mid + hw * 2.5, 200, 180),
    );
  } else if (opts.breakout === 'down') {
    const i = opts.n;
    out.push(
      k(t0 + i * 3_600_000, mid - hw, mid - hw * 0.5, mid - hw * 3, mid - hw * 2.5, 200, 20),
    );
  }
  return out;
}

describe('computeDonchianRange', () => {
  it('computes high/low and widthPct over last N', () => {
    const series = buildRangeSeries({ n: 20, mid: 100, halfWidth: 2 });
    const range = computeDonchianRange(series, 20);
    expect(range).not.toBeNull();
    expect(range!.rangeHigh).toBeCloseTo(102, 5);
    expect(range!.rangeLow).toBeCloseTo(98, 5);
    expect(range!.widthPct).toBeCloseTo(((102 - 98) / 98) * 100, 5);
  });

  it('isWidthConsolidation respects maxWidthPct', () => {
    const series = buildRangeSeries({ n: 20, mid: 100, halfWidth: 1 });
    const range = computeDonchianRange(series, 20)!;
    // width ≈ 2/99 * 100 ≈ 2.02%
    expect(isWidthConsolidation(range, 3)).toBe(true);
    expect(isWidthConsolidation(range, 1)).toBe(false);
  });
});

describe('detectBreakoutAtIndex', () => {
  it('detects LONG when close > prior Donchian high', () => {
    const series = buildRangeSeries({ n: 20, mid: 100, halfWidth: 1, breakout: 'up' });
    const ev = detectBreakoutAtIndex(series, 20, 20);
    expect(ev).not.toBeNull();
    expect(ev!.side).toBe('LONG');
    expect(ev!.rangeHigh).toBeCloseTo(101, 5);
    expect(ev!.close).toBeGreaterThan(ev!.rangeHigh);
  });

  it('detects SHORT when close < prior Donchian low', () => {
    const series = buildRangeSeries({ n: 20, mid: 100, halfWidth: 1, breakout: 'down' });
    const ev = detectBreakoutAtIndex(series, 20, 20);
    expect(ev).not.toBeNull();
    expect(ev!.side).toBe('SHORT');
    expect(ev!.close).toBeLessThan(ev!.rangeLow);
  });

  it('excludes breakout candle from range window', () => {
    const series = buildRangeSeries({ n: 20, mid: 100, halfWidth: 1, breakout: 'up' });
    const ev = detectBreakoutAtIndex(series, 20, 20)!;
    // If breakout high were included, rangeHigh would be mid+3*hw = 103
    expect(ev.rangeHigh).toBeLessThan(series[20]!.high);
  });

  it('returns null inside range', () => {
    const series = buildRangeSeries({ n: 21, mid: 100, halfWidth: 1, breakout: null });
    expect(detectBreakoutAtIndex(series, 20, 20)).toBeNull();
  });
});

describe('buildBreakoutLevels', () => {
  it('LONG SL below rangeLow with buffer; TP at 1.5R', () => {
    const levels = buildBreakoutLevels({
      side: 'LONG',
      entry: 105,
      rangeHigh: 101,
      rangeLow: 99,
      confirmMode: 'immediate',
      consolidationMode: 'width',
      breakoutOpenTime: 1,
      activeOpenTime: 1,
    });
    expect(levels).not.toBeNull();
    expect(levels!.sl).toBeCloseTo(99 * (1 - 0.003), 8);
    const dist = 105 - levels!.sl;
    expect(levels!.tp1).toBeCloseTo(105 + dist * 1.5, 8);
  });

  it('ATR break-level SL places stop just beyond broken level', () => {
    const levels = buildBreakoutLevels({
      side: 'LONG',
      entry: 105,
      rangeHigh: 101,
      rangeLow: 99,
      confirmMode: 'immediate',
      consolidationMode: 'width',
      breakoutOpenTime: 1,
      activeOpenTime: 1,
      slMode: 'atr_break_level',
      atr: 2,
      atrMult: 1.0,
    });
    expect(levels).not.toBeNull();
    expect(levels!.sl).toBeCloseTo(101 - 2, 8);
    expect(levels!.slDistancePct).toBeCloseTo(((105 - 99) / 105) * 100, 5);
  });

  it('rejects LONG when SL not below entry', () => {
    expect(
      buildBreakoutLevels({
        side: 'LONG',
        entry: 98,
        rangeHigh: 101,
        rangeLow: 99,
        confirmMode: 'immediate',
        consolidationMode: 'width',
        breakoutOpenTime: 1,
        activeOpenTime: 1,
      }),
    ).toBeNull();
  });
});

describe('isStrongBreakoutCandle', () => {
  it('rejects weak range/volume breakout candles', () => {
    // Many flat bars then a tiny breakout — should fail strong filter
    const series = buildRangeSeries({ n: 40, mid: 100, halfWidth: 0.5, breakout: 'up' });
    const ev = detectBreakoutAtIndex(series, 40, 20)!;
    expect(isStrongBreakoutCandle(series, ev.breakoutIndex)).toBe(false);
  });
});

describe('retest helpers', () => {
  it('barTouchesLevel within ±0.5%', () => {
    const level = 100;
    expect(barTouchesLevel(k(0, 100, 100.4, 99.6, 100), level)).toBe(true);
    expect(barTouchesLevel(k(0, 102, 103, 102, 102.5), level)).toBe(false);
  });

  it('findRetestBarIndex finds first touch within 10 bars', () => {
    const base = buildRangeSeries({ n: 20, mid: 100, halfWidth: 1, breakout: 'up' });
    // after breakout: far bars then touch
    const t0 = base[0]!.openTime;
    for (let i = 1; i <= 3; i++) {
      base.push(k(t0 + (20 + i) * 3_600_000, 104, 105, 103.5, 104, 100, 50));
    }
    // touch rangeHigh≈101
    base.push(k(t0 + 24 * 3_600_000, 102, 102.5, 100.6, 101.2, 100, 50));
    const ev = detectBreakoutAtIndex(base, 20, 20)!;
    const idx = findRetestBarIndex(base, ev, 10);
    expect(idx).toBe(24);
  });
});

describe('confirm paths (momentum gate)', () => {
  it('immediate returns null without momentum confirmation on flat volumes', () => {
    const series = buildRangeSeries({ n: 40, mid: 100, halfWidth: 1, breakout: 'up' });
    const ev = detectBreakoutAtIndex(series, 40, 20)!;
    // Flat takerBuy ~50% → unlikely both volume spike + CVD rising
    expect(tryImmediateBreakoutSetup(series, ev, 'width')).toBeNull();
  });

  it('retest returns null when no touch in window', () => {
    const series = buildRangeSeries({ n: 20, mid: 100, halfWidth: 1, breakout: 'up' });
    const t0 = series[0]!.openTime;
    for (let i = 1; i <= 10; i++) {
      series.push(k(t0 + (20 + i) * 3_600_000, 110, 111, 109, 110, 100, 50));
    }
    const ev = detectBreakoutAtIndex(series, 20, 20)!;
    expect(tryRetestBreakoutSetup(series, ev, 'width')).toBeNull();
  });
});

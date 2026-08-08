import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import {
  barTouchesLevel,
  buildBreakoutLevels,
  computeDonchianRange,
  dedupeBreakoutSetupsByBrokenLevel,
  detectBreakoutAtIndex,
  findRetestBarIndex,
  isStrongBreakoutCandle,
  isWidthConsolidation,
  tryImmediateBreakoutSetup,
  tryRetestBreakoutSetup,
  type BreakoutTradeLevels,
  brokenLevelsMatch,
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

function mockSetup(
  partial: Pick<
    BreakoutTradeLevels,
    'side' | 'entry' | 'rangeHigh' | 'rangeLow' | 'breakoutOpenTime' | 'activeOpenTime'
  > &
    Partial<Pick<BreakoutTradeLevels, 'sl' | 'tp1'>>,
): BreakoutTradeLevels {
  return {
    sl: partial.sl ?? partial.entry * (partial.side === 'LONG' ? 0.98 : 1.02),
    tp1: partial.tp1 ?? partial.entry * (partial.side === 'LONG' ? 1.03 : 0.97),
    slDistancePct: 2,
    tp1RR: 1.5,
    confirmMode: 'retest',
    consolidationMode: 'width',
    ...partial,
  };
}

/** First setup still open through cascades (holds ≥12h, matches CSV bars_held). */
function exitAfterBars(headActive: number, bars: number) {
  return (setup: BreakoutTradeLevels) =>
    setup.activeOpenTime === headActive
      ? headActive + bars * 3_600_000
      : setup.activeOpenTime + 80 * 3_600_000;
}

describe('dedupeBreakoutSetupsByBrokenLevel (V41-SOL-4 Task1)', () => {
  it('collapses Confirm-B cascade: breakoutOpenTime == prior.activeOpenTime', () => {
    // 2026-02-22 SHORT×3 pattern from SOL-3 trades CSV
    const t0 = Date.parse('2026-02-22T12:00:00.000Z');
    const active0 = t0 + 3_600_000;
    const cluster = [
      mockSetup({
        side: 'SHORT',
        entry: 83.94,
        rangeHigh: 88,
        rangeLow: 83.94,
        breakoutOpenTime: t0,
        activeOpenTime: active0,
      }),
      mockSetup({
        side: 'SHORT',
        entry: 83.6,
        rangeHigh: 87.5,
        rangeLow: 83.6, // slides >0.5% → price alone would miss
        breakoutOpenTime: t0 + 3_600_000,
        activeOpenTime: t0 + 2 * 3_600_000,
      }),
      mockSetup({
        side: 'SHORT',
        entry: 83.44,
        rangeHigh: 87,
        rangeLow: 83.44,
        breakoutOpenTime: t0 + 2 * 3_600_000,
        activeOpenTime: t0 + 3 * 3_600_000,
      }),
    ];
    const kept = dedupeBreakoutSetupsByBrokenLevel(cluster, {
      resolveExitOpenTime: exitAfterBars(active0, 11),
    });
    expect(kept).toHaveLength(1);
    expect(kept[0]!.entry).toBe(83.94);
    expect(kept[0]!.activeOpenTime).toBe(active0);
  });

  it('keeps one trade for each of the five SOL-3 duplicate clusters', () => {
    const clusters: {
      id: string;
      side: 'LONG' | 'SHORT';
      rows: { entry: number; breakout: string; active: string }[];
    }[] = [
      {
        id: '2025-12-29 LONG',
        side: 'LONG',
        rows: [
          { entry: 126.96, breakout: '2025-12-28T23:00:00.000Z', active: '2025-12-29T00:00:00.000Z' },
          { entry: 128.7, breakout: '2025-12-29T00:00:00.000Z', active: '2025-12-29T01:00:00.000Z' },
        ],
      },
      {
        id: '2026-01-20 SHORT',
        side: 'SHORT',
        rows: [
          { entry: 130.56, breakout: '2026-01-20T06:00:00.000Z', active: '2026-01-20T07:00:00.000Z' },
          { entry: 129.03, breakout: '2026-01-20T07:00:00.000Z', active: '2026-01-20T08:00:00.000Z' },
        ],
      },
      {
        id: '2026-02-22 SHORT',
        side: 'SHORT',
        rows: [
          { entry: 83.94, breakout: '2026-02-22T12:00:00.000Z', active: '2026-02-22T13:00:00.000Z' },
          { entry: 83.6, breakout: '2026-02-22T13:00:00.000Z', active: '2026-02-22T14:00:00.000Z' },
          { entry: 83.44, breakout: '2026-02-22T14:00:00.000Z', active: '2026-02-22T15:00:00.000Z' },
        ],
      },
      {
        id: '2026-03-06 SHORT',
        side: 'SHORT',
        rows: [
          { entry: 85.54, breakout: '2026-03-06T12:00:00.000Z', active: '2026-03-06T13:00:00.000Z' },
          { entry: 84.27, breakout: '2026-03-06T13:00:00.000Z', active: '2026-03-06T14:00:00.000Z' },
        ],
      },
      {
        id: '2026-07-05 SHORT',
        side: 'SHORT',
        rows: [
          { entry: 80.82, breakout: '2026-07-05T00:00:00.000Z', active: '2026-07-05T01:00:00.000Z' },
          { entry: 80.33, breakout: '2026-07-05T01:00:00.000Z', active: '2026-07-05T02:00:00.000Z' },
        ],
      },
    ];

    for (const c of clusters) {
      const setups = c.rows.map((r) =>
        mockSetup({
          side: c.side,
          entry: r.entry,
          // Intentionally drift levels past ±0.5% so cascade path is required
          rangeHigh: c.side === 'LONG' ? r.entry : r.entry * 1.05,
          rangeLow: c.side === 'SHORT' ? r.entry : r.entry * 0.95,
          breakoutOpenTime: Date.parse(r.breakout),
          activeOpenTime: Date.parse(r.active),
        }),
      );
      const headActive = setups[0]!.activeOpenTime;
      const kept = dedupeBreakoutSetupsByBrokenLevel(setups, {
        resolveExitOpenTime: exitAfterBars(headActive, 12),
      });
      expect(kept, c.id).toHaveLength(1);
      expect(kept[0]!.entry, c.id).toBe(c.rows[0]!.entry);
    }
  });

  it('does not merge opposite sides or far-apart same-level events', () => {
    const t0 = Date.parse('2026-02-01T00:00:00.000Z');
    const longThenShort = [
      mockSetup({
        side: 'LONG',
        entry: 100,
        rangeHigh: 100,
        rangeLow: 95,
        breakoutOpenTime: t0,
        activeOpenTime: t0 + 3_600_000,
      }),
      mockSetup({
        side: 'SHORT',
        entry: 99,
        rangeHigh: 105,
        rangeLow: 99,
        breakoutOpenTime: t0 + 3_600_000,
        activeOpenTime: t0 + 2 * 3_600_000,
      }),
    ];
    expect(
      dedupeBreakoutSetupsByBrokenLevel(longThenShort, {
        resolveExitOpenTime: (s) => s.activeOpenTime + 80 * 3_600_000,
      }),
    ).toHaveLength(2);

    const farApart = [
      mockSetup({
        side: 'SHORT',
        entry: 80,
        rangeHigh: 85,
        rangeLow: 80,
        breakoutOpenTime: t0,
        activeOpenTime: t0 + 3_600_000,
      }),
      mockSetup({
        side: 'SHORT',
        entry: 80.1,
        rangeHigh: 85,
        rangeLow: 80.1,
        breakoutOpenTime: t0 + 100 * 3_600_000,
        activeOpenTime: t0 + 101 * 3_600_000,
      }),
    ];
    expect(
      dedupeBreakoutSetupsByBrokenLevel(farApart, {
        resolveExitOpenTime: (s) => s.activeOpenTime + 80 * 3_600_000,
      }),
    ).toHaveLength(2);
  });

  it('keeps 2 independent same-level events when first trade already closed (occupancy B)', () => {
    // Event 1 TP after 10 bars; ~30 bars later same ±0.5% level breaks again — not a cascade.
    const t0 = Date.parse('2026-04-01T00:00:00.000Z');
    const active1 = t0 + 3_600_000;
    const exit1 = active1 + 10 * 3_600_000;
    const active2 = active1 + 40 * 3_600_000;
    const level = 100;
    const setups = [
      mockSetup({
        side: 'LONG',
        entry: 100.2,
        rangeHigh: level,
        rangeLow: 96,
        breakoutOpenTime: t0,
        activeOpenTime: active1,
        sl: 98,
        tp1: 103,
      }),
      mockSetup({
        side: 'LONG',
        entry: 100.3,
        rangeHigh: level * 1.002, // within ±0.5% of first rangeHigh
        rangeLow: 96.5,
        breakoutOpenTime: active2 - 3_600_000,
        activeOpenTime: active2,
        sl: 98.2,
        tp1: 103.2,
      }),
    ];
    expect(brokenLevelsMatch(level, level * 1.002)).toBe(true);

    const kept = dedupeBreakoutSetupsByBrokenLevel(setups, {
      resolveExitOpenTime: (s) =>
        s.activeOpenTime === active1 ? exit1 : s.activeOpenTime + 10 * 3_600_000,
    });
    expect(kept).toHaveLength(2);
    expect(kept.map((s) => s.activeOpenTime)).toEqual([active1, active2]);
  });

  it('still blocks same-level re-entry while first trade is open (occupancy B)', () => {
    const t0 = Date.parse('2026-04-01T00:00:00.000Z');
    const active1 = t0 + 3_600_000;
    const exit1 = active1 + 10 * 3_600_000;
    const activeWhileOpen = active1 + 5 * 3_600_000;
    const level = 100;
    const setups = [
      mockSetup({
        side: 'LONG',
        entry: 100.2,
        rangeHigh: level,
        rangeLow: 96,
        breakoutOpenTime: t0,
        activeOpenTime: active1,
      }),
      mockSetup({
        side: 'LONG',
        entry: 100.4,
        rangeHigh: level,
        rangeLow: 96.2,
        breakoutOpenTime: activeWhileOpen - 3_600_000,
        activeOpenTime: activeWhileOpen,
      }),
    ];
    const kept = dedupeBreakoutSetupsByBrokenLevel(setups, {
      resolveExitOpenTime: (s) =>
        s.activeOpenTime === active1 ? exit1 : s.activeOpenTime + 10 * 3_600_000,
    });
    expect(kept).toHaveLength(1);
    expect(kept[0]!.activeOpenTime).toBe(active1);
  });
});

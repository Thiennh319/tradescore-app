import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KlineV41 } from '../indicators';
import {
  checkRetestEMA20_1H,
  checkReversalSignals,
  computeCounterTrendSL,
  COUNTER_TREND_SL_1H_MS,
  detectReversalSignalFlags,
  sliceKlines1HForFourHEntry,
} from '../reversalDetector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function buildBelowEma20Klines(count = 25, lastClose = 80): KlineV41[] {
  const klines = buildFlatKlines(count - 1, { close: 100, open: 100, high: 101, low: 99 });
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

function buildNeutralBullKlines(count = 25): KlineV41[] {
  return buildFlatKlines(count, {
    close: 100,
    open: 100,
    high: 101,
    low: 99,
    volume: 1000,
    takerBuyVolume: 500,
  });
}

function buildVolumeSpikeDownKlines(count = 25): KlineV41[] {
  const klines = buildNeutralBullKlines(count - 1);
  klines.push(
    buildKline({
      openTime: count - 1,
      closeTime: count,
      open: 101,
      high: 102,
      low: 99,
      close: 99,
      volume: 2500,
      takerBuyVolume: 400,
    }),
  );
  return klines;
}

function buildCvdDecliningKlines(count = 25): KlineV41[] {
  return buildFlatKlines(count, (index) => ({
    close: 100,
    open: 100,
    volume: 1000,
    takerBuyVolume: index >= count - 3 ? 200 : 500,
  }));
}

function buildSellPressure30M(count = 25): KlineV41[] {
  return buildFlatKlines(count, (index) => ({
    close: 100,
    open: 100,
    volume: 1000,
    takerBuyVolume: index >= count - 3 ? 300 : 500,
  }));
}

function buildBtcReversalKlines(count = 25): KlineV41[] {
  return buildBelowEma20Klines(count);
}

function buildThreeSignalKlines(): {
  klines1H: KlineV41[];
  klines30M: KlineV41[];
  btcKlines1H: KlineV41[];
} {
  return {
    klines1H: buildBelowEma20Klines(),
    klines30M: buildSellPressure30M(),
    btcKlines1H: buildBtcReversalKlines(),
  };
}

function buildFiveSignalKlines(): {
  klines1H: KlineV41[];
  klines30M: KlineV41[];
  btcKlines1H: KlineV41[];
} {
  const klines1H = buildVolumeSpikeDownKlines();
  const lastThree = klines1H.length - 3;
  for (let i = lastThree; i < klines1H.length; i++) {
    klines1H[i] = {
      ...klines1H[i],
      takerBuyVolume: 200,
      close: i === klines1H.length - 1 ? 80 : 100,
      open: i === klines1H.length - 1 ? 95 : 100,
      high: i === klines1H.length - 1 ? 96 : 101,
      low: i === klines1H.length - 1 ? 79 : 99,
    };
  }

  return {
    klines1H,
    klines30M: buildSellPressure30M(),
    btcKlines1H: buildBtcReversalKlines(),
  };
}

function buildRetestShortConfirmedKlines(highVolume = true): KlineV41[] {
  const klines = buildFlatKlines(23, { close: 100, open: 100, high: 101, low: 99, volume: 1000 });
  klines.push(
    buildKline({
      openTime: 23,
      closeTime: 24,
      open: 101,
      high: 100.2,
      low: 99,
      close: 99.5,
      volume: highVolume ? 2500 : 500,
      takerBuyVolume: 400,
    }),
  );
  klines.push(
    buildKline({
      openTime: 24,
      closeTime: 25,
      open: 99.5,
      high: 100,
      low: 97,
      close: 97,
      volume: 1100,
      takerBuyVolume: 450,
    }),
  );
  return klines;
}

describe('checkReversalSignals', () => {
  const bullParams = (overrides: {
    klines1H?: KlineV41[];
    klines30M?: KlineV41[];
    btcKlines1H?: KlineV41[];
  } = {}) => ({
    klines1H: overrides.klines1H ?? buildNeutralBullKlines(),
    klines30M: overrides.klines30M ?? buildNeutralBullKlines(),
    btcKlines1H: overrides.btcKlines1H ?? buildNeutralBullKlines(),
    trendDirection: 'BULL' as const,
  });

  it('0 dấu hiệu → confirmed false', () => {
    const result = checkReversalSignals(bullParams());
    expect(result.signals).toBe(0);
    expect(result.confirmed).toBe(false);
  });

  it('2 dấu hiệu → confirmed false', () => {
    const result = checkReversalSignals(
      bullParams({
        klines30M: buildSellPressure30M(),
        klines1H: buildCvdDecliningKlines(),
      }),
    );
    expect(result.signals).toBe(2);
    expect(result.confirmed).toBe(false);
  });

  it('3 dấu hiệu → confirmed true', () => {
    const data = buildThreeSignalKlines();
    const result = checkReversalSignals({
      ...data,
      trendDirection: 'BULL',
    });
    expect(result.signals).toBeGreaterThanOrEqual(3);
    expect(result.confirmed).toBe(true);
  });

  it('5 dấu hiệu → confirmed true', () => {
    const data = buildFiveSignalKlines();
    const result = checkReversalSignals({
      ...data,
      trendDirection: 'BULL',
    });
    expect(result.signals).toBe(5);
    expect(result.confirmed).toBe(true);
  });

  it('PRICE_BELOW_EMA20 đúng logic', () => {
    const flags = detectReversalSignalFlags(
      bullParams({ klines1H: buildBelowEma20Klines() }),
    );
    expect(flags.priceBelowEma20_1H).toBe(true);
  });

  it('VOLUME_SPIKE_DOWN đúng logic', () => {
    const flags = detectReversalSignalFlags(
      bullParams({ klines1H: buildVolumeSpikeDownKlines() }),
    );
    expect(flags.volumeSpikeDown).toBe(true);
  });

  it('CVD_DECLINING đúng logic', () => {
    const flags = detectReversalSignalFlags(
      bullParams({ klines1H: buildCvdDecliningKlines() }),
    );
    expect(flags.cvdDeclining1H).toBe(true);
  });
});

describe('checkRetestEMA20_1H', () => {
  it('Giá chạm EMA20 ± 0.3% + nến đỏ + nến sau xuống → confirmed true', () => {
    const result = checkRetestEMA20_1H({
      klines1H: buildRetestShortConfirmedKlines(true),
      counterDirection: 'SHORT',
    });

    expect(result.confirmed).toBe(true);
    expect(result.retestPrice).not.toBeNull();
    expect(result.volumeConfirmed).toBe(true);
  });

  it('Giá không chạm EMA20 → confirmed false', () => {
    const klines = buildRetestShortConfirmedKlines();
    klines[klines.length - 2] = {
      ...klines[klines.length - 2],
      high: 95,
      open: 96,
      close: 94,
    };

    const result = checkRetestEMA20_1H({
      klines1H: klines,
      counterDirection: 'SHORT',
    });

    expect(result.confirmed).toBe(false);
  });

  it('Volume thấp → volumeConfirmed false', () => {
    const result = checkRetestEMA20_1H({
      klines1H: buildRetestShortConfirmedKlines(false),
      counterDirection: 'SHORT',
    });

    expect(result.volumeConfirmed).toBe(false);
  });
});

describe('computeCounterTrendSL', () => {
  const klines1H = buildFlatKlines(25, {
    high: 105,
    low: 95,
    close: 100,
    open: 100,
  });

  it('SHORT: SL trên entry', () => {
    const sl = computeCounterTrendSL({
      klines1H,
      direction: 'SHORT',
      entryPrice: 100,
    });

    expect(sl).toBeGreaterThan(100);
  });

  it('LONG: SL dưới entry', () => {
    const sl = computeCounterTrendSL({
      klines1H,
      direction: 'LONG',
      entryPrice: 100,
    });

    expect(sl).toBeLessThan(100);
  });

  it('SHORT: SL = min(swing, ema20) + buffer (happy path — both candidates correct side)', () => {
    const closes = klines1H.map((k) => k.close);
    const swingHigh = Math.max(...klines1H.slice(-10).map((k) => k.high));
    const emaApprox = 100;
    const expected = Math.min(swingHigh * 1.003, emaApprox * 1.005) * 1.003;

    const sl = computeCounterTrendSL({
      klines1H,
      direction: 'SHORT',
      entryPrice: 100,
    });

    expect(sl).toBeCloseTo(expected, 0);
    expect(sl).toBeGreaterThan(100);
    expect(closes.length).toBeGreaterThan(0);
  });

  it('LONG: happy path — both swing/EMA below entry → max then buffer', () => {
    const swingLow = Math.min(...klines1H.slice(-10).map((k) => k.low));
    const emaApprox = 100;
    const expected = Math.max(swingLow * 0.997, emaApprox * 0.995) * 0.997;
    const sl = computeCounterTrendSL({
      klines1H,
      direction: 'LONG',
      entryPrice: 100,
    });
    expect(sl).toBeCloseTo(expected, 0);
    expect(sl).toBeLessThan(100);
  });

  it('LONG: drops wrong-side EMA candidate (price below EMA) — uses swing-only', () => {
    // Flat ~110 so EMA≈110, then dump so entry is far below EMA (bug trigger before fix).
    const klines = buildFlatKlines(30, { high: 112, low: 108, close: 110, open: 110 });
    klines.push(
      buildKline({
        openTime: 30,
        closeTime: 31,
        open: 100,
        high: 101,
        low: 94,
        close: 95,
      }),
    );
    const entry = 95;
    const sl = computeCounterTrendSL({
      klines1H: klines,
      direction: 'LONG',
      entryPrice: entry,
    });
    expect(Number.isFinite(sl)).toBe(true);
    expect(sl).toBeLessThan(entry);
  });

  it('SHORT: drops wrong-side EMA candidate (price above EMA) — uses swing-only', () => {
    const klines = buildFlatKlines(30, { high: 102, low: 98, close: 100, open: 100 });
    klines.push(
      buildKline({
        openTime: 30,
        closeTime: 31,
        open: 110,
        high: 116,
        low: 109,
        close: 115,
      }),
    );
    const entry = 115;
    const sl = computeCounterTrendSL({
      klines1H: klines,
      direction: 'SHORT',
      entryPrice: entry,
    });
    expect(Number.isFinite(sl)).toBe(true);
    expect(sl).toBeGreaterThan(entry);
  });

  it('returns NaN when every candidate is wrong-side of entry', () => {
    // Entry far below the entire recent range → LONG cannot place SL under entry.
    const klines = buildFlatKlines(25, { high: 105, low: 95, close: 100, open: 100 });
    const sl = computeCounterTrendSL({
      klines1H: klines,
      direction: 'LONG',
      entryPrice: 50,
    });
    expect(Number.isNaN(sl)).toBe(true);
  });

  describe('regression fixtures — 4 live timestamps that were INVALID_SL_SIDE', () => {
    const casesPath = path.join(__dirname, 'fixtures', 'sl-geometry-cases.json');
    const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as Array<{
      id: string;
      side: 'LONG' | 'SHORT';
      entry: number;
      file: string;
    }>;

    for (const c of cases) {
      it(`${c.id} ${c.side} @ ${c.entry} → SL correct side`, () => {
        const fixturePath = path.join(__dirname, 'fixtures', c.file);
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
          klines1H: KlineV41[];
        };
        const sl = computeCounterTrendSL({
          klines1H: fixture.klines1H,
          direction: c.side,
          entryPrice: c.entry,
        });
        expect(Number.isFinite(sl)).toBe(true);
        if (c.side === 'LONG') {
          expect(sl).toBeLessThan(c.entry);
        } else {
          expect(sl).toBeGreaterThan(c.entry);
        }
      });
    }
  });

  describe('sliceKlines1HForFourHEntry — include 1H bars through 4H close', () => {
    it('keeps opens through fourHOpen + 3h, drops later bars', () => {
      const fourHOpen = 1_000_000;
      const klines = [0, 1, 2, 3, 4].map((h) =>
        buildKline({
          openTime: fourHOpen + h * COUNTER_TREND_SL_1H_MS,
          closeTime: fourHOpen + (h + 1) * COUNTER_TREND_SL_1H_MS - 1,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
        }),
      );
      const sliced = sliceKlines1HForFourHEntry(klines, fourHOpen);
      expect(sliced.map((k) => k.openTime)).toEqual([
        fourHOpen,
        fourHOpen + COUNTER_TREND_SL_1H_MS,
        fourHOpen + 2 * COUNTER_TREND_SL_1H_MS,
        fourHOpen + 3 * COUNTER_TREND_SL_1H_MS,
      ]);
    });

    it('fourHOpenTime recovers SL when spike only exists inside the 4H bar', () => {
      // Flat history below entry; only the intra-4H 1H bars print a new low usable for LONG SL.
      const fourHOpen = 1000;
      const prior = buildFlatKlines(30, { high: 112, low: 108, close: 110, open: 110 });
      // Re-stamp prior so they sit before fourHOpen
      const stamped = prior.map((k, i) => ({
        ...k,
        openTime: fourHOpen - (30 - i) * COUNTER_TREND_SL_1H_MS,
        closeTime: fourHOpen - (30 - i) * COUNTER_TREND_SL_1H_MS + COUNTER_TREND_SL_1H_MS - 1,
      }));
      const intra = [0, 1, 2, 3].map((h) =>
        buildKline({
          openTime: fourHOpen + h * COUNTER_TREND_SL_1H_MS,
          closeTime: fourHOpen + (h + 1) * COUNTER_TREND_SL_1H_MS - 1,
          open: 105,
          high: 106,
          low: h === 3 ? 94 : 100,
          close: h === 3 ? 95 : 102,
        }),
      );
      const all = [...stamped, ...intra];
      const entry = 95;

      const slAtOpenOnly = computeCounterTrendSL({
        klines1H: all.filter((k) => k.openTime <= fourHOpen),
        direction: 'LONG',
        entryPrice: entry,
      });
      expect(Number.isNaN(slAtOpenOnly)).toBe(true);

      const slThru = computeCounterTrendSL({
        klines1H: all,
        direction: 'LONG',
        entryPrice: entry,
        fourHOpenTime: fourHOpen,
      });
      expect(Number.isFinite(slThru)).toBe(true);
      expect(slThru).toBeLessThan(entry);
    });
  });

  describe('regression fixtures — 5 former NO_SL (4H close vs 1H-at-open window)', () => {
    const casesPath = path.join(__dirname, 'fixtures', 'sl-window-cases.json');
    const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as Array<{
      id: string;
      side: 'LONG' | 'SHORT';
      entry: number;
      timestamp: number;
      file: string;
    }>;

    for (const c of cases) {
      it(`${c.id} ${c.side} @ ${c.entry} → SL finite + correct side (thru 4H window)`, () => {
        const fixturePath = path.join(__dirname, 'fixtures', c.file);
        const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
          klines1H: KlineV41[];
        };
        const sl = computeCounterTrendSL({
          klines1H: fixture.klines1H,
          direction: c.side,
          entryPrice: c.entry,
          fourHOpenTime: c.timestamp,
        });
        expect(Number.isFinite(sl)).toBe(true);
        if (c.side === 'LONG') {
          expect(sl).toBeLessThan(c.entry);
        } else {
          expect(sl).toBeGreaterThan(c.entry);
        }
      });
    }
  });
});

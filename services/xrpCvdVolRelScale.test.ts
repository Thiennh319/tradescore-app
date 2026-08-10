import { describe, expect, it } from 'vitest';
import {
  HARD_BLOCK_RULES_V4,
  XRP_CVD_SOFT_PCT_OF_24H_QUOTE,
} from '../constants/scoring';
import {
  applyXrpOnlyCvdVolRelScale,
  quoteVolume24hFromKlines,
  scaleCvdPointsToXrpVolRel,
} from './xrpCvdVolRelScale';
import type { CVDPoint } from './indicators';

function bars(n: number, volume: number, close: number) {
  return Array.from({ length: n }, () => ({ volume, close }));
}

const rawPoints: CVDPoint[] = [
  { timestamp: 1, cvd: -2_000_000, price: 0.5 },
  { timestamp: 2, cvd: -4_000_000, price: 0.5 },
];

describe('xrpCvdVolRelScale (Option A)', () => {
  it('exports approved soft pct 9%', () => {
    expect(XRP_CVD_SOFT_PCT_OF_24H_QUOTE).toBe(0.09);
  });

  it('returns same reference for BTC/SOL/BNB (no scale)', () => {
    const k = bars(24, 1_000_000, 100);
    for (const symbol of ['BTCUSDT', 'SOLUSDT', 'BNBUSDT'] as const) {
      const out = applyXrpOnlyCvdVolRelScale(symbol, rawPoints, 100, k);
      expect(out).toBe(rawPoints);
    }
  });

  it('scales only XRPUSDT', () => {
    const close = 0.5;
    const volume = 20_000_000; // quote/h = 10M → 24h quote = 240M
    const k = bars(24, volume, close);
    const q24 = quoteVolume24hFromKlines(k);
    expect(q24).toBe(24 * volume * close);

    const out = applyXrpOnlyCvdVolRelScale('XRPUSDT', rawPoints, close, k);
    expect(out).not.toBe(rawPoints);

    const softUsd = XRP_CVD_SOFT_PCT_OF_24H_QUOTE * q24;
    const mildAbs = Math.abs(HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE);
    const factor = (close * mildAbs) / softUsd;
    expect(out[0].cvd).toBeCloseTo(rawPoints[0].cvd * factor, 6);
    expect(out[1].cvd).toBeCloseTo(rawPoints[1].cvd * factor, 6);

    const manual = scaleCvdPointsToXrpVolRel(
      rawPoints,
      close,
      q24,
      XRP_CVD_SOFT_PCT_OF_24H_QUOTE,
    );
    expect(out.map((p) => p.cvd)).toEqual(manual.map((p) => p.cvd));
  });
});

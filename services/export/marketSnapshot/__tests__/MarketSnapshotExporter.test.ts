import { describe, expect, it } from 'vitest';
import {
  buildMarketSnapshotExport,
  type MarketSnapshot,
} from '../MarketSnapshotExporter';

function fullSnapshot(): MarketSnapshot {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1H',
    market: 'FUTURES',
    capturedAt: '2026-07-18T02:00:00.000Z',
    trend: {
      ema20: 106210,
      ema50: 105900,
      ema200: 104800,
      emaAlignment: 'EMA20 > EMA50 > EMA200',
      emaSlope: 'UP',
      trendDirection: 'BULLISH',
      trendStrength: 0.8,
    },
    momentum: { rsi: 58.2, macd: 120.5, signal: 98.4, histogram: 22.1, atr: 850 },
    volume: {
      volume: 2450000,
      volumeMA20: 1900000,
      volumeRatio: 1.29,
      buyVolume: 1400000,
      sellVolume: 1050000,
      deltaVolume: 350000,
    },
    volatility: { atr: 850, atrPct: 0.8 },
    liquidity: { spread: 0.03, depth: 5200000, slippage: 0.05 },
    orderflow: {
      cvd: 320000,
      cvdTrend: 'UP',
      cvdStrength: 0.7,
      whaleSupport: 105500,
      whaleResistance: 107200,
      largestBid: 1800000,
      largestAsk: 1500000,
    },
    derivatives: {
      openInterest: 245000000,
      oiChange: 2.4,
      fundingRate: 0.008,
      longShortRatio: 1.35,
    },
    supportResistance: {
      support: [105500, 104800],
      resistance: [107200, 108000],
      nearestSupport: 105500,
      nearestResistance: 107200,
      distanceSupport: 0.6,
      distanceResistance: 1.0,
    },
    execution: {
      entryPrice: 106150,
      stopLoss: 105400,
      takeProfit: 108000,
      riskReward: 2.5,
      positionSize: 0.5,
    },
    rawEvidence: {
      ema20: 106210,
      ema50: 105900,
      ema200: 104800,
      volume: 2450000,
      fundingRate: 0.008,
      cvd: 320000,
      oi: 245000000,
      spread: 0.03,
    },
  };
}

describe('TASK R1.5 MarketSnapshotExporter', () => {
  it('Empty snapshot — exports null-filled sections, no crash', () => {
    const out = buildMarketSnapshotExport({});

    expect(out.version).toBe(1);
    expect(out.symbol).toBeNull();
    expect(out.timeframe).toBeNull();
    expect(out.market).toBeNull();
    expect(out.trend).toEqual({
      ema20: null,
      ema50: null,
      ema200: null,
      emaAlignment: null,
      emaSlope: null,
      trendDirection: null,
      trendStrength: null,
    });
    expect(out.momentum.rsi).toBeNull();
    expect(out.volume.volume).toBeNull();
    expect(out.volatility.atr).toBeNull();
    expect(out.liquidity.spread).toBeNull();
    expect(out.orderflow.cvd).toBeNull();
    expect(out.derivatives.fundingRate).toBeNull();
    expect(out.supportResistance.support).toEqual([]);
    expect(out.supportResistance.resistance).toEqual([]);
    expect(out.execution.entryPrice).toBeNull();
    expect(typeof out.fingerprint).toBe('string');
    expect(out.fingerprint.length).toBeGreaterThan(0);
  });

  it('Full snapshot — copies every value verbatim (no recalculation)', () => {
    const out = buildMarketSnapshotExport(fullSnapshot());

    expect(out.symbol).toBe('BTCUSDT');
    expect(out.timeframe).toBe('1H');
    expect(out.market).toBe('FUTURES');
    expect(out.generatedAt).toBe('2026-07-18T02:00:00.000Z');
    expect(out.trend.ema20).toBe(106210);
    expect(out.trend.ema50).toBe(105900);
    expect(out.trend.ema200).toBe(104800);
    expect(out.trend.emaAlignment).toBe('EMA20 > EMA50 > EMA200');
    expect(out.momentum.rsi).toBe(58.2);
    expect(out.momentum.macd).toBe(120.5);
    expect(out.momentum.atr).toBe(850);
    expect(out.volume.volume).toBe(2450000);
    expect(out.volume.deltaVolume).toBe(350000);
    expect(out.volatility.atrPct).toBe(0.8);
    expect(out.liquidity.spread).toBe(0.03);
    expect(out.orderflow.cvd).toBe(320000);
    expect(out.orderflow.cvdTrend).toBe('UP');
    expect(out.orderflow.whaleSupport).toBe(105500);
    expect(out.derivatives.openInterest).toBe(245000000);
    expect(out.derivatives.fundingRate).toBe(0.008);
    expect(out.supportResistance.support).toEqual([105500, 104800]);
    expect(out.supportResistance.nearestResistance).toBe(107200);
    expect(out.execution.entryPrice).toBe(106150);
    expect(out.execution.riskReward).toBe(2.5);
  });

  it('Raw Evidence — copied verbatim as raw JSON values (no stringify/format)', () => {
    const out = buildMarketSnapshotExport(fullSnapshot());

    expect(out.rawEvidence).toEqual({
      cvd: 320000,
      ema20: 106210,
      ema50: 105900,
      ema200: 104800,
      fundingRate: 0.008,
      oi: 245000000,
      spread: 0.03,
      volume: 2450000,
    });
    expect(typeof out.rawEvidence.ema20).toBe('number');
    expect(typeof out.rawEvidence.fundingRate).toBe('number');
  });

  it('Raw Evidence — projected from copied sections when engine omits it', () => {
    const snapshot = fullSnapshot();
    delete snapshot.rawEvidence;

    const out = buildMarketSnapshotExport(snapshot);

    expect(out.rawEvidence.ema20).toBe(106210);
    expect(out.rawEvidence.volume).toBe(2450000);
    expect(out.rawEvidence.fundingRate).toBe(0.008);
    expect(out.rawEvidence.cvd).toBe(320000);
    expect(out.rawEvidence.oi).toBe(245000000);
    expect(out.rawEvidence.spread).toBe(0.03);
  });

  it('Null-safe — NaN/Infinity/undefined/empty string export as null', () => {
    const out = buildMarketSnapshotExport({
      symbol: '',
      trend: { ema20: Number.NaN, ema50: Number.POSITIVE_INFINITY, ema200: undefined },
      momentum: { rsi: null },
      supportResistance: { support: null, nearestSupport: Number.NaN },
      rawEvidence: { bad: Number.NaN, ok: 1 },
    });

    expect(out.symbol).toBeNull();
    expect(out.trend.ema20).toBeNull();
    expect(out.trend.ema50).toBeNull();
    expect(out.trend.ema200).toBeNull();
    expect(out.momentum.rsi).toBeNull();
    expect(out.supportResistance.support).toEqual([]);
    expect(out.supportResistance.nearestSupport).toBeNull();
    expect(out.rawEvidence.bad).toBeNull();
    expect(out.rawEvidence.ok).toBe(1);
  });

  it('Deterministic — same snapshot always yields identical export', () => {
    const a = buildMarketSnapshotExport(fullSnapshot());
    const b = buildMarketSnapshotExport(fullSnapshot());

    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('Fingerprint — content-sensitive, order-independent, timestamp-independent', () => {
    const base = buildMarketSnapshotExport(fullSnapshot());

    const changed = fullSnapshot();
    changed.trend = { ...changed.trend, ema20: 999999 };
    const changedOut = buildMarketSnapshotExport(changed);
    expect(changedOut.fingerprint).not.toBe(base.fingerprint);

    const reorderedEvidence = fullSnapshot();
    reorderedEvidence.rawEvidence = {
      spread: 0.03,
      oi: 245000000,
      cvd: 320000,
      fundingRate: 0.008,
      volume: 2450000,
      ema200: 104800,
      ema50: 105900,
      ema20: 106210,
    };
    expect(buildMarketSnapshotExport(reorderedEvidence).fingerprint).toBe(base.fingerprint);

    const laterCapture = fullSnapshot();
    laterCapture.capturedAt = '2027-01-01T00:00:00.000Z';
    expect(buildMarketSnapshotExport(laterCapture).fingerprint).toBe(base.fingerprint);
  });

  it('Read-only / No mutation — input snapshot is untouched', () => {
    const snapshot = fullSnapshot();
    const frozen = JSON.stringify(snapshot);
    Object.freeze(snapshot);
    Object.freeze(snapshot.trend);
    Object.freeze(snapshot.momentum);
    Object.freeze(snapshot.supportResistance);
    Object.freeze(snapshot.rawEvidence);

    const out = buildMarketSnapshotExport(snapshot);

    expect(JSON.stringify(snapshot)).toBe(frozen);
    out.trend.ema20 = 0;
    (out.rawEvidence as Record<string, unknown>).ema20 = 0;
    expect(JSON.stringify(snapshot)).toBe(frozen);
  });

  it('Stable JSON — serializes without loss and round-trips', () => {
    const out = buildMarketSnapshotExport(fullSnapshot());
    const roundTrip = JSON.parse(JSON.stringify(out));

    expect(roundTrip).toEqual(out);
    expect(roundTrip.rawEvidence.fundingRate).toBe(0.008);
  });

  it('No recalculation — inconsistent inputs are exported as-is', () => {
    // volumeRatio disagrees with volume/volumeMA20 on purpose: the exporter
    // must copy the engine value, never derive it.
    const out = buildMarketSnapshotExport({
      volume: { volume: 100, volumeMA20: 100, volumeRatio: 9.99 },
      trend: { ema20: 1, ema50: 2, ema200: 3, emaAlignment: 'EMA20 > EMA50 > EMA200' },
    });

    expect(out.volume.volumeRatio).toBe(9.99);
    expect(out.trend.emaAlignment).toBe('EMA20 > EMA50 > EMA200');
  });
});

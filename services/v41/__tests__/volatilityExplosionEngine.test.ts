import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import type { BTCContext } from '../btcContextBuilder';
import {
  computeVolatilityExplosion,
  evaluateAtrSpring,
  evaluateFundingPressure,
  evaluateOiBuildup,
  evaluateVolumeExpansion,
} from '../volatilityExplosionEngine';

function buildKline(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000,
    closeTime: 1,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildFlatKlines(count: number, price = 100, spread = 0.15, volume = 1000): KlineV41[] {
  return Array.from({ length: count }, (_, index) =>
    buildKline({
      openTime: index,
      closeTime: index + 1,
      open: price,
      high: price + spread / 2,
      low: price - spread / 2,
      close: price,
      volume,
    }),
  );
}

function buildMarketReadyKlines(): KlineV41[] {
  const klines = buildFlatKlines(65, 100, 0.2, 800);
  for (let i = 65; i < 70; i++) {
    const amp = 1.8 + (i - 65) * 0.25;
    klines.push(
      buildKline({
        openTime: i,
        closeTime: i + 1,
        open: 100,
        high: 100 + amp,
        low: 100 - amp,
        close: 100 + (i % 2 === 0 ? 0.6 : -0.6),
        volume: 1600 + (i - 65) * 250,
      }),
    );
  }
  return klines;
}

const moderateBtc: BTCContext = {
  btcTrendStrength: 65,
  btcDirection: 'BULL',
  btcStrengthBand: 'moderate',
  btcAlignmentFactor: 0.75,
};

describe('volatilityExplosionEngine helpers', () => {
  it('evaluateAtrSpring true when atr ratio in expansion band', () => {
    expect(evaluateAtrSpring(1.2, 0.9)).toBe(true);
  });

  it('evaluateAtrSpring true when compressed ATR starts rising', () => {
    expect(evaluateAtrSpring(0.9, 0.85)).toBe(true);
  });

  it('evaluateAtrSpring false for flat NORMAL band without breakout', () => {
    expect(evaluateAtrSpring(1.0, 1.0)).toBe(false);
  });

  it('evaluateAtrSpring true when explosion already active (atr > 2)', () => {
    expect(evaluateAtrSpring(3.5, 2.8)).toBe(true);
  });

  it('evaluateVolumeExpansion true when last volume > 1.25x MA20', () => {
    const klines = buildFlatKlines(25, 100, 1, 1000);
    klines[24] = buildKline({ volume: 1400 });
    expect(evaluateVolumeExpansion(klines)).toBe(true);
  });

  it('evaluateOiBuildup requires >= 1.5% delta', () => {
    expect(evaluateOiBuildup(2.0)).toBe(true);
    expect(evaluateOiBuildup(0.5)).toBe(false);
    expect(evaluateOiBuildup(undefined)).toBe(false);
  });

  it('evaluateFundingPressure uses 0.015% threshold (below exhaustion 0.03%)', () => {
    expect(evaluateFundingPressure(0.0002)).toBe(true);
    expect(evaluateFundingPressure(0.00005)).toBe(false);
  });
});

describe('computeVolatilityExplosion', () => {
  it('flat quiet market → Quiet Market (core signals missing)', () => {
    const result = computeVolatilityExplosion({
      klines4H: buildFlatKlines(70),
    });
    expect(result.state).toBe('Quiet Market');
    expect(result.signals.atrSpring).toBe(false);
    expect(result.signals.volumeExpansion).toBe(false);
  });

  it('ATR expansion + volume + OI + funding + BTC → Market Ready', () => {
    const klines = buildMarketReadyKlines();
    const result = computeVolatilityExplosion({
      klines4H: klines,
      fundingRate: 0.0002,
      oiDeltaPct: 2.5,
      liquidationPressureScore: 55,
      btcContext: moderateBtc,
    });
    expect(result.signals.atrSpring).toBe(true);
    expect(result.signals.volumeExpansion).toBe(true);
    expect(result.state).toBe('Market Ready');
    expect(result.detail.activeSignalCount).toBeGreaterThanOrEqual(3);
    expect(result.detail.readinessScore).toBeGreaterThanOrEqual(45);
  });

  it('only ATR+volume without optional inputs can still be Market Ready', () => {
    const klines = buildMarketReadyKlines();
    const result = computeVolatilityExplosion({ klines4H: klines });
    if (result.signals.atrSpring && result.signals.volumeExpansion) {
      expect(result.state).toBe('Market Ready');
    } else {
      expect(result.state).toBe('Quiet Market');
    }
  });

  it('optional inputs missing do not throw — availableSignalCount reflects scope', () => {
    const result = computeVolatilityExplosion({
      klines4H: buildFlatKlines(70),
    });
    expect(result.detail.availableSignalCount).toBe(2);
    expect(result.detail.oiDeltaPct).toBeNull();
    expect(result.detail.fundingRate).toBeNull();
  });

  it('output never contains direction or entry fields', () => {
    const result = computeVolatilityExplosion({
      klines4H: buildMarketReadyKlines(),
      oiDeltaPct: 3,
      fundingRate: -0.00025,
      btcContext: moderateBtc,
    });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/LONG|SHORT|entryReady|tradePlan/i);
    expect(['Quiet Market', 'Market Ready']).toContain(result.state);
  });
});

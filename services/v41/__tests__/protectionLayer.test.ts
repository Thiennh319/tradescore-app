import { describe, expect, it } from 'vitest';
import type { KlineV41 } from '../indicators';
import {
  buildNeutralProtection,
  buildProtectionSnapshot,
  computeProtectionPenalty,
  computeVolatilityRisk,
  detectStopHunt,
  NEUTRAL_PROTECTION,
} from '../protectionLayer';

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

function buildFlatKlines(count: number, price = 100, spread = 1): KlineV41[] {
  return Array.from({ length: count }, (_, index) =>
    buildKline({
      openTime: index,
      closeTime: index + 1,
      open: price,
      high: price + spread / 2,
      low: price - spread / 2,
      close: price,
      volume: 1000,
    }),
  );
}

describe('buildNeutralProtection', () => {
  it('returns neutral snapshot with penalty 0', () => {
    const snapshot = buildNeutralProtection();
    expect(snapshot.stopHuntDetected).toBe(false);
    expect(snapshot.stopHuntRisk).toBe('LOW');
    expect(snapshot.volatilityRisk).toBe('NORMAL');
    expect(snapshot.volatilityAtrPct).toBe(0);
    expect(snapshot.protectionWarnings).toEqual([]);
    expect(snapshot.protectionPenalty).toBe(0);
    expect(computeProtectionPenalty(snapshot)).toBe(0);
  });

  it('NEUTRAL_PROTECTION matches buildNeutralProtection', () => {
    expect(NEUTRAL_PROTECTION).toEqual(buildNeutralProtection());
  });
});

describe('computeProtectionPenalty', () => {
  it('stopHuntDetected=true → penalty -10', () => {
    expect(
      computeProtectionPenalty({
        stopHuntDetected: true,
        stopHuntRisk: 'MEDIUM',
        volatilityRisk: 'NORMAL',
        volatilityAtrPct: 100,
        protectionWarnings: [],
        protectionPenalty: -10,
      }),
    ).toBe(-10);
  });

  it('volatilityRisk=EXTREME → penalty -10', () => {
    expect(
      computeProtectionPenalty({
        stopHuntDetected: false,
        stopHuntRisk: 'LOW',
        volatilityRisk: 'EXTREME',
        volatilityAtrPct: 220,
        protectionWarnings: [],
        protectionPenalty: -10,
      }),
    ).toBe(-10);
  });

  it('stopHuntDetected=true and volatilityRisk=EXTREME → penalty -20', () => {
    expect(
      computeProtectionPenalty({
        stopHuntDetected: true,
        stopHuntRisk: 'HIGH',
        volatilityRisk: 'EXTREME',
        volatilityAtrPct: 220,
        protectionWarnings: [],
        protectionPenalty: -20,
      }),
    ).toBe(-20);
  });

  it('NORMAL and stopHuntDetected=false → penalty 0', () => {
    expect(
      computeProtectionPenalty({
        stopHuntDetected: false,
        stopHuntRisk: 'LOW',
        volatilityRisk: 'NORMAL',
        volatilityAtrPct: 120,
        protectionWarnings: [],
        protectionPenalty: 0,
      }),
    ).toBe(0);
  });
});

describe('detectStopHunt', () => {
  it('wick_ratio > 0.7 + nến sau đảo chiều → detected=true', () => {
    const klines = buildFlatKlines(25);
    klines[klines.length - 2] = buildKline({
      open: 100,
      close: 101,
      high: 102,
      low: 85,
      volume: 1000,
    });
    klines[klines.length - 1] = buildKline({
      open: 100,
      close: 106,
      high: 107,
      low: 99,
    });

    const result = detectStopHunt(klines);
    expect(result.detected).toBe(true);
    expect(result.risk).toBe('MEDIUM');
  });

  it('klines bình thường → detected=false', () => {
    const result = detectStopHunt(buildFlatKlines(25, 100, 0.4));
    expect(result.detected).toBe(false);
    expect(result.risk).toBe('LOW');
  });
});

describe('computeVolatilityRisk', () => {
  it('atr_ratio > 2.0 → EXTREME', () => {
    const klines = buildFlatKlines(70, 100, 2);
    for (let i = 60; i < 70; i++) {
      klines[i] = buildKline({
        open: 100,
        close: 140,
        high: 150,
        low: 50,
        volume: 1000,
      });
    }

    const result = computeVolatilityRisk(klines);
    expect(result.volatilityRisk).toBe('EXTREME');
    expect(result.atrPct).toBeGreaterThan(200);
  });

  it('atr_ratio < 1.0 → LOW', () => {
    const klines = buildFlatKlines(70, 100, 30);
    for (let i = 55; i < 70; i++) {
      klines[i] = buildKline({
        open: 100,
        close: 100.1,
        high: 100.2,
        low: 99.9,
        volume: 1000,
      });
    }

    const result = computeVolatilityRisk(klines);
    expect(result.volatilityRisk).toBe('LOW');
    expect(result.atrPct).toBeLessThan(100);
  });

  it('klines < 64 nến → fallback NORMAL', () => {
    const result = computeVolatilityRisk(buildFlatKlines(30));
    expect(result.volatilityRisk).toBe('NORMAL');
    expect(result.atrPct).toBe(0);
  });
});

describe('buildProtectionSnapshot', () => {
  it('klines đủ → fields đúng', () => {
    const klines = buildFlatKlines(70, 100, 2);
    klines[klines.length - 2] = buildKline({
      open: 100,
      close: 101,
      high: 102,
      low: 85,
      volume: 5000,
    });
    klines[klines.length - 1] = buildKline({
      open: 100,
      close: 106,
      high: 107,
      low: 99,
    });

    const snapshot = buildProtectionSnapshot(klines);
    expect(snapshot.stopHuntDetected).toBe(true);
    expect(snapshot.stopHuntRisk).toBe('HIGH');
    expect(snapshot.volatilityRisk).toBeDefined();
    expect(snapshot.volatilityAtrPct).toBeGreaterThanOrEqual(0);
    expect(snapshot.protectionPenalty).toBe(
      computeProtectionPenalty(snapshot),
    );
    expect(Array.isArray(snapshot.protectionWarnings)).toBe(true);
  });
});

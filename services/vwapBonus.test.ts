import { describe, expect, it } from 'vitest';
import { calculateVWAPBonus } from './vwapBonus';
import type { VWAPResult } from './vwapService';

function nearVwap(overrides: Partial<VWAPResult> = {}): VWAPResult {
  return {
    vwap: 100,
    upperBand1: 101,
    upperBand2: 102,
    lowerBand1: 99,
    lowerBand2: 98,
    priceVsVwap: 0.1,
    zone: 'NEAR_VWAP',
    isNearVwap: true,
    isPullingBackToVwap: false,
    sessionStart: Date.UTC(2026, 6, 3),
    candleCount: 10,
    ...overrides,
  };
}

describe('calculateVWAPBonus', () => {
  it('LONG + VWAP + CVD dương → bonus', () => {
    const result = calculateVWAPBonus(nearVwap(), 'LONG', 1, 4_000);
    expect(result.applied).toBe(true);
    expect(result.bonusRaw).toBe(0.5);
  });

  it('LONG + VWAP + CVD âm → không bonus', () => {
    const result = calculateVWAPBonus(nearVwap(), 'LONG', 1, -43_000);
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });

  it('LONG + VWAP + CVD = 0 → không bonus', () => {
    const result = calculateVWAPBonus(nearVwap(), 'LONG', 1, 0);
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });

  it('SHORT + VWAP + CVD âm → bonus', () => {
    const result = calculateVWAPBonus(nearVwap(), 'SHORT', 1, -43_000);
    expect(result.applied).toBe(true);
    expect(result.bonusRaw).toBe(0.5);
  });

  it('SHORT + VWAP + CVD dương → không bonus', () => {
    const result = calculateVWAPBonus(nearVwap(), 'SHORT', 1, 4_000);
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });

  it('cvdValue undefined → không bonus', () => {
    const result = calculateVWAPBonus(nearVwap(), 'LONG', 1, undefined);
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });

  it('vwapData undefined → bonus 0', () => {
    const result = calculateVWAPBonus(undefined, 'LONG', 1, 4_000);
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });

  it('currentL5Raw = 2 → cap, bonus 0', () => {
    const result = calculateVWAPBonus(nearVwap(), 'LONG', 2, 4_000);
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });

  it('LONG + BELOW_BAND2 → bonus 0', () => {
    const result = calculateVWAPBonus(
      nearVwap({ zone: 'BELOW_BAND2', isNearVwap: true }),
      'LONG',
      1,
      4_000,
    );
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });

  it('SHORT + ABOVE_BAND2 → bonus 0', () => {
    const result = calculateVWAPBonus(
      nearVwap({ zone: 'ABOVE_BAND2', isNearVwap: true }),
      'SHORT',
      1,
      -43_000,
    );
    expect(result.applied).toBe(false);
    expect(result.bonusRaw).toBe(0);
  });
});

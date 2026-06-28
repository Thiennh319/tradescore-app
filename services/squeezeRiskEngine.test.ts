import { describe, expect, it } from 'vitest';
import { calculateSqueezeRisk } from './squeezeRiskEngine';
import type { SqueezeRiskInput } from '../types/squeezeRisk';

function baseInput(overrides: Partial<SqueezeRiskInput> = {}): SqueezeRiskInput {
  return {
    fundingCurrent: 0,
    fundingVelocity: 0,
    fundingAcceleration: 0,
    currentOI: 1_000_000,
    oiChange1h: 0,
    oiChange4h: 0,
    priceChange1h: 0,
    priceChange4h: 0,
    longShortRatio: 1,
    whaleWallDirection: 'NONE',
    whaleWallDistancePercent: 100,
    ...overrides,
  };
}

describe('calculateSqueezeRisk', () => {
  it('Test 1 — Long Squeeze EXTREME', () => {
    const result = calculateSqueezeRisk(
      baseInput({
        fundingCurrent: 0.015,
        fundingVelocity: 0.005,
        oiChange1h: 7,
        oiChange4h: 12,
        longShortRatio: 2.5,
        priceChange1h: 1.5,
        whaleWallDirection: 'ASK',
        whaleWallDistancePercent: 0.8,
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(9);
    expect(result.level).toBe('EXTREME');
    expect(result.direction).toBe('LONG_SQUEEZE');
    expect(result.components.fundingCrowding).toBe(2);
    expect(result.components.oiExpansion).toBe(2);
    expect(result.components.lsCrowding).toBe(2);
    expect(result.components.priceOiDivergence).toBe(2);
    expect(result.components.whaleWallConfirmation).toBe(2);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('Test 2 — Short Squeeze HIGH', () => {
    const result = calculateSqueezeRisk(
      baseInput({
        fundingCurrent: -0.012,
        fundingVelocity: -0.004,
        oiChange1h: 5,
        oiChange4h: 8,
        longShortRatio: 0.52,
        priceChange1h: -1.8,
        whaleWallDirection: 'BID',
        whaleWallDistancePercent: 1.2,
      }),
    );

    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(result.score).toBeLessThanOrEqual(8);
    expect(result.level).toBe('HIGH');
    expect(result.direction).toBe('SHORT_SQUEEZE');
  });

  it('Test 3 — NONE (balanced)', () => {
    const result = calculateSqueezeRisk(
      baseInput({
        fundingCurrent: 0,
        fundingVelocity: 0,
        oiChange1h: 0.5,
        longShortRatio: 1.1,
        priceChange1h: 0.3,
        whaleWallDirection: 'NONE',
      }),
    );

    expect(result.score).toBeLessThanOrEqual(2);
    expect(result.level).toBe('LOW');
    expect(result.direction).toBe('NONE');
    expect(result.reasons).toEqual([]);
  });

  it('Test 4 — edge case priceChange1h = 0', () => {
    const result = calculateSqueezeRisk(
      baseInput({
        oiChange1h: 5,
        priceChange1h: 0,
      }),
    );

    expect(result.components.priceOiDivergence).toBe(0);
  });
});

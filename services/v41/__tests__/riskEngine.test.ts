import { describe, expect, it } from 'vitest';
import { computeSmartSL } from '../riskEngine';
import type { MarketIntelligenceSnapshot } from '../types';
import type { ProtectionSnapshot } from '../protectionLayer';

function miSnapshot(
  overrides: Partial<MarketIntelligenceSnapshot> = {},
): MarketIntelligenceSnapshot {
  return {
    trendStrength: 80,
    trendDirection: 'BULL',
    trendExhaustion: 25,
    volumeDivergencePts: 0,
    reversalProbability: 30,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 72,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'HealthyUptrend',
    scanTimestamp: Date.now(),
    ...overrides,
  };
}

function neutralProtection(
  overrides: Partial<ProtectionSnapshot> = {},
): ProtectionSnapshot {
  return {
    stopHuntDetected: false,
    stopHuntRisk: 'LOW',
    volatilityRisk: 'NORMAL',
    volatilityAtrPct: 100,
    protectionWarnings: [],
    protectionPenalty: 0,
    ...overrides,
  };
}

const baseParams = {
  direction: 'LONG' as const,
  entryQuality: 80,
  markPrice: 100,
  marginUsdt: 100,
  leverage: 5,
};

describe('computeSmartSL', () => {
  it('trendStrength 80, NORMAL → baseSlPct 1.5%', () => {
    const result = computeSmartSL({
      ...baseParams,
      snapshot: miSnapshot({ trendStrength: 80, marketState: 'HealthyUptrend' }),
      protection: neutralProtection(),
    });

    expect(result.smartSlDistancePct).toBeCloseTo(1.5, 5);
    expect(result.smartSlPrice).toBeCloseTo(98.5, 5);
  });

  it('EXTREME volatility → × 1.3', () => {
    const normal = computeSmartSL({
      ...baseParams,
      snapshot: miSnapshot({ trendStrength: 80, marketState: 'HealthyUptrend' }),
      protection: neutralProtection(),
    });

    const extreme = computeSmartSL({
      ...baseParams,
      snapshot: miSnapshot({ trendStrength: 80, marketState: 'HealthyUptrend' }),
      protection: neutralProtection({ volatilityRisk: 'EXTREME' }),
    });

    expect(extreme.smartSlDistancePct).toBeCloseTo(normal.smartSlDistancePct * 1.3, 5);
  });

  it('maxLossUsdt ≤ marginUsdt', () => {
    const result = computeSmartSL({
      ...baseParams,
      marginUsdt: 200,
      leverage: 10,
      snapshot: miSnapshot({ trendStrength: 30, marketState: 'Transition' }),
      protection: neutralProtection({
        volatilityRisk: 'EXTREME',
        stopHuntDetected: true,
      }),
    });

    expect(result.maxLossUsdt).toBeLessThanOrEqual(200);
  });

  it('riskApproved false khi entryQuality < 70', () => {
    const result = computeSmartSL({
      ...baseParams,
      entryQuality: 65,
      snapshot: miSnapshot({ trendStrength: 80, marketState: 'HealthyUptrend' }),
      protection: neutralProtection(),
    });

    expect(result.smartSlDistancePct).toBeLessThanOrEqual(5);
    expect(result.riskApproved).toBe(false);
  });

  it('riskApproved false khi maxLossUsdt > 25% margin', () => {
    const result = computeSmartSL({
      ...baseParams,
      marginUsdt: 100,
      leverage: 20,
      snapshot: miSnapshot({ trendStrength: 80, marketState: 'HealthyUptrend' }),
      protection: neutralProtection(),
    });

    expect(result.maxLossUsdt).toBeGreaterThan(25);
    expect(result.riskApproved).toBe(false);
  });
});

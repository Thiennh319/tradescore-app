import { describe, expect, it } from 'vitest';
import {
  computeEntryQuality,
  resolveConfidenceTier,
  resolveEQThreshold,
  resolveOpportunityDirection,
  resolveQualityLabel,
  resolveQualityLabelByTier,
} from '../entryQualityEngine';
import type { ExhaustionResult } from '../exhaustionEngine';
import type { MomentumResult } from '../momentumEngine1H';
import type { MarketIntelligenceSnapshot } from '../types';
import { buildNeutralProtection } from '../protectionLayer';

function baseSnapshot(
  overrides: Partial<MarketIntelligenceSnapshot> = {},
): MarketIntelligenceSnapshot {
  return {
    trendStrength: 80,
    trendDirection: 'NEUTRAL',
    trendExhaustion: 25,
    volumeDivergencePts: 0,
    reversalProbability: 30,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 0,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'Transition',
    scanTimestamp: 0,
    ...overrides,
  };
}

function longMomentum(confirmed: boolean): MomentumResult {
  return {
    momentumLong: confirmed ? 2 : 1,
    momentumShort: 0,
    momentumConfirmedLong: confirmed,
    momentumConfirmedShort: false,
    signalsLong: confirmed ? ['BUY_VOLUME_SPIKE_1H', 'CVD_RISING_1H'] : ['BUY_VOLUME_SPIKE_1H'],
    signalsShort: [],
    tpMultiplier: confirmed ? 1.3 : 1.1,
    slMultiplier: 1.0,
  };
}

function shortMomentum(confirmed: boolean): MomentumResult {
  return {
    momentumLong: 0,
    momentumShort: confirmed ? 2 : 1,
    momentumConfirmedLong: false,
    momentumConfirmedShort: confirmed,
    signalsLong: [],
    signalsShort: confirmed ? ['SELL_VOLUME_SPIKE_1H', 'CVD_FALLING_1H'] : ['SELL_VOLUME_SPIKE_1H'],
    tpMultiplier: confirmed ? 1.3 : 1.1,
    slMultiplier: 1.0,
  };
}

function capitulationExhaustion(): ExhaustionResult {
  return {
    exhaustionDetected: true,
    exhaustionType: 'CAPITULATION',
    exhaustionStrength: 80,
    direction: 'LONG',
    confThreshold: 55,
    eqThreshold: 75,
    tpMultiplier: 1.2,
    slMultiplier: 0.8,
  };
}

describe('computeEntryQuality — ARCHITECTURE numeric example', () => {
  it('BULL + HealthyUptrend, confidence=72, reversal=30, neutral protection', () => {
    const result = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        marketConfidence: 72,
        reversalProbability: 30,
      }),
      protection: buildNeutralProtection(),
    });

    expect(result.entryQualityLong).toBe(92);
    expect(result.entryQualityShort).toBe(62);
    expect(result.buyScore).toBe(92);
    expect(result.sellScore).toBe(62);
    expect(result.opportunityDirection).toBe('LONG');
    expect(result.opportunityValid).toBe(true);
    expect(result.entryQuality).toBe(92);
    expect(result.qualityLabel).toBe('High Quality Entry');
  });
});

describe('computeEntryQuality — reversal penalties', () => {
  it('reversal ≥ 60 + LateUptrend → -20 on Long', () => {
    const neutral = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BULL',
        marketState: 'LateUptrend',
        marketConfidence: 72,
        reversalProbability: 30,
      }),
      protection: buildNeutralProtection(),
    });

    const penalized = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BULL',
        marketState: 'LateUptrend',
        marketConfidence: 72,
        reversalProbability: 60,
      }),
      protection: buildNeutralProtection(),
    });

    expect(penalized.entryQualityLong).toBe(neutral.entryQualityLong - 20);
    expect(penalized.entryQualityShort).toBe(neutral.entryQualityShort);
  });

  it('reversal ≥ 60 + Accumulation → -20 on Short', () => {
    const neutral = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BEAR',
        marketState: 'Accumulation',
        marketConfidence: 72,
        reversalProbability: 30,
      }),
      protection: buildNeutralProtection(),
    });

    const penalized = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BEAR',
        marketState: 'Accumulation',
        marketConfidence: 72,
        reversalProbability: 65,
      }),
      protection: buildNeutralProtection(),
    });

    expect(penalized.entryQualityShort).toBe(neutral.entryQualityShort - 20);
    expect(penalized.entryQualityLong).toBe(neutral.entryQualityLong);
  });
});

describe('computeEntryQuality — protection penalties', () => {
  it('stopHunt + EXTREME → -20 on both Long and Short', () => {
    const neutral = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        marketConfidence: 72,
        reversalProbability: 30,
      }),
      protection: buildNeutralProtection(),
    });

    const penalized = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        marketConfidence: 72,
        reversalProbability: 30,
      }),
      protection: {
        stopHuntDetected: true,
        volatilityRisk: 'EXTREME',
        protectionPenalty: -20,
      },
    });

    expect(penalized.entryQualityLong).toBe(neutral.entryQualityLong - 20);
    expect(penalized.entryQualityShort).toBe(neutral.entryQualityShort - 20);
  });
});

describe('resolveOpportunityDirection', () => {
  it('long=45, short=40 → NONE', () => {
    const result = resolveOpportunityDirection(45, 40);
    expect(result.opportunityDirection).toBe('NONE');
    expect(result.entryQuality).toBe(45);
    expect(result.opportunityValid).toBe(false);
  });

  it('long=75, short=60 → LONG', () => {
    const result = resolveOpportunityDirection(75, 60);
    expect(result.opportunityDirection).toBe('LONG');
    expect(result.entryQuality).toBe(75);
    expect(result.opportunityValid).toBe(true);
  });

  it('short=80, long=65 → SHORT', () => {
    const result = resolveOpportunityDirection(65, 80);
    expect(result.opportunityDirection).toBe('SHORT');
    expect(result.entryQuality).toBe(80);
    expect(result.opportunityValid).toBe(true);
  });

  it('long=70, short=70 → NONE (hòa)', () => {
    const result = resolveOpportunityDirection(70, 70);
    expect(result.opportunityDirection).toBe('NONE');
    expect(result.entryQuality).toBe(70);
    expect(result.opportunityValid).toBe(false);
  });
});

describe('resolveQualityLabel', () => {
  it.each([
    [0, 'No Trade'],
    [35, 'Watchlist'],
    [60, 'Setup Forming'],
    [75, 'Trade Ready'],
    [90, 'High Quality Entry'],
  ] as const)('score %i → %s', (score, label) => {
    expect(resolveQualityLabel(score)).toBe(label);
  });
});

describe('resolveEQThreshold', () => {
  it.each([
    [80, 70],
    [60, 70],
    [59, 75],
    [40, 75],
    [39, 80],
    [30, 80],
  ] as const)('confidence %i → threshold %i', (confidence, threshold) => {
    expect(resolveEQThreshold(confidence)).toBe(threshold);
  });
});

describe('opportunityValid với dynamic threshold', () => {
  it('EQ 72, confidence 30 → FALSE (72 < threshold 80)', () => {
    const result = resolveOpportunityDirection(72, 50, resolveEQThreshold(30));
    expect(result.entryQuality).toBe(72);
    expect(result.opportunityDirection).toBe('LONG');
    expect(result.opportunityValid).toBe(false);
  });

  it('EQ 72, confidence 65 → TRUE (72 ≥ threshold 70)', () => {
    const result = resolveOpportunityDirection(72, 50, resolveEQThreshold(65));
    expect(result.entryQuality).toBe(72);
    expect(result.opportunityValid).toBe(true);
  });

  it('EQ 76, confidence 50 → TRUE (76 ≥ threshold 75)', () => {
    const result = resolveOpportunityDirection(76, 50, resolveEQThreshold(50));
    expect(result.entryQuality).toBe(76);
    expect(result.opportunityValid).toBe(true);
  });

  it('EQ 74, confidence 50 → FALSE (74 < threshold 75)', () => {
    const result = resolveOpportunityDirection(74, 50, resolveEQThreshold(50));
    expect(result.entryQuality).toBe(74);
    expect(result.opportunityValid).toBe(false);
  });
});

describe('eqThreshold field', () => {
  it('confidence 56 → eqThreshold = 75', () => {
    const result = computeEntryQuality({
      snapshot: baseSnapshot({ marketConfidence: 56 }),
      protection: buildNeutralProtection(),
    });
    expect(result.eqThreshold).toBe(75);
  });

  it('confidence 80 → eqThreshold = 70', () => {
    const result = computeEntryQuality({
      snapshot: baseSnapshot({ marketConfidence: 80 }),
      protection: buildNeutralProtection(),
    });
    expect(result.eqThreshold).toBe(70);
  });
});

describe('confidenceTier', () => {
  it.each([
    [65, 'HIGH'],
    [50, 'MID'],
    [35, 'LOW'],
  ] as const)('confidence %i → %s', (confidence, tier) => {
    expect(resolveConfidenceTier(confidence)).toBe(tier);
  });

  it('computeEntryQuality exposes confidenceTier', () => {
    expect(
      computeEntryQuality({
        snapshot: baseSnapshot({ marketConfidence: 65 }),
        protection: buildNeutralProtection(),
      }).confidenceTier,
    ).toBe('HIGH');
    expect(
      computeEntryQuality({
        snapshot: baseSnapshot({ marketConfidence: 50 }),
        protection: buildNeutralProtection(),
      }).confidenceTier,
    ).toBe('MID');
    expect(
      computeEntryQuality({
        snapshot: baseSnapshot({ marketConfidence: 35 }),
        protection: buildNeutralProtection(),
      }).confidenceTier,
    ).toBe('LOW');
  });
});

describe('qualityLabel MID tier', () => {
  it('EQ 74, MID → Setup Forming', () => {
    expect(resolveQualityLabelByTier(74, 'MID')).toBe('Setup Forming');
  });

  it('EQ 76, MID → Trade Ready ⚠️', () => {
    expect(resolveQualityLabelByTier(76, 'MID')).toBe('Trade Ready ⚠️');
  });
});

describe('computeEntryQuality — momentum gate', () => {
  const baseParams = {
    snapshot: baseSnapshot({
      trendDirection: 'BULL' as const,
      marketState: 'HealthyUptrend' as const,
      marketConfidence: 72,
      reversalProbability: 30,
    }),
    protection: buildNeutralProtection(),
  };

  it('Conf≥70 + EQ≥85 + momentum✅ → valid', () => {
    const result = computeEntryQuality({
      ...baseParams,
      momentum: longMomentum(true),
    });
    expect(result.entryQuality).toBeGreaterThanOrEqual(85);
    expect(result.opportunityValid).toBe(true);
  });

  it('Conf≥70 + EQ≥85 + momentum❌ → invalid', () => {
    const result = computeEntryQuality({
      ...baseParams,
      momentum: longMomentum(false),
    });
    expect(result.entryQuality).toBeGreaterThanOrEqual(85);
    expect(result.opportunityValid).toBe(false);
  });
});

describe('computeEntryQuality — exhaustion thresholds', () => {
  it('Exhaustion: conf≥55 + EQ≥75 + momentum → valid', () => {
    const result = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BULL',
        marketState: 'HealthyUptrend',
        marketConfidence: 58,
        reversalProbability: 30,
      }),
      protection: buildNeutralProtection(),
      momentum: longMomentum(true),
      exhaustion: capitulationExhaustion(),
    });

    expect(result.effectiveConfThreshold).toBe(55);
    expect(result.effectiveEqThreshold).toBe(75);
    expect(result.exhaustionDetected).toBe(true);
    expect(result.opportunityValid).toBe(true);
  });
});

describe('computeEntryQuality — counter-trend thresholds', () => {
  it('Counter: conf≥60 + EQ≥80 + momentum → valid', () => {
    const result = computeEntryQuality({
      snapshot: baseSnapshot({
        trendDirection: 'BEAR',
        marketState: 'StrongDowntrend',
        marketConfidence: 62,
        reversalProbability: 30,
      }),
      protection: buildNeutralProtection(),
      momentum: shortMomentum(true),
      isCounterTrend: true,
    });

    expect(result.effectiveConfThreshold).toBe(60);
    expect(result.effectiveEqThreshold).toBe(80);
    expect(result.opportunityDirection).toBe('SHORT');
    expect(result.opportunityValid).toBe(true);
  });
});

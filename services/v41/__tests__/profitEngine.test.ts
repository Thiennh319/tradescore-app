import { describe, expect, it } from 'vitest';
import { computeSmartTP } from '../profitEngine';
import type { MarketIntelligenceSnapshot } from '../types';

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

const markPrice = 100;
const smartSlPrice = 98;

describe('computeSmartTP', () => {
  it('LONG: tp1 > markPrice', () => {
    const result = computeSmartTP({
      snapshot: miSnapshot(),
      direction: 'LONG',
      markPrice,
      smartSlPrice,
      entryQuality: 75,
    });

    expect(result.tp1Price).toBeGreaterThan(markPrice);
  });

  it('SHORT: tp1 < markPrice', () => {
    const result = computeSmartTP({
      snapshot: miSnapshot({ marketState: 'WeakDowntrend', trendDirection: 'BEAR' }),
      direction: 'SHORT',
      markPrice,
      smartSlPrice: 102,
      entryQuality: 75,
    });

    expect(result.tp1Price).toBeLessThan(markPrice);
  });

  it('StrongUptrend → TP xa hơn base', () => {
    const base = computeSmartTP({
      snapshot: miSnapshot({ marketState: 'HealthyUptrend' }),
      direction: 'LONG',
      markPrice,
      smartSlPrice,
      entryQuality: 75,
    });

    const strong = computeSmartTP({
      snapshot: miSnapshot({ marketState: 'StrongUptrend' }),
      direction: 'LONG',
      markPrice,
      smartSlPrice,
      entryQuality: 75,
    });

    expect(strong.tp1Price).toBeGreaterThan(base.tp1Price);
    expect(strong.riskRewardRatio).toBeGreaterThan(base.riskRewardRatio);
  });

  it('Transition → TP gần hơn base', () => {
    const base = computeSmartTP({
      snapshot: miSnapshot({ marketState: 'HealthyUptrend' }),
      direction: 'LONG',
      markPrice,
      smartSlPrice,
      entryQuality: 75,
    });

    const transition = computeSmartTP({
      snapshot: miSnapshot({ marketState: 'Transition' }),
      direction: 'LONG',
      markPrice,
      smartSlPrice,
      entryQuality: 75,
    });

    expect(transition.tp1Price).toBeLessThan(base.tp1Price);
    expect(transition.riskRewardRatio).toBeLessThan(base.riskRewardRatio);
  });

  it('LONG: tp1 < tp2 < tp3', () => {
    const result = computeSmartTP({
      snapshot: miSnapshot({ marketState: 'StrongUptrend' }),
      direction: 'LONG',
      markPrice,
      smartSlPrice,
      entryQuality: 90,
    });

    expect(result.tp1Price).toBeLessThan(result.tp2Price);
    expect(result.tp2Price).toBeLessThan(result.tp3Price);
  });
});

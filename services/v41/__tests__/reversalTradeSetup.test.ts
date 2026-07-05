import { describe, expect, it } from 'vitest';
import type { OpportunitySnapshot } from '../entryQualityEngine';
import type { KlineV41 } from '../indicators';
import type { MomentumResult } from '../momentumEngine1H';
import type { ReversalState } from '../reversalDetector';
import { generateReversalSetup } from '../reversalTradeSetup';
import type { MarketIntelligenceSnapshot } from '../types';

function buildKline(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 105,
    low: 95,
    close: 100,
    volume: 1000,
    closeTime: 1,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildFlatKlines(count: number): KlineV41[] {
  return Array.from({ length: count }, (_, index) =>
    buildKline({ openTime: index, closeTime: index + 1 }),
  );
}

function buildSnapshot(
  overrides: Partial<MarketIntelligenceSnapshot> = {},
): MarketIntelligenceSnapshot {
  return {
    trendStrength: 50,
    trendDirection: 'BEAR',
    trendExhaustion: 40,
    volumeDivergencePts: 0,
    reversalProbability: 30,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 70,
    btcAlignmentFactor: 0.9,
    btcDirection: 'BEAR',
    marketState: 'WeakDowntrend',
    scanTimestamp: Date.now(),
    ...overrides,
  };
}

function buildOpportunity(
  overrides: Partial<OpportunitySnapshot> = {},
): OpportunitySnapshot {
  return {
    buyScore: 50,
    sellScore: 50,
    entryQuality: 85,
    entryQualityLong: 85,
    entryQualityShort: 85,
    opportunityDirection: 'LONG',
    opportunityValid: true,
    qualityLabel: 'Trade Ready',
    eqThreshold: 70,
    confidenceTier: 'HIGH',
    momentumConfirmedLong: true,
    momentumConfirmedShort: false,
    exhaustionDetected: false,
    exhaustionType: 'NONE',
    effectiveConfThreshold: 60,
    effectiveEqThreshold: 70,
    ...overrides,
  };
}

function buildMomentum(overrides: Partial<MomentumResult> = {}): MomentumResult {
  return {
    momentumLong: 2,
    momentumShort: 0,
    momentumConfirmedLong: true,
    momentumConfirmedShort: false,
    signalsLong: ['BUY_VOLUME_SPIKE_1H'],
    signalsShort: [],
    tpMultiplier: 1.0,
    slMultiplier: 1.0,
    ...overrides,
  };
}

function buildReversalState(
  overrides: Partial<ReversalState> = {},
): ReversalState {
  return {
    phase: 'RETEST_CONFIRMED',
    detectedAt: Date.now(),
    retestPrice: 99,
    counterDirection: 'LONG',
    expiresAt: null,
    symbol: 'NEARUSDT',
    ...overrides,
  };
}

function buildValidParams(
  overrides: {
    snapshot?: Partial<MarketIntelligenceSnapshot>;
    opportunity?: Partial<OpportunitySnapshot>;
    momentum?: Partial<MomentumResult>;
    reversalState?: Partial<ReversalState>;
  } = {},
) {
  return {
    symbol: 'NEARUSDT',
    reversalState: buildReversalState(overrides.reversalState),
    klines1H: buildFlatKlines(25),
    markPrice: 100,
    snapshot: buildSnapshot(overrides.snapshot),
    opportunity: buildOpportunity(overrides.opportunity),
    momentum: buildMomentum(overrides.momentum),
  };
}

describe('generateReversalSetup', () => {
  it('3 điều kiện đủ → setup valid', () => {
    const setup = generateReversalSetup(buildValidParams());

    expect(setup).not.toBeNull();
    expect(setup?.direction).toBe('LONG');
    expect(setup?.entryPrice).toBe(100);
    expect(setup?.isCounterTrend).toBe(true);
  });

  it('thiếu momentum → null', () => {
    const params = buildValidParams();
    const setup = generateReversalSetup({ ...params, momentum: undefined });

    expect(setup).toBeNull();
  });

  it('thiếu conf → null', () => {
    const setup = generateReversalSetup(
      buildValidParams({ snapshot: { marketConfidence: 55 } }),
    );

    expect(setup).toBeNull();
  });

  it('thiếu EQ counter → null', () => {
    const setup = generateReversalSetup(
      buildValidParams({ opportunity: { entryQualityLong: 75 } }),
    );

    expect(setup).toBeNull();
  });

  it('CAPITULATION → TP × 1.2 so với mặc định', () => {
    const baseParams = buildValidParams({
      opportunity: { exhaustionType: 'NONE' },
    });
    const capitulationParams = buildValidParams({
      opportunity: { exhaustionType: 'CAPITULATION' },
    });

    const defaultSetup = generateReversalSetup(baseParams);
    const capitulationSetup = generateReversalSetup(capitulationParams);

    expect(defaultSetup).not.toBeNull();
    expect(capitulationSetup).not.toBeNull();

    const defaultTp1Distance = Math.abs(defaultSetup!.tp1Price - defaultSetup!.entryPrice);
    const capitulationTp1Distance = Math.abs(
      capitulationSetup!.tp1Price - capitulationSetup!.entryPrice,
    );

    expect(capitulationTp1Distance / defaultTp1Distance).toBeCloseTo(1.2 / 0.8, 5);
    expect(capitulationSetup!.tp1RR).toBeCloseTo(1.5 * 1.2, 5);
    expect(defaultSetup!.tp1RR).toBeCloseTo(1.5 * 0.8, 5);
  });

  it('SHORT counter yêu cầu momentumConfirmedShort', () => {
    const setup = generateReversalSetup(
      buildValidParams({
        reversalState: { counterDirection: 'SHORT' },
        momentum: {
          momentumConfirmedLong: true,
          momentumConfirmedShort: false,
        },
      }),
    );

    expect(setup).toBeNull();
  });
});

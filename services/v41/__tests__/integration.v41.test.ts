/**
 * V4.1 integration — end-to-end scenario tests.
 * Wires entry quality, unified signal, reversal setup, exhaustion, momentum.
 */

import { describe, expect, it } from 'vitest';
import { buildUnifiedSignal } from '../../unifiedSignalEngine';
import { computeEntryQuality, type OpportunitySnapshot } from '../entryQualityEngine';
import type { EarlyWarningSeverity } from '../earlyWarningEngine';
import { computeExhaustion, type ExhaustionResult } from '../exhaustionEngine';
import type { KlineV41 } from '../indicators';
import type { MomentumResult } from '../momentumEngine1H';
import { NEUTRAL_PROTECTION } from '../protectionLayer';
import type { ReversalState } from '../reversalDetector';
import { generateReversalSetup } from '../reversalTradeSetup';
import type { SignalRowV41 } from '../scanV41';
import type { MarketIntelligenceSnapshot } from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

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

function snapshot(
  overrides: Partial<MarketIntelligenceSnapshot> = {},
): MarketIntelligenceSnapshot {
  return {
    trendStrength: 70,
    trendDirection: 'BULL',
    trendExhaustion: 25,
    volumeDivergencePts: 0,
    reversalProbability: 25,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 75,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'StrongUptrend',
    scanTimestamp: Date.now(),
    ...overrides,
  };
}

function momentumLong(confirmed: boolean): MomentumResult {
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

function momentumShort(confirmed: boolean): MomentumResult {
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

function capitulationLong(): ExhaustionResult {
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

function earlyWarning(
  severity: EarlyWarningSeverity,
  direction: 'LONG' | 'SHORT' | 'BOTH' = 'LONG',
  signalCount = 1,
) {
  return {
    rawSeverity: severity,
    severity,
    signals30M: [],
    signals1H: [],
    signalCount,
    volumeConfirmed: severity !== 'WARNING_SOFT',
    warningMessage: '⚠️ test',
    blockMessage: '🔴 Đảo chiều xác nhận 30M+1H+Volume — không vào lệnh',
    direction,
  };
}

function reversalConfirmed(
  counterDirection: 'LONG' | 'SHORT',
): ReversalState {
  return {
    phase: 'RETEST_CONFIRMED',
    detectedAt: Date.now(),
    retestPrice: 99,
    counterDirection,
    expiresAt: null,
    symbol: 'NEARUSDT',
  };
}

interface PipelineInput {
  snapshot: MarketIntelligenceSnapshot;
  momentum?: MomentumResult;
  exhaustion?: ExhaustionResult;
  earlyWarningSeverity?: EarlyWarningSeverity;
  earlyWarningDirection?: 'LONG' | 'SHORT' | 'BOTH';
  earlyWarningSignalCount?: number;
  reversalState?: ReversalState;
  opportunityPatch?: Partial<OpportunitySnapshot>;
  visibilityMode?: SignalRowV41['visibilityMode'];
}

function runPipeline(input: PipelineInput): {
  row: SignalRowV41;
  opportunity: OpportunitySnapshot;
  longActive: boolean;
  unified: ReturnType<typeof buildUnifiedSignal>;
  reversalSetup: ReturnType<typeof generateReversalSetup>;
} {
  const ewBlocked = input.earlyWarningSeverity === 'BLOCK';
  const computed = computeEntryQuality({
    snapshot: input.snapshot,
    protection: NEUTRAL_PROTECTION,
    momentum: input.momentum,
    exhaustion: input.exhaustion,
    earlyWarningBlocked: ewBlocked,
  });

  const opportunity: OpportunitySnapshot = input.opportunityPatch
    ? { ...computed, ...input.opportunityPatch }
    : computed;

  const earlyWarningSnapshot =
    input.earlyWarningSeverity && input.earlyWarningSeverity !== 'CLEAR'
      ? {
          ...earlyWarning(
            input.earlyWarningSeverity,
            input.earlyWarningDirection ?? 'LONG',
            input.earlyWarningSignalCount ?? 1,
          ),
          severity: input.earlyWarningSeverity,
        }
      : undefined;

  const row: SignalRowV41 = {
    symbol: 'NEARUSDT',
    snapshot: input.snapshot,
    visibilityMode: input.visibilityMode ?? 'TRADE_MODE',
    opportunity,
    protection: NEUTRAL_PROTECTION,
    earlyWarning: earlyWarningSnapshot,
    reversalState: input.reversalState,
    klines1H: buildFlatKlines(25),
    momentum: input.momentum,
    exhaustion: input.exhaustion,
    markPrice: 100,
    fetchedAt: Date.now(),
  };

  const isEwBlock = row.earlyWarning?.severity === 'BLOCK';
  const longActive =
    row.visibilityMode === 'TRADE_MODE' &&
    !isEwBlock &&
    opportunity.opportunityDirection === 'LONG' &&
    opportunity.entryQualityLong >= opportunity.eqThreshold &&
    row.snapshot.marketConfidence >= opportunity.effectiveConfThreshold &&
    (row.momentum?.momentumConfirmedLong ?? opportunity.momentumConfirmedLong);

  const unified = buildUnifiedSignal({ symbol: row.symbol, v41Row: row });

  const reversalSetup = input.reversalState
    ? generateReversalSetup({
        symbol: row.symbol,
        reversalState: input.reversalState,
        klines1H: row.klines1H ?? [],
        markPrice: row.markPrice ?? 100,
        snapshot: row.snapshot,
        opportunity: row.opportunity,
        momentum: row.momentum,
      })
    : null;

  return { row, opportunity, longActive, unified, reversalSetup };
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

describe('V4.1 integration scenarios', () => {
  it('SCENARIO 1 — Thuận xu hướng mạnh: LONG active, TP × 1.3', () => {
    const { opportunity, longActive, unified } = runPipeline({
      snapshot: snapshot({
        marketState: 'StrongUptrend',
        trendDirection: 'BULL',
        marketConfidence: 75,
      }),
      momentum: momentumLong(true),
      earlyWarningSeverity: 'CLEAR',
    });

    expect(opportunity.opportunityValid).toBe(true);
    expect(opportunity.opportunityDirection).toBe('LONG');
    expect(opportunity.entryQualityLong).toBeGreaterThanOrEqual(85);
    expect(opportunity.momentumConfirmedLong).toBe(true);
    expect(longActive).toBe(true);
    expect(unified.strength).toBe('STRONG_V41');
    expect(unified.direction).toBe('LONG');
    expect(unified.canEnter).toBe(true);
    expect(momentumLong(true).tpMultiplier).toBe(1.3);
  });

  it('SCENARIO 2 — Block đúng rule: thiếu momentum → CHẶN', () => {
    const { opportunity, longActive, unified } = runPipeline({
      snapshot: snapshot({
        marketState: 'HealthyUptrend',
        trendDirection: 'BULL',
        marketConfidence: 75,
      }),
      momentum: momentumLong(false),
      earlyWarningSeverity: 'CLEAR',
      opportunityPatch: {
        entryQuality: 88,
        entryQualityLong: 88,
      },
    });

    expect(opportunity.opportunityValid).toBe(false);
    expect(opportunity.momentumConfirmedLong).toBe(false);
    expect(longActive).toBe(false);
    expect(unified.v41CanEnter).toBe(false);
    expect(unified.canEnter).toBe(false);
  });

  it('SCENARIO 3 — Exhaustion rescue: CAPITULATION → RESCUE LONG active', () => {
    const exhaustion = capitulationLong();
    const { unified } = runPipeline({
      snapshot: snapshot({
        marketState: 'StrongDowntrend',
        trendDirection: 'BEAR',
        marketConfidence: 58,
      }),
      momentum: momentumLong(true),
      exhaustion,
      earlyWarningSeverity: 'CLEAR',
      opportunityPatch: {
        opportunityDirection: 'LONG',
        entryQuality: 76,
        entryQualityLong: 76,
        opportunityValid: true,
        exhaustionDetected: true,
        exhaustionType: 'CAPITULATION',
      },
    });

    expect(unified.strength).toBe('RESCUE');
    expect(unified.direction).toBe('LONG');
    expect(unified.canEnter).toBe(true);
    expect(unified.strengthLabel).toContain('CAPITULATION');
  });

  it('SCENARIO 4 — Đảo chiều BULL→SHORT: SHORT Counter active', () => {
    const { reversalSetup } = runPipeline({
      snapshot: snapshot({
        marketState: 'HealthyUptrend',
        trendDirection: 'BULL',
        marketConfidence: 62,
      }),
      momentum: momentumShort(true),
      earlyWarningSeverity: 'BLOCK',
      earlyWarningDirection: 'LONG',
      earlyWarningSignalCount: 3,
      reversalState: reversalConfirmed('SHORT'),
      opportunityPatch: {
        opportunityDirection: 'SHORT',
        entryQuality: 81,
        entryQualityShort: 81,
        entryQualityLong: 55,
        eqThreshold: 80,
        effectiveConfThreshold: 60,
        effectiveEqThreshold: 80,
        momentumConfirmedShort: true,
      },
    });

    expect(reversalSetup).not.toBeNull();
    expect(reversalSetup?.direction).toBe('SHORT');
    expect(reversalSetup?.isCounterTrend).toBe(true);
  });

  it('SCENARIO 5 — Đảo chiều BEAR→LONG: LONG Counter active', () => {
    const { reversalSetup } = runPipeline({
      snapshot: snapshot({
        marketState: 'WeakDowntrend',
        trendDirection: 'BEAR',
        marketConfidence: 63,
      }),
      momentum: momentumLong(true),
      earlyWarningSeverity: 'BLOCK',
      earlyWarningDirection: 'SHORT',
      reversalState: reversalConfirmed('LONG'),
      opportunityPatch: {
        opportunityDirection: 'LONG',
        entryQuality: 82,
        entryQualityLong: 82,
        entryQualityShort: 50,
        eqThreshold: 80,
        effectiveConfThreshold: 60,
        effectiveEqThreshold: 80,
        momentumConfirmedLong: true,
      },
    });

    expect(reversalSetup).not.toBeNull();
    expect(reversalSetup?.direction).toBe('LONG');
    expect(reversalSetup?.isCounterTrend).toBe(true);
  });

  it('SCENARIO 6 — Funding extreme: RESCUE LONG (short squeeze)', () => {
    const exhaustion = computeExhaustion({
      klines1H: buildFlatKlines(22),
      trendExhaustion: 40,
      trendDirection: 'BEAR',
      fundingRate: -0.00035,
    });

    expect(exhaustion.exhaustionType).toBe('FUNDING_EXTREME');
    expect(exhaustion.direction).toBe('LONG');

    const { unified } = runPipeline({
      snapshot: snapshot({
        marketState: 'StrongDowntrend',
        trendDirection: 'BEAR',
        marketConfidence: 57,
      }),
      momentum: momentumLong(true),
      exhaustion,
      earlyWarningSeverity: 'CLEAR',
      opportunityPatch: {
        opportunityDirection: 'LONG',
        entryQuality: 76,
        entryQualityLong: 76,
        opportunityValid: true,
        exhaustionDetected: true,
        exhaustionType: 'FUNDING_EXTREME',
      },
    });

    expect(unified.strength).toBe('RESCUE');
    expect(unified.direction).toBe('LONG');
    expect(unified.canEnter).toBe(true);
    expect(unified.strengthLabel).toContain('FUNDING_EXTREME');
  });

  it('SCENARIO 7 — Tất cả block: Transition + no momentum + EW BLOCK → NONE', () => {
    const { opportunity, longActive, unified } = runPipeline({
      snapshot: snapshot({
        marketState: 'Transition',
        trendDirection: 'NEUTRAL',
        marketConfidence: 50,
      }),
      momentum: momentumLong(false),
      earlyWarningSeverity: 'BLOCK',
      earlyWarningDirection: 'BOTH',
    });

    expect(opportunity.opportunityValid).toBe(false);
    expect(longActive).toBe(false);
    expect(unified.strength).toBe('NONE');
    expect(unified.direction).toBe('NONE');
    expect(unified.canEnter).toBe(false);
  });
});

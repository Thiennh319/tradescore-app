import { describe, expect, it } from 'vitest';
import { mockTradePlanV3 } from '../tradePlanTestFixtures';
import {
  buildUnifiedSignal,
  compareUnifiedSignalPriority,
  type SignalRowWithDirSnapshots,
} from '../unifiedSignalEngine';
import type { OpportunitySnapshot } from '../v41/entryQualityEngine';
import type { ExhaustionResult } from '../v41/exhaustionEngine';
import type { MomentumResult } from '../v41/momentumEngine1H';
import { generateTradeSetupV41 } from '../v41/tradeSetupGenerator';
import { NEUTRAL_PROTECTION } from '../v41/protectionLayer';
import type { SignalRowV41 } from '../v41/scanV41';
import type { MarketIntelligenceSnapshot } from '../v41/types';

function miSnapshot(
  overrides: Partial<MarketIntelligenceSnapshot> = {},
): MarketIntelligenceSnapshot {
  return {
    trendStrength: 75,
    trendDirection: 'BULL',
    trendExhaustion: 20,
    volumeDivergencePts: 0,
    reversalProbability: 25,
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

function confirmedMomentum(direction: 'LONG' | 'SHORT'): MomentumResult {
  if (direction === 'LONG') {
    return {
      momentumLong: 2,
      momentumShort: 0,
      momentumConfirmedLong: true,
      momentumConfirmedShort: false,
      signalsLong: ['BUY_VOLUME_SPIKE_1H', 'CVD_RISING_1H'],
      signalsShort: [],
      tpMultiplier: 1.3,
      slMultiplier: 1.0,
    };
  }
  return {
    momentumLong: 0,
    momentumShort: 2,
    momentumConfirmedLong: false,
    momentumConfirmedShort: true,
    signalsLong: [],
    signalsShort: ['SELL_VOLUME_SPIKE_1H', 'CVD_FALLING_1H'],
    tpMultiplier: 1.3,
    slMultiplier: 1.0,
  };
}

function v41Opportunity(
  direction: 'LONG' | 'SHORT',
  eq: number,
): OpportunitySnapshot {
  return {
    buyScore: direction === 'LONG' ? 80 : 20,
    sellScore: direction === 'LONG' ? 20 : 80,
    entryQuality: eq,
    entryQualityLong: direction === 'LONG' ? eq : 30,
    entryQualityShort: direction === 'SHORT' ? eq : 30,
    opportunityDirection: direction,
    opportunityValid: true,
    qualityLabel: 'High Quality Entry',
    eqThreshold: 85,
    confidenceTier: 'HIGH',
    momentumConfirmedLong: direction === 'LONG',
    momentumConfirmedShort: direction === 'SHORT',
    exhaustionDetected: false,
    exhaustionType: 'NONE',
    effectiveConfThreshold: 70,
    effectiveEqThreshold: 85,
  };
}

function v4RowLong(score: number, canEnter = true): SignalRowWithDirSnapshots {
  const plan = mockTradePlanV3({
    symbol: 'NEARUSDT',
    direction: 'LONG',
    recommendedEntry: 102,
    stopLoss: { ...mockTradePlanV3().stopLoss, price: 96 },
    tp1: { ...mockTradePlanV3().tp1, price: 112 },
    tp2: { ...mockTradePlanV3().tp2, price: 118 },
    tp3: { ...mockTradePlanV3().tp3, price: 128 },
  });

  return {
    symbol: 'NEARUSDT',
    price: 100,
    change24h: 1.2,
    trend: 'UP',
    regimeConfidence: 70,
    score,
    longScore: score,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'VÀO TỰ TIN',
    winrate: '~65%',
    canEnter,
    tradePlan: null,
    tradePlanV3: plan,
    tradePlansByScorer: { v4: plan },
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    longSnapshot: { canEnter },
    shortSnapshot: { canEnter: false },
  } as SignalRowWithDirSnapshots;
}

function v4RowDisabled(): SignalRowWithDirSnapshots {
  return v4RowLong(8, false);
}

function v41Row(
  conf: number,
  eq: number,
  direction: 'LONG' | 'SHORT',
  marketState: MarketIntelligenceSnapshot['marketState'],
  markPrice = 100,
  overrides: Partial<SignalRowV41> = {},
): SignalRowV41 {
  return {
    symbol: 'NEARUSDT',
    snapshot: miSnapshot({ marketConfidence: conf, marketState }),
    visibilityMode: 'TRADE_MODE',
    opportunity: v41Opportunity(direction, eq),
    protection: NEUTRAL_PROTECTION,
    momentum: confirmedMomentum(direction),
    markPrice,
    fetchedAt: Date.now(),
    ...overrides,
  };
}

describe('buildUnifiedSignal — STRONG (cả 2 thỏa)', () => {
  it('Test 1: V4 score 10.0 + Conf 75 + EQ 87 + HealthyUptrend → STRONG LONG', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(75, 87, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('STRONG');
    expect(result.canEnter).toBe(true);
    expect(result.direction).toBe('LONG');
    expect(result.v4CanEnter).toBe(true);
    expect(result.v41CanEnter).toBe(true);
  });

  it('Test 2: boundary Conf 70 + EQ 85 → STRONG', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(70, 85, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('STRONG');
    expect(result.canEnter).toBe(true);
  });
});

describe('buildUnifiedSignal — STRONG_V41 (chỉ V4.1 đủ mạnh)', () => {
  it('Test 3: V4 ❌ + Conf 72 + EQ 87 + StrongUptrend LONG → STRONG_V41', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(72, 87, 'LONG', 'StrongUptrend'),
    });

    expect(result.strength).toBe('STRONG_V41');
    expect(result.canEnter).toBe(true);
    expect(result.direction).toBe('LONG');
  });

  it('Test 4: boundary Conf 70 + EQ 85 + HealthyUptrend → STRONG_V41', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(70, 85, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('STRONG_V41');
    expect(result.canEnter).toBe(true);
  });

  it('Test 5: Conf 75 + EQ 90 + StrongDowntrend SHORT → STRONG_V41 SHORT', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(75, 90, 'SHORT', 'StrongDowntrend'),
    });

    expect(result.strength).toBe('STRONG_V41');
    expect(result.direction).toBe('SHORT');
    expect(result.canEnter).toBe(true);
  });
});

describe('buildUnifiedSignal — MEDIUM (chỉ V4 thỏa)', () => {
  it('Test 6: V4 score 9.5 + Conf 65 + EQ 80 → MEDIUM', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(9.5),
      v41Row: v41Row(65, 80, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('MEDIUM');
    expect(result.canEnter).toBe(true);
    expect(result.direction).toBe('LONG');
  });

  it('Test 7: V4 ✅ + Conf 50 + EQ 60 → MEDIUM', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(50, 60, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('MEDIUM');
    expect(result.canEnter).toBe(true);
  });
});

describe('buildUnifiedSignal — WATCH (V4.1 có data nhưng chưa đủ)', () => {
  it('Test 8: Conf 65 + EQ 87 → WATCH, blockReasons chứa Confidence', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(65, 87, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('WATCH');
    expect(result.canEnter).toBe(false);
    expect(result.blockReasons.some((r) => r.includes('Confidence'))).toBe(true);
  });

  it('Test 9: Conf 75 + EQ 80 → WATCH, blockReasons chứa Entry Quality', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(75, 80, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('WATCH');
    expect(result.canEnter).toBe(false);
    expect(result.blockReasons.some((r) => r.includes('Entry Quality'))).toBe(true);
  });

  it('Test 10: Conf 72 + EQ 87 + LateUptrend → WATCH (state không thuận)', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(72, 87, 'LONG', 'LateUptrend'),
    });

    expect(result.strength).toBe('WATCH');
    expect(result.canEnter).toBe(false);
  });

  it('Test 11: Conf 50 + EQ 50 → WATCH', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(50, 50, 'LONG', 'HealthyUptrend'),
    });

    expect(result.strength).toBe('WATCH');
    expect(result.canEnter).toBe(false);
  });
});

describe('buildUnifiedSignal — NONE', () => {
  it('Test 12: V4 ❌ + không có V4.1 → NONE', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
    });

    expect(result.strength).toBe('NONE');
    expect(result.canEnter).toBe(false);
  });

  it('Test 13: V4 LONG ✅ + V4.1 SHORT ✅ → xung đột → NONE', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(75, 87, 'SHORT', 'StrongDowntrend'),
    });

    expect(result.strength).toBe('NONE');
    expect(result.canEnter).toBe(false);
    expect(result.blockReasons.some((r) => r.toLowerCase().includes('xung đột'))).toBe(true);
  });
});

describe('buildUnifiedSignal — priority', () => {
  it('Test 14: STRONG priority = 100', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(75, 87, 'LONG', 'HealthyUptrend'),
    });
    expect(result.priority).toBe(100);
  });

  it('Test 15: STRONG_V41 priority = 90', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(72, 87, 'LONG', 'StrongUptrend'),
    });
    expect(result.priority).toBe(90);
  });

  it('Test 16: MEDIUM priority = 80', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(65, 80, 'LONG', 'HealthyUptrend'),
    });
    expect(result.priority).toBe(80);
  });

  it('Test 17: WATCH priority = 40', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(65, 87, 'LONG', 'HealthyUptrend'),
    });
    expect(result.priority).toBe(40);
  });

  it('Test 18: NONE priority = 0; STRONG > RESCUE > STRONG_V41 > MEDIUM > WATCH > NONE', () => {
    const strong = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(75, 87, 'LONG', 'HealthyUptrend'),
    });
    const strongV41 = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(72, 87, 'LONG', 'StrongUptrend'),
    });
    const medium = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(10),
      v41Row: v41Row(65, 80, 'LONG', 'HealthyUptrend'),
    });
    const watch = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(65, 87, 'LONG', 'HealthyUptrend'),
    });
    const none = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
    });

    expect(strong.priority).toBe(100);
    expect(strongV41.priority).toBe(90);
    expect(medium.priority).toBe(80);
    expect(watch.priority).toBe(40);
    expect(none.priority).toBe(0);

    expect(compareUnifiedSignalPriority(strong, strongV41)).toBeGreaterThan(0);
    expect(compareUnifiedSignalPriority(strongV41, medium)).toBeGreaterThan(0);
    expect(compareUnifiedSignalPriority(medium, watch)).toBeGreaterThan(0);
    expect(compareUnifiedSignalPriority(watch, none)).toBeGreaterThan(0);
  });
});

describe('buildUnifiedSignal — merge Entry/SL/TP (STRONG)', () => {
  const markPrice = 2.01;
  const v41Base = v41Row(75, 87, 'LONG', 'HealthyUptrend', markPrice);
  const v41Setup = generateTradeSetupV41({
    snapshot: v41Base.snapshot,
    opportunity: v41Base.opportunity!,
    protection: NEUTRAL_PROTECTION,
    direction: 'LONG',
    markPrice,
    marginUsdt: 6,
    leverage: 5,
  });

  const v4MergeRow = v4RowLong(10);
  v4MergeRow.price = markPrice;
  v4MergeRow.tradePlansByScorer = {
    v4: mockTradePlanV3({
      symbol: 'NEARUSDT',
      direction: 'LONG',
      recommendedEntry: 2.005,
      stopLoss: { ...mockTradePlanV3().stopLoss, price: 1.978 },
      tp1: { ...mockTradePlanV3().tp1, price: 2.068 },
      tp2: { ...mockTradePlanV3().tp2, price: 2.098 },
      tp3: { ...mockTradePlanV3().tp3, price: 2.15 },
    }),
  };

  it('Test 19: STRONG LONG entryPrice = min(V4, V4.1)', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4MergeRow,
      v41Row: v41Base,
    });

    expect(result.strength).toBe('STRONG');
    expect(result.entryPrice).toBe(2.005);
    expect(result.entryPrice).toBe(
      Math.min(2.005, v41Setup.markPrice),
    );
  });

  it('Test 20: STRONG LONG slPrice = min(V4, V4.1)', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4MergeRow,
      v41Row: v41Base,
    });

    expect(result.strength).toBe('STRONG');
    expect(result.slPrice).toBe(Math.min(1.978, v41Setup.smartSlPrice));
  });

  it('Test 21: STRONG LONG tp1 = min, tp2 = max', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4MergeRow,
      v41Row: v41Base,
    });

    expect(result.strength).toBe('STRONG');
    expect(result.tp1Price).toBe(Math.min(2.068, v41Setup.tp1Price));
    expect(result.tp2Price).toBe(Math.max(2.098, v41Setup.tp2Price));
  });
});

describe('buildUnifiedSignal — momentum + RESCUE', () => {
  it('STRONG_V41 cần momentum confirmed', () => {
    const withoutMomentum = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(72, 87, 'LONG', 'StrongUptrend', 100, { momentum: undefined }),
    });

    expect(withoutMomentum.strength).toBe('WATCH');
    expect(withoutMomentum.canEnter).toBe(false);
    expect(withoutMomentum.blockReasons.some((r) => r.includes('Momentum'))).toBe(true);
  });

  it('MEDIUM: V4 không cần momentum', () => {
    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowLong(9.5),
      v41Row: v41Row(65, 80, 'LONG', 'HealthyUptrend', 100, { momentum: undefined }),
    });

    expect(result.strength).toBe('MEDIUM');
    expect(result.canEnter).toBe(true);
  });

  it('RESCUE case: exhaustion + momentum ngược', () => {
    const exhaustion: ExhaustionResult = {
      exhaustionDetected: true,
      exhaustionType: 'CAPITULATION',
      exhaustionStrength: 80,
      direction: 'LONG',
      confThreshold: 55,
      eqThreshold: 75,
      tpMultiplier: 1.2,
      slMultiplier: 0.8,
    };

    const result = buildUnifiedSignal({
      symbol: 'NEARUSDT',
      v4Row: v4RowDisabled(),
      v41Row: v41Row(58, 80, 'LONG', 'HealthyUptrend', 100, { exhaustion }),
    });

    expect(result.strength).toBe('RESCUE');
    expect(result.canEnter).toBe(true);
    expect(result.priority).toBe(95);
    expect(result.strengthLabel).toContain('CAPITULATION');
    expect(result.strengthColor).toBe('#A855F7');
  });
});

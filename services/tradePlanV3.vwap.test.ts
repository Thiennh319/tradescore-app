import { describe, expect, it } from 'vitest';
import type { TradePlanV3 } from '../constants/scoring';
import {
  applyVWAPEntryToPlan,
  computeTradeMaxLossUSDT,
  recalculatePlanAfterEntryChange,
} from './tradePlanV3';
import type { VWAPResult } from './vwapService';

function vwapResult(vwap: number): VWAPResult {
  return {
    vwap,
    upperBand1: vwap * 1.01,
    lowerBand1: vwap * 0.99,
    upperBand2: vwap * 1.02,
    lowerBand2: vwap * 0.98,
    priceVsVwap: 0,
    zone: 'NEAR_VWAP',
    isNearVwap: true,
    isPullingBackToVwap: false,
    sessionStart: 0,
    candleCount: 24,
  };
}

function makeLongPlan(overrides: {
  entry: number;
  sl: number;
  tp1: number;
  slType?: TradePlanV3['stopLoss']['type'];
  notional?: number;
  decision?: TradePlanV3['decision'];
}): TradePlanV3 {
  const { entry, sl, tp1, slType = 'ATR_BASED', notional = 30, decision = 'VAO_TU_TIN' } =
    overrides;
  const slDist = entry - sl;
  return {
    symbol: 'BTCUSDT',
    direction: 'LONG',
    generatedAt: Date.now(),
    totalScore: 10,
    decision,
    marketMode: 'TRENDING',
    groupScores: { A: 3, B: 3, C: 3 },
    entryZone: {
      optimal: entry,
      aggressive: entry,
      conservative: entry - 1,
      rangeLow: entry - 2,
      rangeHigh: entry + 1,
      quality: 'GOOD',
      distanceFromCurrentPct: 0,
      reasoning: 'test',
      entryType: 'LIMIT_NEAR',
    },
    recommendedEntry: entry,
    stopLoss: {
      price: sl,
      type: slType,
      atrDistance: slDist,
      distancePct: (slDist / entry) * 100,
      maxLossUSDT: computeTradeMaxLossUSDT(notional, entry, sl),
      quality: 'NORMAL',
      reasoning: 'test SL',
      isProtectedByWall: slType === 'WHALE_PROTECTED',
    },
    tp1: {
      price: tp1,
      rrRatio: slDist > 0 ? (tp1 - entry) / slDist : 2,
      type: 'RR_BASED',
      sizeToClose: 0.5,
      expectedPnlUSDT: 1,
      reasoning: 'tp1',
      probability: 0.7,
    },
    tp2: {
      price: tp1 + slDist,
      rrRatio: 3,
      type: 'RR_BASED',
      sizeToClose: 0.3,
      expectedPnlUSDT: 1.2,
      reasoning: 'tp2',
      probability: 0.55,
    },
    tp3: {
      price: tp1 + slDist * 2,
      rrRatio: 4,
      type: 'RR_BASED',
      sizeToClose: 0.2,
      expectedPnlUSDT: 1.5,
      reasoning: 'tp3',
      probability: 0.4,
    },
    positionSize: 6,
    positionSizeAdjusted: 6,
    notionalValue: notional,
    primaryRR: 2,
    expectedValueUSDT: 0.5,
    winProbabilityEstimate: 0.7,
    riskRewardScore: 80,
    isValid: true,
    tradePlanValid: true,
    warnings: [],
    blockReasons: [],
  };
}

describe('applyVWAPEntryToPlan / recalculatePlanAfterEntryChange', () => {
  it('Case 1 LONG: VWAP cao hơn entry → dịch SL, recalc maxLoss và TP1', () => {
    const plan = makeLongPlan({ entry: 100, sl: 98, tp1: 104 });
    const result = applyVWAPEntryToPlan(plan, vwapResult(101), 'LONG')!;

    expect(result.recommendedEntry).toBe(101);
    expect(result.stopLoss.price).toBe(99);
    expect(result.stopLoss.maxLossUSDT).toBeCloseTo(0.59, 2);
    expect(result.tp1.price).toBeCloseTo(105, 6);
    expect(result.primaryRR).toBeCloseTo(2, 2);
  });

  it('Case 2 LONG: VWAP thấp hơn entry → SL và TP1 scale xuống', () => {
    const plan = makeLongPlan({ entry: 100, sl: 98, tp1: 104 });
    const result = applyVWAPEntryToPlan(plan, vwapResult(99), 'LONG')!;

    expect(result.recommendedEntry).toBe(99);
    expect(result.stopLoss.price).toBe(97);
    expect(result.tp1.price).toBeCloseTo(103, 6);
    expect(result.primaryRR).toBeCloseTo(2, 2);
  });

  it('Case 3 WHALE_PROTECTED: giữ SL cố định, chỉ recalc maxLoss và TP', () => {
    const plan = makeLongPlan({
      entry: 100,
      sl: 97.5,
      tp1: 105,
      slType: 'WHALE_PROTECTED',
    });
    const result = applyVWAPEntryToPlan(plan, vwapResult(101), 'LONG')!;

    expect(result.recommendedEntry).toBe(101);
    expect(result.stopLoss.price).toBe(97.5);
    expect(result.stopLoss.maxLossUSDT).toBeCloseTo((30 * 3.5) / 101, 3);
    expect(result.tp1.price).toBeCloseTo(101 + 3.5 * 2, 4);
  });

  it('STRUCTURE_BASED: không dịch SL price', () => {
    const plan = makeLongPlan({
      entry: 100,
      sl: 96,
      tp1: 108,
      slType: 'STRUCTURE_BASED',
    });
    const result = recalculatePlanAfterEntryChange(plan, 101, { shiftSlWithEntry: false });

    expect(result.stopLoss.price).toBe(96);
    expect(result.recommendedEntry).toBe(101);
  });

  it('thêm warning khi SL quality TIGHT sau VWAP', () => {
    const plan = makeLongPlan({ entry: 100, sl: 99.5, tp1: 101 });
    const result = applyVWAPEntryToPlan(plan, vwapResult(100.2), 'LONG')!;

    expect(result.warnings.some((w) => w.includes('VWAP entry gần SL'))).toBe(true);
  });

  const vwapRecalcDecisions = [
    'SETUP_NGON',
    'VAO_TU_TIN',
    'CO_THE_VAO',
    'CHO_THEM',
    'KHONG_VAO',
  ] as const;

  it.each(vwapRecalcDecisions)(
    'recalculatePlanAfterEntryChange uses fixed RR 3.0/4.5 for %s (not decision-band)',
    (decision) => {
      const plan = makeLongPlan({
        entry: 100,
        sl: 96,
        tp1: 108,
        decision,
      });
      const result = recalculatePlanAfterEntryChange(plan, 101);

      expect(result.tp1.rrRatio).toBeCloseTo(2.0, 2);
      expect(result.tp2.rrRatio).toBeCloseTo(3.0, 2);
      expect(result.tp3.rrRatio).toBeCloseTo(4.5, 2);
    },
  );

  it('audit coins: VWAP recalc yields TP2=3.0 TP3=4.5 for CO_THE_VAO and KHONG_VAO', () => {
    const bands: Array<{ symbol: string; decision: TradePlanV3['decision'] }> = [
      { symbol: 'BTCUSDT', decision: 'CO_THE_VAO' },
      { symbol: 'NEARUSDT', decision: 'VAO_TU_TIN' },
      { symbol: 'SOLUSDT', decision: 'KHONG_VAO' },
      { symbol: 'BNBUSDT', decision: 'CO_THE_VAO' },
    ];

    for (const { symbol, decision } of bands) {
      const plan = { ...makeLongPlan({ entry: 100, sl: 96, tp1: 108, decision }), symbol };
      const result = applyVWAPEntryToPlan(plan, vwapResult(101), 'LONG')!;
      expect(result.tp2.rrRatio, symbol).toBeCloseTo(3.0, 2);
      expect(result.tp3.rrRatio, symbol).toBeCloseTo(4.5, 2);
    }
  });
});

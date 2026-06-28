import { describe, expect, it } from 'vitest';
import type { Kline } from './binanceApi';
import { calculateTradePlanV3 } from './tradePlanV3';
import type { DirectionalScoreV3, ScoringResultV3 } from './scorerV3';

function makeKlines(base: number, count = 220): Kline[] {
  return Array.from({ length: count }, (_, i) => {
    const close = base + Math.sin(i / 12) * 2;
    return {
      openTime: i,
      open: close,
      high: close + 1.5,
      low: close - 1.5,
      close,
      volume: 2000,
      closeTime: i + 1,
      quoteVolume: 2000,
      trades: 20,
      takerBuyBaseVolume: 1000,
      takerBuyQuoteVolume: 1000,
    };
  });
}

function directionalScore(overrides: Partial<DirectionalScoreV3> = {}): DirectionalScoreV3 {
  return {
    direction: 'LONG',
    layers: [],
    rawLayerScores: {},
    groupScores: { A: 4.5, B: 4.0, C: 2.5 },
    totalScore: 11,
    hardBlocks: [],
    groupBlocks: [],
    warnings: [],
    decision: 'VAO_TU_TIN',
    decisionLabel: 'VÀO TỰ TIN',
    decisionColor: '#22c55e',
    winrate: '72%',
    ...overrides,
  };
}

describe('calculateTradePlanV3', () => {
  it('builds valid LONG plan with R:R ≥ 2 and positive EV fields', () => {
    const klines1h = makeKlines(600);
    const klines4h = makeKlines(600, 120);
    const scoring: ScoringResultV3 = {
      long: directionalScore(),
      short: directionalScore({ direction: 'SHORT', decision: 'KHONG_VAO', totalScore: 6 }),
      marketMode: 'TRENDING',
      warnings: [],
      atr1h: 9,
    };

    const plan = calculateTradePlanV3(
      'BNBUSDT',
      605,
      klines1h,
      klines4h,
      scoring,
      'LONG',
      { bidWalls: [], askWalls: [] },
      34,
    );

    expect(plan.symbol).toBe('BNBUSDT');
    expect(plan.direction).toBe('LONG');
    expect(plan.recommendedEntry).toBeGreaterThan(0);
    expect(plan.stopLoss.price).toBeLessThan(plan.recommendedEntry);
    expect(plan.tp1.price).toBeGreaterThan(plan.recommendedEntry);
    expect(plan.primaryRR).toBeGreaterThanOrEqual(2);
    expect(plan.winProbabilityEstimate).toBeGreaterThanOrEqual(0.65);
    expect(plan.positionSizeAdjusted).toBeLessThanOrEqual(6);
    expect(plan.isValid).toBe(true);
    expect(plan.tradePlanValid).toBe(true);
    expect(plan.blockReasons).toHaveLength(0);
  });

  it('blocks plan when decision is KHONG_VAO', () => {
    const klines1h = makeKlines(600);
    const scoring: ScoringResultV3 = {
      long: directionalScore({ decision: 'KHONG_VAO', totalScore: 7 }),
      short: directionalScore({ direction: 'SHORT', decision: 'KHONG_VAO', totalScore: 7 }),
      marketMode: 'RANGING',
      warnings: [],
      atr1h: 9,
    };

    const plan = calculateTradePlanV3(
      'BTCUSDT',
      600,
      klines1h,
      klines1h,
      scoring,
      'LONG',
      { bidWalls: [], askWalls: [] },
    );

    expect(plan.isValid).toBe(false);
  });
});

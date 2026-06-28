import { describe, expect, it } from 'vitest';
import type { TradePlan } from '../constants/scoring';
import {
  compareOpenLevels,
  comparePendingEntry,
  MIN_IMPROVE_PCT,
} from './tradePlanOptimize';

const basePlan = (overrides: Partial<TradePlan>): TradePlan => ({
  direction: 'LONG',
  entryPrice: 100,
  stopLoss: 97,
  takeProfit1: 103,
  takeProfit2: 106,
  takeProfit3: 109,
  positionSize: 1,
  marginRequired: 6,
  notional: 30,
  riskAmount: 1.5,
  atrMultiplier: 2,
  rrRatios: [1, 2, 3],
  notes: '',
  ...overrides,
});

describe('comparePendingEntry', () => {
  it('suggests lower entry for LONG when scan is better', () => {
    const r = comparePendingEntry(
      { direction: 'LONG', entryPrice: 100 },
      basePlan({ entryPrice: 99.5 }),
    );
    expect(r).not.toBeNull();
    expect(r!.suggestedEntry).toBe(99.5);
  });

  it('suggests higher entry for SHORT when scan is better', () => {
    const r = comparePendingEntry(
      { direction: 'SHORT', entryPrice: 100 },
      basePlan({ direction: 'SHORT', entryPrice: 100.5 }),
    );
    expect(r).not.toBeNull();
  });

  it('returns null when improvement below threshold', () => {
    const r = comparePendingEntry(
      { direction: 'LONG', entryPrice: 100 },
      basePlan({ entryPrice: 100 - (100 * MIN_IMPROVE_PCT * 0.5) / 100 }),
    );
    expect(r).toBeNull();
  });
});

describe('compareOpenLevels', () => {
  it('suggests higher SL for LONG (trail)', () => {
    const r = compareOpenLevels(
      {
        direction: 'LONG',
        entryPrice: 100,
        stopLoss: 96,
        takeProfit1: 103,
        takeProfit2: 106,
        takeProfit3: 109,
      },
      basePlan({ stopLoss: 97.5 }),
    );
    expect(r).not.toBeNull();
    expect(r!.patch.stopLoss).toBe(97.5);
  });

  it('suggests better TP for LONG', () => {
    const r = compareOpenLevels(
      {
        direction: 'LONG',
        entryPrice: 100,
        stopLoss: 97,
        takeProfit1: 102,
        takeProfit2: 105,
        takeProfit3: 108,
      },
      basePlan({ takeProfit1: 104 }),
    );
    expect(r?.improvements.some((i) => i.field === 'takeProfit1')).toBe(true);
  });

  it('rejects SHORT plan applied to LONG position', () => {
    const r = compareOpenLevels(
      {
        direction: 'LONG',
        entryPrice: 2.104,
        stopLoss: 2.05,
        takeProfit1: 2.2,
        takeProfit2: 2.26,
        takeProfit3: 2.34,
      },
      basePlan({
        direction: 'SHORT',
        entryPrice: 2.099,
        stopLoss: 2.176,
        takeProfit1: 2.05,
        takeProfit2: 2.0,
        takeProfit3: 1.95,
      }),
    );
    expect(r).toBeNull();
  });
});

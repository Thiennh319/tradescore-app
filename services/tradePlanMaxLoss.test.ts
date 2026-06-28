import { describe, expect, it } from 'vitest';
import { calculateCapitalTier } from './capitalManagement';
import {
  applyTierMaxLossCap,
  computeTradeMaxLossUSDT,
} from './tradePlanV3';
import type { StopLossV3 } from '../constants/scoring';

function mockStopLoss(price: number, overrides: Partial<StopLossV3> = {}): StopLossV3 {
  return {
    price,
    type: 'ATR_BASED',
    atrDistance: 2,
    distancePct: 4,
    maxLossUSDT: 0,
    isProtectedByWall: false,
    reasoning: 'Test SL',
    quality: 'NORMAL',
    ...overrides,
  };
}

describe('computeTradeMaxLossUSDT', () => {
  it('GD1: entry=2.107, SL=2.202, notional=30 → 1.35 USDT', () => {
    const maxLoss = computeTradeMaxLossUSDT(30, 2.107, 2.202);
    expect(maxLoss).toBeCloseTo(1.35, 2);
    expect(maxLoss).not.toBe(0.95);
  });
});

describe('applyTierMaxLossCap', () => {
  it('GD1: SL vừa phải → hiển thị maxLoss thực tế (~1.35), không cap', () => {
    const tier = calculateCapitalTier(34, 34);
    const entry = 2.107;
    const sl = 2.202;
    const { stopLoss, warning } = applyTierMaxLossCap({
      stopLoss: mockStopLoss(sl),
      direction: 'SHORT',
      entry,
      notional: tier.notionalPerTrade,
      atr: 0.05,
      tierMaxLossPerTrade: tier.maxLossPerTrade,
      tierName: tier.tierName,
    });

    expect(stopLoss.maxLossUSDT).toBeCloseTo(1.35, 2);
    expect(stopLoss.slAdjustedForTier).toBe(false);
    expect(stopLoss.tierMaxLossPerTrade).toBe(1.5);
    expect(warning).toBeUndefined();
  });

  it('GD1: SL quá xa → giữ nguyên SL kỹ thuật, chỉ cảnh báo, không cap maxLoss', () => {
    const tier = calculateCapitalTier(34, 34);
    const entry = 2.107;
    const wideSl = 2.24;
    const rawLoss = computeTradeMaxLossUSDT(tier.notionalPerTrade, entry, wideSl);
    expect(rawLoss).toBeGreaterThan(1.5);

    const { stopLoss, warning } = applyTierMaxLossCap({
      stopLoss: mockStopLoss(wideSl),
      direction: 'SHORT',
      entry,
      notional: tier.notionalPerTrade,
      atr: 0.05,
      tierMaxLossPerTrade: tier.maxLossPerTrade,
      tierName: tier.tierName,
    });

    expect(warning).toBeDefined();
    expect(warning).toContain('GD1');
    expect(warning).toContain('1.50');
    expect(stopLoss.maxLossUSDT).toBeCloseTo(rawLoss, 2);
    expect(stopLoss.slAdjustedForTier).toBe(false);
    expect(stopLoss.price).toBe(wideSl);
  });

  it('GD2: maxLoss thực tế 1.6 < ngưỡng 1.95 → hiển thị 1.6', () => {
    const tier = calculateCapitalTier(44.2, 34);
    expect(tier.maxLossPerTrade).toBe(1.95);

    const entry = 600;
    const targetLoss = 1.6;
    const dist = (targetLoss * entry) / tier.notionalPerTrade;
    const sl = entry + dist;

    const { stopLoss, warning } = applyTierMaxLossCap({
      stopLoss: mockStopLoss(sl),
      direction: 'SHORT',
      entry,
      notional: tier.notionalPerTrade,
      atr: 6,
      tierMaxLossPerTrade: tier.maxLossPerTrade,
      tierName: tier.tierName,
    });

    expect(stopLoss.maxLossUSDT).toBe(1.6);
    expect(stopLoss.slAdjustedForTier).toBe(false);
    expect(warning).toBeUndefined();
  });
});

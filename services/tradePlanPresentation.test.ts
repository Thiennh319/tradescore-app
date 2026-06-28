import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TakeProfitLevel } from '../constants/scoring';
import {
  computeTradePlanExpectedValue,
  formatTpProbabilityLabel,
  isTp1ProbabilityBlocking,
  isTpProbabilityAboveMin,
  isTpProbabilityDisplayable,
  resolveTradePlanValid,
} from './tradePlanPresentation';

function mockTp(
  probability: number,
  expectedPnlUSDT: number,
  overrides: Partial<TakeProfitLevel> = {},
): TakeProfitLevel {
  return {
    price: 100,
    rrRatio: 2,
    type: 'RR_BASED',
    sizeToClose: 0.5,
    expectedPnlUSDT,
    reasoning: 'test',
    probability,
    ...overrides,
  };
}

describe('isTpProbabilityAboveMin', () => {
  it('≥ 45% → đạt ngưỡng', () => {
    expect(isTpProbabilityAboveMin(0.45)).toBe(true);
    expect(isTpProbabilityAboveMin(0.65)).toBe(true);
  });

  it('< 45% → dưới ngưỡng', () => {
    expect(isTpProbabilityAboveMin(0.41)).toBe(false);
    expect(isTpProbabilityAboveMin(0.44)).toBe(false);
  });
});

describe('isTpProbabilityDisplayable — filter tắt', () => {
  it('luôn hiển thị TP trên UI', () => {
    expect(isTpProbabilityDisplayable(0.41)).toBe(true);
    expect(isTpProbabilityDisplayable(0.65)).toBe(true);
  });
});

describe('computeTradePlanExpectedValue', () => {
  const winProb = 0.65;
  const maxLoss = 1.5;

  it('TP1=65%, TP2=52%, TP3=41% → EV chỉ tính TP1+TP2', () => {
    const tp1 = mockTp(0.65, 2.0);
    const tp2 = mockTp(0.52, 1.5);
    const tp3 = mockTp(0.41, 1.0);

    const evAll = computeTradePlanExpectedValue([tp1, tp2, tp3], winProb, maxLoss);
    const evTwo = computeTradePlanExpectedValue([tp1, tp2], winProb, maxLoss);

    expect(evAll).toBe(evTwo);
    expect(evAll).toBeCloseTo(0.65 * 2.0 + 0.52 * 1.5 - 0.35 * 1.5, 2);
    expect(isTpProbabilityAboveMin(tp3.probability)).toBe(false);
  });

  it('TP1=67%, TP2=48%, TP3=46% → EV tính cả 3 TP', () => {
    const tp1 = mockTp(0.67, 2.0);
    const tp2 = mockTp(0.48, 1.2);
    const tp3 = mockTp(0.46, 0.8);

    const ev = computeTradePlanExpectedValue([tp1, tp2, tp3], 0.67, maxLoss);
    const expected =
      0.67 * 2.0 + 0.48 * 1.2 + 0.46 * 0.8 - (1 - 0.67) * 1.5;

    expect(ev).toBeCloseTo(expected, 2);
    expect(isTpProbabilityAboveMin(tp1.probability)).toBe(true);
    expect(isTpProbabilityAboveMin(tp2.probability)).toBe(true);
    expect(isTpProbabilityAboveMin(tp3.probability)).toBe(true);
  });
});

describe('resolveTradePlanValid — filter tắt (mặc định)', () => {
  it('Test 1: TP1=43% → tradePlanValid=true, không cảnh báo block', () => {
    const { tradePlanValid, tp1LowProbabilityWarning } = resolveTradePlanValid({
      tp1: mockTp(0.43, 2.0),
      primaryRr: 2,
      maxLossUSDT: 1.2,
      tierMaxLossPerTrade: 1.5,
    });

    expect(tradePlanValid).toBe(true);
    expect(tp1LowProbabilityWarning).toBeNull();
    expect(isTp1ProbabilityBlocking(0.43)).toBe(false);
    expect(formatTpProbabilityLabel(0.43)).toBe('Xác suất: 43% (tham khảo)');
  });

  it('TP1=65% + R:R≥2 + maxLoss trong tier → tradePlanValid=true', () => {
    const { tradePlanValid, tp1LowProbabilityWarning } = resolveTradePlanValid({
      tp1: mockTp(0.65, 2.0),
      primaryRr: 2.1,
      maxLossUSDT: 1.2,
      tierMaxLossPerTrade: 1.5,
    });

    expect(tradePlanValid).toBe(true);
    expect(tp1LowProbabilityWarning).toBeNull();
  });

  it('R:R < 2 → tradePlanValid=false', () => {
    const { tradePlanValid } = resolveTradePlanValid({
      tp1: mockTp(0.65, 2.0),
      primaryRr: 1.85,
      maxLossUSDT: 1.2,
      tierMaxLossPerTrade: 1.5,
    });
    expect(tradePlanValid).toBe(false);
  });

  it('maxLoss > tier → tradePlanValid=false', () => {
    const { tradePlanValid } = resolveTradePlanValid({
      tp1: mockTp(0.65, 2.0),
      primaryRr: 2.1,
      maxLossUSDT: 1.8,
      tierMaxLossPerTrade: 1.5,
    });
    expect(tradePlanValid).toBe(false);
  });
});

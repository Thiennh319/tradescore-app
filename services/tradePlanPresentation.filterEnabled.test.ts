import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config/featureFlags', () => ({
  FEATURE_FLAGS: {
    TP_PROBABILITY_FILTER: true,
    TP_PROBABILITY_MIN_TRADES: 300,
  },
}));

import type { TakeProfitLevel } from '../constants/scoring';
import {
  formatTpProbabilityLabel,
  isTpProbabilityDisplayable,
  resolveTradePlanValid,
} from './tradePlanPresentation';

function mockTp(probability: number): TakeProfitLevel {
  return {
    price: 100,
    rrRatio: 2,
    type: 'RR_BASED',
    sizeToClose: 0.5,
    expectedPnlUSDT: 2,
    reasoning: 'test',
    probability,
  };
}

describe('TP probability filter — flag bật', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 2: tp1Prob=0.43 → tradePlanValid=false', () => {
    const { tradePlanValid, tp1LowProbabilityWarning } = resolveTradePlanValid({
      tp1: mockTp(0.43),
      primaryRr: 2.1,
      maxLossUSDT: 1.2,
      tierMaxLossPerTrade: 1.5,
    });
    expect(tradePlanValid).toBe(false);
    expect(tp1LowProbabilityWarning).toContain('TP1 xác suất quá thấp');
    expect(tp1LowProbabilityWarning).toContain('43%');
    expect(isTpProbabilityDisplayable(0.43)).toBe(false);
    expect(formatTpProbabilityLabel(0.43)).toBe('Xác suất: 43%');
  });

  it('Test 3: tp1Prob=0.52 → tradePlanValid=true', () => {
    const { tradePlanValid, tp1LowProbabilityWarning } = resolveTradePlanValid({
      tp1: mockTp(0.52),
      primaryRr: 2.1,
      maxLossUSDT: 1.2,
      tierMaxLossPerTrade: 1.5,
    });
    expect(tradePlanValid).toBe(true);
    expect(tp1LowProbabilityWarning).toBeNull();
  });
});

import type { TakeProfitLevel, TradePlanV3 } from '../constants/scoring';

function mockTp(probability: number): TakeProfitLevel {
  return {
    price: 610,
    rrRatio: 2,
    type: 'RR_BASED',
    sizeToClose: 0.5,
    expectedPnlUSDT: 2,
    reasoning: 'test',
    probability,
  };
}

export function mockTradePlanV3(overrides: Partial<TradePlanV3> = {}): TradePlanV3 {
  return {
    symbol: 'BNBUSDT',
    direction: 'LONG',
    generatedAt: Date.now(),
    totalScore: 11,
    decision: 'VAO_TU_TIN',
    marketMode: 'TRENDING',
    groupScores: { A: 4, B: 4, C: 3 },
    entryZone: {
      optimal: 605,
      aggressive: 606,
      conservative: 603,
      rangeLow: 602,
      rangeHigh: 607,
      quality: 'GOOD',
      distanceFromCurrentPct: -0.5,
      reasoning: 'Pullback EMA',
      entryType: 'LIMIT_NEAR',
    },
    recommendedEntry: 605,
    stopLoss: {
      price: 598,
      type: 'ATR_BASED',
      atrDistance: 1.5,
      distancePct: 1.2,
      maxLossUSDT: 1.5,
      isProtectedByWall: false,
      reasoning: 'ATR SL',
      quality: 'NORMAL',
    },
    tp1: mockTp(0.65),
    tp2: mockTp(0.52),
    tp3: mockTp(0.41),
    positionSize: 6,
    positionSizeAdjusted: 6,
    notionalValue: 30,
    primaryRR: 2,
    expectedValueUSDT: 0.8,
    winProbabilityEstimate: 0.65,
    riskRewardScore: 75,
    isValid: true,
    tradePlanValid: true,
    warnings: [],
    blockReasons: [],
    ...overrides,
  };
}

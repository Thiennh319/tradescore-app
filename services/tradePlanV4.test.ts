import { describe, expect, it } from 'vitest';
import type { Kline } from './binanceApi';
import {
  TRADE_PLAN_V3_CONFIG,
  TRADE_PLAN_V4_CONFIG,
  type DecisionTypeV4,
  type StopLossV3,
} from '../constants/scoring';
import {
  calculateTradePlanV4Native,
  resolveV4SlMultiplier,
  type TradePlanV4MarketData,
} from './tradePlanV4';
import type { DirectionalScoreV4, ScoringResultV4 } from './scorerV4';
import { emptyL6DetailV4, neutralSqueezeRiskResult } from './scorerV4';
import { calculateCapitalTier } from './capitalManagement';
import { applyTierMaxLossCap, computeTradeMaxLossUSDT } from './tradePlanV3';

function makeKlines(price: number, n = 80): Kline[] {
  return Array.from({ length: n }, (_, i) => ({
    openTime: i,
    open: price,
    high: price + 0.5,
    low: price - 0.5,
    close: price,
    volume: 1000,
    closeTime: i + 1,
    quoteVolume: 1000,
    trades: 10,
    takerBuyBaseVolume: 500,
    takerBuyQuoteVolume: 500,
  }));
}

function mockDirectional(
  overrides: {
    decision?: DecisionTypeV4;
    groupA?: number;
    groupB?: number;
    groupC?: number;
    l5a?: number;
    total?: number;
  } = {},
): DirectionalScoreV4 {
  const groupA = overrides.groupA ?? 2.6;
  const groupB = overrides.groupB ?? 4.0;
  const groupC = overrides.groupC ?? 2.5;
  const total = overrides.total ?? groupA + groupB + groupC;
  const l5a = overrides.l5a ?? 2;
  const decision = overrides.decision ?? 'VAO_TU_TIN';

  return {
    direction: 'LONG',
    layers: [],
    rawLayerScores: { 5: l5a },
    groupScores: { A: groupA, B: groupB, C: groupC },
    referenceTotalScore: total,
    officialTotalScore: total,
    hardBlocks: [],
    groupBlocks: [],
    warnings: [],
    decision,
    decisionLabel: decision,
    decisionColor: '#0ECB81',
    winrate: '~70%',
    awaitingRescore: false,
  };
}

function mockScoring(long: DirectionalScoreV4): ScoringResultV4 {
  return {
    long,
    short: { ...long, direction: 'SHORT' },
    marketMode: 'TRENDING',
    warnings: [],
    atr1h: 6,
    l6Detail: emptyL6DetailV4(),
    squeezeRisk: neutralSqueezeRiskResult(),
  };
}

function flatMarket(price = 600): TradePlanV4MarketData {
  return {
    symbol: 'BNBUSDT',
    currentPrice: price,
    klines1h: makeKlines(price),
    klines4h: makeKlines(price),
    whaleWalls: { bidWalls: [], askWalls: [] },
    accountSize: 34,
  };
}

describe('resolveV4SlMultiplier', () => {
  it('CVD mạnh (L5a=2, Group A=2.6) → giảm 0.3× so với bảng gốc VÀO TỰ TIN', () => {
    const base = TRADE_PLAN_V3_CONFIG.ATR_SL_MULTIPLIER.VAO_TU_TIN;
    const r = resolveV4SlMultiplier(
      mockDirectional({ groupA: 2.6, l5a: 2, decision: 'VAO_TU_TIN' }),
    );
    expect(r.profile).toBe('CVD_DOMINANT');
    expect(r.baseMultiplier).toBe(base);
    expect(r.adjustedMultiplier).toBe(base - TRADE_PLAN_V4_CONFIG.CVD_SL_TIGHTEN);
    expect(r.adjustmentApplied).toBe(true);
    expect(r.slMultiplierNote).toContain('CVD');
  });

  it('Trend mạnh (Group A=4.8, L5a=1) → multiplier không đổi', () => {
    const base = TRADE_PLAN_V3_CONFIG.ATR_SL_MULTIPLIER.VAO_TU_TIN;
    const r = resolveV4SlMultiplier(
      mockDirectional({ groupA: 4.8, l5a: 1, groupB: 2.5, decision: 'VAO_TU_TIN' }),
    );
    expect(r.profile).toBe('TREND_DOMINANT');
    expect(r.adjustedMultiplier).toBe(base);
    expect(r.adjustmentApplied).toBe(false);
    expect(r.slMultiplierNote).toBeNull();
  });

  it('Cả 2 nhóm cao (Group A=4.8, L5a=2) → multiplier không đổi', () => {
    const base = TRADE_PLAN_V3_CONFIG.ATR_SL_MULTIPLIER.VAO_TU_TIN;
    const r = resolveV4SlMultiplier(
      mockDirectional({ groupA: 4.8, l5a: 2, groupB: 4.5, decision: 'VAO_TU_TIN' }),
    );
    expect(r.profile).toBe('BALANCED');
    expect(r.adjustedMultiplier).toBe(base);
    expect(r.adjustmentApplied).toBe(false);
  });
});

describe('calculateTradePlanV4Native', () => {
  it('áp dụng SL multiplier điều chỉnh vào stopLoss.targetAtrMultiplier', () => {
    const scoring = mockScoring(
      mockDirectional({ groupA: 2.6, l5a: 2, decision: 'VAO_TU_TIN' }),
    );
    const plan = calculateTradePlanV4Native(scoring, flatMarket(), 'LONG');
    const expected =
      TRADE_PLAN_V3_CONFIG.ATR_SL_MULTIPLIER.VAO_TU_TIN -
      TRADE_PLAN_V4_CONFIG.CVD_SL_TIGHTEN;
    expect(plan.stopLoss.targetAtrMultiplier).toBe(expected);
    expect(plan.stopLoss.slMultiplierNote).toContain('CVD');
  });

  it('Group B ≥ 4.0 vẫn dùng R:R cố định từ quản lý vốn (2:1 / 3:1 / 4.5:1)', () => {
    const scoring = mockScoring(
      mockDirectional({
        groupA: 2.6,
        groupB: 4.2,
        l5a: 2,
        decision: 'VAO_TU_TIN',
      }),
    );
    const plan = calculateTradePlanV4Native(scoring, flatMarket(), 'LONG');
    expect(plan.tp1.rrRatio).toBeCloseTo(2.0, 1);
    expect(plan.tp2.rrRatio).toBeCloseTo(3.0, 1);
    expect(plan.tp3.rrRatio).toBeCloseTo(4.5, 1);
  });

  it('trend mạnh giữ multiplier gốc trên plan', () => {
    const scoring = mockScoring(
      mockDirectional({ groupA: 4.8, l5a: 1, groupB: 2.5, decision: 'VAO_TU_TIN' }),
    );
    const plan = calculateTradePlanV4Native(scoring, flatMarket(), 'LONG');
    expect(plan.stopLoss.targetAtrMultiplier).toBe(
      TRADE_PLAN_V3_CONFIG.ATR_SL_MULTIPLIER.VAO_TU_TIN,
    );
    expect(plan.stopLoss.slMultiplierNote).toBeUndefined();
  });

  it('plan hợp lệ score 13.5 → expiry HIGH 12h', () => {
    const scoring = mockScoring(
      mockDirectional({ groupA: 5, groupB: 4.5, groupC: 4, total: 13.5, decision: 'VAO_TU_TIN' }),
    );
    const plan = calculateTradePlanV4Native(scoring, flatMarket(), 'LONG');
    expect(plan.isValid).toBe(true);
    expect(plan.expiryHours).toBe(12);
    expect(plan.expiryTier).toBe('HIGH');
    expect(plan.expiresAt).toBeDefined();
  });

  it('plan KHONG_VAO score 8.5 → không có expiry fields', () => {
    const scoring = mockScoring(
      mockDirectional({ groupA: 2, groupB: 3, groupC: 3.5, total: 8.5, decision: 'KHONG_VAO' }),
    );
    const plan = calculateTradePlanV4Native(scoring, flatMarket(), 'LONG');
    expect(plan.isValid).toBe(false);
    expect(plan.expiryHours).toBeUndefined();
    expect(plan.expiresAt).toBeUndefined();
  });
});

function mockStopLossV4(price: number, overrides: Partial<StopLossV3> = {}): StopLossV3 {
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

describe('tier maxLoss — V4 pipeline (calculateTradePlanV4Native)', () => {
  it('GD1: stopLoss gắn tier, slAdjustedForTier=false, maxLoss = thực tế', () => {
    const scoring = mockScoring(
      mockDirectional({ groupA: 2.6, l5a: 2, decision: 'VAO_TU_TIN' }),
    );
    const plan = calculateTradePlanV4Native(scoring, flatMarket(), 'LONG');

    expect(plan.stopLoss.tierName).toBe('GD1');
    expect(plan.stopLoss.tierMaxLossPerTrade).toBe(1.5);
    expect(plan.stopLoss.slAdjustedForTier).toBe(false);
    expect(plan.stopLoss.maxLossUSDT).toBeCloseTo(
      computeTradeMaxLossUSDT(
        plan.notionalValue,
        plan.recommendedEntry,
        plan.stopLoss.price,
      ),
      2,
    );
  });

  it('SHORT giá thấp: maxLoss khớp công thức, slAdjustedForTier=false', () => {
    const price = 2.107;
    const scoring = mockScoring(
      mockDirectional({ groupA: 2.6, l5a: 2, groupB: 2.5, groupC: 2.5, decision: 'VAO_TU_TIN' }),
    );
    const market: TradePlanV4MarketData = {
      symbol: 'TESTUSDT',
      currentPrice: price,
      klines1h: makeKlines(price),
      klines4h: makeKlines(price),
      whaleWalls: { bidWalls: [], askWalls: [] },
      accountSize: 34,
    };
    const plan = calculateTradePlanV4Native(scoring, market, 'SHORT');
    const rawLoss = computeTradeMaxLossUSDT(
      plan.notionalValue,
      plan.recommendedEntry,
      plan.stopLoss.price,
    );

    expect(plan.stopLoss.slAdjustedForTier).toBe(false);
    expect(plan.stopLoss.maxLossUSDT).toBeCloseTo(rawLoss, 2);
    if (rawLoss > (plan.stopLoss.tierMaxLossPerTrade ?? 0) + 0.005) {
      expect(plan.warnings.some((w) => w.includes('cao hơn giới hạn'))).toBe(true);
    } else {
      expect(
        plan.warnings.some((w) => w.includes('cao hơn giới hạn')),
      ).toBe(false);
    }
  });
});

describe('tier maxLoss — applyTierMaxLossCap (V4 dùng cùng hàm V3)', () => {
  it('GD1: SL vừa phải → hiển thị maxLoss thực tế (~1.35), không cap', () => {
    const tier = calculateCapitalTier(34, 34);
    const entry = 2.107;
    const sl = 2.202;
    const { stopLoss, warning } = applyTierMaxLossCap({
      stopLoss: mockStopLossV4(sl),
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
      stopLoss: mockStopLossV4(wideSl),
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
      stopLoss: mockStopLossV4(sl),
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

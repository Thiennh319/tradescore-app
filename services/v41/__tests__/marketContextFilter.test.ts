import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KlineV41 } from '../indicators';
import type { BTCContext } from '../btcContextBuilder';
import {
  applyMarketContextFilter,
  evaluateMarketContext,
  evaluateTrendReversalWithContext,
} from '../marketContextFilter';
import { adaptTrendReversalResult } from '../foundation/adapters';
import { V41_TREND_REVERSAL_FOUNDATION_STATE } from '../foundation/states';
import { computeTrendReversal } from '../reversalDetector';
import * as protectionLayer from '../protectionLayer';

vi.mock('../trendExhaustionEngine', () => ({
  calculateTrendExhaustion: vi.fn(),
}));

import { calculateTrendExhaustion } from '../trendExhaustionEngine';

const mockExhaustion = vi.mocked(calculateTrendExhaustion);

function buildKline(overrides: Partial<KlineV41> = {}): KlineV41 {
  return {
    openTime: 0,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    closeTime: 1,
    takerBuyVolume: 500,
    ...overrides,
  };
}

function buildFlatKlines(
  count: number,
  overrides: Partial<KlineV41> | ((index: number) => Partial<KlineV41>) = {},
): KlineV41[] {
  return Array.from({ length: count }, (_, index) => {
    const patch = typeof overrides === 'function' ? overrides(index) : overrides;
    return buildKline({ openTime: index, closeTime: index + 1, ...patch });
  });
}

function buildHhLhKlines(count = 30): KlineV41[] {
  const klines = buildFlatKlines(count, { close: 100, high: 101, low: 99, volume: 1000 });
  const olderIdx = count - 12;
  const newerIdx = count - 6;
  klines[olderIdx] = buildKline({
    openTime: olderIdx,
    closeTime: olderIdx + 1,
    open: 108,
    high: 110,
    low: 107,
    close: 109,
    volume: 1000,
    takerBuyVolume: 600,
  });
  for (let i = olderIdx - 3; i <= olderIdx + 3; i++) {
    if (i !== olderIdx) klines[i] = { ...klines[i], high: Math.min(klines[i].high, 108) };
  }
  klines[newerIdx] = buildKline({
    openTime: newerIdx,
    closeTime: newerIdx + 1,
    open: 104,
    high: 105,
    low: 103,
    close: 104,
    volume: 1000,
    takerBuyVolume: 600,
  });
  for (let i = newerIdx - 3; i <= newerIdx + 3; i++) {
    if (i !== newerIdx) klines[i] = { ...klines[i], high: Math.min(klines[i].high, 104) };
  }
  return klines;
}

function applyBearishCvdFlip(klines: KlineV41[]): KlineV41[] {
  const next = [...klines];
  const n = next.length;
  for (let i = n - 3; i < n - 1; i++) {
    next[i] = { ...next[i], takerBuyVolume: 700, volume: 1000 };
  }
  next[n - 1] = { ...next[n - 1], takerBuyVolume: 200, volume: 2500 };
  return next;
}

function buildTrendActiveKlines(): KlineV41[] {
  return applyBearishCvdFlip(buildHhLhKlines());
}

function buildNormalVolatilityKlines(): KlineV41[] {
  return buildFlatKlines(70, { high: 100.5, low: 99.5, volume: 1000 });
}

const supportiveBtc: BTCContext = {
  btcTrendStrength: 55,
  btcDirection: 'BEAR',
  btcStrengthBand: 'moderate',
  btcAlignmentFactor: 0.75,
};

const blockingBtcPump: BTCContext = {
  btcTrendStrength: 85,
  btcDirection: 'BULL',
  btcStrengthBand: 'strong',
  btcAlignmentFactor: 1.0,
};

function passContextParams(overrides: Record<string, unknown> = {}) {
  return {
    btcContext: supportiveBtc,
    fundingRate: 0.0001,
    oiDeltaPct: -2.0,
    priceChangePct: -1.0,
    whale: { signal: 'DISTRIBUTION' as const },
    klines4H: buildNormalVolatilityKlines(),
    ...overrides,
  };
}

beforeEach(() => {
  mockExhaustion.mockReset();
  mockExhaustion.mockReturnValue({
    trendExhaustion: 80,
    rsiExtremeScore: 30,
    distanceEMA20Score: 20,
    volumeDivergencePts: 20,
    candleStreakScore: 10,
  });
});

describe('evaluateTrendReversalWithContext', () => {
  it('Trend PASS + Context PASS → ACTIVE', () => {
    const result = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      passContextParams(),
    );
    expect(result.preContextState).toBe('ACTIVE');
    expect(result.state).toBe('ACTIVE');
    expect(result.marketContext?.pass).toBe(true);

    const envelope = adaptTrendReversalResult(result);
    expect(envelope.state).toBe(V41_TREND_REVERSAL_FOUNDATION_STATE.ACTIVE);
    expect(envelope.reviews.some((r) => r.title.includes('BTC đồng thuận'))).toBe(true);
  });

  it('Trend PASS + BTC FAIL → WATCH', () => {
    const result = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      passContextParams({ btcContext: blockingBtcPump }),
    );
    expect(result.preContextState).toBe('ACTIVE');
    expect(result.state).toBe('WATCH');
    expect(result.marketContext?.dimensions.btc.pass).toBe(false);
    expect(
      adaptTrendReversalResult(result).reviews.some((r) =>
        r.title.includes('BTC pump'),
      ),
    ).toBe(true);
  });

  it('Trend PASS + Funding FAIL → WATCH', () => {
    const result = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      passContextParams({ fundingRate: -0.0005 }),
    );
    expect(result.state).toBe('WATCH');
    expect(result.marketContext?.dimensions.funding.pass).toBe(false);
  });

  it('Trend PASS + OI FAIL → WATCH', () => {
    const result = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      passContextParams({ oiDeltaPct: 3.0, priceChangePct: 2.0 }),
    );
    expect(result.state).toBe('WATCH');
    expect(result.marketContext?.dimensions.oi.pass).toBe(false);
  });

  it('Trend PASS + Whale FAIL → WATCH', () => {
    const result = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      passContextParams({ whale: { signal: 'ACCUMULATION' } }),
    );
    expect(result.state).toBe('WATCH');
    expect(result.marketContext?.dimensions.whale.pass).toBe(false);
  });

  it('Trend PASS + Volatility FAIL → WATCH', () => {
    vi.spyOn(protectionLayer, 'computeVolatilityRisk').mockReturnValue({
      volatilityRisk: 'EXTREME',
      atrPct: 220,
    });
    const result = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      passContextParams({ klines4H: buildNormalVolatilityKlines() }),
    );
    expect(result.state).toBe('WATCH');
    expect(result.marketContext?.dimensions.volatility.pass).toBe(false);
    vi.restoreAllMocks();
  });

  it('Trend WATCH — không áp context filter', () => {
    // Ý đồ gốc (Task 2.1): khi TR state !== ACTIVE, applyMarketContextFilter
    // early-return — không gắn marketContext — kể cả khi BTC context sẽ FAIL
    // nếu bị áp nhầm (blockingBtcPump + BULL).
    //
    // Bản gốc dùng mock exhaustion=30 + buildTrendActiveKlines() + BULL để
    // buộc WATCH khi EXHAUSTION_MIN còn =55 (30 < 55 → thiếu signal). Sau khi
    // MIN=28, exhaustion=30 lại đủ điều kiện ACTIVE → fixture cũ vỡ.
    // Đổi sang NEUTRAL (workaround) vẫn hit early-return nhưng làm mất
    // counterfactual BULL+blockingBTC. Sửa đúng: giữ BULL + klines không đủ
    // signal → WATCH, exhaustion mock dưới MIN chỉ phụ trợ.
    mockExhaustion.mockReturnValue({
      trendExhaustion: 10,
      rsiExtremeScore: 0,
      distanceEMA20Score: 0,
      volumeDivergencePts: 0,
      candleStreakScore: 0,
    });
    const trend = computeTrendReversal({
      klines1H: buildFlatKlines(30),
      trendDirection: 'BULL',
    });
    expect(trend.state).toBe('WATCH');
    expect(trend.detail.activeConditionCount).toBeLessThan(3);

    const filtered = applyMarketContextFilter(trend, {
      trendDirection: 'BULL',
      ...passContextParams({ btcContext: blockingBtcPump }),
    });
    expect(filtered.marketContext).toBeUndefined();
    expect(filtered.state).toBe('WATCH');
  });
});

describe('evaluateMarketContext reviews', () => {
  it('sinh dimension titles cụ thể — không text chung chung', () => {
    const ctx = evaluateMarketContext({
      trendDirection: 'BULL',
      ...passContextParams(),
    });
    expect(ctx.dimensions.btc.title).toMatch(/BTC/);
    expect(ctx.dimensions.funding.title).toMatch(/Funding/);
    expect(ctx.dimensions.oi.title).toMatch(/OI/);
    expect(ctx.dimensions.whale.title).toMatch(/Whale/);
    expect(ctx.dimensions.volatility.title).toMatch(/Volatility/);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KlineV41 } from '../indicators';
import type { BTCContext } from '../btcContextBuilder';
import { V41_CONFIDENCE_CONFIG } from '../confidence/confidenceConfig';
import {
  computeConfidenceBreakdown,
  computeConfidenceEngineResult,
} from '../confidenceEngine';
import { evaluateTrendReversalWithContext } from '../marketContextFilter';
import { V41_ENGINE_ID } from '../foundation/engineIds';
import { validateV41EngineResult } from '../foundation/engineResult';
import { V41_CONFIDENCE_FOUNDATION_STATE } from '../foundation/states';
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

function buildTrendActiveKlines(): KlineV41[] {
  const klines = buildHhLhKlines();
  const n = klines.length;
  for (let i = n - 3; i < n - 1; i++) {
    klines[i] = { ...klines[i], takerBuyVolume: 700, volume: 1000 };
  }
  klines[n - 1] = { ...klines[n - 1], takerBuyVolume: 200, volume: 2500 };
  return klines;
}

const supportiveBtc: BTCContext = {
  btcTrendStrength: 55,
  btcDirection: 'BEAR',
  btcStrengthBand: 'moderate',
  btcAlignmentFactor: 0.75,
};

const blockingBtc: BTCContext = {
  btcTrendStrength: 85,
  btcDirection: 'BULL',
  btcStrengthBand: 'strong',
  btcAlignmentFactor: 1.0,
};

function goodContext() {
  return {
    btcContext: supportiveBtc,
    fundingRate: 0.0001,
    oiDeltaPct: -2.0,
    priceChangePct: -1.0,
    whale: { signal: 'DISTRIBUTION' as const },
    klines4H: buildFlatKlines(70, { high: 100.5, low: 99.5 }),
  };
}

function sparseContext() {
  return {
    klines4H: buildFlatKlines(70, { high: 100.5, low: 99.5 }),
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
  vi.spyOn(protectionLayer, 'computeVolatilityRisk').mockReturnValue({
    volatilityRisk: 'NORMAL',
    atrPct: 110,
  });
});

describe('computeConfidenceEngineResult', () => {
  it('Confidence tăng khi Context tốt', () => {
    const good = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      goodContext(),
    );
    const bad = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      {
        ...goodContext(),
        btcContext: blockingBtc,
        whale: { signal: 'ACCUMULATION' },
        fundingRate: -0.0005,
        oiDeltaPct: 3,
        priceChangePct: 2,
      },
    );

    const goodConf = computeConfidenceBreakdown(good).finalConfidence;
    const badConf = computeConfidenceBreakdown(bad).finalConfidence;
    expect(goodConf).toBeGreaterThan(badConf);
  });

  it('Confidence giảm khi Context xấu (BTC fail)', () => {
    const baseline = computeConfidenceBreakdown(
      evaluateTrendReversalWithContext(
        { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
        goodContext(),
      ),
    ).finalConfidence;

    const btcFail = computeConfidenceBreakdown(
      evaluateTrendReversalWithContext(
        { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
        { ...goodContext(), btcContext: blockingBtc },
      ),
    ).finalConfidence;

    expect(btcFail).toBeLessThan(baseline);
  });

  it('Thiếu dữ liệu → Confidence giảm', () => {
    const full = computeConfidenceBreakdown(
      evaluateTrendReversalWithContext(
        { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
        goodContext(),
      ),
    );

    const sparse = computeConfidenceBreakdown(
      evaluateTrendReversalWithContext(
        { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
        sparseContext(),
      ),
    );

    expect(sparse.finalConfidence).toBeLessThan(full.finalConfidence);
    expect(sparse.completenessMultiplier).toBeLessThan(full.completenessMultiplier);
    expect(
      sparse.contributions.some((c) => c.layer === 'data_completeness' && c.kind === 'subtract'),
    ).toBe(true);
  });

  it('trả V41EngineResult hợp lệ — state Scored, không LONG/SHORT', () => {
    const pipeline = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      goodContext(),
    );
    const result = computeConfidenceEngineResult(pipeline);

    expect(result.engineId).toBe(V41_ENGINE_ID.CONFIDENCE);
    expect(result.state).toBe(V41_CONFIDENCE_FOUNDATION_STATE.SCORED);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(validateV41EngineResult(result).valid).toBe(true);
    expect(result.capabilities.canGenerateSignal).toBe(false);
    expect(result.capabilities.canEntry).toBe(false);

    const json = JSON.stringify(result);
    expect(json).not.toMatch(/"direction":"LONG"|"direction":"SHORT"/);
    expect(result.reviews.length).toBeGreaterThan(0);
    expect(result.reviews.some((r) => r.title.startsWith('+') || r.title.startsWith('−'))).toBe(
      true,
    );
  });

  it('ReviewItem giải thích cộng/trừ/trung lực', () => {
    const pipeline = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      sparseContext(),
    );
    const breakdown = computeConfidenceBreakdown(pipeline);
    expect(breakdown.contributions.some((c) => c.kind === 'add')).toBe(true);
    expect(breakdown.contributions.some((c) => c.kind === 'neutral')).toBe(true);

    const envelope = computeConfidenceEngineResult(pipeline);
    expect(envelope.reviews.some((r) => r.description.includes('điểm'))).toBe(true);
  });

  it('config weights thay đổi kết quả — không hard-code trong engine', () => {
    const pipeline = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      goodContext(),
    );

    const defaultScore = computeConfidenceBreakdown(pipeline).finalConfidence;
    const heavyTrend = computeConfidenceBreakdown(pipeline, {
      ...V41_CONFIDENCE_CONFIG,
      layerWeights: { trendReversal: 0.9, marketContext: 0.1 },
    }).finalConfidence;

    expect(heavyTrend).not.toBe(defaultScore);
  });
});

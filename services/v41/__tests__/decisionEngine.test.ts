import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KlineV41 } from '../indicators';
import type { BTCContext } from '../btcContextBuilder';
import type { ConfidenceDecisionContext } from '../confidence/decisionContext';
import { computeConfidenceEngineResult } from '../confidenceEngine';
import { V41_DECISION_CONFIG } from '../decision/decisionConfig';
import { computeDecisionEngineResult, evaluateDecision } from '../decisionEngine';
import { evaluateTrendReversalWithContext } from '../marketContextFilter';
import { V41_ENGINE_ID } from '../foundation/engineIds';
import { buildV41EngineResult, validateV41EngineResult } from '../foundation/engineResult';
import {
  V41_CONFIDENCE_FOUNDATION_STATE,
  V41_DECISION_FOUNDATION_STATE,
} from '../foundation/states';
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

function buildFlatKlines(count: number): KlineV41[] {
  return Array.from({ length: count }, (_, index) =>
    buildKline({ openTime: index, closeTime: index + 1, high: 100.5, low: 99.5 }),
  );
}

function buildHhLhKlines(count = 30): KlineV41[] {
  const klines = buildFlatKlines(count);
  const olderIdx = count - 12;
  const newerIdx = count - 6;
  klines[olderIdx] = buildKline({
    openTime: olderIdx,
    closeTime: olderIdx + 1,
    open: 108,
    high: 110,
    low: 107,
    close: 109,
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

function goodContext() {
  return {
    btcContext: supportiveBtc,
    fundingRate: 0.0001,
    oiDeltaPct: -2.0,
    priceChangePct: -1.0,
    whale: { signal: 'DISTRIBUTION' as const },
    klines4H: buildFlatKlines(70),
  };
}

function mockConfidenceEnvelope(
  confidence: number,
  ctxOverrides: Partial<ConfidenceDecisionContext> = {},
) {
  const decisionContext: ConfidenceDecisionContext = {
    proposedDirection: 'SHORT',
    altTrendDirection: 'BULL',
    trendReversalConfirmed: true,
    marketContextPass: true,
    marketContextDenied: false,
    marketContextApplied: true,
    completenessMultiplier: 1,
    trendSignalCount: 4,
    dataInsufficient: false,
    hardBlocks: [],
    ...ctxOverrides,
  };

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.CONFIDENCE,
    state: V41_CONFIDENCE_FOUNDATION_STATE.SCORED,
    confidence,
    strength: confidence,
    reviews: [
      {
        id: 'confidence:info:context_btc',
        level: 'INFO',
        title: '+BTC đồng thuận xu hướng giảm',
        description: 'BTC hỗ trợ đảo bearish',
        source: V41_ENGINE_ID.CONFIDENCE,
      },
    ],
    metrics: { marketConfidence: confidence },
    debug: { raw: { decisionContext } },
  });
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

describe('evaluateDecision', () => {
  it('Confidence cao + đủ điều kiện SHORT → SHORT', () => {
    const result = evaluateDecision(mockConfidenceEnvelope(86));
    expect(result.decision).toBe(V41_DECISION_FOUNDATION_STATE.SHORT);
    expect(result.reasons.some((r) => r.includes('SHORT'))).toBe(true);
  });

  it('Confidence cao + đủ điều kiện LONG → LONG', () => {
    const result = evaluateDecision(
      mockConfidenceEnvelope(88, {
        proposedDirection: 'LONG',
        altTrendDirection: 'BEAR',
      }),
    );
    expect(result.decision).toBe(V41_DECISION_FOUNDATION_STATE.LONG);
    expect(result.reasons.some((r) => r.includes('LONG'))).toBe(true);
  });

  it('Confidence trung bình → WATCH', () => {
    const result = evaluateDecision(mockConfidenceEnvelope(58));
    expect(result.decision).toBe(V41_DECISION_FOUNDATION_STATE.WATCH);
  });

  it('Confidence thấp → IGNORE', () => {
    const result = evaluateDecision(mockConfidenceEnvelope(18));
    expect(result.decision).toBe(V41_DECISION_FOUNDATION_STATE.IGNORE);
  });

  it('Hard Block → WATCH', () => {
    const result = evaluateDecision(
      mockConfidenceEnvelope(88, {
        hardBlocks: ['MARKET_CONTEXT_DENIED'],
        marketContextDenied: true,
        marketContextPass: false,
        trendReversalConfirmed: true,
      }),
    );
    expect(result.decision).toBe(V41_DECISION_FOUNDATION_STATE.WATCH);
    expect(result.warnings.some((w) => w.includes('Hard block'))).toBe(true);
  });

  it('NEUTRAL trend → IGNORE', () => {
    const result = evaluateDecision(
      mockConfidenceEnvelope(70, {
        altTrendDirection: 'NEUTRAL',
        proposedDirection: 'NONE',
        dataInsufficient: true,
      }),
    );
    expect(result.decision).toBe(V41_DECISION_FOUNDATION_STATE.IGNORE);
  });
});

describe('computeDecisionEngineResult', () => {
  it('trả V41EngineResult hợp lệ với ReviewItem tiếng Việt', () => {
    const envelope = computeDecisionEngineResult(mockConfidenceEnvelope(86));
    expect(envelope.engineId).toBe(V41_ENGINE_ID.DECISION);
    expect(envelope.state).toBe(V41_DECISION_FOUNDATION_STATE.SHORT);
    expect(validateV41EngineResult(envelope).valid).toBe(true);
    expect(envelope.reviews.some((r) => r.title.includes('Confidence'))).toBe(true);
    expect(envelope.reviews.some((r) => r.title.includes('BTC'))).toBe(true);
    expect(envelope.capabilities.canEntry).toBe(false);
  });

  it('pipeline đầy đủ Confidence → Decision (integration)', () => {
    const pipeline = evaluateTrendReversalWithContext(
      { klines1H: buildTrendActiveKlines(), trendDirection: 'BULL' },
      goodContext(),
    );
    const confidence = computeConfidenceEngineResult(pipeline);
    const decision = computeDecisionEngineResult(confidence);

    expect(confidence.debug?.raw?.decisionContext).toBeDefined();
    expect(['SHORT', 'WATCH']).toContain(decision.state);
    if (decision.confidence >= V41_DECISION_CONFIG.thresholds.short) {
      expect(decision.state).toBe(V41_DECISION_FOUNDATION_STATE.SHORT);
    }
  });
});

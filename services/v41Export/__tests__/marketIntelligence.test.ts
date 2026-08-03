import { describe, expect, it } from 'vitest';
import { BUILD_INFO } from '../../../constants/buildInfo';
import {
  buildMarketIntelligenceExport,
  buildMarketIntelligenceTrace,
} from '../index';
import type { MarketIntelligenceSnapshot } from '../marketIntelligence/Types';

const FIXED_GENERATED_AT = '2026-07-26T01:00:00.000Z';

function fixtureSnapshot(withDetail: boolean): MarketIntelligenceSnapshot {
  const base: MarketIntelligenceSnapshot = {
    trendStrength: 82,
    trendDirection: 'BULL',
    trendExhaustion: 75,
    volumeDivergencePts: 20,
    reversalProbability: 55,
    rsiDivergenceScore: 50,
    cvdDivergenceScore: 0,
    marketConfidence: 41,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'Distribution',
    scanTimestamp: 1_700_000_000_000,
  };
  if (!withDetail) return base;
  return {
    ...base,
    detail: {
      trend: {
        emaAlignmentScore: 40,
        adxScore: 25,
        slopeScore: 17,
        trendStrength: 82,
        trendDirection: 'BULL',
      },
      exhaustion: {
        rsiExtremeScore: 30,
        distanceEMA20Score: 20,
        volumeDivergencePts: 20,
        candleStreakScore: 5,
        trendExhaustion: 75,
      },
      reversal: {
        reversalProbability: 55,
        rsiDivergenceScore: 50,
        cvdDivergenceScore: 0,
      },
      confidence: {
        trendStrengthBase: 82,
        exhaustionMultiplier: 0.25,
        btcAlignmentFactor: 1,
        altDirection: 'BULL',
        btcDirection: 'BULL',
        marketConfidence: 41,
      },
    },
  };
}

describe('v41Export Market Intelligence Trace (P0)', () => {
  it('buildMarketIntelligenceTrace copies snapshot fields only', () => {
    const snap = fixtureSnapshot(true);
    const doc = buildMarketIntelligenceTrace({
      snapshot: snap,
      symbol: 'BTCUSDT',
      metadata: { generatedAt: FIXED_GENERATED_AT },
    });
    expect(doc.summary.trendStrength).toBe(82);
    expect(doc.summary.marketState).toBe('Distribution');
    expect(doc.detail?.trend.emaAlignmentScore).toBe(40);
    expect(doc.metadata.engineVersion).toBe(BUILD_INFO.version);
    expect(doc.metadata.buildInfoVersion).toBe(BUILD_INFO.version);
    expect(doc.metadata.generatedAt).toBe(FIXED_GENERATED_AT);
  });

  it('format includes metadata, input, 4 engines, market state, embedded spec', () => {
    const md = buildMarketIntelligenceExport({
      snapshot: fixtureSnapshot(true),
      symbol: 'BTCUSDT',
      metadata: { generatedAt: FIXED_GENERATED_AT, coin: 'BTCUSDT' },
    });
    expect(md).toContain('# 01_MARKET_INTELLIGENCE (V4.1)');
    expect(md).toContain('## METADATA');
    expect(md).toContain('Engine Version: ' + BUILD_INFO.version);
    expect(md).toContain('## INPUT SNAPSHOT');
    expect(md).toContain('Trend Strength: 82');
    expect(md).toContain('Market State: Distribution');
    expect(md).toContain('### Engine 1 — Trend Strength');
    expect(md).toContain('### Engine 2 — Trend Exhaustion');
    expect(md).toContain('### Engine 3 — Reversal Probability');
    expect(md).toContain('### Engine 4 — Market Confidence');
    expect(md).toContain('## MARKET STATE');
    expect(md).toContain('## AI REVIEW SPECIFICATION (V4.1 — EMBEDDED)');
    expect(md).toContain('V41ReviewLevel');
    expect(md).toContain('INFO | WATCH | WARN | BLOCK | CRITICAL');
    expect(md).toContain('Do not invent HARD/SOFT/UNLOCK');
    expect(md).toContain('Do not map these to V3/V4 Group A/B/C');
    expect(md).toContain('KHÔNG tự suy ra ngưỡng ts/ex/vol');
    expect(md).toContain('Market State = Distribution or Accumulation');
    expect(md).toContain('Market State = LateUptrend');
    expect(md).toContain('Example A — Distribution caution');
    expect(md).not.toContain(
      'Trend Exhaustion ≥ 70 with Trend Strength ≥ 80 (late / distribution risk)',
    );
    expect(md).toContain('không phải rule của marketStateEngine');
    expect(md).not.toMatch(/\bHB-|\bGB-|Hard Blocked/);
  });

  it('detail missing renders UNAVAILABLE without inventing engine tables', () => {
    const md = buildMarketIntelligenceExport({
      snapshot: fixtureSnapshot(false),
      metadata: { generatedAt: FIXED_GENERATED_AT },
    });
    expect(md).toContain('Detail Breakdown: UNAVAILABLE');
    expect(md).not.toContain('### Engine 1 — Trend Strength');
    expect(md).toContain('## MARKET STATE');
    expect(md).toContain('Market State: Distribution');
  });
});

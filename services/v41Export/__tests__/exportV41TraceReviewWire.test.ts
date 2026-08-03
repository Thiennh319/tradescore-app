import { describe, expect, it } from 'vitest';
import type { SignalRowV41 } from '../../v41/scanV41';
import { buildMarketIntelligenceExport } from '../index';
import type { MarketIntelligenceSnapshot } from '../marketIntelligence/Types';
import { exportV41MarketIntelligenceTrace } from '../wire/exportV41TraceReviewWire';

const FIXED_GENERATED_AT = '2026-07-26T02:00:00.000Z';

function fixtureSnapshot(): MarketIntelligenceSnapshot {
  return {
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

function fixtureRow(overrides: Partial<SignalRowV41> = {}): SignalRowV41 {
  return {
    symbol: 'BTCUSDT',
    snapshot: fixtureSnapshot(),
    visibilityMode: 'WATCH_MODE',
    fetchedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('exportV41MarketIntelligenceTrace wire', () => {
  it('filename follows 01_MARKET_INTELLIGENCE_V41_{SYMBOL}.md', () => {
    const { filename } = exportV41MarketIntelligenceTrace(fixtureRow());
    expect(filename).toBe('01_MARKET_INTELLIGENCE_V41_BTCUSDT.md');
  });

  it('markdown matches direct buildMarketIntelligenceExport (copy-only)', () => {
    const row = fixtureRow();
    const expected = buildMarketIntelligenceExport({
      snapshot: row.snapshot,
      symbol: row.symbol,
      metadata: { coin: row.symbol, generatedAt: FIXED_GENERATED_AT },
    });
    const { markdown } = exportV41MarketIntelligenceTrace(row, {
      metadata: { generatedAt: FIXED_GENERATED_AT },
    });
    expect(markdown).toBe(expected);
    expect(markdown).toContain('Market State: Distribution');
    expect(markdown).toContain('### Engine 1 — Trend Strength');
    expect(markdown).toContain('## AI REVIEW SPECIFICATION (V4.1 — EMBEDDED)');
  });

  it('detail missing on snapshot → UNAVAILABLE engines (no invent)', () => {
    const snap = fixtureSnapshot();
    delete snap.detail;
    const { markdown } = exportV41MarketIntelligenceTrace(
      fixtureRow({ snapshot: snap }),
      { metadata: { generatedAt: FIXED_GENERATED_AT } },
    );
    expect(markdown).toContain('Detail Breakdown: UNAVAILABLE');
    expect(markdown).not.toContain('### Engine 1 — Trend Strength');
  });
});

import { describe, expect, it } from 'vitest';
import { buildExportRowV41, formatAsTXTV41 } from '../exportServiceV41';
import type { SignalRowV41 } from '../scanV41';
import type { MarketIntelligenceDetail } from '../types';

const marketDetail: MarketIntelligenceDetail = {
  trend: {
    emaAlignmentScore: 40,
    adxScore: 25,
    slopeScore: 15,
    trendStrength: 80,
    trendDirection: 'BULL',
  },
  exhaustion: {
    rsiExtremeScore: 10,
    distanceEMA20Score: 10,
    volumeDivergencePts: 20,
    candleStreakScore: 5,
    trendExhaustion: 45,
  },
  confidence: {
    trendStrengthBase: 80,
    exhaustionMultiplier: 0.55,
    btcAlignmentFactor: 1.0,
    altDirection: 'BULL',
    btcDirection: 'BULL',
    marketConfidence: 44,
  },
  reversal: {
    reversalProbability: 30,
    rsiDivergenceScore: 50,
    cvdDivergenceScore: 0,
  },
};

function baseRow(): SignalRowV41 {
  return {
    symbol: 'NEARUSDT',
    visibilityMode: 'TRADE_MODE',
    markPrice: 1.97,
    snapshot: {
      trendStrength: 80,
      trendDirection: 'BULL',
      trendExhaustion: 45,
      volumeDivergencePts: 20,
      reversalProbability: 30,
      rsiDivergenceScore: 50,
      cvdDivergenceScore: 0,
      marketConfidence: 44,
      btcAlignmentFactor: 1.0,
      btcDirection: 'BULL',
      marketState: 'HealthyUptrend',
      scanTimestamp: Date.now(),
      detail: marketDetail,
    },
  } as SignalRowV41;
}

describe('exportServiceV41 MARKET DETAIL', () => {
  it('prints trend sub-scores and final trend score', () => {
    const txt = formatAsTXTV41([buildExportRowV41(baseRow())]);

    expect(txt).toContain('MARKET DETAIL');
    expect(txt).toContain('Trend Score');
    expect(txt).toContain('EMA Alignment........... +40');
    expect(txt).toContain('EMA Slope............... +15');
    expect(txt).toContain('ADX..................... +25');
    expect(txt).toContain('Final Trend Score: 80 (BULL)');
  });

  it('prints confidence confirmations from existing engine fields', () => {
    const txt = formatAsTXTV41([buildExportRowV41(baseRow())]);

    expect(txt).toContain('Confidence Detail');
    expect(txt).toContain('Trend Direction......... PASS');
    expect(txt).toContain('Volume Confirmation..... FAIL');
    expect(txt).toContain('BTC Alignment........... PASS');
    expect(txt).toContain('RSI Reversal Divergence. FAIL');
    expect(txt).toContain('CVD Reversal Divergence. PASS');
    expect(txt).toContain('Confidence: 44');
  });

  it('keeps MARKET INTELLIGENCE summary unchanged', () => {
    const txt = formatAsTXTV41([buildExportRowV41(baseRow())]);
    expect(txt).toContain('MARKET INTELLIGENCE:');
    expect(txt).toMatch(/MARKET INTELLIGENCE:[\s\S]*MARKET DETAIL/);
  });
});

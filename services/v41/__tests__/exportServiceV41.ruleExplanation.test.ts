import { describe, expect, it } from 'vitest';
import { buildExportRowV41, formatAsTXTV41 } from '../exportServiceV41';
import type { SignalRowV41 } from '../scanV41';

function waitScenarioRow(): SignalRowV41 {
  return {
    symbol: 'NEARUSDT',
    visibilityMode: 'TRADE_MODE',
    markPrice: 1.97,
    snapshot: {
      trendStrength: 80,
      trendDirection: 'BULL',
      trendExhaustion: 25,
      volumeDivergencePts: 0,
      reversalProbability: 20,
      rsiDivergenceScore: 0,
      cvdDivergenceScore: 0,
      marketConfidence: 75,
      btcAlignmentFactor: 1.0,
      btcDirection: 'BULL',
      marketState: 'HealthyUptrend',
      scanTimestamp: Date.now(),
    },
    opportunity: {
      buyScore: 82,
      sellScore: 40,
      entryQuality: 82,
      entryQualityLong: 82,
      entryQualityShort: 40,
      opportunityDirection: 'LONG',
      opportunityValid: true,
      qualityLabel: 'Trade Ready',
      eqThreshold: 70,
      confidenceTier: 'HIGH',
      momentumConfirmedLong: false,
      momentumConfirmedShort: false,
      exhaustionDetected: false,
      exhaustionType: 'NONE',
      effectiveConfThreshold: 60,
      effectiveEqThreshold: 70,
    },
    protection: {
      stopHuntDetected: false,
      stopHuntRisk: 'LOW',
      volatilityRisk: 'NORMAL',
      volatilityAtrPct: 100,
      protectionWarnings: [],
      protectionPenalty: 0,
    },
    earlyWarning: {
      severity: 'CLEAR',
      warningMessage: '',
      blockMessage: '',
      signalCount: 0,
      signals: [],
    },
    momentum: {
      momentumLong: 1,
      momentumShort: 0,
      momentumConfirmedLong: false,
      momentumConfirmedShort: false,
      signalsLong: ['BUY_VOLUME_SPIKE_1H'],
      signalsShort: [],
      tpMultiplier: 1.1,
      slMultiplier: 1.0,
    },
  } as SignalRowV41;
}

describe('exportServiceV41 RULE EXPLANATION', () => {
  it('explains WHY NOT ENTER with human-readable failed momentum rules', () => {
    const txt = formatAsTXTV41([buildExportRowV41(waitScenarioRow())]);

    expect(txt).toContain('RULE EXPLANATION');
    expect(txt).toContain('WHY NOT ENTER');
    expect(txt).toContain('✓ Trend is strong');
    expect(txt).toContain('✓ Entry quality is excellent');
    expect(txt).toContain('✗ Momentum confirmation missing');
    expect(txt).toContain('CVD Rising not confirmed');
    expect(txt).not.toMatch(/\n✗ 0\n/);
    expect(txt).toContain('Final Decision:');
    expect(txt).toContain('WAIT');
  });

  it('shows WHY ENTER when trade ready and risk approved', () => {
    const row = waitScenarioRow();
    row.momentum = {
      momentumLong: 2,
      momentumShort: 0,
      momentumConfirmedLong: true,
      momentumConfirmedShort: false,
      signalsLong: ['BUY_VOLUME_SPIKE_1H', 'CVD_RISING_1H'],
      signalsShort: [],
      tpMultiplier: 1.3,
      slMultiplier: 1.0,
    };

    const txt = formatAsTXTV41([buildExportRowV41(row)]);
    expect(txt).toContain('WHY ENTER');
    expect(txt).toContain('✓ Momentum confirmed for LONG');
    expect(txt).toContain('Final Decision:\nENTER');
  });

  it('BLOCK decision when early warning blocks', () => {
    const row = waitScenarioRow();
    row.visibilityMode = 'WATCH_MODE';
    row.earlyWarning = {
      severity: 'BLOCK',
      warningMessage: 'Đảo chiều',
      blockMessage: 'Đảo chiều xác nhận — không vào lệnh',
      signalCount: 3,
      signals: [],
    };

    const txt = formatAsTXTV41([buildExportRowV41(row)]);
    expect(txt).toContain('✗ Early warning blocks entry');
    expect(txt).toContain('Final Decision:\nBLOCK');
  });
});

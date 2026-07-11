import { describe, expect, it } from 'vitest';
import { buildExportRowV41, formatAsTXTV41 } from '../exportServiceV41';
import type { SignalRowV41 } from '../scanV41';

function baseRow(overrides: Partial<SignalRowV41> = {}): SignalRowV41 {
  return {
    symbol: 'NEARUSDT',
    visibilityMode: 'TRADE_MODE',
    markPrice: 1.97,
    snapshot: {
      marketState: 'HealthyUptrend',
      trendStrength: 70,
      trendDirection: 'BULL',
      trendExhaustion: 10,
      volumeDivergencePts: 0,
      reversalProbability: 20,
      rsiDivergenceScore: 0,
      cvdDivergenceScore: 0,
      marketConfidence: 75,
      btcAlignmentFactor: 1,
      btcDirection: 'UP',
    },
    opportunity: {
      buyScore: 80,
      sellScore: 40,
      entryQuality: 80,
      entryQualityLong: 80,
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
    ...overrides,
  } as SignalRowV41;
}

describe('exportServiceV41 ENTRY GATE STATUS', () => {
  it('shows gate lines and block reasons when momentum blocks', () => {
    const txt = formatAsTXTV41([buildExportRowV41(baseRow())]);

    expect(txt).toContain('ENTRY GATE STATUS');
    expect(txt).toContain('Market Intelligence..... PASS');
    expect(txt).toContain('Entry Quality........... PASS');
    expect(txt).toContain('Momentum Confirmation... FAIL');
    expect(txt).toContain('Protection.............. PASS');
    expect(txt).toContain('Early Warning........... PASS');
    expect(txt).toContain('Trade Ready............. NO');
    expect(txt).toContain('BLOCK REASONS');
    expect(txt).toContain('* Momentum not confirmed');
    expect(txt).toContain('* CVD Rising missing');
  });

  it('Trade Ready YES when all LONG gates pass', () => {
    const row = baseRow({
      momentum: {
        momentumLong: 2,
        momentumShort: 0,
        momentumConfirmedLong: true,
        momentumConfirmedShort: false,
        signalsLong: ['BUY_VOLUME_SPIKE_1H', 'CVD_RISING_1H'],
        signalsShort: [],
        tpMultiplier: 1.3,
        slMultiplier: 1.0,
      },
    });

    const txt = formatAsTXTV41([buildExportRowV41(row)]);
    expect(txt).toContain('Momentum Confirmation... PASS');
    expect(txt).toContain('Trade Ready............. YES');
    expect(txt).not.toContain('BLOCK REASONS');
  });

  it('Early Warning BLOCK fails gate and lists reason', () => {
    const row = baseRow({
      visibilityMode: 'WATCH_MODE',
      earlyWarning: {
        severity: 'BLOCK',
        warningMessage: 'Đảo chiều',
        blockMessage: 'Đảo chiều xác nhận — không vào lệnh',
        signalCount: 3,
        signals: [],
      },
    });

    const txt = formatAsTXTV41([buildExportRowV41(row)]);
    expect(txt).toContain('Early Warning........... FAIL');
    expect(txt).toContain('* Đảo chiều xác nhận — không vào lệnh');
    expect(txt).toContain('* Not in Trade Mode (WATCH_MODE)');
  });

  it('keeps ENTRY QUALITY section unchanged', () => {
    const txt = formatAsTXTV41([buildExportRowV41(baseRow())]);
    expect(txt).toContain('ENTRY QUALITY:');
    expect(txt).toMatch(/ENTRY QUALITY:[\s\S]*ENTRY GATE STATUS/);
  });
});

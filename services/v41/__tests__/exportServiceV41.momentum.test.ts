import { describe, expect, it } from 'vitest';
import { buildExportRowV41, formatAsTXTV41 } from '../exportServiceV41';
import type { SignalRowV41 } from '../scanV41';

function minimalRow(momentum?: SignalRowV41['momentum']): SignalRowV41 {
  return {
    symbol: 'NEARUSDT',
    visibilityMode: 'TRADE_MODE',
    markPrice: 1.97,
    snapshot: {
      marketState: 'TRENDING',
      trendStrength: 70,
      trendDirection: 'UP',
      trendExhaustion: 10,
      volumeDivergencePts: 0,
      reversalProbability: 20,
      rsiDivergenceScore: 0,
      cvdDivergenceScore: 0,
      marketConfidence: 75,
      btcAlignmentFactor: 1,
      btcDirection: 'UP',
    },
    momentum,
  } as SignalRowV41;
}

describe('exportServiceV41 MOMENTUM DETAIL', () => {
  it('prints PASS/FAIL per rule and score threshold', () => {
    const row = minimalRow({
      momentumLong: 1,
      momentumShort: 0,
      momentumConfirmedLong: false,
      momentumConfirmedShort: false,
      signalsLong: ['BUY_VOLUME_SPIKE_1H'],
      signalsShort: [],
      tpMultiplier: 1.1,
      slMultiplier: 1.0,
    });

    const txt = formatAsTXTV41([buildExportRowV41(row, { price: 1.97, changePct: 0.5 })]);

    expect(txt).toContain('MOMENTUM DETAIL');
    expect(txt).toContain('Buy Volume Spike...... PASS');
    expect(txt).toContain('CVD Rising............ FAIL');
    expect(txt).toContain('Momentum Score (LONG): 1/2');
    expect(txt).toContain('Required: 2/2');
    expect(txt).toContain('Confirmed LONG: NO');
    expect(txt).toContain('Sell Volume Spike..... FAIL');
    expect(txt).toContain('CVD Falling........... FAIL');
    expect(txt).toContain('Confirmed SHORT: NO');
  });

  it('confirmed LONG when both rules pass', () => {
    const row = minimalRow({
      momentumLong: 2,
      momentumShort: 0,
      momentumConfirmedLong: true,
      momentumConfirmedShort: false,
      signalsLong: ['BUY_VOLUME_SPIKE_1H', 'CVD_RISING_1H'],
      signalsShort: [],
      tpMultiplier: 1.3,
      slMultiplier: 1.0,
    });

    const txt = formatAsTXTV41([buildExportRowV41(row)]);

    expect(txt).toContain('Buy Volume Spike...... PASS');
    expect(txt).toContain('CVD Rising............ PASS');
    expect(txt).toContain('Momentum Score (LONG): 2/2');
    expect(txt).toContain('Confirmed LONG: YES');
  });

  it('keeps existing MOMENTUM 1H section', () => {
    const row = minimalRow();
    const txt = formatAsTXTV41([buildExportRowV41(row)]);
    expect(txt).toContain('MOMENTUM 1H:');
    expect(txt).toContain('Long: 0 (confirmed: no)');
  });
});

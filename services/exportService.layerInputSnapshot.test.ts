import { describe, expect, it } from 'vitest';
import type { LayerResult } from '../constants/scoring';
import { buildRuleAuditSnapshot } from './ruleAuditSnapshotBuilder';
import type { SignalRow, SignalRowScorerSnapshot } from './signalBoardScan';
import {
  exportTradeScoreAuditPackage,
  formatLayerInputSnapshotTXT,
} from './exportService';

function layer(
  id: number,
  name: string,
  passed: boolean,
  reason: string,
): LayerResult {
  return {
    layer: id as LayerResult['layer'],
    name,
    score: passed ? 1 : 0,
    maxScore: 1.5,
    passed,
    isMandatory: false,
    isMandatoryViolation: false,
    reason,
  };
}

function scorerSnapshot(layers: LayerResult[]): SignalRowScorerSnapshot {
  return {
    score: 10,
    longScore: 10,
    shortScore: 5,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'CÓ THỂ VÀO',
    winrate: '~65%',
    canEnter: true,
    layers,
    mandatoryViolations: [],
    hardBlocked: false,
  };
}

function snapshotRow(): SignalRow {
  const snapshot = buildRuleAuditSnapshot();
  snapshot.ema.h1.ema20 = 100;
  snapshot.ema.h1.ema50 = 98;
  snapshot.ema.h1.ema200 = 90;
  snapshot.ema.h1.priceVsEma20Pct = 1.25;
  snapshot.ema.h1.slope20 = 'UP';
  snapshot.rsi.rsi1h = 55;
  snapshot.rsi.rsi4h = 52;
  snapshot.macd.h1.macd = 1.2;
  snapshot.macd.h1.signal = 0.8;
  snapshot.macd.h1.histogram = 0.4;
  snapshot.volume.lastVolume = 1_500;
  snapshot.volume.avgVolume1h = 1_000;
  snapshot.volume.volumeRatio1h = 1.5;
  snapshot.cvd.value = 250_000;
  snapshot.cvd.cvdMomentum24h = 80_000;
  snapshot.cvd.slope = 'up';
  snapshot.oi.current = 2_000_000;
  snapshot.oi.previous = 1_900_000;
  snapshot.oi.delta = 100_000;
  snapshot.funding.ratePct = 0.005;
  snapshot.longShortRatio.topRatio = 1.2;
  snapshot.atr.atr1h = 2.5;
  snapshot.atr.atr1hPct = 2.5;

  const layers = [
    layer(1, 'EMA', true, 'EMA aligned'),
    layer(2, 'RSI', true, 'RSI in range'),
    layer(3, 'MACD', false, 'Histogram not aligned'),
    layer(5, 'CVD', true, 'CVD supportive'),
    layer(52, 'Volume / OI', true, 'Vol 1.5x, OI rising'),
    layer(6, 'Funding', true, 'Funding acceptable'),
    layer(7, 'L/S + Whale', true, 'L/S supportive'),
  ];

  return {
    symbol: 'BTCUSDT',
    price: 101.25,
    change24h: 1,
    trend: 'UP',
    regimeConfidence: 70,
    score: 10,
    longScore: 10,
    shortScore: 5,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'CÓ THỂ VÀO',
    winrate: '~65%',
    canEnter: true,
    tradePlan: null,
    layers,
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    ruleAuditSnapshot: snapshot,
    v4: scorerSnapshot(layers),
  };
}

describe('TASK 16.1 layer input snapshot export', () => {
  it('exports raw inputs, threshold, expected, actual and result per layer', () => {
    const txt = formatLayerInputSnapshotTXT([snapshotRow()], 'v4');

    expect(txt).toContain('Layer Name: EMA Alignment');
    expect(txt).toContain('Current Price: 101.25');
    expect(txt).toContain('EMA20 1H: 100');
    expect(txt).toContain('Rule Threshold:');
    expect(txt).toContain('Expected: PASS');
    expect(txt).toContain('Layer Name: MACD');
    expect(txt).toContain('Actual: FAIL');
    expect(txt).toContain('Result: FAIL');
    expect(txt).toContain('Evaluation Evidence: Histogram not aligned');
  });

  it('does not guess raw inputs absent from the frozen snapshot', () => {
    const txt = formatLayerInputSnapshotTXT([snapshotRow()], 'v4');

    expect(txt).toContain('Layer Name: Whale');
    expect(txt).toContain('Buy Wall: UNAVAILABLE');
    expect(txt).toContain('Sell Wall: UNAVAILABLE');
    expect(txt).toContain('Distance: UNAVAILABLE');
    expect(txt).toContain('Layer Name: Spread');
    expect(txt).toContain('Layer Name: Liquidity');
    expect(txt).toContain('Result: WARNING');
  });

  it('appends section 12 without renumbering existing package sections', () => {
    const txt = exportTradeScoreAuditPackage([snapshotRow()], 'v4');

    expect(txt).toContain('SECTION 11\nBASELINE');
    expect(txt).toContain('SECTION 12\nLAYER INPUT SNAPSHOT');
  });
});

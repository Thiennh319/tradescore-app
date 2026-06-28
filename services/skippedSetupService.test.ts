import { describe, expect, it } from 'vitest';
import type { SignalRow } from '../services/signalBoardScan';
import {
  computeHypotheticalPnlPct,
  getSkippedStats,
  inferSkipReasonFromSignalRow,
  newSkippedSetupEntry,
  refreshSkippedSetupMarkPrices,
} from './skippedSetupService';

function sampleRow(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    symbol: 'NEARUSDT',
    price: 2.1,
    change24h: 1,
    trend: 'BULLISH',
    regimeConfidence: 0.8,
    score: 7.5,
    longScore: 7.5,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    tradePlan: null,
    layers: [
      {
        layer: 9,
        name: 'Session',
        score: 0,
        maxScore: 1.5,
        passed: false,
        isMandatory: false,
        isMandatoryViolation: false,
        reason: 'Giờ xấu',
      },
    ],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    ...overrides,
  };
}

describe('skippedSetupService', () => {
  it('infers LOW_SCORE when score below 9', () => {
    const r = inferSkipReasonFromSignalRow(sampleRow({ score: 7.5 }));
    expect(r.skipReason).toBe('LOW_SCORE');
  });

  it('infers MANDATORY_FAIL first', () => {
    const r = inferSkipReasonFromSignalRow(
      sampleRow({ mandatoryViolations: ['L1 = 0đ'], score: 11 }),
    );
    expect(r.skipReason).toBe('MANDATORY_FAIL');
    expect(r.skipReasonDetail).toContain('L1');
  });

  it('computes hypothetical pnl for long', () => {
    expect(computeHypotheticalPnlPct('LONG', 100, 105)).toBe(5);
    expect(computeHypotheticalPnlPct('SHORT', 100, 95)).toBe(5);
  });

  it('refreshes mark prices after 4h', () => {
    const entry = newSkippedSetupEntry({
      symbol: 'NEARUSDT',
      direction: 'LONG',
      totalScore: 8,
      skipReason: 'LOW_SCORE',
      skipReasonDetail: 'test',
      priceAtSkip: 2,
      timestamp: Date.now() - 5 * 3_600_000,
    });
    const [updated] = refreshSkippedSetupMarkPrices([entry], { NEARUSDT: 2.1 });
    expect(updated?.priceAfter2h).toBe(2.1);
    expect(updated?.priceAfter4h).toBe(2.1);
    expect(updated?.hypotheticalPnlPct).toBe(5);
  });

  it('counts correct skips and missed opportunities', () => {
    const winIfEntered = newSkippedSetupEntry({
      symbol: 'NEARUSDT',
      direction: 'LONG',
      totalScore: 8,
      skipReason: 'LOW_SCORE',
      skipReasonDetail: 'test',
      priceAtSkip: 2,
    });
    winIfEntered.priceAfter4h = 2.1;
    winIfEntered.hypotheticalPnlPct = 5;

    const goodSkip = newSkippedSetupEntry({
      symbol: 'SOLUSDT',
      direction: 'LONG',
      totalScore: 7,
      skipReason: 'LOW_SCORE',
      skipReasonDetail: 'test',
      priceAtSkip: 100,
    });
    goodSkip.priceAfter4h = 95;
    goodSkip.hypotheticalPnlPct = -5;

    const stats = getSkippedStats([winIfEntered, goodSkip]);
    expect(stats.withFollowUp).toBe(2);
    expect(stats.correctSkips).toBe(1);
    expect(stats.missedOpportunities).toBe(1);
  });
});

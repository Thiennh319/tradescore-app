import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import {
  applyPartialCloseToEntry,
  partialClosePercentForReason,
  sumPartialClosePercent,
} from './partialClose';

function mockOpenEntry(sizeActual = 100): AiTradeJournalEntry {
  return {
    id: 't1',
    timestamp: Date.now(),
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 1000,
    market: {
      entryPrice: 100,
      priceAtAnalysis: 100,
      slippage: 0,
      cvdValue: 0,
      cvdTrend: 'FLAT',
      volumeRatio: 1,
      btcChangePct: 0,
      fundingRate: 0,
      topLSRatio: 1,
      oiChangePct: 0,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: 10,
      direction: 'LONG',
      layerScores: {
        l1: 1,
        l2: 1,
        l3: 1,
        l4: 1,
        l5: 1,
        l6: 1,
        l7: 1,
        l8: 1,
        l9: 1,
        l10: 1,
      },
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    },
    plan: {
      entryZoneType: 'LIMIT',
      entryZoneOptimal: 100,
      entryZoneRangeLow: 99,
      entryZoneRangeHigh: 101,
      slProposed: 95,
      slActual: 95,
      tp1Proposed: 110,
      tp1Actual: 110,
      tp2: 120,
      tp3: 130,
      rrProposed: 2,
      sizeProposed: sizeActual,
      sizeActual,
      isSafeSL: true,
    },
    outcome: { status: 'OPEN' },
    tags: [],
    version: '2.0.0',
  };
}

describe('partialClose', () => {
  it('PARTIAL_TP1 closes 50% of original size', () => {
    const result = applyPartialCloseToEntry(mockOpenEntry(100), 110, 'PARTIAL_TP1', 5);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.plan.sizeOriginal).toBe(100);
    expect(result.entry.plan.sizeActual).toBe(50);
    expect(result.record.partialClosePercent).toBe(50);
    expect(result.record.partialCloseReason).toBe('PARTIAL_TP1');
  });

  it('second partial 30% leaves 20% of original', () => {
    const first = applyPartialCloseToEntry(mockOpenEntry(100), 110, 'PARTIAL_TP1', 5);
    if (!first.ok) throw new Error('first failed');
    const second = applyPartialCloseToEntry(first.entry, 112, 'PARTIAL_TP2', 5);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.entry.plan.sizeActual).toBe(20);
    expect(sumPartialClosePercent(second.entry.partialCloses ?? [])).toBe(80);
  });

  it('rejects when total partial exceeds 100%', () => {
    const first = applyPartialCloseToEntry(mockOpenEntry(100), 110, 'PARTIAL_TP1', 5);
    if (!first.ok) throw new Error('first failed');
    const second = applyPartialCloseToEntry(first.entry, 112, 'PARTIAL_TP1', 5);
    expect(second.ok).toBe(false);
  });

  it('partialClosePercentForReason', () => {
    expect(partialClosePercentForReason('PARTIAL_TP1')).toBe(50);
    expect(partialClosePercentForReason('PARTIAL_TP2')).toBe(30);
    expect(partialClosePercentForReason('PARTIAL_CLOSE_30')).toBe(30);
  });
});

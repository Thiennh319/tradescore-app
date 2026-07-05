import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { computeTradePnl } from './journalService';

function entryWithPartials(
  sizeActual: number,
  partialCloses: AiTradeJournalEntry['partialCloses'],
): AiTradeJournalEntry {
  return {
    id: 't1',
    timestamp: 1,
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
      sizeProposed: 100,
      sizeActual,
      sizeOriginal: 100,
      isSafeSL: true,
    },
    outcome: { status: 'OPEN' },
    tags: [],
    version: '2.0.0',
    partialCloses,
  };
}

describe('computeTradePnl with partial closes', () => {
  it('includes realized partial + remaining at exit', () => {
    const entry = entryWithPartials(50, [
      {
        partialClosePercent: 50,
        partialClosePrice: 110,
        partialCloseTime: 1,
        partialCloseReason: 'PARTIAL_TP1',
        realizedPnlUSDT: 25,
        realizedPnlPct: 50,
        closedSizeUsdt: 50,
      },
    ]);
    const { pnlUSDT } = computeTradePnl(entry, 110, 5);
    // remaining 50 margin at +10% price move × 5x = 25 USDT + 25 realized
    expect(pnlUSDT).toBe(50);
  });
});

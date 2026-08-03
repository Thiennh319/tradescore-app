import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import {
  buildOpenPnlBreakdownDisplay,
  computeOpenUnrealizedPnlUsdt,
} from './journalUnrealizedDisplay';

describe('journalUnrealizedDisplay', () => {
  it('LONG: (market - entry) × qty', () => {
    const pnl = computeOpenUnrealizedPnlUsdt('LONG', 100, 102, 6, 5);
    expect(pnl).toBeCloseTo(0.6, 4);
  });

  it('SHORT: (entry - market) × qty', () => {
    const pnl = computeOpenUnrealizedPnlUsdt('SHORT', 2.014, 1.94, 6, 5);
    expect(pnl).toBeCloseTo(1.1, 1);
  });

  it('returns null without market price', () => {
    expect(computeOpenUnrealizedPnlUsdt('LONG', 100, null, 6, 5)).toBeNull();
  });

  it('buildOpenPnlBreakdownDisplay matches partial OPEN case', () => {
    const entry: AiTradeJournalEntry = {
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
        sizeActual: 50,
        sizeOriginal: 100,
        isSafeSL: true,
      },
      outcome: { status: 'OPEN' },
      tags: [],
      version: '2.0.0',
      partialCloses: [
        {
          partialClosePercent: 50,
          partialClosePrice: 110,
          partialCloseTime: 1,
          partialCloseReason: 'PARTIAL_TP1',
          realizedPnlUSDT: 25,
          realizedPnlPct: 50,
          closedSizeUsdt: 50,
        },
      ],
    };
    const breakdown = buildOpenPnlBreakdownDisplay(entry, 110, 5);
    expect(breakdown.realizedPnl).toBe(25);
    expect(breakdown.unrealizedPnl).toBe(25);
    expect(breakdown.totalPnl).toBe(50);
  });
});

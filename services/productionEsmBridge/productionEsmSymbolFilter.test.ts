/**
 * ESM bridge symbol filter — tests (UL-04.1).
 */

import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { resolveEligibleEsmSymbols } from './productionEsmSymbolFilter';

function journalEntry(
  symbol: string,
  status: AiTradeJournalEntry['outcome']['status'],
): AiTradeJournalEntry {
  return {
    id: `j-${symbol}-${status}`,
    timestamp: 1,
    symbol,
    accountSizeAtEntry: 1000,
    market: { entryPrice: 1, markPrice: 1, btcChange24h: 0 },
    scoring: {
      totalScore: 10,
      direction: 'LONG',
      layerScores: {},
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
    },
    plan: {
      entryZoneType: 'LIMIT',
      entryZoneOptimal: 1,
      entryZoneRangeLow: 1,
      entryZoneRangeHigh: 1,
      slProposed: 1,
      slActual: 1,
      tp1Proposed: 1,
      tp1Actual: 1,
      tp2: 1,
      tp3: 1,
      rrProposed: 1,
      sizeProposed: 1,
      sizeActual: 1,
      isSafeSL: true,
    },
    outcome: { status },
    tags: [],
    version: '1',
  };
}

describe('resolveEligibleEsmSymbols — UL-04.1', () => {
  it('includes OPEN and PENDING symbols', () => {
    const eligible = resolveEligibleEsmSymbols({
      journalEntries: [
        journalEntry('BTCUSDT', 'OPEN'),
        journalEntry('ETHUSDT', 'PENDING'),
        journalEntry('SOLUSDT', 'WIN'),
      ],
      lockedPlan: null,
    });

    expect(eligible.has('BTCUSDT')).toBe(true);
    expect(eligible.has('ETHUSDT')).toBe(true);
    expect(eligible.has('SOLUSDT')).toBe(false);
  });

  it('includes locked plan symbol', () => {
    const eligible = resolveEligibleEsmSymbols({
      journalEntries: [],
      lockedPlan: {
        symbol: 'BNBUSDT',
        direction: 'LONG',
        status: 'WAITING',
        expiresAt: Date.now() + 60_000,
        lockedScore: 10,
        decisionLabel: 'VAO_TU_TIN',
      } as never,
    });

    expect(eligible.has('BNBUSDT')).toBe(true);
  });
});

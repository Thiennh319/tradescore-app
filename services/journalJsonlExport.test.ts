import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import {
  collectPendingJournalJsonlLines,
  formatJournalJsonlDateVn,
  mergeJournalJsonlCursor,
  prepareJournalJsonlAppend,
} from './journalJsonlExport';

function sampleEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  const base: AiTradeJournalEntry = {
    id: 'j1',
    timestamp: 1_700_000_000_000,
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
      decision: 'ENTER',
      scorerVersion: 'v4',
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
      sizeActual: 100,
      isSafeSL: true,
      openReason: 'test',
    },
    outcome: { status: 'OPEN' },
    tags: [],
    version: '2.0.0',
    strategySource: 'V4',
  };
  return { ...base, ...overrides, scoring: { ...base.scoring, ...overrides.scoring }, outcome: { ...base.outcome, ...overrides.outcome } };
}

describe('journalJsonlExport', () => {
  it('formats VN calendar date as YYYY-MM-DD', () => {
    // 2026-08-09 17:00 UTC = 2026-08-10 00:00 VN (UTC+7)
    expect(formatJournalJsonlDateVn(new Date('2026-08-09T17:00:00.000Z'))).toBe('2026-08-10');
  });

  it('exports new ids; skips unchanged hash', () => {
    const e = sampleEntry();
    const pending1 = collectPendingJournalJsonlLines([e], { hashes: {} });
    expect(pending1).toHaveLength(1);
    expect(pending1[0].line).toContain('"layerScores"');
    expect(pending1[0].line).toContain('"l10":1');

    const cursor = mergeJournalJsonlCursor(null, pending1);
    const pending2 = collectPendingJournalJsonlLines([e], cursor);
    expect(pending2).toHaveLength(0);
  });

  it('re-exports same id when content changes (OPEN → WIN)', () => {
    const open = sampleEntry({ outcome: { status: 'OPEN' } });
    const cursorAfterOpen = mergeJournalJsonlCursor(
      null,
      collectPendingJournalJsonlLines([open], null),
    );
    const closed = sampleEntry({
      outcome: { status: 'WIN', exitPrice: 110, exitTimestamp: 1_700_000_100_000 },
    });
    const pending = collectPendingJournalJsonlLines([closed], cursorAfterOpen);
    expect(pending).toHaveLength(1);
    expect(pending[0].line).toContain('"WIN"');
  });

  it('includes archived entries', () => {
    const archived = sampleEntry({ id: 'a1', archived: true });
    const pending = collectPendingJournalJsonlLines([archived], null);
    expect(pending).toHaveLength(1);
  });

  it('prepareJournalJsonlAppend returns date + nextCursor only for pending', () => {
    const e = sampleEntry();
    const prep = prepareJournalJsonlAppend([e], { hashes: {} }, new Date('2026-08-09T17:00:00.000Z'));
    expect(prep.date).toBe('2026-08-10');
    expect(prep.pending).toHaveLength(1);
    expect(prep.nextCursor.hashes.j1).toBe(prep.pending[0].hash);
  });
});

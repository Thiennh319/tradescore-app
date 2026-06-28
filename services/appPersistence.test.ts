import { describe, expect, it } from 'vitest';
import { summarizeJournal } from './appPersistence';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';

function entry(status: StoredTradeJournalEntry['status'], id: string): StoredTradeJournalEntry {
  return {
    id,
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 100,
    entryTime: Date.now(),
    leverage: 5,
    size: 10,
    status,
  };
}

describe('summarizeJournal', () => {
  it('counts open, pending, and closed separately', () => {
    const summary = summarizeJournal([
      entry('OPEN', '1'),
      entry('OPEN', '2'),
      entry('PENDING', '3'),
      entry('CLOSED', '4'),
    ]);
    expect(summary).toEqual({ open: 2, pending: 1, closed: 1, total: 4 });
  });

  it('returns zeros for empty journal', () => {
    expect(summarizeJournal([])).toEqual({ open: 0, pending: 0, closed: 0, total: 0 });
  });
});

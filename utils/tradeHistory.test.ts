import { describe, expect, it } from 'vitest';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import { getClosedTradePnl, summarizeTradeHistory } from './tradeHistory';

function closedEntry(
  overrides: Partial<StoredTradeJournalEntry> = {},
): StoredTradeJournalEntry {
  return {
    id: 'tj_1',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 100_000,
    entryTime: Date.now(),
    leverage: 10,
    size: 100,
    status: 'CLOSED',
    closedAt: Date.now(),
    ...overrides,
  };
}

describe('getClosedTradePnl', () => {
  it('uses stored realized pnl', () => {
    const pnl = getClosedTradePnl(
      closedEntry({ realizedPnlUsdt: 12.5, realizedPnlPercent: 1.25 }),
    );
    expect(pnl.pnlUsdt).toBe(12.5);
    expect(pnl.pnlPercent).toBe(1.25);
  });

  it('computes from exit price', () => {
    const pnl = getClosedTradePnl(
      closedEntry({ exitPrice: 101_000, leverage: 10, size: 100 }),
    );
    expect(pnl.pnlPercent).toBeCloseTo(10, 1);
    expect(pnl.pnlUsdt).toBeCloseTo(10, 1);
  });
});

describe('summarizeTradeHistory', () => {
  it('aggregates wins losses and total pnl', () => {
    const summary = summarizeTradeHistory([
      closedEntry({ realizedPnlUsdt: 10 }),
      closedEntry({ id: 'tj_2', realizedPnlUsdt: -5 }),
      closedEntry({ id: 'tj_3', realizedPnlUsdt: 3 }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(1);
    expect(summary.totalPnlUsdt).toBe(8);
    expect(summary.winRate).toBeCloseTo(66.67, 1);
  });
});

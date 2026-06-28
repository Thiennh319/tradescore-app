import { describe, expect, it } from 'vitest';
import { mergeClosedTradeHistory } from './tradeHistorySync';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import type { AiTradeJournalEntry } from '../constants/aiJournal';

describe('mergeClosedTradeHistory', () => {
  it('includes closed AI trades when legacy journal is empty', () => {
    const ai: AiTradeJournalEntry[] = [
      {
        id: 'ai-1',
        timestamp: 1000,
        symbol: 'BTCUSDT',
        market: {
          entryPrice: 100,
        } as AiTradeJournalEntry['market'],
        scoring: { direction: 'LONG' } as AiTradeJournalEntry['scoring'],
        plan: {
          slActual: 90,
          tp1Actual: 110,
          tp2: 120,
          tp3: 130,
          sizeActual: 10,
        } as AiTradeJournalEntry['plan'],
        outcome: {
          status: 'WIN',
          exitPrice: 110,
          pnlUSDT: 5,
          pnlPct: 10,
          exitTimestamp: 2000,
          exitReason: 'TP1_HIT',
        },
      },
    ];

    const closed = mergeClosedTradeHistory([], ai);
    expect(closed).toHaveLength(1);
    expect(closed[0]?.status).toBe('CLOSED');
    expect(closed[0]?.exitPrice).toBe(110);
  });

  it('does not duplicate legacy and AI closed rows', () => {
    const legacy: StoredTradeJournalEntry[] = [
      {
        id: '1',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entryPrice: 100,
        entryTime: 1000,
        leverage: 5,
        size: 10,
        status: 'CLOSED',
        closedAt: 2000,
      },
    ];
    const ai: AiTradeJournalEntry[] = [
      {
        id: 'ai-1',
        timestamp: 1000,
        symbol: 'BTCUSDT',
        market: { entryPrice: 100 } as AiTradeJournalEntry['market'],
        scoring: { direction: 'LONG' } as AiTradeJournalEntry['scoring'],
        plan: { sizeActual: 10 } as AiTradeJournalEntry['plan'],
        outcome: { status: 'WIN' },
      },
    ];

    expect(mergeClosedTradeHistory(legacy, ai)).toHaveLength(1);
  });
});

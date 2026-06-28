import { describe, expect, it } from 'vitest';
import { mergeTradeSnapshots, buildTradeSnapshot } from './tradeSnapshot';
import { DEFAULT_SETTINGS } from '../constants/scoring';

const psychology = {
  noRevengeTrading: true,
  withinDailyLossLimit: true,
  restedAndFocused: false,
  planWritten: false,
  noOverLeverage: true,
};

describe('mergeTradeSnapshots', () => {
  it('keeps the journal with more entries', () => {
    const base = buildTradeSnapshot({
      tradeJournal: [],
      aiTradeJournal: [],
      dailyStats: [],
      accountHistory: [],
      skippedSetups: [],
      settings: { ...DEFAULT_SETTINGS },
      psychologyChecklist: psychology,
    });
    const richer = buildTradeSnapshot({
      ...base,
      aiTradeJournal: [
        {
          id: '1',
          timestamp: 1,
          symbol: 'BTCUSDT',
          market: {} as never,
          scoring: {} as never,
          plan: {} as never,
          outcome: { status: 'WIN' },
        },
      ],
    });

    const merged = mergeTradeSnapshots(base, richer);
    expect(merged?.aiTradeJournal).toHaveLength(1);
  });

  it('giữ lockedPlan từ snapshot mới hơn (kịch bản đổi port)', () => {
    const older = buildTradeSnapshot({
      tradeJournal: [],
      aiTradeJournal: [],
      dailyStats: [],
      accountHistory: [],
      skippedSetups: [],
      settings: { ...DEFAULT_SETTINGS },
      psychologyChecklist: psychology,
      lockedPlan: null,
    });
    const newer = buildTradeSnapshot({
      ...older,
      lockedPlan: { id: 'lp1', status: 'WAITING' } as never,
    });
    newer.savedAt = older.savedAt + 1000;

    const merged = mergeTradeSnapshots(older, newer);
    expect(merged?.lockedPlan).toEqual({ id: 'lp1', status: 'WAITING' });
  });

  it('coi snapshot v1 thiếu lockedPlan là null khi merge', () => {
    const legacy = buildTradeSnapshot({
      tradeJournal: [],
      aiTradeJournal: [],
      dailyStats: [],
      accountHistory: [],
      skippedSetups: [],
      settings: { ...DEFAULT_SETTINGS },
      psychologyChecklist: psychology,
    });
    delete (legacy as { lockedPlan?: unknown }).lockedPlan;
    const fresh = buildTradeSnapshot({
      ...legacy,
      lockedPlan: null,
    });
    fresh.savedAt = legacy.savedAt + 1000;

    const merged = mergeTradeSnapshots(legacy, fresh);
    expect(merged?.lockedPlan).toBeNull();
  });
});

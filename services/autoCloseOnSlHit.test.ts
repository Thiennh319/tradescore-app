import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';

const { closeTradeEntry, closeJournalEntry, getState } = vi.hoisted(() => ({
  closeTradeEntry: vi.fn().mockResolvedValue(undefined),
  closeJournalEntry: vi.fn().mockResolvedValue(undefined),
  getState: vi.fn(),
}));

vi.mock('../store/useTradeStore', () => ({
  useTradeStore: { getState },
}));

import { autoCloseOnSlHit } from './autoCloseOnSlHit';

function openLegacy(
  overrides: Partial<StoredTradeJournalEntry> = {},
): StoredTradeJournalEntry {
  return {
    id: 'legacy_1',
    symbol: 'NEARUSDT',
    direction: 'SHORT',
    entryPrice: 67.22,
    entryTime: Date.now(),
    leverage: 5,
    size: 6.04,
    status: 'OPEN',
    stopLoss: 69.1,
    takeProfit1: 61.9,
    ...overrides,
  };
}

describe('autoCloseOnSlHit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getState.mockReturnValue({
      aiTradeJournal: [
        {
          id: 'ai_1',
          symbol: 'NEARUSDT',
          timestamp: Date.now(),
          archived: false,
          scoring: { direction: 'SHORT' },
          outcome: { status: 'OPEN' },
        },
      ],
      currentOpenDataTrade: null,
      closeTradeEntry,
      closeJournalEntry,
    });
  });

  it('closes ai journal with SL_HIT when SHORT mark >= SL', async () => {
    const entry = openLegacy();
    const ok = await autoCloseOnSlHit(entry, 70.64);
    expect(ok).toBe(true);
    expect(closeTradeEntry).toHaveBeenCalledWith('ai_1', {
      exitPrice: 70.64,
      exitReason: 'SL_HIT',
      offlineClose: false,
      positionAdvisorActionAtExit: null,
      followedAdvisorRecommendation: null,
      scoringDecisionAtExit: null,
      planHealthAtExit: null,
      manualExitReason: null,
      manualExitNote: null,
    });
    expect(closeJournalEntry).not.toHaveBeenCalled();
  });

  it('closes legacy only when no ai entry', async () => {
    getState.mockReturnValue({
      aiTradeJournal: [],
      currentOpenDataTrade: null,
      closeTradeEntry,
      closeJournalEntry,
    });
    const ok = await autoCloseOnSlHit(openLegacy(), 70.64);
    expect(ok).toBe(true);
    expect(closeJournalEntry).toHaveBeenCalledWith('legacy_1', {
      exitPrice: 70.64,
      closeReason: 'SL',
    });
    expect(closeTradeEntry).not.toHaveBeenCalled();
  });

  it('returns false when SL not hit', async () => {
    const ok = await autoCloseOnSlHit(openLegacy(), 68.5);
    expect(ok).toBe(false);
    expect(closeTradeEntry).not.toHaveBeenCalled();
  });

  it('returns false when entry not OPEN', async () => {
    const ok = await autoCloseOnSlHit(openLegacy({ status: 'CLOSED' }), 70.64);
    expect(ok).toBe(false);
  });
});

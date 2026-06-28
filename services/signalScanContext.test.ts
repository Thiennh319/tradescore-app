import { describe, expect, it } from 'vitest';
import { buildSignalScanContext } from './signalScanContext';
import { DEFAULT_SETTINGS } from '../constants/scoring';

describe('buildSignalScanContext', () => {
  it('includes recent AI journal outcomes for V3 scoring', () => {
    const ctx = buildSignalScanContext({
      tradeJournal: [],
      aiTradeJournal: [
        {
          id: '1',
          timestamp: 1,
          symbol: 'BTCUSDT',
          market: {} as never,
          scoring: {} as never,
          plan: {} as never,
          outcome: { status: 'LOSS', pnlUSDT: -2 },
        },
      ],
      settings: { ...DEFAULT_SETTINGS },
    });
    expect(ctx.recentJournal).toHaveLength(1);
    expect(ctx.recentJournal[0]?.outcome.status).toBe('LOSS');
  });
});

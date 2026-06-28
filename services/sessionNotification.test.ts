import { describe, expect, it } from 'vitest';
import { buildSessionCheckMessage } from './sessionNotificationMessage';

describe('buildSessionCheckMessage', () => {
  it('includes setups and open trades', () => {
    const msg = buildSessionCheckMessage({
      time: new Date('2026-06-13T03:02:00.000Z'),
      setups: [{ symbol: 'NEARUSDT', direction: 'SHORT', score: 12.5 }],
      openTradeCount: 1,
    });
    expect(msg.title).toContain('TradeScore');
    expect(msg.body).toContain('NEAR');
    expect(msg.body).toContain('SHORT');
    expect(msg.body).toContain('12.5');
  });

  it('handles no setups', () => {
    const msg = buildSessionCheckMessage({
      time: new Date('2026-06-13T03:02:00.000Z'),
      setups: [],
      openTradeCount: 0,
    });
    expect(msg.body).toContain('Không có setup');
  });
});

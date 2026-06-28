import { describe, expect, it } from 'vitest';
import { buildPriceAlertMessage } from './priceAlertNotificationMessage';

describe('buildPriceAlertMessage', () => {
  it('formats SL hit for LONG', () => {
    const msg = buildPriceAlertMessage({
      symbol: 'BTCUSDT',
      direction: 'LONG',
      kind: 'SL',
      levelPrice: 98_000,
      markPrice: 97_950,
    });
    expect(msg.title).toContain('BTC');
    expect(msg.title).toContain('LONG');
    expect(msg.title).toContain('SL');
    expect(msg.body).toContain('$97,950.00');
    expect(msg.body).toContain('$98,000.00');
  });

  it('formats TP hit', () => {
    const msg = buildPriceAlertMessage({
      symbol: 'NEARUSDT',
      direction: 'SHORT',
      kind: 'TP2',
      levelPrice: 4.5,
      markPrice: 4.48,
    });
    expect(msg.title).toContain('NEAR');
    expect(msg.title).toContain('TP2');
  });
});

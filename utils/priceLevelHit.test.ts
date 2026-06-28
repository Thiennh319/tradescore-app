import { describe, expect, it } from 'vitest';
import { detectNewPriceLevelHits, isPriceLevelHit } from './priceLevelHit';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';

function baseEntry(
  overrides: Partial<StoredTradeJournalEntry> = {},
): StoredTradeJournalEntry {
  return {
    id: 'tj_test',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entryPrice: 100_000,
    entryTime: Date.now(),
    leverage: 10,
    size: 100,
    status: 'OPEN',
    stopLoss: 98_000,
    takeProfit1: 102_000,
    takeProfit2: 104_000,
    takeProfit3: 106_000,
    ...overrides,
  };
}

describe('isPriceLevelHit', () => {
  it('LONG SL when price at or below stop', () => {
    expect(isPriceLevelHit('LONG', 98_000, 98_000, 'SL')).toBe(true);
    expect(isPriceLevelHit('LONG', 97_500, 98_000, 'SL')).toBe(true);
    expect(isPriceLevelHit('LONG', 98_500, 98_000, 'SL')).toBe(false);
  });

  it('LONG TP when price at or above target', () => {
    expect(isPriceLevelHit('LONG', 102_000, 102_000, 'TP1')).toBe(true);
    expect(isPriceLevelHit('LONG', 103_000, 102_000, 'TP1')).toBe(true);
    expect(isPriceLevelHit('LONG', 101_000, 102_000, 'TP1')).toBe(false);
  });

  it('SHORT SL when price at or above stop', () => {
    expect(isPriceLevelHit('SHORT', 102_000, 102_000, 'SL')).toBe(true);
    expect(isPriceLevelHit('SHORT', 101_000, 102_000, 'SL')).toBe(false);
  });

  it('SHORT TP when price at or below target', () => {
    expect(isPriceLevelHit('SHORT', 98_000, 98_000, 'TP1')).toBe(true);
    expect(isPriceLevelHit('SHORT', 99_000, 98_000, 'TP1')).toBe(false);
  });
});

describe('detectNewPriceLevelHits', () => {
  it('returns all newly hit levels', () => {
    const hits = detectNewPriceLevelHits(baseEntry(), 104_500);
    expect(hits.map((h) => h.kind)).toEqual(['TP1', 'TP2']);
  });

  it('skips already fired alerts', () => {
    const hits = detectNewPriceLevelHits(
      baseEntry({ priceAlertsFired: ['TP1'] }),
      104_500,
    );
    expect(hits.map((h) => h.kind)).toEqual(['TP2']);
  });

  it('detects SL for SHORT', () => {
    const hits = detectNewPriceLevelHits(
      baseEntry({
        direction: 'SHORT',
        stopLoss: 101_000,
        takeProfit1: 97_000,
        takeProfit2: 95_000,
        takeProfit3: 93_000,
      }),
      101_500,
    );
    expect(hits).toEqual([{ kind: 'SL', levelPrice: 101_000 }]);
  });
});

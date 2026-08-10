import { describe, expect, it } from 'vitest';
import {
  dedupeKeyForRecord,
  filterNewMarketRawRecords,
  mergeMarketRawCursor,
  resolveCatchUpStartMs,
  type MarketRawRecord,
} from './marketRawCatchUp';

function rec(
  partial: Partial<MarketRawRecord> & Pick<MarketRawRecord, 'kind' | 'symbol' | 'ts'>,
): MarketRawRecord {
  return {
    v: 1,
    interval: '1h',
    fetchedAt: 2_000,
    payload: {},
    ...partial,
  };
}

describe('marketRawCatchUp', () => {
  it('resolveCatchUpStartMs uses 14d backfill when no cursor', () => {
    const now = 1_700_000_000_000;
    const start = resolveCatchUpStartMs({ byKey: {} }, 'BTCUSDT', 'klines', now, 14);
    expect(start).toBe(now - 14 * 24 * 60 * 60 * 1000);
  });

  it('resolveCatchUpStartMs resumes after last watermark', () => {
    const cursor = { byKey: { 'BTCUSDT|klines|1h': 1000 } };
    expect(resolveCatchUpStartMs(cursor, 'BTCUSDT', 'klines', 9_000)).toBe(1001);
  });

  it('filterNewMarketRawRecords drops ts <= watermark and dedupes', () => {
    const cursor = { byKey: { 'BTCUSDT|klines|1h': 100 } };
    const rows = [
      rec({ kind: 'klines', symbol: 'BTCUSDT', ts: 100 }),
      rec({ kind: 'klines', symbol: 'BTCUSDT', ts: 200 }),
      rec({ kind: 'klines', symbol: 'BTCUSDT', ts: 200 }),
      rec({ kind: 'klines', symbol: 'BTCUSDT', ts: 50 }),
    ];
    const filtered = filterNewMarketRawRecords(rows, cursor);
    expect(filtered.map((r) => r.ts)).toEqual([200]);
    expect(dedupeKeyForRecord(filtered[0])).toBe('BTCUSDT|klines|200');
  });

  it('mergeMarketRawCursor advances max ts per key', () => {
    const next = mergeMarketRawCursor({ byKey: { 'BTCUSDT|funding|1h': 10 } }, [
      rec({ kind: 'funding', symbol: 'BTCUSDT', ts: 5 }),
      rec({ kind: 'funding', symbol: 'BTCUSDT', ts: 40 }),
    ]);
    expect(next.byKey['BTCUSDT|funding|1h']).toBe(40);
  });
});

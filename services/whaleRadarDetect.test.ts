import { describe, expect, it } from 'vitest';
import {
  detectWhaleRadarEvents,
  priceKeyForWall,
  type SymbolBookSnapshot,
  type WhaleWallRecord,
} from './whaleRadarDetect';

function wall(
  price: number,
  side: 'BID' | 'ASK',
  notionalUsd: number,
  strength: number,
  firstSeenAt: number,
): WhaleWallRecord {
  return {
    priceKey: priceKeyForWall(price),
    price,
    qty: notionalUsd / price,
    side,
    notionalUsd,
    strength,
    firstSeenAt,
  };
}

function snap(
  symbol: 'BTCUSDT',
  markPrice: number,
  walls: WhaleWallRecord[],
  scannedAt: number,
): SymbolBookSnapshot {
  return { symbol, markPrice, walls, scannedAt };
}

describe('detectWhaleRadarEvents', () => {
  const t0 = 1_700_000_000_000;
  const t1 = t0 + 5 * 60_000;

  it('returns empty when no previous snapshot', () => {
    const curr = snap('BTCUSDT', 100_000, [wall(99_000, 'BID', 600_000, 6, t1)], t1);
    expect(detectWhaleRadarEvents(null, curr)).toEqual([]);
  });

  it('detects large wall placed', () => {
    const prev = snap('BTCUSDT', 100_000, [], t0);
    const curr = snap(
      'BTCUSDT',
      100_000,
      [wall(99_500, 'BID', 5_500_000, 40, t1)],
      t1,
    );
    const events = detectWhaleRadarEvents(prev, curr);
    expect(events.some((e) => e.kind === 'WALL_PLACED')).toBe(true);
  });

  it('does not alert when same whale wall persists (mark price moves)', () => {
    const prev = snap(
      'BTCUSDT',
      100_000,
      [wall(99_500, 'BID', 5_000_000, 40, t0)],
      t0,
    );
    const curr = snap(
      'BTCUSDT',
      101_500,
      [wall(99_500, 'BID', 5_100_000, 40.5, t1)],
      t1,
    );
    expect(detectWhaleRadarEvents(prev, curr)).toEqual([]);
  });

  it('does not re-alert placed wall on third scan if unchanged', () => {
    const w = wall(99_500, 'BID', 5_500_000, 40, t0);
    const prev = snap('BTCUSDT', 100_000, [w], t0);
    const mid = snap('BTCUSDT', 100_200, [w], t0 + 5 * 60_000);
    const curr = snap('BTCUSDT', 99_800, [w], t1);
    expect(detectWhaleRadarEvents(prev, mid)).toEqual([]);
    expect(detectWhaleRadarEvents(mid, curr)).toEqual([]);
  });

  it('alerts when wall grows at least 50%', () => {
    const prev = snap(
      'BTCUSDT',
      100_000,
      [wall(99_500, 'BID', 5_000_000, 38, t0)],
      t0,
    );
    const curr = snap(
      'BTCUSDT',
      100_000,
      [wall(99_500, 'BID', 7_600_000, 42, t1)],
      t1,
    );
    expect(detectWhaleRadarEvents(prev, curr).some((e) => e.kind === 'WALL_PLACED')).toBe(true);
  });

  it('detects spoofing when large wall pulled near price', () => {
    const prev = snap(
      'BTCUSDT',
      100_000,
      [wall(99_800, 'BID', 5_500_000, 40, t0)],
      t0,
    );
    const curr = snap('BTCUSDT', 99_850, [], t1);
    const events = detectWhaleRadarEvents(prev, curr);
    const pulled = events.find((e) => e.kind === 'WALL_PULLED');
    expect(pulled).toBeDefined();
    expect((pulled?.spoofScore ?? 0) >= 2).toBe(true);
  });

  it('ignores small wall removal', () => {
    const prev = snap(
      'BTCUSDT',
      100_000,
      [wall(99_000, 'BID', 50_000, 3, t0)],
      t0,
    );
    const curr = snap('BTCUSDT', 100_000, [], t1);
    expect(detectWhaleRadarEvents(prev, curr)).toEqual([]);
  });
});

describe('priceKeyForWall', () => {
  it('uses absolute price, stable when mark moves', () => {
    expect(priceKeyForWall(99_500)).toBe(99_500);
    expect(priceKeyForWall(99_500)).toBe(priceKeyForWall(99_500));
  });
});

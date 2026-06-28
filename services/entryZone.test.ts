import { describe, expect, it } from 'vitest';
import {
  buildEntryWhaleWalls,
  calculateEntryZone,
  type EntryWhaleWalls,
} from './indicators';

const emptyWalls: EntryWhaleWalls = { bidWalls: [], askWalls: [] };

describe('calculateEntryZone', () => {
  it('returns PULLBACK_EMA when price far above EMA20 (LONG)', () => {
    const zone = calculateEntryZone(2.05, 2.01, 0.015, 'LONG', emptyWalls);
    expect(zone.type).toBe('PULLBACK_EMA');
    expect(zone.optimal).toBeCloseTo(2.013, 3);
  });

  it('uses WALL_SUPPORT when whale bid wall is near price (LONG)', () => {
    const walls: EntryWhaleWalls = {
      bidWalls: [{ price: 99.8, distancePct: -0.2, multiplier: 5.2 }],
      askWalls: [],
    };
    const zone = calculateEntryZone(100, 99.5, 0.5, 'LONG', walls);
    expect(zone.type).toBe('WALL_SUPPORT');
    expect(zone.optimal).toBeCloseTo(99.8 + 0.5 * 0.1, 4);
  });

  it('returns MARKET_NEAR when price close to EMA20 without wall', () => {
    const zone = calculateEntryZone(100, 99.9, 0.5, 'LONG', emptyWalls);
    expect(zone.type).toBe('MARKET_NEAR');
    expect(zone.optimal).toBeLessThan(100);
  });

  it('SHORT PULLBACK_EMA waits for bounce above current when price far below EMA20', () => {
    const zone = calculateEntryZone(2.01, 2.05, 0.015, 'SHORT', emptyWalls);
    expect(zone.type).toBe('PULLBACK_EMA');
    expect(zone.optimal).toBeGreaterThan(2.01);
    expect(zone.optimal).toBeCloseTo(2.047, 3);
  });
});

describe('buildEntryWhaleWalls', () => {
  it('splits pools into bid and ask by current price', () => {
    const groups = buildEntryWhaleWalls(100, [
      { price: 99, volume: 1000, strength: 5, type: 'ORDERBOOK_WALL' },
      { price: 101, volume: 800, strength: 4, type: 'ORDERBOOK_WALL' },
    ]);
    expect(groups.bidWalls).toHaveLength(1);
    expect(groups.askWalls).toHaveLength(1);
  });
});

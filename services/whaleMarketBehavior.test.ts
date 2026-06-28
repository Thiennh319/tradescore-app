import { describe, expect, it } from 'vitest';
import {
  EMPTY_ENTRY_WHALE_WALLS,
  isWhaleActiveInMarket,
  resolveWhaleWallsForConfirmation,
  resolveWhaleWallsForStopProtection,
} from './whaleMarketBehavior';

const sampleWalls = {
  bidWalls: [{ price: 99, distancePct: -1, multiplier: 2 }],
  askWalls: [{ price: 101, distancePct: 1, multiplier: 2 }],
};

describe('whaleMarketBehavior', () => {
  it('isWhaleActiveInMarket: TRENDING and STRONG_TREND only', () => {
    expect(isWhaleActiveInMarket('TRENDING')).toBe(true);
    expect(isWhaleActiveInMarket('STRONG_TREND')).toBe(true);
    expect(isWhaleActiveInMarket('RANGING')).toBe(false);
  });

  it('resolveWhaleWallsForConfirmation: empty in RANGING', () => {
    expect(resolveWhaleWallsForConfirmation('RANGING', sampleWalls)).toEqual(
      EMPTY_ENTRY_WHALE_WALLS,
    );
    expect(resolveWhaleWallsForConfirmation('TRENDING', sampleWalls)).toBe(sampleWalls);
  });

  it('resolveWhaleWallsForStopProtection: empty in RANGING', () => {
    expect(resolveWhaleWallsForStopProtection('RANGING', sampleWalls)).toEqual({
      bidWalls: [],
      askWalls: [],
    });
    expect(resolveWhaleWallsForStopProtection('STRONG_TREND', sampleWalls)).toBe(sampleWalls);
  });
});

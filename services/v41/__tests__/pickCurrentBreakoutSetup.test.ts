import { describe, expect, it } from 'vitest';
import type { BreakoutTradeLevels } from '../breakoutDetector';
import type { KlineV41 } from '../indicators';
import { pickCurrentBreakoutSetup } from '../rc3/buildRc3ViewModel';

const MS_1H = 3_600_000;

function klinesEndingAt(lastOpen: number, count = 5): KlineV41[] {
  return Array.from({ length: count }, (_, i) => {
    const openTime = lastOpen - (count - 1 - i) * MS_1H;
    return {
      openTime,
      open: 1,
      high: 1,
      low: 1,
      close: 1,
      volume: 1,
      closeTime: openTime + MS_1H - 1,
      takerBuyVolume: 0.5,
    };
  });
}

function setup(activeOpenTime: number): BreakoutTradeLevels {
  return {
    side: 'LONG',
    entry: 2,
    sl: 1.9,
    tp1: 2.15,
    slDistancePct: 5,
    tp1RR: 1.5,
    rangeHigh: 2,
    rangeLow: 1.8,
    confirmMode: 'retest',
    consolidationMode: 'width',
    breakoutOpenTime: activeOpenTime - MS_1H,
    activeOpenTime,
  };
}

describe('pickCurrentBreakoutSetup', () => {
  it('picks newest fresh setup within 80×1H', () => {
    const last = 1_000_000_000_000;
    const older = setup(last - 10 * MS_1H);
    const newer = setup(last - 2 * MS_1H);
    const picked = pickCurrentBreakoutSetup([older, newer], klinesEndingAt(last));
    expect(picked).toBe(newer);
  });

  it('ignores setups older than 80×1H', () => {
    const last = 1_000_000_000_000;
    const stale = setup(last - 81 * MS_1H);
    expect(pickCurrentBreakoutSetup([stale], klinesEndingAt(last))).toBeNull();
  });
});

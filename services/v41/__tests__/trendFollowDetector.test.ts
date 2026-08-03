import { describe, expect, it } from 'vitest';
import {
  buildTrendFollowLevels,
  isFirstTrendGateInCooldown,
  meetsTrendGate,
} from '../trendFollowDetector';

describe('meetsTrendGate', () => {
  it('LONG requires BULL + strength min', () => {
    expect(meetsTrendGate('BULL', 70, 'LONG', 70)).toBe(true);
    expect(meetsTrendGate('BULL', 69, 'LONG', 70)).toBe(false);
    expect(meetsTrendGate('BEAR', 90, 'LONG', 70)).toBe(false);
  });

  it('SHORT requires BEAR + strength min', () => {
    expect(meetsTrendGate('BEAR', 70, 'SHORT', 70)).toBe(true);
    expect(meetsTrendGate('BULL', 90, 'SHORT', 70)).toBe(false);
  });
});

describe('isFirstTrendGateInCooldown', () => {
  it('true on first gate after quiet window', () => {
    const g = [false, false, false, true];
    expect(isFirstTrendGateInCooldown(g, 3, 10)).toBe(true);
  });

  it('false when prior gate within cooldown', () => {
    const g = [false, true, false, true];
    expect(isFirstTrendGateInCooldown(g, 3, 10)).toBe(false);
  });

  it('false when current not gated', () => {
    const g = [false, false, false, false];
    expect(isFirstTrendGateInCooldown(g, 3, 10)).toBe(false);
  });
});

describe('buildTrendFollowLevels', () => {
  it('LONG SL below entry by ATR; TP at 1.5R', () => {
    const s = buildTrendFollowLevels({
      side: 'LONG',
      entry: 100,
      atr: 2,
      fourHOpenTime: 1,
      trendStrength: 80,
      trendDirection: 'BULL',
      momentumScore: 1,
    });
    expect(s).not.toBeNull();
    expect(s!.sl).toBeCloseTo(98, 8);
    expect(s!.tp1).toBeCloseTo(100 + 2 * 1.5, 8);
  });
});

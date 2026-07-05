import { describe, expect, it } from 'vitest';
import {
  isLimitEntryAwaitingFill,
  isPendingEntryFilled,
  pendingEntryDistancePercent,
} from './pendingOrderFill';

describe('isPendingEntryFilled', () => {
  it('LONG fills when price drops to entry', () => {
    expect(isPendingEntryFilled('LONG', 99_500, 100_000)).toBe(true);
    expect(isPendingEntryFilled('LONG', 100_500, 100_000)).toBe(false);
  });

  it('SHORT fills when price rises to entry', () => {
    expect(isPendingEntryFilled('SHORT', 100_500, 100_000)).toBe(true);
    expect(isPendingEntryFilled('SHORT', 99_500, 100_000)).toBe(false);
  });

  it('NEAR LONG limit at 2.020 fills when mark <= 2.020', () => {
    expect(isPendingEntryFilled('LONG', 2.019, 2.02)).toBe(true);
    expect(isPendingEntryFilled('LONG', 2.02, 2.02)).toBe(true);
    expect(isPendingEntryFilled('LONG', 2.021, 2.02)).toBe(false);
  });

  it('NEAR SHORT limit at 2.020 fills when mark >= 2.020', () => {
    expect(isPendingEntryFilled('SHORT', 2.021, 2.02)).toBe(true);
    expect(isPendingEntryFilled('SHORT', 2.02, 2.02)).toBe(true);
    expect(isPendingEntryFilled('SHORT', 2.019, 2.02)).toBe(false);
  });
});

describe('isLimitEntryAwaitingFill', () => {
  it('LONG limit below market stays pending', () => {
    expect(isLimitEntryAwaitingFill('LONG', 61_999, 61_559)).toBe(true);
    expect(isLimitEntryAwaitingFill('LONG', 61_559, 61_559)).toBe(false);
  });

  it('SHORT limit above market stays pending', () => {
    expect(isLimitEntryAwaitingFill('SHORT', 61_559, 61_999)).toBe(true);
    expect(isLimitEntryAwaitingFill('SHORT', 61_999, 61_999)).toBe(false);
  });
});

describe('pendingEntryDistancePercent', () => {
  it('LONG positive when mark above limit', () => {
    const d = pendingEntryDistancePercent('LONG', 100_000, 99_000);
    expect(d).toBeCloseTo(1, 1);
  });
});

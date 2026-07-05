import { describe, it, expect } from 'vitest';
import {
  resolveBTCAlignmentFactor,
  calculateMarketConfidence,
} from '../marketConfidenceEngine';
import type { BTCContext } from '../marketConfidenceEngine';

const bullStrong: BTCContext = { btcDirection: 'BULL', btcStrengthBand: 'STRONG' };
const bullWeak: BTCContext = { btcDirection: 'BULL', btcStrengthBand: 'WEAK' };
const bearStrong: BTCContext = { btcDirection: 'BEAR', btcStrengthBand: 'STRONG' };
const neutral: BTCContext = { btcDirection: 'NEUTRAL', btcStrengthBand: 'SIDEWAY' };

describe('resolveBTCAlignmentFactor', () => {
  it('alt NEUTRAL → 0.7 (bất kể BTC)', () => {
    expect(resolveBTCAlignmentFactor('NEUTRAL', bullStrong)).toBe(0.7);
  });

  it('alt BULL + BTC BULL STRONG → 1.0', () => {
    expect(resolveBTCAlignmentFactor('BULL', bullStrong)).toBe(1.0);
  });

  it('alt BULL + BTC BULL WEAK → 0.8', () => {
    expect(resolveBTCAlignmentFactor('BULL', bullWeak)).toBe(0.8);
  });

  it('alt BULL + BTC NEUTRAL/SIDEWAY → 0.7', () => {
    expect(resolveBTCAlignmentFactor('BULL', neutral)).toBe(0.7);
  });

  it('alt BULL + BTC ngược (BEAR) → 0.5', () => {
    expect(resolveBTCAlignmentFactor('BULL', bearStrong)).toBe(0.5);
  });

  it('alt BEAR + BTC BEAR STRONG → 1.0 (đảo chiều cũng áp dụng đúng)', () => {
    expect(resolveBTCAlignmentFactor('BEAR', bearStrong)).toBe(1.0);
  });
});

describe('calculateMarketConfidence', () => {
  it('Case a: TS=80, EX=25, BULL, BTC BULL STRONG → confidence=60, factor=1.0', () => {
    const result = calculateMarketConfidence(80, 25, 'BULL', bullStrong);
    expect(result.marketConfidence).toBe(60);
    expect(result.btcAlignmentFactor).toBe(1.0);
  });

  it('Case b: TS=80, EX=25, BULL, BTC ngược → confidence=30, factor=0.5', () => {
    const result = calculateMarketConfidence(80, 25, 'BULL', bearStrong);
    expect(result.marketConfidence).toBe(30);
    expect(result.btcAlignmentFactor).toBe(0.5);
  });

  it('Case c: TS=100, EX=0, BULL, BTC BULL STRONG → confidence=100 (max)', () => {
    const result = calculateMarketConfidence(100, 0, 'BULL', bullStrong);
    expect(result.marketConfidence).toBe(100);
  });

  it('Case d: TS=80, EX=100 → confidence=0 (exhaustion hoàn toàn)', () => {
    const result = calculateMarketConfidence(80, 100, 'BULL', bullStrong);
    expect(result.marketConfidence).toBe(0);
  });

  it('clamp: TS=200 (bất thường lớn) → confidence không vượt 100', () => {
    const result = calculateMarketConfidence(200, 0, 'BULL', bullStrong);
    expect(result.marketConfidence).toBeLessThanOrEqual(100);
  });
});

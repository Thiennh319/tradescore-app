import { describe, expect, it } from 'vitest';
import { scoreL13WhaleDelta, WHALE_ALIGN_BONUS_MAX } from './whaleScoring';

describe('whaleScoring', () => {
  it('max whale alignment bonus is +0.5 (supporting signal)', () => {
    expect(WHALE_ALIGN_BONUS_MAX).toBe(0.5);
  });

  it('L13: whale delta bearish + SHORT → +0.5', () => {
    const r = scoreL13WhaleDelta('SHORT', -250_000);
    expect(r.score).toBe(0.5);
    expect(r.groupBlock).toBeNull();
  });

  it('L13: whale delta bullish + LONG → +0.5', () => {
    const r = scoreL13WhaleDelta('LONG', 250_000);
    expect(r.score).toBe(0.5);
    expect(r.groupBlock).toBeNull();
  });

  it('L13: whale delta ngược SHORT → GROUP_BLOCK', () => {
    const r = scoreL13WhaleDelta('SHORT', 180_000);
    expect(r.score).toBe(0);
    expect(r.groupBlock).toContain('L13 Whale Delta');
  });

  it('L13: below min trade size → 0', () => {
    const r = scoreL13WhaleDelta('SHORT', -50_000);
    expect(r.score).toBe(0);
    expect(r.groupBlock).toBeNull();
  });

  it('L13: RANGING market → whale score 0, no block', () => {
    const r = scoreL13WhaleDelta('SHORT', -250_000, 'RANGING');
    expect(r.score).toBe(0);
    expect(r.groupBlock).toBeNull();
  });

  it('L13: STRONG_TREND market → whale score active', () => {
    const r = scoreL13WhaleDelta('LONG', 250_000, 'STRONG_TREND');
    expect(r.score).toBe(0.5);
  });
});

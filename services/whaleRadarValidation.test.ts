import { describe, expect, it } from 'vitest';
import {
  computeWhaleDistanceATR,
  filterEntryWhaleWallsByDistance,
  filterValidWhaleWalls,
  getWhaleDistanceIgnoreReasons,
  isValidWhaleWall,
  shouldIgnoreWhaleByDistance,
  shouldIgnoreWhaleWall,
  WHALE_DISAPPEAR_REAPPEAR_SPOOF_THRESHOLD,
} from './whaleRadarValidation';
import { WHALE_MIN_DISTANCE_ATR } from '../constants/whaleRadar';

function validBtcWall() {
  return {
    price: 100_000,
    notionalUSD: 5_500_000,
    ageSeconds: 200,
    executedVolumeUSD: 600_000,
    refreshCount: 1,
    disappearReappearCount: 0,
  };
}

describe('isValidWhaleWall', () => {
  it('returns valid when all rules pass (BTCUSDT)', () => {
    const result = isValidWhaleWall(validBtcWall(), 'BTCUSDT', 100_100, 500);
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('fails when notional below symbol minimum', () => {
    const wall = { ...validBtcWall(), notionalUSD: 4_000_000 };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_100, 500);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('notionalUSD'))).toBe(true);
    expect(result.reasons.every((r) => r.startsWith('anti-spoof:'))).toBe(true);
  });

  it('fails when age below minAgeSeconds (anti-spoof)', () => {
    const wall = { ...validBtcWall(), ageSeconds: 60 };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_100, 500);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('ageSeconds'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('too low'))).toBe(true);
  });

  it('fails when executed ratio below threshold (anti-spoof)', () => {
    const wall = { ...validBtcWall(), executedVolumeUSD: 100_000 };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_100, 500);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('executed volume ratio'))).toBe(
      true,
    );
  });

  it('fails when refreshCount exceeds maxRefreshCount (anti-spoof)', () => {
    const wall = { ...validBtcWall(), refreshCount: 5 };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_100, 500);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('refreshCount'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('too high'))).toBe(true);
  });

  it('fails when wall repeatedly disappears and reappears', () => {
    const wall = {
      ...validBtcWall(),
      disappearReappearCount: WHALE_DISAPPEAR_REAPPEAR_SPOOF_THRESHOLD,
    };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_100, 500);
    expect(result.valid).toBe(false);
    expect(
      result.reasons.some((r) => r.includes('disappears and reappears')),
    ).toBe(true);
  });

  it('fails when distanceATR exceeds maxDistanceATR (market-chase)', () => {
    const wall = { ...validBtcWall(), price: 101_000 };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_000, 500);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('distanceATR'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('exceeds limit'))).toBe(true);
    expect(result.reasons.some((r) => r.startsWith('market-chase:'))).toBe(true);
  });

  it('fails when distanceATR below min (market hugging)', () => {
    const wall = { ...validBtcWall(), price: 100_060 };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_100, 500);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('below min'))).toBe(true);
    expect(result.reasons.some((r) => r.includes(String(WHALE_MIN_DISTANCE_ATR)))).toBe(
      true,
    );
  });

  it('uses NEARUSDT symbol config thresholds', () => {
    const wall = {
      price: 5,
      notionalUSD: 450_000,
      ageSeconds: 130,
      executedVolumeUSD: 40_000,
      refreshCount: 2,
      disappearReappearCount: 0,
    };
    const result = isValidWhaleWall(wall, 'NEARUSDT', 5.05, 0.1);
    expect(result.valid).toBe(true);
  });

  it('collects multiple failure reasons', () => {
    const wall = {
      price: 100_000,
      notionalUSD: 100_000,
      ageSeconds: 10,
      executedVolumeUSD: 0,
      refreshCount: 99,
      disappearReappearCount: 3,
    };
    const result = isValidWhaleWall(wall, 'BTCUSDT', 100_000, 0);
    expect(result.valid).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(1);
  });
});

describe('shouldIgnoreWhaleWall', () => {
  it('returns false for valid wall', () => {
    expect(shouldIgnoreWhaleWall(validBtcWall(), 'BTCUSDT', 100_100, 500)).toBe(
      false,
    );
  });

  it('returns true for spoof wall (low age)', () => {
    const wall = { ...validBtcWall(), ageSeconds: 30 };
    expect(shouldIgnoreWhaleWall(wall, 'BTCUSDT', 100_100, 500)).toBe(true);
  });
});

describe('filterValidWhaleWalls', () => {
  it('removes ignored walls before downstream score/SL/confirmations', () => {
    const walls = [
      validBtcWall(),
      { ...validBtcWall(), ageSeconds: 10, price: 99_000 },
      {
        ...validBtcWall(),
        disappearReappearCount: WHALE_DISAPPEAR_REAPPEAR_SPOOF_THRESHOLD,
        price: 98_000,
      },
    ];
    const filtered = filterValidWhaleWalls(walls, 'BTCUSDT', 100_100, 500);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].price).toBe(100_000);
  });
});

describe('whale distance band (pullback, not market chase)', () => {
  it('computeWhaleDistanceATR = abs(price delta) / atr', () => {
    expect(computeWhaleDistanceATR(100_100, 100_000, 500)).toBeCloseTo(0.2);
  });

  it('shouldIgnoreWhaleByDistance: too close to market', () => {
    expect(shouldIgnoreWhaleByDistance(100_060, 'BTCUSDT', 100_100, 500)).toBe(true);
  });

  it('shouldIgnoreWhaleByDistance: valid pullback band', () => {
    expect(shouldIgnoreWhaleByDistance(100_000, 'BTCUSDT', 100_100, 500)).toBe(false);
  });

  it('filterEntryWhaleWallsByDistance removes market-hugging walls', () => {
    const walls = {
      bidWalls: [
        { price: 100_060, distancePct: -0.04, multiplier: 40 },
        { price: 100_000, distancePct: -0.1, multiplier: 40 },
      ],
      askWalls: [],
    };
    const filtered = filterEntryWhaleWallsByDistance(walls, 'BTCUSDT', 100_100, 500);
    expect(filtered.bidWalls).toHaveLength(1);
    expect(filtered.bidWalls[0].price).toBe(100_000);
  });

  it('getWhaleDistanceIgnoreReasons at exactly min distance is allowed', () => {
    const price = 100_100 - WHALE_MIN_DISTANCE_ATR * 500;
    expect(getWhaleDistanceIgnoreReasons(price, 'BTCUSDT', 100_100, 500)).toEqual([]);
  });
});

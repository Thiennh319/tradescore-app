import { describe, expect, it } from 'vitest';
import type { KeyLevel } from './indicators';
import {
  hasBaseSetupForWhaleConfirmation,
  hasEmaPullbackSetup,
  isWhaleWallNearbyByDistanceAtr,
  resolveWhaleWallsForEntry,
  scoreL7FlowWithWhaleConfirmation,
  WHALE_L7_CONFIRMATION_BONUS,
} from './whaleConfirmation';
import { WHALE_NEARBY_MAX_DISTANCE_ATR } from '../constants/whaleRadar';

const CURRENT_PRICE = 100;
const ATR = 1;
const whaleWalls = {
  bidWalls: [{ price: 99.6, distancePct: -0.4, multiplier: 40 }],
  askWalls: [{ price: 100.4, distancePct: 0.4, multiplier: 40 }],
};

describe('whaleConfirmation entry gate', () => {
  it('EMA pullback counts as base setup (priority 1)', () => {
    const ctx = {
      direction: 'LONG' as const,
      currentPrice: 102,
      ema20: 100,
      supports: [],
      resistances: [],
    };
    expect(hasEmaPullbackSetup(ctx)).toBe(true);
    expect(hasBaseSetupForWhaleConfirmation(ctx)).toBe(true);
  });

  it('resolveWhaleWallsForEntry: empty without base setup', () => {
    const ctx = {
      direction: 'LONG' as const,
      currentPrice: 100,
      ema20: 100,
      supports: [],
      resistances: [],
    };
    expect(resolveWhaleWallsForEntry(ctx, whaleWalls)).toEqual({
      bidWalls: [],
      askWalls: [],
    });
  });

  it('resolveWhaleWallsForEntry: keeps walls when S/R setup exists', () => {
    const ctx = {
      direction: 'LONG' as const,
      currentPrice: 100,
      ema20: 100,
      supports: [
        {
          price: 99,
          distancePct: -1,
          strength: 'STRONG',
          source: 'SWING',
          type: 'SUPPORT',
          distanceUSDT: 1,
        } satisfies KeyLevel,
      ],
      resistances: [],
    };
    expect(resolveWhaleWallsForEntry(ctx, whaleWalls)).toBe(whaleWalls);
  });
});

describe('scoreL7FlowWithWhaleConfirmation', () => {
  it('uses distanceATR <= 0.5 for nearby whale (not distancePct)', () => {
    const within = [{ price: 99.6, distancePct: -0.4, multiplier: 40 }];
    const beyond = [{ price: 99, distancePct: -1, multiplier: 40 }];
    expect(isWhaleWallNearbyByDistanceAtr(within, CURRENT_PRICE, ATR)).toBe(true);
    expect(isWhaleWallNearbyByDistanceAtr(beyond, CURRENT_PRICE, ATR)).toBe(false);
    expect(WHALE_NEARBY_MAX_DISTANCE_ATR).toBe(0.5);
  });

  it('FLAT + whale wall → no whale boost (confirmation-only)', () => {
    const r = scoreL7FlowWithWhaleConfirmation(
      'LONG',
      'FLAT',
      whaleWalls,
      CURRENT_PRICE,
      ATR,
    );
    expect(r.score).toBe(1);
    expect(r.whaleConfirmation).toBe(false);
  });

  it('DOWN + whale within 0.5 ATR → small confirmation bonus', () => {
    const r = scoreL7FlowWithWhaleConfirmation(
      'LONG',
      'DOWN',
      whaleWalls,
      CURRENT_PRICE,
      ATR,
    );
    expect(r.score).toBe(1.5 + WHALE_L7_CONFIRMATION_BONUS);
    expect(r.whaleConfirmation).toBe(true);
  });

  it('DOWN + whale beyond 0.5 ATR → base L/S only', () => {
    const r = scoreL7FlowWithWhaleConfirmation('LONG', 'DOWN', {
      bidWalls: [{ price: 99, distancePct: -1, multiplier: 40 }],
      askWalls: [],
    }, CURRENT_PRICE, ATR);
    expect(r.score).toBe(1.5);
    expect(r.whaleConfirmation).toBe(false);
  });

  it('DOWN without whale → base L/S only', () => {
    const r = scoreL7FlowWithWhaleConfirmation(
      'LONG',
      'DOWN',
      {
        bidWalls: [],
        askWalls: [],
      },
      CURRENT_PRICE,
      ATR,
    );
    expect(r.score).toBe(1.5);
    expect(r.whaleConfirmation).toBe(false);
  });
});

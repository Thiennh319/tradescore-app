import type { AppTradeSymbol } from '../constants/scoring';
import type { EntryWhaleWalls, KeyLevel, WhaleWall } from './indicators';
import {
  computeWhaleDistanceATR,
  isWhaleWithinProximityDistance,
} from './whaleRadarValidation';
import { EMPTY_ENTRY_WHALE_WALLS } from './whaleMarketBehavior';

/** Legacy default when symbol is omitted — matches NEARUSDT maxDistanceATR (0.5). */
const DEFAULT_WHALE_PROXIMITY_SYMBOL: AppTradeSymbol = 'NEARUSDT';

/** Small bonus when whale confirms an existing L/S flow setup — not a standalone signal. */
export const WHALE_L7_CONFIRMATION_BONUS = 0.5;

export type LsRatioSlope = 'UP' | 'DOWN' | 'FLAT';

export interface WhaleEntrySetupContext {
  direction: 'LONG' | 'SHORT';
  currentPrice: number;
  ema20: number;
  supports: KeyLevel[];
  resistances: KeyLevel[];
}

/** Priority 1 — EMA pullback zone (mirrors trade plan entry, without whale). */
export function hasEmaPullbackSetup(ctx: WhaleEntrySetupContext): boolean {
  if (ctx.direction === 'LONG') {
    const distToEMA = ((ctx.currentPrice - ctx.ema20) / ctx.currentPrice) * 100;
    return distToEMA > 0.5 && distToEMA < 5;
  }
  const distToEMA = ((ctx.ema20 - ctx.currentPrice) / ctx.currentPrice) * 100;
  return distToEMA > 0.5 && distToEMA < 5;
}

/** Priority 2 — nearby S/R level. */
export function hasSupportResistanceSetup(ctx: WhaleEntrySetupContext): boolean {
  if (ctx.direction === 'LONG') {
    return ctx.supports.some(
      (s) => s.distancePct >= -2 && s.distancePct < 0 && s.strength !== 'WEAK',
    );
  }
  return ctx.resistances.some(
    (r) => r.distancePct <= 2 && r.distancePct > 0 && r.strength !== 'WEAK',
  );
}

/** Priority 3 — strong structure-tagged level. */
export function hasStructureSetup(ctx: WhaleEntrySetupContext): boolean {
  const structureTag = /structure|bos|choch|swing/i;
  if (ctx.direction === 'LONG') {
    return ctx.supports.some(
      (s) =>
        s.strength === 'STRONG' &&
        s.distancePct >= -3 &&
        s.distancePct < 1 &&
        structureTag.test(s.source ?? ''),
    );
  }
  return ctx.resistances.some(
    (r) =>
      r.strength === 'STRONG' &&
      r.distancePct <= 3 &&
      r.distancePct > -1 &&
      structureTag.test(r.source ?? ''),
  );
}

/** Whale may only confirm when EMA, S/R, or structure setup already exists. */
export function hasBaseSetupForWhaleConfirmation(ctx: WhaleEntrySetupContext): boolean {
  return (
    hasEmaPullbackSetup(ctx) ||
    hasSupportResistanceSetup(ctx) ||
    hasStructureSetup(ctx)
  );
}

/** Strip whale walls for entry when no base setup — whale cannot create standalone entries. */
export function resolveWhaleWallsForEntry(
  ctx: WhaleEntrySetupContext,
  walls: EntryWhaleWalls,
): EntryWhaleWalls {
  return hasBaseSetupForWhaleConfirmation(ctx) ? walls : EMPTY_ENTRY_WHALE_WALLS;
}

function nearestWhaleWallForDirection(
  walls: EntryWhaleWalls,
  direction: 'LONG' | 'SHORT',
  currentPrice: number,
  atr: number,
  symbol: AppTradeSymbol = DEFAULT_WHALE_PROXIMITY_SYMBOL,
): WhaleWall | undefined {
  const side = direction === 'LONG' ? walls.bidWalls : walls.askWalls;
  let best: WhaleWall | undefined;
  let bestDistance: number | null = null;
  for (const wall of side) {
    if (!isWhaleWithinProximityDistance(currentPrice, wall.price, atr, symbol)) continue;
    const distanceATR = computeWhaleDistanceATR(currentPrice, wall.price, atr);
    if (distanceATR == null) continue;
    if (bestDistance == null || distanceATR < bestDistance) {
      best = wall;
      bestDistance = distanceATR;
    }
  }
  return best;
}

/**
 * Append whale confirmation to entry reasoning only — never changes price, type, or priority.
 */
export function appendWhaleConfirmationToEntryReasoning(
  baseReasoning: string,
  direction: 'LONG' | 'SHORT',
  ctx: WhaleEntrySetupContext,
  whaleWalls: EntryWhaleWalls,
  atr: number,
  symbol: AppTradeSymbol = DEFAULT_WHALE_PROXIMITY_SYMBOL,
): string {
  if (!hasBaseSetupForWhaleConfirmation(ctx)) {
    return baseReasoning;
  }
  const wall = nearestWhaleWallForDirection(
    whaleWalls,
    direction,
    ctx.currentPrice,
    atr,
    symbol,
  );
  if (!wall) {
    return baseReasoning;
  }
  const label = direction === 'LONG' ? 'Whale Bid Wall' : 'Whale Ask Wall';
  return (
    `${baseReasoning} — ${label} ${wall.price.toFixed(4)} ` +
    `(${wall.multiplier.toFixed(1)}×) xác nhận setup`
  );
}

export function isWhaleWallNearbyByDistanceAtr(
  walls: WhaleWall[],
  currentPrice: number,
  atr: number,
  symbol: AppTradeSymbol = DEFAULT_WHALE_PROXIMITY_SYMBOL,
): boolean {
  return walls.some((w) =>
    isWhaleWithinProximityDistance(currentPrice, w.price, atr, symbol),
  );
}

function isWhaleWallNearby(
  walls: EntryWhaleWalls,
  direction: 'LONG' | 'SHORT',
  currentPrice: number,
  atr: number,
  symbol: AppTradeSymbol = DEFAULT_WHALE_PROXIMITY_SYMBOL,
): boolean {
  const side = direction === 'LONG' ? walls.bidWalls : walls.askWalls;
  return isWhaleWallNearbyByDistanceAtr(side, currentPrice, atr, symbol);
}

/**
 * L7 flow score — whale adds a small bonus only when L/S already favors the direction.
 * Whale alone (e.g. FLAT + wall) cannot raise score or trigger entries.
 */
export function scoreL7FlowWithWhaleConfirmation(
  direction: 'LONG' | 'SHORT',
  topSlope: LsRatioSlope,
  whaleWalls: EntryWhaleWalls,
  currentPrice: number,
  atr: number,
  symbol: AppTradeSymbol = DEFAULT_WHALE_PROXIMITY_SYMBOL,
): { score: number; reason: string; whaleConfirmation: boolean } {
  const whaleNearby = isWhaleWallNearby(
    whaleWalls,
    direction,
    currentPrice,
    atr,
    symbol,
  );

  if (direction === 'LONG') {
    if (topSlope === 'DOWN') {
      if (whaleNearby) {
        return {
          score: 1.5 + WHALE_L7_CONFIRMATION_BONUS,
          reason: 'Đám đông giảm Long + Whale Bid Wall — xác nhận setup',
          whaleConfirmation: true,
        };
      }
      return {
        score: 1.5,
        reason: 'Đám đông giảm Long — contrarian thuận Long',
        whaleConfirmation: false,
      };
    }
    if (topSlope === 'FLAT') {
      return {
        score: 1,
        reason: 'L/S ratio đi ngang — trung tính (whale không kích hoạt entry)',
        whaleConfirmation: false,
      };
    }
    return {
      score: 0,
      reason: 'Đám đông đang tăng Long — không thuận',
      whaleConfirmation: false,
    };
  }

  if (topSlope === 'UP') {
    if (whaleNearby) {
      return {
        score: 1.5 + WHALE_L7_CONFIRMATION_BONUS,
        reason: 'Đám đông tăng Long + Whale Ask Wall — xác nhận setup Short',
        whaleConfirmation: true,
      };
    }
    return {
      score: 1.5,
      reason: 'Đám đông tăng Long — contrarian thuận Short',
      whaleConfirmation: false,
    };
  }
  if (topSlope === 'FLAT') {
    return {
      score: 1,
      reason: 'L/S ratio đi ngang — trung tính (whale không kích hoạt entry)',
      whaleConfirmation: false,
    };
  }
  return {
    score: 0,
    reason: 'Đám đông đang Short đông — không thuận',
    whaleConfirmation: false,
  };
}

import type { EntryWhaleWalls, WhaleWall } from './indicators';

export type WhaleMarketMode = 'TRENDING' | 'RANGING' | 'STRONG_TREND';

export const EMPTY_ENTRY_WHALE_WALLS: EntryWhaleWalls = { bidWalls: [], askWalls: [] };

/** Whale signals apply only in trending regimes — not in ranging chop. */
export function isWhaleActiveInMarket(marketMode: WhaleMarketMode | string): boolean {
  return marketMode === 'TRENDING' || marketMode === 'STRONG_TREND';
}

/** L7 whale wall confirmation — empty walls when ranging. */
export function resolveWhaleWallsForConfirmation(
  marketMode: WhaleMarketMode | string,
  walls: EntryWhaleWalls,
): EntryWhaleWalls {
  return isWhaleActiveInMarket(marketMode) ? walls : EMPTY_ENTRY_WHALE_WALLS;
}

/** SL whale wall protection — empty walls when ranging. */
export function resolveWhaleWallsForStopProtection(
  marketMode: WhaleMarketMode | string,
  walls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
): { bidWalls: WhaleWall[]; askWalls: WhaleWall[] } {
  return isWhaleActiveInMarket(marketMode) ? walls : { bidWalls: [], askWalls: [] };
}

import type { AppTradeSymbol, LiquidityPool } from '../constants/scoring';
import { buildEntryWhaleWalls, type EntryWhaleWalls } from './indicators';
import { getWhaleRadarSnapshotsSync } from './whaleRadarPersist';
import { filterValidEntryWhaleWalls } from './whaleRadarValidation';

/**
 * Build entry whale walls with full WHALE_SYMBOL_CONFIG validation
 * (notional, age, executed ratio, refresh, ATR band).
 * Radar snapshot metadata is used when available for anti-spoof fields.
 */
export function buildWhaleEntryWalls(
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
  pools: LiquidityPool[],
  validationAt?: number,
): EntryWhaleWalls {
  const raw = buildEntryWhaleWalls(currentPrice, pools);
  const radarSnap = getWhaleRadarSnapshotsSync()[symbol];
  const scannedAt = validationAt ?? radarSnap?.scannedAt ?? Date.now();
  const radarWalls = radarSnap?.walls ?? [];

  return filterValidEntryWhaleWalls(
    raw,
    symbol,
    currentPrice,
    atr,
    pools,
    radarWalls,
    scannedAt,
  );
}

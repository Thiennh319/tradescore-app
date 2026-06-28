import type { AppTradeSymbol, LiquidityPool } from '../constants/scoring';
import { WHALE_MIN_DISTANCE_ATR, WHALE_SYMBOL_CONFIG } from '../constants/whaleRadar';
import type { EntryWhaleWalls, WhaleWall } from './indicators';
import type { WhaleWallRecord } from './whaleRadarDetect';
import { priceKeyForWall, wallRecordKey } from './whaleRadarDetect';

/**
 * Số lần biến mất/rõ lại tại cùng mức giá từ cùng mức này trở lên → coi là spoof.
 * Tường bị ignore KHÔNG được dùng cho score, SL, hay confirmations.
 */
export const WHALE_DISAPPEAR_REAPPEAR_SPOOF_THRESHOLD = 2;

export interface WhaleWallValidationInput {
  price: number;
  notionalUSD: number;
  ageSeconds: number;
  executedVolumeUSD: number;
  refreshCount: number;
  /** Số lần tường biến mất rồi xuất hiện lại tại cùng priceKey. */
  disappearReappearCount?: number;
}

export interface WhaleWallValidationResult {
  valid: boolean;
  reasons: string[];
}

function antiSpoofReason(message: string): string {
  return `anti-spoof: ${message}`;
}

function marketChaseReason(message: string): string {
  return `market-chase: ${message}`;
}

export function computeWhaleDistanceATR(
  currentPrice: number,
  whalePrice: number,
  atr: number,
): number | null {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(whalePrice) || !Number.isFinite(atr)) {
    return null;
  }
  if (atr <= 0) return null;
  return Math.abs(currentPrice - whalePrice) / atr;
}

/** Max pullback distance (ATR) for whale proximity — per-symbol from WHALE_SYMBOL_CONFIG. */
export function getWhaleMaxProximityDistanceATR(symbol: AppTradeSymbol): number {
  return WHALE_SYMBOL_CONFIG[symbol].maxDistanceATR;
}

/** True when wall sits in [WHALE_MIN_DISTANCE_ATR, config.maxDistanceATR] band. */
export function isWhaleWithinProximityDistance(
  currentPrice: number,
  whalePrice: number,
  atr: number,
  symbol: AppTradeSymbol,
): boolean {
  return !shouldIgnoreWhaleByDistance(whalePrice, symbol, currentPrice, atr);
}

export function getWhaleDistanceIgnoreReasons(
  whalePrice: number,
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
): string[] {
  const config = WHALE_SYMBOL_CONFIG[symbol];
  const reasons: string[] = [];
  const distanceATR = computeWhaleDistanceATR(currentPrice, whalePrice, atr);

  if (distanceATR == null) {
    reasons.push(marketChaseReason('atr invalid or non-positive'));
    return reasons;
  }

  if (distanceATR < WHALE_MIN_DISTANCE_ATR) {
    reasons.push(
      marketChaseReason(
        `distanceATR ${distanceATR.toFixed(4)} below min ${WHALE_MIN_DISTANCE_ATR} (too close to market)`,
      ),
    );
  }

  if (distanceATR > config.maxDistanceATR) {
    reasons.push(
      marketChaseReason(
        `distanceATR ${distanceATR.toFixed(4)} exceeds limit ${config.maxDistanceATR}`,
      ),
    );
  }

  return reasons;
}

export function shouldIgnoreWhaleByDistance(
  whalePrice: number,
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
): boolean {
  return getWhaleDistanceIgnoreReasons(whalePrice, symbol, currentPrice, atr).length > 0;
}

/** Loại tường quá gần (market hugging) hoặc quá xa — chỉ giữ pullback hợp lệ. */
export function filterEntryWhaleWallsByDistance(
  walls: EntryWhaleWalls,
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
): EntryWhaleWalls {
  const pass = (wall: WhaleWall) =>
    !shouldIgnoreWhaleByDistance(wall.price, symbol, currentPrice, atr);

  return {
    bidWalls: walls.bidWalls.filter(pass),
    askWalls: walls.askWalls.filter(pass),
  };
}

export function isValidWhaleWall(
  wall: WhaleWallValidationInput,
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
): WhaleWallValidationResult {
  const reasons = getWhaleWallIgnoreReasons(wall, symbol, currentPrice, atr);
  return { valid: reasons.length === 0, reasons };
}

/**
 * Anti-spoof filter — invalid walls must be ignored by score, SL, and confirmations.
 */
export function shouldIgnoreWhaleWall(
  wall: WhaleWallValidationInput,
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
): boolean {
  return !isValidWhaleWall(wall, symbol, currentPrice, atr).valid;
}

export function getWhaleWallIgnoreReasons(
  wall: WhaleWallValidationInput,
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
): string[] {
  const config = WHALE_SYMBOL_CONFIG[symbol];
  const reasons: string[] = [];
  const disappearReappearCount = wall.disappearReappearCount ?? 0;

  if (wall.notionalUSD < config.minNotionalUSD) {
    reasons.push(
      antiSpoofReason(
        `notionalUSD ${wall.notionalUSD} < min ${config.minNotionalUSD}`,
      ),
    );
  }

  if (wall.ageSeconds < config.minAgeSeconds) {
    reasons.push(
      antiSpoofReason(
        `ageSeconds ${wall.ageSeconds} too low (min ${config.minAgeSeconds})`,
      ),
    );
  }

  const executedRatio =
    wall.notionalUSD > 0 ? wall.executedVolumeUSD / wall.notionalUSD : 0;
  if (executedRatio < config.minExecutedRatio) {
    reasons.push(
      antiSpoofReason(
        `executed volume ratio ${executedRatio.toFixed(4)} too low (min ${config.minExecutedRatio})`,
      ),
    );
  }

  if (wall.refreshCount > config.maxRefreshCount) {
    reasons.push(
      antiSpoofReason(
        `refreshCount ${wall.refreshCount} too high (max ${config.maxRefreshCount})`,
      ),
    );
  }

  if (disappearReappearCount >= WHALE_DISAPPEAR_REAPPEAR_SPOOF_THRESHOLD) {
    reasons.push(
      antiSpoofReason(
        `wall repeatedly disappears and reappears (${disappearReappearCount} cycles)`,
      ),
    );
  }

  reasons.push(...getWhaleDistanceIgnoreReasons(wall.price, symbol, currentPrice, atr));

  return reasons;
}

/** Giữ lại các tường hợp lệ sau anti-spoof (dùng trước score / SL / confirmations). */
export function filterValidWhaleWalls<T extends WhaleWallValidationInput>(
  walls: T[],
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
): T[] {
  return walls.filter(
    (wall) => !shouldIgnoreWhaleWall(wall, symbol, currentPrice, atr),
  );
}

export function validationInputFromRadarWall(
  wall: WhaleWallRecord,
  scannedAt: number,
): WhaleWallValidationInput {
  const ageSeconds = Math.max(0, (scannedAt - wall.firstSeenAt) / 1000);
  return {
    price: wall.price,
    notionalUSD: wall.notionalUsd,
    ageSeconds,
    executedVolumeUSD: wall.executedVolumeUSD ?? 0,
    refreshCount: wall.refreshCount ?? 0,
    disappearReappearCount: wall.disappearReappearCount ?? 0,
  };
}

export function validationInputFromPool(
  pool: LiquidityPool,
  scannedAt: number,
  radarWall?: WhaleWallRecord,
): WhaleWallValidationInput {
  if (radarWall) {
    return validationInputFromRadarWall(radarWall, scannedAt);
  }
  return {
    price: pool.price,
    notionalUSD: pool.price * pool.volume,
    ageSeconds: 0,
    executedVolumeUSD: 0,
    refreshCount: 0,
    disappearReappearCount: 0,
  };
}

export function filterValidRadarWallRecords(
  walls: WhaleWallRecord[],
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
  scannedAt: number,
): WhaleWallRecord[] {
  return walls.filter(
    (wall) =>
      !shouldIgnoreWhaleWall(
        validationInputFromRadarWall(wall, scannedAt),
        symbol,
        currentPrice,
        atr,
      ),
  );
}

export function filterValidEntryWhaleWalls(
  walls: EntryWhaleWalls,
  symbol: AppTradeSymbol,
  currentPrice: number,
  atr: number,
  pools: LiquidityPool[],
  radarWalls: WhaleWallRecord[] = [],
  scannedAt: number = Date.now(),
): EntryWhaleWalls {
  const radarByKey = new Map(
    radarWalls.map((wall) => [wallRecordKey(wall.side, wall.priceKey), wall]),
  );

  const poolByKey = new Map<string, LiquidityPool>();
  for (const pool of pools) {
    if (pool.type !== 'ORDERBOOK_WALL') continue;
    const side = pool.price <= currentPrice ? 'BID' : 'ASK';
    poolByKey.set(wallRecordKey(side, priceKeyForWall(pool.price)), pool);
  }

  const keepWall = (wall: WhaleWall, side: 'BID' | 'ASK') => {
    const key = wallRecordKey(side, priceKeyForWall(wall.price));
    const radarWall = radarByKey.get(key);
    const pool = poolByKey.get(key);
    const input = radarWall
      ? validationInputFromRadarWall(radarWall, scannedAt)
      : pool
        ? validationInputFromPool(pool, scannedAt)
        : {
            price: wall.price,
            notionalUSD: 0,
            ageSeconds: 0,
            executedVolumeUSD: 0,
            refreshCount: 0,
            disappearReappearCount: 0,
          };
    return !shouldIgnoreWhaleWall(input, symbol, currentPrice, atr);
  };

  return {
    bidWalls: walls.bidWalls.filter((wall) => keepWall(wall, 'BID')),
    askWalls: walls.askWalls.filter((wall) => keepWall(wall, 'ASK')),
  };
}

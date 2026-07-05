import type { Kline } from './binanceApi';

export interface SwingPoint {
  price: number;
  index: number;
  time: number;
  type: 'HIGH' | 'LOW';
}

export type StructureSLSource = 'STRUCTURE' | 'ATR_FALLBACK';

export interface StructureSLResult {
  swingPrice: number;
  swingTime: number;
  slPrice: number;
  slSource: StructureSLSource;
  bufferPct: number;
  distanceFromEntry: number;
  candlesBack: number;
}

export const STRUCTURE_SL_DEFAULTS = {
  BUFFER_PCT: 0.3,
  LOOKBACK_CANDLES: 20,
  MIN_CANDLES_BACK: 3,
} as const;

const SWING_NEIGHBOR_BARS = 2;

function isSwingLow(klines: Kline[], index: number): boolean {
  const pivot = klines[index]?.low;
  if (pivot == null) return false;
  for (let offset = 1; offset <= SWING_NEIGHBOR_BARS; offset += 1) {
    const before = klines[index - offset]?.low;
    const after = klines[index + offset]?.low;
    if (before == null || after == null) return false;
    if (pivot >= before || pivot >= after) return false;
  }
  return true;
}

function isSwingHigh(klines: Kline[], index: number): boolean {
  const pivot = klines[index]?.high;
  if (pivot == null) return false;
  for (let offset = 1; offset <= SWING_NEIGHBOR_BARS; offset += 1) {
    const before = klines[index - offset]?.high;
    const after = klines[index + offset]?.high;
    if (before == null || after == null) return false;
    if (pivot <= before || pivot <= after) return false;
  }
  return true;
}

function resolveSwingSearchRange(
  klines: Kline[],
  lookback: number,
): { fromIndex: number; toIndex: number } | null {
  const len = klines.length;
  const minIndex = SWING_NEIGHBOR_BARS;
  const maxIndexByNeighbors = len - 1 - SWING_NEIGHBOR_BARS;
  const maxIndexByRecency = len - 1 - STRUCTURE_SL_DEFAULTS.MIN_CANDLES_BACK;
  const toIndex = Math.min(maxIndexByNeighbors, maxIndexByRecency);
  const fromIndex = Math.max(minIndex, len - lookback);

  if (fromIndex > toIndex) return null;
  return { fromIndex, toIndex };
}

/** Swing low: Low thấp hơn 2 nến trước và 2 nến sau — lấy swing gần nhất (index cao nhất). */
export function findRecentSwingLow(
  klines4H: Kline[],
  lookback: number = STRUCTURE_SL_DEFAULTS.LOOKBACK_CANDLES,
): SwingPoint | null {
  const range = resolveSwingSearchRange(klines4H, lookback);
  if (!range) return null;

  for (let i = range.toIndex; i >= range.fromIndex; i -= 1) {
    if (!isSwingLow(klines4H, i)) continue;
    const candle = klines4H[i];
    return {
      price: candle.low,
      index: i,
      time: candle.openTime,
      type: 'LOW',
    };
  }
  return null;
}

/** Swing high: High cao hơn 2 nến trước và 2 nến sau — lấy swing gần nhất (index cao nhất). */
export function findRecentSwingHigh(
  klines4H: Kline[],
  lookback: number = STRUCTURE_SL_DEFAULTS.LOOKBACK_CANDLES,
): SwingPoint | null {
  const range = resolveSwingSearchRange(klines4H, lookback);
  if (!range) return null;

  for (let i = range.toIndex; i >= range.fromIndex; i -= 1) {
    if (!isSwingHigh(klines4H, i)) continue;
    const candle = klines4H[i];
    return {
      price: candle.high,
      index: i,
      time: candle.openTime,
      type: 'HIGH',
    };
  }
  return null;
}

function distanceFromEntryPct(entryPrice: number, slPrice: number): number {
  if (entryPrice <= 0) return 0;
  return (Math.abs(entryPrice - slPrice) / entryPrice) * 100;
}

function candlesBackFromCurrent(klines: Kline[], swingIndex: number): number {
  return klines.length - 1 - swingIndex;
}

function buildFallbackResult(
  entryPrice: number,
  atrSL: number,
  bufferPct: number,
): StructureSLResult {
  return {
    swingPrice: 0,
    swingTime: 0,
    slPrice: atrSL,
    slSource: 'ATR_FALLBACK',
    bufferPct,
    distanceFromEntry: distanceFromEntryPct(entryPrice, atrSL),
    candlesBack: 0,
  };
}

export interface CalculateStructureSLParams {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  atrSL: number;
  klines4H: Kline[];
  bufferPct?: number;
  lookback?: number;
}

export function calculateStructureSL(params: CalculateStructureSLParams): StructureSLResult {
  const {
    direction,
    entryPrice,
    atrSL,
    klines4H,
    bufferPct = STRUCTURE_SL_DEFAULTS.BUFFER_PCT,
    lookback = STRUCTURE_SL_DEFAULTS.LOOKBACK_CANDLES,
  } = params;

  if (direction === 'LONG') {
    const swing = findRecentSwingLow(klines4H, lookback);
    if (!swing) return buildFallbackResult(entryPrice, atrSL, bufferPct);

    const structureSL = swing.price * (1 - bufferPct / 100);
    if (structureSL > entryPrice) {
      return buildFallbackResult(entryPrice, atrSL, bufferPct);
    }

    const slPrice = Math.min(structureSL, atrSL);
    return {
      swingPrice: swing.price,
      swingTime: swing.time,
      slPrice,
      slSource: 'STRUCTURE',
      bufferPct,
      distanceFromEntry: distanceFromEntryPct(entryPrice, slPrice),
      candlesBack: candlesBackFromCurrent(klines4H, swing.index),
    };
  }

  const swing = findRecentSwingHigh(klines4H, lookback);
  if (!swing) return buildFallbackResult(entryPrice, atrSL, bufferPct);

  const structureSL = swing.price * (1 + bufferPct / 100);
  if (structureSL < entryPrice) {
    return buildFallbackResult(entryPrice, atrSL, bufferPct);
  }

  const slPrice = Math.max(structureSL, atrSL);
  return {
    swingPrice: swing.price,
    swingTime: swing.time,
    slPrice,
    slSource: 'STRUCTURE',
    bufferPct,
    distanceFromEntry: distanceFromEntryPct(entryPrice, slPrice),
    candlesBack: candlesBackFromCurrent(klines4H, swing.index),
  };
}

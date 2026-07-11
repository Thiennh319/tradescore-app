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

/** Lookback 4H theo ADX — mặc định 20 khi không có ADX. */
export function resolveStructureSlLookback(adxValue?: number): number {
  if (adxValue == null || !Number.isFinite(adxValue)) return 20;
  if (adxValue >= 35) return 40;
  if (adxValue >= 25) return 30;
  return 20;
}

/** MIN_CANDLES_BACK giảm khi trend mạnh (ADX ≥ 35). */
export function resolveStructureSlMinCandlesBack(adxValue?: number): number {
  if (adxValue != null && Number.isFinite(adxValue) && adxValue >= 35) return 2;
  return STRUCTURE_SL_DEFAULTS.MIN_CANDLES_BACK;
}

/** Cap Structure SL — không xa hơn 3.5% entry hoặc 4×ATR từ entry */
export const MAX_STRUCTURE_SL_PCT = 0.035;
export const MAX_STRUCTURE_SL_ATR = 4.0;

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
  minCandlesBack: number = STRUCTURE_SL_DEFAULTS.MIN_CANDLES_BACK,
): { fromIndex: number; toIndex: number } | null {
  const len = klines.length;
  const minIndex = SWING_NEIGHBOR_BARS;
  const maxIndexByNeighbors = len - 1 - SWING_NEIGHBOR_BARS;
  const maxIndexByRecency = len - 1 - minCandlesBack;
  const toIndex = Math.min(maxIndexByNeighbors, maxIndexByRecency);
  const fromIndex = Math.max(minIndex, len - lookback);

  if (fromIndex > toIndex) return null;
  return { fromIndex, toIndex };
}

/** Swing low: Low thấp hơn 2 nến trước và 2 nến sau — lấy swing gần nhất (index cao nhất). */
export function findRecentSwingLow(
  klines4H: Kline[],
  lookback: number = STRUCTURE_SL_DEFAULTS.LOOKBACK_CANDLES,
  minCandlesBack: number = STRUCTURE_SL_DEFAULTS.MIN_CANDLES_BACK,
): SwingPoint | null {
  const range = resolveSwingSearchRange(klines4H, lookback, minCandlesBack);
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
  minCandlesBack: number = STRUCTURE_SL_DEFAULTS.MIN_CANDLES_BACK,
): SwingPoint | null {
  const range = resolveSwingSearchRange(klines4H, lookback, minCandlesBack);
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
  /** ATR 1H thô — nếu bỏ trống, suy ra từ |entry − atrSL| / MAX_STRUCTURE_SL_ATR */
  atr?: number;
  bufferPct?: number;
  lookback?: number;
  /** ADX trung bình 1H/4H — điều chỉnh lookback & MIN_CANDLES_BACK */
  adxValue?: number;
}

function resolveAtrUnit(
  entryPrice: number,
  atrSL: number,
  direction: 'LONG' | 'SHORT',
  atr?: number,
): number {
  if (atr != null && atr > 0) return atr;
  const distance =
    direction === 'LONG' ? entryPrice - atrSL : atrSL - entryPrice;
  return Math.max(0, distance) / MAX_STRUCTURE_SL_ATR;
}

/** Giới hạn SL structure — chỉ khi slSource STRUCTURE (gọi trước return). */
function capStructureSlPrice(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  atrSL: number,
  slPrice: number,
  atr?: number,
): number {
  const atrUnit = resolveAtrUnit(entryPrice, atrSL, direction, atr);

  if (direction === 'LONG') {
    const capByPct = entryPrice * (1 - MAX_STRUCTURE_SL_PCT);
    const capByAtr = entryPrice - atrUnit * MAX_STRUCTURE_SL_ATR;
    const slCap = Math.max(capByPct, capByAtr);
    if (slPrice < slCap) return slCap;
    return slPrice;
  }

  const capByPct = entryPrice * (1 + MAX_STRUCTURE_SL_PCT);
  const capByAtr = entryPrice + atrUnit * MAX_STRUCTURE_SL_ATR;
  const slCap = Math.min(capByPct, capByAtr);
  if (slPrice > slCap) return slCap;
  return slPrice;
}

export function calculateStructureSL(params: CalculateStructureSLParams): StructureSLResult {
  const {
    direction,
    entryPrice,
    atrSL,
    klines4H,
    atr,
    bufferPct = STRUCTURE_SL_DEFAULTS.BUFFER_PCT,
    lookback: lookbackOverride,
    adxValue,
  } = params;

  const lookback = lookbackOverride ?? resolveStructureSlLookback(adxValue);
  const minCandlesBack = resolveStructureSlMinCandlesBack(adxValue);

  if (direction === 'LONG') {
    const swing = findRecentSwingLow(klines4H, lookback, minCandlesBack);
    if (!swing) return buildFallbackResult(entryPrice, atrSL, bufferPct);

    const structureSL = swing.price * (1 - bufferPct / 100);
    if (structureSL > entryPrice) {
      return buildFallbackResult(entryPrice, atrSL, bufferPct);
    }

    let slPrice = Math.min(structureSL, atrSL);
    slPrice = capStructureSlPrice('LONG', entryPrice, atrSL, slPrice, atr);
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

  const swing = findRecentSwingHigh(klines4H, lookback, minCandlesBack);
  if (!swing) return buildFallbackResult(entryPrice, atrSL, bufferPct);

  const structureSL = swing.price * (1 + bufferPct / 100);
  if (structureSL < entryPrice) {
    return buildFallbackResult(entryPrice, atrSL, bufferPct);
  }

  let slPrice = Math.max(structureSL, atrSL);
  slPrice = capStructureSlPrice('SHORT', entryPrice, atrSL, slPrice, atr);
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

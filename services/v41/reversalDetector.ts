import { calculateEMA, type KlineV41 } from './indicators';
import type { TrendDirection } from './types';

export type ReversalPhase =
  | 'NONE'
  | 'WATCHING'
  | 'RETEST_CONFIRMED'
  | 'EXPIRED';

export interface ReversalState {
  phase: ReversalPhase;
  detectedAt: number;
  retestPrice: number | null;
  counterDirection: 'LONG' | 'SHORT' | null;
  expiresAt: number | null;
  symbol: string;
}

export interface RetestResult {
  confirmed: boolean;
  retestPrice: number | null;
  retestVolume: number | null;
  volumeConfirmed: boolean;
}

export interface CheckReversalSignalsParams {
  klines1H: KlineV41[];
  klines30M: KlineV41[];
  btcKlines1H: KlineV41[];
  trendDirection: TrendDirection;
}

export interface CheckRetestEMA20Params {
  klines1H: KlineV41[];
  counterDirection: 'LONG' | 'SHORT';
}

export interface ComputeCounterTrendSLParams {
  klines1H: KlineV41[];
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
}

const EMA_PERIOD = 20;
const VOLUME_MA_PERIOD = 20;
const VOLUME_SPIKE_MULTIPLIER = 1.5;
const SELL_PRESSURE_RATIO = 0.4;
const BUY_PRESSURE_RATIO = 0.6;
const BTC_SLOPE_LOOKBACK = 2;
const EMA_RETEST_BAND = 0.003;
const SWING_LOOKBACK = 10;
const SL_BUFFER = 0.003;
const MIN_CONFIRM_SIGNALS = 3;

function average(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lastFiniteEma(emaValues: number[], index: number): number | null {
  const value = emaValues[index];
  return Number.isFinite(value) ? value : null;
}

function cvdProxy(kline: KlineV41): number {
  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);
}

function volumeMA20Before(klines: KlineV41[], endIndexExclusive: number): number {
  const start = endIndexExclusive - VOLUME_MA_PERIOD;
  if (start < 0) return NaN;
  return average(klines.slice(start, endIndexExclusive).map((kline) => kline.volume));
}

function detectPriceBelowEma20(klines: KlineV41[]): boolean {
  if (klines.length < EMA_PERIOD) return false;
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines.length - 1;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  if (lastEma == null) return false;
  return closes[lastIdx] < lastEma;
}

function detectPriceAboveEma20(klines: KlineV41[]): boolean {
  if (klines.length < EMA_PERIOD) return false;
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines.length - 1;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  if (lastEma == null) return false;
  return closes[lastIdx] > lastEma;
}

function detectVolumeSpikeDown(klines: KlineV41[]): boolean {
  if (klines.length < VOLUME_MA_PERIOD + 1) return false;
  const lastIdx = klines.length - 1;
  const volumeMA20 = volumeMA20Before(klines, lastIdx);
  const last = klines[lastIdx];
  if (!Number.isFinite(volumeMA20) || volumeMA20 <= 0) return false;
  return last.volume > volumeMA20 * VOLUME_SPIKE_MULTIPLIER && last.close < last.open;
}

function detectVolumeSpikeUp(klines: KlineV41[]): boolean {
  if (klines.length < VOLUME_MA_PERIOD + 1) return false;
  const lastIdx = klines.length - 1;
  const volumeMA20 = volumeMA20Before(klines, lastIdx);
  const last = klines[lastIdx];
  if (!Number.isFinite(volumeMA20) || volumeMA20 <= 0) return false;
  return last.volume > volumeMA20 * VOLUME_SPIKE_MULTIPLIER && last.close > last.open;
}

function detectCvdDeclining1H(klines: KlineV41[]): boolean {
  if (klines.length < 3) return false;
  return klines.slice(-3).every((kline) => cvdProxy(kline) < 0);
}

function detectCvdRising1H(klines: KlineV41[]): boolean {
  if (klines.length < 3) return false;
  return klines.slice(-3).every((kline) => cvdProxy(kline) > 0);
}

function detectBtcBelowEma20WithSlope(btcKlines1H: KlineV41[]): boolean {
  if (btcKlines1H.length < EMA_PERIOD + BTC_SLOPE_LOOKBACK) return false;
  const closes = btcKlines1H.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = btcKlines1H.length - 1;
  const prevIdx = lastIdx - BTC_SLOPE_LOOKBACK;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  const prevEma = lastFiniteEma(ema20, prevIdx);
  if (lastEma == null || prevEma == null) return false;
  return closes[lastIdx] < lastEma && lastEma < prevEma;
}

function detectBtcAboveEma20WithSlope(btcKlines1H: KlineV41[]): boolean {
  if (btcKlines1H.length < EMA_PERIOD + BTC_SLOPE_LOOKBACK) return false;
  const closes = btcKlines1H.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = btcKlines1H.length - 1;
  const prevIdx = lastIdx - BTC_SLOPE_LOOKBACK;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  const prevEma = lastFiniteEma(ema20, prevIdx);
  if (lastEma == null || prevEma == null) return false;
  return closes[lastIdx] > lastEma && lastEma > prevEma;
}

function detectSellPressure30M(klines30M: KlineV41[]): boolean {
  if (klines30M.length < 3) return false;
  return klines30M
    .slice(-3)
    .every((kline) => kline.takerBuyVolume < kline.volume * SELL_PRESSURE_RATIO);
}

function detectBuyPressure30M(klines30M: KlineV41[]): boolean {
  if (klines30M.length < 3) return false;
  return klines30M
    .slice(-3)
    .every((kline) => kline.takerBuyVolume > kline.volume * BUY_PRESSURE_RATIO);
}

function countBearishReversalSignals(params: CheckReversalSignalsParams): number {
  let signals = 0;
  if (detectPriceBelowEma20(params.klines1H)) signals += 1;
  if (detectVolumeSpikeDown(params.klines1H)) signals += 1;
  if (detectCvdDeclining1H(params.klines1H)) signals += 1;
  if (detectBtcBelowEma20WithSlope(params.btcKlines1H)) signals += 1;
  if (detectSellPressure30M(params.klines30M)) signals += 1;
  return signals;
}

function countBullishReversalSignals(params: CheckReversalSignalsParams): number {
  let signals = 0;
  if (detectPriceAboveEma20(params.klines1H)) signals += 1;
  if (detectVolumeSpikeUp(params.klines1H)) signals += 1;
  if (detectCvdRising1H(params.klines1H)) signals += 1;
  if (detectBtcAboveEma20WithSlope(params.btcKlines1H)) signals += 1;
  if (detectBuyPressure30M(params.klines30M)) signals += 1;
  return signals;
}

export function checkReversalSignals(
  params: CheckReversalSignalsParams,
): { confirmed: boolean; signals: number } {
  const { trendDirection } = params;

  if (trendDirection === 'NEUTRAL') {
    return { confirmed: false, signals: 0 };
  }

  const signals =
    trendDirection === 'BULL'
      ? countBearishReversalSignals(params)
      : countBullishReversalSignals(params);

  return {
    confirmed: signals >= MIN_CONFIRM_SIGNALS,
    signals,
  };
}

export function checkRetestEMA20_1H(params: CheckRetestEMA20Params): RetestResult {
  const { klines1H, counterDirection } = params;

  if (klines1H.length < EMA_PERIOD + 1) {
    return {
      confirmed: false,
      retestPrice: null,
      retestVolume: null,
      volumeConfirmed: false,
    };
  }

  const closes = klines1H.map((k) => k.close);
  const ema20Series = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines1H.length - 1;
  const retestIdx = lastIdx - 1;
  const lastEma = lastFiniteEma(ema20Series, lastIdx);
  const retestEma = lastFiniteEma(ema20Series, retestIdx);

  if (lastEma == null || retestEma == null) {
    return {
      confirmed: false,
      retestPrice: null,
      retestVolume: null,
      volumeConfirmed: false,
    };
  }

  const ema20Upper = retestEma * (1 + EMA_RETEST_BAND);
  const ema20Lower = retestEma * (1 - EMA_RETEST_BAND);
  const retestCandle = klines1H[retestIdx];
  const confirmCandle = klines1H[lastIdx];
  const volumeMA20 = volumeMA20Before(klines1H, retestIdx);
  const volumeConfirmed =
    Number.isFinite(volumeMA20) &&
    volumeMA20 > 0 &&
    retestCandle.volume > volumeMA20;

  if (counterDirection === 'SHORT') {
    const touchedEma =
      retestCandle.high >= ema20Lower && retestCandle.high <= ema20Upper;
    const rejected = retestCandle.close < retestCandle.open;
    const continuedDown = confirmCandle.close < lastEma;
    const confirmed = touchedEma && rejected && continuedDown;

    return {
      confirmed,
      retestPrice: confirmed || touchedEma ? retestCandle.high : null,
      retestVolume: retestCandle.volume,
      volumeConfirmed,
    };
  }

  const touchedEma =
    retestCandle.low >= ema20Lower && retestCandle.low <= ema20Upper;
  const rejected = retestCandle.close > retestCandle.open;
  const continuedUp = confirmCandle.close > lastEma;
  const confirmed = touchedEma && rejected && continuedUp;

  return {
    confirmed,
    retestPrice: confirmed || touchedEma ? retestCandle.low : null,
    retestVolume: retestCandle.volume,
    volumeConfirmed,
  };
}

export function computeCounterTrendSL(params: ComputeCounterTrendSLParams): number {
  const { klines1H, direction } = params;

  if (klines1H.length < Math.max(EMA_PERIOD, SWING_LOOKBACK)) {
    return NaN;
  }

  const closes = klines1H.map((k) => k.close);
  const ema20Series = calculateEMA(closes, EMA_PERIOD);
  const lastEma = lastFiniteEma(ema20Series, klines1H.length - 1);
  if (lastEma == null) return NaN;

  const recent = klines1H.slice(-SWING_LOOKBACK);

  if (direction === 'SHORT') {
    const swingHigh = Math.max(...recent.map((kline) => kline.high));
    const slCandidate1 = swingHigh * 1.003;
    const slCandidate2 = lastEma * 1.005;
    return Math.min(slCandidate1, slCandidate2) * (1 + SL_BUFFER);
  }

  const swingLow = Math.min(...recent.map((kline) => kline.low));
  const slCandidate1 = swingLow * 0.997;
  const slCandidate2 = lastEma * 0.995;
  return Math.max(slCandidate1, slCandidate2) * (1 - SL_BUFFER);
}

/** Exported for unit tests — kiểm tra từng dấu hiệu bearish (LONG → SHORT). */
export function detectReversalSignalFlags(params: CheckReversalSignalsParams): {
  priceBelowEma20_1H: boolean;
  volumeSpikeDown: boolean;
  cvdDeclining1H: boolean;
  btcBelowEma20_1H: boolean;
  sellPressure30M: boolean;
} {
  return {
    priceBelowEma20_1H: detectPriceBelowEma20(params.klines1H),
    volumeSpikeDown: detectVolumeSpikeDown(params.klines1H),
    cvdDeclining1H: detectCvdDeclining1H(params.klines1H),
    btcBelowEma20_1H: detectBtcBelowEma20WithSlope(params.btcKlines1H),
    sellPressure30M: detectSellPressure30M(params.klines30M),
  };
}

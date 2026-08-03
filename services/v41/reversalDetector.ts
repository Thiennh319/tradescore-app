import { FEATURE_FLAGS } from '../../config/featureFlags';
import { calculateEMA, type KlineV41 } from './indicators';
import { getLastTwoSwings } from './reversalProbabilityEngine';
import { calculateTrendExhaustion } from './trendExhaustionEngine';
import type { TrendDirection } from './types';

/**
 * Continuous TR scoring — SSOT: config/featureFlags.ts
 * - USE_CONTINUOUS_SCORING_TR (boolean master, default false)
 * - CONTINUOUS_SCORING_TR_SYMBOLS (scope; empty = all symbols when master on)
 *
 * Đọc runtime từ FEATURE_FLAGS (không bake const lúc load) để dual-load /
 * mutate in-memory trong backtest script vẫn đúng.
 */
function shouldUseContinuousScoringTr(symbol: string | undefined): boolean {
  if (!FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR) return false;
  const symbolScopeList = FEATURE_FLAGS.CONTINUOUS_SCORING_TR_SYMBOLS as readonly string[];
  return (
    symbolScopeList.length === 0 ||
    (symbol != null && symbol !== '' && symbolScopeList.includes(symbol))
  );
}

const TREND_REVERSAL_WEIGHTS = {
  structure: 0.35,
  cvd: 0.25,
  exhaustion: 0.25,
  volume: 0.15,
};
const TREND_REVERSAL_SCORE_ACTIVE_THRESHOLD = 0.6;
const TREND_REVERSAL_SCORE_WATCH_THRESHOLD = 0.35;

/** Sigmoid scale for directional CVD slope → [0, 1] in computeCvdScore (cvdProxy units per bar). */
const CVD_SCORE_SIGMOID_SCALE = 500;

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
  /**
   * When entry is the close of a 4H bar, pass that bar's openTime so the SL
   * window includes all 1H candles inside the 4H bar (open … open+3h),
   * not only bars up to 4H open. Callers may also pre-slice via
   * {@link sliceKlines1HForFourHEntry}.
   */
  fourHOpenTime?: number;
}

/** 1H / 4H ms — used to align SL window with a 4H entry bar. */
export const COUNTER_TREND_SL_1H_MS = 3_600_000;
export const COUNTER_TREND_SL_4H_MS = 4 * COUNTER_TREND_SL_1H_MS;

/**
 * 1H window for counter-trend SL when entry = 4H bar close.
 * Includes the four 1H opens that form the 4H candle
 * (`fourHOpenTime` … `fourHOpenTime + 3h`), not only ≤ 4H open.
 */
export function sliceKlines1HForFourHEntry(
  klines1H: KlineV41[],
  fourHOpenTime: number,
): KlineV41[] {
  if (!Number.isFinite(fourHOpenTime)) return klines1H;
  const throughOpen = fourHOpenTime + 3 * COUNTER_TREND_SL_1H_MS;
  return klines1H.filter((k) => k.openTime <= throughOpen);
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

/** Task 2 — Trend Reversal Engine (Phase 1) thresholds. */
const TREND_REVERSAL_VOLUME_MULTIPLIER = 1.2;
/**
 * Floor for `signals.trendExhaustion` boolean + exhaustion confidence component.
 * Hạ 55→28 (2026-08-01): midpoint p90=20 và max=50 trên 1H NEAR 30d —
 * 55 bất khả thi trên 1H (max quan sát = 50).
 */
export const TREND_REVERSAL_EXHAUSTION_MIN = 28;
/**
 * Confidence floor for ACTIVE.
 * Hạ 70→50 (2026-08-01): chốt theo backtest 180d CVD production + SL window fix
 * — conf≥50: n=19, WR≈42.1% (ổn định hơn conf≥40 WR≈40%).
 */
export const TREND_REVERSAL_CONFIDENCE_MIN = 50;
/**
 * Số signal boolean (cvdFlip / volumeConfirmation / trendExhaustion / structureBreak)
 * tối thiểu để đủ điều kiện ACTIVE (cùng confidence ≥ TREND_REVERSAL_CONFIDENCE_MIN).
 * Hạ từ 4/4 xuống 3/4 — thử nghiệm 2026-07-26, cần theo dõi precision thực tế
 * trước khi coi là chính thức. Rollback: đặt lại = 4.
 */
export const TREND_REVERSAL_ACTIVE_MIN_SIGNALS = 3;
const STRUCTURE_SWING_LOOKBACK = 50;

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
  const { direction, entryPrice, fourHOpenTime } = params;
  const klines1H =
    fourHOpenTime != null
      ? sliceKlines1HForFourHEntry(params.klines1H, fourHOpenTime)
      : params.klines1H;

  if (klines1H.length < Math.max(EMA_PERIOD, SWING_LOOKBACK)) {
    return NaN;
  }
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return NaN;
  }

  const closes = klines1H.map((k) => k.close);
  const ema20Series = calculateEMA(closes, EMA_PERIOD);
  const lastEma = lastFiniteEma(ema20Series, klines1H.length - 1);
  if (lastEma == null) return NaN;

  const recent = klines1H.slice(-SWING_LOOKBACK);

  if (direction === 'SHORT') {
    // SL must sit above entry. Drop any candidate on the wrong side of entry.
    const swingHigh = Math.max(...recent.map((kline) => kline.high));
    const swingCand = swingHigh * 1.003;
    const emaCand = lastEma * 1.005;
    const candidates: number[] = [];
    if (swingCand > entryPrice) candidates.push(swingCand);
    if (emaCand > entryPrice) candidates.push(emaCand);
    if (candidates.length === 0) return NaN;
    const chosen = Math.min(...candidates);
    const sl = chosen * (1 + SL_BUFFER);
    return sl > entryPrice ? sl : NaN;
  }

  // LONG — SL must sit below entry. Drop any candidate on the wrong side of entry.
  const swingLow = Math.min(...recent.map((kline) => kline.low));
  const swingCand = swingLow * 0.997;
  const emaCand = lastEma * 0.995;
  const candidates: number[] = [];
  if (swingCand < entryPrice) candidates.push(swingCand);
  if (emaCand < entryPrice) candidates.push(emaCand);
  if (candidates.length === 0) return NaN;
  const chosen = Math.max(...candidates);
  const sl = chosen * (1 - SL_BUFFER);
  return sl < entryPrice ? sl : NaN;
}

// ---------------------------------------------------------------------------
// Task 2 — Trend Reversal Engine (Phase 1)
// Đủ ≥ TREND_REVERSAL_ACTIVE_MIN_SIGNALS điều kiện + confidence ≥ TREND_REVERSAL_CONFIDENCE_MIN → ACTIVE;
// ngược lại → WATCH. Không sinh entry / SL / TP / trade plan.
// ---------------------------------------------------------------------------

export type TrendReversalState = 'ACTIVE' | 'WATCH';

export interface TrendReversalSignals {
  cvdFlip: boolean;
  volumeConfirmation: boolean;
  trendExhaustion: boolean;
  structureBreak: boolean;
}

export interface TrendReversalDetail {
  trendExhaustion: number;
  volumeRatio: number;
  cvdLast3: [number, number, number];
  structureBreakType: 'HH_LH' | 'LL_HL' | null;
  olderSwingPrice: number | null;
  newerSwingPrice: number | null;
  confidence: number;
  activeConditionCount: number;
}

export interface TrendReversalComponentScores {
  structureScore: number;
  cvdScore: number;
  exhaustionScore: number;
  volumeScore: number;
}

export interface TrendReversalResult {
  state: TrendReversalState;
  signals: TrendReversalSignals;
  detail: TrendReversalDetail;
  /** Present only when USE_CONTINUOUS_SCORING_TR=true (rounded to 2 decimals). */
  reversalScore?: number;
  /** Present only when USE_CONTINUOUS_SCORING_TR=true. */
  componentScores?: TrendReversalComponentScores;
  /**
   * Present only when USE_CONTINUOUS_SCORING_TR=true.
   * true when reversalScore < TREND_REVERSAL_SCORE_WATCH_THRESHOLD (0.35).
   * State stays 'WATCH' (type not extended — used as ACTIVE/WATCH elsewhere).
   */
  isEffectivelyInactive?: boolean;
}

export interface ComputeTrendReversalParams {
  klines1H: KlineV41[];
  trendDirection: TrendDirection;
  /**
   * Optional — dùng với CONTINUOUS_SCORING_TR_SYMBOLS.
   * Khi master flag ON và scope list không rỗng: chỉ symbol nằm trong list
   * mới dùng continuous; thiếu symbol → legacy (an toàn).
   */
  symbol?: string;
}

/**
 * CVD flip — đổi chiều rõ ràng trên 3 nến cuối.
 * BULL (đảo bearish): dương → dương → âm.
 * BEAR (đảo bullish): âm → âm → dương.
 */
export function detectCvdFlip(
  klines: KlineV41[],
  trendDirection: TrendDirection,
): boolean {
  if (klines.length < 3 || trendDirection === 'NEUTRAL') return false;
  const last3 = klines.slice(-3).map(cvdProxy);
  const [a, b, c] = last3;
  if (trendDirection === 'BULL') {
    return a > 0 && b > 0 && c < 0;
  }
  return a < 0 && b < 0 && c > 0;
}

/**
 * Continuous CVD score [0, 1] — does not replace detectCvdFlip.
 *
 * slope = (cvdLast5[4] - cvdLast5[0]) / 4  (mean per-bar change over 5 candles)
 * Directional (reversal-aligned) slope:
 *   BEAR (expect bounce up): high score when slope > 0  → directional_slope = slope
 *   BULL (expect roll over): high score when slope < 0  → directional_slope = -slope
 * Normalize via logistic on directional_slope (CVD_SCORE_SIGMOID_SCALE = 500):
 *   raw = 1 / (1 + exp(-directional_slope / 500))
 *   score = clamp(2 * raw - 1, 0, 1)
 * Wrong-way / continuation slope → raw < 0.5 → score near 0 after remap+clamp.
 */
function computeCvdScore(
  cvdLast5: number[],
  trendDirection: 'BULL' | 'BEAR',
): number {
  if (cvdLast5.length < 5) return 0;
  const slope = (cvdLast5[4] - cvdLast5[0]) / 4;
  if (!Number.isFinite(slope)) return 0;
  const directionalSlope = trendDirection === 'BEAR' ? slope : -slope;
  const raw = 1 / (1 + Math.exp(-directionalSlope / CVD_SCORE_SIGMOID_SCALE));
  const score = 2 * raw - 1;
  return Math.min(1, Math.max(0, score));
}

/** Volume nến tín hiệu (nến cuối) > 1.2 × MA20. */
export function detectTrendReversalVolumeConfirmation(klines: KlineV41[]): {
  confirmed: boolean;
  volumeRatio: number;
} {
  if (klines.length < VOLUME_MA_PERIOD + 1) {
    return { confirmed: false, volumeRatio: 0 };
  }
  const lastIdx = klines.length - 1;
  const volumeMA20 = volumeMA20Before(klines, lastIdx);
  if (!Number.isFinite(volumeMA20) || volumeMA20 <= 0) {
    return { confirmed: false, volumeRatio: 0 };
  }
  const volumeRatio = klines[lastIdx].volume / volumeMA20;
  return {
    confirmed: volumeRatio > TREND_REVERSAL_VOLUME_MULTIPLIER,
    volumeRatio,
  };
}

/**
 * Continuous volume score [0, 1] — percentile of currentRatio within last20Ratios, / 100.
 * (empirical CDF: count(r <= currentRatio) / n — already in [0, 1], equivalent to pct/100)
 */
function computeVolumeScore(
  currentRatio: number,
  last20Ratios: number[],
): number {
  if (
    !Number.isFinite(currentRatio) ||
    last20Ratios.length === 0
  ) {
    return 0;
  }
  const finite = last20Ratios.filter((r) => Number.isFinite(r));
  if (finite.length === 0) return 0;
  const atOrBelow = finite.filter((r) => r <= currentRatio).length;
  return atOrBelow / finite.length;
}

/**
 * Structure break — HH→LH (bearish từ uptrend) hoặc LL→HL (bullish từ downtrend).
 * Dùng swing points V4.1 (reversalProbabilityEngine).
 */
export function detectStructureBreak(
  klines: KlineV41[],
  trendDirection: TrendDirection,
): {
  confirmed: boolean;
  breakType: 'HH_LH' | 'LL_HL' | null;
  olderSwingPrice: number | null;
  newerSwingPrice: number | null;
} {
  if (trendDirection === 'NEUTRAL') {
    return {
      confirmed: false,
      breakType: null,
      olderSwingPrice: null,
      newerSwingPrice: null,
    };
  }

  if (trendDirection === 'BULL') {
    const swings = getLastTwoSwings(klines, 'HIGH', STRUCTURE_SWING_LOOKBACK);
    if (!swings) {
      return {
        confirmed: false,
        breakType: null,
        olderSwingPrice: null,
        newerSwingPrice: null,
      };
    }
    const confirmed = swings.newer.price < swings.older.price;
    return {
      confirmed,
      breakType: confirmed ? 'HH_LH' : null,
      olderSwingPrice: swings.older.price,
      newerSwingPrice: swings.newer.price,
    };
  }

  const swings = getLastTwoSwings(klines, 'LOW', STRUCTURE_SWING_LOOKBACK);
  if (!swings) {
    return {
      confirmed: false,
      breakType: null,
      olderSwingPrice: null,
      newerSwingPrice: null,
    };
  }
  const confirmed = swings.newer.price > swings.older.price;
  return {
    confirmed,
    breakType: confirmed ? 'LL_HL' : null,
    olderSwingPrice: swings.older.price,
    newerSwingPrice: swings.newer.price,
  };
}

/** Continuous structure score [0, 1] — does not replace detectStructureBreak. */
function computeStructureScore(structureBreak: boolean): number {
  return structureBreak ? 1.0 : 0.0;
}

/** Continuous exhaustion score [0, 1] — clamp(trendExhaustion1H / 100, 0, 1). */
function computeExhaustionScore(trendExhaustion1H: number): number {
  if (!Number.isFinite(trendExhaustion1H)) return 0;
  return Math.min(1, Math.max(0, trendExhaustion1H / 100));
}

function collectLast20VolumeRatios(klines: KlineV41[]): number[] {
  const ratios: number[] = [];
  const start = klines.length - 20;
  if (start < VOLUME_MA_PERIOD) return ratios;
  for (let i = start; i < klines.length; i++) {
    const ma = volumeMA20Before(klines, i);
    if (!Number.isFinite(ma) || ma <= 0) continue;
    ratios.push(klines[i].volume / ma);
  }
  return ratios;
}

function resolveContinuousTrendReversalState(
  reversalScore: number,
): TrendReversalState {
  if (reversalScore >= TREND_REVERSAL_SCORE_ACTIVE_THRESHOLD) return 'ACTIVE';
  if (reversalScore >= TREND_REVERSAL_SCORE_WATCH_THRESHOLD) return 'WATCH';
  // score < 0.35: type stays WATCH (INACTIVE not added — state used outside this file).
  // Caller sets isEffectivelyInactive=true to mark the soft-inactive band.
  return 'WATCH';
}

function scoreCvdFlipComponent(
  confirmed: boolean,
  cvdLast3: [number, number, number],
): number {
  if (!confirmed) return 0;
  const priorAvg = (cvdLast3[0] + cvdLast3[1]) / 2;
  const flipMag = Math.abs(cvdLast3[2] - priorAvg);
  const normalized = Math.min(100, 55 + flipMag / 10);
  return normalized;
}

function scoreVolumeComponent(confirmed: boolean, volumeRatio: number): number {
  if (!confirmed) return 0;
  return Math.min(100, 50 + ((volumeRatio - TREND_REVERSAL_VOLUME_MULTIPLIER) / 0.8) * 50);
}

function scoreExhaustionComponent(confirmed: boolean, trendExhaustion: number): number {
  if (!confirmed) return 0;
  return Math.min(
    100,
    50 +
      ((trendExhaustion - TREND_REVERSAL_EXHAUSTION_MIN) /
        (100 - TREND_REVERSAL_EXHAUSTION_MIN)) *
        50,
  );
}

function scoreStructureComponent(confirmed: boolean): number {
  return confirmed ? 70 : 0;
}

function computeTrendReversalConfidence(
  signals: TrendReversalSignals,
  detail: Pick<TrendReversalDetail, 'cvdLast3' | 'volumeRatio' | 'trendExhaustion'>,
): number {
  const scores = [
    scoreCvdFlipComponent(signals.cvdFlip, detail.cvdLast3),
    scoreVolumeComponent(signals.volumeConfirmation, detail.volumeRatio),
    scoreExhaustionComponent(signals.trendExhaustion, detail.trendExhaustion),
    scoreStructureComponent(signals.structureBreak),
  ];
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function countTrendReversalSignals(signals: TrendReversalSignals): number {
  return [
    signals.cvdFlip,
    signals.volumeConfirmation,
    signals.trendExhaustion,
    signals.structureBreak,
  ].filter(Boolean).length;
}

/** Exported for unit tests — gate ACTIVE vs WATCH (signal count + confidence). */
export function resolveTrendReversalState(
  signals: TrendReversalSignals,
  confidence: number,
): TrendReversalState {
  const activeConditionCount = countTrendReversalSignals(signals);
  if (activeConditionCount < TREND_REVERSAL_ACTIVE_MIN_SIGNALS) return 'WATCH';
  if (confidence < TREND_REVERSAL_CONFIDENCE_MIN) return 'WATCH';
  return 'ACTIVE';
}

/** Task 2 — đánh giá Trend Reversal (Phase 1). Không wire scan/UI. */
export function computeTrendReversal(
  params: ComputeTrendReversalParams,
): TrendReversalResult {
  const { klines1H, trendDirection, symbol } = params;
  const useContinuousForThisSymbol = shouldUseContinuousScoringTr(symbol);

  if (trendDirection === 'NEUTRAL' || klines1H.length < VOLUME_MA_PERIOD + 1) {
    return {
      state: 'WATCH',
      signals: {
        cvdFlip: false,
        volumeConfirmation: false,
        trendExhaustion: false,
        structureBreak: false,
      },
      detail: {
        trendExhaustion: 0,
        volumeRatio: 0,
        cvdLast3: [0, 0, 0],
        structureBreakType: null,
        olderSwingPrice: null,
        newerSwingPrice: null,
        confidence: 0,
        activeConditionCount: 0,
      },
    };
  }

  const cvdFlip = detectCvdFlip(klines1H, trendDirection);
  const volume = detectTrendReversalVolumeConfirmation(klines1H);
  const exhaustion = calculateTrendExhaustion(klines1H, trendDirection);
  const structure = detectStructureBreak(klines1H, trendDirection);

  const cvdLast3 = klines1H.slice(-3).map(cvdProxy) as [number, number, number];

  const signals: TrendReversalSignals = {
    cvdFlip,
    volumeConfirmation: volume.confirmed,
    trendExhaustion: exhaustion.trendExhaustion >= TREND_REVERSAL_EXHAUSTION_MIN,
    structureBreak: structure.confirmed,
  };

  const confidence = computeTrendReversalConfidence(signals, {
    cvdLast3,
    volumeRatio: volume.volumeRatio,
    trendExhaustion: exhaustion.trendExhaustion,
  });

  const activeConditionCount = countTrendReversalSignals(signals);

  const detail: TrendReversalDetail = {
    trendExhaustion: exhaustion.trendExhaustion,
    volumeRatio: volume.volumeRatio,
    cvdLast3,
    structureBreakType: structure.breakType,
    olderSwingPrice: structure.olderSwingPrice,
    newerSwingPrice: structure.newerSwingPrice,
    confidence,
    activeConditionCount,
  };

  if (useContinuousForThisSymbol) {
    const cvdLast5 =
      klines1H.length >= 5
        ? klines1H.slice(-5).map(cvdProxy)
        : [];
    const last20Ratios = collectLast20VolumeRatios(klines1H);
    // NEUTRAL already returned above; continuous CVD score needs BULL|BEAR only.
    const cvdTrendDirection: 'BULL' | 'BEAR' =
      trendDirection === 'BEAR' ? 'BEAR' : 'BULL';
    const componentScores: TrendReversalComponentScores = {
      structureScore: computeStructureScore(structure.confirmed),
      cvdScore: computeCvdScore(cvdLast5, cvdTrendDirection),
      exhaustionScore: computeExhaustionScore(exhaustion.trendExhaustion),
      volumeScore: computeVolumeScore(volume.volumeRatio, last20Ratios),
    };
    const reversalScoreRaw =
      componentScores.structureScore * TREND_REVERSAL_WEIGHTS.structure +
      componentScores.cvdScore * TREND_REVERSAL_WEIGHTS.cvd +
      componentScores.exhaustionScore * TREND_REVERSAL_WEIGHTS.exhaustion +
      componentScores.volumeScore * TREND_REVERSAL_WEIGHTS.volume;
    const reversalScore = Math.round(reversalScoreRaw * 100) / 100;
    const isEffectivelyInactive =
      reversalScore < TREND_REVERSAL_SCORE_WATCH_THRESHOLD;

    return {
      state: resolveContinuousTrendReversalState(reversalScore),
      signals,
      detail,
      reversalScore,
      componentScores,
      isEffectivelyInactive,
    };
  }

  // Legacy boolean + confidence gate (default when master flag off, hoặc symbol ngoài scope).
  return {
    state: resolveTrendReversalState(signals, confidence),
    signals,
    detail,
  };
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

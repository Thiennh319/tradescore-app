/**
 * V4.1 Breakout Detector — range tích lũy 1H (Donchian) + breakout event.
 * Độc lập hoàn toàn với Trend Reversal / reversalDetector.
 *
 * Consolidation (độc lập, caller chọn):
 *  - Width: (rangeHigh - rangeLow) / rangeLow < X%
 *  - BB: getBollingerAnalysisV3 bandwidthSlope === CONTRACTING trong M nến liên tiếp
 *
 * Confirm:
 *  - Immediate (A): momentumConfirmed cùng chiều tại nến breakout
 *  - Retest (B): chạm lại biên đã phá trong ≤10 nến (±0.5%) + momentum tại nến retest
 */

import type { Kline } from '../binanceApi';
import { getBollingerAnalysisV3 } from '../indicators';
import { calculateATR, type KlineV41 } from './indicators';
import { computeMomentum1H, type MomentumResult } from './momentumEngine1H';

export const BREAKOUT_SL_BUFFER = 0.003; // 0.3% — cùng bậc SL_BUFFER TR
export const BREAKOUT_TP1_RR = 1.5;
export const BREAKOUT_RETEST_MAX_BARS = 10;
export const BREAKOUT_RETEST_BAND_PCT = 0.005; // ±0.5%
export const BREAKOUT_ATR_PERIOD = 14;
export const BREAKOUT_ATR_AVG_LOOKBACK = 20;
/** Fake-breakout: candle range > this × mean ATR(14) of prior 20 bars. */
export const BREAKOUT_STRONG_RANGE_ATR_MULT = 1.5;
/** Fake-breakout: volume > this × volume MA20 (same idea as momentumEngine1H). */
export const BREAKOUT_STRONG_VOLUME_MULT = 1.5;
export const BREAKOUT_VOLUME_MA_PERIOD = 20;

export type BreakoutSide = 'LONG' | 'SHORT';
export type BreakoutConfirmMode = 'immediate' | 'retest';
export type ConsolidationMode = 'width' | 'bb_contracting';
/** opposite_range = SL phía đối diện Donchian; atr_break_level = SL gần biên vừa phá. */
export type BreakoutSlMode = 'opposite_range' | 'atr_break_level';

export interface DonchianRange {
  rangeHigh: number;
  rangeLow: number;
  lookbackN: number;
  /** ((rangeHigh - rangeLow) / rangeLow) * 100 */
  widthPct: number;
}

export interface BreakoutEvent {
  side: BreakoutSide;
  /** Index of breakout candle in the series passed to detect. */
  breakoutIndex: number;
  rangeHigh: number;
  rangeLow: number;
  lookbackN: number;
  close: number;
  openTime: number;
  widthPct: number;
}

export interface BreakoutTradeLevels {
  side: BreakoutSide;
  entry: number;
  sl: number;
  tp1: number;
  slDistancePct: number;
  tp1RR: number;
  rangeHigh: number;
  rangeLow: number;
  confirmMode: BreakoutConfirmMode;
  consolidationMode: ConsolidationMode;
  breakoutOpenTime: number;
  activeOpenTime: number;
}

export function computeDonchianRange(
  klines: KlineV41[],
  lookbackN: number,
): DonchianRange | null {
  if (lookbackN < 1 || klines.length < lookbackN) return null;

  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  const start = klines.length - lookbackN;
  for (let i = start; i < klines.length; i++) {
    const k = klines[i]!;
    if (k.high > rangeHigh) rangeHigh = k.high;
    if (k.low < rangeLow) rangeLow = k.low;
  }

  if (!(rangeHigh > rangeLow) || !(rangeLow > 0) || !Number.isFinite(rangeHigh)) {
    return null;
  }

  const widthPct = ((rangeHigh - rangeLow) / rangeLow) * 100;
  return { rangeHigh, rangeLow, lookbackN, widthPct };
}

/** Width consolidation: Donchian width of the N-bar window strictly below maxWidthPct. */
export function isWidthConsolidation(
  range: DonchianRange,
  maxWidthPct: number,
): boolean {
  return Number.isFinite(range.widthPct) && range.widthPct < maxWidthPct;
}

export function toLegacyKline(k: KlineV41): Kline {
  return {
    openTime: k.openTime,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    closeTime: k.closeTime,
    quoteVolume: 0,
    trades: 0,
    takerBuyVolume: k.takerBuyVolume,
  };
}

/**
 * True when bandwidthSlope === CONTRACTING for each of the last `m` bars
 * ending at `endInclusiveIndex` (typically breakoutIndex - 1).
 */
export function hasContinuousBandwidthContracting(
  klines1H: KlineV41[],
  endInclusiveIndex: number,
  m: number,
): boolean {
  if (m < 1 || endInclusiveIndex < 0) return false;
  const start = endInclusiveIndex - m + 1;
  if (start < 0) return false;

  // BB needs ~20 period + 5-bar slope lookback
  if (endInclusiveIndex + 1 < 26) return false;

  for (let i = start; i <= endInclusiveIndex; i++) {
    const slice = klines1H.slice(0, i + 1).map(toLegacyKline);
    const analysis = getBollingerAnalysisV3(slice);
    if (analysis.bandwidthSlope !== 'CONTRACTING') return false;
  }
  return true;
}

/**
 * Breakout on candle at `breakoutIndex`: close beyond Donchian of the prior N bars
 * (breakout candle excluded from the range).
 */
export function detectBreakoutAtIndex(
  klines1H: KlineV41[],
  breakoutIndex: number,
  lookbackN: number,
): BreakoutEvent | null {
  if (breakoutIndex < lookbackN || breakoutIndex >= klines1H.length) return null;

  const rangeBars = klines1H.slice(breakoutIndex - lookbackN, breakoutIndex);
  const range = computeDonchianRange(rangeBars, lookbackN);
  if (!range) return null;

  const candle = klines1H[breakoutIndex]!;
  let side: BreakoutSide | null = null;
  if (candle.close > range.rangeHigh) side = 'LONG';
  else if (candle.close < range.rangeLow) side = 'SHORT';
  if (!side) return null;

  return {
    side,
    breakoutIndex,
    rangeHigh: range.rangeHigh,
    rangeLow: range.rangeLow,
    lookbackN,
    close: candle.close,
    openTime: candle.openTime,
    widthPct: range.widthPct,
  };
}

export function consolidationConfirmedAtBreakout(
  klines1H: KlineV41[],
  event: BreakoutEvent,
  mode: ConsolidationMode,
  opts: { maxWidthPct?: number; contractingBarsM?: number },
): boolean {
  if (mode === 'width') {
    const maxWidthPct = opts.maxWidthPct;
    if (maxWidthPct == null || !Number.isFinite(maxWidthPct)) return false;
    return event.widthPct < maxWidthPct;
  }

  const m = opts.contractingBarsM;
  if (m == null || m < 1) return false;
  return hasContinuousBandwidthContracting(klines1H, event.breakoutIndex - 1, m);
}

/** Bar intersects [level*(1-band), level*(1+band)]. */
export function barTouchesLevel(
  bar: KlineV41,
  level: number,
  bandPct: number = BREAKOUT_RETEST_BAND_PCT,
): boolean {
  if (!(level > 0) || !Number.isFinite(level)) return false;
  const lo = level * (1 - bandPct);
  const hi = level * (1 + bandPct);
  return bar.low <= hi && bar.high >= lo;
}

export function findRetestBarIndex(
  klines1H: KlineV41[],
  event: BreakoutEvent,
  maxBars: number = BREAKOUT_RETEST_MAX_BARS,
  bandPct: number = BREAKOUT_RETEST_BAND_PCT,
): number | null {
  const level = event.side === 'LONG' ? event.rangeHigh : event.rangeLow;
  const last = Math.min(klines1H.length - 1, event.breakoutIndex + maxBars);
  for (let i = event.breakoutIndex + 1; i <= last; i++) {
    if (barTouchesLevel(klines1H[i]!, level, bandPct)) return i;
  }
  return null;
}

function average(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** ATR(14) tại index, hoặc null nếu chưa đủ dữ liệu. */
export function atrAtIndex(
  klines1H: KlineV41[],
  index: number,
  period: number = BREAKOUT_ATR_PERIOD,
): number | null {
  if (index < 0 || index >= klines1H.length) return null;
  const atr = calculateATR(klines1H.slice(0, index + 1), period);
  const v = atr[atr.length - 1];
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Trung bình ATR(14) trên `lookback` nến TRƯỚC `endExclusiveIndex`
 * (không gồm nến endExclusiveIndex — thường là nến breakout).
 */
export function meanAtrBefore(
  klines1H: KlineV41[],
  endExclusiveIndex: number,
  lookback: number = BREAKOUT_ATR_AVG_LOOKBACK,
  period: number = BREAKOUT_ATR_PERIOD,
): number | null {
  if (endExclusiveIndex < period || lookback < 1) return null;
  const atr = calculateATR(klines1H.slice(0, endExclusiveIndex), period);
  const vals: number[] = [];
  for (
    let i = Math.max(period - 1, atr.length - lookback);
    i < atr.length;
    i++
  ) {
    const v = atr[i];
    if (Number.isFinite(v) && v! > 0) vals.push(v!);
  }
  if (vals.length === 0) return null;
  const m = average(vals);
  return Number.isFinite(m) && m > 0 ? m : null;
}

export function volumeMa20Before(
  klines1H: KlineV41[],
  candleIndex: number,
): number | null {
  const start = candleIndex - BREAKOUT_VOLUME_MA_PERIOD;
  if (start < 0) return null;
  const vols = klines1H
    .slice(start, candleIndex)
    .map((k) => k.volume)
    .filter((v) => Number.isFinite(v) && v > 0);
  if (vols.length < BREAKOUT_VOLUME_MA_PERIOD) return null;
  const m = average(vols);
  return Number.isFinite(m) && m > 0 ? m : null;
}

/**
 * Fake-breakout filter: nến breakout "mạnh"
 * (a) high−low > 1.5 × mean ATR(14) của 20 nến trước
 * (b) volume > 1.5 × volume MA20
 */
export function isStrongBreakoutCandle(
  klines1H: KlineV41[],
  breakoutIndex: number,
  opts?: {
    rangeAtrMult?: number;
    volumeMult?: number;
  },
): boolean {
  const rangeMult = opts?.rangeAtrMult ?? BREAKOUT_STRONG_RANGE_ATR_MULT;
  const volMult = opts?.volumeMult ?? BREAKOUT_STRONG_VOLUME_MULT;
  if (breakoutIndex < 0 || breakoutIndex >= klines1H.length) return false;

  const candle = klines1H[breakoutIndex]!;
  const candleRange = candle.high - candle.low;
  if (!(candleRange > 0)) return false;

  const meanAtr = meanAtrBefore(klines1H, breakoutIndex);
  if (meanAtr == null) return false;
  if (!(candleRange > meanAtr * rangeMult)) return false;

  const volMa = volumeMa20Before(klines1H, breakoutIndex);
  if (volMa == null) return false;
  return candle.volume > volMa * volMult;
}

export function resolveBreakoutStopLoss(params: {
  side: BreakoutSide;
  entry: number;
  rangeHigh: number;
  rangeLow: number;
  slMode: BreakoutSlMode;
  /** Required when slMode === 'atr_break_level'. */
  atr?: number | null;
  atrMult?: number;
  slBuffer?: number;
}): number | null {
  const {
    side,
    entry,
    rangeHigh,
    rangeLow,
    slMode,
    atr,
    atrMult = 1.0,
    slBuffer = BREAKOUT_SL_BUFFER,
  } = params;

  let sl: number;
  if (slMode === 'opposite_range') {
    sl = side === 'LONG' ? rangeLow * (1 - slBuffer) : rangeHigh * (1 + slBuffer);
  } else {
    if (atr == null || !Number.isFinite(atr) || atr <= 0) return null;
    const dist = atr * atrMult;
    sl = side === 'LONG' ? rangeHigh - dist : rangeLow + dist;
  }

  if (!Number.isFinite(sl) || sl <= 0) return null;
  if (side === 'LONG' && !(sl < entry)) return null;
  if (side === 'SHORT' && !(sl > entry)) return null;
  return sl;
}

export function buildBreakoutLevels(params: {
  side: BreakoutSide;
  entry: number;
  rangeHigh: number;
  rangeLow: number;
  confirmMode: BreakoutConfirmMode;
  consolidationMode: ConsolidationMode;
  breakoutOpenTime: number;
  activeOpenTime: number;
  slMode?: BreakoutSlMode;
  /** ATR value for atr_break_level (typically ATR at breakout bar). */
  atr?: number | null;
  atrMult?: number;
  slBuffer?: number;
  tp1Rr?: number;
}): BreakoutTradeLevels | null {
  const {
    side,
    entry,
    rangeHigh,
    rangeLow,
    confirmMode,
    consolidationMode,
    breakoutOpenTime,
    activeOpenTime,
  } = params;
  const slMode = params.slMode ?? 'opposite_range';
  const tp1Rr = params.tp1Rr ?? BREAKOUT_TP1_RR;

  if (!(entry > 0) || !Number.isFinite(entry)) return null;

  const sl = resolveBreakoutStopLoss({
    side,
    entry,
    rangeHigh,
    rangeLow,
    slMode,
    atr: params.atr,
    atrMult: params.atrMult,
    slBuffer: params.slBuffer,
  });
  if (sl == null) return null;

  const slDistance = Math.abs(entry - sl);
  if (!(slDistance > 0)) return null;

  const tp1 = side === 'LONG' ? entry + slDistance * tp1Rr : entry - slDistance * tp1Rr;
  const slDistancePct = (slDistance / entry) * 100;

  return {
    side,
    entry,
    sl,
    tp1,
    slDistancePct,
    tp1RR: tp1Rr,
    rangeHigh,
    rangeLow,
    confirmMode,
    consolidationMode,
    breakoutOpenTime,
    activeOpenTime,
  };
}

function momentumAligned(side: BreakoutSide, momentum: MomentumResult): boolean {
  return side === 'LONG'
    ? momentum.momentumConfirmedLong
    : momentum.momentumConfirmedShort;
}

export interface BreakoutSetupOptions {
  slMode?: BreakoutSlMode;
  atrMult?: number;
  /** When true, reject unless breakout candle passes isStrongBreakoutCandle. */
  requireStrongBreakout?: boolean;
}

function atrForSl(
  klines1H: KlineV41[],
  event: BreakoutEvent,
  slMode: BreakoutSlMode,
): number | null {
  if (slMode !== 'atr_break_level') return null;
  return atrAtIndex(klines1H, event.breakoutIndex);
}

/**
 * Phương án A — immediate: breakout + momentumConfirmed tại nến breakout.
 */
export function tryImmediateBreakoutSetup(
  klines1H: KlineV41[],
  event: BreakoutEvent,
  consolidationMode: ConsolidationMode,
  options: BreakoutSetupOptions = {},
): BreakoutTradeLevels | null {
  const slMode = options.slMode ?? 'opposite_range';
  if (options.requireStrongBreakout && !isStrongBreakoutCandle(klines1H, event.breakoutIndex)) {
    return null;
  }

  const win = klines1H.slice(0, event.breakoutIndex + 1);
  const momentum = computeMomentum1H(win);
  if (!momentumAligned(event.side, momentum)) return null;

  const entry = event.close;
  return buildBreakoutLevels({
    side: event.side,
    entry,
    rangeHigh: event.rangeHigh,
    rangeLow: event.rangeLow,
    confirmMode: 'immediate',
    consolidationMode,
    breakoutOpenTime: event.openTime,
    activeOpenTime: event.openTime,
    slMode,
    atr: atrForSl(klines1H, event, slMode),
    atrMult: options.atrMult,
  });
}

/**
 * Phương án B — retest: sau breakout, chạm biên trong ≤10 nến + momentum tại nến retest.
 * Cần series có đủ nến sau breakout (backtest cung cấp full history).
 */
export function tryRetestBreakoutSetup(
  klines1H: KlineV41[],
  event: BreakoutEvent,
  consolidationMode: ConsolidationMode,
  maxBars: number = BREAKOUT_RETEST_MAX_BARS,
  options: BreakoutSetupOptions = {},
): BreakoutTradeLevels | null {
  const slMode = options.slMode ?? 'opposite_range';
  if (options.requireStrongBreakout && !isStrongBreakoutCandle(klines1H, event.breakoutIndex)) {
    return null;
  }

  const retestIdx = findRetestBarIndex(klines1H, event, maxBars);
  if (retestIdx == null) return null;

  const win = klines1H.slice(0, retestIdx + 1);
  const momentum = computeMomentum1H(win);
  if (!momentumAligned(event.side, momentum)) return null;

  const active = klines1H[retestIdx]!;
  return buildBreakoutLevels({
    side: event.side,
    entry: active.close,
    rangeHigh: event.rangeHigh,
    rangeLow: event.rangeLow,
    confirmMode: 'retest',
    consolidationMode,
    breakoutOpenTime: event.openTime,
    activeOpenTime: active.openTime,
    slMode,
    atr: atrForSl(klines1H, event, slMode),
    atrMult: options.atrMult,
  });
}

export interface ScanBreakoutParams {
  klines1H: KlineV41[];
  lookbackN: number;
  consolidationMode: ConsolidationMode;
  maxWidthPct?: number;
  contractingBarsM?: number;
  confirmMode: BreakoutConfirmMode;
  slMode?: BreakoutSlMode;
  atrMult?: number;
  requireStrongBreakout?: boolean;
  /** Inclusive start openTime for evaluation window (optional). */
  evalStartOpenTime?: number;
  evalEndOpenTimeExclusive?: number;
}

/**
 * Walk 1H series; emit confirmed setups (independent signals, no deconflict).
 */
export function scanBreakoutSetups(params: ScanBreakoutParams): BreakoutTradeLevels[] {
  const {
    klines1H,
    lookbackN,
    consolidationMode,
    maxWidthPct,
    contractingBarsM,
    confirmMode,
    slMode = 'opposite_range',
    atrMult = 1.0,
    requireStrongBreakout = false,
    evalStartOpenTime,
    evalEndOpenTimeExclusive,
  } = params;

  const setupOpts: BreakoutSetupOptions = {
    slMode,
    atrMult,
    requireStrongBreakout,
  };

  const out: BreakoutTradeLevels[] = [];
  const minIdx = lookbackN;
  let startIdx = minIdx;
  if (evalStartOpenTime != null) {
    const found = klines1H.findIndex((k) => k.openTime >= evalStartOpenTime);
    if (found < 0) return out;
    startIdx = Math.max(minIdx, found);
  }

  for (let i = startIdx; i < klines1H.length; i++) {
    const k = klines1H[i]!;
    if (evalStartOpenTime != null && k.openTime < evalStartOpenTime) continue;
    if (evalEndOpenTimeExclusive != null && k.openTime >= evalEndOpenTimeExclusive) {
      break;
    }

    const event = detectBreakoutAtIndex(klines1H, i, lookbackN);
    if (!event) continue;

    if (
      !consolidationConfirmedAtBreakout(klines1H, event, consolidationMode, {
        maxWidthPct,
        contractingBarsM,
      })
    ) {
      continue;
    }

    const setup =
      confirmMode === 'immediate'
        ? tryImmediateBreakoutSetup(klines1H, event, consolidationMode, setupOpts)
        : tryRetestBreakoutSetup(
            klines1H,
            event,
            consolidationMode,
            BREAKOUT_RETEST_MAX_BARS,
            setupOpts,
          );

    if (setup) out.push(setup);
  }

  return out;
}

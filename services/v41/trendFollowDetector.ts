/**
 * V4.1 Trend-Following detector — pure continuation (NOT reversal / NOT breakout).
 * Trigger on 4H: first bar of strong trend streak (strength≥70 + direction) after
 * ≥COOLDOWN bars without the same-side trend gate, confirmed by 1H continuation momentum.
 *
 * Independent of reversalDetector.ts / breakoutDetector.ts.
 */

import { calculateATR, type KlineV41 } from './indicators';
import { computeMomentum1H } from './momentumEngine1H';
import { calculateTrendStrength } from './trendStrengthEngine';
import type { TrendDirection } from './types';

export const TREND_FOLLOW_STRENGTH_MIN = 70;
export const TREND_FOLLOW_COOLDOWN_BARS = 10;
export const TREND_FOLLOW_ATR_PERIOD = 14;
export const TREND_FOLLOW_ATR_MULT = 1.0;
export const TREND_FOLLOW_TP1_RR = 1.5;
export const TREND_FOLLOW_MAX_HOLD_4H = 20;

export type TrendFollowSide = 'LONG' | 'SHORT';

export interface TrendFollowSetup {
  side: TrendFollowSide;
  entry: number;
  sl: number;
  tp1: number;
  slDistancePct: number;
  tp1RR: number;
  fourHOpenTime: number;
  trendStrength: number;
  trendDirection: TrendDirection;
  momentumScore: 0 | 1 | 2;
  atr: number;
}

export interface ScanTrendFollowParams {
  klines4H: KlineV41[];
  klines1H: KlineV41[];
  /** Momentum continuation score threshold (1 or 2). */
  momentumMin: 1 | 2;
  strengthMin?: number;
  cooldownBars?: number;
  atrMult?: number;
  tp1Rr?: number;
  evalStartOpenTime?: number;
  evalEndOpenTimeExclusive?: number;
}

/** Trend gate only (no momentum) — used for cooldown / first-of-streak. */
export function meetsTrendGate(
  trendDirection: TrendDirection,
  trendStrength: number,
  side: TrendFollowSide,
  strengthMin: number = TREND_FOLLOW_STRENGTH_MIN,
): boolean {
  if (!(trendStrength >= strengthMin)) return false;
  if (side === 'LONG') return trendDirection === 'BULL';
  return trendDirection === 'BEAR';
}

/**
 * True when this bar is the first trend-gate hit for `side` after ≥cooldownBars
 * without the same-side gate (avoids re-firing every bar of the same wave).
 */
export function isFirstTrendGateInCooldown(
  gateFlags: boolean[],
  index: number,
  cooldownBars: number = TREND_FOLLOW_COOLDOWN_BARS,
): boolean {
  if (index < 0 || index >= gateFlags.length) return false;
  if (!gateFlags[index]) return false;
  const start = Math.max(0, index - cooldownBars);
  for (let i = start; i < index; i++) {
    if (gateFlags[i]) return false;
  }
  return true;
}

export function atrAtIndex4H(
  klines4H: KlineV41[],
  index: number,
  period: number = TREND_FOLLOW_ATR_PERIOD,
): number | null {
  if (index < 0 || index >= klines4H.length) return null;
  const atr = calculateATR(klines4H.slice(0, index + 1), period);
  const v = atr[atr.length - 1];
  return Number.isFinite(v) && v! > 0 ? v! : null;
}

/** 1H window through the last hour of the 4H bar (entry = 4H close). */
export function slice1HForFourHBar(
  klines1H: KlineV41[],
  fourH: KlineV41,
): KlineV41[] {
  const last1hOpen = fourH.openTime + 3 * 3_600_000;
  return klines1H.filter((k) => k.openTime <= last1hOpen);
}

export function buildTrendFollowLevels(params: {
  side: TrendFollowSide;
  entry: number;
  atr: number;
  atrMult?: number;
  tp1Rr?: number;
  fourHOpenTime: number;
  trendStrength: number;
  trendDirection: TrendDirection;
  momentumScore: 0 | 1 | 2;
}): TrendFollowSetup | null {
  const {
    side,
    entry,
    atr,
    fourHOpenTime,
    trendStrength,
    trendDirection,
    momentumScore,
  } = params;
  const atrMult = params.atrMult ?? TREND_FOLLOW_ATR_MULT;
  const tp1Rr = params.tp1Rr ?? TREND_FOLLOW_TP1_RR;

  if (!(entry > 0) || !(atr > 0) || !Number.isFinite(atr)) return null;
  const dist = atr * atrMult;
  const sl = side === 'LONG' ? entry - dist : entry + dist;
  if (side === 'LONG' && !(sl < entry)) return null;
  if (side === 'SHORT' && !(sl > entry)) return null;

  const slDistance = Math.abs(entry - sl);
  if (!(slDistance > 0)) return null;
  const tp1 = side === 'LONG' ? entry + slDistance * tp1Rr : entry - slDistance * tp1Rr;

  return {
    side,
    entry,
    sl,
    tp1,
    slDistancePct: (slDistance / entry) * 100,
    tp1RR: tp1Rr,
    fourHOpenTime,
    trendStrength,
    trendDirection,
    momentumScore,
    atr,
  };
}

/**
 * Walk 4H series; emit trend-follow setups (independent signals).
 */
export function scanTrendFollowSetups(
  params: ScanTrendFollowParams,
): TrendFollowSetup[] {
  const {
    klines4H,
    klines1H,
    momentumMin,
    strengthMin = TREND_FOLLOW_STRENGTH_MIN,
    cooldownBars = TREND_FOLLOW_COOLDOWN_BARS,
    atrMult = TREND_FOLLOW_ATR_MULT,
    tp1Rr = TREND_FOLLOW_TP1_RR,
    evalStartOpenTime,
    evalEndOpenTimeExclusive,
  } = params;

  const out: TrendFollowSetup[] = [];
  if (klines4H.length < Math.max(220, TREND_FOLLOW_ATR_PERIOD + 1)) return out;

  // Precompute trend gates per bar for cooldown
  const longGates: boolean[] = new Array(klines4H.length).fill(false);
  const shortGates: boolean[] = new Array(klines4H.length).fill(false);
  const strengths: number[] = new Array(klines4H.length).fill(0);
  const directions: TrendDirection[] = new Array(klines4H.length).fill('NEUTRAL');

  for (let i = 0; i < klines4H.length; i++) {
    const win = klines4H.slice(0, i + 1);
    const ts = calculateTrendStrength(win);
    strengths[i] = ts.trendStrength;
    directions[i] = ts.trendDirection;
    longGates[i] = meetsTrendGate(ts.trendDirection, ts.trendStrength, 'LONG', strengthMin);
    shortGates[i] = meetsTrendGate(ts.trendDirection, ts.trendStrength, 'SHORT', strengthMin);
  }

  let startIdx = TREND_FOLLOW_ATR_PERIOD;
  if (evalStartOpenTime != null) {
    const found = klines4H.findIndex((k) => k.openTime >= evalStartOpenTime);
    if (found < 0) return out;
    startIdx = Math.max(startIdx, found);
  }

  for (let i = startIdx; i < klines4H.length; i++) {
    const bar = klines4H[i]!;
    if (evalStartOpenTime != null && bar.openTime < evalStartOpenTime) continue;
    if (evalEndOpenTimeExclusive != null && bar.openTime >= evalEndOpenTimeExclusive) {
      break;
    }

    const trySide = (side: TrendFollowSide, gates: boolean[]): void => {
      if (!isFirstTrendGateInCooldown(gates, i, cooldownBars)) return;

      const win1h = slice1HForFourHBar(klines1H, bar);
      const mom = computeMomentum1H(win1h);
      const score = side === 'LONG' ? mom.momentumLong : mom.momentumShort;
      if (score < momentumMin) return;

      const atr = atrAtIndex4H(klines4H, i);
      if (atr == null) return;

      const setup = buildTrendFollowLevels({
        side,
        entry: bar.close,
        atr,
        atrMult,
        tp1Rr,
        fourHOpenTime: bar.openTime,
        trendStrength: strengths[i]!,
        trendDirection: directions[i]!,
        momentumScore: score,
      });
      if (setup) out.push(setup);
    };

    trySide('LONG', longGates);
    trySide('SHORT', shortGates);
  }

  return out;
}

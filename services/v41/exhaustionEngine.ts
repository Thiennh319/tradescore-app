import type { KlineV41 } from './indicators';
import type { TrendDirection } from './types';

export type ExhaustionType =
  | 'NONE'
  | 'CAPITULATION'
  | 'VOLUME_FADE'
  | 'FUNDING_EXTREME';

export interface ExhaustionResult {
  exhaustionDetected: boolean;
  exhaustionType: ExhaustionType;
  exhaustionStrength: number;
  direction: 'LONG' | 'SHORT' | 'NONE';
  confThreshold: number;
  eqThreshold: number;
  tpMultiplier: number;
  slMultiplier: number;
}

export interface ComputeExhaustionParams {
  klines1H: KlineV41[];
  trendExhaustion: number;
  trendDirection: TrendDirection;
  fundingRate?: number;
}

const VOLUME_MA_PERIOD = 20;
const CAPITULATION_VOLUME_MULTIPLIER = 3.0;
const CAPITULATION_WICK_RATIO = 0.6;
const VOLUME_FADE_LOOKBACK = 5;
const VOLUME_FADE_MIN_EXHAUSTION = 70;
const FUNDING_EXTREME_THRESHOLD = 0.0003; // ±0.03%

const NONE_RESULT: ExhaustionResult = {
  exhaustionDetected: false,
  exhaustionType: 'NONE',
  exhaustionStrength: 0,
  direction: 'NONE',
  confThreshold: 60,
  eqThreshold: 80,
  tpMultiplier: 1.0,
  slMultiplier: 1.0,
};

const SIGNAL_PRIORITY: Record<ExhaustionType, number> = {
  NONE: 0,
  VOLUME_FADE: 1,
  FUNDING_EXTREME: 2,
  CAPITULATION: 3,
};

function average(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function volumeMA20(klines: KlineV41[]): number | null {
  if (klines.length < VOLUME_MA_PERIOD + 1) return null;
  const lastIdx = klines.length - 1;
  const volumes = klines
    .slice(lastIdx - VOLUME_MA_PERIOD, lastIdx)
    .map((kline) => kline.volume);
  const ma = average(volumes);
  return Number.isFinite(ma) && ma > 0 ? ma : null;
}

function detectCapitulation(klines1H: KlineV41[]): ExhaustionResult | null {
  if (klines1H.length < VOLUME_MA_PERIOD + 1) return null;

  const ma = volumeMA20(klines1H);
  if (ma == null) return null;

  const last = klines1H[klines1H.length - 1];
  if (last.volume <= ma * CAPITULATION_VOLUME_MULTIPLIER) return null;

  const range = last.high - last.low;
  if (range <= 0) return null;

  const bodyBottom = Math.min(last.open, last.close);
  const wickLower = (bodyBottom - last.low) / range;
  if (wickLower <= CAPITULATION_WICK_RATIO) return null;

  const mid = (last.high + last.low) / 2;
  if (last.close <= mid) return null;

  return {
    exhaustionDetected: true,
    exhaustionType: 'CAPITULATION',
    exhaustionStrength: 80,
    direction: 'LONG',
    confThreshold: 55,
    eqThreshold: 75,
    tpMultiplier: 1.2,
    slMultiplier: 0.8,
  };
}

function detectVolumeFade(
  klines1H: KlineV41[],
  trendExhaustion: number,
  trendDirection: TrendDirection,
): ExhaustionResult | null {
  if (klines1H.length < VOLUME_FADE_LOOKBACK) return null;
  if (trendExhaustion < VOLUME_FADE_MIN_EXHAUSTION) return null;
  if (trendDirection !== 'BULL' && trendDirection !== 'BEAR') return null;

  const lastFive = klines1H.slice(-VOLUME_FADE_LOOKBACK);
  for (let i = 1; i < lastFive.length; i++) {
    if (lastFive[i].volume >= lastFive[i - 1].volume) {
      return null;
    }
  }

  const direction: 'LONG' | 'SHORT' = trendDirection === 'BULL' ? 'SHORT' : 'LONG';

  return {
    exhaustionDetected: true,
    exhaustionType: 'VOLUME_FADE',
    exhaustionStrength: 65,
    direction,
    confThreshold: 60,
    eqThreshold: 80,
    tpMultiplier: 1.0,
    slMultiplier: 1.0,
  };
}

function detectFundingExtreme(fundingRate?: number): ExhaustionResult | null {
  if (fundingRate == null || !Number.isFinite(fundingRate)) return null;

  if (fundingRate < -FUNDING_EXTREME_THRESHOLD) {
    return {
      exhaustionDetected: true,
      exhaustionType: 'FUNDING_EXTREME',
      exhaustionStrength: 75,
      direction: 'LONG',
      confThreshold: 55,
      eqThreshold: 75,
      tpMultiplier: 1.2,
      slMultiplier: 0.8,
    };
  }

  if (fundingRate > FUNDING_EXTREME_THRESHOLD) {
    return {
      exhaustionDetected: true,
      exhaustionType: 'FUNDING_EXTREME',
      exhaustionStrength: 75,
      direction: 'SHORT',
      confThreshold: 55,
      eqThreshold: 75,
      tpMultiplier: 1.2,
      slMultiplier: 0.8,
    };
  }

  return null;
}

function pickHighestPriority(
  candidates: Array<ExhaustionResult | null>,
): ExhaustionResult {
  let best: ExhaustionResult | null = null;

  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (
      best == null ||
      SIGNAL_PRIORITY[candidate.exhaustionType] > SIGNAL_PRIORITY[best.exhaustionType]
    ) {
      best = candidate;
    }
  }

  return best ?? { ...NONE_RESULT };
}

export function computeExhaustion(params: ComputeExhaustionParams): ExhaustionResult {
  const { klines1H, trendExhaustion, trendDirection, fundingRate } = params;

  return pickHighestPriority([
    detectCapitulation(klines1H),
    detectFundingExtreme(fundingRate),
    detectVolumeFade(klines1H, trendExhaustion, trendDirection),
  ]);
}

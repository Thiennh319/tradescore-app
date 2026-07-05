import type { KlineV41 } from './indicators';

export type MomentumSignal =
  | 'BUY_VOLUME_SPIKE_1H'
  | 'CVD_RISING_1H'
  | 'SELL_VOLUME_SPIKE_1H'
  | 'CVD_FALLING_1H';

export interface MomentumResult {
  momentumLong: 0 | 1 | 2;
  momentumShort: 0 | 1 | 2;
  momentumConfirmedLong: boolean;
  momentumConfirmedShort: boolean;
  signalsLong: MomentumSignal[];
  signalsShort: MomentumSignal[];
  tpMultiplier: number;
  slMultiplier: number;
}

const VOLUME_MA_PERIOD = 20;
const VOLUME_SPIKE_MULTIPLIER = 1.5;
const MIN_KLINES = 22;
const CVD_LOOKBACK = 3;

const EMPTY_RESULT: MomentumResult = {
  momentumLong: 0,
  momentumShort: 0,
  momentumConfirmedLong: false,
  momentumConfirmedShort: false,
  signalsLong: [],
  signalsShort: [],
  tpMultiplier: 1.0,
  slMultiplier: 1.0,
};

function average(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeCvd(kline: KlineV41): number {
  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);
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

function detectBuyVolumeSpike(klines: KlineV41[]): boolean {
  const ma = volumeMA20(klines);
  if (ma == null) return false;
  const last = klines[klines.length - 1];
  return last.volume > ma * VOLUME_SPIKE_MULTIPLIER && last.close > last.open;
}

function detectSellVolumeSpike(klines: KlineV41[]): boolean {
  const ma = volumeMA20(klines);
  if (ma == null) return false;
  const last = klines[klines.length - 1];
  return last.volume > ma * VOLUME_SPIKE_MULTIPLIER && last.close < last.open;
}

function detectCvdRising(klines: KlineV41[]): boolean {
  if (klines.length < CVD_LOOKBACK) return false;
  const lastThree = klines.slice(-CVD_LOOKBACK);
  return lastThree.every((kline) => computeCvd(kline) > 0);
}

function detectCvdFalling(klines: KlineV41[]): boolean {
  if (klines.length < CVD_LOOKBACK) return false;
  const lastThree = klines.slice(-CVD_LOOKBACK);
  return lastThree.every((kline) => computeCvd(kline) < 0);
}

function clampMomentumScore(count: number): 0 | 1 | 2 {
  if (count >= 2) return 2;
  if (count === 1) return 1;
  return 0;
}

function resolveMultipliers(score: 0 | 1 | 2): Pick<MomentumResult, 'tpMultiplier' | 'slMultiplier'> {
  if (score >= 2) {
    return { tpMultiplier: 1.3, slMultiplier: 1.0 };
  }
  if (score === 1) {
    return { tpMultiplier: 1.1, slMultiplier: 1.0 };
  }
  return { tpMultiplier: 1.0, slMultiplier: 1.0 };
}

export function computeMomentum1H(klines1H: KlineV41[]): MomentumResult {
  if (klines1H.length < MIN_KLINES) {
    return { ...EMPTY_RESULT };
  }

  const signalsLong: MomentumSignal[] = [];
  const signalsShort: MomentumSignal[] = [];

  if (detectBuyVolumeSpike(klines1H)) {
    signalsLong.push('BUY_VOLUME_SPIKE_1H');
  }
  if (detectCvdRising(klines1H)) {
    signalsLong.push('CVD_RISING_1H');
  }
  if (detectSellVolumeSpike(klines1H)) {
    signalsShort.push('SELL_VOLUME_SPIKE_1H');
  }
  if (detectCvdFalling(klines1H)) {
    signalsShort.push('CVD_FALLING_1H');
  }

  const momentumLong = clampMomentumScore(signalsLong.length);
  const momentumShort = clampMomentumScore(signalsShort.length);
  const dominantScore = Math.max(momentumLong, momentumShort) as 0 | 1 | 2;
  const { tpMultiplier, slMultiplier } = resolveMultipliers(dominantScore);

  return {
    momentumLong,
    momentumShort,
    momentumConfirmedLong: momentumLong >= 2,
    momentumConfirmedShort: momentumShort >= 2,
    signalsLong,
    signalsShort,
    tpMultiplier,
    slMultiplier,
  };
}

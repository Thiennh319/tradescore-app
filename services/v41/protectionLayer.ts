/**
 * V4.1 Bước 6 — Protection Layer.
 * Spec: docs/V4.1_ARCHITECTURE.md § Bước 6
 */

import { calculateATR, type KlineV41 } from './indicators';

export type StopHuntRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export type VolatilityRisk = 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';

const MIN_KLINES_VOLATILITY = 64;
const ATR_PERIOD = 14;
const ATR_SMA_WINDOW = 50;
const VOLUME_MA_PERIOD = 20;

export interface ProtectionSnapshot {
  stopHuntDetected: boolean;
  stopHuntRisk: StopHuntRisk;
  volatilityRisk: VolatilityRisk;
  volatilityAtrPct: number;
  protectionWarnings: string[];
  protectionPenalty: number;
}

export interface StopHuntResult {
  detected: boolean;
  risk: StopHuntRisk;
}

export interface VolatilityRiskResult {
  volatilityRisk: VolatilityRisk;
  atrPct: number;
}

function sma(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeWickRatio(candle: KlineV41): {
  wickRatio: number;
  wickUpper: number;
  wickLower: number;
} {
  const range = candle.high - candle.low;
  if (range <= 0) {
    return { wickRatio: 0, wickUpper: 0, wickLower: 0 };
  }

  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const wickUpper = (candle.high - bodyTop) / range;
  const wickLower = (bodyBottom - candle.low) / range;
  const wickRatio = Math.max(wickUpper, wickLower);

  return { wickRatio, wickUpper, wickLower };
}

function volumeMA20Before(klines: KlineV41[], candleIndex: number): number {
  const start = candleIndex - VOLUME_MA_PERIOD;
  if (start < 0) return NaN;

  const volumes = klines.slice(start, candleIndex).map((k) => k.volume);
  return sma(volumes);
}

function isReversalAfterWick(
  wickCandle: KlineV41,
  confirmCandle: KlineV41,
  wickUpper: number,
  wickLower: number,
): boolean {
  if (wickLower > wickUpper) {
    return confirmCandle.close > confirmCandle.open;
  }
  if (wickUpper > wickLower) {
    return confirmCandle.close < confirmCandle.open;
  }
  return false;
}

export function detectStopHunt(klines: KlineV41[]): StopHuntResult {
  if (klines.length < 2) {
    return { detected: false, risk: 'LOW' };
  }

  const wickIndex = klines.length - 2;
  const confirmIndex = klines.length - 1;
  const wickCandle = klines[wickIndex];
  const confirmCandle = klines[confirmIndex];
  const { wickRatio, wickUpper, wickLower } = computeWickRatio(wickCandle);

  if (wickRatio <= 0.7) {
    return { detected: false, risk: 'LOW' };
  }

  const reversed = isReversalAfterWick(wickCandle, confirmCandle, wickUpper, wickLower);
  if (!reversed) {
    return { detected: false, risk: 'LOW' };
  }

  const volumeAvg = volumeMA20Before(klines, wickIndex);
  if (
    wickRatio > 0.85 &&
    Number.isFinite(volumeAvg) &&
    wickCandle.volume > volumeAvg * 1.5
  ) {
    return { detected: true, risk: 'HIGH' };
  }

  return { detected: true, risk: 'MEDIUM' };
}

function classifyVolatilityRisk(atrRatio: number): VolatilityRisk {
  if (atrRatio > 2.0) return 'EXTREME';
  if (atrRatio >= 1.5) return 'HIGH';
  if (atrRatio >= 1.0) return 'NORMAL';
  return 'LOW';
}

export function computeVolatilityRisk(klines: KlineV41[]): VolatilityRiskResult {
  if (klines.length < MIN_KLINES_VOLATILITY) {
    return { volatilityRisk: 'NORMAL', atrPct: 0 };
  }

  const atrSeries = calculateATR(klines, ATR_PERIOD);
  const currentAtr = atrSeries[klines.length - 1];

  const atrValues: number[] = [];
  const start = Math.max(0, klines.length - ATR_SMA_WINDOW);
  for (let i = start; i < klines.length; i++) {
    const value = atrSeries[i];
    if (Number.isFinite(value)) {
      atrValues.push(value);
    }
  }

  const smaAtr50 = sma(atrValues);
  if (!Number.isFinite(currentAtr) || !Number.isFinite(smaAtr50) || smaAtr50 === 0) {
    return { volatilityRisk: 'NORMAL', atrPct: 0 };
  }

  const atrRatio = currentAtr / smaAtr50;
  return {
    volatilityRisk: classifyVolatilityRisk(atrRatio),
    atrPct: atrRatio * 100,
  };
}

export function computeProtectionPenalty(snapshot: ProtectionSnapshot): number {
  let penalty = 0;
  if (snapshot.stopHuntDetected) penalty -= 10;
  if (snapshot.volatilityRisk === 'EXTREME') penalty -= 10;
  return penalty;
}

export function buildProtectionSnapshot(klines: KlineV41[]): ProtectionSnapshot {
  const stopHunt = detectStopHunt(klines);
  const volatility = computeVolatilityRisk(klines);

  const protectionWarnings: string[] = [];
  if (stopHunt.risk === 'HIGH') {
    protectionWarnings.push('⚠️ Stop hunt detected');
  }
  if (volatility.volatilityRisk === 'EXTREME') {
    protectionWarnings.push('⚠️ Volatility cực cao');
  }

  const snapshot: ProtectionSnapshot = {
    stopHuntDetected: stopHunt.detected,
    stopHuntRisk: stopHunt.risk,
    volatilityRisk: volatility.volatilityRisk,
    volatilityAtrPct: volatility.atrPct,
    protectionWarnings,
    protectionPenalty: 0,
  };

  snapshot.protectionPenalty = computeProtectionPenalty(snapshot);
  return snapshot;
}

export function buildNeutralProtection(): ProtectionSnapshot {
  return {
    stopHuntDetected: false,
    stopHuntRisk: 'LOW',
    volatilityRisk: 'NORMAL',
    volatilityAtrPct: 0,
    protectionWarnings: [],
    protectionPenalty: 0,
  };
}

export const NEUTRAL_PROTECTION = buildNeutralProtection();

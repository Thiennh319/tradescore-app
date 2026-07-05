import type { Kline } from './binanceApi';

export type VWAPZone =
  | 'ABOVE_BAND2'
  | 'ABOVE_BAND1'
  | 'NEAR_VWAP'
  | 'BELOW_BAND1'
  | 'BELOW_BAND2'
  | 'BETWEEN';

export interface VWAPResult {
  vwap: number;
  upperBand1: number;
  lowerBand1: number;
  upperBand2: number;
  lowerBand2: number;
  priceVsVwap: number;
  zone: VWAPZone;
  isNearVwap: boolean;
  isPullingBackToVwap: boolean;
  sessionStart: number;
  candleCount: number;
}

export type VWAPEntryQuality = 'IDEAL' | 'GOOD' | 'NEUTRAL' | 'POOR';

export interface VWAPEntrySignal {
  quality: VWAPEntryQuality;
  suggestedEntry: number | null;
  entryReason: string;
}

export const VWAP_DEFAULTS = {
  NEAR_THRESHOLD_PCT: 0.5,
  PULLBACK_THRESHOLD_PCT: 2.0,
  MIN_CANDLES: 5,
} as const;

function getUtcSessionStart(referenceMs: number): number {
  const d = new Date(referenceMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function typicalPrice(kline: Kline): number {
  return (kline.high + kline.low + kline.close) / 3;
}

function filterSessionKlines(klines: Kline[], referenceMs: number): Kline[] {
  const sessionStart = getUtcSessionStart(referenceMs);
  return klines.filter((k) => k.openTime >= sessionStart && k.openTime <= referenceMs);
}

function resolveZone(
  price: number,
  vwap: number,
  upperBand1: number,
  upperBand2: number,
  lowerBand1: number,
  lowerBand2: number,
  isNearVwap: boolean,
): VWAPZone {
  if (isNearVwap) return 'NEAR_VWAP';
  if (price > upperBand2) return 'ABOVE_BAND2';
  if (price < lowerBand2) return 'BELOW_BAND2';
  if (price > upperBand1 && price <= upperBand2) return 'ABOVE_BAND1';
  if (price >= lowerBand2 && price < lowerBand1) return 'BELOW_BAND1';
  return 'BETWEEN';
}

function computeIsPullingBackToVwap(priceVsVwap: number, isNearVwap: boolean): boolean {
  if (isNearVwap) return false;
  const abs = Math.abs(priceVsVwap);
  return (
    abs <= VWAP_DEFAULTS.PULLBACK_THRESHOLD_PCT &&
    abs > VWAP_DEFAULTS.NEAR_THRESHOLD_PCT
  );
}

export function calculateVWAP(klines: Kline[], currentPrice: number): VWAPResult | null {
  try {
    if (!klines.length || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      return null;
    }

    const referenceMs = klines[klines.length - 1]?.openTime ?? Date.now();
    const sessionKlines = filterSessionKlines(klines, referenceMs);
    if (sessionKlines.length < VWAP_DEFAULTS.MIN_CANDLES) {
      return null;
    }

    let volumeSum = 0;
    let vwapNumerator = 0;
    for (const kline of sessionKlines) {
      const tp = typicalPrice(kline);
      const vol = kline.volume;
      if (vol <= 0) continue;
      volumeSum += vol;
      vwapNumerator += tp * vol;
    }

    if (volumeSum <= 0) return null;

    const vwap = vwapNumerator / volumeSum;

    let varianceNumerator = 0;
    for (const kline of sessionKlines) {
      const tp = typicalPrice(kline);
      const vol = kline.volume;
      if (vol <= 0) continue;
      const diff = tp - vwap;
      varianceNumerator += vol * diff * diff;
    }

    const variance = varianceNumerator / volumeSum;
    const sigma = Math.sqrt(Math.max(variance, 0));

    const upperBand1 = vwap + sigma;
    const lowerBand1 = vwap - sigma;
    const upperBand2 = vwap + 2 * sigma;
    const lowerBand2 = vwap - 2 * sigma;

    const priceVsVwap = ((currentPrice - vwap) / vwap) * 100;
    const isNearVwap = Math.abs(priceVsVwap) <= VWAP_DEFAULTS.NEAR_THRESHOLD_PCT;
    const isPullingBackToVwap = computeIsPullingBackToVwap(priceVsVwap, isNearVwap);
    const zone = resolveZone(
      currentPrice,
      vwap,
      upperBand1,
      upperBand2,
      lowerBand1,
      lowerBand2,
      isNearVwap,
    );

    return {
      vwap,
      upperBand1,
      lowerBand1,
      upperBand2,
      lowerBand2,
      priceVsVwap,
      zone,
      isNearVwap,
      isPullingBackToVwap,
      sessionStart: getUtcSessionStart(referenceMs),
      candleCount: sessionKlines.length,
    };
  } catch {
    return null;
  }
}

export function getVWAPEntrySignal(
  vwap: VWAPResult,
  direction: 'LONG' | 'SHORT',
): VWAPEntrySignal {
  if (direction === 'LONG') {
    if (vwap.isNearVwap) {
      return {
        quality: 'IDEAL',
        suggestedEntry: vwap.vwap,
        entryReason: 'Entry tại VWAP — vùng giá công bằng',
      };
    }
    if (vwap.isPullingBackToVwap && vwap.priceVsVwap > 0) {
      return {
        quality: 'GOOD',
        suggestedEntry: vwap.vwap,
        entryReason: 'Đang pullback về VWAP — chờ chạm',
      };
    }
    if (vwap.zone === 'BELOW_BAND2') {
      return {
        quality: 'POOR',
        suggestedEntry: null,
        entryReason: 'Giá quá xa VWAP — rủi ro cao',
      };
    }
    return {
      quality: 'NEUTRAL',
      suggestedEntry: vwap.vwap,
      entryReason: 'Giá chưa tối ưu tại VWAP',
    };
  }

  if (vwap.isNearVwap) {
    return {
      quality: 'IDEAL',
      suggestedEntry: vwap.vwap,
      entryReason: 'Entry tại VWAP — vùng giá công bằng',
    };
  }
  if (vwap.isPullingBackToVwap && vwap.priceVsVwap < 0) {
    return {
      quality: 'GOOD',
      suggestedEntry: vwap.vwap,
      entryReason: 'Đang pullback về VWAP — chờ chạm',
    };
  }
  if (vwap.zone === 'ABOVE_BAND2') {
    return {
      quality: 'POOR',
      suggestedEntry: null,
      entryReason: 'Giá quá xa VWAP — rủi ro cao',
    };
  }
  return {
    quality: 'NEUTRAL',
    suggestedEntry: vwap.vwap,
    entryReason: 'Giá chưa tối ưu tại VWAP',
  };
}

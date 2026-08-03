/**
 * V4.1 — Volatility Explosion Engine (Task 1).
 * Trả lời duy nhất: Quiet Market | Market Ready.
 * Không sinh LONG/SHORT, entry, trade plan hay position advice.
 */

import type { BTCContext } from './btcContextBuilder';
import type { KlineV41 } from './indicators';
import { computeVolatilityRisk } from './protectionLayer';

export type VolatilityExplosionState = 'Quiet Market' | 'Market Ready';

export interface VolatilityExplosionSignals {
  atrSpring: boolean;
  volumeExpansion: boolean;
  oiBuildup: boolean;
  fundingPressure: boolean;
  liquidationFuel: boolean;
  btcSupport: boolean;
}

export interface VolatilityExplosionDetail {
  atrRatio: number;
  atrRatioPrev: number;
  volumeRatio: number;
  oiDeltaPct: number | null;
  fundingRate: number | null;
  liquidationPressureScore: number | null;
  btcStrengthBand: string | null;
  readinessScore: number;
  activeSignalCount: number;
  availableSignalCount: number;
}

export interface VolatilityExplosionResult {
  state: VolatilityExplosionState;
  signals: VolatilityExplosionSignals;
  detail: VolatilityExplosionDetail;
}

export interface ComputeVolatilityExplosionParams {
  /** Klines 4H — bắt buộc (ATR + volume). */
  klines4H: KlineV41[];
  /** Funding rate futures (optional). */
  fundingRate?: number;
  /** % thay đổi OI gần nhất (optional — từ fetchOIEngine.deltaOI hoặc tương đương). */
  oiDeltaPct?: number;
  /**
   * Áp lực liquidation gần giá 0–100 (optional).
   * Có thể lấy từ derivatives heatmap — engine không gọi API trực tiếp.
   */
  liquidationPressureScore?: number;
  /** BTC context 4H (optional). */
  btcContext?: BTCContext;
}

const VOLUME_MA_PERIOD = 20;
const VOLUME_EXPANSION_RATIO = 1.25;
const OI_BUILDUP_PCT = 1.5;
const FUNDING_PRESSURE_THRESHOLD = 0.00015; // 0.015% — thấp hơn exhaustion RESCUE (0.03%)
const LIQUIDATION_FUEL_MIN_SCORE = 40;
const MARKET_READY_MIN_SCORE = 45;
const MARKET_READY_MIN_CORE_SIGNALS = 2; // ATR + volume

function sma(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function volumeMA20Before(klines: KlineV41[], candleIndex: number): number {
  const start = candleIndex - VOLUME_MA_PERIOD;
  if (start < 0) return NaN;
  return sma(klines.slice(start, candleIndex).map((k) => k.volume));
}

function computeAtrRatioPair(klines: KlineV41[]): { current: number; previous: number } {
  const current = computeVolatilityRisk(klines);
  const previous =
    klines.length > 65 ? computeVolatilityRisk(klines.slice(0, -1)) : { atrPct: 0 };

  return {
    current: current.atrPct / 100,
    previous: previous.atrPct / 100,
  };
}

/** ATR nén rồi giãn, expansion vừa phải, hoặc explosion đang active (> EXTREME protection). */
export function evaluateAtrSpring(atrRatio: number, atrRatioPrev: number): boolean {
  if (!Number.isFinite(atrRatio) || atrRatio <= 0) return false;
  if (atrRatio >= 1.05 && atrRatio <= 2.0) return true;
  if (
    atrRatioPrev > 0 &&
    atrRatioPrev < 0.95 &&
    atrRatio >= atrRatioPrev * 1.05
  ) {
    return true;
  }
  // Volatility đã vượt ngưỡng protection EXTREME — explosion đang diễn ra
  if (atrRatio > 2.0) return true;
  return false;
}

export function evaluateVolumeExpansion(klines: KlineV41[]): boolean {
  if (klines.length < VOLUME_MA_PERIOD + 1) return false;
  const lastIndex = klines.length - 1;
  const volMa = volumeMA20Before(klines, lastIndex);
  if (!Number.isFinite(volMa) || volMa <= 0) return false;
  return klines[lastIndex].volume / volMa >= VOLUME_EXPANSION_RATIO;
}

export function evaluateOiBuildup(oiDeltaPct?: number): boolean {
  if (oiDeltaPct == null || !Number.isFinite(oiDeltaPct)) return false;
  return oiDeltaPct >= OI_BUILDUP_PCT;
}

export function evaluateFundingPressure(fundingRate?: number): boolean {
  if (fundingRate == null || !Number.isFinite(fundingRate)) return false;
  return Math.abs(fundingRate) >= FUNDING_PRESSURE_THRESHOLD;
}

export function evaluateLiquidationFuel(liquidationPressureScore?: number): boolean {
  if (liquidationPressureScore == null || !Number.isFinite(liquidationPressureScore)) {
    return false;
  }
  return liquidationPressureScore >= LIQUIDATION_FUEL_MIN_SCORE;
}

export function evaluateBtcSupport(btcContext?: BTCContext): boolean {
  if (!btcContext) return false;
  return btcContext.btcStrengthBand === 'moderate' || btcContext.btcStrengthBand === 'strong';
}

function scoreSignal(active: boolean, weight: number): number {
  return active ? weight : 0;
}

function resolveAvailableWeights(params: ComputeVolatilityExplosionParams): number {
  let weight = 25 + 20; // ATR + volume always evaluated
  if (params.oiDeltaPct != null && Number.isFinite(params.oiDeltaPct)) weight += 15;
  if (params.fundingRate != null && Number.isFinite(params.fundingRate)) weight += 10;
  if (
    params.liquidationPressureScore != null &&
    Number.isFinite(params.liquidationPressureScore)
  ) {
    weight += 15;
  }
  if (params.btcContext) weight += 15;
  return weight;
}

/**
 * Volatility Explosion — chỉ phân loại Quiet Market vs Market Ready.
 */
export function computeVolatilityExplosion(
  params: ComputeVolatilityExplosionParams,
): VolatilityExplosionResult {
  const { klines4H, fundingRate, oiDeltaPct, liquidationPressureScore, btcContext } = params;

  const { current: atrRatio, previous: atrRatioPrev } = computeAtrRatioPair(klines4H);
  const volumeRatio = (() => {
    if (klines4H.length < VOLUME_MA_PERIOD + 1) return 0;
    const idx = klines4H.length - 1;
    const ma = volumeMA20Before(klines4H, idx);
    if (!Number.isFinite(ma) || ma <= 0) return 0;
    return klines4H[idx].volume / ma;
  })();

  const signals: VolatilityExplosionSignals = {
    atrSpring: evaluateAtrSpring(atrRatio, atrRatioPrev),
    volumeExpansion: evaluateVolumeExpansion(klines4H),
    oiBuildup: evaluateOiBuildup(oiDeltaPct),
    fundingPressure: evaluateFundingPressure(fundingRate),
    liquidationFuel: evaluateLiquidationFuel(liquidationPressureScore),
    btcSupport: evaluateBtcSupport(btcContext),
  };

  const readinessScore =
    scoreSignal(signals.atrSpring, 25) +
    scoreSignal(signals.volumeExpansion, 20) +
    scoreSignal(signals.oiBuildup, 15) +
    scoreSignal(signals.fundingPressure, 10) +
    scoreSignal(signals.liquidationFuel, 15) +
    scoreSignal(signals.btcSupport, 15);

  const signalEntries: [keyof VolatilityExplosionSignals, boolean][] = [
    ['atrSpring', signals.atrSpring],
    ['volumeExpansion', signals.volumeExpansion],
    ['oiBuildup', signals.oiBuildup],
    ['fundingPressure', signals.fundingPressure],
    ['liquidationFuel', signals.liquidationFuel],
    ['btcSupport', signals.btcSupport],
  ];

  const availableSignalCount = signalEntries.filter(([key]) => {
    if (key === 'atrSpring' || key === 'volumeExpansion') return true;
    if (key === 'oiBuildup') return oiDeltaPct != null && Number.isFinite(oiDeltaPct);
    if (key === 'fundingPressure') return fundingRate != null && Number.isFinite(fundingRate);
    if (key === 'liquidationFuel') {
      return liquidationPressureScore != null && Number.isFinite(liquidationPressureScore);
    }
    return btcContext != null;
  }).length;

  const activeSignalCount = signalEntries.filter(([, active]) => active).length;

  const coreReady =
    signals.atrSpring && signals.volumeExpansion
      ? MARKET_READY_MIN_CORE_SIGNALS
      : Number(signals.atrSpring) + Number(signals.volumeExpansion);

  const availableWeight = resolveAvailableWeights(params);
  const scaledThreshold = (MARKET_READY_MIN_SCORE / 100) * availableWeight;

  const state: VolatilityExplosionState =
    coreReady >= MARKET_READY_MIN_CORE_SIGNALS && readinessScore >= scaledThreshold
      ? 'Market Ready'
      : 'Quiet Market';

  return {
    state,
    signals,
    detail: {
      atrRatio,
      atrRatioPrev,
      volumeRatio,
      oiDeltaPct: oiDeltaPct ?? null,
      fundingRate: fundingRate ?? null,
      liquidationPressureScore: liquidationPressureScore ?? null,
      btcStrengthBand: btcContext?.btcStrengthBand ?? null,
      readinessScore,
      activeSignalCount,
      availableSignalCount,
    },
  };
}

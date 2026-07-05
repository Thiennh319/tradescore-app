/**
 * V4.1 Bước 4 — Risk Engine (Smart SL).
 */

import type { ProtectionSnapshot } from './protectionLayer';
import type { MarketIntelligenceSnapshot, MarketState, OpenDirection } from './types';

export interface RiskEngineResult {
  smartSlPrice: number;
  smartSlDistancePct: number;
  maxLossUsdt: number;
  riskApproved: boolean;
}

export interface RiskEngineParams {
  snapshot: MarketIntelligenceSnapshot;
  protection: ProtectionSnapshot;
  direction: OpenDirection;
  entryQuality: number;
  markPrice: number;
  marginUsdt: number;
  leverage: number;
}

const MAX_SL_PCT = 5.0;
const MAX_LOSS_MARGIN_RATIO = 0.25;

function baseSlPctFromTrendStrength(trendStrength: number): number {
  if (trendStrength >= 70) return 1.5;
  if (trendStrength >= 40) return 2.0;
  return 2.5;
}

function slMultiplierFromMarketState(marketState: MarketState): number {
  if (marketState === 'StrongUptrend' || marketState === 'StrongDowntrend') {
    return 0.9;
  }
  if (marketState === 'LateUptrend' || marketState === 'Distribution') {
    return 1.2;
  }
  if (marketState === 'Transition') {
    return 1.3;
  }
  return 1.0;
}

function protectionMultiplier(protection: ProtectionSnapshot): number {
  let multiplier = 1;
  if (protection.volatilityRisk === 'EXTREME') multiplier *= 1.3;
  else if (protection.volatilityRisk === 'HIGH') multiplier *= 1.15;
  if (protection.stopHuntDetected) multiplier *= 1.1;
  return multiplier;
}

export function computeSmartSL(params: RiskEngineParams): RiskEngineResult {
  const {
    snapshot,
    protection,
    direction,
    entryQuality,
    markPrice,
    marginUsdt,
    leverage,
  } = params;

  const baseSlPct = baseSlPctFromTrendStrength(snapshot.trendStrength);
  const stateMultiplier = slMultiplierFromMarketState(snapshot.marketState);
  const protMultiplier = protectionMultiplier(protection);

  const finalSlPct = baseSlPct * stateMultiplier * protMultiplier;
  const smartSlDistancePct = finalSlPct;

  const smartSlPrice =
    direction === 'LONG'
      ? markPrice * (1 - finalSlPct / 100)
      : markPrice * (1 + finalSlPct / 100);

  const rawMaxLoss = marginUsdt * (finalSlPct / 100) * leverage;
  const maxLossUsdt = Math.min(rawMaxLoss, marginUsdt);

  const riskApproved =
    maxLossUsdt <= marginUsdt * MAX_LOSS_MARGIN_RATIO &&
    finalSlPct <= MAX_SL_PCT &&
    entryQuality >= 70;

  return {
    smartSlPrice,
    smartSlDistancePct,
    maxLossUsdt,
    riskApproved,
  };
}

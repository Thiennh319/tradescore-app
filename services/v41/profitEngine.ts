/**
 * V4.1 Bước 4 — Profit Engine (Smart TP).
 */

import type { MarketIntelligenceSnapshot, MarketState, OpenDirection } from './types';

export interface ProfitEngineResult {
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  riskRewardRatio: number;
}

export interface ProfitEngineParams {
  snapshot: MarketIntelligenceSnapshot;
  direction: OpenDirection;
  markPrice: number;
  smartSlPrice: number;
  entryQuality: number;
}

const BASE_TP1_RR = 2.0;
const BASE_TP2_RR = 3.0;
const BASE_TP3_RR = 4.5;

function stateMultiplierFromMarketState(marketState: MarketState): number {
  if (marketState === 'StrongUptrend' || marketState === 'StrongDowntrend') {
    return 1.2;
  }
  if (marketState === 'LateUptrend' || marketState === 'Distribution') {
    return 0.8;
  }
  if (marketState === 'Transition') {
    return 0.7;
  }
  return 1.0;
}

function qualityMultiplier(entryQuality: number): number {
  if (entryQuality >= 85) return 1.1;
  if (entryQuality >= 70) return 1.0;
  return 0.9;
}

export function computeSmartTP(params: ProfitEngineParams): ProfitEngineResult {
  const { snapshot, direction, markPrice, smartSlPrice, entryQuality } = params;

  const slDistance = Math.abs(markPrice - smartSlPrice);
  const stateMultiplier = stateMultiplierFromMarketState(snapshot.marketState);
  const qualMultiplier = qualityMultiplier(entryQuality);

  const finalTp1RR = BASE_TP1_RR * stateMultiplier * qualMultiplier;
  const tp2RR = finalTp1RR * (BASE_TP2_RR / BASE_TP1_RR);
  const tp3RR = finalTp1RR * (BASE_TP3_RR / BASE_TP1_RR);

  if (direction === 'LONG') {
    return {
      tp1Price: markPrice + slDistance * finalTp1RR,
      tp2Price: markPrice + slDistance * tp2RR,
      tp3Price: markPrice + slDistance * tp3RR,
      riskRewardRatio: finalTp1RR,
    };
  }

  return {
    tp1Price: markPrice - slDistance * finalTp1RR,
    tp2Price: markPrice - slDistance * tp2RR,
    tp3Price: markPrice - slDistance * tp3RR,
    riskRewardRatio: finalTp1RR,
  };
}

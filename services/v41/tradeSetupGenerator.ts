/**
 * V4.1 Bước 4 — Trade Setup Generator.
 */

import type { OpportunitySnapshot } from './entryQualityEngine';
import { computeSmartTP } from './profitEngine';
import type { ProtectionSnapshot } from './protectionLayer';
import { computeSmartSL } from './riskEngine';
import type { MarketIntelligenceSnapshot, MarketState, OpenDirection } from './types';

export interface TradeSetupV41 {
  direction: OpenDirection;
  entryZoneLow: number;
  entryZoneHigh: number;
  markPrice: number;
  smartSlPrice: number;
  smartSlDistancePct: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  marginUsdt: number;
  leverage: number;
  maxLossUsdt: number;
  entryQuality: number;
  marketState: MarketState;
  marketConfidence: number;
  riskApproved: boolean;
  riskRewardRatio: number;
  generatedAt: number;
}

export interface GenerateTradeSetupV41Params {
  snapshot: MarketIntelligenceSnapshot;
  opportunity: OpportunitySnapshot;
  protection: ProtectionSnapshot;
  direction: OpenDirection;
  markPrice: number;
  marginUsdt: number;
  leverage: number;
}

export function generateTradeSetupV41(params: GenerateTradeSetupV41Params): TradeSetupV41 {
  const { snapshot, opportunity, protection, direction, markPrice, marginUsdt, leverage } =
    params;

  const entryQuality =
    direction === 'LONG' ? opportunity.entryQualityLong : opportunity.entryQualityShort;

  const risk = computeSmartSL({
    snapshot,
    protection,
    direction,
    entryQuality,
    markPrice,
    marginUsdt,
    leverage,
  });

  const profit = computeSmartTP({
    snapshot,
    direction,
    markPrice,
    smartSlPrice: risk.smartSlPrice,
    entryQuality,
  });

  const buffer = markPrice * 0.001;

  return {
    direction,
    entryZoneLow: markPrice - buffer,
    entryZoneHigh: markPrice + buffer,
    markPrice,
    smartSlPrice: risk.smartSlPrice,
    smartSlDistancePct: risk.smartSlDistancePct,
    tp1Price: profit.tp1Price,
    tp2Price: profit.tp2Price,
    tp3Price: profit.tp3Price,
    marginUsdt,
    leverage,
    maxLossUsdt: risk.maxLossUsdt,
    entryQuality,
    marketState: snapshot.marketState,
    marketConfidence: snapshot.marketConfidence,
    riskApproved: risk.riskApproved,
    riskRewardRatio: profit.riskRewardRatio,
    generatedAt: Date.now(),
  };
}

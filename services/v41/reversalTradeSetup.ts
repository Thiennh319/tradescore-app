import type { OpportunitySnapshot } from './entryQualityEngine';
import type { ExhaustionType } from './exhaustionEngine';
import { computeCounterTrendSL, type ReversalState } from './reversalDetector';
import type { KlineV41 } from './indicators';
import type { MomentumResult } from './momentumEngine1H';
import type { MarketIntelligenceSnapshot } from './types';

export interface ReversalTradeSetup {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  slDistancePct: number;
  tp1RR: number;
  tp2RR: number;
  tp3RR: number;
  marginUsdt: number;
  leverage: number;
  maxLossUsdt: number;
  isCounterTrend: boolean;
  retestPrice: number;
  generatedAt: number;
}

export interface GenerateReversalSetupParams {
  symbol: string;
  reversalState: ReversalState;
  klines1H: KlineV41[];
  markPrice: number;
  marginUsdt?: number;
  leverage?: number;
  snapshot?: MarketIntelligenceSnapshot;
  opportunity?: OpportunitySnapshot;
  momentum?: MomentumResult;
  /** When entry aligns with a completed 4H close, pass that 4H openTime for SL window. */
  fourHOpenTime?: number;
}

const TP1_RR = 1.5;
const TP2_RR = 2.5;
const TP3_RR = 3.5;
const DEFAULT_MARGIN_USDT = 6;
const DEFAULT_LEVERAGE = 5;
const MIN_COUNTER_CONFIDENCE = 60;
const MIN_COUNTER_EQ = 80;

function resolveEffectiveTpMultiplier(
  momentum: MomentumResult,
  exhaustionType: ExhaustionType,
): number {
  const base = momentum.tpMultiplier;
  if (exhaustionType === 'CAPITULATION' || exhaustionType === 'FUNDING_EXTREME') {
    return base * 1.2;
  }
  return base * 0.8;
}

export function generateReversalSetup(
  params: GenerateReversalSetupParams,
): ReversalTradeSetup | null {
  const {
    symbol,
    reversalState,
    klines1H,
    markPrice,
    marginUsdt = DEFAULT_MARGIN_USDT,
    leverage = DEFAULT_LEVERAGE,
    snapshot,
    opportunity,
    momentum,
    fourHOpenTime,
  } = params;

  if (reversalState.phase !== 'RETEST_CONFIRMED') return null;
  if (reversalState.counterDirection == null) return null;
  if (!Number.isFinite(markPrice) || markPrice <= 0) return null;
  if (!snapshot || !opportunity || !momentum) return null;

  const direction = reversalState.counterDirection;

  if (snapshot.marketConfidence < MIN_COUNTER_CONFIDENCE) {
    return null;
  }

  const counterEQ =
    direction === 'SHORT'
      ? opportunity.entryQualityShort
      : opportunity.entryQualityLong;

  if (counterEQ < MIN_COUNTER_EQ) {
    return null;
  }

  const momentumConfirmed =
    direction === 'SHORT'
      ? momentum.momentumConfirmedShort
      : momentum.momentumConfirmedLong;

  if (!momentumConfirmed) {
    return null;
  }

  const entry = markPrice;

  const slPrice = computeCounterTrendSL({
    klines1H,
    direction,
    entryPrice: entry,
    fourHOpenTime,
  });
  if (!Number.isFinite(slPrice) || slPrice <= 0) return null;

  const slDistance = Math.abs(entry - slPrice);
  if (slDistance <= 0) return null;

  const slDistancePct = (slDistance / entry) * 100;

  const tpMultiplier = resolveEffectiveTpMultiplier(momentum, opportunity.exhaustionType);
  const tp1RR = TP1_RR * tpMultiplier;
  const tp2RR = TP2_RR * tpMultiplier;
  const tp3RR = TP3_RR * tpMultiplier;

  let tp1Price: number;
  let tp2Price: number;
  let tp3Price: number;

  if (direction === 'SHORT') {
    tp1Price = entry - slDistance * tp1RR;
    tp2Price = entry - slDistance * tp2RR;
    tp3Price = entry - slDistance * tp3RR;
  } else {
    tp1Price = entry + slDistance * tp1RR;
    tp2Price = entry + slDistance * tp2RR;
    tp3Price = entry + slDistance * tp3RR;
  }

  const rawMaxLoss = marginUsdt * (slDistancePct / 100) * leverage;
  const maxLossUsdt = Math.min(rawMaxLoss, marginUsdt);
  const retestPrice = reversalState.retestPrice ?? entry;

  return {
    symbol,
    direction,
    entryPrice: entry,
    slPrice,
    tp1Price,
    tp2Price,
    tp3Price,
    slDistancePct,
    tp1RR,
    tp2RR,
    tp3RR,
    marginUsdt,
    leverage,
    maxLossUsdt,
    isCounterTrend: true,
    retestPrice,
    generatedAt: Date.now(),
  };
}

/**
 * V4.1 Bước 3 — Opportunity / Entry Quality Engine.
 * Công thức: docs/V4.1_ARCHITECTURE.md § Bước 3 (mục 5.1).
 */

import type { ExhaustionResult, ExhaustionType } from './exhaustionEngine';
import type { MomentumResult } from './momentumEngine1H';
import type { MarketIntelligenceSnapshot, MarketState, TrendDirection } from './types';
import { computeProtectionPenalty, type ProtectionSnapshot } from './protectionLayer';

export type OpportunityDirection = 'LONG' | 'SHORT' | 'NONE';

export type ConfidenceTier = 'HIGH' | 'MID' | 'LOW';

export const EQ_THRESHOLDS = {
  HIGH_CONFIDENCE: 60,
  MID_CONFIDENCE: 40,
  EQ_NORMAL: 70,
  EQ_MID: 75,
  EQ_STRICT: 80,
  COUNTER_TREND_CONF: 60,
  COUNTER_TREND_EQ: 80,
} as const;

export type QualityLabel =
  | 'No Trade'
  | 'Watchlist'
  | 'Setup Forming'
  | 'Trade Ready'
  | 'Trade Ready ⚠️'
  | 'High Quality Entry';

export interface OpportunitySnapshot {
  buyScore: number;
  sellScore: number;
  entryQuality: number;
  entryQualityLong: number;
  entryQualityShort: number;
  opportunityDirection: OpportunityDirection;
  opportunityValid: boolean;
  qualityLabel: QualityLabel;
  eqThreshold: number;
  confidenceTier: ConfidenceTier;
  momentumConfirmedLong: boolean;
  momentumConfirmedShort: boolean;
  exhaustionDetected: boolean;
  exhaustionType: ExhaustionType;
  effectiveConfThreshold: number;
  effectiveEqThreshold: number;
}

export interface ComputeEntryQualityParams {
  snapshot: MarketIntelligenceSnapshot;
  protection: ProtectionSnapshot;
  momentum?: MomentumResult;
  exhaustion?: ExhaustionResult;
  /** Early Warning severity === BLOCK — từ caller. */
  earlyWarningBlocked?: boolean;
  /** Reversal counter-trend setup — ngưỡng 60/80 + momentum ngược chiều. */
  isCounterTrend?: boolean;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundEntryScore(value: number): number {
  return Math.round(clamp(0, 100, value));
}

export function resolveEQThreshold(confidence: number): number {
  if (confidence >= EQ_THRESHOLDS.HIGH_CONFIDENCE) return EQ_THRESHOLDS.EQ_NORMAL;
  if (confidence >= EQ_THRESHOLDS.MID_CONFIDENCE) return EQ_THRESHOLDS.EQ_MID;
  return EQ_THRESHOLDS.EQ_STRICT;
}

export function resolveConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= EQ_THRESHOLDS.HIGH_CONFIDENCE) return 'HIGH';
  if (confidence >= EQ_THRESHOLDS.MID_CONFIDENCE) return 'MID';
  return 'LOW';
}

function directionScoreLong(
  trendDirection: TrendDirection,
  marketState: MarketState,
): number {
  let score = 0;
  if (trendDirection === 'BULL') score += 15;
  if (marketState === 'StrongUptrend' || marketState === 'HealthyUptrend') {
    score += 15;
  } else if (marketState === 'LateUptrend') {
    score += 8;
  }
  return Math.min(30, score);
}

function directionScoreShort(
  trendDirection: TrendDirection,
  marketState: MarketState,
): number {
  let score = 0;
  if (trendDirection === 'BEAR') score += 15;
  if (marketState === 'StrongDowntrend' || marketState === 'WeakDowntrend') {
    score += 15;
  } else if (marketState === 'Distribution') {
    score += 8;
  }
  return Math.min(30, score);
}

function reversalPenaltyLong(
  reversalProbability: number,
  marketState: MarketState,
): number {
  if (
    reversalProbability >= 60 &&
    (marketState === 'LateUptrend' || marketState === 'Distribution')
  ) {
    return -20;
  }
  return 0;
}

function reversalPenaltyShort(
  reversalProbability: number,
  marketState: MarketState,
): number {
  if (reversalProbability >= 60 && marketState === 'Accumulation') {
    return -20;
  }
  return 0;
}

export function resolveQualityLabel(entryQuality: number): QualityLabel {
  const score = roundEntryScore(entryQuality);
  if (score <= 29) return 'No Trade';
  if (score <= 49) return 'Watchlist';
  if (score <= 69) return 'Setup Forming';
  if (score <= 84) return 'Trade Ready';
  return 'High Quality Entry';
}

export function resolveQualityLabelByTier(
  entryQuality: number,
  tier: ConfidenceTier,
): QualityLabel {
  const score = roundEntryScore(entryQuality);

  if (tier === 'HIGH') {
    if (score >= 85) return 'High Quality Entry';
    if (score >= EQ_THRESHOLDS.EQ_NORMAL) return 'Trade Ready';
    if (score >= 50) return 'Setup Forming';
    return 'No Trade';
  }

  if (tier === 'MID') {
    if (score >= 85) return 'High Quality Entry';
    if (score >= EQ_THRESHOLDS.EQ_MID) return 'Trade Ready ⚠️';
    if (score >= 50) return 'Setup Forming';
    return 'No Trade';
  }

  if (score >= EQ_THRESHOLDS.EQ_STRICT) return 'Trade Ready ⚠️';
  if (score >= 50) return 'Setup Forming';
  return 'No Trade';
}

export function resolveOpportunityDirection(
  entryQualityLong: number,
  entryQualityShort: number,
  eqThreshold: number = EQ_THRESHOLDS.EQ_NORMAL,
): {
  opportunityDirection: OpportunityDirection;
  entryQuality: number;
  opportunityValid: boolean;
} {
  const long = entryQualityLong;
  const short = entryQualityShort;

  let opportunityDirection: OpportunityDirection;
  let entryQuality: number;

  if (long < 50 && short < 50) {
    opportunityDirection = 'NONE';
    entryQuality = Math.max(long, short);
  } else if (long > short) {
    opportunityDirection = 'LONG';
    entryQuality = long;
  } else if (short > long) {
    opportunityDirection = 'SHORT';
    entryQuality = short;
  } else {
    opportunityDirection = 'NONE';
    entryQuality = Math.max(long, short);
  }

  const opportunityValid = entryQuality >= eqThreshold && opportunityDirection !== 'NONE';
  return { opportunityDirection, entryQuality, opportunityValid };
}

function resolveMomentumConfirmed(
  direction: OpportunityDirection,
  momentum?: MomentumResult,
): boolean {
  if (direction === 'NONE') return false;
  if (momentum == null) return true;
  return direction === 'LONG'
    ? momentum.momentumConfirmedLong
    : momentum.momentumConfirmedShort;
}

function resolveEffectiveThresholds(
  marketConfidence: number,
  exhaustion?: ExhaustionResult,
  isCounterTrend?: boolean,
): { effectiveEqThreshold: number; effectiveConfThreshold: number } {
  if (isCounterTrend) {
    return {
      effectiveEqThreshold: EQ_THRESHOLDS.COUNTER_TREND_EQ,
      effectiveConfThreshold: EQ_THRESHOLDS.COUNTER_TREND_CONF,
    };
  }

  if (exhaustion?.exhaustionDetected) {
    return {
      effectiveEqThreshold: exhaustion.eqThreshold,
      effectiveConfThreshold: exhaustion.confThreshold,
    };
  }

  return {
    effectiveEqThreshold: resolveEQThreshold(marketConfidence),
    effectiveConfThreshold: EQ_THRESHOLDS.HIGH_CONFIDENCE,
  };
}

function resolveOpportunityValid(params: {
  opportunityDirection: OpportunityDirection;
  entryQuality: number;
  marketConfidence: number;
  effectiveEqThreshold: number;
  effectiveConfThreshold: number;
  momentum?: MomentumResult;
  exhaustion?: ExhaustionResult;
  earlyWarningBlocked?: boolean;
  isCounterTrend?: boolean;
}): boolean {
  const {
    opportunityDirection,
    entryQuality,
    marketConfidence,
    effectiveEqThreshold,
    effectiveConfThreshold,
    momentum,
    exhaustion,
    earlyWarningBlocked,
    isCounterTrend,
  } = params;

  if (opportunityDirection === 'NONE') return false;
  if (earlyWarningBlocked) return false;
  if (entryQuality < effectiveEqThreshold) return false;

  const momentumConfirmed = resolveMomentumConfirmed(opportunityDirection, momentum);
  if (!momentumConfirmed) return false;

  if (isCounterTrend || exhaustion?.exhaustionDetected) {
    if (marketConfidence < effectiveConfThreshold) return false;
    if (exhaustion?.exhaustionDetected && exhaustion.direction !== 'NONE') {
      if (opportunityDirection !== exhaustion.direction) return false;
    }
    return true;
  }

  return true;
}

export function computeEntryQuality(params: ComputeEntryQualityParams): OpportunitySnapshot {
  const {
    snapshot,
    protection,
    momentum,
    exhaustion,
    earlyWarningBlocked,
    isCounterTrend,
  } = params;
  const { trendDirection, marketState, marketConfidence, reversalProbability } = snapshot;

  const { effectiveEqThreshold, effectiveConfThreshold } = resolveEffectiveThresholds(
    marketConfidence,
    exhaustion,
    isCounterTrend,
  );
  const confidenceTier = resolveConfidenceTier(marketConfidence);

  const dirLong = directionScoreLong(trendDirection, marketState);
  const dirShort = directionScoreShort(trendDirection, marketState);
  const confidenceScore = marketConfidence * 0.3;
  const revLong = reversalPenaltyLong(reversalProbability, marketState);
  const revShort = reversalPenaltyShort(reversalProbability, marketState);
  const protectionPenalty = computeProtectionPenalty(protection);

  const rawLong = dirLong + confidenceScore + 40;
  const rawShort = dirShort + confidenceScore + 40;

  const entryQualityLong = roundEntryScore(rawLong + revLong + protectionPenalty);
  const entryQualityShort = roundEntryScore(rawShort + revShort + protectionPenalty);

  const { opportunityDirection, entryQuality } = resolveOpportunityDirection(
    entryQualityLong,
    entryQualityShort,
    effectiveEqThreshold,
  );

  const opportunityValid = resolveOpportunityValid({
    opportunityDirection,
    entryQuality,
    marketConfidence,
    effectiveEqThreshold,
    effectiveConfThreshold,
    momentum,
    exhaustion,
    earlyWarningBlocked,
    isCounterTrend,
  });

  return {
    buyScore: entryQualityLong,
    sellScore: entryQualityShort,
    entryQuality,
    entryQualityLong,
    entryQualityShort,
    opportunityDirection,
    opportunityValid,
    qualityLabel: resolveQualityLabelByTier(entryQuality, confidenceTier),
    eqThreshold: effectiveEqThreshold,
    confidenceTier,
    momentumConfirmedLong: momentum?.momentumConfirmedLong ?? false,
    momentumConfirmedShort: momentum?.momentumConfirmedShort ?? false,
    exhaustionDetected: exhaustion?.exhaustionDetected ?? false,
    exhaustionType: exhaustion?.exhaustionType ?? 'NONE',
    effectiveConfThreshold,
    effectiveEqThreshold,
  };
}

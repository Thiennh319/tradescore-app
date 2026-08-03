/**
 * V4.1 Foundation — canonical state tokens.
 * Re-exports existing domain enums; adds foundation-only aliases where needed.
 */

import type { VolatilityExplosionState } from '../volatilityExplosionEngine';

export type {
  MarketState,
  OpenDirection,
  TrendDirection,
  VisibilityMode,
} from '../types';

export type { EarlyWarningSeverity } from '../earlyWarningEngine';
export type { ExhaustionType } from '../exhaustionEngine';
export type { VolatilityExplosionState } from '../volatilityExplosionEngine';
export type { VolatilityRisk, StopHuntRisk } from '../protectionLayer';
export type { ConfidenceTier, OpportunityDirection, QualityLabel } from '../entryQualityEngine';

/** Foundation volatility explosion states (no spaces — canonical for new tasks). */
export const V41_VOLATILITY_FOUNDATION_STATE = {
  QUIET_MARKET: 'QuietMarket',
  MARKET_READY: 'MarketReady',
} as const;

export type V41VolatilityFoundationState =
  (typeof V41_VOLATILITY_FOUNDATION_STATE)[keyof typeof V41_VOLATILITY_FOUNDATION_STATE];

/** Cross-engine foundation tokens for future tasks (not wired to scan yet). */
export const V41_FOUNDATION_STATE = {
  QUIET_MARKET: V41_VOLATILITY_FOUNDATION_STATE.QUIET_MARKET,
  MARKET_READY: V41_VOLATILITY_FOUNDATION_STATE.MARKET_READY,
  WATCH: 'Watch',
  LONG_ACTIVE: 'LongActive',
  SHORT_ACTIVE: 'ShortActive',
  BULL_TRAP: 'BullTrap',
  BEAR_TRAP: 'BearTrap',
} as const;

export type V41FoundationStateToken =
  (typeof V41_FOUNDATION_STATE)[keyof typeof V41_FOUNDATION_STATE];

/** Adapter-only momentum states — avoid hard-coded strings in adapters. */
export const V41_MOMENTUM_FOUNDATION_STATE = {
  LONG_CONFIRMED: 'MomentumLongConfirmed',
  SHORT_CONFIRMED: 'MomentumShortConfirmed',
  UNCONFIRMED: 'MomentumUnconfirmed',
} as const;

export type V41MomentumFoundationState =
  (typeof V41_MOMENTUM_FOUNDATION_STATE)[keyof typeof V41_MOMENTUM_FOUNDATION_STATE];

/** Trend Reversal Engine (Task 2) — evaluation only, no entry/trade plan. */
export const V41_TREND_REVERSAL_FOUNDATION_STATE = {
  WATCH: 'Watch',
  ACTIVE: 'Active',
} as const;

export type V41TrendReversalFoundationState =
  (typeof V41_TREND_REVERSAL_FOUNDATION_STATE)[keyof typeof V41_TREND_REVERSAL_FOUNDATION_STATE];

/** Confidence Engine (Task 3) — scored only, no direction/state gate. */
export const V41_CONFIDENCE_FOUNDATION_STATE = {
  SCORED: 'Scored',
} as const;

export type V41ConfidenceFoundationState =
  (typeof V41_CONFIDENCE_FOUNDATION_STATE)[keyof typeof V41_CONFIDENCE_FOUNDATION_STATE];

/** Decision Engine (Task 4) — LONG | SHORT | WATCH | IGNORE only. */
export const V41_DECISION_FOUNDATION_STATE = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  WATCH: 'WATCH',
  IGNORE: 'IGNORE',
} as const;

export type V41DecisionFoundationState =
  (typeof V41_DECISION_FOUNDATION_STATE)[keyof typeof V41_DECISION_FOUNDATION_STATE];

const LEGACY_VOLATILITY_TO_FOUNDATION: Record<
  VolatilityExplosionState,
  V41VolatilityFoundationState
> = {
  'Quiet Market': V41_VOLATILITY_FOUNDATION_STATE.QUIET_MARKET,
  'Market Ready': V41_VOLATILITY_FOUNDATION_STATE.MARKET_READY,
};

const FOUNDATION_TO_LEGACY_VOLATILITY: Record<
  V41VolatilityFoundationState,
  VolatilityExplosionState
> = {
  [V41_VOLATILITY_FOUNDATION_STATE.QUIET_MARKET]: 'Quiet Market',
  [V41_VOLATILITY_FOUNDATION_STATE.MARKET_READY]: 'Market Ready',
};

export function toFoundationVolatilityState(
  legacy: VolatilityExplosionState,
): V41VolatilityFoundationState {
  return LEGACY_VOLATILITY_TO_FOUNDATION[legacy];
}

export function toLegacyVolatilityState(
  foundation: V41VolatilityFoundationState,
): VolatilityExplosionState {
  return FOUNDATION_TO_LEGACY_VOLATILITY[foundation];
}

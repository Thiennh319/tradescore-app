/**
 * V4.1 Foundation — adapters from legacy engine outputs to V41EngineResult.
 * No algorithm changes; read-only mapping.
 */

import type { EarlyWarningResult, EarlyWarningSeverity } from '../earlyWarningEngine';
import type { ExhaustionResult } from '../exhaustionEngine';
import type { OpportunitySnapshot } from '../entryQualityEngine';
import type { MomentumResult } from '../momentumEngine1H';
import type { ProtectionSnapshot } from '../protectionLayer';
import type { VolatilityExplosionResult } from '../volatilityExplosionEngine';
import type { TrendReversalResult } from '../reversalDetector';
import {
  TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
  TREND_REVERSAL_CONFIDENCE_MIN,
  TREND_REVERSAL_EXHAUSTION_MIN,
} from '../reversalDetector';
import type { TrendReversalWithContextResult } from '../marketContextFilter';
import type { MarketIntelligenceSnapshot, VisibilityResult } from '../types';
import { buildV41EngineResult } from './engineResult';
import { V41_ENGINE_ID } from './engineIds';
import type { V41ReviewItem } from './reviewItem';
import {
  createBlockReview,
  createInfoReview,
  createWarningReview,
} from './reviewItem';
import {
  toFoundationVolatilityState,
  V41_MOMENTUM_FOUNDATION_STATE,
  V41_TREND_REVERSAL_FOUNDATION_STATE,
  type V41TrendReversalFoundationState,
  type V41VolatilityFoundationState,
} from './states';

function severityToConfidence(severity: EarlyWarningSeverity): number {
  switch (severity) {
    case 'BLOCK':
      return 90;
    case 'WARNING_HARD':
      return 70;
    case 'WARNING_SOFT':
      return 45;
    default:
      return 10;
  }
}

function warningLevelForSeverity(severity: EarlyWarningSeverity): V41ReviewItem['level'] {
  if (severity === 'BLOCK') return 'BLOCK';
  if (severity === 'WARNING_HARD') return 'WARN';
  if (severity === 'WARNING_SOFT') return 'WATCH';
  return 'INFO';
}

export function adaptVolatilityExplosionResult(
  result: VolatilityExplosionResult,
): ReturnType<typeof buildV41EngineResult<V41VolatilityFoundationState>> {
  const reviews: V41ReviewItem[] = [];
  if (result.signals.atrSpring) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.VOLATILITY_EXPLOSION,
        'atr_spring',
        'ATR spring / expansion active',
        'ATR spring / expansion active',
      ),
    );
  }
  if (result.signals.volumeExpansion) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.VOLATILITY_EXPLOSION,
        'volume_expansion',
        'Volume expansion vs MA20',
        'Volume expansion vs MA20',
      ),
    );
  }
  if (result.signals.oiBuildup) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.VOLATILITY_EXPLOSION,
        'oi_buildup',
        'OI buildup',
        'OI buildup',
      ),
    );
  }
  if (result.signals.fundingPressure) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.VOLATILITY_EXPLOSION,
        'funding_pressure',
        'Funding pressure',
        'Funding pressure',
      ),
    );
  }
  if (result.signals.liquidationFuel) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.VOLATILITY_EXPLOSION,
        'liquidation_fuel',
        'Liquidation fuel near price',
        'Liquidation fuel near price',
      ),
    );
  }
  if (result.signals.btcSupport) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.VOLATILITY_EXPLOSION,
        'btc_support',
        'BTC context supportive',
        'BTC context supportive',
      ),
    );
  }

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.VOLATILITY_EXPLOSION,
    state: toFoundationVolatilityState(result.state),
    confidence: result.detail.readinessScore,
    strength: result.detail.readinessScore,
    reviews,
    metrics: {
      atrRatio: result.detail.atrRatio,
      atrRatioPrev: result.detail.atrRatioPrev,
      volumeRatio: result.detail.volumeRatio,
      oiDeltaPct: result.detail.oiDeltaPct,
      funding: result.detail.fundingRate,
      liquidationPressure: result.detail.liquidationPressureScore,
      readinessScore: result.detail.readinessScore,
      signalCount: result.detail.activeSignalCount,
      availableSignalCount: result.detail.availableSignalCount,
    },
    debug: {
      signals: { ...result.signals },
      raw: {
        legacyState: result.state,
        btcStrengthBand: result.detail.btcStrengthBand,
      },
    },
  });
}

export function adaptProtectionSnapshot(snapshot: ProtectionSnapshot) {
  const reviews: V41ReviewItem[] = [];
  if (snapshot.stopHuntDetected) {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.PROTECTION,
        'stop_hunt',
        'Stop hunt detected',
        'Stop hunt detected',
        snapshot.stopHuntRisk === 'HIGH' ? 'CRITICAL' : 'WARN',
      ),
    );
  }
  for (const [index, warning] of snapshot.protectionWarnings.entries()) {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.PROTECTION,
        `protection_${index}`,
        warning,
        warning,
        snapshot.volatilityRisk === 'EXTREME' ? 'CRITICAL' : 'WARN',
      ),
    );
  }

  const penalty = snapshot.protectionPenalty;
  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.PROTECTION,
    state: snapshot.volatilityRisk,
    confidence: 100 + penalty,
    strength:
      snapshot.volatilityRisk === 'EXTREME'
        ? 90
        : snapshot.volatilityRisk === 'HIGH'
          ? 70
          : 50,
    reviews,
    metrics: {
      atrRatio: snapshot.volatilityAtrPct != null ? snapshot.volatilityAtrPct / 100 : null,
      protectionPenalty: snapshot.protectionPenalty,
      stopHuntRiskScore:
        snapshot.stopHuntRisk === 'HIGH' ? 3 : snapshot.stopHuntRisk === 'MEDIUM' ? 2 : 1,
    },
    debug: {
      flags: { stopHuntDetected: snapshot.stopHuntDetected },
      raw: { stopHuntRisk: snapshot.stopHuntRisk },
    },
  });
}

export function adaptMomentumResult(result: MomentumResult) {
  const longScore = result.momentumLong;
  const shortScore = result.momentumShort;
  const dominant = longScore >= shortScore ? longScore : shortScore;
  const state = result.momentumConfirmedLong
    ? V41_MOMENTUM_FOUNDATION_STATE.LONG_CONFIRMED
    : result.momentumConfirmedShort
      ? V41_MOMENTUM_FOUNDATION_STATE.SHORT_CONFIRMED
      : V41_MOMENTUM_FOUNDATION_STATE.UNCONFIRMED;

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.MOMENTUM_1H,
    state,
    confidence: dominant * 50,
    strength: dominant * 50,
    reviews: [],
    metrics: {
      momentumLong: result.momentumLong,
      momentumShort: result.momentumShort,
      tpMultiplier: result.tpMultiplier,
      slMultiplier: result.slMultiplier,
    },
    debug: {
      raw: {
        signalsLong: result.signalsLong,
        signalsShort: result.signalsShort,
      },
    },
  });
}

export function adaptExhaustionResult(result: ExhaustionResult) {
  const reviews: V41ReviewItem[] = [];
  if (result.exhaustionDetected) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.EXHAUSTION,
        'exhaustion',
        `Exhaustion ${result.exhaustionType}`,
        `Exhaustion ${result.exhaustionType} direction ${result.direction}`,
      ),
    );
  }

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.EXHAUSTION,
    state: result.exhaustionDetected ? result.exhaustionType : 'NONE',
    confidence: result.exhaustionStrength,
    strength: result.exhaustionDetected ? result.exhaustionStrength : 0,
    reviews,
    metrics: {
      entryQuality: result.eqThreshold,
      marketConfidence: result.confThreshold,
      readinessScore: result.exhaustionStrength,
    },
    debug: {
      raw: {
        tpMultiplier: result.tpMultiplier,
        slMultiplier: result.slMultiplier,
        direction: result.direction,
      },
    },
  });
}

export function adaptEarlyWarningResult(
  result: EarlyWarningResult,
  severity: EarlyWarningSeverity = result.rawSeverity,
) {
  const reviews: V41ReviewItem[] = [];
  const level = warningLevelForSeverity(severity);
  if (result.warningMessage) {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.EARLY_WARNING,
        'warning_message',
        result.warningMessage,
        result.warningMessage,
        level,
      ),
    );
  }
  if (result.blockMessage) {
    reviews.push(
      createBlockReview(
        V41_ENGINE_ID.EARLY_WARNING,
        'block_message',
        result.blockMessage,
        result.blockMessage,
      ),
    );
  }

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.EARLY_WARNING,
    state: severity,
    confidence: severityToConfidence(severity),
    strength: result.signalCount * 20,
    reviews,
    metrics: {
      signalCount: result.signalCount,
      volumeConfirmed: result.volumeConfirmed ? 1 : 0,
    },
    debug: {
      raw: {
        rawSeverity: result.rawSeverity,
        signals30M: result.signals30M,
        signals1H: result.signals1H,
        direction: result.direction,
      },
    },
  });
}

export function adaptOpportunitySnapshot(snapshot: OpportunitySnapshot) {
  const reviews: V41ReviewItem[] = [
    createInfoReview(
      V41_ENGINE_ID.ENTRY_QUALITY,
      'opportunity_validity',
      snapshot.opportunityValid ? 'Opportunity valid' : 'Opportunity not valid',
      snapshot.opportunityValid ? 'Opportunity valid' : 'Opportunity not valid',
    ),
  ];

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.ENTRY_QUALITY,
    state: snapshot.qualityLabel,
    confidence: snapshot.entryQuality,
    strength: snapshot.opportunityValid ? snapshot.entryQuality : snapshot.entryQuality * 0.5,
    reviews,
    metrics: {
      entryQuality: snapshot.entryQuality,
      entryQualityLong: snapshot.entryQualityLong,
      entryQualityShort: snapshot.entryQualityShort,
      marketConfidence: snapshot.effectiveConfThreshold,
      eqThreshold: snapshot.eqThreshold,
      effectiveEqThreshold: snapshot.effectiveEqThreshold,
    },
    debug: {
      raw: {
        opportunityDirection: snapshot.opportunityDirection,
        confidenceTier: snapshot.confidenceTier,
        exhaustionDetected: snapshot.exhaustionDetected,
      },
    },
  });
}

export function adaptVisibilityResult(result: VisibilityResult) {
  const score = Math.max(result.buyScorePreliminary, result.sellScorePreliminary);
  const reviews: V41ReviewItem[] = result.visibilityReason
    ? [
        createInfoReview(
          V41_ENGINE_ID.VISIBILITY,
          'visibility_reason',
          result.visibilityReason,
          result.visibilityReason,
        ),
      ]
    : [];

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.VISIBILITY,
    state: result.visibilityMode,
    confidence: score * 5,
    strength: score * 5,
    reviews,
    metrics: {
      buyScorePreliminary: result.buyScorePreliminary,
      sellScorePreliminary: result.sellScorePreliminary,
    },
  });
}

export function adaptTrendReversalResult(
  result: TrendReversalResult | TrendReversalWithContextResult,
): ReturnType<typeof buildV41EngineResult<V41TrendReversalFoundationState>> {
  const reviews: V41ReviewItem[] = [];

  if (result.signals.cvdFlip) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'cvd_flip',
        'CVD flip confirmed on signal candle',
        'CVD flip confirmed on signal candle',
      ),
    );
  } else {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'cvd_flip_missing',
        'CVD flip not confirmed',
        'CVD flip not confirmed — need clear sign change on last 3 candles',
      ),
    );
  }

  if (result.signals.volumeConfirmation) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'volume_confirmation',
        `Volume ${result.detail.volumeRatio.toFixed(2)}× MA20`,
        `Volume ${result.detail.volumeRatio.toFixed(2)}× MA20`,
      ),
    );
  } else {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'volume_missing',
        'Volume below 1.2× MA20',
        'Volume below 1.2× MA20 on signal candle',
      ),
    );
  }

  if (result.signals.trendExhaustion) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'trend_exhaustion',
        `Trend exhaustion ${Math.round(result.detail.trendExhaustion)}`,
        `Trend exhaustion ${Math.round(result.detail.trendExhaustion)}`,
      ),
    );
  } else {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'exhaustion_missing',
        `Trend exhaustion ${Math.round(result.detail.trendExhaustion)} < ${TREND_REVERSAL_EXHAUSTION_MIN}`,
        `Trend exhaustion ${Math.round(result.detail.trendExhaustion)} < ${TREND_REVERSAL_EXHAUSTION_MIN}`,
      ),
    );
  }

  if (result.signals.structureBreak) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'structure_break',
        `Structure break ${result.detail.structureBreakType ?? ''}`.trim(),
        `Structure break ${result.detail.structureBreakType ?? ''}`.trim(),
      ),
    );
  } else {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'structure_missing',
        'Structure break not confirmed',
        'Structure break not confirmed — need HH→LH or LL→HL',
      ),
    );
  }

  if (
    result.state === 'WATCH' &&
    result.detail.confidence < TREND_REVERSAL_CONFIDENCE_MIN &&
    result.detail.activeConditionCount >= TREND_REVERSAL_ACTIVE_MIN_SIGNALS &&
    !('marketContext' in result && result.marketContext && !result.marketContext.pass)
  ) {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.TREND_REVERSAL,
        'confidence_low',
        `Confidence ${Math.round(result.detail.confidence)}% < ${TREND_REVERSAL_CONFIDENCE_MIN}%`,
        `Confidence ${Math.round(result.detail.confidence)}% < ${TREND_REVERSAL_CONFIDENCE_MIN}% — remain WATCH`,
      ),
    );
  }

  const marketContext =
    'marketContext' in result ? result.marketContext : undefined;

  if (marketContext?.applied) {
    const dims = marketContext.dimensions;
    for (const key of ['btc', 'funding', 'oi', 'whale', 'volatility'] as const) {
      const dim = dims[key];
      if (dim.skipped) continue;
      if (dim.pass) {
        reviews.push(
          createInfoReview(
            V41_ENGINE_ID.TREND_REVERSAL,
            `context_${dim.id}`,
            dim.title,
            dim.description,
          ),
        );
      } else {
        reviews.push(
          createWarningReview(
            V41_ENGINE_ID.TREND_REVERSAL,
            `context_${dim.id}_fail`,
            dim.title,
            dim.description,
            'WATCH',
          ),
        );
      }
    }

    if (
      'preContextState' in result &&
      result.preContextState === 'ACTIVE' &&
      result.state === 'WATCH' &&
      !marketContext.pass
    ) {
      reviews.push(
        createWarningReview(
          V41_ENGINE_ID.TREND_REVERSAL,
          'context_downgrade',
          'Market Context phủ định — hạ ACTIVE → WATCH',
          `Context fail: ${marketContext.failedDimensions.join(', ')}`,
          'WATCH',
        ),
      );
    }
  }

  const foundationState =
    result.state === 'ACTIVE'
      ? V41_TREND_REVERSAL_FOUNDATION_STATE.ACTIVE
      : V41_TREND_REVERSAL_FOUNDATION_STATE.WATCH;

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.TREND_REVERSAL,
    state: foundationState,
    confidence: result.detail.confidence,
    strength: result.detail.trendExhaustion,
    reviews,
    metrics: {
      trendExhaustion: result.detail.trendExhaustion,
      volumeRatio: result.detail.volumeRatio,
      signalCount: result.detail.activeConditionCount,
      reversalProbability: result.detail.confidence,
    },
    debug: {
      raw: {
        signals: result.signals,
        cvdLast3: result.detail.cvdLast3,
        structureBreakType: result.detail.structureBreakType,
        olderSwingPrice: result.detail.olderSwingPrice,
        newerSwingPrice: result.detail.newerSwingPrice,
        preContextState:
          'preContextState' in result ? result.preContextState : undefined,
        marketContext: marketContext
          ? {
              pass: marketContext.pass,
              failedDimensions: marketContext.failedDimensions,
            }
          : undefined,
      },
    },
  });
}

export function adaptMarketIntelligenceSnapshot(snapshot: MarketIntelligenceSnapshot) {
  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.MARKET_INTELLIGENCE,
    state: snapshot.marketState,
    confidence: snapshot.marketConfidence,
    strength: snapshot.trendStrength,
    reviews: [],
    metrics: {
      trendStrength: snapshot.trendStrength,
      trendExhaustion: snapshot.trendExhaustion,
      marketConfidence: snapshot.marketConfidence,
      reversalProbability: snapshot.reversalProbability,
      btcAlignment: snapshot.btcAlignmentFactor,
      volumeDivergencePts: snapshot.volumeDivergencePts,
      rsiDivergenceScore: snapshot.rsiDivergenceScore,
      cvdDivergenceScore: snapshot.cvdDivergenceScore,
    },
    debug: snapshot.detail ? { raw: { detail: snapshot.detail } } : undefined,
  });
}

/** @deprecated Use result.reviews directly — kept for transitional callers. */
export function engineResultToReviewItems(result: {
  engineId: import('./engineIds').V41EngineId;
  reviews: readonly V41ReviewItem[];
}): V41ReviewItem[] {
  return [...result.reviews];
}

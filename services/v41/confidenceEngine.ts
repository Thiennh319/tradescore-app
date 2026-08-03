/**
 * V4.1 Task 3 — Confidence Engine (Aggregation Layer).
 * Chỉ đọc kết quả Trend Reversal + Market Context → Final Confidence 0–100.
 * Không sinh LONG/SHORT, không quyết định WATCH/IGNORE (Task 4).
 */

import type { TrendReversalWithContextResult } from './marketContextFilter';
import type { TrendReversalSignals } from './reversalDetector';
import { V41_CONFIDENCE_CONFIG, type V41ConfidenceConfig } from './confidence/confidenceConfig';
import { buildConfidenceDecisionContext } from './confidence/decisionContext';
import { buildV41EngineResult, type V41EngineResult } from './foundation/engineResult';
import { V41_ENGINE_ID } from './foundation/engineIds';
import {
  createInfoReview,
  createWarningReview,
  type V41ReviewItem,
} from './foundation/reviewItem';
import { V41_CONFIDENCE_FOUNDATION_STATE } from './foundation/states';

export type ConfidenceContributionKind = 'add' | 'subtract' | 'neutral';

export interface ConfidenceContribution {
  id: string;
  layer: 'trend_reversal' | 'market_context' | 'data_completeness';
  kind: ConfidenceContributionKind;
  points: number;
  title: string;
  description: string;
}

export interface ConfidenceBreakdown {
  trendLayerScore: number;
  contextLayerScore: number;
  completenessMultiplier: number;
  finalConfidence: number;
  contributions: ConfidenceContribution[];
}

function clamp0100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function weightedAverage(
  entries: { weight: number; score: number }[],
): number {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return 0;
  const weighted = entries.reduce((sum, entry) => sum + entry.weight * entry.score, 0);
  return weighted / totalWeight;
}

function signalScore(confirmed: boolean, config: V41ConfidenceConfig): number {
  return confirmed ? config.pointValues.signalConfirmed : config.pointValues.signalFailed;
}

function dimensionScore(
  pass: boolean,
  skipped: boolean | undefined,
  config: V41ConfidenceConfig,
): number {
  if (skipped) return config.pointValues.dimensionSkipped;
  return pass ? config.pointValues.dimensionPass : config.pointValues.dimensionFail;
}

function computeTrendLayerScore(
  input: TrendReversalWithContextResult,
  config: V41ConfidenceConfig,
): { score: number; contributions: ConfidenceContribution[] } {
  const { signals, detail } = input;
  const weights = config.trendReversalSignalWeights;
  const layerWeight = config.layerWeights.trendReversal;
  const contributions: ConfidenceContribution[] = [];

  const signalEntries: { key: keyof TrendReversalSignals; label: string }[] = [
    { key: 'cvdFlip', label: 'CVD flip' },
    { key: 'volumeConfirmation', label: 'Volume confirmation' },
    { key: 'trendExhaustion', label: 'Trend exhaustion' },
    { key: 'structureBreak', label: 'Structure break' },
  ];

  const weightedSignals = signalEntries.map(({ key, label }) => {
    const confirmed = signals[key];
    const score = signalScore(confirmed, config);
    const weight = weights[key];
    const points = weight * layerWeight * (score / 100) * 100;
    contributions.push({
      id: `trend_${key}`,
      layer: 'trend_reversal',
      kind: confirmed ? 'add' : 'subtract',
      points: Math.round(points * 10) / 10,
      title: confirmed ? `+${label} xác nhận` : `−${label} thiếu`,
      description: confirmed
        ? `+${points.toFixed(1)} điểm — ${label} đạt`
        : `−${(weight * layerWeight * 100).toFixed(1)} điểm tối đa bị mất — ${label} chưa đạt`,
    });
    return { weight, score };
  });

  const signalAggregate = weightedAverage(weightedSignals);
  const blend = config.pointValues.trendInternalConfidenceBlend;
  const score = signalAggregate * (1 - blend) + detail.confidence * blend;

  contributions.push({
    id: 'trend_internal_blend',
    layer: 'trend_reversal',
    kind: detail.confidence >= 50 ? 'add' : 'neutral',
    points: Math.round(detail.confidence * blend * layerWeight * 10) / 10,
    title: `Trend confidence nội bộ ${Math.round(detail.confidence)}%`,
    description: `Pha ${(blend * 100).toFixed(0)}% confidence Task 2 vào lớp trend`,
  });

  return { score: clamp0100(score), contributions };
}

function computeContextLayerScore(
  input: TrendReversalWithContextResult,
  config: V41ConfidenceConfig,
): {
  score: number;
  contributions: ConfidenceContribution[];
  skippedCount: number;
  contextApplied: boolean;
} {
  const layerWeight = config.layerWeights.marketContext;
  const contributions: ConfidenceContribution[] = [];
  const ctx = input.marketContext;

  if (!ctx?.applied) {
    const score = config.pointValues.contextNotAppliedScore;
    contributions.push({
      id: 'context_not_applied',
      layer: 'market_context',
      kind: 'neutral',
      points: Math.round(score * layerWeight * 10) / 10,
      title: 'Market Context chưa áp dụng',
      description: `Điểm lớp context = ${score} — trend chưa ACTIVE nên filter chưa chạy`,
    });
    return {
      score,
      contributions,
      skippedCount: 5,
      contextApplied: false,
    };
  }

  const dims = ctx.dimensions;
  const dimKeys = ['btc', 'funding', 'oi', 'whale', 'volatility'] as const;
  let skippedCount = 0;

  const weighted = dimKeys.map((key) => {
    const dim = dims[key];
    const skipped = dim.skipped === true;
    if (skipped) skippedCount += 1;
    const score = dimensionScore(dim.pass, skipped, config);
    const weight = config.marketContextDimensionWeights[key];
    const points = weight * layerWeight * (score / 100) * 100;

    let kind: ConfidenceContributionKind = 'neutral';
    if (!skipped && dim.pass) kind = 'add';
    else if (!skipped && !dim.pass) kind = 'subtract';

    contributions.push({
      id: `context_${key}`,
      layer: 'market_context',
      kind,
      points: Math.round(points * 10) / 10,
      title: skipped
        ? `○ ${dim.title}`
        : dim.pass
          ? `+${dim.title}`
          : `−${dim.title}`,
      description: skipped
        ? `Trung lực — thiếu dữ liệu ${key}, điểm = ${config.pointValues.dimensionSkipped}`
        : dim.pass
          ? `+${points.toFixed(1)} điểm — ${dim.description}`
          : `−${(weight * layerWeight * 100).toFixed(1)} điểm tối đa bị mất — ${dim.description}`,
    });

    return { weight, score };
  });

  return {
    score: clamp0100(weightedAverage(weighted)),
    contributions,
    skippedCount,
    contextApplied: true,
  };
}

function computeCompletenessMultiplier(
  skippedCount: number,
  contextApplied: boolean,
  config: V41ConfidenceConfig,
): { multiplier: number; contributions: ConfidenceContribution[] } {
  const contributions: ConfidenceContribution[] = [];
  let penaltyPct =
    skippedCount * config.dataCompleteness.skippedDimensionPenaltyPct;

  if (!contextApplied) {
    penaltyPct += config.dataCompleteness.contextNotAppliedPenaltyPct;
  }

  const multiplier = clamp0100(
    100 - penaltyPct,
  ) / 100;

  const finalMultiplier = Math.max(
    config.dataCompleteness.minCompletenessMultiplier,
    multiplier,
  );

  if (penaltyPct > 0) {
    contributions.push({
      id: 'data_completeness_penalty',
      layer: 'data_completeness',
      kind: 'subtract',
      points: -Math.round(penaltyPct * 10) / 10,
      title: `−Thiếu dữ liệu (−${penaltyPct}% completeness)`,
      description: `Multiplier ${finalMultiplier.toFixed(2)} — không suy đoán khi thiếu input`,
    });
  } else {
    contributions.push({
      id: 'data_completeness_full',
      layer: 'data_completeness',
      kind: 'add',
      points: 0,
      title: 'Dữ liệu đầy đủ',
      description: 'Không phạt completeness',
    });
  }

  return { multiplier: finalMultiplier, contributions };
}

/** Tính breakdown — dùng cho test và debug. */
export function computeConfidenceBreakdown(
  input: TrendReversalWithContextResult,
  config: V41ConfidenceConfig = V41_CONFIDENCE_CONFIG,
): ConfidenceBreakdown {
  const trend = computeTrendLayerScore(input, config);
  const context = computeContextLayerScore(input, config);
  const completeness = computeCompletenessMultiplier(
    context.skippedCount,
    context.contextApplied,
    config,
  );

  const layerBlend =
    trend.score * config.layerWeights.trendReversal +
    context.score * config.layerWeights.marketContext;

  const finalConfidence = clamp0100(layerBlend * completeness.multiplier);

  return {
    trendLayerScore: trend.score,
    contextLayerScore: context.score,
    completenessMultiplier: completeness.multiplier,
    finalConfidence,
    contributions: [
      ...trend.contributions,
      ...context.contributions,
      ...completeness.contributions,
    ],
  };
}

function contributionsToReviews(contributions: ConfidenceContribution[]): V41ReviewItem[] {
  return contributions.map((item) => {
    if (item.kind === 'add') {
      return createInfoReview(
        V41_ENGINE_ID.CONFIDENCE,
        item.id,
        item.title,
        item.description,
      );
    }
    if (item.kind === 'subtract') {
      return createWarningReview(
        V41_ENGINE_ID.CONFIDENCE,
        item.id,
        item.title,
        item.description,
        'WARN',
      );
    }
    return createWarningReview(
      V41_ENGINE_ID.CONFIDENCE,
      item.id,
      item.title,
      item.description,
      'WATCH',
    );
  });
}

/**
 * Aggregation layer — trả V41EngineResult trực tiếp (không qua adapter).
 * State = Scored — không quyết định LONG/SHORT/WATCH/IGNORE.
 */
export function computeConfidenceEngineResult(
  input: TrendReversalWithContextResult,
  config: V41ConfidenceConfig = V41_CONFIDENCE_CONFIG,
): V41EngineResult<typeof V41_CONFIDENCE_FOUNDATION_STATE.SCORED> {
  const breakdown = computeConfidenceBreakdown(input, config);
  const decisionContext = buildConfidenceDecisionContext(input, breakdown);
  const reviews = contributionsToReviews(breakdown.contributions);

  reviews.push(
    createInfoReview(
      V41_ENGINE_ID.CONFIDENCE,
      'final_confidence',
      `Final Confidence ${Math.round(breakdown.finalConfidence)}%`,
      `Trend layer ${breakdown.trendLayerScore.toFixed(1)} · Context layer ${breakdown.contextLayerScore.toFixed(1)} · Completeness ×${breakdown.completenessMultiplier.toFixed(2)}`,
    ),
  );

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.CONFIDENCE,
    state: V41_CONFIDENCE_FOUNDATION_STATE.SCORED,
    confidence: breakdown.finalConfidence,
    strength: breakdown.finalConfidence,
    reviews,
    metrics: {
      trendExhaustion: input.detail.trendExhaustion,
      volumeRatio: input.detail.volumeRatio,
      signalCount: input.detail.activeConditionCount,
      reversalProbability: input.detail.confidence,
      marketConfidence: breakdown.finalConfidence,
      readinessScore: breakdown.trendLayerScore,
      btcAlignment: breakdown.contextLayerScore,
    },
    debug: {
      raw: {
        breakdown,
        decisionContext,
        trendState: input.state,
        preContextState: 'preContextState' in input ? input.preContextState : undefined,
        marketContextPass: input.marketContext?.pass,
      },
    },
  });
}

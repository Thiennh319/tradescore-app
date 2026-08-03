/**
 * V4.1 Task 4 — Decision Engine (Decision Layer).
 * Chỉ đọc V41EngineResult từ Confidence Engine — không indicator, không cộng/trừ điểm.
 */

import {
  readConfidenceDecisionContext,
  type ConfidenceDecisionContext,
  type ProposedTradeDirection,
} from './confidence/decisionContext';
import { V41_DECISION_CONFIG, type V41DecisionConfig } from './decision/decisionConfig';
import { buildV41EngineResult, type V41EngineResult } from './foundation/engineResult';
import { V41_ENGINE_ID } from './foundation/engineIds';
import {
  createBlockReview,
  createInfoReview,
  createWarningReview,
  type V41ReviewItem,
} from './foundation/reviewItem';
import { V41_DECISION_FOUNDATION_STATE, type V41DecisionFoundationState } from './foundation/states';

export type V41DecisionState = V41DecisionFoundationState;

export interface DecisionEvaluation {
  decision: V41DecisionState;
  confidence: number;
  strength: number;
  reasons: string[];
  warnings: string[];
}

function isIgnoreCase(
  confidence: number,
  ctx: ConfidenceDecisionContext,
  config: V41DecisionConfig,
): boolean {
  if (config.ignorePolicy.neutralTrendDirection && ctx.altTrendDirection === 'NEUTRAL') {
    return true;
  }
  if (config.ignorePolicy.zeroTrendSignals && ctx.trendSignalCount === 0) {
    return true;
  }
  if (ctx.dataInsufficient) {
    return true;
  }
  if (ctx.completenessMultiplier < config.ignorePolicy.minCompletenessMultiplier) {
    return true;
  }
  if (confidence < config.thresholds.ignore) {
    return true;
  }
  return false;
}

/** Pure eligibility check — no side effects; safe to call from Rulebook Builder. */
export function isEligibleForDirection(
  ctx: ConfidenceDecisionContext,
  config: V41DecisionConfig,
): boolean {
  if (
    config.eligibility.requireTrendReversalConfirmed &&
    !ctx.trendReversalConfirmed
  ) {
    return false;
  }
  if (
    config.eligibility.requireMarketContextPass &&
    ctx.marketContextDenied
  ) {
    return false;
  }
  if (ctx.marketContextApplied && ctx.marketContextPass === false) {
    return false;
  }
  if (
    ctx.completenessMultiplier < config.eligibility.minCompletenessMultiplier
  ) {
    return false;
  }
  // Không check trendSignalCount vs requiredTrendSignalCount — TR ACTIVE
  // (trendReversalConfirmed) đã đủ; count≥4 là double-gate thừa.
  if (ctx.hardBlocks.length > 0) {
    return false;
  }
  return true;
}

function meetsDirectionThreshold(
  proposed: ProposedTradeDirection,
  direction: 'LONG' | 'SHORT',
  confidence: number,
  config: V41DecisionConfig,
): boolean {
  if (proposed !== direction) return false;
  const threshold =
    direction === 'LONG' ? config.thresholds.long : config.thresholds.short;
  return confidence >= threshold;
}

/** Đánh giá decision — không mutate confidence, không cộng/trừ điểm. */
export function evaluateDecision(
  confidenceResult: V41EngineResult,
  config: V41DecisionConfig = V41_DECISION_CONFIG,
): DecisionEvaluation {
  const confidence = confidenceResult.confidence;
  const strength = confidenceResult.strength;
  const ctx = readConfidenceDecisionContext(confidenceResult);
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!ctx) {
    return {
      decision: V41_DECISION_FOUNDATION_STATE.IGNORE,
      confidence,
      strength,
      reasons: ['Thiếu decisionContext từ Confidence Engine — không đủ điều kiện đánh giá'],
      warnings: [],
    };
  }

  if (isIgnoreCase(confidence, ctx, config)) {
    if (ctx.altTrendDirection === 'NEUTRAL') {
      reasons.push('Market không rõ xu hướng (NEUTRAL) — không đủ điều kiện đánh giá');
    } else if (ctx.dataInsufficient || ctx.trendSignalCount === 0) {
      reasons.push('Dữ liệu thiếu — không đủ điều kiện đánh giá');
    } else if (confidence < config.thresholds.ignore) {
      reasons.push(`Confidence ${Math.round(confidence)}% quá thấp (< ${config.thresholds.ignore}%)`);
    } else {
      reasons.push('Completeness quá thấp — không đủ điều kiện đánh giá');
    }
    return {
      decision: V41_DECISION_FOUNDATION_STATE.IGNORE,
      confidence,
      strength,
      reasons,
      warnings,
    };
  }

  const hasHardBlock = ctx.hardBlocks.length > 0;
  if (hasHardBlock && config.hardBlockPolicy.downgradeToWatch) {
    for (const code of ctx.hardBlocks) {
      const label =
        config.hardBlockPolicy.blockCodes[
          code as keyof typeof config.hardBlockPolicy.blockCodes
        ] ?? code;
      warnings.push(`Hard block: ${label}`);
    }
  }

  const eligible = isEligibleForDirection(ctx, config);

  if (
    eligible &&
    meetsDirectionThreshold(ctx.proposedDirection, 'LONG', confidence, config)
  ) {
    reasons.push(`Đủ điều kiện kích hoạt LONG — Confidence ${Math.round(confidence)}%`);
    reasons.push(`Trend Reversal xác nhận (${ctx.trendSignalCount}/4 tín hiệu)`);
    if (ctx.marketContextPass === true) {
      reasons.push('Market Context đồng thuận');
    }
    return {
      decision: V41_DECISION_FOUNDATION_STATE.LONG,
      confidence,
      strength,
      reasons,
      warnings,
    };
  }

  if (
    eligible &&
    meetsDirectionThreshold(ctx.proposedDirection, 'SHORT', confidence, config)
  ) {
    reasons.push(`Đủ điều kiện kích hoạt SHORT — Confidence ${Math.round(confidence)}%`);
    reasons.push(`Trend Reversal xác nhận (${ctx.trendSignalCount}/4 tín hiệu)`);
    if (ctx.marketContextPass === true) {
      reasons.push('Market Context đồng thuận');
    }
    return {
      decision: V41_DECISION_FOUNDATION_STATE.SHORT,
      confidence,
      strength,
      reasons,
      warnings,
    };
  }

  if (hasHardBlock && config.hardBlockPolicy.downgradeToWatch) {
    reasons.push('Có tín hiệu nhưng Hard Block — chưa đủ mạnh để giao dịch');
    return {
      decision: V41_DECISION_FOUNDATION_STATE.WATCH,
      confidence,
      strength,
      reasons,
      warnings,
    };
  }

  if (confidence >= config.thresholds.watch) {
    if (!ctx.trendReversalConfirmed) {
      warnings.push('Trend Reversal chưa xác nhận đủ 4 điều kiện');
    }
    if (ctx.marketContextDenied) {
      warnings.push('Market Context phủ định tín hiệu');
    }
    if (confidence < config.thresholds.long) {
      warnings.push(
        `Confidence ${Math.round(confidence)}% chưa đạt ngưỡng kích hoạt (${config.thresholds.long}%)`,
      );
    }
    reasons.push('Có tín hiệu nhưng chưa đủ mạnh để giao dịch');
    return {
      decision: V41_DECISION_FOUNDATION_STATE.WATCH,
      confidence,
      strength,
      reasons,
      warnings,
    };
  }

  reasons.push(`Confidence ${Math.round(confidence)}% dưới ngưỡng WATCH (${config.thresholds.watch}%)`);
  return {
    decision: V41_DECISION_FOUNDATION_STATE.IGNORE,
    confidence,
    strength,
    reasons,
    warnings,
  };
}

function forwardConfidenceReviews(
  confidenceResult: V41EngineResult,
  maxItems: number,
): V41ReviewItem[] {
  return confidenceResult.reviews.slice(0, maxItems).map((review) => ({
    ...review,
    id: `decision:forward:${review.id}`,
    source: V41_ENGINE_ID.DECISION,
    title: review.title.startsWith('+') || review.title.startsWith('−') || review.title.startsWith('○')
      ? review.title
      : `↳ ${review.title}`,
  }));
}

function buildDecisionReviews(
  evaluation: DecisionEvaluation,
  confidenceResult: V41EngineResult,
): V41ReviewItem[] {
  const reviews: V41ReviewItem[] = [];

  const decisionTitle: Record<V41DecisionState, string> = {
    [V41_DECISION_FOUNDATION_STATE.LONG]: '✓ Quyết định: LONG',
    [V41_DECISION_FOUNDATION_STATE.SHORT]: '✓ Quyết định: SHORT',
    [V41_DECISION_FOUNDATION_STATE.WATCH]: '⚠ Quyết định: WATCH',
    [V41_DECISION_FOUNDATION_STATE.IGNORE]: '○ Quyết định: IGNORE',
  };

  reviews.push(
    createInfoReview(
      V41_ENGINE_ID.DECISION,
      'decision_outcome',
      decisionTitle[evaluation.decision],
      evaluation.reasons.join(' · '),
    ),
  );

  reviews.push(
    createInfoReview(
      V41_ENGINE_ID.DECISION,
      'decision_confidence',
      `✓ Confidence ${Math.round(evaluation.confidence)}%`,
      `Strength ${Math.round(evaluation.strength)}% — đọc từ Confidence Engine`,
    ),
  );

  for (const reason of evaluation.reasons) {
    if (reason.includes('LONG') || reason.includes('SHORT') || reason.includes('Market Context')) {
      reviews.push(
        createInfoReview(
          V41_ENGINE_ID.DECISION,
          `reason_${reviews.length}`,
          `✓ ${reason}`,
          reason,
        ),
      );
    }
  }

  for (const warning of evaluation.warnings) {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.DECISION,
        `warning_${reviews.length}`,
        `⚠ ${warning}`,
        warning,
        'WATCH',
      ),
    );
  }

  reviews.push(...forwardConfidenceReviews(confidenceResult, 6));

  if (evaluation.decision === V41_DECISION_FOUNDATION_STATE.IGNORE) {
    reviews.push(
      createBlockReview(
        V41_ENGINE_ID.DECISION,
        'decision_ignore',
        '○ Không đủ điều kiện đánh giá',
        evaluation.reasons[0] ?? 'IGNORE',
      ),
    );
  }

  return reviews;
}

/** Decision layer — trả V41EngineResult (không adapter, không entry/SL/TP). */
export function computeDecisionEngineResult(
  confidenceResult: V41EngineResult,
  config: V41DecisionConfig = V41_DECISION_CONFIG,
): V41EngineResult<V41DecisionState> {
  const evaluation = evaluateDecision(confidenceResult, config);
  const reviews = buildDecisionReviews(evaluation, confidenceResult);
  const ctx = readConfidenceDecisionContext(confidenceResult);

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.DECISION,
    state: evaluation.decision,
    confidence: evaluation.confidence,
    strength: evaluation.strength,
    reviews,
    metrics: {
      marketConfidence: evaluation.confidence,
      signalCount: ctx?.trendSignalCount ?? null,
      readinessScore: ctx?.completenessMultiplier != null
        ? ctx.completenessMultiplier * 100
        : null,
    },
    debug: {
      raw: {
        evaluation,
        decisionContext: ctx,
        sourceConfidenceEngineId: confidenceResult.engineId,
      },
    },
  });
}

/**
 * V4.1 Task 5 — Position Adviser Explain Layer.
 * Chỉ đọc Decision Engine output — không indicator, không confidence, không market data.
 * Không thay đổi Decision.
 */

import type { DecisionEvaluation } from '../decisionEngine';
import { V41_ADVISER_EXPLAIN_CONFIG, type V41AdviserExplainConfig } from './positionAdviser/adviserExplainConfig';
import { buildV41EngineResult, type V41EngineResult } from './foundation/engineResult';
import { V41_ENGINE_ID } from './foundation/engineIds';
import {
  createBlockReview,
  createInfoReview,
  createWarningReview,
  type V41ReviewItem,
} from './foundation/reviewItem';
import {
  V41_DECISION_FOUNDATION_STATE,
  type V41DecisionFoundationState,
} from './foundation/states';

export interface PositionAdviserExplainSummary {
  decision: V41DecisionFoundationState;
  advisorSummary: string;
  reasonsSupporting: string[];
  warningFactors: string[];
  nextAction: string;
  assessment: string;
  confidence: number;
  strength: number;
}

function isDecisionState(state: string): state is V41DecisionFoundationState {
  return (
    state === V41_DECISION_FOUNDATION_STATE.LONG ||
    state === V41_DECISION_FOUNDATION_STATE.SHORT ||
    state === V41_DECISION_FOUNDATION_STATE.WATCH ||
    state === V41_DECISION_FOUNDATION_STATE.IGNORE
  );
}

/** Đọc evaluation từ Decision envelope — không gọi engine khác. */
export function readDecisionEvaluationFromResult(
  decisionResult: V41EngineResult,
): DecisionEvaluation | null {
  const raw = decisionResult.debug?.raw;
  if (raw && typeof raw === 'object' && 'evaluation' in raw) {
    const evaluation = raw.evaluation as DecisionEvaluation;
    if (evaluation && typeof evaluation.decision === 'string') {
      return evaluation;
    }
  }

  if (!isDecisionState(decisionResult.state)) {
    return null;
  }

  const reasons: string[] = [];
  const warnings: string[] = [];

  for (const review of decisionResult.reviews) {
    const title = review.title.trim();
    if (review.level === 'INFO' && title.startsWith('✓')) {
      reasons.push(title.replace(/^✓\s*/, ''));
    } else if (
      (review.level === 'WARN' || review.level === 'WATCH') &&
      title.startsWith('⚠')
    ) {
      warnings.push(title.replace(/^⚠\s*/, ''));
    } else if (review.level === 'BLOCK') {
      warnings.push(title.replace(/^○\s*/, ''));
    }
  }

  return {
    decision: decisionResult.state,
    confidence: decisionResult.confidence,
    strength: decisionResult.strength,
    reasons,
    warnings,
  };
}

function normalizeSupportingReason(text: string): string {
  const cleaned = text
    .replace(/^↳\s*/, '')
    .replace(/^✓\s*/, '')
    .replace(/^−\s*/, '')
  .trim();
  if (cleaned.startsWith('+')) {
    return cleaned.replace(/^\+\s*/, '✓ ');
  }
  if (!cleaned.startsWith('✓')) {
    return `${V41_ADVISER_EXPLAIN_CONFIG.reasonPrefixes.supporting} ${cleaned}`;
  }
  return cleaned;
}

function normalizeWarning(text: string): string {
  const cleaned = text.replace(/^⚠\s*/, '').trim();
  return `${V41_ADVISER_EXPLAIN_CONFIG.reasonPrefixes.warning} ${cleaned}`;
}

function collectSupportingReasons(
  decisionResult: V41EngineResult,
  evaluation: DecisionEvaluation,
): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  const add = (text: string) => {
    const normalized = normalizeSupportingReason(text);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      items.push(normalized);
    }
  };

  for (const reason of evaluation.reasons) {
    add(reason);
  }

  for (const review of decisionResult.reviews) {
    if (review.level !== 'INFO') continue;
    const title = review.title.trim();
    if (
      title.startsWith('+') ||
      title.startsWith('↳ +') ||
      title.includes('xác nhận') ||
      title.includes('đồng thuận') ||
      title.includes('Trend Reversal') ||
      title.includes('Market Context')
    ) {
      add(title);
    }
  }

  return items;
}

function collectWarningFactors(
  decisionResult: V41EngineResult,
  evaluation: DecisionEvaluation,
): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  const add = (text: string) => {
    const normalized = normalizeWarning(text);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      items.push(normalized);
    }
  };

  for (const warning of evaluation.warnings) {
    add(warning);
  }

  for (const review of decisionResult.reviews) {
    if (review.level === 'WARN' || review.level === 'WATCH') {
      add(review.title);
    }
  }

  return items;
}

function buildAdvisorSummaryText(
  evaluation: DecisionEvaluation,
  config: V41AdviserExplainConfig,
): string {
  const headline = config.decisionHeadline[evaluation.decision];
  const intro = config.summaryIntro[evaluation.decision];
  const confLine = `${config.sectionLabels.confidence}: ${Math.round(evaluation.confidence)}%`;
  const strengthLine = `${config.sectionLabels.strength}: ${Math.round(evaluation.strength)}%`;
  return [headline, confLine, strengthLine, intro].join('\n');
}

/** Giải thích Decision — không mutate decision/confidence. */
export function explainPositionFromDecision(
  decisionResult: V41EngineResult,
  config: V41AdviserExplainConfig = V41_ADVISER_EXPLAIN_CONFIG,
): PositionAdviserExplainSummary | null {
  const evaluation = readDecisionEvaluationFromResult(decisionResult);
  if (!evaluation) return null;

  return {
    decision: evaluation.decision,
    advisorSummary: buildAdvisorSummaryText(evaluation, config),
    reasonsSupporting: collectSupportingReasons(decisionResult, evaluation),
    warningFactors: collectWarningFactors(decisionResult, evaluation),
    nextAction: config.nextAction[evaluation.decision],
    assessment: config.assessment[evaluation.decision],
    confidence: evaluation.confidence,
    strength: evaluation.strength,
  };
}

function buildAdviserReviews(
  summary: PositionAdviserExplainSummary,
  config: V41AdviserExplainConfig,
): V41ReviewItem[] {
  const reviews: V41ReviewItem[] = [];

  reviews.push(
    createInfoReview(
      V41_ENGINE_ID.POSITION_ADVISOR,
      'advisor_summary',
      summary.advisorSummary.split('\n')[0] ?? summary.decision,
      summary.advisorSummary,
    ),
  );

  reviews.push(
    createInfoReview(
      V41_ENGINE_ID.POSITION_ADVISOR,
      'advisor_assessment',
      config.sectionLabels.assessment,
      summary.assessment,
    ),
  );

  for (const [index, reason] of summary.reasonsSupporting.entries()) {
    reviews.push(
      createInfoReview(
        V41_ENGINE_ID.POSITION_ADVISOR,
        `supporting_reason_${index}`,
        reason,
        `${config.sectionLabels.reasons}: ${reason}`,
      ),
    );
  }

  for (const [index, warning] of summary.warningFactors.entries()) {
    reviews.push(
      createWarningReview(
        V41_ENGINE_ID.POSITION_ADVISOR,
        `warning_factor_${index}`,
        warning,
        `${config.sectionLabels.warnings}: ${warning}`,
        'WATCH',
      ),
    );
  }

  reviews.push(
    createInfoReview(
      V41_ENGINE_ID.POSITION_ADVISOR,
      'next_action',
      config.sectionLabels.nextAction,
      summary.nextAction,
    ),
  );

  if (summary.decision === V41_DECISION_FOUNDATION_STATE.IGNORE) {
    reviews.push(
      createBlockReview(
        V41_ENGINE_ID.POSITION_ADVISOR,
        'advisor_no_trade',
        summary.nextAction,
        summary.assessment,
      ),
    );
  }

  return reviews;
}

/**
 * Position Adviser Explain — trả V41EngineResult cho UL Review.
 * State mirror Decision (read-only). Không wire UI.
 */
export function computePositionAdviserExplainResult(
  decisionResult: V41EngineResult,
  config: V41AdviserExplainConfig = V41_ADVISER_EXPLAIN_CONFIG,
): V41EngineResult<V41DecisionFoundationState> {
  const summary = explainPositionFromDecision(decisionResult, config);

  if (!summary) {
    const fallbackState = V41_DECISION_FOUNDATION_STATE.IGNORE;
    return buildV41EngineResult({
      engineId: V41_ENGINE_ID.POSITION_ADVISOR,
      state: fallbackState,
      confidence: decisionResult.confidence,
      strength: decisionResult.strength,
      reviews: [
        createBlockReview(
          V41_ENGINE_ID.POSITION_ADVISOR,
          'invalid_decision_input',
          'Không đọc được Decision Engine output',
          'Thiếu evaluation hợp lệ — không sinh khuyến nghị',
        ),
      ],
      metrics: { marketConfidence: decisionResult.confidence },
    });
  }

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.POSITION_ADVISOR,
    state: summary.decision,
    confidence: summary.confidence,
    strength: summary.strength,
    reviews: buildAdviserReviews(summary, config),
    metrics: {
      marketConfidence: summary.confidence,
      signalCount: decisionResult.metrics?.signalCount ?? null,
    },
    debug: {
      raw: {
        explainSummary: summary,
        sourceDecisionEngineId: decisionResult.engineId,
        sourceDecisionState: decisionResult.state,
      },
    },
  });
}

/**
 * V4.1 Task 6 — Trade Execution Planner.
 * Chỉ đọc Decision + Position Adviser envelopes — không indicator, không đổi decision.
 */

import type { V41EngineResult } from './foundation/engineResult';
import { buildV41EngineResult } from './foundation/engineResult';
import { V41_ENGINE_ID } from './foundation/engineIds';
import {
  createInfoReview,
  createWarningReview,
  type V41ReviewItem,
} from './foundation/reviewItem';
import {
  V41_DECISION_FOUNDATION_STATE,
  type V41DecisionFoundationState,
} from './foundation/states';
import type { PositionAdviserExplainSummary } from './positionAdviserExplainV41';
import { readDecisionEvaluationFromResult } from './positionAdviserExplainV41';
import {
  V41_TRADE_EXECUTION_CONFIG,
  type V41TradeExecutionConfig,
} from './tradeExecution/tradeExecutionConfig';

export type TradeEntryType = 'MARKET' | 'LIMIT';

export type TradeRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TradeEntryPlan {
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  entryType: TradeEntryType;
  entryReason: string;
}

export interface TradeStopLossPlan {
  stopLoss: number;
  stopDistance: number;
  stopDistancePct: number;
  stopReason: string;
}

export interface TradeTakeProfitPlan {
  tp1: number;
  tp2: number;
  tp3: number;
  rewardRiskTp1: number;
  rewardRiskTp2: number;
  rewardRiskTp3: number;
  tpReason: string;
}

export interface TradeRiskSummary {
  riskLevel: TradeRiskLevel;
  rewardRisk: number;
  positionSizeRecommendationPct: number;
}

export interface TradeExecutionPlanPayload {
  direction: 'LONG' | 'SHORT';
  entry: TradeEntryPlan;
  stopLoss: TradeStopLossPlan;
  takeProfit: TradeTakeProfitPlan;
  riskSummary: TradeRiskSummary;
}

export interface TradeExecutionWatchPayload {
  watchMessage: string;
}

export interface TradeExecutionPlannerParams {
  decisionResult: V41EngineResult;
  adviserResult: V41EngineResult;
}

function isTradableDecision(state: string): state is 'LONG' | 'SHORT' {
  return state === V41_DECISION_FOUNDATION_STATE.LONG || state === V41_DECISION_FOUNDATION_STATE.SHORT;
}

function readMarkPrice(
  decisionResult: V41EngineResult,
  adviserResult: V41EngineResult,
  config: V41TradeExecutionConfig,
): number | null {
  const key = config.metricsKeys.markPrice;
  const fromAdviser = adviserResult.metrics?.[key];
  const fromDecision = decisionResult.metrics?.[key];
  const value = fromAdviser ?? fromDecision;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function readStructureStopPrice(
  decisionResult: V41EngineResult,
  adviserResult: V41EngineResult,
  config: V41TradeExecutionConfig,
): number | null {
  const key = config.metricsKeys.structureStopPrice;
  const value =
    adviserResult.metrics?.[key] ?? decisionResult.metrics?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function readAdviserSummary(
  adviserResult: V41EngineResult,
): PositionAdviserExplainSummary | null {
  const raw = adviserResult.debug?.raw;
  if (raw && typeof raw === 'object' && 'explainSummary' in raw) {
    return raw.explainSummary as PositionAdviserExplainSummary;
  }
  return null;
}

function resolveRiskLevel(
  confidence: number,
  config: V41TradeExecutionConfig,
): TradeRiskLevel {
  if (confidence >= config.risk.lowConfidenceMin) return 'LOW';
  if (confidence >= config.risk.mediumConfidenceMin) return 'MEDIUM';
  return 'HIGH';
}

function resolvePositionSizePct(
  riskLevel: TradeRiskLevel,
  config: V41TradeExecutionConfig,
): number {
  if (riskLevel === 'LOW') return config.risk.lowRiskSizePct;
  if (riskLevel === 'MEDIUM') return config.risk.mediumRiskSizePct;
  return config.risk.highRiskSizePct;
}

function buildEntryPlan(
  direction: 'LONG' | 'SHORT',
  markPrice: number,
  confidence: number,
  adviserSummary: PositionAdviserExplainSummary | null,
  config: V41TradeExecutionConfig,
): TradeEntryPlan {
  const buffer = config.entry.zoneBufferPct / 100;
  const zoneLow = direction === 'LONG' ? markPrice * (1 - buffer) : markPrice * (1 - buffer);
  const zoneHigh = direction === 'LONG' ? markPrice * (1 + buffer) : markPrice * (1 + buffer);
  const entryType: TradeEntryType =
    confidence >= config.entry.limitConfidenceMin ? 'LIMIT' : 'MARKET';

  const adviserHint = adviserSummary?.nextAction ?? 'theo Decision Engine';
  const entryReason =
    direction === 'LONG'
      ? `Entry LONG tại vùng quanh ${markPrice.toFixed(4)} — ${adviserHint}. ` +
        `Giới hạn vùng ±${config.entry.zoneBufferPct}% vì khuyến nghị Position Adviser đã xác nhận hướng LONG.`
      : `Entry SHORT tại vùng quanh ${markPrice.toFixed(4)} — ${adviserHint}. ` +
        `Giới hạn vùng ±${config.entry.zoneBufferPct}% vì khuyến nghị Position Adviser đã xác nhận hướng SHORT.`;

  return {
    entryPrice: markPrice,
    entryZoneLow: zoneLow,
    entryZoneHigh: zoneHigh,
    entryType,
    entryReason,
  };
}

function buildStopLossPlan(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  structureStopPrice: number | null,
  adviserSummary: PositionAdviserExplainSummary | null,
  config: V41TradeExecutionConfig,
): TradeStopLossPlan {
  const defaultDist = (entryPrice * config.stopLoss.defaultDistancePct) / 100;
  const maxDist = (entryPrice * config.stopLoss.maxStopDistancePct) / 100;
  const structBuffer = config.stopLoss.structureBufferPct / 100;

  let stopLoss: number;
  let stopReason: string;

  if (direction === 'LONG') {
    const defaultSl = entryPrice - defaultDist;
    if (structureStopPrice != null && structureStopPrice < entryPrice) {
      const structSl = structureStopPrice * (1 - structBuffer);
      stopLoss = Math.max(defaultSl, structSl);
      stopReason =
        `SL LONG dưới entry — ưu tiên mức structure ${structureStopPrice.toFixed(4)} ` +
        `(buffer ${config.stopLoss.structureBufferPct}%) hoặc ${config.stopLoss.defaultDistancePct}% mặc định. ` +
        `${adviserSummary?.assessment ?? 'Bảo vệ theo Decision đã khóa.'}`;
    } else {
      stopLoss = defaultSl;
      stopReason =
        `SL LONG = entry − ${config.stopLoss.defaultDistancePct}% ` +
        `vì không có structureStopPrice trong metrics — ` +
        `${adviserSummary?.assessment ?? 'theo cấu hình planner.'}`;
    }
    stopLoss = Math.max(stopLoss, entryPrice - maxDist);
  } else {
    const defaultSl = entryPrice + defaultDist;
    if (structureStopPrice != null && structureStopPrice > entryPrice) {
      const structSl = structureStopPrice * (1 + structBuffer);
      stopLoss = Math.min(defaultSl, structSl);
      stopReason =
        `SL SHORT trên entry — ưu tiên mức structure ${structureStopPrice.toFixed(4)} ` +
        `(buffer ${config.stopLoss.structureBufferPct}%) hoặc ${config.stopLoss.defaultDistancePct}% mặc định.`;
    } else {
      stopLoss = defaultSl;
      stopReason =
        `SL SHORT = entry + ${config.stopLoss.defaultDistancePct}% ` +
        `vì không có structureStopPrice trong metrics.`;
    }
    stopLoss = Math.min(stopLoss, entryPrice + maxDist);
  }

  const stopDistance = Math.abs(entryPrice - stopLoss);
  const stopDistancePct = (stopDistance / entryPrice) * 100;

  return { stopLoss, stopDistance, stopDistancePct, stopReason };
}

function buildTakeProfitPlan(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  stopDistance: number,
  confidence: number,
  config: V41TradeExecutionConfig,
): TradeTakeProfitPlan {
  const sign = direction === 'LONG' ? 1 : -1;
  const tp1 = entryPrice + sign * stopDistance * config.takeProfit.tp1RewardRisk;
  const tp2 = entryPrice + sign * stopDistance * config.takeProfit.tp2RewardRisk;
  const tp3 = entryPrice + sign * stopDistance * config.takeProfit.tp3RewardRisk;

  const tpReason =
    `TP chia 3 mức R:R ${config.takeProfit.tp1RewardRisk}/` +
    `${config.takeProfit.tp2RewardRisk}/${config.takeProfit.tp3RewardRisk} ` +
    `từ khoảng cách SL (confidence ${Math.round(confidence)}% — không tính lại). ` +
    `TP1 chốt một phần, TP2/TP3 gia hạn lợi nhuận theo cùng risk unit.`;

  return {
    tp1,
    tp2,
    tp3,
    rewardRiskTp1: config.takeProfit.tp1RewardRisk,
    rewardRiskTp2: config.takeProfit.tp2RewardRisk,
    rewardRiskTp3: config.takeProfit.tp3RewardRisk,
    tpReason,
  };
}

function buildRiskSummary(
  confidence: number,
  rewardRisk: number,
  config: V41TradeExecutionConfig,
): TradeRiskSummary {
  const riskLevel = resolveRiskLevel(confidence, config);
  return {
    riskLevel,
    rewardRisk,
    positionSizeRecommendationPct: resolvePositionSizePct(riskLevel, config),
  };
}

function buildPlanReviews(
  payload: TradeExecutionPlanPayload,
): V41ReviewItem[] {
  const { entry, stopLoss, takeProfit, riskSummary, direction } = payload;
  return [
    createInfoReview(
      V41_ENGINE_ID.TRADE_SETUP,
      'entry_plan',
      `Entry ${direction} — ${entry.entryType}`,
      entry.entryReason,
      { volume: entry.entryPrice },
    ),
    createInfoReview(
      V41_ENGINE_ID.TRADE_SETUP,
      'entry_zone',
      `Vùng entry ${entry.entryZoneLow.toFixed(4)} – ${entry.entryZoneHigh.toFixed(4)}`,
      entry.entryReason,
    ),
    createInfoReview(
      V41_ENGINE_ID.TRADE_SETUP,
      'stop_loss_plan',
      `Stop Loss ${stopLoss.stopLoss.toFixed(4)} (−${stopLoss.stopDistancePct.toFixed(2)}%)`,
      stopLoss.stopReason,
    ),
    createInfoReview(
      V41_ENGINE_ID.TRADE_SETUP,
      'take_profit_plan',
      `TP1 ${takeProfit.tp1.toFixed(4)} · TP2 ${takeProfit.tp2.toFixed(4)} · TP3 ${takeProfit.tp3.toFixed(4)}`,
      takeProfit.tpReason,
    ),
    createInfoReview(
      V41_ENGINE_ID.TRADE_SETUP,
      'risk_summary',
      `Rủi ro ${riskSummary.riskLevel} · R:R ${riskSummary.rewardRisk.toFixed(2)} · Size ${riskSummary.positionSizeRecommendationPct}%`,
      `Khuyến nghị khối lượng theo confidence đã khóa từ Decision — không tính lại.`,
    ),
  ];
}

/**
 * Lập kế hoạch giao dịch — chỉ đọc Decision + Adviser.
 * IGNORE → null. WATCH → watch only. LONG/SHORT → full plan.
 */
export function planTradeExecution(
  params: TradeExecutionPlannerParams,
  config: V41TradeExecutionConfig = V41_TRADE_EXECUTION_CONFIG,
):
  | TradeExecutionPlanPayload
  | TradeExecutionWatchPayload
  | null {
  const { decisionResult, adviserResult } = params;
  const evaluation = readDecisionEvaluationFromResult(decisionResult);
  const decision = evaluation?.decision ?? decisionResult.state;

  if (decision === V41_DECISION_FOUNDATION_STATE.IGNORE) {
    return null;
  }

  if (decision === V41_DECISION_FOUNDATION_STATE.WATCH) {
    return { watchMessage: config.messages.watch };
  }

  if (!isTradableDecision(decision)) {
    return null;
  }

  const markPrice = readMarkPrice(decisionResult, adviserResult, config);
  if (markPrice == null) {
    return { watchMessage: config.messages.missingMarkPrice };
  }

  const confidence = evaluation?.confidence ?? decisionResult.confidence;
  const adviserSummary = readAdviserSummary(adviserResult);
  const structureStop = readStructureStopPrice(decisionResult, adviserResult, config);

  const entry = buildEntryPlan(decision, markPrice, confidence, adviserSummary, config);
  const stopLoss = buildStopLossPlan(
    decision,
    entry.entryPrice,
    structureStop,
    adviserSummary,
    config,
  );
  const takeProfit = buildTakeProfitPlan(
    decision,
    entry.entryPrice,
    stopLoss.stopDistance,
    confidence,
    config,
  );
  const riskSummary = buildRiskSummary(
    confidence,
    takeProfit.rewardRiskTp1,
    config,
  );

  return {
    direction: decision,
    entry,
    stopLoss,
    takeProfit,
    riskSummary,
  };
}

/** Trả V41EngineResult cho UL Review — không wire UI. */
export function computeTradeExecutionPlannerResult(
  params: TradeExecutionPlannerParams,
  config: V41TradeExecutionConfig = V41_TRADE_EXECUTION_CONFIG,
): V41EngineResult<V41DecisionFoundationState> | null {
  const plan = planTradeExecution(params, config);

  if (plan == null) {
    return null;
  }

  if ('watchMessage' in plan) {
    return buildV41EngineResult({
      engineId: V41_ENGINE_ID.TRADE_SETUP,
      state: V41_DECISION_FOUNDATION_STATE.WATCH,
      confidence: params.decisionResult.confidence,
      strength: params.decisionResult.strength,
      reviews: [
        createWarningReview(
          V41_ENGINE_ID.TRADE_SETUP,
          'watch_no_entry',
          plan.watchMessage,
          plan.watchMessage,
          'WATCH',
        ),
      ],
      metrics: {
        marketConfidence: params.decisionResult.confidence,
      },
      debug: {
        raw: {
          watchMessage: plan.watchMessage,
          sourceDecision: params.decisionResult.state,
        },
      },
    });
  }

  const reviews = buildPlanReviews(plan);

  return buildV41EngineResult({
    engineId: V41_ENGINE_ID.TRADE_SETUP,
    state: plan.direction,
    confidence: params.decisionResult.confidence,
    strength: params.decisionResult.strength,
    reviews,
    metrics: {
      marketConfidence: params.decisionResult.confidence,
      entryQuality: plan.riskSummary.positionSizeRecommendationPct,
      readinessScore: plan.riskSummary.rewardRisk,
    },
    debug: {
      raw: {
        plan,
        sourceDecision: params.decisionResult.state,
        sourceAdviser: params.adviserResult.state,
      },
    },
  });
}

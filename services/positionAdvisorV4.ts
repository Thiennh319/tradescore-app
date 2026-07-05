import { FundingState } from '../constants/scoring';
import type { SqueezeDirection, SqueezeLevel, SqueezeRiskResult } from '../types/squeezeRisk';
import type { ADXAnalysis } from './indicators';
import {
  applyPositionAdvisorRuleSideEffects,
  buildPositionAdvisorContext,
  collectPositionAdvisorRuleResults,
  calculateThesisHealthScore,
  evaluateThesisState,
  applyThesisEngineLayer,
  applyThesisConfidenceDecisionLayer,
  deriveScanConfidence,
  resolvePositionMemoryAndSnapshot,
  commitPositionMemoryScan,
  NO_RULE_MATCH,
  recommendFromMatchedRules,
  resolveTradeThesisSnapshot,
  type EvaluatePositionInput,
  type MatchedRuleResult,
  type OwnDirectionScore,
  type PositionAdvisorRuleReplacements,
  type PositionRecommendation,
  type PositionWithPrice,
  type RecommendationType,
  type RuleContext,
  type RuleResult,
} from './positionAdvisorV3';

export type {
  TradeThesisSnapshot,
  TradeThesisEntryContext,
  CreateTradeThesisSnapshotInput,
  TradeThesisTrendDirection,
  TradeThesisMarketStructure,
  TradeThesisBTCAlignment,
  TradeThesisConfirmationLevel,
  TradeThesisSupportResistanceContext,
  ThesisHealthClassification,
  ThesisHealthComponentScores,
  ThesisHealthResult,
  ThesisOperationalState,
  ThesisStateEvaluation,
  PositionMemory,
  ConfidenceDeltaLevel,
} from './positionAdvisorV3';

export {
  createTradeThesisSnapshot,
  resolveTradeThesisSnapshot,
  attachTradeThesisToRecommendation,
  clearTradeThesisSessionCache,
  clearPositionMemorySessionCache,
  createPositionMemoryFromSnapshot,
  resolvePositionMemoryAndSnapshot,
  calculateThesisHealthScore,
  evaluateThesisState,
  evaluateThesisStateFromScore,
  resolveThesisOperationalStateWithHysteresis,
  applyThesisEngineLayer,
  deriveScanConfidence,
  applyThesisConfidenceDecisionLayer,
  THESIS_CONFIDENCE_DECISION_THRESHOLDS,
  CONFIDENCE_DELTA_BANDS,
  classifyConfidenceDelta,
  THESIS_STATE_HYSTERESIS,
  THESIS_HEALTHY_SUPPRESSIBLE_TYPES,
  THESIS_HEALTH_WEIGHTS,
  THESIS_STATE_THRESHOLDS,
  THESIS_ENGINE_TUNING,
  THESIS_IMMUNE_RULE_TRIGGERS,
  THESIS_SIGNIFICANT_EXIT_RULE_TRIGGERS,
} from './positionAdvisorV3';

export {
  EXTERNAL_RISK_RULES,
  POSITION_MATURITY_RULES,
  GRACE_PERIOD_MS,
  GRACE_ATR_MULTIPLIER,
  estimatePositionAtr,
  resolveGraceAtr,
  isInGracePeriod,
  recommendWithGracePeriod,
  isHoldFamilyAction,
  isCloseFamilyAction,
} from './gracePeriod';

import { recommendWithGracePeriod } from './gracePeriod';
import { applyRecommendationStability } from './recommendationStability';

const COLOR_BEAR = '#F6465D';
const COLOR_WARN = '#F0B90B';

export type EvaluatePositionV4Input = EvaluatePositionInput & {
  /** FundingState từ l6Detail lần scan hiện tại */
  currentFundingState?: FundingState;
  /** L11 Squeeze Risk từ scoring V4 lần scan hiện tại */
  currentSqueezeRisk?: SqueezeRiskResult;
  /** ADX 1H+4H — điều chỉnh nhẹ HOLD_STRONG / MOVE_SL_BE */
  adxData?: ADXAnalysis;
};

export type PositionAdvisorContext = RuleContextV4;

type RuleContextV4 = RuleContext & {
  currentFundingState?: FundingState;
  currentSqueezeRisk?: SqueezeRiskResult;
  adxData?: ADXAnalysis;
};

const COLOR_BULL_V4 = '#0ECB81';

function safeRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function getLayer(
  layers: OwnDirectionScore['layers'],
  layerNumber: number,
): number | null {
  const layer = layers.find((l) => l.layerNumber === layerNumber);
  return layer != null ? layer.score : null;
}

function calcDistToTP1Pct(position: PositionWithPrice): number {
  const { direction, entryPrice, tp1, currentPrice } = position;
  if (direction === 'LONG') {
    return safeRatio(currentPrice - entryPrice, tp1 - entryPrice) * 100;
  }
  return safeRatio(entryPrice - currentPrice, entryPrice - tp1) * 100;
}

function isBeyondOnePointFiveR(position: PositionWithPrice): boolean {
  const slDistance = Math.abs(position.entryPrice - position.sl);
  if (slDistance <= 0) return false;
  if (position.direction === 'LONG') {
    return position.currentPrice >= position.entryPrice + slDistance * 1.5;
  }
  return position.currentPrice <= position.entryPrice - slDistance * 1.5;
}

function isAdxTrendingStrong(adxData?: ADXAnalysis): boolean {
  return adxData?.regime === 'TRENDING' && adxData.regimeStrength === 'STRONG';
}

function isAdxChoppy(adxData?: ADXAnalysis): boolean {
  return adxData?.regime === 'CHOPPY';
}

function resolveHoldStrongThreshold(
  lastRecommendationType: RecommendationType | undefined,
  adxData?: ADXAnalysis,
): number {
  const isCurrentlyHoldStrong = lastRecommendationType === 'HOLD';
  let threshold = isCurrentlyHoldStrong ? 8.5 : 9.0;
  if (isAdxTrendingStrong(adxData) && !isCurrentlyHoldStrong) {
    threshold = 8.5;
  }
  if (isAdxChoppy(adxData)) {
    threshold = 9.5;
  }
  return threshold;
}

function ruleHoldStrongV4(input: RuleContextV4): RuleResult {
  const { ownDirectionScore, marketMode, lastRecommendationType, adxData } = input;
  const threshold = resolveHoldStrongThreshold(lastRecommendationType, adxData);

  if (
    ownDirectionScore.totalScore < threshold ||
    ownDirectionScore.hardBlocks.length > 0 ||
    ownDirectionScore.groupBlocks.length > 0
  ) {
    return NO_RULE_MATCH;
  }

  const l5 = getLayer(ownDirectionScore.layers, 5) ?? 0;
  const reasons: string[] = [];

  if (ownDirectionScore.totalScore >= 11) {
    reasons.push(`Score V3 mạnh: ${ownDirectionScore.totalScore.toFixed(1)}/15`);
    if (l5 >= 1.5) reasons.push('CVD/Dòng tiền đang ủng hộ hướng lệnh');
    if (marketMode === 'TRENDING') reasons.push('Thị trường đang trending rõ');
    return {
      matched: true,
      priority: 20,
      ruleName: 'HOLD_STRONG',
      type: 'HOLD',
      label: 'Tiếp tục giữ',
      color: COLOR_BULL_V4,
      confidence: 85,
      reasons,
      urgency: 'LOW',
    };
  }

  reasons.push(`Score V3: ${ownDirectionScore.totalScore.toFixed(1)}/15 — ổn định`);
  return {
    matched: true,
    priority: 20,
    ruleName: 'HOLD_STRONG',
    type: 'HOLD',
    label: 'Tiếp tục giữ',
    color: COLOR_BULL_V4,
    confidence: 72,
    reasons,
    urgency: 'LOW',
  };
}

function ruleMoveSLBreakevenV4(input: RuleContextV4): RuleResult {
  const { position, marketMode, adxData } = input;
  const distToTP1Pct = calcDistToTP1Pct(position);
  const minDistToTP1Pct = isAdxTrendingStrong(adxData) ? 50 : 60;

  if (
    distToTP1Pct < minDistToTP1Pct ||
    position.currentPnlUSDT <= 0 ||
    !isBeyondOnePointFiveR(position)
  ) {
    return NO_RULE_MATCH;
  }

  const reasons = [
    `Đang lời tốt (+${position.currentPnlUSDT.toFixed(2)} USDT)`,
    'Dời SL về breakeven để bảo vệ vốn',
  ];
  if (marketMode === 'TRENDING') {
    reasons.push('Thị trường trending — giữ phần còn lại chạy tiếp');
  }

  return {
    matched: true,
    priority: 40,
    ruleName: 'MOVE_SL_BE',
    type: 'HOLD_MOVE_SL',
    label: 'Dời SL về entry',
    color: COLOR_BULL_V4,
    confidence: 85,
    reasons,
    urgency: 'MEDIUM',
  };
}

const V4_ADX_RULE_REPLACEMENTS: PositionAdvisorRuleReplacements = {
  holdStrong: ruleHoldStrongV4 as (input: RuleContext) => RuleResult,
  moveSlBe: ruleMoveSLBreakevenV4 as (input: RuleContext) => RuleResult,
};

/** Lỗ tối đa nếu chạm SL — dùng cho ngưỡng 50% trong FUNDING_REVERSAL. */
export function computePositionMaxLossUSDT(
  entryPrice: number,
  sl: number,
  sizeUsdt: number,
  leverage: number,
): number {
  const slDist = Math.abs(entryPrice - sl);
  if (slDist <= 0 || entryPrice <= 0) return 0;
  const units = (sizeUsdt * leverage) / entryPrice;
  return slDist * units;
}

function isFundingReversalTransition(
  direction: 'LONG' | 'SHORT',
  lastState: FundingState | undefined,
  currentState: FundingState | undefined,
): boolean {
  if (lastState == null || currentState == null) return false;
  if (direction === 'LONG') {
    return (
      lastState === FundingState.SHORT_SQUEEZE_BUILDING &&
      currentState === FundingState.SHORT_EUPHORIA_FADING
    );
  }
  return (
    lastState === FundingState.EXTREME_LONG_EUPHORIA &&
    currentState === FundingState.LONG_EUPHORIA_FADING
  );
}

function ruleFundingReversal(input: RuleContextV4): RuleResult {
  const { position, currentFundingState } = input;

  const transition = isFundingReversalTransition(
    position.direction,
    position.lastFundingState,
    currentFundingState,
  );

  if (!transition) {
    if (position.lastFundingReversalPending) {
      return { matched: false, shouldClearFundingReversalPending: true };
    }
    return NO_RULE_MATCH;
  }

  if (!position.lastFundingReversalPending) {
    return {
      matched: true,
      priority: 75,
      ruleName: 'FUNDING_REVERSAL',
      type: 'HOLD',
      label: 'Giữ — xác nhận funding',
      color: COLOR_WARN,
      confidence: 62,
      reasons: ['Đang xác nhận funding...'],
      urgency: 'LOW',
      shouldSetFundingReversalPending: true,
    };
  }

  const maxLoss = position.maxLossUSDT ?? 0;
  const pnl = position.currentPnlUSDT;

  if (pnl > 0) {
    return {
      matched: true,
      priority: 75,
      ruleName: 'FUNDING_REVERSAL',
      type: 'PARTIAL_CLOSE_30',
      label: 'Chốt 30% — funding đảo',
      color: COLOR_WARN,
      confidence: 78,
      reasons: ['Funding momentum đảo chiều — chốt 30% bảo toàn lợi nhuận'],
      urgency: 'HIGH',
    };
  }

  const lossAbs = Math.abs(pnl);
  // Khi thiếu maxLossUSDT, KHÔNG dùng +Infinity (sẽ khiến mọi lỗ bị
  // coi là "chưa đáng kể" một cách im lặng, luôn rơi vào HOLD dù lỗ
  // nặng). Dùng threshold = 0 để buộc rơi xuống CLOSE_NOW cẩn trọng
  // hơn khi không chắc chắn về mức độ rủi ro thật.
  const halfMax = maxLoss > 0 ? maxLoss * 0.5 : 0;

  if (lossAbs < halfMax) {
    return {
      matched: true,
      priority: 75,
      ruleName: 'FUNDING_REVERSAL',
      type: 'HOLD',
      label: 'Giữ — funding yếu dần',
      color: COLOR_WARN,
      confidence: 62,
      reasons: ['Funding hỗ trợ đang yếu dần, theo dõi sát CVD và price action'],
      urgency: 'MEDIUM',
    };
  }

  return {
    matched: true,
    priority: 75,
    ruleName: 'FUNDING_REVERSAL',
    type: 'CLOSE_NOW',
    label: 'Đóng lệnh',
    color: COLOR_BEAR,
    confidence: 80,
    reasons: ['Funding đảo chiều + lỗ đáng kể — đóng lệnh'],
    urgency: 'HIGH',
  };
}

export function isSqueezeRiskEscalation(
  positionDirection: 'LONG' | 'SHORT',
  lastLevel: SqueezeLevel | null | undefined,
  lastDirection: SqueezeDirection | null | undefined,
  current: SqueezeRiskResult | undefined,
): boolean {
  if (!current || current.level !== 'EXTREME' || lastLevel !== 'HIGH') {
    return false;
  }

  if (positionDirection === 'LONG') {
    return current.direction === 'LONG_SQUEEZE' && lastDirection === 'LONG_SQUEEZE';
  }

  return current.direction === 'SHORT_SQUEEZE' && lastDirection === 'SHORT_SQUEEZE';
}

function ruleSqueezeRiskAlert(input: RuleContextV4): RuleResult {
  const { position, currentSqueezeRisk } = input;

  if (
    !isSqueezeRiskEscalation(
      position.direction,
      position.lastSqueezeRiskLevel,
      position.lastSqueezeRiskDirection,
      currentSqueezeRisk,
    )
  ) {
    return NO_RULE_MATCH;
  }

  const maxLoss = position.maxLossUSDT ?? 0;
  const pnl = position.currentPnlUSDT;
  const lossAbs = Math.abs(pnl);
  // Khi thiếu maxLossUSDT, KHÔNG dùng +Infinity (cùng lý do như
  // ruleFundingReversal) — dùng threshold = 0 để không coi lỗ là
  // "chưa đáng kể" khi thiếu thông tin.
  const lossThreshold40 = maxLoss > 0 ? maxLoss * 0.4 : 0;

  if (pnl > 0) {
    return {
      matched: true,
      priority: 70,
      ruleName: 'SQUEEZE_RISK_ALERT',
      type: 'PARTIAL_CLOSE_30',
      label: 'Chốt 30% — squeeze EXTREME',
      color: COLOR_WARN,
      confidence: 76,
      reasons: ['Squeeze risk leo thang EXTREME — chốt 30% bảo toàn lợi nhuận'],
      urgency: 'HIGH',
    };
  }

  if (lossAbs < lossThreshold40) {
    return {
      matched: true,
      priority: 70,
      ruleName: 'SQUEEZE_RISK_ALERT',
      type: 'HOLD',
      label: 'Giữ — squeeze EXTREME',
      color: COLOR_WARN,
      confidence: 60,
      reasons: ['Squeeze risk EXTREME — theo dõi sát, cân nhắc dời SL'],
      urgency: 'MEDIUM',
    };
  }

  return {
    matched: true,
    priority: 70,
    ruleName: 'SQUEEZE_RISK_ALERT',
    type: 'HOLD_MOVE_SL',
    label: 'Dời SL gần hơn — squeeze EXTREME',
    color: COLOR_WARN,
    confidence: 72,
    reasons: ['Squeeze risk EXTREME + lỗ đáng kể — dời SL về gần hơn để giới hạn rủi ro'],
    urgency: 'HIGH',
  };
}

/** Rule matrix V4 — V3 + FUNDING_REVERSAL (75) + SQUEEZE_RISK_ALERT (70). */
const V4_EXTRA_RULES: Array<(input: RuleContext) => RuleResult> = [
  ruleFundingReversal as (input: RuleContext) => RuleResult,
  ruleSqueezeRiskAlert as (input: RuleContext) => RuleResult,
];

export function runPositionAdvisorRulesV4(ctx: RuleContextV4): MatchedRuleResult[] {
  return collectPositionAdvisorRuleResultsV4(ctx, V4_EXTRA_RULES).matchedRules;
}

function collectPositionAdvisorRuleResultsV4(
  ctx: RuleContextV4,
  extraRules: Array<(input: RuleContext) => RuleResult> = [],
) {
  return collectPositionAdvisorRuleResults(ctx, extraRules, V4_ADX_RULE_REPLACEMENTS);
}

/** Position Advisor V4 — rule matrix mở rộng + grace period chung V3. */
export function evaluatePositionV4(input: EvaluatePositionV4Input): PositionRecommendation {
  const resolved = resolvePositionMemoryAndSnapshot(input);
  const enrichedInput: EvaluatePositionV4Input = {
    ...input,
    tradeThesisSnapshot: resolved.snapshot,
    positionMemory: resolved.memory,
    position: {
      ...input.position,
      tradeThesisSnapshot: resolved.snapshot,
      positionMemory: resolved.memory,
    },
  };
  const ctx: RuleContextV4 = {
    ...buildPositionAdvisorContext(enrichedInput),
    currentFundingState: enrichedInput.currentFundingState,
    currentSqueezeRisk: enrichedInput.currentSqueezeRisk,
    adxData: enrichedInput.adxData,
  };
  const { matchedRules, ...sideEffects } = collectPositionAdvisorRuleResultsV4(
    ctx,
    V4_EXTRA_RULES,
  );
  const recommendation = recommendWithGracePeriod(matchedRules, ctx, {
    position: enrichedInput.position,
    currentPrice: enrichedInput.currentPrice,
    atr1h: enrichedInput.atr1h,
    now: enrichedInput.now,
  });
  const withSideEffects = applyPositionAdvisorRuleSideEffects(recommendation, sideEffects);

  const thesisHealth = calculateThesisHealthScore(enrichedInput, resolved.snapshot);
  const previousThesisState = resolved.memoryCreated
    ? null
    : resolved.memory.lastThesisState;
  const thesisState = evaluateThesisState(thesisHealth, previousThesisState);
  const withThesisEngine = applyThesisEngineLayer(withSideEffects, thesisState, {
    skipOnEntrySnapshot: resolved.memoryCreated,
  });

  const currentScanConfidence = deriveScanConfidence(enrichedInput.ownDirectionScore);
  const previousScanConfidence =
    resolved.memory.lastScanConfidence ?? resolved.memory.entryConfidence;
  const withConfidenceDecision = applyThesisConfidenceDecisionLayer(
    withThesisEngine,
    {
      thesisHealth,
      thesisState,
      currentConfidence: currentScanConfidence,
      previousConfidence: previousScanConfidence,
    },
    { skipOnEntrySnapshot: resolved.memoryCreated },
  );

  const withStability = applyRecommendationStability(
    withConfidenceDecision,
    input.stabilityState,
  );
  const positionMemory = commitPositionMemoryScan(
    enrichedInput.position,
    resolved.memory,
    thesisHealth,
    thesisState,
    currentScanConfidence,
    enrichedInput.now,
  );

  return {
    ...withStability,
    tradeThesisSnapshot: resolved.snapshot,
    positionMemory,
    thesisHealth,
    thesisState,
    shouldPersistPositionMemory: true,
    ...(resolved.memoryCreated ? { shouldPersistTradeThesisSnapshot: true } : {}),
  };
}

/**
 * V4.1 Foundation — public barrel export (v1.1b final).
 */

export { V41_ENGINE_ID, type V41EngineId } from './engineIds';
export {
  V41_ENGINE_VERSION,
  type V41EngineResult,
  type V41EngineResultValidation,
  type V41EngineVersion,
  type BuildV41EngineResultParams,
  buildV41EngineResult,
  normalizeConfidenceStrength,
  validateV41EngineResult,
} from './engineResult';
export {
  V41_ENGINE_CAPABILITIES,
  type V41EngineCapabilities,
  getEngineCapabilities,
} from './capabilities';
export {
  V41_STRENGTH_BAND,
  type V41StrengthBand,
  normalizeStrength,
  resolveStrengthBand,
  resolveStrengthScore,
} from './strength';
export { type V41EngineMetrics } from './metrics';
export { type V41EngineDebug } from './debug';
export {
  type V41ReviewItem,
  type V41ReviewLevel,
  createReviewItem,
  createInfoReview,
  createWarningReview,
  createBlockReview,
} from './reviewItem';
export {
  V41_FOUNDATION_STATE,
  V41_VOLATILITY_FOUNDATION_STATE,
  V41_MOMENTUM_FOUNDATION_STATE,
  V41_TREND_REVERSAL_FOUNDATION_STATE,
  toFoundationVolatilityState,
  toLegacyVolatilityState,
  type V41FoundationStateToken,
  type V41TrendReversalFoundationState,
  type V41ConfidenceFoundationState,
  type V41DecisionFoundationState,
  V41_CONFIDENCE_FOUNDATION_STATE,
  V41_DECISION_FOUNDATION_STATE,
  type V41VolatilityFoundationState,
  type V41MomentumFoundationState,
  type MarketState,
  type VisibilityMode,
  type TrendDirection,
  type OpenDirection,
  type EarlyWarningSeverity,
  type ExhaustionType,
  type VolatilityExplosionState,
  type VolatilityRisk,
  type StopHuntRisk,
  type ConfidenceTier,
  type OpportunityDirection,
  type QualityLabel,
} from './states';
export {
  adaptEarlyWarningResult,
  adaptExhaustionResult,
  adaptMarketIntelligenceSnapshot,
  adaptMomentumResult,
  adaptOpportunitySnapshot,
  adaptProtectionSnapshot,
  adaptVisibilityResult,
  adaptVolatilityExplosionResult,
  adaptTrendReversalResult,
  engineResultToReviewItems,
} from './adapters';

export {
  applyMarketContextFilter,
  evaluateMarketContext,
  evaluateTrendReversalWithContext,
  type MarketContextFilterParams,
  type MarketContextFilterResult,
  type TrendReversalWithContextResult,
  type WhaleContextInput,
  type WhaleMarketSignal,
} from '../marketContextFilter';

export {
  V41_CONFIDENCE_CONFIG,
  type V41ConfidenceConfig,
} from '../confidence/confidenceConfig';
export {
  computeConfidenceBreakdown,
  computeConfidenceEngineResult,
  type ConfidenceBreakdown,
  type ConfidenceContribution,
  type ConfidenceContributionKind,
} from '../confidenceEngine';

export {
  V41_DECISION_CONFIG,
  type V41DecisionConfig,
} from '../decision/decisionConfig';
export {
  computeDecisionEngineResult,
  evaluateDecision,
  type DecisionEvaluation,
  type V41DecisionState,
} from '../decisionEngine';

export {
  V41_ADVISER_EXPLAIN_CONFIG,
  type V41AdviserExplainConfig,
} from '../positionAdviser/adviserExplainConfig';
export {
  computePositionAdviserExplainResult,
  explainPositionFromDecision,
  readDecisionEvaluationFromResult,
  type PositionAdviserExplainSummary,
} from '../positionAdviserExplainV41';

export {
  V41_TRADE_EXECUTION_CONFIG,
  type V41TradeExecutionConfig,
} from '../tradeExecution/tradeExecutionConfig';
export {
  computeTradeExecutionPlannerResult,
  planTradeExecution,
  type TradeEntryPlan,
  type TradeExecutionPlanPayload,
  type TradeExecutionPlannerParams,
  type TradeExecutionWatchPayload,
  type TradeRiskSummary,
  type TradeStopLossPlan,
  type TradeTakeProfitPlan,
} from '../tradeExecutionPlannerV41';
export {
  buildConfidenceDecisionContext,
  readConfidenceDecisionContext,
  type ConfidenceDecisionContext,
  type ProposedTradeDirection,
} from '../confidence/decisionContext';

export {
  V41_RC3_SYMBOLS,
  symbolDisplayName,
  type V41ChecklistItem,
  type V41DecisionUi,
  type V41Rc3SignalCardModel,
  type V41TradeLevelsUi,
  type V41TradeSession,
  type V41TradeSessionAdvisor,
  type V41TradeSessionStatus,
  type V41TriggerType,
} from '../rc3/rc3ViewModelTypes';
export {
  buildRc3ViewModelFromRow,
  buildRc3ViewModelsFromScan,
} from '../rc3/buildRc3ViewModel';
export {
  buildTradeSessionAdviserPatches,
  buildTradeSessionAdvisorViewModel,
  buildWaitingFillAdvisor,
} from '../rc3/buildTradeSessionAdviser';
export type {
  V41AdvisorViewModel,
  V41SessionAdviserPatch,
} from '../rc3/tradeSessionAdviserTypes';

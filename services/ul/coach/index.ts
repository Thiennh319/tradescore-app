/**
 * Task 15.8 — Trading Coach Engine public API.
 */

export { TRADING_COACH_VERSION, TRADING_COACH_PRIORITY_RANK } from './TradingCoachTypes';
export type {
  TradingCoachOverallStatus,
  TradingCoachGrade,
  TradingCoachPriority,
  TradingCoachDifficulty,
  TradingCoachSummary,
  TradingCoachPriorityItem,
  TradingCoachAction,
  TradingCoachMessage,
  TradingCoachWeeklyGoal,
  TradingCoachChecklistItem,
  TradingCoachEvidenceRef,
  TradingCoachReport,
} from './TradingCoachTypes';

export {
  COACH_RULES,
  coachGradeFromScore,
  overallStatusFromSignals,
  mapRecPriority,
  mapSeverityToPriority,
} from './TradingCoachRules';

export {
  formatCoachGrade,
  formatCoachStatus,
  formatCoachPriority,
  formatCoachScore,
  clampCoachScore,
} from './TradingCoachFormatter';

export {
  mergeCoachConfidence,
  mergeCoachScore,
  collectCoachEvidence,
  buildTopPriorities,
  buildActionPlan,
  buildCoachMessages,
  buildDailyFocus,
  buildWeeklyGoals,
  buildNextSessionChecklist,
  buildTradingCoachFromInputs,
} from './TradingCoachBuilder';

export { buildTradingCoachReport } from './TradingCoachEngine';

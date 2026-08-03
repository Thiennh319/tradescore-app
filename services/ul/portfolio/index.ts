/**
 * Task 15.9 — Portfolio Advisor Engine public API.
 */

export { PORTFOLIO_ADVISOR_VERSION } from './PortfolioAdvisorTypes';
export type {
  PortfolioAdvisorStatus,
  PortfolioAdvisorGrade,
  PortfolioRiskLevel,
  PortfolioPreferredSide,
  PortfolioAdvisorSummary,
  PortfolioCoinPlan,
  PortfolioRiskPlan,
  PortfolioCapitalAllocation,
  PortfolioStrategyAllocation,
  PortfolioTradePlan,
  PortfolioSessionPlan,
  PortfolioLimits,
  PortfolioWarning,
  PortfolioAdvisorEvidence,
  PortfolioAdvisorReport,
} from './PortfolioAdvisorTypes';

export {
  PORTFOLIO_ADVISOR_RULES,
  clampPortfolioScore,
  portfolioGradeFromScore,
  portfolioStatusFromSignals,
  riskLevelFromSignals,
  cashReserveForRisk,
  maxTradesForStatus,
  riskPerTradeForLevel,
  maxPositionForLevel,
} from './PortfolioAdvisorRules';

export {
  formatPortfolioStatus,
  formatPortfolioGrade,
  formatPortfolioRisk,
  formatAllocationPct,
  normalizePortfolioSymbol,
} from './PortfolioAdvisorFormatter';

export {
  buildPortfolioCoinPlan,
  buildCapitalAllocation,
  buildStrategyAllocation,
  buildSessionPlan,
  buildPortfolioEvidence,
  buildPortfolioWarnings,
  mergePortfolioConfidence,
  buildPortfolioAdvisorFromInputs,
} from './PortfolioAdvisorBuilder';

export { buildPortfolioAdvisorReport } from './PortfolioAdvisorEngine';

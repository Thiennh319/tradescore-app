/**
 * Task 15.9 — Portfolio Advisor Engine domain types.
 * Portfolio planning only. Read-only. No AI / LLM / market scan.
 */

export const PORTFOLIO_ADVISOR_VERSION = 1 as const;

export type PortfolioAdvisorStatus =
  | 'Excellent'
  | 'Healthy'
  | 'Improving'
  | 'Neutral'
  | 'Warning'
  | 'Critical';

export type PortfolioAdvisorGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export type PortfolioRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type PortfolioPreferredSide = 'LONG' | 'SHORT' | 'BOTH' | 'NONE';

export type PortfolioAdvisorSummary = {
  headline: string;
  status: PortfolioAdvisorStatus;
  advisorScore: number;
  grade: PortfolioAdvisorGrade;
};

export type PortfolioCoinPlan = {
  preferredCoins: readonly string[];
  avoidCoins: readonly string[];
  watchCoins: readonly string[];
};

export type PortfolioRiskPlan = {
  level: PortfolioRiskLevel;
  posture: 'Growth' | 'Balanced' | 'Defensive' | 'Cash';
  cashReservePct: number;
};

/**
 * Percent allocation by coin plus Cash. Standard symbols are always present;
 * additional symbols may be included. Values always sum to 100.
 */
export type PortfolioCapitalAllocation = {
  BTC: number;
  SOL: number;
  BNB: number;
  NEAR: number;
  Cash: number;
  readonly [symbol: string]: number;
};

export type PortfolioStrategyAllocation = {
  strategyId: string;
  name: string;
  allocationPct: number;
  score: number;
  confidence: number;
  profitFactor: number;
};

export type PortfolioTradePlan = {
  maxTrades: number;
  /** Percent of portfolio capital. */
  riskPerTrade: number;
  /** Percent of portfolio capital. */
  maxDailyLoss: number;
  targetRR: string;
  preferredSide: PortfolioPreferredSide;
};

export type PortfolioSessionPlan = {
  /** UTC hour integers (0–23). */
  bestTradingHours: readonly number[];
  /** UTC hour integers (0–23). */
  avoidHours: readonly number[];
  preferredMarket: string | null;
};

export type PortfolioLimits = {
  maxLeverage: number;
  /** Percent of portfolio capital. */
  maxPositionSize: number;
  maxConsecutiveLoss: number;
  stopTradingAfterLoss: boolean;
};

export type PortfolioWarning = {
  id: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'coach' | 'entry' | 'strategy' | 'recommendation' | 'psychology' | 'dashboard';
  evidenceRefs: readonly string[];
};

/** References only; no source payloads are copied. */
export type PortfolioAdvisorEvidence = {
  coach: readonly string[];
  entry: readonly string[];
  strategy: readonly string[];
  recommendation: readonly string[];
  psychology: readonly string[];
};

export type PortfolioAdvisorReport = {
  version: typeof PORTFOLIO_ADVISOR_VERSION;
  summary: PortfolioAdvisorSummary;
  portfolio: PortfolioCoinPlan;
  riskPlan: PortfolioRiskPlan;
  capitalAllocation: PortfolioCapitalAllocation;
  strategyAllocation: readonly PortfolioStrategyAllocation[];
  tradePlan: PortfolioTradePlan;
  sessionPlan: PortfolioSessionPlan;
  limits: PortfolioLimits;
  warnings: readonly PortfolioWarning[];
  confidence: number;
  evidence: PortfolioAdvisorEvidence;
};

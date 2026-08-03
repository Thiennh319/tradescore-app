/**
 * Task 15.9 — Portfolio Advisor deterministic planning policy.
 * Consumes existing scores/statuses only; never recalculates analytics.
 */

import type {
  PortfolioAdvisorGrade,
  PortfolioAdvisorStatus,
  PortfolioRiskLevel,
} from './PortfolioAdvisorTypes';

export const PORTFOLIO_ADVISOR_RULES = {
  MAX_PREFERRED_COINS: 3,
  MAX_WATCH_COINS: 3,
  MAX_AVOID_COINS: 3,
  MAX_STRATEGIES: 3,
  MAX_WARNINGS: 8,
  MIN_PREFERRED_COIN_SCORE: 55,
  MAX_AVOID_COIN_SCORE: 40,
  MIN_PREFERRED_WIN_RATE: 50,
  CASH_LOW_RISK: 10,
  CASH_MEDIUM_RISK: 25,
  CASH_HIGH_RISK: 50,
  CASH_CRITICAL_RISK: 100,
  MAX_LEVERAGE: 5,
  MAX_CONSECUTIVE_LOSS: 2,
  TARGET_RR: '>=2',
} as const;

export function clampPortfolioScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)));
}

export function portfolioGradeFromScore(score: number): PortfolioAdvisorGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export function portfolioStatusFromSignals(input: {
  advisorScore: number;
  coachStatus: PortfolioAdvisorStatus | null;
  entryDecision: 'ENTER' | 'WAIT' | 'AVOID' | null;
  improving: boolean;
}): PortfolioAdvisorStatus {
  if (input.coachStatus === 'Critical' || input.entryDecision === 'AVOID') return 'Critical';
  if (input.coachStatus === 'Warning' || input.advisorScore < 50) return 'Warning';
  if (input.advisorScore >= 90) return 'Excellent';
  if (input.advisorScore >= 75) return 'Healthy';
  if (input.improving || input.coachStatus === 'Improving') return 'Improving';
  if (input.advisorScore >= 50) return 'Neutral';
  return 'Warning';
}

export function riskLevelFromSignals(input: {
  dashboardRiskScore: number | null;
  coachStatus: PortfolioAdvisorStatus | null;
  psychologyScore: number | null;
  entryDecision: 'ENTER' | 'WAIT' | 'AVOID' | null;
}): PortfolioRiskLevel {
  if (
    input.coachStatus === 'Critical' ||
    input.entryDecision === 'AVOID' ||
    (input.dashboardRiskScore ?? 0) >= 75
  ) {
    return 'Critical';
  }
  if (
    input.coachStatus === 'Warning' ||
    (input.psychologyScore != null && input.psychologyScore < 50) ||
    (input.dashboardRiskScore ?? 0) >= 50
  ) {
    return 'High';
  }
  if (input.entryDecision === 'WAIT' || (input.dashboardRiskScore ?? 0) >= 25) {
    return 'Medium';
  }
  return 'Low';
}

export function cashReserveForRisk(level: PortfolioRiskLevel): number {
  if (level === 'Critical') return PORTFOLIO_ADVISOR_RULES.CASH_CRITICAL_RISK;
  if (level === 'High') return PORTFOLIO_ADVISOR_RULES.CASH_HIGH_RISK;
  if (level === 'Medium') return PORTFOLIO_ADVISOR_RULES.CASH_MEDIUM_RISK;
  return PORTFOLIO_ADVISOR_RULES.CASH_LOW_RISK;
}

export function maxTradesForStatus(status: PortfolioAdvisorStatus): number {
  if (status === 'Excellent' || status === 'Healthy') return 4;
  if (status === 'Improving' || status === 'Neutral') return 3;
  if (status === 'Warning') return 2;
  return 0;
}

export function riskPerTradeForLevel(level: PortfolioRiskLevel): number {
  if (level === 'Low') return 1;
  if (level === 'Medium') return 0.75;
  if (level === 'High') return 0.5;
  return 0;
}

export function maxPositionForLevel(level: PortfolioRiskLevel): number {
  if (level === 'Low') return 20;
  if (level === 'Medium') return 15;
  if (level === 'High') return 10;
  return 0;
}

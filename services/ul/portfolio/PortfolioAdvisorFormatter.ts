/**
 * Task 15.9 — Portfolio Advisor formatting helpers.
 */

import type {
  PortfolioAdvisorGrade,
  PortfolioAdvisorStatus,
  PortfolioRiskLevel,
} from './PortfolioAdvisorTypes';

export function formatPortfolioStatus(status: PortfolioAdvisorStatus): string {
  return status;
}

export function formatPortfolioGrade(grade: PortfolioAdvisorGrade): string {
  return grade;
}

export function formatPortfolioRisk(level: PortfolioRiskLevel): string {
  return level;
}

export function formatAllocationPct(value: number): string {
  return `${Math.round(value)}%`;
}

export function normalizePortfolioSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase().replace(/[-_/]/g, '');
  return normalized.replace(/USDT$|USDC$|USD$/i, '') || 'UNKNOWN';
}

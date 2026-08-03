/**
 * Task 15.6 — Strategy analytics thresholds (deterministic).
 */

import type { StrategyGrade, StrategyLifecycle, StrategyStatus } from './StrategyAnalyticsTypes';

export const STRATEGY_RULES = {
  MIN_TRADES_RANK: 1,
  MIN_TRADES_CONFIDENT: 5,
  MIN_TRADES_STABLE: 8,
  DEAD_MAX_TRADES: 2,
  OVERFIT_MIN_WR: 90,
  OVERFIT_MAX_TRADES: 6,
  EXCELLENT_SCORE: 85,
  HEALTHY_SCORE: 70,
  WATCH_SCORE: 55,
  WEAK_SCORE: 40,
  /** Half-window expectancy delta for improving/declining. */
  TREND_EPS: 0.25,
} as const;

export function strategyGradeFromScore(score: number): StrategyGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export function strategyStatusFromScore(
  score: number,
  tradeCount: number,
  dead: boolean,
  disabled: boolean,
): StrategyStatus {
  if (disabled) return 'Disabled';
  if (dead) return 'Deprecated';
  if (score >= STRATEGY_RULES.EXCELLENT_SCORE) return 'Excellent';
  if (score >= STRATEGY_RULES.HEALTHY_SCORE) return 'Healthy';
  if (score >= STRATEGY_RULES.WATCH_SCORE) return 'Watch';
  if (score >= STRATEGY_RULES.WEAK_SCORE) return 'Weak';
  return 'Deprecated';
}

export function lifecycleFromSignals(input: {
  tradeCount: number;
  improving: boolean;
  declining: boolean;
  dead: boolean;
  score: number;
}): StrategyLifecycle {
  if (input.dead || input.score < STRATEGY_RULES.WEAK_SCORE) return 'Deprecated';
  if (input.tradeCount < 3) return 'New';
  if (input.improving) return 'Growing';
  if (input.declining) return 'Declining';
  return 'Stable';
}

/**
 * Confidence 0–100 from already-computed strategy metrics (no UL redefinition).
 * Weights: trades 30 · consistency 25 · PF 25 · drawdown penalty 20.
 */
export function strategyConfidence(input: {
  tradeCount: number;
  consistency: number;
  profitFactor: number;
  maxDrawdown: number;
  netPnL: number;
}): number {
  const tradePart = Math.min(100, (input.tradeCount / 15) * 100) * 0.3;
  const consPart = Math.max(0, Math.min(100, input.consistency)) * 0.25;
  const pfPart = Math.min(100, (input.profitFactor / 3) * 100) * 0.25;
  const scale = Math.max(Math.abs(input.netPnL), input.maxDrawdown, 1);
  const ddPenalty = Math.min(100, (input.maxDrawdown / scale) * 100);
  const ddPart = (100 - ddPenalty) * 0.2;
  return Math.round(Math.max(0, Math.min(100, tradePart + consPart + pfPart + ddPart)));
}

/** Composite strategy score 0–100 from existing metric bag. */
export function strategyCompositeScore(input: {
  winRate: number;
  profitFactor: number;
  expectancy: number;
  consistency: number;
  performance: number;
  stability: number;
  netPnL: number;
}): number {
  const wr = Math.max(0, Math.min(100, input.winRate));
  const pf = Math.min(100, Math.max(0, (input.profitFactor / 3) * 100));
  const exp = Math.min(100, Math.max(0, 50 + input.expectancy * 8));
  const cons = Math.max(0, Math.min(100, input.consistency));
  const perf = Math.max(0, Math.min(100, input.performance));
  const stab = Math.max(0, Math.min(100, input.stability));
  const pnlTilt = input.netPnL > 0 ? 3 : input.netPnL < 0 ? -3 : 0;
  const avg = wr * 0.2 + pf * 0.2 + exp * 0.15 + cons * 0.15 + perf * 0.15 + stab * 0.15;
  return Math.round(Math.max(0, Math.min(100, avg + pnlTilt)));
}

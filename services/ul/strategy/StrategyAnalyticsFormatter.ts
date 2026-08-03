/**
 * Task 15.6 — Format helpers for strategy analytics.
 */

import type { StrategyGrade, StrategyStatus } from './StrategyAnalyticsTypes';

export function formatStrategyGrade(g: StrategyGrade): string {
  return g;
}

export function formatStrategyStatus(s: StrategyStatus): string {
  return s;
}

export function formatStrategyPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

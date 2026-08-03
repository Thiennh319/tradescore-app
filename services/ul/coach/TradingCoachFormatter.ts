/**
 * Task 15.8 — Trading Coach format helpers.
 */

import type {
  TradingCoachGrade,
  TradingCoachOverallStatus,
  TradingCoachPriority,
} from './TradingCoachTypes';

export function formatCoachGrade(g: TradingCoachGrade): string {
  return g;
}

export function formatCoachStatus(s: TradingCoachOverallStatus): string {
  return s;
}

export function formatCoachPriority(p: TradingCoachPriority): string {
  return p;
}

export function formatCoachScore(n: number): string {
  return `${Math.round(n)}/100`;
}

export function clampCoachScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(100, n)));
}

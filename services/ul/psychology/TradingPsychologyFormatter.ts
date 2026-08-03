/**
 * Task 15.5 — Display helpers (no UL metric recomputation).
 */

import type { TradingPsychologyGrade, TradingPsychologySeverity } from './TradingPsychologyTypes';

export function formatPsychologyGrade(g: TradingPsychologyGrade): string {
  return g;
}

export function formatPsychologySeverity(s: TradingPsychologySeverity): string {
  return s;
}

export function clampPsychologyConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

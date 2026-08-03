/**
 * Task 15.4 — Format helpers (display only, no metric math).
 */

import type { TradingRecommendationPriority } from './TradingRecommendationTypes';

export function formatRecommendationPriority(p: TradingRecommendationPriority): string {
  return p;
}

export function clampRecConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

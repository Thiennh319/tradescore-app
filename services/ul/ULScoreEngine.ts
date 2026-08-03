/**
 * Task 15.0.1 — Layer 6 Score Engine.
 * Weights: Performance 40% + Consistency 30% + Risk 20% + Expectancy 10%.
 */

import type { ULCoreMetrics, ULScoreBreakdown, UlGrade } from './types';

export function expectancyToScore(expectancy: number): number {
  // Map ±5 USDT around 50 → clamp 0–100
  return Math.round(Math.min(100, Math.max(0, 50 + expectancy * 10)));
}

export function gradeFromScore(score: number): UlGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

/**
 * Final weighted score (integer).
 * Risk pillar uses quality = 100 − riskScore.
 */
export function buildScoreBreakdown(
  metrics: ULCoreMetrics,
  riskScore: number,
): ULScoreBreakdown {
  const performance = Math.max(0, Math.min(100, metrics.performanceScore));
  const consistency = Math.max(0, Math.min(100, metrics.consistencyScore));
  const riskQuality = Math.max(0, Math.min(100, 100 - riskScore));
  const expectancyScore = expectancyToScore(metrics.expectancy);

  const final = Math.round(
    performance * 0.4 + consistency * 0.3 + riskQuality * 0.2 + expectancyScore * 0.1,
  );
  const performanceScore = Math.max(0, Math.min(100, final));

  return {
    performanceScore,
    consistencyScore: consistency,
    stabilityScore: metrics.stabilityScore,
    riskScore: Math.max(0, Math.min(100, Math.round(riskScore))),
    expectancyScore,
    grade: gradeFromScore(performanceScore),
  };
}

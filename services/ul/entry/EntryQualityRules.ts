/**
 * Task 15.7 — Entry Quality deterministic thresholds & scoring.
 */

import type {
  EntryQualityCheckStatus,
  EntryQualityDecision,
  EntryQualityGrade,
  EntryQualityPillarId,
} from './EntryQualityTypes';
import {
  ENTRY_QUALITY_CHECK_STATUS_SCORE,
  ENTRY_QUALITY_PILLAR_WEIGHTS,
} from './EntryQualityTypes';

export const ENTRY_QUALITY_RULES = {
  /** RSI long sweet zone. */
  RSI_LONG_LOW: 40,
  RSI_LONG_HIGH: 65,
  RSI_SHORT_LOW: 35,
  RSI_SHORT_HIGH: 60,
  RSI_OVERBOUGHT: 70,
  RSI_OVERSOLD: 30,
  /** Volume ratio thresholds. */
  VOLUME_PASS: 1.2,
  VOLUME_WARN: 0.9,
  /** OI change % confirmation. */
  OI_PASS: 1.5,
  OI_WARN: 0,
  /** Funding extreme (absolute). */
  FUNDING_WARN: 0.0005,
  FUNDING_FAIL: 0.0015,
  /** Long/short crowding. */
  LS_CROWDED_LONG: 1.35,
  LS_CROWDED_SHORT: 0.75,
  /** Spread % of price. */
  SPREAD_PASS: 0.05,
  SPREAD_WARN: 0.12,
  /** ATR % of price. */
  ATR_PASS: 2.5,
  ATR_WARN: 4.5,
  /** Liquidity score 0–100. */
  LIQUIDITY_PASS: 60,
  LIQUIDITY_WARN: 40,
  /** Default min RR when RuleBook silent. */
  DEFAULT_MIN_RR: 2,
  RR_WARN_RATIO: 0.85,
  /** Decision score gates (after blockers). */
  ENTER_MIN_SCORE: 70,
  WAIT_MIN_SCORE: 45,
  /** Confidence weights. */
  CONF_PASS_WEIGHT: 4,
  CONF_FAIL_PENALTY: 6,
  CONF_WARN_PENALTY: 2,
  CONF_HIST_WEIGHT: 20,
} as const;

export function entryQualityGradeFromScore(score: number): EntryQualityGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export function checkStatusScore(status: EntryQualityCheckStatus): number {
  return ENTRY_QUALITY_CHECK_STATUS_SCORE[status];
}

/**
 * Weighted pillar blend → 0–100.
 * pillarScores: map of pillar → 0–100 average check score.
 */
export function blendPillarScores(
  pillarScores: ReadonlyMap<EntryQualityPillarId, number>,
): number {
  let total = 0;
  let weightSum = 0;
  for (const [id, weight] of Object.entries(ENTRY_QUALITY_PILLAR_WEIGHTS) as Array<
    [EntryQualityPillarId, number]
  >) {
    const s = pillarScores.get(id);
    if (s == null || !Number.isFinite(s)) continue;
    total += s * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, total / weightSum)));
}

/**
 * Decision from blockers + score. Blockers win.
 * hardAvoid → AVOID; hardWait → WAIT (unless AVOID); else score gates.
 */
export function decideEntryQuality(input: {
  hardAvoid: boolean;
  hardWait: boolean;
  score: number;
}): EntryQualityDecision {
  if (input.hardAvoid) return 'AVOID';
  if (input.hardWait) return 'WAIT';
  if (input.score >= ENTRY_QUALITY_RULES.ENTER_MIN_SCORE) return 'ENTER';
  if (input.score >= ENTRY_QUALITY_RULES.WAIT_MIN_SCORE) return 'WAIT';
  return 'AVOID';
}

/**
 * Confidence 0–100 from confirmations, failures, optional historical reliability (0–100).
 * O(1) — no trade loops.
 */
export function entryQualityConfidence(input: {
  passCount: number;
  warnCount: number;
  failCount: number;
  historicalReliability: number | null;
}): number {
  const { CONF_PASS_WEIGHT, CONF_FAIL_PENALTY, CONF_WARN_PENALTY, CONF_HIST_WEIGHT } =
    ENTRY_QUALITY_RULES;
  const base =
    40 +
    input.passCount * CONF_PASS_WEIGHT -
    input.failCount * CONF_FAIL_PENALTY -
    input.warnCount * CONF_WARN_PENALTY;
  const hist =
    input.historicalReliability == null
      ? 0
      : (Math.max(0, Math.min(100, input.historicalReliability)) / 100) * CONF_HIST_WEIGHT;
  return Math.round(Math.max(0, Math.min(100, base + hist)));
}

export function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

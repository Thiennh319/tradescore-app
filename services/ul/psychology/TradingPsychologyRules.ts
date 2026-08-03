/**
 * Task 15.5 — Psychology mapping rules (static thresholds / trait deltas).
 * Does not recompute UL metrics — only applies fixed adjustments.
 */

import type { TradingInsightSeverity } from '../insight/TradingInsightTypes';
import type {
  TradingPsychologyGrade,
  TradingPsychologySeverity,
  TradingPsychologyTraitId,
  TradingPsychologyType,
} from './TradingPsychologyTypes';

export const PSYCHOLOGY_RULES = {
  TRAIT_BASE: 70,
  TRAIT_MIN: 0,
  TRAIT_MAX: 100,
  /** Read-only thresholds against dashboard fields already computed by UL. */
  OVERTRADE_MIN: 12,
  HIGH_DD_RATIO: 0.35,
  LOW_CONSISTENCY: 40,
  HIGH_CONSISTENCY: 60,
  LOW_RR: 1.5,
  STRONG_WR: 55,
  WEAK_WR: 40,
} as const;

export type PsychologyDetectionSpec = {
  id: string;
  psychologyType: TradingPsychologyType;
  title: string;
  habit: string;
  improvement: string;
  /** Traits to penalize (negative) or boost (positive) with fixed deltas. */
  traitDeltas: Partial<Record<TradingPsychologyTraitId, number>>;
  defaultSeverity: TradingPsychologySeverity;
};

/** Insight id → psychology detection template. */
export const DETECTION_BY_INSIGHT_ID: Record<string, PsychologyDetectionSpec> = {
  'ti-lose-streak': {
    id: 'psy-revenge',
    psychologyType: 'Revenge Trading',
    title: 'Revenge trading pressure',
    habit: 'Entering after losses to “get even”',
    improvement: 'Hard stop after 2 losses — walk away one session',
    traitDeltas: { 'Emotional Control': -18, Discipline: -10, Confidence: -5 },
    defaultSeverity: 'HIGH',
  },
  'ti-hold-long': {
    id: 'psy-hold-long',
    psychologyType: 'Holding Too Long',
    title: 'Holding losers / positions too long',
    habit: 'Extending holds past plan invalidation',
    improvement: 'Honor time stops and plan exits',
    traitDeltas: { Patience: -8, Execution: -12, Discipline: -6 },
    defaultSeverity: 'MEDIUM',
  },
  'ti-rr-low': {
    id: 'psy-poor-rr',
    psychologyType: 'Poor RR Discipline',
    title: 'Poor RR discipline',
    habit: 'Taking low RR setups',
    improvement: 'Enforce minimum RR before entry',
    traitDeltas: { Discipline: -14, 'Risk Control': -8 },
    defaultSeverity: 'HIGH',
  },
  'ti-risk-elevated': {
    id: 'psy-large-dd',
    psychologyType: 'Large Drawdown Behavior',
    title: 'Large drawdown behavior',
    habit: 'Continuing size under elevated risk',
    improvement: 'Cut size until risk cools',
    traitDeltas: { 'Risk Control': -20, 'Emotional Control': -10 },
    defaultSeverity: 'HIGH',
  },
  'ti-timing-worst-hour': {
    id: 'psy-late-entry',
    psychologyType: 'Late Entry',
    title: 'Late / weak-hour entries',
    habit: 'Trading in historically losing hours',
    improvement: 'Block entries in the weak hour band',
    traitDeltas: { Patience: -10, Discipline: -6 },
    defaultSeverity: 'HIGH',
  },
  'ti-coin-gap': {
    id: 'psy-coin-switch',
    psychologyType: 'Coin Switching',
    title: 'Coin switching drag',
    habit: 'Spreading focus to underperforming coins',
    improvement: 'Prioritize the leading coin; trim the lagging one',
    traitDeltas: { Consistency: -8, Discipline: -4 },
    defaultSeverity: 'MEDIUM',
  },
  'ti-exp-fall': {
    id: 'psy-fomo-chase',
    psychologyType: 'FOMO',
    title: 'FOMO / expectancy chase',
    habit: 'Forcing trades while expectancy falls',
    improvement: 'Pause size and wait for expectancy recovery',
    traitDeltas: { Patience: -12, 'Emotional Control': -10, Confidence: -4 },
    defaultSeverity: 'HIGH',
  },
  'ti-wr-down': {
    id: 'psy-fear',
    psychologyType: 'Fear',
    title: 'Fear after win-rate drop',
    habit: 'Hesitation or erratic size after drawdowns in WR',
    improvement: 'Use fixed size checklist until WR stabilizes',
    traitDeltas: { Confidence: -12, Consistency: -6 },
    defaultSeverity: 'MEDIUM',
  },
  'ti-wr-up': {
    id: 'psy-greed-guard',
    psychologyType: 'Greed',
    title: 'Greed risk after WR lift',
    habit: 'Temptation to oversize after a hot streak',
    improvement: 'Keep size flat for next 10 trades',
    traitDeltas: { Discipline: -4, 'Risk Control': -4 },
    defaultSeverity: 'LOW',
  },
  'ti-all-losses': {
    id: 'psy-ignore-rec',
    psychologyType: 'Ignoring Recommendation',
    title: 'Ignoring stop-window signals',
    habit: 'Continuing a broken profile',
    improvement: 'Follow stand-down recommendation immediately',
    traitDeltas: { Discipline: -16, 'Emotional Control': -12 },
    defaultSeverity: 'CRITICAL',
  },
  'ti-market-hostile': {
    id: 'psy-overtrade-hostile',
    psychologyType: 'Over Trading',
    title: 'Over trading in hostile regime',
    habit: 'High activity when expectancy is negative',
    improvement: 'Stand down or A+ only',
    traitDeltas: { Patience: -10, Discipline: -10, 'Risk Control': -8 },
    defaultSeverity: 'HIGH',
  },
  'ti-consistency-low': {
    id: 'psy-inconsistent',
    psychologyType: 'Early Exit',
    title: 'Inconsistent process / early process breaks',
    habit: 'Switching playbooks mid-session',
    improvement: 'One playbook per session',
    traitDeltas: { Consistency: -14, Discipline: -6 },
    defaultSeverity: 'MEDIUM',
  },
  'ti-consistency-high': {
    id: 'psy-healthy-consistency',
    psychologyType: 'Healthy Habit',
    title: 'Consistent process habit',
    habit: 'Stable session rules',
    improvement: 'Keep process unchanged',
    traitDeltas: { Consistency: 10, Discipline: 6 },
    defaultSeverity: 'INFO',
  },
  'ti-wr-strong': {
    id: 'psy-healthy-wr',
    psychologyType: 'Healthy Habit',
    title: 'Disciplined win-rate habit',
    habit: 'Maintaining strong WR without oversizing',
    improvement: 'Protect edge with size caps',
    traitDeltas: { Confidence: 8, Discipline: 6 },
    defaultSeverity: 'INFO',
  },
  'ti-dd-reduced': {
    id: 'psy-healthy-dd',
    psychologyType: 'Healthy Habit',
    title: 'Drawdown control habit',
    habit: 'Respecting risk caps',
    improvement: 'Keep risk caps',
    traitDeltas: { 'Risk Control': 12, Discipline: 4 },
    defaultSeverity: 'INFO',
  },
};

/** Recommendation action keywords → extra psychology hints (read-only string match). */
export const DETECTION_BY_REC_ACTION_SUBSTR: ReadonlyArray<{
  match: string;
  spec: PsychologyDetectionSpec;
}> = [
  {
    match: 'revenge',
    spec: {
      id: 'psy-rec-revenge',
      psychologyType: 'Revenge Trading',
      title: 'Revenge trading (from recommendation)',
      habit: 'Fighting losses with more size',
      improvement: 'Follow the pause / cut-size action',
      traitDeltas: { 'Emotional Control': -8 },
      defaultSeverity: 'HIGH',
    },
  },
  {
    match: '22:00',
    spec: {
      id: 'psy-rec-late',
      psychologyType: 'Late Entry',
      title: 'Late session entries',
      habit: 'Opening after weak hours',
      improvement: 'Block post-22:00 UTC entries',
      traitDeltas: { Patience: -6 },
      defaultSeverity: 'MEDIUM',
    },
  },
];

export function severityFromInsight(
  insightSeverity: TradingInsightSeverity,
  fallback: TradingPsychologySeverity,
): TradingPsychologySeverity {
  switch (insightSeverity) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'HIGH':
      return 'HIGH';
    case 'MEDIUM':
      return 'MEDIUM';
    case 'LOW':
      return 'LOW';
    case 'INFO':
      return 'INFO';
    default:
      return fallback;
  }
}

export function psychologyGradeFromScore(score: number): TradingPsychologyGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export function clampTraitScore(n: number): number {
  return Math.max(
    PSYCHOLOGY_RULES.TRAIT_MIN,
    Math.min(PSYCHOLOGY_RULES.TRAIT_MAX, Math.round(n)),
  );
}

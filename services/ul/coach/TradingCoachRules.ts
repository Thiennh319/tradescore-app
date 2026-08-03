/**
 * Task 15.8 — Trading Coach static maps & status/grade helpers.
 * No market analysis. No metric recalculation.
 */

import type {
  TradingCoachDifficulty,
  TradingCoachGrade,
  TradingCoachOverallStatus,
  TradingCoachPriority,
} from './TradingCoachTypes';

export const COACH_RULES = {
  MAX_DAILY_FOCUS: 3,
  MAX_WEEKLY_GOALS: 5,
  MAX_PRIORITIES: 8,
  MAX_ACTIONS: 10,
  MAX_MESSAGES: 8,
  MAX_CHECKLIST: 6,
  /** Status thresholds on merged coachScore (already-computed inputs only). */
  STATUS_EXCELLENT: 90,
  STATUS_HEALTHY: 75,
  STATUS_IMPROVING: 65,
  STATUS_NEUTRAL: 50,
  STATUS_WARNING: 35,
} as const;

export function coachGradeFromScore(score: number): TradingCoachGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

/**
 * Map merged score + critical flags → overall status.
 * Flags come from existing report fields (severity/decision), not new analysis.
 */
export function overallStatusFromSignals(input: {
  coachScore: number;
  hasCritical: boolean;
  hasWarning: boolean;
  improving: boolean;
}): TradingCoachOverallStatus {
  if (input.hasCritical || input.coachScore < COACH_RULES.STATUS_WARNING) return 'Critical';
  if (input.hasWarning || input.coachScore < COACH_RULES.STATUS_NEUTRAL) return 'Warning';
  if (input.coachScore >= COACH_RULES.STATUS_EXCELLENT) return 'Excellent';
  if (input.coachScore >= COACH_RULES.STATUS_HEALTHY) return 'Healthy';
  if (input.improving || input.coachScore >= COACH_RULES.STATUS_IMPROVING) return 'Improving';
  if (input.coachScore >= COACH_RULES.STATUS_NEUTRAL) return 'Neutral';
  return 'Warning';
}

export function mapRecPriority(
  p: string | null | undefined,
): TradingCoachPriority {
  if (p === 'CRITICAL') return 'CRITICAL';
  if (p === 'HIGH') return 'HIGH';
  if (p === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

export function mapSeverityToPriority(
  severity: string | null | undefined,
): TradingCoachPriority {
  if (severity === 'CRITICAL') return 'CRITICAL';
  if (severity === 'HIGH') return 'HIGH';
  if (severity === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

export function mapEffortToDifficulty(
  effort: string | null | undefined,
): TradingCoachDifficulty {
  if (effort === 'HARD') return 'HARD';
  if (effort === 'EASY') return 'EASY';
  return 'MEDIUM';
}

/** Short actionable coach lines keyed by known recommendation / psychology patterns. */
export const COACH_MESSAGE_BY_SOURCE: Record<string, string> = {
  'ti-rr-low': 'Avoid low RR entries.',
  'ti-lose-streak': 'Stop trading after 2 consecutive losses.',
  'ti-risk-elevated': 'Reduce position size.',
  'ti-timing-worst-hour': 'Trade only during your best session hours.',
  'psy-revenge': 'Stop trading after 2 consecutive losses.',
  'psy-poor-rr': 'Avoid low RR entries.',
  'psy-large-dd': 'Reduce position size.',
  entry_avoid: 'Do not enter until checklist clears.',
  entry_wait: 'Wait for volume, whale, and RR confirmation.',
  strategy_weak: 'Trade only the strongest strategy today.',
  strategy_strong: 'Size within plan on the leading strategy only.',
  protect_capital: 'Protect capital — cut size until risk cools.',
};

export const DEFAULT_CHECKLIST: readonly {
  id: string;
  label: string;
  entryCheckId: string | null;
}[] = [
  { id: 'ck-trend', label: 'Trend aligned', entryCheckId: 'trend_direction' },
  { id: 'ck-volume', label: 'Volume confirmed', entryCheckId: 'volume_confirmation' },
  { id: 'ck-whale', label: 'Whale safe', entryCheckId: 'whale_wall' },
  { id: 'ck-funding', label: 'Funding acceptable', entryCheckId: 'funding' },
  { id: 'ck-rr', label: 'RR >=2', entryCheckId: 'risk_reward' },
  { id: 'ck-rulebook', label: 'RuleBook READY', entryCheckId: 'rulebook_gate' },
] as const;

export const DEFAULT_WEEKLY_GOAL_TEMPLATES: readonly {
  id: string;
  label: string;
  target: string;
  when: 'always' | 'rr' | 'risk' | 'discipline' | 'strategy' | 'performance';
}[] = [
  { id: 'wg-wr', label: 'Win Rate', target: 'WR > 55%', when: 'performance' },
  { id: 'wg-pf', label: 'Profit Factor', target: 'PF > 1.8', when: 'performance' },
  { id: 'wg-rr', label: 'Risk Reward', target: 'RR >=2', when: 'rr' },
  { id: 'wg-dd', label: 'Max Drawdown', target: 'Max DD <8%', when: 'risk' },
  { id: 'wg-disc', label: 'Discipline', target: 'Discipline >80', when: 'discipline' },
] as const;

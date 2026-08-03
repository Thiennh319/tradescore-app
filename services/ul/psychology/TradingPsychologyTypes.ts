/**
 * Task 15.5 — Trading Psychology Engine types.
 * Deterministic behavioral mapping. No AI / React / UI.
 */

export const TRADING_PSYCHOLOGY_VERSION = 1 as const;

export type TradingPsychologyTraitId =
  | 'Discipline'
  | 'Patience'
  | 'Consistency'
  | 'Risk Control'
  | 'Confidence'
  | 'Execution'
  | 'Emotional Control';

export type TradingPsychologyType =
  | 'Over Trading'
  | 'Revenge Trading'
  | 'FOMO'
  | 'Fear'
  | 'Greed'
  | 'Holding Too Long'
  | 'Closing Winners Too Early'
  | 'Moving Stop Loss'
  | 'Ignoring Recommendation'
  | 'Large Drawdown Behavior'
  | 'Poor RR Discipline'
  | 'Coin Switching'
  | 'Late Entry'
  | 'Early Exit'
  | 'Healthy Habit';

export type TradingPsychologySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TradingPsychologyGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export type TradingPsychologyFinding = {
  id: string;
  title: string;
  description: string;
  severity: TradingPsychologySeverity;
  confidence: number;
  psychologyType: TradingPsychologyType;
  evidence: readonly string[];
  habit: string;
  improvement: string;
};

export type TradingPsychologyTrait = {
  id: TradingPsychologyTraitId;
  score: number;
  label: string;
};

export type TradingPsychologySummary = {
  headline: string;
  findingCount: number;
  strengthCount: number;
  weaknessCount: number;
  warningCount: number;
  habitCount: number;
  topSeverity: TradingPsychologySeverity | null;
};

export type TradingPsychologyReport = {
  version: typeof TRADING_PSYCHOLOGY_VERSION;
  summary: TradingPsychologySummary;
  score: number;
  grade: TradingPsychologyGrade;
  traits: readonly TradingPsychologyTrait[];
  strengths: readonly TradingPsychologyFinding[];
  weaknesses: readonly TradingPsychologyFinding[];
  warnings: readonly TradingPsychologyFinding[];
  habits: readonly TradingPsychologyFinding[];
  /** All findings sorted (severity → confidence → title). */
  findings: readonly TradingPsychologyFinding[];
};

export const TRADING_PSYCHOLOGY_SEVERITY_RANK: Record<TradingPsychologySeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export const TRADING_PSYCHOLOGY_TRAIT_IDS: readonly TradingPsychologyTraitId[] = [
  'Discipline',
  'Patience',
  'Consistency',
  'Risk Control',
  'Confidence',
  'Execution',
  'Emotional Control',
] as const;

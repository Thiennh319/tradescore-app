/**
 * Task 15.8 — Trading Coach Engine types.
 * Reads existing reports only. No market analysis / recalculation / prediction.
 */

import type { EntryQualityEvidence } from '../entry/EntryExplainabilityTypes';

export const TRADING_COACH_VERSION = 1 as const;

export type TradingCoachOverallStatus =
  | 'Excellent'
  | 'Healthy'
  | 'Improving'
  | 'Neutral'
  | 'Warning'
  | 'Critical';

export type TradingCoachGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export type TradingCoachPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type TradingCoachDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type TradingCoachSummary = {
  headline: string;
  overallStatus: TradingCoachOverallStatus;
  coachScore: number;
  grade: TradingCoachGrade;
};

export type TradingCoachPriorityItem = {
  id: string;
  title: string;
  priority: TradingCoachPriority;
  source: string;
  /** Referenced report ids only. */
  evidenceRefs: readonly string[];
};

export type TradingCoachAction = {
  id: string;
  title: string;
  description: string;
  priority: TradingCoachPriority;
  expectedBenefit: string;
  estimatedDifficulty: TradingCoachDifficulty;
  source: string;
  evidenceRefs: readonly string[];
};

export type TradingCoachMessage = {
  id: string;
  text: string;
  priority: TradingCoachPriority;
  source: string;
};

export type TradingCoachWeeklyGoal = {
  id: string;
  label: string;
  target: string;
  source: string;
};

export type TradingCoachChecklistItem = {
  id: string;
  label: string;
  /** From entry check status when available; else null. */
  status: 'PASS' | 'WARNING' | 'FAIL' | null;
  source: string;
  evidenceRefs: readonly string[];
};

/** Coach evidence = references only (never invent new analysis). */
export type TradingCoachEvidenceRef = {
  kind: 'insight' | 'recommendation' | 'psychology' | 'strategy' | 'entry_check' | 'entry_evidence';
  id: string;
  label: string;
};

export type TradingCoachReport = {
  version: typeof TRADING_COACH_VERSION;
  summary: TradingCoachSummary;
  dailyFocus: readonly string[];
  topPriorities: readonly TradingCoachPriorityItem[];
  actionPlan: readonly TradingCoachAction[];
  coachMessages: readonly TradingCoachMessage[];
  weeklyGoals: readonly TradingCoachWeeklyGoal[];
  nextSessionChecklist: readonly TradingCoachChecklistItem[];
  confidence: number;
  evidence: readonly TradingCoachEvidenceRef[];
};

export const TRADING_COACH_PRIORITY_RANK: Record<TradingCoachPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/** Re-export for consumers that want entry evidence shape (read-only). */
export type { EntryQualityEvidence };

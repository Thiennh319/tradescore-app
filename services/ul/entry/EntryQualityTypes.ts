/**
 * Task 15.7 — Entry Quality Engine types.
 * Evaluates entry quality only. Consume-only inputs. No AI / React / UI.
 */

import type { EntryQualityEvidence } from './EntryExplainabilityTypes';

export const ENTRY_QUALITY_VERSION = 1 as const;

export type EntryQualitySide = 'LONG' | 'SHORT';

export type EntryQualityDecision = 'ENTER' | 'WAIT' | 'AVOID';

export type EntryQualityGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export type EntryQualityCheckStatus = 'PASS' | 'WARNING' | 'FAIL';

export type EntryQualityPillarId =
  | 'Trend'
  | 'Momentum'
  | 'Volume'
  | 'Liquidity'
  | 'Context'
  | 'Timing'
  | 'Risk'
  | 'Execution';

export type EntryQualityCheckId =
  | 'ema_alignment'
  | 'ema_slope'
  | 'trend_direction'
  | 'momentum'
  | 'rsi_zone'
  | 'macd'
  | 'volume_confirmation'
  | 'cvd_confirmation'
  | 'oi_confirmation'
  | 'funding'
  | 'long_short_ratio'
  | 'whale_wall'
  | 'support'
  | 'resistance'
  | 'atr'
  | 'spread'
  | 'risk_reward'
  | 'liquidity'
  | 'timing'
  | 'execution_readiness'
  | 'rulebook_gate';

export type EntryQualityDetection =
  | 'Late Entry'
  | 'Early Entry'
  | 'Weak Trend'
  | 'Weak Volume'
  | 'No Confirmation'
  | 'Against Trend'
  | 'Funding Risk'
  | 'Whale Resistance'
  | 'Poor RR'
  | 'High Spread'
  | 'High Volatility'
  | 'Low Liquidity';

/** Consume-only market snapshot — does not import Trade Engine / journal types. */
export type EntryQualityMarketSnapshot = {
  sideHint?: EntryQualitySide | null;
  price?: number | null;
  emaFast?: number | null;
  emaMid?: number | null;
  emaSlow?: number | null;
  /** Slope of primary EMA. */
  emaSlope?: 'UP' | 'DOWN' | 'FLAT' | null;
  trendDirection?: 'BULL' | 'BEAR' | 'RANGE' | null;
  momentum?: number | null;
  rsi?: number | null;
  macdHistogram?: number | null;
  volumeRatio?: number | null;
  cvdTrend?: 'UP' | 'DOWN' | 'FLAT' | null;
  oiChangePct?: number | null;
  fundingRate?: number | null;
  longShortRatio?: number | null;
  whaleWall?: 'SUPPORT' | 'RESISTANCE' | 'NONE' | null;
  support?: number | null;
  resistance?: number | null;
  atr?: number | null;
  /** ATR as % of price when known. */
  atrPct?: number | null;
  spreadPct?: number | null;
  liquidityScore?: number | null;
  sessionQuality?: 'GOOD' | 'OK' | 'POOR' | null;
  /**
   * Optional whale notional for explainability only.
   * Ignored by scoring / decision (Task 15.7.1).
   */
  whaleSizeUsdt?: number | null;
};

/** Consume-only RuleBook view — never mutated. */
export type EntryQualityRuleBookView = {
  status?: 'READY' | 'WATCH' | 'BLOCKED' | 'LOCKED' | null;
  passedRules?: readonly string[] | null;
  failedRules?: readonly string[] | null;
  blockedReasons?: readonly string[] | null;
  minRr?: number | null;
};

/** Entry decision / trade metadata consumed for quality evaluation. */
export type EntryQualityEntryDecisionInput = {
  side: EntryQualitySide;
  plannedRr?: number | null;
  timing?: 'EARLY' | 'ON_TIME' | 'LATE' | null;
  executionReady?: boolean | null;
  /** Optional caller hint — engine may still override via blockers. */
  proposedDecision?: EntryQualityDecision | null;
};

export type EntryQualityCheck = {
  id: EntryQualityCheckId;
  title: string;
  status: EntryQualityCheckStatus;
  weight: number;
  pillar: EntryQualityPillarId;
  reason: string;
  recommendation: string;
};

export type EntryQualityPillarScore = {
  id: EntryQualityPillarId;
  weight: number;
  score: number;
  checkCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
};

export type EntryQualitySummary = {
  headline: string;
  checkCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  blockerCount: number;
  topDetection: EntryQualityDetection | null;
};

export type EntryQualityReport = {
  version: typeof ENTRY_QUALITY_VERSION;
  summary: EntryQualitySummary;
  score: number;
  grade: EntryQualityGrade;
  confidence: number;
  decision: EntryQualityDecision;
  strengths: readonly string[];
  weaknesses: readonly string[];
  passedChecks: readonly EntryQualityCheck[];
  failedChecks: readonly EntryQualityCheck[];
  blockedReasons: readonly string[];
  recommendations: readonly string[];
  pillars: readonly EntryQualityPillarScore[];
  checks: readonly EntryQualityCheck[];
  detections: readonly EntryQualityDetection[];
  /** Task 15.7.1 — structured evidence (one per check). Read-only for Coach/AI/UI. */
  evidence: readonly EntryQualityEvidence[];
};

export const ENTRY_QUALITY_PILLAR_WEIGHTS: Record<EntryQualityPillarId, number> = {
  Trend: 20,
  Momentum: 10,
  Volume: 15,
  Liquidity: 10,
  Context: 15,
  Timing: 10,
  Risk: 10,
  Execution: 10,
};

export const ENTRY_QUALITY_CHECK_STATUS_SCORE: Record<EntryQualityCheckStatus, number> = {
  PASS: 100,
  WARNING: 50,
  FAIL: 0,
};

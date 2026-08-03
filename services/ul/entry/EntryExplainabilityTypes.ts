/**
 * Task 15.7.1 — Entry Quality explainability types.
 * Structured evidence only. Does not affect scoring / decision.
 */

import type {
  EntryQualityCheckId,
  EntryQualityCheckStatus,
} from './EntryQualityTypes';

export type EntryQualityEvidenceSource =
  | 'EMA'
  | 'Volume'
  | 'Funding'
  | 'OI'
  | 'Whale'
  | 'ATR'
  | 'CVD'
  | 'RSI'
  | 'MACD'
  | 'Momentum'
  | 'Trend'
  | 'Liquidity'
  | 'Spread'
  | 'Support'
  | 'Resistance'
  | 'LS Ratio'
  | 'RuleBook'
  | 'Entry'
  | 'Market Snapshot'
  | 'Timing'
  | 'Execution';

export type EntryQualityEvidence = {
  checkId: EntryQualityCheckId;
  title: string;
  status: EntryQualityCheckStatus;
  /** Observed value (formatted string). "n/a" when missing. */
  actual: string;
  /** Rule / threshold expectation (formatted string). */
  expected: string;
  /** Unit label, or empty string when not applicable. */
  unit: string;
  weight: number;
  reason: string;
  recommendation: string;
  source: EntryQualityEvidenceSource;
};

export const ENTRY_QUALITY_EVIDENCE_MISSING = 'n/a' as const;

/**
 * Task 15.2 — UL Compare Engine types.
 * Pure domain types. No React / UI.
 */

export const UL_COMPARE_VERSION = 1 as const;

export type ULCompareTrend = 'UP' | 'DOWN' | 'FLAT';

export type ULComparePeriodId =
  | 'today'
  | '7d'
  | '30d'
  | '90d'
  | '180d'
  | '365d'
  | 'all'
  | 'custom';

export type ULComparePeriodSpec =
  | { id: Exclude<ULComparePeriodId, 'custom'> }
  | { id: 'custom'; startMs: number; endMs: number };

export type ULCompareMetricKey =
  | 'trades'
  | 'winRate'
  | 'profitFactor'
  | 'expectancy'
  | 'averageRr'
  | 'netPnl'
  | 'largestWin'
  | 'largestLoss'
  | 'recoveryFactor'
  | 'maxDrawdown'
  | 'consistency'
  | 'stability'
  | 'performanceScore';

/** Flat metric bag used for side-by-side compare (copied from UL core metrics). */
export type ULCompareMetricBag = {
  trades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  averageRr: number | null;
  netPnl: number;
  largestWin: number | null;
  largestLoss: number | null;
  recoveryFactor: number | null;
  maxDrawdown: number;
  consistency: number;
  stability: number;
  performanceScore: number;
};

export type ULCompareSide = {
  label: string;
  period: ULComparePeriodSpec | null;
  range: { startMs: number; endMs: number } | null;
  metrics: ULCompareMetricBag;
};

export type ULCompareMetricRow = {
  key: ULCompareMetricKey;
  label: string;
  current: number | null;
  previous: number | null;
  /** current − previous */
  delta: number | null;
  /** ((current − previous) / |previous|) × 100; null if previous≈0 */
  pctDelta: number | null;
  trend: ULCompareTrend;
  /** True when a higher numeric value is generally better for this metric. */
  higherIsBetter: boolean;
};

export type ULCompareHighlight = {
  id: string;
  tone: 'positive' | 'negative' | 'neutral';
  title: string;
  detail: string;
  metricKey: ULCompareMetricKey;
};

export type ULCompareSummary = {
  improvedCount: number;
  worsenedCount: number;
  flatCount: number;
  headline: string;
};

export type ULCompareReport = {
  version: typeof UL_COMPARE_VERSION;
  current: ULCompareSide;
  previous: ULCompareSide;
  rows: readonly ULCompareMetricRow[];
  summary: ULCompareSummary;
  highlights: readonly ULCompareHighlight[];
};

/** Input accepted by buildULComparisonReport — metrics bag or full side. */
export type ULCompareReportInput =
  | ULCompareMetricBag
  | ULCompareSide
  | {
      label?: string;
      period?: ULComparePeriodSpec | null;
      range?: { startMs: number; endMs: number } | null;
      metrics: ULCompareMetricBag;
    };

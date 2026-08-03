/**
 * V4.1 Rulebook Trace — frozen export contracts.
 * Vocabulary: PASS | FAIL | WATCH | SKIPPED | INFO (no V3/V4 HARD/SOFT/UNLOCK).
 * Copy-only from SignalRowV41 + pure detectors — never network/scan.
 */

import type { SignalRowV41 } from '../../v41/scanV41';
import type { VisibilityMode } from '../../v41/types';
import type { V41ExportMeta, V41ExportMetaInput } from '../types/V41ExportMeta';
import type { V41ExportScalar } from '../formatters/markdown';

/** Pipeline stage owning the rule. */
export type RulebookV41Stage =
  | 'trend_reversal'
  | 'breakout'
  | 'market_context'
  | 'decision'
  | 'visibility'
  | 'early_warning'
  | 'momentum';

/** V4.1 rule status — do not use HARD/SOFT/UNLOCK. */
export type RulebookV41Status = 'PASS' | 'FAIL' | 'WATCH' | 'SKIPPED' | 'INFO';

export interface RulebookV41EvidenceItem {
  label: string;
  value: V41ExportScalar;
}

/**
 * One evaluated rule row for Rulebook V4.1 Trace.
 * actual/threshold are display copies — Builder never invents thresholds.
 */
export interface RulebookV41Rule {
  id: string;
  name: string;
  stage: RulebookV41Stage;
  status: RulebookV41Status;
  actual: V41ExportScalar;
  threshold: V41ExportScalar;
  unit?: string;
  sourceModule: string;
  reasonVi: string;
  evidence?: RulebookV41EvidenceItem[];
  /** What this rule gates, e.g. ACTIVE | LONG/SHORT | TRADE_MODE */
  gates?: string;
  /**
   * How values were obtained — for audit of Builder fidelity.
   * row_field = read from SignalRowV41; pure_recall = re-call exported pure function;
   * mirrored_private = same conditions as a non-exported helper, using public config.
   */
  dataSource: 'row_field' | 'pure_recall' | 'mirrored_private' | 'condition_from_snapshot';
  /** Exact field path or function name used. */
  dataSourceDetail: string;
}

export type RulebookV41DecisionOutput = 'LONG' | 'SHORT' | 'WATCH' | 'IGNORE' | 'UNAVAILABLE';

export interface RulebookV41Summary {
  totalRules: number;
  passed: number;
  failed: number;
  watch: number;
  skipped: number;
  info: number;
  decisionOutput: RulebookV41DecisionOutput;
  visibilityMode: VisibilityMode | 'UNAVAILABLE';
  trendReversalState: 'ACTIVE' | 'WATCH' | 'UNAVAILABLE';
  marketContextApplied: boolean | null;
  /** Decision hard-block codes (V4.1) — not V3 HARD block. */
  decisionBlockCodes: string[];
}

export interface RulebookV41InputSnapshot {
  symbol: string;
  scanTimestamp: number;
  fetchedAt: number;
  trendStrength: number;
  trendDirection: string;
  trendExhaustion: number;
  volumeDivergencePts: number;
  reversalProbability: number;
  marketConfidence: number;
  marketState: string;
  visibilityMode: VisibilityMode | 'UNAVAILABLE';
  earlyWarningSeverity: string;
  momentumConfirmedLong: boolean | null;
  momentumConfirmedShort: boolean | null;
  fundingRate: number | null;
  hasKlines1H: boolean;
  hasKlines4H: boolean;
  hasBtcKlines4H: boolean;
  rowError: string | null;
}

export interface RulebookV41Trace {
  metadata: V41ExportMeta;
  symbol: string;
  filename: string;
  input: RulebookV41InputSnapshot;
  rules: RulebookV41Rule[];
  summary: RulebookV41Summary;
  /** Pipe steps for DECISION CHAIN section. */
  decisionChain: string[];
}

export interface RulebookV41ExportInput {
  row: SignalRowV41;
  metadata?: V41ExportMetaInput | null;
  symbol?: string | null;
}

export const RULEBOOK_V41_FILENAME_PREFIX = '01_RULEBOOK_V41_' as const;

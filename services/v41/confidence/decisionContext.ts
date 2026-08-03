/**
 * Metadata Confidence → Decision (Task 4).
 * Đóng gói một lần tại Confidence Engine — Decision chỉ đọc, không phân tích indicator.
 */

import type { ConfidenceBreakdown } from '../confidenceEngine';
import type { TrendReversalWithContextResult } from '../marketContextFilter';
import type { TrendDirection } from '../types';

export type ProposedTradeDirection = 'LONG' | 'SHORT' | 'NONE';

export interface ConfidenceDecisionContext {
  proposedDirection: ProposedTradeDirection;
  altTrendDirection: TrendDirection;
  trendReversalConfirmed: boolean;
  marketContextPass: boolean | null;
  marketContextDenied: boolean;
  marketContextApplied: boolean;
  completenessMultiplier: number;
  trendSignalCount: number;
  dataInsufficient: boolean;
  hardBlocks: readonly string[];
}

function resolveProposedDirection(altTrend: TrendDirection): ProposedTradeDirection {
  if (altTrend === 'BULL') return 'SHORT';
  if (altTrend === 'BEAR') return 'LONG';
  return 'NONE';
}

/** Gói eligibility — chỉ gọi từ Confidence Engine. */
export function buildConfidenceDecisionContext(
  input: TrendReversalWithContextResult,
  breakdown: ConfidenceBreakdown,
): ConfidenceDecisionContext {
  const altTrendDirection = input.trendDirection ?? 'NEUTRAL';
  const proposedDirection = resolveProposedDirection(altTrendDirection);
  const trendSignalCount = input.detail.activeConditionCount;

  // Confirmed = TR đã ACTIVE (binary ≥3/4 hoặc continuous ≥0.6).
  // Không đòi thêm count≥4 — đó là double-gate thừa (ACTIVE đã qua ngưỡng TR).
  const trendReversalConfirmed =
    input.preContextState === 'ACTIVE' || input.state === 'ACTIVE';

  const marketContextApplied = input.marketContext?.applied === true;
  const marketContextPass = marketContextApplied
    ? (input.marketContext?.pass ?? null)
    : null;
  const marketContextDenied = marketContextPass === false;

  const hardBlocks: string[] = [];
  if (marketContextDenied) {
    hardBlocks.push('MARKET_CONTEXT_DENIED');
  }
  if (!trendReversalConfirmed) {
    hardBlocks.push('TREND_REVERSAL_UNCONFIRMED');
  }

  const dataInsufficient =
    altTrendDirection === 'NEUTRAL' ||
    trendSignalCount === 0 ||
    breakdown.completenessMultiplier <= 0;

  return {
    proposedDirection,
    altTrendDirection,
    trendReversalConfirmed,
    marketContextPass,
    marketContextDenied,
    marketContextApplied,
    completenessMultiplier: breakdown.completenessMultiplier,
    trendSignalCount,
    dataInsufficient,
    hardBlocks,
  };
}

export function readConfidenceDecisionContext(
  confidenceResult: { debug?: { raw?: Record<string, unknown> } },
): ConfidenceDecisionContext | null {
  const raw = confidenceResult.debug?.raw;
  if (!raw || typeof raw !== 'object') return null;
  const ctx = raw.decisionContext;
  if (!ctx || typeof ctx !== 'object') return null;
  return ctx as ConfidenceDecisionContext;
}

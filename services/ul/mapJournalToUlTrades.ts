/**
 * Task 15.0 — Optional journal → ULTradeInput adapter.
 * Maps completed AiTradeJournalEntry rows only. No UI wiring.
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import type { ULTradeInput, UlSide } from './types';

const CLOSED_OUTCOMES = new Set(['WIN', 'LOSS', 'BREAKEVEN']);

function isClosedEligible(entry: AiTradeJournalEntry): boolean {
  return CLOSED_OUTCOMES.has(entry.outcome.status);
}

function resolveDuration(entry: AiTradeJournalEntry): number {
  const o = entry.outcome;
  if (typeof o.holdingTimeMinutes === 'number' && Number.isFinite(o.holdingTimeMinutes)) {
    return Math.max(0, o.holdingTimeMinutes);
  }
  if (typeof o.holdDurationMinutes === 'number' && Number.isFinite(o.holdDurationMinutes)) {
    return Math.max(0, o.holdDurationMinutes);
  }
  const closedAt = o.exitTimestamp ?? entry.timestamp;
  const openedAt = entry.timestamp;
  if (closedAt > openedAt) return (closedAt - openedAt) / 60_000;
  return 0;
}

function resolveStrategy(entry: AiTradeJournalEntry): string {
  if (entry.strategySource) return entry.strategySource;
  const tag = entry.tags?.find((t) => t.trim().length > 0);
  return tag ?? 'UNKNOWN';
}

/**
 * Convert journal entries → UL closed-trade inputs.
 * Skips OPEN / PENDING / CANCELLED and rows without numeric PnL.
 */
export function mapJournalToUlTrades(
  entries: readonly AiTradeJournalEntry[],
): ULTradeInput[] {
  const out: ULTradeInput[] = [];

  for (const entry of entries) {
    if (!isClosedEligible(entry)) continue;
    const pnl = entry.outcome.pnlUSDT;
    if (typeof pnl !== 'number' || !Number.isFinite(pnl)) continue;

    const side: UlSide =
      entry.scoring.direction === 'SHORT' ? 'SHORT' : 'LONG';
    const entryPx = entry.market.entryPrice;
    const exitPx =
      typeof entry.outcome.exitPrice === 'number' && Number.isFinite(entry.outcome.exitPrice)
        ? entry.outcome.exitPrice
        : entryPx;
    const rr =
      typeof entry.plan.rrProposed === 'number' &&
      Number.isFinite(entry.plan.rrProposed) &&
      entry.plan.rrProposed > 0
        ? entry.plan.rrProposed
        : null;
    const closedAt = entry.outcome.exitTimestamp ?? entry.timestamp;
    const openedAt = entry.timestamp;

    out.push({
      id: entry.id,
      symbol: entry.symbol,
      side,
      entry: entryPx,
      exit: exitPx,
      pnl,
      rr,
      duration: resolveDuration(entry),
      strategy: resolveStrategy(entry),
      openedAt,
      closedAt,
      reasonOpen: entry.plan.openReason ?? entry.scoring.decision ?? '',
      reasonClose: entry.outcome.closeReason ?? entry.outcome.exitReason ?? '',
    });
  }

  return out;
}

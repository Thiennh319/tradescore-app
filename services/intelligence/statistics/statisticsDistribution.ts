/**
 * Task 14.2 — Distribution (W / L / BE / cancelled).
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';

export type DistributionResult = {
  wins: number;
  losses: number;
  breakevens: number;
  cancelled: number;
};

export function computeDistribution(
  eligible: readonly AiTradeJournalEntry[],
  allJournal: readonly AiTradeJournalEntry[],
): DistributionResult {
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  for (const e of eligible) {
    if (e.outcome.status === 'WIN') wins += 1;
    else if (e.outcome.status === 'LOSS') losses += 1;
    else if (e.outcome.status === 'BREAKEVEN') breakevens += 1;
  }
  let cancelled = 0;
  for (const e of allJournal) {
    if (!e.archived && e.outcome.status === 'CANCELLED') cancelled += 1;
  }
  return { wins, losses, breakevens, cancelled };
}

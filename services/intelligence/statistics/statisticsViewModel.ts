/**
 * Task 14.2 / 14.4.1 — Statistics ViewModel + fingerprint-first cache.
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { isStatsEligibleOutcome } from '../../journalService';
import { buildJournalStatisticsFingerprint } from '../shared/fingerprint';
import { aggregateStatistics } from './statisticsAggregator';
import { finalizeStatisticsProjection } from './statisticsProjector';
import type { StatisticsViewModel } from './statisticsTypes';

type CacheEntry = {
  fingerprint: string;
  vm: StatisticsViewModel;
};

let cache: CacheEntry | null = null;

function eligibleOf(journal: readonly AiTradeJournalEntry[]): AiTradeJournalEntry[] {
  return journal.filter((e) => !e.archived && isStatsEligibleOutcome(e.outcome.status));
}

/** Build Statistics ViewModel (AI / Dashboard / Performance ready). */
export function buildStatisticsViewModel(
  journal: readonly AiTradeJournalEntry[],
): StatisticsViewModel {
  const eligible = eligibleOf(journal);
  const fingerprint = buildJournalStatisticsFingerprint(eligible);
  if (cache && cache.fingerprint === fingerprint) {
    return cache.vm;
  }
  const raw = aggregateStatistics(journal, eligible);
  const vm = finalizeStatisticsProjection(raw);
  cache = { fingerprint, vm };
  return vm;
}

export function clearStatisticsIntelligenceCache(): void {
  cache = null;
}

export function getStatisticsCacheFingerprint(): string | null {
  return cache?.fingerprint ?? null;
}

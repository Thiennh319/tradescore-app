/**
 * Task 14.3 — Legacy PerformanceIntelligence facade.
 * Reads Statistics ViewModel → Performance ranking (no Journal aggregation).
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { buildStatisticsViewModel } from './statistics';
import {
  buildPerformanceViewModel,
  type PerformanceViewModel,
} from './performance';
import type {
  PerformanceIntelligence,
  PerformanceVersionRow,
  WinrateBucketRow,
} from './types';

function toWinrate(rows: { key: string; trades: number; winRate: number | null }[]): WinrateBucketRow[] {
  return rows.map((r) => ({
    key: r.key,
    trades: r.trades,
    wins: 0,
    winRate: r.winRate,
  }));
}

export function mapPerformanceViewModelToLegacy(
  vm: PerformanceViewModel,
): PerformanceIntelligence {
  const byVersion: PerformanceVersionRow[] = vm.strategyRanking.map((r) => ({
    version: r.key,
    trades: r.trades,
    winRate: r.winRate,
    avgPnlUsdt: r.expectancyUsdt,
  }));

  return {
    byVersion,
    byCoin: toWinrate(vm.coinRanking),
    byTrigger: toWinrate(vm.triggerRanking),
    byTrend: toWinrate(vm.tagIntelligence.topWinningTags.filter((t) => t.key === 'trend')),
    byVolatilityProxy: [],
    byFunding: toWinrate(vm.tagIntelligence.topWinningTags.filter((t) => t.key === 'funding')),
    byWhale: toWinrate(vm.tagIntelligence.topWinningTags.filter((t) => t.key === 'whale')),
    byAdvisor: toWinrate(vm.advisorRanking),
    aiRecommendations: vm.recommendations.map(
      (r) =>
        `Recommendation: [${r.action}] ${r.target} — ${r.reason} Evidence: ${r.evidence.join('; ')}`,
    ),
  };
}

/**
 * UI / legacy entry: Journal → Statistics VM → Performance VM → legacy shape.
 * Performance layer itself never aggregates Journal.
 */
export function buildPerformanceIntelligence(
  journal: readonly AiTradeJournalEntry[],
): PerformanceIntelligence {
  const stats = buildStatisticsViewModel(journal);
  const vm = buildPerformanceViewModel(stats);
  return mapPerformanceViewModelToLegacy(vm);
}

export { buildPerformanceViewModel } from './performance';

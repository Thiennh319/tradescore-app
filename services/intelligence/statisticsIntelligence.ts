/**
 * Task 14.2 — Legacy StatisticsIntelligence facade.
 * Metrics defined uniquely in services/intelligence/statistics (Rule #69).
 */

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import {
  buildStatisticsViewModel,
  type StatisticsViewModel,
} from './statistics';
import type { StatisticsIntelligence, WinrateBucketRow } from './types';

function toWinrateRow(r: {
  key: string;
  trades: number;
  wins: number;
  winRate: number | null;
}): WinrateBucketRow {
  return {
    key: r.key,
    trades: r.trades,
    wins: r.wins,
    winRate: r.winRate,
  };
}

/** Map ViewModel → legacy shape (Journal summary / older callers). */
export function mapStatisticsViewModelToLegacy(
  vm: StatisticsViewModel,
): StatisticsIntelligence {
  return {
    byCoin: vm.byCoin.map(toWinrateRow),
    byStrategy: vm.byStrategy.map(toWinrateRow),
    byTrigger: vm.byTrigger.map(toWinrateRow),
    byConfidence: vm.byConfidence.map(toWinrateRow),
    byFunding: vm.byFunding.map(toWinrateRow),
    byWhale: vm.byWhale.map(toWinrateRow),
    holdingTimeAvgMinutes: vm.overview.averageHoldingMinutes,
    averageRr: vm.overview.averageRr,
    expectancyUsdt: vm.profit.expectancyUsdt,
    maxDrawdownUsdt: vm.drawdown.maxDrawdownUsdt,
    profitFactor: vm.profit.profitFactor,
    sessionStats: vm.bySessionType.map(toWinrateRow),
    distribution: {
      wins: vm.overview.wins,
      losses: vm.overview.losses,
      breakevens: vm.overview.breakEven,
      cancelled: vm.cancelledCount,
    },
    sampleSize: vm.sampleSize,
  };
}

export function buildStatisticsIntelligence(
  journal: readonly AiTradeJournalEntry[],
): StatisticsIntelligence {
  return mapStatisticsViewModelToLegacy(buildStatisticsViewModel(journal));
}

export { buildStatisticsViewModel } from './statistics';

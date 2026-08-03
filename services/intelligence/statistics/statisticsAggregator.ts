/**
 * Task 14.2 — O(n) Aggregator (một pass chính + tag pass O(n)).
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { buildJournalStatisticsFingerprint } from '../shared/fingerprint';
import { parseProjectedTags } from '../parseProjectedTags';
import {
  advisorBucketLabel,
  coinKey,
  confidenceKey,
  dayKey,
  fundingKey,
  monthKey,
  sessionTypeKey,
  sessionZoneKey,
  strategyKey,
  triggerKey,
  weekKey,
  whaleKey,
} from './statisticsGrouping';
import {
  absorbHold,
  absorbPnl,
  absorbRr,
  emptyAcc,
  metricAverage,
  metricExpectancy,
  metricMedian,
  metricProfitFactor,
  metricWinRate,
  sortedGroupRows,
} from './statisticsMetrics';
import { computeDistribution } from './statisticsDistribution';
import { computeDrawdownMetrics } from './statisticsDrawdown';
import { computeTagStatistics } from './statisticsTags';
import type {
  GroupAcc,
  StatisticsOverview,
  StatisticsProfitMetrics,
  StatisticsTimeBucket,
  StatisticsViewModel,
} from './statisticsTypes';

function ensure(map: Map<string, GroupAcc>, key: string): GroupAcc {
  let acc = map.get(key);
  if (!acc) {
    acc = emptyAcc();
    map.set(key, acc);
  }
  return acc;
}

function bump(acc: GroupAcc, e: AiTradeJournalEntry): void {
  acc.trades += 1;
  if (e.outcome.status === 'WIN') acc.wins += 1;
  else if (e.outcome.status === 'LOSS') acc.losses += 1;
  else if (e.outcome.status === 'BREAKEVEN') acc.breakevens += 1;
  absorbPnl(acc, e.outcome.pnlUSDT);
  absorbRr(acc, e.plan.rrProposed);
  absorbHold(acc, e.outcome.holdingTimeMinutes ?? e.outcome.holdDurationMinutes);
}

function toTimeRows(
  map: Map<string, GroupAcc>,
  period: StatisticsTimeBucket['period'],
): StatisticsTimeBucket[] {
  return sortedGroupRows(map).map((r) => ({ ...r, period }));
}

export type AggregateRaw = {
  overview: StatisticsOverview;
  profit: StatisticsProfitMetrics;
  drawdown: ReturnType<typeof computeDrawdownMetrics>;
  byCoin: ReturnType<typeof sortedGroupRows>;
  byStrategy: ReturnType<typeof sortedGroupRows>;
  byTrigger: ReturnType<typeof sortedGroupRows>;
  byConfidence: ReturnType<typeof sortedGroupRows>;
  byAdvisor: ReturnType<typeof sortedGroupRows>;
  byFunding: ReturnType<typeof sortedGroupRows>;
  byWhale: ReturnType<typeof sortedGroupRows>;
  bySessionType: ReturnType<typeof sortedGroupRows>;
  byDay: StatisticsTimeBucket[];
  byWeek: StatisticsTimeBucket[];
  byMonth: StatisticsTimeBucket[];
  bySessionZone: StatisticsTimeBucket[];
  byTag: ReturnType<typeof computeTagStatistics>['byTag'];
  byTagCombo: ReturnType<typeof computeTagStatistics>['byTagCombo'];
  sampleSize: number;
  cancelledCount: number;
  projectionFingerprint: string;
};

/** Single O(n) pass over eligible TI views (+ O(n) tag pass). */
export function aggregateStatistics(
  journal: readonly AiTradeJournalEntry[],
  eligible: readonly AiTradeJournalEntry[],
): AggregateRaw {
  const byCoin = new Map<string, GroupAcc>();
  const byStrategy = new Map<string, GroupAcc>();
  const byTrigger = new Map<string, GroupAcc>();
  const byConfidence = new Map<string, GroupAcc>();
  const byAdvisor = new Map<string, GroupAcc>();
  const byFunding = new Map<string, GroupAcc>();
  const byWhale = new Map<string, GroupAcc>();
  const bySessionType = new Map<string, GroupAcc>();
  const byDay = new Map<string, GroupAcc>();
  const byWeek = new Map<string, GroupAcc>();
  const byMonth = new Map<string, GroupAcc>();
  const bySessionZone = new Map<string, GroupAcc>();

  const pnls: number[] = [];
  const winsPnls: number[] = [];
  const lossPnls: number[] = [];
  let rrSum = 0;
  let rrCount = 0;
  let holdSum = 0;
  let holdCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  for (const e of eligible) {
    const meta = parseProjectedTags(e);

    bump(ensure(byCoin, coinKey(e)), e);
    bump(ensure(byStrategy, strategyKey(e)), e);
    bump(ensure(byTrigger, triggerKey(e)), e);
    bump(ensure(byConfidence, confidenceKey(e)), e);
    bump(ensure(byFunding, fundingKey(e)), e);
    bump(ensure(byWhale, whaleKey(e)), e);
    bump(ensure(bySessionType, sessionTypeKey(e)), e);
    bump(ensure(byDay, dayKey(e)), e);
    bump(ensure(byWeek, weekKey(e)), e);
    bump(ensure(byMonth, monthKey(e)), e);
    bump(ensure(bySessionZone, sessionZoneKey(e)), e);

    const pnl = e.outcome.pnlUSDT;
    if (pnl != null && Number.isFinite(pnl)) {
      pnls.push(pnl);
      if (pnl > 0) {
        winsPnls.push(pnl);
        grossProfit += pnl;
      } else if (pnl < 0) {
        lossPnls.push(pnl);
        grossLoss += Math.abs(pnl);
      }
    }
    if (Number.isFinite(e.plan.rrProposed) && e.plan.rrProposed > 0) {
      rrSum += e.plan.rrProposed;
      rrCount += 1;
    }
    const hold = e.outcome.holdingTimeMinutes ?? e.outcome.holdDurationMinutes;
    if (hold != null && Number.isFinite(hold)) {
      holdSum += hold;
      holdCount += 1;
    }

    const seenAdvisorLabels = new Set<string>();
    for (const step of meta.adviserTimeline) {
      const label = advisorBucketLabel(step.advisorActionCode);
      const acc = ensure(byAdvisor, label);
      acc.occurrences += 1;
      if (e.outcome.status === 'WIN') acc.successHits += 1;
      if (!seenAdvisorLabels.has(label)) {
        seenAdvisorLabels.add(label);
        bump(acc, e);
      }
    }
  }

  const dist = computeDistribution(eligible, journal);
  const netPnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) : null;
  const sortedPnls = [...pnls].sort((a, b) => a - b);

  const overview: StatisticsOverview = {
    totalTrades: eligible.length,
    wins: dist.wins,
    losses: dist.losses,
    breakEven: dist.breakevens,
    winRate: metricWinRate(dist.wins, eligible.length),
    netPnlUsdt: netPnl,
    grossProfitUsdt: pnls.length > 0 ? grossProfit : null,
    grossLossUsdt: pnls.length > 0 ? grossLoss : null,
    averageRr: metricAverage(rrSum, rrCount),
    averageHoldingMinutes: metricAverage(holdSum, holdCount),
  };

  const profit: StatisticsProfitMetrics = {
    profitFactor: metricProfitFactor(grossProfit, grossLoss),
    expectancyUsdt: metricExpectancy(netPnl ?? 0, pnls.length),
    averageWinUsdt: metricAverage(
      winsPnls.reduce((a, b) => a + b, 0),
      winsPnls.length,
    ),
    averageLossUsdt: metricAverage(
      lossPnls.reduce((a, b) => a + b, 0),
      lossPnls.length,
    ),
    largestWinUsdt: winsPnls.length > 0 ? Math.max(...winsPnls) : null,
    largestLossUsdt: lossPnls.length > 0 ? Math.min(...lossPnls) : null,
    averageTradeUsdt: metricExpectancy(netPnl ?? 0, pnls.length),
    medianTradeUsdt: metricMedian(sortedPnls),
  };

  const { byTag, byTagCombo } = computeTagStatistics(eligible);

  return {
    overview,
    profit,
    drawdown: computeDrawdownMetrics(eligible, netPnl),
    byCoin: sortedGroupRows(byCoin),
    byStrategy: sortedGroupRows(byStrategy),
    byTrigger: sortedGroupRows(byTrigger),
    byConfidence: sortedGroupRows(byConfidence),
    byAdvisor: sortedGroupRows(byAdvisor),
    byFunding: sortedGroupRows(byFunding),
    byWhale: sortedGroupRows(byWhale),
    bySessionType: sortedGroupRows(bySessionType),
    byDay: toTimeRows(byDay, 'day'),
    byWeek: toTimeRows(byWeek, 'week'),
    byMonth: toTimeRows(byMonth, 'month'),
    bySessionZone: toTimeRows(bySessionZone, 'session'),
    byTag,
    byTagCombo,
    sampleSize: eligible.length,
    cancelledCount: dist.cancelled,
    projectionFingerprint: buildJournalStatisticsFingerprint(eligible),
  };
}

export function projectAggregateToViewModel(raw: AggregateRaw): StatisticsViewModel {
  return {
    overview: raw.overview,
    profit: raw.profit,
    drawdown: raw.drawdown,
    byCoin: raw.byCoin,
    byStrategy: raw.byStrategy,
    byTrigger: raw.byTrigger,
    byConfidence: raw.byConfidence,
    byAdvisor: raw.byAdvisor,
    byTag: raw.byTag,
    byTagCombo: raw.byTagCombo,
    byDay: raw.byDay,
    byWeek: raw.byWeek,
    byMonth: raw.byMonth,
    bySessionZone: raw.bySessionZone,
    bySessionType: raw.bySessionType,
    byFunding: raw.byFunding,
    byWhale: raw.byWhale,
    sampleSize: raw.sampleSize,
    projectionFingerprint: raw.projectionFingerprint,
    cancelledCount: raw.cancelledCount,
  };
}

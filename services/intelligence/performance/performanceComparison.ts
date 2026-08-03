/**
 * Task 14.3 — Comparison axes (read Statistics rankings — no recompute).
 */

import type { StatisticsViewModel } from '../statistics';
import { rankGroups } from './performanceRanking';
import type { ComparisonAxis } from './performanceTypes';

export function buildComparisons(stats: StatisticsViewModel): ComparisonAxis[] {
  return [
    { axis: 'Strategy', rows: rankGroups(stats.byStrategy) },
    { axis: 'Coin', rows: rankGroups(stats.byCoin) },
    { axis: 'Trigger', rows: rankGroups(stats.byTrigger) },
    { axis: 'Confidence', rows: rankGroups(stats.byConfidence) },
    { axis: 'Advisor', rows: rankGroups(stats.byAdvisor) },
    { axis: 'Tags', rows: rankGroups(stats.byTag) },
    { axis: 'Time', rows: rankGroups(stats.bySessionZone) },
  ];
}

/**
 * Task 14.2 — Projector: AggregateRaw → StatisticsViewModel.
 * (Thin boundary for AI / Dashboard / Performance consumers.)
 */

import type { AggregateRaw } from './statisticsAggregator';
import { projectAggregateToViewModel } from './statisticsAggregator';
import { FOCUS_COINS } from './statisticsGrouping';
import type { StatisticsGroupMetrics, StatisticsViewModel } from './statisticsTypes';

export { projectAggregateToViewModel };

/** Prefer BTC / SOL / BNB / NEAR first, then remaining by trades. */
export function projectCoinFocus(byCoin: StatisticsGroupMetrics[]): StatisticsGroupMetrics[] {
  const preferred = FOCUS_COINS.map((c) => byCoin.find((r) => r.key === c)).filter(
    (r): r is StatisticsGroupMetrics => Boolean(r),
  );
  const rest = byCoin.filter((r) => !(FOCUS_COINS as readonly string[]).includes(r.key));
  return [...preferred, ...rest];
}

export function finalizeStatisticsProjection(raw: AggregateRaw): StatisticsViewModel {
  const vm = projectAggregateToViewModel(raw);
  return {
    ...vm,
    byCoin: projectCoinFocus(vm.byCoin),
  };
}

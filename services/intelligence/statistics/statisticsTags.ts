/**
 * Task 14.2 — Trade Tag statistics (read tags from Journal Intelligence — no generate).
 */

import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { deriveIntelligenceTradeTags } from '../shared/tradeTags';
import { TAG_COMBOS } from './statisticsGrouping';
import {
  absorbHold,
  absorbPnl,
  absorbRr,
  emptyAcc,
  finalizeGroupMetrics,
} from './statisticsMetrics';
import type { GroupAcc, StatisticsGroupMetrics, StatisticsTagComboRow } from './statisticsTypes';

function bumpTrade(
  acc: GroupAcc,
  e: AiTradeJournalEntry,
): void {
  acc.trades += 1;
  if (e.outcome.status === 'WIN') acc.wins += 1;
  else if (e.outcome.status === 'LOSS') acc.losses += 1;
  else if (e.outcome.status === 'BREAKEVEN') acc.breakevens += 1;
  absorbPnl(acc, e.outcome.pnlUSDT);
  absorbRr(acc, e.plan.rrProposed);
  absorbHold(acc, e.outcome.holdingTimeMinutes ?? e.outcome.holdDurationMinutes);
}

export function computeTagStatistics(
  eligible: readonly AiTradeJournalEntry[],
): { byTag: StatisticsGroupMetrics[]; byTagCombo: StatisticsTagComboRow[] } {
  const tagMap = new Map<string, GroupAcc>();
  const comboMap = new Map<string, GroupAcc>();

  for (const e of eligible) {
    const tags = deriveIntelligenceTradeTags(e);
    const set = new Set(tags);
    for (const t of tags) {
      const acc = tagMap.get(t) ?? emptyAcc();
      bumpTrade(acc, e);
      tagMap.set(t, acc);
    }
    for (const combo of TAG_COMBOS) {
      if (combo.every((t) => set.has(t))) {
        const key = combo.join('+');
        const acc = comboMap.get(key) ?? emptyAcc();
        bumpTrade(acc, e);
        comboMap.set(key, acc);
      }
    }
  }

  const byTag = [...tagMap.entries()]
    .map(([key, acc]) => finalizeGroupMetrics(key, acc))
    .sort((a, b) => b.trades - a.trades);

  const byTagCombo: StatisticsTagComboRow[] = [...comboMap.entries()]
    .map(([key, acc]) => ({
      ...finalizeGroupMetrics(key, acc),
      tags: key.split('+'),
    }))
    .sort((a, b) => b.trades - a.trades);

  return { byTag, byTagCombo };
}

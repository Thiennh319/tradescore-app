/**
 * Task 14.3 — Recommendations with Evidence (Rule #82 / #51).
 * Read-only — không khuyến nghị auto-trade.
 */

import type { StatisticsViewModel } from '../statistics';
import type { PerformanceRecommendation, RankedRow } from './performanceTypes';

export function buildRecommendations(
  stats: StatisticsViewModel,
  coinRanking: readonly RankedRow[],
  strategyRanking: readonly RankedRow[],
  tagIntel: {
    bestTagCombination: RankedRow | null;
    topWinningTags: RankedRow[];
  },
): PerformanceRecommendation[] {
  const out: PerformanceRecommendation[] = [];
  let id = 1;

  const bestCoin = coinRanking[0];
  if (bestCoin && bestCoin.trades >= 1) {
    out.push({
      id: `rec-${id++}`,
      action: 'PRIORITIZE',
      target: bestCoin.key,
      reason: `Coin xếp hạng #1 (score ${bestCoin.score.toFixed(1)}).`,
      evidenceIds: [`coin:${bestCoin.key}`],
      evidence: [
        `winRate=${bestCoin.winRate?.toFixed(1) ?? '—'}%`,
        `expectancy=${bestCoin.expectancyUsdt?.toFixed(2) ?? '—'}U`,
        `trades=${bestCoin.trades}`,
        `source=Statistics.byCoin`,
      ],
    });
  }

  const winningTags = tagIntel.topWinningTags.slice(0, 3);
  for (const t of winningTags) {
    out.push({
      id: `rec-${id++}`,
      action: 'PRIORITIZE',
      target: t.key,
      reason: `Tag thắng mạnh trong Statistics Tag Intelligence.`,
      evidenceIds: [`tag:${t.key}`],
      evidence: [
        `winRate=${t.winRate?.toFixed(1) ?? '—'}%`,
        `pnl=${t.pnlUsdt?.toFixed(1) ?? '—'}U`,
        `source=Statistics.byTag`,
      ],
    });
  }

  if (tagIntel.bestTagCombination) {
    const c = tagIntel.bestTagCombination;
    out.push({
      id: `rec-${id++}`,
      action: 'PRIORITIZE',
      target: c.key,
      reason: 'Best tag combination theo Statistics.',
      evidenceIds: [`tagCombo:${c.key}`],
      evidence: [
        `winRate=${c.winRate?.toFixed(1) ?? '—'}%`,
        `expectancy=${c.expectancyUsdt?.toFixed(2) ?? '—'}U`,
        `source=Statistics.byTagCombo`,
      ],
    });
  }

  const weakCoin = [...coinRanking].reverse().find((r) => r.trades >= 1 && (r.winRate ?? 100) < 45);
  if (weakCoin) {
    out.push({
      id: `rec-${id++}`,
      action: 'REDUCE',
      target: weakCoin.key,
      reason: 'Winrate thấp / xếp hạng đuôi — giám sát drawdown (Rule #51, không auto-disable).',
      evidenceIds: [`coin:${weakCoin.key}`],
      evidence: [
        `winRate=${weakCoin.winRate?.toFixed(1) ?? '—'}%`,
        `pnl=${weakCoin.pnlUsdt?.toFixed(1) ?? '—'}U`,
        `rank=#${weakCoin.rank}`,
        `maxDD_overview=${stats.drawdown.maxDrawdownUsdt?.toFixed(1) ?? '—'}U`,
        `source=Statistics.byCoin+drawdown`,
      ],
    });
  }

  const bestStrategy = strategyRanking[0];
  if (bestStrategy) {
    out.push({
      id: `rec-${id++}`,
      action: 'MONITOR',
      target: bestStrategy.key,
      reason: 'Strategy leading — theo dõi consistency, không tự giao dịch.',
      evidenceIds: [`strategy:${bestStrategy.key}`],
      evidence: [
        `winRate=${bestStrategy.winRate?.toFixed(1) ?? '—'}%`,
        `PF=${bestStrategy.profitFactor?.toFixed(2) ?? '—'}`,
        `source=Statistics.byStrategy`,
      ],
    });
  }

  if (out.length === 0) {
    out.push({
      id: `rec-${id++}`,
      action: 'MONITOR',
      target: 'SAMPLE',
      reason: 'Chưa đủ Statistics cohort để xếp hạng / khuyến nghị.',
      evidenceIds: ['overview'],
      evidence: [`sampleSize=${stats.sampleSize}`, `source=Statistics.overview`],
    });
  }

  // Ensure evidence always present (Rule #82)
  for (const r of out) {
    if (r.evidence.length === 0) r.evidence.push('source=StatisticsViewModel');
  }

  return out;
}

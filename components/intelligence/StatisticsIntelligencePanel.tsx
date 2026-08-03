/**
 * Task 14.2 — Statistics Intelligence panel (Insights) — additive sections, no redesign.
 * Task 15.8.2 — Vietnamese display labels only.
 */
import { useMemo } from 'react';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { vi } from '../../constants/vi';
import { buildStatisticsViewModel } from '../../services/intelligence';
import { IntelligencePanel, IntelRow, WinrateList } from './IntelligenceChrome';
import type { StatisticsGroupMetrics } from '../../services/intelligence/statistics';

const UL = vi.ulAnalytics;

function fmt(n: number | null | undefined, digits = 2, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}${suffix}`;
}

function GroupBlock({
  title,
  rows,
  rich = false,
}: {
  title: string;
  rows: StatisticsGroupMetrics[];
  rich?: boolean;
}) {
  if (!rich) {
    return (
      <>
        <IntelRow label={`— ${title} —`} value="" />
        <WinrateList rows={rows} />
      </>
    );
  }
  return (
    <>
      <IntelRow label={`— ${title} —`} value="" />
      {rows.length === 0 ? (
        <IntelRow label={UL.stats.empty} value="—" />
      ) : (
        rows.slice(0, 8).map((r) => (
          <IntelRow
            key={r.key}
            label={r.key}
            value={`${UL.kpi.winRate} ${fmt(r.winRate, 1, '%')} · ${UL.coin.pnl} ${fmt(r.pnlUsdt, 1, 'U')} · n=${r.trades}`}
          />
        ))
      )}
    </>
  );
}

export function StatisticsIntelligencePanel({
  entries,
}: {
  entries: readonly AiTradeJournalEntry[];
}) {
  const s = useMemo(() => buildStatisticsViewModel(entries), [entries]);
  const o = s.overview;
  const p = s.profit;
  const d = s.drawdown;

  return (
    <IntelligencePanel title={UL.insight.tradingIntelligenceStats}>
      <IntelRow label={`— ${UL.stats.overview} —`} value="" />
      <IntelRow label={UL.stats.total} value={String(o.totalTrades)} />
      <IntelRow label="W / L / BE" value={`${o.wins}/${o.losses}/${o.breakEven}`} />
      <IntelRow label={UL.stats.winrate} value={fmt(o.winRate, 1, '%')} />
      <IntelRow label={UL.stats.netPnl} value={fmt(o.netPnlUsdt, 2, ' U')} />
      <IntelRow
        label="Gross +/−"
        value={`${fmt(o.grossProfitUsdt, 1)} / ${fmt(o.grossLossUsdt, 1)}`}
      />
      <IntelRow label={UL.kpi.averageRr} value={fmt(o.averageRr)} />
      <IntelRow label={UL.stats.avgHold} value={fmt(o.averageHoldingMinutes, 0, ' m')} />

      <IntelRow label={`— ${UL.stats.profit} —`} value="" />
      <IntelRow label={UL.kpi.profitFactor} value={fmt(p.profitFactor)} />
      <IntelRow label={UL.kpi.expectancy} value={fmt(p.expectancyUsdt, 2, ' U')} />
      <IntelRow
        label={`${UL.kpi.averageWinner} / ${UL.kpi.averageLoser}`}
        value={`${fmt(p.averageWinUsdt, 1)} / ${fmt(p.averageLossUsdt, 1)}`}
      />
      <IntelRow
        label={`${UL.kpi.largestWin} / ${UL.kpi.largestLoss}`}
        value={`${fmt(p.largestWinUsdt, 1)} / ${fmt(p.largestLossUsdt, 1)}`}
      />
      <IntelRow
        label="TB / Trung vị"
        value={`${fmt(p.averageTradeUsdt, 1)} / ${fmt(p.medianTradeUsdt, 1)}`}
      />

      <IntelRow label={`— ${UL.stats.drawdown} —`} value="" />
      <IntelRow label={UL.stats.currentDd} value={fmt(d.currentDrawdownUsdt, 2, ' U')} />
      <IntelRow label={UL.stats.maxDd} value={fmt(d.maxDrawdownUsdt, 2, ' U')} />
      <IntelRow label={UL.stats.recovery} value={fmt(d.recoveryFactor)} />
      <IntelRow label="Chuỗi L / W" value={`${d.longestLosingStreak} / ${d.longestWinningStreak}`} />

      <GroupBlock title={UL.stats.coin} rows={s.byCoin} rich />
      <GroupBlock title={UL.stats.strategy} rows={s.byStrategy} rich />
      <GroupBlock title={UL.stats.trigger} rows={s.byTrigger} rich />
      <GroupBlock title={UL.stats.confidence} rows={s.byConfidence} rich />

      <IntelRow label={`— ${UL.stats.advisor} —`} value="" />
      {s.byAdvisor.length === 0 ? (
        <IntelRow label={UL.stats.empty} value="—" />
      ) : (
        s.byAdvisor.slice(0, 8).map((r) => (
          <IntelRow
            key={r.key}
            label={r.key}
            value={`n=${r.occurrences ?? r.trades} · ok ${fmt(r.successRate, 0, '%')} · RR ${fmt(r.averageRr)}`}
          />
        ))
      )}

      <GroupBlock title={UL.stats.tags} rows={s.byTag} rich />
      {s.byTagCombo.length > 0 ? (
        <>
          <IntelRow label={`— ${UL.stats.tagCombos} —`} value="" />
          {s.byTagCombo.slice(0, 6).map((r) => (
            <IntelRow
              key={r.key}
              label={r.key}
              value={`${UL.kpi.winRate} ${fmt(r.winRate, 1, '%')} · ${UL.kpi.expectancy} ${fmt(r.expectancyUsdt, 1)} · n=${r.trades}`}
            />
          ))}
        </>
      ) : null}

      <GroupBlock title={UL.stats.day} rows={s.byDay} />
      <GroupBlock title={UL.stats.week} rows={s.byWeek} />
      <GroupBlock title={UL.stats.month} rows={s.byMonth} />
      <GroupBlock title={UL.stats.sessionZone} rows={s.bySessionZone} rich />
    </IntelligencePanel>
  );
}

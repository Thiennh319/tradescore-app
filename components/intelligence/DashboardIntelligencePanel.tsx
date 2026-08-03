/**
 * Task 14.4 — Dashboard Intelligence panel (additive widgets, no redesign).
 * Task 15.8.2 — Vietnamese display labels only.
 */
import { useMemo, useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { vi } from '../../constants/vi';
import {
  DEFAULT_DASHBOARD_FILTER,
  buildDashboardViewModel,
  buildPerformanceViewModel,
  buildStatisticsViewModel,
  type DashboardFilter,
} from '../../services/intelligence';
import { IntelligencePanel, IntelLine, IntelRow } from './IntelligenceChrome';
import { ulRiskLevelVi } from '../../utils/ulAnalyticsDisplay';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};
const UL = vi.ulAnalytics;

function fmt(n: number | null | undefined, d = 1, s = ''): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(d)}${s}`;
}

const FILTER_LABEL: Record<'today' | 'week' | 'month' | 'all', string> = {
  today: UL.dash.filterToday,
  week: UL.dash.filterWeek,
  month: UL.dash.filterMonth,
  all: UL.dash.filterAll,
};

export function DashboardIntelligencePanel({
  entries,
}: {
  entries: readonly AiTradeJournalEntry[];
}) {
  const [filter, setFilter] = useState<DashboardFilter>(DEFAULT_DASHBOARD_FILTER);

  const d = useMemo(() => {
    const stats = buildStatisticsViewModel(entries);
    const perf = buildPerformanceViewModel(stats);
    return buildDashboardViewModel(perf, filter);
  }, [entries, filter]);

  const s = d.tradingSummary;
  const t = d.todayPerformance;
  const q = d.quickStatistics;
  const r = d.riskMonitor;

  return (
    <IntelligencePanel title={UL.insight.tradingIntelligenceDash}>
      <IntelRow label={`— ${UL.dash.tradingSummary} —`} value="" />
      <IntelRow label={UL.dash.gradeScore} value={`${s.overallGrade} · ${fmt(s.overallScore)}`} />
      <IntelRow label={UL.dash.systemHealth} value={s.systemHealth} />
      <IntelRow label={UL.dash.status} value={s.tradingStatus} />
      <IntelRow label={UL.dash.generated} value={s.generatedAt} />

      <IntelRow label={`— ${UL.dash.todayLeading} —`} value="" />
      <IntelRow
        label={UL.dash.tradesWr}
        value={`${fmt(t.todayTrades, 0)} · ${fmt(t.todayWinrate)}%`}
      />
      <IntelRow label="PnL / RR" value={`${fmt(t.todayNetPnl)} · ${fmt(t.todayRr)}`} />
      <IntelRow
        label={UL.coin.bestWorstCoin}
        value={`${t.todayBestCoin ?? '—'} / ${t.todayWorstCoin ?? '—'}`}
      />
      <IntelLine text={`source=${t.sourceWindow}`} />

      <IntelRow label={`— 3. ${UL.dash.systemHealth} —`} value={d.systemHealth} />

      <IntelRow label={`— ${UL.dash.topPicks} —`} value="" />
      <IntelRow label={UL.strategy.strategy} value={d.topPicks.topStrategy ?? '—'} />
      <IntelRow label={UL.coin.coin} value={d.topPicks.topCoin ?? '—'} />
      <IntelRow label="Trigger" value={d.topPicks.topTrigger ?? '—'} />
      <IntelRow label={UL.strategy.confidence} value={d.topPicks.topConfidence ?? '—'} />
      <IntelRow label="Advisor" value={d.topPicks.topAdvisor ?? '—'} />
      <IntelRow label="Tag" value={d.topPicks.topTag ?? '—'} />

      <IntelRow label={`— ${UL.dash.riskMonitor} —`} value="" />
      <IntelRow label={UL.chart.riskLevel} value={ulRiskLevelVi(r.riskLevel)} />
      <IntelRow label={UL.kpi.recoveryFactor} value={r.recoveryTrend ?? '—'} />
      <IntelRow label={UL.kpi.stability} value={fmt(r.stability)} />
      <IntelLine text={r.currentDrawdownLabel ?? r.largestLosingStreakLabel ?? '—'} />

      <IntelRow label={`— ${UL.dash.recommendations} —`} value="" />
      {d.recommendationPanel.items.map((item) => (
        <IntelLine
          key={item.id}
          text={`[${item.action}] ${item.target}: ${item.reason} | ${item.evidence.join(' · ')}`}
        />
      ))}
      <IntelLine text={`recommendationVersion=${d.recommendationPanel.recommendationVersion}`} />

      <IntelRow label={`— ${UL.dash.recentTrend} —`} value="" />
      {d.recentTrends.map((tr) => (
        <IntelLine
          key={tr.window}
          text={`${tr.window}: ${UL.kpi.winRate} ${tr.winrateTrend} · ${UL.coin.pnl} ${tr.pnlTrend} · ${UL.kpi.drawdown} ${tr.drawdownTrend}`}
        />
      ))}

      <IntelRow label={`— ${UL.dash.activeInsights} —`} value="" />
      {d.activeInsights.slice(0, 5).map((line) => (
        <IntelLine key={line} text={line} />
      ))}

      <IntelRow label={`— ${UL.dash.quickStatistics} —`} value="" />
      <IntelRow label={UL.dash.tradesWr} value={`${fmt(q.trades, 0)} · ${fmt(q.winrate)}%`} />
      <IntelRow
        label={`${UL.kpi.profitFactor} / ${UL.kpi.expectancy}`}
        value={`${fmt(q.profitFactor)} · ${fmt(q.expectancy)}`}
      />
      <IntelRow
        label={`${UL.kpi.averageRr} / ${UL.journal.holding}`}
        value={`${fmt(q.averageRr)} · ${fmt(q.holdingTime, 0)}m`}
      />
      <IntelLine text={`source=${q.sourceKey}`} />

      <IntelRow label={`— ${UL.dash.quickFilters} —`} value="" />
      {(['today', 'week', 'month', 'all'] as const).map((p) => (
        <Pressable
          key={p}
          style={webPointer}
          onPress={() => setFilter((f) => ({ ...f, period: p }))}
        >
          <Text style={{ color: COLORS.primary, fontSize: 11, marginVertical: 2 }}>
            {filter.period === p ? `● ${FILTER_LABEL[p]}` : `○ ${FILTER_LABEL[p]}`}
          </Text>
        </Pressable>
      ))}

      <IntelLine
        text={`Snapshot dash v${d.snapshot.dashboardVersion} · perf v${d.snapshot.performanceVersion} · widgets=${d.widgets.length}`}
      />
    </IntelligencePanel>
  );
}

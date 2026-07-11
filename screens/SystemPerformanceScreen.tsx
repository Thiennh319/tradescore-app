import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { InsightBarChart } from '../components/InsightBarChart';
import {
  WINRATE_EXPECTED_BY_BUCKET,
  WINRATE_SAMPLE_MEANINGFUL_MIN,
  WINRATE_SAMPLE_WARN_MIN,
  COLORS,
  FundingState,
  type WinrateBucketId,
} from '../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../constants/theme';
import {
  calculateAllBucketWinrates,
  calculateWinrateByFundingStateAtEntry,
  calculateWinrateBySqueezeLevel,
  compareEnginesByBucket,
  calculateAdvisorFollowStats,
  countAdvisorExitNa,
  getWinrateTrendByBucket,
  squeezeLevelSampleWarning,
  summarizeFundingStateWinrate,
  type FundingStateWinrateFilter,
  type WinrateScorerFilter,
} from '../services/actualWinrate';
import { formatTpProbabilityFilterStatus } from '../config/featureFlags';
import { isStatsEligibleOutcome } from '../services/journalService';
import { useTradeStore } from '../store/useTradeStore';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

type TrendWindow = 7 | 30;

const ENGINE_TABS: Array<{ id: WinrateScorerFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'v3', label: 'V3' },
  { id: 'v4', label: 'V4' },
];

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

function fmtDev(v: number | null): string {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

const FUNDING_FILTER_TABS: Array<{ id: FundingStateWinrateFilter; label: string }> = [
  { id: 'all', label: 'Tất cả trạng thái' },
  { id: FundingState.SHORT_SQUEEZE_BUILDING, label: 'Short squeeze' },
  { id: FundingState.SHORT_EUPHORIA_FADING, label: 'Short hạ nhiệt' },
  { id: FundingState.NEUTRAL, label: 'Cân bằng' },
  { id: FundingState.LONG_EUPHORIA_FADING, label: 'Long hạ nhiệt' },
  { id: FundingState.LONG_FUNDING_ELEVATED, label: 'Funding dương vừa' },
  { id: FundingState.EXTREME_LONG_EUPHORIA, label: 'Long hưng phấn' },
];

export function SystemPerformanceScreen() {
  const aiTradeJournal = useTradeStore((s) => s.aiTradeJournal);
  const [engine, setEngine] = useState<WinrateScorerFilter>('all');
  const [fundingFilter, setFundingFilter] = useState<FundingStateWinrateFilter>('all');
  const [trendBucket, setTrendBucket] = useState<WinrateBucketId>('9-10');
  const [trendDays, setTrendDays] = useState<TrendWindow>(7);

  const closedCount = useMemo(
    () =>
      aiTradeJournal.filter(
        (e) => !e.archived && isStatsEligibleOutcome(e.outcome.status),
      ).length,
    [aiTradeJournal],
  );

  const buckets = useMemo(
    () => calculateAllBucketWinrates(aiTradeJournal, engine),
    [aiTradeJournal, engine],
  );

  const engineCompare = useMemo(
    () => compareEnginesByBucket(aiTradeJournal),
    [aiTradeJournal],
  );

  const trend = useMemo(
    () => getWinrateTrendByBucket(aiTradeJournal, trendBucket, engine, trendDays),
    [aiTradeJournal, trendBucket, engine, trendDays],
  );

  const fundingWinrates = useMemo(
    () => calculateWinrateByFundingStateAtEntry(aiTradeJournal, engine),
    [aiTradeJournal, engine],
  );

  const fundingSummary = useMemo(
    () => summarizeFundingStateWinrate(fundingWinrates, fundingFilter),
    [fundingWinrates, fundingFilter],
  );

  const fundingRowsToShow = useMemo(() => {
    if (fundingFilter === 'all') return fundingWinrates;
    return fundingWinrates.filter((r) => r.fundingState === fundingFilter);
  }, [fundingWinrates, fundingFilter]);

  const fundingNaCount = fundingWinrates[0]?.naCount ?? 0;

  const squeezeWinrates = useMemo(
    () => calculateWinrateBySqueezeLevel(aiTradeJournal, engine),
    [aiTradeJournal, engine],
  );

  const squeezeNaCount = squeezeWinrates[0]?.naCount ?? 0;

  const advisorFollowRows = useMemo(
    () => calculateAdvisorFollowStats(aiTradeJournal),
    [aiTradeJournal],
  );

  const advisorExitNaCount = useMemo(
    () => countAdvisorExitNa(aiTradeJournal),
    [aiTradeJournal],
  );

  const trendChartItems = useMemo(
    () =>
      trend.map((p) => ({
        label: p.label,
        value: p.actualWinratePct ?? 0,
        sublabel: p.trades > 0 ? `n=${p.trades}` : '—',
        warn: p.trades > 0 && p.trades < WINRATE_SAMPLE_WARN_MIN,
      })),
    [trend],
  );

  const expectedForTrend =
    WINRATE_EXPECTED_BY_BUCKET.find((b) => b.id === trendBucket)?.expectedWinratePct ?? 65;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>📈 HIỆU SUẤT HỆ THỐNG</Text>
      <Text style={styles.subtitle}>
        Winrate thực tế từ AI Journal vs kỳ vọng thiết kế — chỉ quan sát, không tự điều chỉnh
        Scorer.
      </Text>

      <View style={styles.warnBox}>
        <Text style={styles.warnTitle}>⚠️ Lưu ý thống kê</Text>
        <Text style={styles.warnText}>
          Cần tối thiểu {WINRATE_SAMPLE_MEANINGFUL_MIN}–30 lệnh mỗi bucket để số liệu có ý nghĩa
          thống kê — số liệu hiện tại chỉ mang tính tham khảo sớm.
        </Text>
        <Text style={styles.warnHint}>
          Cảnh báo sớm khi n &lt; {WINRATE_SAMPLE_WARN_MIN}. Tổng lệnh đóng: {closedCount}.
        </Text>
      </View>

      <View style={styles.flagBox}>
        <Text style={styles.flagText}>{formatTpProbabilityFilterStatus(closedCount)}</Text>
      </View>

      <View style={styles.tabRow}>
        {ENGINE_TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setEngine(t.id)}
            style={[styles.tabBtn, engine === t.id && styles.tabBtnActive, webPointer]}
          >
            <Text style={[styles.tabText, engine === t.id && styles.tabTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bảng winrate theo bucket điểm</Text>
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colBucket]}>Bucket</Text>
          <Text style={styles.th}>Thực tế</Text>
          <Text style={styles.th}>Kỳ vọng</Text>
          <Text style={styles.th}>Lệch</Text>
          <Text style={styles.th}>n</Text>
        </View>
        {buckets.map((row) => (
          <View key={row.bucketId} style={styles.tableRow}>
            <View style={styles.colBucket}>
              <Text style={styles.tdStrong}>{row.bucketLabel}</Text>
              <Text style={styles.tdHint}>{row.decisionHint}</Text>
            </View>
            <Text
              style={[
                styles.td,
                row.sampleTooSmall && styles.tdMuted,
                row.actualWinratePct != null &&
                  row.deviationPct != null &&
                  row.deviationPct < -10 &&
                  styles.tdWarn,
              ]}
            >
              {fmtPct(row.actualWinratePct)}
            </Text>
            <Text style={styles.td}>{row.expectedLabel}</Text>
            <Text
              style={[
                styles.td,
                row.deviationPct != null && row.deviationPct >= 0
                  ? styles.tdGood
                  : row.deviationPct != null
                    ? styles.tdWarn
                    : null,
              ]}
            >
              {fmtDev(row.deviationPct)}
            </Text>
            <Text style={[styles.td, row.sampleTooSmall && styles.tdWarn]}>
              {row.totalTrades}
              {row.sampleTooSmall ? ' ⚠' : ''}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Winrate theo Funding State (V4 — lúc vào lệnh)</Text>
        <Text style={styles.subtitle}>
          Phân tích winrate theo trạng thái funding tại thời điểm mở lệnh — chỉ lệnh V4 có dữ
          liệu.
        </Text>
        {engine === 'v3' ? (
          <Text style={styles.emptyHint}>
            Bộ lọc Funding State không áp dụng cho engine V3 — N/A
          </Text>
        ) : (
          <>
            <View style={styles.tabRow}>
              {FUNDING_FILTER_TABS.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setFundingFilter(t.id)}
                  style={[
                    styles.miniTab,
                    fundingFilter === t.id && styles.tabBtnActive,
                    webPointer,
                  ]}
                >
                  <Text
                    style={[
                      styles.miniTabText,
                      fundingFilter === t.id && styles.tabTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.fundingSummary, fundingSummary.isNA && styles.tdMuted]}>
              {fundingSummary.summary}
            </Text>
            {fundingNaCount > 0 ? (
              <Text style={styles.trendHint}>
                {fundingNaCount} lệnh V3 hoặc thiếu fundingStateAtEntry — N/A trong bảng
              </Text>
            ) : null}
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colFundingState]}>Funding State</Text>
              <Text style={styles.th}>Winrate</Text>
              <Text style={styles.th}>n</Text>
            </View>
            {fundingRowsToShow.map((row) => (
              <View key={row.fundingState} style={styles.tableRow}>
                <View style={styles.colFundingState}>
                  <Text style={styles.tdStrong}>{row.fundingState}</Text>
                  <Text style={styles.tdHint}>{row.label}</Text>
                </View>
                <Text style={[styles.td, row.sampleTooSmall && styles.tdMuted]}>
                  {engine === 'v3' || row.totalTrades === 0
                    ? 'N/A'
                    : fmtPct(row.actualWinratePct)}
                </Text>
                <Text style={[styles.td, row.sampleTooSmall && styles.tdWarn]}>
                  {row.totalTrades}
                  {row.sampleTooSmall && row.totalTrades > 0 ? ' ⚠' : ''}
                </Text>
              </View>
            ))}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Phân tích Squeeze Risk (V4 — lúc vào lệnh)</Text>
        <Text style={styles.subtitle}>
          Winrate theo mức squeeze risk tại thời điểm mở lệnh — chỉ lệnh V4 có dữ liệu L11.
        </Text>
        {engine === 'v3' ? (
          <Text style={styles.emptyHint}>
            Bộ lọc Squeeze Risk không áp dụng cho engine V3 — N/A
          </Text>
        ) : (
          <>
            {squeezeNaCount > 0 ? (
              <Text style={styles.trendHint}>
                {squeezeNaCount} lệnh V3 hoặc thiếu squeezeRiskLevelAtEntry — N/A trong bảng
              </Text>
            ) : null}
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colFundingState]}>Level</Text>
              <Text style={styles.th}>Số lệnh</Text>
              <Text style={styles.th}>WIN</Text>
              <Text style={styles.th}>LOSS</Text>
              <Text style={styles.th}>Winrate</Text>
            </View>
            {squeezeWinrates.map((row) => (
              <View key={row.level} style={styles.tableRow}>
                <View style={styles.colFundingState}>
                  <Text style={styles.tdStrong}>{row.label}</Text>
                </View>
                <Text style={styles.td}>{row.totalTrades}</Text>
                <Text style={styles.td}>{row.wins}</Text>
                <Text style={styles.td}>{row.losses}</Text>
                <View style={styles.colWinrate}>
                  <Text style={[styles.td, row.sampleTooSmall && styles.tdMuted]}>
                    {row.winLossCount > 0 ? fmtPct(row.actualWinratePct) : '—'}
                  </Text>
                  {row.sampleTooSmall ? (
                    <Text style={styles.sampleWarn}>
                      {squeezeLevelSampleWarning(row.totalTrades)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trader có theo khuyến nghị app không?</Text>
        <Text style={styles.cardHint}>
          Khi app nói HOLD mà bạn tự đóng — xem hàng &quot;App HOLD → trader tự đóng&quot;.
        </Text>
        {advisorExitNaCount > 0 ? (
          <Text style={styles.naHint}>
            {advisorExitNaCount} lệnh cũ thiếu dữ liệu advisor — hiển thị N/A
          </Text>
        ) : null}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colAdvisorAction]}>Hành động</Text>
          <Text style={styles.th}>Số lệnh</Text>
          <Text style={styles.th}>WIN</Text>
          <Text style={styles.th}>Winrate</Text>
        </View>
        {advisorFollowRows.map((row) => (
          <View key={row.key} style={styles.tableRow}>
            <Text style={[styles.tdStrong, styles.colAdvisorAction]}>{row.label}</Text>
            <Text style={styles.td}>{row.hasData ? row.trades : 'N/A'}</Text>
            <Text style={styles.td}>{row.hasData ? row.wins : 'N/A'}</Text>
            <Text style={styles.td}>{row.hasData ? fmtPct(row.winratePct) : 'N/A'}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>So sánh V3 vs V4 (cùng bucket)</Text>
        {engineCompare.every((c) => !c.v3 && !c.v4) ? (
          <Text style={styles.emptyHint}>Chưa có lệnh đóng đủ dữ liệu engine.</Text>
        ) : (
          engineCompare.map((c) => {
            if (!c.v3 && !c.v4) return null;
            return (
              <View key={c.bucketId} style={styles.compareRow}>
                <Text style={styles.compareLabel}>{c.bucketLabel}</Text>
                <Text style={styles.compareVal}>
                  V3: {c.v3 ? fmtPct(c.v3.actualWinratePct) : '—'} (n={c.v3?.totalTrades ?? 0})
                </Text>
                <Text style={styles.compareVal}>
                  V4: {c.v4 ? fmtPct(c.v4.actualWinratePct) : '—'} (n={c.v4?.totalTrades ?? 0})
                </Text>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Winrate theo thời gian</Text>
        <View style={styles.tabRow}>
          {WINRATE_EXPECTED_BY_BUCKET.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setTrendBucket(b.id)}
              style={[
                styles.miniTab,
                trendBucket === b.id && styles.tabBtnActive,
                webPointer,
              ]}
            >
              <Text
                style={[styles.miniTabText, trendBucket === b.id && styles.tabTextActive]}
              >
                {b.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.tabRow}>
          {([7, 30] as const).map((d) => (
            <Pressable
              key={d}
              onPress={() => setTrendDays(d)}
              style={[styles.miniTab, trendDays === d && styles.tabBtnActive, webPointer]}
            >
              <Text style={[styles.miniTabText, trendDays === d && styles.tabTextActive]}>
                {d} ngày
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.trendHint}>
          Đường tham chiếu kỳ vọng bucket {trendBucket}: {expectedForTrend}%
        </Text>
        <InsightBarChart items={trendChartItems} maxValue={100} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  warnBox: {
    backgroundColor: '#F0B90B18',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 6,
  },
  warnTitle: {
    color: COLORS.warning,
    fontWeight: '700',
    fontSize: 13,
  },
  warnText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    lineHeight: 18,
  },
  warnHint: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  flagBox: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  flagText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 17,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  tabBtnActive: {
    backgroundColor: COLORS.accent,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000',
  },
  miniTab: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
  },
  miniTabText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  card: {
    ...PANEL,
    gap: SPACING.sm,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceElevated,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surfaceElevated,
  },
  th: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  td: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  tdStrong: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  tdHint: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  tdMuted: {
    color: COLORS.textSecondary,
  },
  tdGood: {
    color: COLORS.bullish,
  },
  tdWarn: {
    color: COLORS.bearish,
  },
  colBucket: {
    flex: 1.4,
  },
  colAdvisorAction: {
    flex: 2,
    textAlign: 'left',
  },
  colFundingState: {
    flex: 1.6,
  },
  colWinrate: {
    flex: 1.2,
    alignItems: 'center',
    gap: 2,
  },
  sampleWarn: {
    fontSize: 9,
    color: COLORS.bearish,
    textAlign: 'center',
  },
  fundingSummary: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '600',
    lineHeight: 18,
  },
  compareRow: {
    gap: 2,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surfaceElevated,
  },
  compareLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  compareVal: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  trendHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  emptyHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  cardHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    lineHeight: 16,
  },
  naHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    fontStyle: 'italic',
  },
});

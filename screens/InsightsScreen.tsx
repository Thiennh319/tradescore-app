import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { EquityCurveChart } from '../components/EquityCurveChart';
import { InsightBarChart } from '../components/InsightBarChart';
import { InsightCard } from '../components/InsightCard';
import { INSIGHTS_MIN_TRADES, SKIPPED_SETUPS_INSIGHTS_MIN } from '../constants/aiJournal';
import { COLORS, DEFAULT_SETTINGS, SCORER_LAYER_NAMES, type ScorerLayerId } from '../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../constants/theme';
import { shareWeeklyReport } from '../services/exportShare';
import {
  analyzeLossPatterns,
  buildEquityCurveData,
  calculateLayerAccuracy,
  generateAllInsights,
  generateWeeklyInsights,
  getHourBucketWinRates,
  getWinRateByCoin,
  getWinRateByScoreRange,
  isStatsEligibleOutcome,
} from '../services/journalService';
import { getVietnamDateParts, useTradeStore } from '../store/useTradeStore';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};
type InsightTab = 'overview' | 'layers' | 'performance' | 'tips';

const TABS: Array<{ id: InsightTab; label: string }> = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'layers', label: 'Phân tích lớp' },
  { id: 'performance', label: 'Hiệu suất' },
  { id: 'tips', label: 'Gợi ý' },
];

const GD1_TARGET = 100;

export function InsightsScreen() {
  const aiTradeJournal = useTradeStore((s) => s.aiTradeJournal);
  const dailyStats = useTradeStore((s) => s.dailyStats);
  const getWeeklyStats = useTradeStore((s) => s.getWeeklyStats);
  const getSkippedStats = useTradeStore((s) => s.getSkippedStats);
  const getEquityCurveStats = useTradeStore((s) => s.getEquityCurveStats);
  const accountHistory = useTradeStore((s) => s.accountHistory);
  const settings = useTradeStore((s) => s.settings);
  const [tab, setTab] = useState<InsightTab>('overview');

  const closed = useMemo(
    () => aiTradeJournal.filter((e) => !e.archived && isStatsEligibleOutcome(e.outcome.status)),
    [aiTradeJournal],
  );

  const weekly = useMemo(() => getWeeklyStats(), [aiTradeJournal, getWeeklyStats]);
  const weeklyInsightLines = useMemo(
    () => generateWeeklyInsights(aiTradeJournal, dailyStats),
    [aiTradeJournal, dailyStats],
  );

  const insightBundle = useMemo(() => {
    if (tab !== 'tips') return null;
    return generateAllInsights(aiTradeJournal);
  }, [tab, aiTradeJournal]);

  const layerAcc = useMemo(() => calculateLayerAccuracy(closed), [closed]);
  const byScore = useMemo(() => getWinRateByScoreRange(closed), [closed]);
  const byCoin = useMemo(() => getWinRateByCoin(closed), [closed]);
  const byHour = useMemo(() => getHourBucketWinRates(closed), [closed]);
  const lossPatterns = useMemo(() => analyzeLossPatterns(closed), [closed]);
  const skippedStats = useMemo(
    () => getSkippedStats(),
    [aiTradeJournal, getSkippedStats],
  );

  const equityStats = useMemo(
    () => getEquityCurveStats(),
    [accountHistory, getEquityCurveStats],
  );
  const equityChartData = useMemo(
    () => buildEquityCurveData(accountHistory),
    [accountHistory],
  );

  const needMore = INSIGHTS_MIN_TRADES - closed.length;
  const accountSize = settings.accountSize || DEFAULT_SETTINGS.accountSize;
  const gd1Progress = Math.min(100, (accountSize / GD1_TARGET) * 100);

  const handleShareReport = () => {
    void shareWeeklyReport(weekly, weeklyInsightLines);
  };

  if (closed.length < INSIGHTS_MIN_TRADES) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>📊 THỐNG KÊ GD1</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Cần thêm {needMore} lệnh để xem thống kê ({closed.length}/{INSIGHTS_MIN_TRADES}).
          </Text>
          <Text style={styles.emptyHint}>
            Mỗi lệnh vào/đóng qua Nhật ký sẽ tích luỹ dữ liệu cho AI.
          </Text>
        </View>
      </View>
    );
  }

  const layerItems = Object.entries(layerAcc)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v], i) => {
      const n = Number(k.replace('l', '')) as ScorerLayerId;
      const name = SCORER_LAYER_NAMES[n] ?? k;
      return {
        label: `${k.toUpperCase()} ${name}`,
        value: v,
        highlight: i === 0,
        warn: v < 55,
      };
    });

  const weakestLayer = layerItems.find((l) => l.warn);

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>📊 THỐNG KÊ GD1</Text>
        <Pressable onPress={handleShareReport} style={[styles.shareBtn, webPointer]}>
          <Text style={styles.shareText}>Share report</Text>
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.tab, tab === t.id && styles.tabActive, webPointer]}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' ? (
        <Panel title="TỔNG QUAN GD1">
          {accountHistory.length < 2 ? (
            <View style={styles.equityPlaceholder}>
              <Text style={styles.equityPlaceholderText}>
                📈 Cần ít nhất 2 lệnh đã đóng để hiển thị Equity Curve
              </Text>
            </View>
          ) : equityChartData && equityStats ? (
            <View style={styles.equityBlock}>
              <Text style={styles.equityTitle}>EQUITY CURVE</Text>
              <EquityCurveChart data={equityChartData} stats={equityStats} />
            </View>
          ) : null}
          <Text style={styles.heroLine}>
            Vốn: {weekly.accountStartUSDT.toFixed(2)} → {weekly.accountEndUSDT.toFixed(2)} USDT
            {' '}
            <Text style={{ color: weekly.accountChangePct >= 0 ? COLORS.bullish : COLORS.bearish }}>
              ({weekly.accountChangePct >= 0 ? '+' : ''}{weekly.accountChangePct.toFixed(1)}%)
            </Text>
          </Text>
          <View style={styles.statGrid}>
            <StatBox label="Lệnh" value={String(weekly.trades)} />
            <StatBox label="Win rate" value={`${weekly.winRate}%`} accent />
            <StatBox
              label="P&L"
              value={`${weekly.totalPnlUSDT >= 0 ? '+' : ''}${weekly.totalPnlUSDT.toFixed(2)}$`}
              accent={weekly.totalPnlUSDT >= 0}
            />
          </View>
          <Text style={styles.progressLabel}>
            Tiến độ GD1: {gd1Progress.toFixed(0)}% · {accountSize.toFixed(2)} / {GD1_TARGET} USDT
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${gd1Progress}%` }]} />
          </View>
          <Text style={styles.metaLine}>
            Win/Loss/BE: {weekly.wins}W · {weekly.losses}L · {weekly.breakevens}BE
          </Text>
          {weekly.bestTradeLabel ? (
            <Text style={styles.metaLine}>Best: {weekly.bestTradeLabel}</Text>
          ) : null}
          {weekly.worstTradeLabel ? (
            <Text style={styles.metaLine}>Worst: {weekly.worstTradeLabel}</Text>
          ) : null}
          {skippedStats.withFollowUp >= SKIPPED_SETUPS_INSIGHTS_MIN ? (
            <View style={styles.skippedCard}>
              <Text style={styles.skippedTitle}>
                📝 SETUP ĐÃ BỎ QUA ({skippedStats.total} setup)
              </Text>
              <Text style={styles.skippedLine}>
                Từ chối đúng: {skippedStats.correctSkips} (
                {skippedStats.withFollowUp > 0
                  ? Math.round((skippedStats.correctSkips / skippedStats.withFollowUp) * 100)
                  : 0}
                %)
              </Text>
              <Text style={styles.skippedLine}>
                Bỏ lỡ cơ hội: {skippedStats.missedOpportunities} (
                {skippedStats.withFollowUp > 0
                  ? Math.round((skippedStats.missedOpportunities / skippedStats.withFollowUp) * 100)
                  : 0}
                %)
              </Text>
              {skippedStats.pendingFollowUp > 0 ? (
                <Text style={styles.skippedMuted}>
                  Chưa có data: {skippedStats.pendingFollowUp}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'layers' ? (
        <Panel title="ĐỘ CHÍNH XÁC TỪNG LỚP">
          <InsightBarChart items={layerItems} />
          {weakestLayer ? (
            <Text style={styles.tipWarn}>
              💡 {weakestLayer.label} đang kém chính xác ({weakestLayer.value}%) — xem xét giảm tiêu chí lớp này.
            </Text>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'performance' ? (
        <>
          <Panel title="WIN RATE THEO GIỜ VN">
            <InsightBarChart
              items={byHour
                .filter((h) => h.trades > 0)
                .map((h) => ({
                  label: h.label,
                  value: h.winRate,
                  sublabel: `${h.trades} lệnh`,
                }))}
            />
          </Panel>
          <Panel title="WIN RATE THEO ĐIỂM">
            <InsightBarChart
              items={byScore
                .filter((r) => r.trades > 0)
                .map((r) => ({
                  label: r.range,
                  value: r.winRate,
                  sublabel: `${r.trades} lệnh`,
                }))}
            />
          </Panel>
          <Panel title="WIN RATE THEO COIN">
            <InsightBarChart
              items={['NEARUSDT', 'SOLUSDT', 'BNBUSDT', 'BTCUSDT'].map((sym) => {
                const s = byCoin[sym];
                return {
                  label: sym.replace('USDT', ''),
                  value: s?.winRate ?? 0,
                  sublabel: s ? `${s.trades} lệnh` : 'N/A',
                  highlight: s != null && s.winRate >= 70,
                };
              })}
            />
          </Panel>
        </>
      ) : null}

      {tab === 'tips' ? (
        <Panel title="GỢI Ý PHÂN TÍCH">
          {!insightBundle?.hasEnoughData ? (
            <View style={styles.emptyTips}>
              <Text style={styles.emptyTipsText}>
                📊 {insightBundle?.missingDataMessage ?? 'Cần thêm lệnh để xem gợi ý'}
              </Text>
            </View>
          ) : insightBundle.insights.length === 0 ? (
            <Text style={styles.tipLine}>
              ✅ Chưa phát hiện pattern đặc biệt — tiếp tục theo dõi
            </Text>
          ) : (
            insightBundle.insights.map((item, idx) => (
              <InsightCard key={`${item.type}-${item.title}-${idx}`} item={item} />
            ))
          )}
          {lossPatterns.length > 0 ? (
            <View style={styles.lossPatternBlock}>
              <Text style={styles.lossPatternTitle}>Pattern thua lỗ</Text>
              {lossPatterns.slice(0, 2).map((p) => (
                <Text key={p.pattern} style={styles.tipWarn}>
                  ⚠️ {p.description} ({p.frequency}% lệnh thua)
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={styles.updated}>
            📅 Cập nhật: {getVietnamDateParts().ymd.split('-').reverse().join('/')}
          </Text>
        </Panel>
      ) : null}
    </View>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  shareBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  shareText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(14, 203, 129, 0.1)',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tabTextActive: { color: COLORS.accent },
  panel: {
    ...PANEL,
    padding: SPACING.md,
  },
  panelTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: SPACING.md,
  },
  heroLine: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  equityBlock: {
    marginBottom: SPACING.md,
  },
  equityTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  equityPlaceholder: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  equityPlaceholderText: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  statGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.accent,
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  progressLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.background,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },
  metaLine: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  skippedCard: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 4,
  },
  skippedTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  skippedLine: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  skippedMuted: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  tipLine: {
    fontSize: 12,
    color: COLORS.textPrimary,
    lineHeight: 20,
    marginBottom: 6,
  },
  emptyTips: {
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTipsText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  lossPatternBlock: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  lossPatternTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  tipWarn: {
    fontSize: 11,
    color: COLORS.warning,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },
  updated: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
  },
  reportPreview: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  empty: {
    ...PANEL,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
});

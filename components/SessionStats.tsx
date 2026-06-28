import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import type { DailySessionStats, TodayQuickStats, WeeklyStats } from '../constants/aiJournal';
import { PANEL, RADIUS, SPACING } from '../constants/theme';
import { formatSignedUsdt } from '../utils/positionPnl';

interface SessionStatsProps {
  today?: TodayQuickStats;
  weekly?: WeeklyStats;
  daily?: DailySessionStats | null;
}

export function SessionStats({ today, weekly, daily }: SessionStatsProps) {
  return (
    <View style={styles.wrap}>
      {today ? (
        <StatBlock title="Hôm nay">
          <Row label="Lệnh đóng" value={String(today.trades)} />
          <Row label="Win rate" value={`${today.winRate}%`} accent={today.winRate >= 50} />
          <Row
            label="PnL"
            value={formatSignedUsdt(today.totalPnlUSDT)}
            accent={today.totalPnlUSDT >= 0}
          />
          <Row label="Đang mở" value={String(today.openCount)} />
        </StatBlock>
      ) : null}

      {weekly ? (
        <StatBlock title="7 ngày">
          <Row label="Lệnh" value={String(weekly.trades)} />
          <Row label="Win rate" value={`${weekly.winRate}%`} accent={weekly.winRate >= 50} />
          <Row
            label="PnL"
            value={formatSignedUsdt(weekly.totalPnlUSDT)}
            accent={weekly.totalPnlUSDT >= 0}
          />
          <Row label="Điểm TB" value={weekly.avgScore.toFixed(1)} />
        </StatBlock>
      ) : null}

      {daily ? (
        <StatBlock title={`Phiên ${daily.date}`}>
          <Row label="W/L/BE" value={`${daily.wins}/${daily.losses}/${daily.breakevens}`} />
          <Row label="Phiên GOOD" value={`${daily.sessionBreakdown.good.trades} · ${daily.sessionBreakdown.good.winRate}%`} />
          <Row label="Phiên BAD" value={`${daily.sessionBreakdown.bad.trades} · ${daily.sessionBreakdown.bad.winRate}%`} />
          <Row label="Giữ TB" value={`${daily.avgHoldingMinutes} phút`} />
        </StatBlock>
      ) : null}
    </View>
  );
}

function StatBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          accent === true && { color: COLORS.bullish },
          accent === false && { color: COLORS.bearish },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  block: {
    ...PANEL,
    flex: 1,
    minWidth: 160,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
  },
  blockTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: SPACING.sm,
  },
  label: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  value: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});

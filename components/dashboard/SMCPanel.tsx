import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { formatStructureVi, formatTrendVi, vi } from '../../constants/vi';
import type { SMCStructureResult } from '../../services/indicators';
import { formatPrice } from '../../utils/formatPrice';

interface SMCPanelProps {
  smc: SMCStructureResult;
  timeframe: string;
  symbol: string;
}

const trendColor = {
  BULLISH: COLORS.bullish,
  BEARISH: COLORS.bearish,
  SIDEWAYS: COLORS.textSecondary,
} as const;

export function SMCPanel({ smc, timeframe, symbol }: SMCPanelProps) {
  const lastSignal = smc.signals[smc.signals.length - 1];
  const swingHighs = smc.swings.filter((s) => s.type === 'HIGH').length;
  const swingLows = smc.swings.filter((s) => s.type === 'LOW').length;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{vi.smc.title}</Text>
      <Text style={styles.caption}>{vi.smc.caption(timeframe)}</Text>

      <View style={styles.row}>
        <Badge label={vi.smc.trend} value={formatTrendVi(smc.trend)} color={trendColor[smc.trend]} />
        <Badge
          label={vi.smc.swings}
          value={vi.smc.swingsVal(swingHighs, swingLows)}
          color={COLORS.textPrimary}
        />
      </View>

      {lastSignal ? (
        <View style={styles.signalBox}>
          <Text style={styles.signalType}>{lastSignal.type}</Text>
          <Text style={styles.signalDesc}>{formatStructureVi(lastSignal.type)}</Text>
          <Text style={styles.signalMeta}>
            {vi.smc.breakAt(
              formatPrice(symbol, lastSignal.breakPrice),
              new Date(lastSignal.timestamp).toLocaleTimeString(),
            )}
          </Text>
        </View>
      ) : (
        <Text style={styles.muted}>{vi.smc.noSignal}</Text>
      )}

      <View style={styles.swingList}>
        {smc.swings.slice(-4).map((s, i) => (
          <Text key={`${s.timestamp}-${i}`} style={styles.swingItem}>
            <Text style={s.type === 'HIGH' ? styles.high : styles.low}>
              {s.type === 'HIGH' ? vi.smc.swingHigh : vi.smc.swingLow}
            </Text>
            {'  '}
            {formatPrice(symbol, s.price)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Badge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <Text style={[styles.badgeValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    flex: 1,
    minWidth: 260,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  caption: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  badge: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
  },
  badgeLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  badgeValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  signalBox: {
    backgroundColor: COLORS.background,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 12,
    marginBottom: 10,
  },
  signalType: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 1,
  },
  signalDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  signalMeta: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  muted: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  swingList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    gap: 4,
  },
  swingItem: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  high: {
    color: COLORS.bearish,
    fontWeight: '700',
  },
  low: {
    color: COLORS.bullish,
    fontWeight: '700',
  },
});

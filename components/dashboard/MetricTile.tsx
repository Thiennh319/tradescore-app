import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';

interface MetricTileProps {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  accent?: 'bullish' | 'bearish' | 'neutral' | 'accent';
}

const accentMap = {
  bullish: COLORS.bullish,
  bearish: COLORS.bearish,
  neutral: COLORS.textPrimary,
  accent: COLORS.accent,
};

const accentBorder = {
  bullish: COLORS.bullish,
  bearish: COLORS.bearish,
  neutral: COLORS.border,
  accent: COLORS.accent,
};

export function MetricTile({ label, value, sub, hint, accent = 'neutral' }: MetricTileProps) {
  return (
    <View style={[styles.tile, { borderTopColor: accentBorder[accent] }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accentMap[accent] }]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    flexBasis: '45%',
    ...PANEL,
    borderRadius: RADIUS.md,
    borderTopWidth: 2,
    padding: SPACING.md + 2,
    gap: SPACING.xs,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginTop: SPACING.xs,
  },
  sub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
    marginTop: SPACING.xs,
  },
});

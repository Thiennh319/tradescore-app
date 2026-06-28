import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { SPACING } from '../constants/theme';

export interface BarChartItem {
  label: string;
  value: number;
  sublabel?: string;
  highlight?: boolean;
  warn?: boolean;
}

interface InsightBarChartProps {
  items: BarChartItem[];
  maxValue?: number;
  valueSuffix?: string;
}

export function InsightBarChart({
  items,
  maxValue = 100,
  valueSuffix = '%',
}: InsightBarChartProps) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const pct = maxValue > 0 ? Math.min(100, (item.value / maxValue) * 100) : 0;
        const barColor = item.warn
          ? COLORS.bearish
          : item.highlight
            ? COLORS.accent
            : COLORS.bullish;
        return (
          <View key={item.label} style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.label}>{item.label}</Text>
              {item.sublabel ? (
                <Text style={styles.sublabel}>{item.sublabel}</Text>
              ) : null}
            </View>
            <View style={styles.barCol}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
              </View>
            </View>
            <Text style={[styles.value, item.highlight && { color: COLORS.accent }]}>
              {item.value}
              {valueSuffix}
              {item.highlight ? ' ⭐' : ''}
              {item.warn ? ' ⚠️' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  labelCol: { width: 72 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sublabel: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  barCol: { flex: 1 },
  track: {
    height: 8,
    backgroundColor: COLORS.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  value: {
    width: 52,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});

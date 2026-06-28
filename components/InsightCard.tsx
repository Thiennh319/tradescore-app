import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import type { InsightItem } from '../services/journalService';

interface InsightCardProps {
  item: InsightItem;
}

export function InsightCard({ item }: InsightCardProps) {
  const borderColor = item.isWarning ? COLORS.warning : COLORS.bullish;
  const icon = item.isWarning ? '⚠️' : '✅';

  return (
    <View style={[styles.card, { borderColor }]}>
      <Text style={styles.title}>
        {icon} {item.title}
      </Text>
      {item.finding.split('\n').map((line) => (
        <Text key={line} style={styles.finding}>
          {line}
        </Text>
      ))}
      <View style={styles.divider} />
      <Text style={styles.suggestion}>💡 {item.suggestion}</Text>
      <Text style={styles.meta}>{item.dataPoints} lệnh · {item.type}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  finding: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  suggestion: {
    fontSize: 11,
    color: COLORS.textPrimary,
    lineHeight: 17,
  },
  meta: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 6,
  },
});

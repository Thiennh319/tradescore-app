/**
 * Task 14.1 — Journal list-level intelligence summary.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { buildStatisticsIntelligence } from '../../services/intelligence';
import { vi } from '../../constants/vi';

const UL = vi.ulAnalytics;

export function JournalIntelligenceSummary({
  entries,
}: {
  entries: readonly AiTradeJournalEntry[];
}) {
  const stats = useMemo(() => buildStatisticsIntelligence(entries), [entries]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{UL.insight.tradingIntelligenceJournal}</Text>
      <Row label={UL.journal.closedSample} value={String(stats.sampleSize)} />
      <Row
        label="W / L / BE"
        value={`${stats.distribution.wins}/${stats.distribution.losses}/${stats.distribution.breakevens}`}
      />
      <Row
        label={UL.journal.expectancy}
        value={
          stats.expectancyUsdt == null ? '—' : `${stats.expectancyUsdt.toFixed(2)} USDT`
        }
      />
      <Row
        label={UL.journal.avgHold}
        value={
          stats.holdingTimeAvgMinutes == null
            ? '—'
            : `${stats.holdingTimeAvgMinutes.toFixed(0)} m`
        }
      />
      <Text style={styles.hint}>{UL.journal.hint}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 4,
    marginTop: SPACING.sm,
  },
  title: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: COLORS.textMuted, fontSize: 12 },
  value: { color: COLORS.textSecondary, fontSize: 12 },
  hint: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
});

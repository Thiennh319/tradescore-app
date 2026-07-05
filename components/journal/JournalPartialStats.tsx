import { StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { PANEL, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import { computeJournalPartialStats } from '../../services/journalService';
import { formatSignedUsdt } from '../../utils/positionPnl';

interface JournalPartialStatsProps {
  entries: AiTradeJournalEntry[];
}

export function JournalPartialStats({ entries }: JournalPartialStatsProps) {
  const { partialTradeCount, totalRealizedPnl } = computeJournalPartialStats(entries);
  if (partialTradeCount === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.line}>{vi.journal.partialStatsCount(partialTradeCount)}</Text>
      <Text style={styles.line}>
        {vi.journal.partialStatsRealized(formatSignedUsdt(totalRealizedPnl))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...PANEL,
    padding: SPACING.md,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
  },
  line: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

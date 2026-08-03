/**
 * Task 14.1 — Evidence panel (Rule #59).
 */
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { SPACING } from '../../constants/theme';
import type { JournalEvidenceItem } from '../../services/intelligence';

export function JournalEvidencePanel({
  items,
}: {
  items: readonly JournalEvidenceItem[];
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.sub}>Evidence</Text>
      {items.length === 0 ? (
        <Text style={styles.line}>—</Text>
      ) : (
        items.map((e) => (
          <View key={e.id} style={styles.card}>
            <Text style={styles.claim}>{e.claim}</Text>
            <Text style={styles.meta}>
              {e.sourceField} = {e.value}
            </Text>
            <Text style={styles.meta}>trades: {e.relatedTradeIds.join(', ')}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: SPACING.sm },
  sub: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 12 },
  card: { gap: 2 },
  claim: { color: COLORS.textSecondary, fontSize: 12 },
  meta: { color: COLORS.textMuted, fontSize: 11 },
  line: { color: COLORS.textMuted, fontSize: 12 },
});

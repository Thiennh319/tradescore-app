import { StyleSheet, Text, View } from 'react-native';
import { GroupScoreBar } from '../GroupScoreBar';
import type { DirectionalScoreV4, ScoringResultV4 } from '../../services/scorerV4';

interface ScorerV4DetailSectionProps {
  scoringResultV4: ScoringResultV4;
  activeDirection: DirectionalScoreV4;
}

export function ScorerV4DetailSection({
  scoringResultV4,
  activeDirection,
}: ScorerV4DetailSectionProps) {
  const isTrending = scoringResultV4.marketMode === 'TRENDING';

  return (
    <>
      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>Chế độ thị trường:</Text>
        <View
          style={[
            styles.modeBadge,
            { backgroundColor: isTrending ? '#F0B90B20' : '#0ECB8120' },
          ]}
        >
          <Text
            style={[
              styles.modeText,
              { color: isTrending ? '#F0B90B' : '#0ECB81' },
            ]}
          >
            {isTrending ? '🔥 TRENDING' : '↔️ RANGING'}
          </Text>
        </View>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>V4</Text>
        </View>
      </View>

      {activeDirection.awaitingRescore ? (
        <View style={styles.rescoreBox}>
          <Text style={styles.rescoreTitle}>{activeDirection.decisionLabel}</Text>
          <Text style={styles.rescoreHint}>
            Điểm nhóm tham khảo (không dùng cho quyết định cuối):
          </Text>
          <Text style={styles.rescoreRef}>
            A {activeDirection.groupScores.A.toFixed(1)} · B{' '}
            {activeDirection.groupScores.B.toFixed(1)} · C{' '}
            {activeDirection.groupScores.C.toFixed(1)}
          </Text>
        </View>
      ) : null}

      <GroupScoreBar
        groupScores={activeDirection.groupScores}
        groupBlocks={activeDirection.groupBlocks}
      />

      {activeDirection.groupBlocks.length > 0 ? (
        <View style={styles.blockBox}>
          {activeDirection.groupBlocks.map((b, i) => (
            <Text key={i} style={styles.blockText}>
              ❌ {b}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  modeLabel: {
    color: '#848E9C',
    fontSize: 12,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  modeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  versionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#3861FB20',
  },
  versionText: {
    color: '#3861FB',
    fontSize: 10,
    fontWeight: 'bold',
  },
  rescoreBox: {
    backgroundColor: '#848E9C15',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#848E9C',
  },
  rescoreTitle: {
    color: '#EAECEF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  rescoreHint: {
    color: '#848E9C',
    fontSize: 11,
    marginBottom: 4,
  },
  rescoreRef: {
    color: '#F0B90B',
    fontSize: 12,
    fontWeight: '600',
  },
  blockBox: {
    backgroundColor: '#F6465D20',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F6465D',
  },
  blockText: {
    color: '#F6465D',
    fontSize: 11,
    marginBottom: 2,
  },
});

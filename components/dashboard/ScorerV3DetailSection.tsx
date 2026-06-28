import { StyleSheet, Text, View } from 'react-native';
import { GroupScoreBar } from '../GroupScoreBar';
import type { DirectionalScoreV3, ScoringResultV3 } from '../../services/scorerV3';

interface ScorerV3DetailSectionProps {
  scoringResultV3: ScoringResultV3;
  activeDirection: DirectionalScoreV3;
}

export function ScorerV3DetailSection({
  scoringResultV3,
  activeDirection,
}: ScorerV3DetailSectionProps) {
  const isTrending = scoringResultV3.marketMode === 'TRENDING';

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
      </View>

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
    fontSize: 12,
  },
});

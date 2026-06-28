import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { THEME_COLORS, SCORING_GROUPS_V3 } from '../constants/scoring';
import type { GroupScores } from '../services/scorerV3';

interface Props {
  groupScores: GroupScores;
  groupBlocks: string[];
}

export const GroupScoreBar: React.FC<Props> = ({
  groupScores,
  groupBlocks,
}) => {
  const groups = [
    {
      key: 'A' as const,
      label: 'A Xu hướng',
      score: groupScores.A,
      max: 5,
      min: SCORING_GROUPS_V3.GROUP_A_TREND.minRequired,
    },
    {
      key: 'B' as const,
      label: 'B Dòng tiền',
      score: groupScores.B,
      max: 5,
      min: SCORING_GROUPS_V3.GROUP_B_FLOW.minRequired,
    },
    {
      key: 'C' as const,
      label: 'C Bối cảnh',
      score: groupScores.C,
      max: 5,
      min: SCORING_GROUPS_V3.GROUP_C_CONTEXT.minRequired,
    },
  ];

  const getColor = (score: number, min: number): string => {
    if (score < min) return THEME_COLORS.red;
    if (score < min + 0.5) return THEME_COLORS.yellow;
    return THEME_COLORS.green;
  };

  return (
    <View style={styles.container}>
      {groups.map((g) => {
        const color = getColor(g.score, g.min);
        const blocked = groupBlocks.some((b) => b.includes(`Nhóm ${g.key}`));
        const barWidth = `${(g.score / g.max) * 100}%`;

        return (
          <View key={g.key} style={styles.row}>
            <Text style={styles.label}>
              [{g.key}] {g.label}
            </Text>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  { width: barWidth as `${number}%`, backgroundColor: color },
                ]}
              />
            </View>
            <Text style={[styles.score, { color }]}>
              {g.score.toFixed(1)}/{g.max}
              {blocked ? ' ❌' : ' ✅'}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E2329',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#848E9C',
    fontSize: 12,
    width: 100,
  },
  barBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#2B3139',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  score: {
    fontSize: 12,
    width: 60,
    textAlign: 'right',
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { COLORS, type TradeDecisionLabel } from '../constants/scoring';
import { RADIUS } from '../constants/theme';

interface DecisionBadgeProps {
  label: TradeDecisionLabel;
  display: string;
  score?: number;
  maxScore?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const DECISION_COLOR: Record<TradeDecisionLabel, string> = {
  KHONG_VAO: COLORS.bearish,
  CHO_THEM: COLORS.warning,
  CO_THE_VAO: COLORS.bullishMuted,
  VAO_TU_TIN: COLORS.bullish,
  CHO_TAI_CHAM: COLORS.textSecondary,
  SETUP_NGON: COLORS.accent,
};

/** Huy hiệu kết luận phân tích lệnh mới (Phase 6). */
export function DecisionBadge({
  label,
  display,
  score,
  maxScore = 15,
  size = 'md',
}: DecisionBadgeProps) {
  const color = DECISION_COLOR[label];
  const sizeStyle = size === 'lg' ? styles.lg : size === 'sm' ? styles.sm : styles.md;
  const textSize = size === 'lg' ? styles.textLg : size === 'sm' ? styles.textSm : styles.textMd;

  return (
    <View style={[styles.badge, sizeStyle, { borderColor: color, backgroundColor: `${color}1A` }]}>
      <Text style={[styles.text, textSize, { color }]}>{display}</Text>
      {score != null ? (
        <Text style={[styles.score, { color }]}>
          {score.toFixed(1)} / {maxScore}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  md: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lg: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    fontWeight: '800',
    textAlign: 'center',
  },
  textSm: { fontSize: 11 },
  textMd: { fontSize: 13 },
  textLg: { fontSize: 16 },
  score: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});

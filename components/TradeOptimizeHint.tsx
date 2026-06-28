import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface TradeOptimizeHintProps {
  summary: string;
  detail?: string;
  onApply?: () => void;
  onEdit?: () => void;
  applyLabel?: string;
}

/** Banner gợi ý chỉnh entry / SL / TP theo quét mới. */
export function TradeOptimizeHint({
  summary,
  detail,
  onApply,
  onEdit,
  applyLabel = vi.optimize.apply,
}: TradeOptimizeHintProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.summary}>💡 {summary}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      <View style={styles.actions}>
        {onEdit ? (
          <Pressable onPress={onEdit} style={[styles.btn, styles.btnMuted, webPointer]}>
            <Text style={styles.btnMutedText}>{vi.optimize.edit}</Text>
          </Pressable>
        ) : null}
        {onApply ? (
          <Pressable onPress={onApply} style={[styles.btn, styles.btnApply, webPointer]}>
            <Text style={styles.btnApplyText}>{applyLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: SPACING.xs,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.08)',
    gap: 6,
  },
  summary: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 14,
  },
  detail: {
    fontSize: 9,
    color: COLORS.textSecondary,
    lineHeight: 13,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  btnMuted: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  btnMutedText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  btnApply: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  btnApplyText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.background,
  },
});

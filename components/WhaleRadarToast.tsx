import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import type { WhaleRadarToastItem } from '../hooks/useWhaleRadar';

interface WhaleRadarToastProps {
  items: WhaleRadarToastItem[];
}

/** Dòng thông báo cá mập ngắn — tự biến mất sau vài giây. */
export function WhaleRadarToast({ items }: WhaleRadarToastProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.stack} pointerEvents="box-none">
      {items.map((item) => (
        <View key={item.id} style={styles.toast}>
          <Text style={styles.toastText}>🐋 {item.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 100,
    gap: SPACING.xs,
  },
  toast: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
});

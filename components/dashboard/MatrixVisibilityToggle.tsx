import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';

interface MatrixVisibilityToggleProps {
  visible: boolean;
  onChange: (visible: boolean) => void;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export function MatrixVisibilityToggle({ visible, onChange }: MatrixVisibilityToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!visible)}
      style={({ pressed }) => [
        styles.row,
        visible && styles.rowOn,
        pressed && styles.rowPressed,
        webPointer,
      ]}
    >
      <View style={[styles.box, visible && styles.boxOn]}>
        {visible ? <Text style={styles.check}>✓</Text> : null}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.label}>{vi.matrixToggle.label}</Text>
        <Text style={styles.hint}>{vi.matrixToggle.hint}</Text>
      </View>
      <Text style={[styles.status, visible && styles.statusOn]}>
        {visible ? vi.matrixToggle.on : vi.matrixToggle.off}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  rowOn: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.06)',
  },
  rowPressed: {
    opacity: 0.9,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  boxOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  check: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.background,
    lineHeight: 13,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  hint: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 14,
  },
  status: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusOn: {
    color: COLORS.accent,
  },
});

import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { vi } from '../constants/vi';

/** Chặn UI cho đến khi nạp xong dữ liệu đã lưu. */
export function AppHydrationGate({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  if (ready) return <>{children}</>;

  return (
    <View style={styles.box}>
      <ActivityIndicator color={COLORS.accent} size="large" />
      <Text style={styles.title}>{vi.app.loadingPersistTitle}</Text>
      <Text style={styles.hint}>{vi.app.loadingPersistHint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
});

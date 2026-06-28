import { useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CapitalManagementSection } from '../components/capital/CapitalManagementSection';
import { COLORS } from '../constants/scoring';
import { SPACING } from '../constants/theme';
import { vi } from '../constants/vi';

interface SettingsScreenProps {
  focusCapital?: boolean;
  onCapitalUpdated?: () => void;
}

export function SettingsScreen({ focusCapital = false, onCapitalUpdated }: SettingsScreenProps) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!focusCapital || Platform.OS === 'web') return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 100);
    return () => clearTimeout(t);
  }, [focusCapital]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{vi.settings.title}</Text>
      <Text style={styles.subtitle}>{vi.settings.subtitle}</Text>
      <CapitalManagementSection
        autoFocus={focusCapital}
        onCapitalUpdated={onCapitalUpdated}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
});

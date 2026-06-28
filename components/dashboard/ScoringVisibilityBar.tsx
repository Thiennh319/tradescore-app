import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';

export type ScoringPanelKey = 'phase4' | 'ai' | 'spectrum' | 'mtf' | 'engine';

export const SCORING_PANELS_STORAGE_KEY = 'tradescore-scoring-panels-v4';

export const DEFAULT_SCORING_PANELS: Record<ScoringPanelKey, boolean> = {
  phase4: true,
  ai: false,
  spectrum: false,
  mtf: false,
  engine: false,
};

const PANEL_ORDER: ScoringPanelKey[] = ['phase4', 'ai', 'spectrum', 'mtf', 'engine'];

export function loadScoringPanels(): Record<ScoringPanelKey, boolean> {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SCORING_PANELS };
  try {
    const raw = localStorage.getItem(SCORING_PANELS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCORING_PANELS };
    const parsed = JSON.parse(raw) as Partial<Record<ScoringPanelKey, boolean>>;
    return { ...DEFAULT_SCORING_PANELS, ...parsed };
  } catch {
    return { ...DEFAULT_SCORING_PANELS };
  }
}

export function saveScoringPanels(value: Record<ScoringPanelKey, boolean>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SCORING_PANELS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

interface ScoringVisibilityBarProps {
  value: Record<ScoringPanelKey, boolean>;
  onChange: (key: ScoringPanelKey, visible: boolean) => void;
}

export function ScoringVisibilityBar({ value, onChange }: ScoringVisibilityBarProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{vi.scoringVisibility.label}</Text>
      <Text style={styles.hint}>{vi.scoringVisibility.hint}</Text>
      <View style={styles.chips}>
        {PANEL_ORDER.map((key) => {
          const on = value[key];
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key, !on)}
              style={({ pressed }) => [
                styles.chip,
                on ? styles.chipOn : styles.chipOff,
                pressed && styles.chipPressed,
                webPointer,
              ]}
            >
              <View style={[styles.box, on && styles.boxOn]}>
                {on ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>
                {vi.scoringVisibility.panels[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SPACING.md,
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hint: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipOn: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.1)',
  },
  chipOff: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    opacity: 0.72,
  },
  chipPressed: {
    opacity: 0.85,
  },
  box: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  check: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.background,
    lineHeight: 11,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextOn: {
    color: COLORS.textPrimary,
  },
  chipTextOff: {
    color: COLORS.textMuted,
  },
});

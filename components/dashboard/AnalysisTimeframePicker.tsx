import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ANALYSIS_TIMEFRAMES,
  COLORS,
  type AnalysisTimeframe,
} from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';

interface AnalysisTimeframePickerProps {
  selected: AnalysisTimeframe;
  onSelect: (tf: AnalysisTimeframe) => void;
}

export function AnalysisTimeframePicker({
  selected,
  onSelect,
}: AnalysisTimeframePickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0, width: 88 });
  const triggerRef = useRef<View>(null);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPos({ top: y + height + 4, right: x + width, width: Math.max(width, 88) });
      setOpen(true);
    });
  };

  const pick = (tf: AnalysisTimeframe) => {
    onSelect(tf);
    setOpen(false);
  };

  return (
    <>
      <View style={styles.wrap}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{vi.analysisTf.title}</Text>
            <Text style={styles.subtitle}>{vi.analysisTf.subtitle(selected)}</Text>
          </View>
          <View ref={triggerRef} collapsable={false}>
            <Pressable
              onPress={openMenu}
              style={styles.trigger}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
            >
              <Text style={styles.triggerLabel}>{selected}</Text>
              <Text style={styles.chevron}>▾</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.menu,
              {
                top: menuPos.top,
                left: menuPos.right - menuPos.width,
                minWidth: menuPos.width,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {ANALYSIS_TIMEFRAMES.map((tf) => {
              const active = tf === selected;
              return (
                <Pressable
                  key={tf}
                  onPress={() => pick(tf)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {tf}
                  </Text>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  headerText: {
    flex: 1,
    minWidth: 140,
    gap: 2,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.06)',
    minWidth: 72,
  },
  triggerLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.accent,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionActive: {
    backgroundColor: 'rgba(240, 185, 11, 0.08)',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  optionTextActive: {
    color: COLORS.accent,
    fontWeight: '800',
  },
  check: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accent,
  },
});

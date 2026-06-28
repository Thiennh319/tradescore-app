import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import { useTradeStore, type PsychologyChecklist } from '../store/useTradeStore';

interface PsychologyModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ITEM_KEYS: (keyof PsychologyChecklist)[] = [
  'noRevengeTrading',
  'withinDailyLossLimit',
  'restedAndFocused',
  'planWritten',
  'noOverLeverage',
];

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

/** Modal checklist tâm lý trước khi vào lệnh (Phase 6). */
export function PsychologyModal({ visible, onClose, onConfirm }: PsychologyModalProps) {
  const checklist = useTradeStore((s) => s.psychologyChecklist);
  const updateChecklist = useTradeStore((s) => s.updatePsychologyChecklist);

  const allChecked = ITEM_KEYS.every((key) => checklist[key]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{vi.psychology.title}</Text>
          <Text style={styles.subtitle}>{vi.psychology.subtitle}</Text>

          <View style={styles.list}>
            {ITEM_KEYS.map((key) => {
              const checked = checklist[key];
              return (
                <Pressable
                  key={key}
                  style={[styles.item, webPointer]}
                  onPress={() => updateChecklist({ [key]: !checked })}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <Text style={styles.itemLabel}>{vi.store.psychologyItems[key]}</Text>
                </Pressable>
              );
            })}
          </View>

          {!allChecked ? <Text style={styles.warn}>{vi.psychology.warn}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost, webPointer]} onPress={onClose}>
              <Text style={styles.btnGhostText}>{vi.psychology.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, !allChecked && styles.btnDisabled, webPointer]}
              disabled={!allChecked}
              onPress={onConfirm}
            >
              <Text style={styles.btnPrimaryText}>{vi.psychology.confirm}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  list: {
    gap: SPACING.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: COLORS.bullish,
    borderColor: COLORS.bullish,
  },
  checkmark: {
    color: '#02110A',
    fontSize: 13,
    fontWeight: '900',
  },
  itemLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  warn: {
    fontSize: 11,
    color: COLORS.warning,
    marginTop: SPACING.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  btn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  btnPrimary: {
    backgroundColor: COLORS.accent,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#02110A',
  },
});

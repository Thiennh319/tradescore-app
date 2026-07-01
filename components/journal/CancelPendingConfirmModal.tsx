import { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface CancelPendingConfirmModalProps {
  visible: boolean;
  entry: AiTradeJournalEntry | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** WebView / web không hỗ trợ Alert.alert — dùng Modal thay thế. */
export function CancelPendingConfirmModal({
  visible,
  entry,
  onCancel,
  onConfirm,
}: CancelPendingConfirmModalProps) {
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, onCancel]);

  if (!entry) return null;

  const symbolLabel = entry.symbol.replace('USDT', '');
  const direction = entry.scoring.direction;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{vi.pendingOrder.cancel}</Text>
          <Text style={styles.message}>
            Huỷ limit {symbolLabel} {direction}?
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnCancel, webPointer]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.btnCancelText}>{vi.signalBoard.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnConfirm, webPointer]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={styles.btnConfirmText}>Huỷ lệnh</Text>
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
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnConfirm: {
    backgroundColor: COLORS.bearish,
    borderColor: COLORS.bearish,
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.background,
  },
  btnCancel: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});

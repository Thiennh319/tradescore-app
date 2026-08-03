import { useEffect } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import type { EsmUlReviewExplanationPanel } from '../../utils/esmUlReviewExplanation';
import { UlReviewExplanationContent } from './UlReviewExplanationContent';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface UlReviewExplanationSheetProps {
  visible: boolean;
  panel: EsmUlReviewExplanationPanel | null;
  onClose: () => void;
  presentation?: 'sheet' | 'dialog';
}

/** Mobile sheet / desktop dialog for UL Review explanation (click ⓘ or label). */
export function UlReviewExplanationSheet({
  visible,
  panel,
  onClose,
  presentation = 'sheet',
}: UlReviewExplanationSheetProps) {
  const isDialog = presentation === 'dialog';
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, onClose]);

  if (!panel?.hasContent) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, isDialog && styles.backdropDialog]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.sheet, isDialog && styles.sheetDialog]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Đánh giá UL</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Đóng panel đánh giá UL"
              {...webPointer}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
          <UlReviewExplanationContent panel={panel} variant="sheet" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: SPACING.md,
  },
  backdropDialog: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    maxHeight: '82%',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 -8px 32px rgba(0,0,0,0.45)' } as object)
      : {}),
  },
  sheetDialog: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '78%',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' } as object)
      : {}),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeBtnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
});

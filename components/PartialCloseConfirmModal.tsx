import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PartialCloseReason } from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import { partialCloseConfirmMessage } from '../../services/partialClose';
import { formatUsdPrice } from '../../utils/formatPrice';
import type { AppTradeSymbol } from '../../constants/scoring';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface PartialCloseConfirmModalProps {
  visible: boolean;
  reason: PartialCloseReason | null;
  symbol: AppTradeSymbol;
  markPrice: number | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function PartialCloseConfirmModal({
  visible,
  reason,
  symbol,
  markPrice,
  onClose,
  onConfirm,
}: PartialCloseConfirmModalProps) {
  if (!reason) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{vi.signalBoard.partialCloseTitle}</Text>
          <Text style={styles.message}>{partialCloseConfirmMessage(reason)}</Text>
          {markPrice != null && Number.isFinite(markPrice) ? (
            <Text style={styles.mark}>
              Giá mark: {formatUsdPrice(symbol, markPrice)}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnMuted]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.btnMutedText}>{vi.signalBoard.partialCloseCancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, webPointer]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{vi.signalBoard.partialCloseConfirm}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '700',
  },
  message: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  mark: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  btn: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnMuted: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnMutedText: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: COLORS.bullish,
  },
  btnPrimaryText: {
    color: '#000',
    fontWeight: '700',
  },
});

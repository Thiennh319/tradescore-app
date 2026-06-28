import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppTradeSymbol } from '../../constants/scoring';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import type { SignalRow } from '../../services/signalBoardScan';
import { formatPrice, parsePriceInput } from '../../utils/formatPrice';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface PendingLimitModalProps {
  visible: boolean;
  row: SignalRow | null;
  defaultLimitPrice?: number;
  onCancel: () => void;
  onConfirm: (limitPrice: number) => void;
}

export function PendingLimitModal({
  visible,
  row,
  defaultLimitPrice,
  onCancel,
  onConfirm,
}: PendingLimitModalProps) {
  const [priceText, setPriceText] = useState('');

  if (!row) return null;
  const sym = row.symbol as AppTradeSymbol;

  const resetOnOpen = () => {
    const prefill =
      defaultLimitPrice ??
      row.tradePlan?.entryZone?.optimal ??
      row.tradePlan?.entryPrice ??
      row.price ??
      0;
    setPriceText(prefill > 0 ? formatPrice(sym, prefill) : '');
  };

  const handleConfirm = () => {
    const limitPrice = parsePriceInput(sym, priceText);
    if (limitPrice == null || limitPrice <= 0) return;
    onConfirm(limitPrice);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onShow={resetOnOpen}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>⏳ Đặt lệnh chờ (Limit)</Text>
          <Text style={styles.sub}>
            {sym.replace('USDT', '')} {row.direction} · {row.decisionDisplay}
          </Text>
          <Text style={styles.question}>Giá limit đặt?</Text>
          <TextInput
            value={priceText}
            onChangeText={setPriceText}
            style={styles.input}
            keyboardType="decimal-pad"
            autoFocus
            placeholderTextColor={COLORS.textMuted}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.cancelBtn, webPointer]}>
              <Text style={styles.cancelText}>Huỷ</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} style={[styles.confirmBtn, webPointer]}>
              <Text style={styles.confirmText}>Lưu lệnh chờ</Text>
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  question: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.background,
  },
});

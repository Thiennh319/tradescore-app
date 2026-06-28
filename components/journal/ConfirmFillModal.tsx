import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import type { AppTradeSymbol } from '../../constants/scoring';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { resolveActualEntryPrice } from '../../services/orderFillResolution';
import { formatPrice, formatUsdt, parsePriceInput, parseUsdtInput } from '../../utils/formatPrice';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export interface ConfirmFillValues {
  /** Giá market tại thời điểm khớp (từ sàn / mark). */
  marketPriceAtFill: number;
  actualSL: number;
  actualSize: number;
}

interface ConfirmFillModalProps {
  visible: boolean;
  entry: AiTradeJournalEntry | null;
  onClose: () => void;
  onConfirm: (values: ConfirmFillValues) => void;
}

export function ConfirmFillModal({
  visible,
  entry,
  onClose,
  onConfirm,
}: ConfirmFillModalProps) {
  const [entryText, setEntryText] = useState('');
  const [slText, setSlText] = useState('');
  const [sizeText, setSizeText] = useState('');

  const sym = (entry?.symbol ?? 'BTCUSDT') as AppTradeSymbol;
  const orderEntryPrice =
    entry?.outcome.limitOrderPrice ?? entry?.market.entryPrice ?? 0;
  const direction = entry?.scoring.direction ?? 'LONG';

  const marketPreview = useMemo(() => {
    if (!entry) return null;
    const parsed = parsePriceInput(sym, entryText);
    if (parsed == null) return null;
    return resolveActualEntryPrice(direction, orderEntryPrice, parsed);
  }, [entry, sym, entryText, direction, orderEntryPrice]);

  if (!entry) return null;

  const resetOnOpen = () => {
    setEntryText(orderEntryPrice > 0 ? formatPrice(sym, orderEntryPrice) : '');
    setSlText(
      entry.plan.slActual > 0 ? formatPrice(sym, entry.plan.slActual) : '',
    );
    setSizeText(
      entry.plan.sizeActual > 0 ? formatUsdt(entry.plan.sizeActual) : '',
    );
  };

  const handleConfirm = () => {
    const marketPriceAtFill = parsePriceInput(sym, entryText);
    const actualSL = parsePriceInput(sym, slText);
    const actualSize = parseUsdtInput(sizeText);
    if (
      marketPriceAtFill == null ||
      actualSL == null ||
      actualSize == null ||
      actualSize <= 0
    ) {
      return;
    }
    onConfirm({ marketPriceAtFill, actualSL, actualSize });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={resetOnOpen}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>✅ Xác nhận đã Fill</Text>
          <Text style={styles.sub}>
            {sym.replace('USDT', '')} {entry.scoring.direction} · Lệnh{' '}
            {formatPrice(sym, orderEntryPrice)}
          </Text>

          <Text style={styles.label}>Giá market tại fill</Text>
          <TextInput
            value={entryText}
            onChangeText={setEntryText}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textMuted}
          />
          {marketPreview?.entryAdjusted ? (
            <Text style={styles.adjustHint}>
              Entry ghi nhận: {formatPrice(sym, marketPreview.actualEntryPrice)} (điều chỉnh từ{' '}
              {formatPrice(sym, orderEntryPrice)})
            </Text>
          ) : null}

          <Text style={styles.label}>SL thực tế</Text>
          <TextInput
            value={slText}
            onChangeText={setSlText}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>Size thực tế (USDT)</Text>
          <TextInput
            value={sizeText}
            onChangeText={setSizeText}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textMuted}
          />

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.cancelBtn, webPointer]}>
              <Text style={styles.cancelText}>Huỷ</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} style={[styles.confirmBtn, webPointer]}>
              <Text style={styles.confirmText}>Xác nhận Fill</Text>
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
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: SPACING.sm,
  },
  adjustHint: {
    fontSize: 10,
    color: COLORS.accent,
    marginTop: 4,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    fontSize: 14,
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

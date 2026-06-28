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
import { formatPrice, formatUsdt, parsePriceInput, parseUsdtInput } from '../../utils/formatPrice';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export interface ConfirmTradeValues {
  entryPrice: number;
  stopLoss: number;
  sizeActual: number;
}

interface ConfirmTradeWizardProps {
  visible: boolean;
  row: SignalRow | null;
  defaultEntry?: number;
  defaultSl?: number;
  defaultSize?: number;
  onCancel: () => void;
  onConfirm: (values: ConfirmTradeValues) => void;
}

type Step = 'entry' | 'sl' | 'size';

export function ConfirmTradeWizard({
  visible,
  row,
  defaultEntry,
  defaultSl,
  defaultSize,
  onCancel,
  onConfirm,
}: ConfirmTradeWizardProps) {
  const [step, setStep] = useState<Step>('entry');
  const [entryText, setEntryText] = useState('');
  const [slText, setSlText] = useState('');
  const [sizeText, setSizeText] = useState('');

  if (!row) return null;
  const sym = row.symbol as AppTradeSymbol;

  const resetOnOpen = () => {
    setStep('entry');
    const ep = defaultEntry ?? row.price ?? row.tradePlan?.entryPrice ?? 0;
    const sl = defaultSl ?? row.tradePlan?.stopLoss ?? 0;
    const sz = defaultSize ?? 0;
    setEntryText(ep > 0 ? formatPrice(sym, ep) : '');
    setSlText(sl > 0 ? formatPrice(sym, sl) : '');
    setSizeText(sz > 0 ? formatUsdt(sz) : '');
  };

  const titles: Record<Step, string> = {
    entry: 'Giá vào thực tế?',
    sl: 'SL thực tế?',
    size: 'Size thực tế (USDT)?',
  };

  const handleNext = () => {
    if (step === 'entry') {
      if (parsePriceInput(sym, entryText) == null) return;
      setStep('sl');
      return;
    }
    if (step === 'sl') {
      if (parsePriceInput(sym, slText) == null) return;
      setStep('size');
      return;
    }
    const entryPrice = parsePriceInput(sym, entryText);
    const stopLoss = parsePriceInput(sym, slText);
    const sizeActual = parseUsdtInput(sizeText);
    if (entryPrice == null || stopLoss == null || sizeActual == null || sizeActual <= 0) return;
    onConfirm({ entryPrice, stopLoss, sizeActual });
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
          <Text style={styles.badge}>
            Bước {step === 'entry' ? 1 : step === 'sl' ? 2 : 3}/3
          </Text>
          <Text style={styles.title}>✅ Xác nhận vào lệnh</Text>
          <Text style={styles.sub}>
            {sym.replace('USDT', '')} {row.direction} · {row.decisionDisplay}
          </Text>
          <Text style={styles.question}>{titles[step]}</Text>

          {step === 'entry' ? (
            <TextInput
              value={entryText}
              onChangeText={setEntryText}
              style={styles.input}
              keyboardType="decimal-pad"
              autoFocus
              placeholderTextColor={COLORS.textMuted}
            />
          ) : null}
          {step === 'sl' ? (
            <TextInput
              value={slText}
              onChangeText={setSlText}
              style={styles.input}
              keyboardType="decimal-pad"
              autoFocus
              placeholderTextColor={COLORS.textMuted}
            />
          ) : null}
          {step === 'size' ? (
            <TextInput
              value={sizeText}
              onChangeText={setSizeText}
              style={styles.input}
              keyboardType="decimal-pad"
              autoFocus
              placeholderTextColor={COLORS.textMuted}
            />
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.cancelBtn, webPointer]}>
              <Text style={styles.cancelText}>Huỷ</Text>
            </Pressable>
            <Pressable onPress={handleNext} style={[styles.nextBtn, webPointer]}>
              <Text style={styles.nextText}>
                {step === 'size' ? 'Lưu lệnh' : 'Tiếp'}
              </Text>
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
  badge: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  sub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  question: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
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
  cancelText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  nextBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  nextText: { fontSize: 12, fontWeight: '800', color: '#02110A' },
});

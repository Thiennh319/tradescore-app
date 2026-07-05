import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, type AppTradeSymbol } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { symbolLabelVi } from '../../constants/vi';
import type { ReversalTradeSetup } from '../../services/v41/reversalTradeSetup';
import { formatPrice } from '../../utils/formatPrice';

const LONG_COLOR = '#22C55E';
const SHORT_COLOR = '#EF4444';
const AUTO_CLOSE_SECONDS = 300;
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export interface ReversalModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  setup: ReversalTradeSetup;
  symbol: string;
  marketState: string;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function PlanLevelRow({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.levelRow}>
      <Text style={styles.levelLabel}>{label}</Text>
      <View style={styles.levelRight}>
        <Text style={[styles.levelValue, valueColor ? { color: valueColor } : null]}>
          {value}
        </Text>
        {sub ? <Text style={styles.levelSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function ReversalModal({
  visible,
  onClose,
  onConfirm,
  onSkip,
  setup,
  symbol,
  marketState: _marketState,
}: ReversalModalProps) {
  const { direction } = setup;
  const headerColor = direction === 'LONG' ? LONG_COLOR : SHORT_COLOR;
  const symbolLabel = symbolLabelVi(symbol as AppTradeSymbol);
  const fmt = (price: number) => formatPrice(symbol, price);
  const [remainingSeconds, setRemainingSeconds] = useState(AUTO_CLOSE_SECONDS);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) {
      setRemainingSeconds(AUTO_CLOSE_SECONDS);
      return;
    }

    setRemainingSeconds(AUTO_CLOSE_SECONDS);
    const timerId = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          onCloseRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [visible]);

  const handleBackdropPress =
    Platform.OS === 'web'
      ? (e: { target?: unknown; currentTarget?: unknown }) => {
          if (e.target === e.currentTarget) onClose();
        }
      : onClose;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <View style={styles.sheet}>
          <View style={[styles.header, { backgroundColor: headerColor }]}>
            <Text style={styles.headerText}>
              ⚡ CƠ HỘI {direction} — {symbolLabel}
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={Platform.OS === 'web'}
          >
            <View
              style={[
                styles.warnBox,
                {
                  backgroundColor: hexWithAlpha('#F59E0B', 0.15),
                  borderColor: '#F59E0B',
                },
              ]}
            >
              <Text style={styles.warnText}>
                ⚠️ Lệnh ngược xu hướng 4H{'\n'}Chốt lời sớm hơn bình thường
              </Text>
            </View>

            <Text style={styles.sourceLine}>Đảo chiều + Retest EMA20 1H ✅</Text>

            <PlanLevelRow label="ENTRY" value={fmt(setup.entryPrice)} />
            <PlanLevelRow
              label="SL"
              value={fmt(setup.slPrice)}
              sub={`(-${setup.slDistancePct.toFixed(1)}%)`}
              valueColor="#EF4444"
            />
            <PlanLevelRow
              label="TP1"
              value={fmt(setup.tp1Price)}
              sub={`R:R ${setup.tp1RR.toFixed(1)}× — Chốt 50%`}
              valueColor="#22C55E"
            />
            <PlanLevelRow
              label="TP2"
              value={fmt(setup.tp2Price)}
              sub={`R:R ${setup.tp2RR.toFixed(1)}× — Chốt 30%`}
              valueColor="#22C55E"
            />
            <PlanLevelRow
              label="TP3"
              value={fmt(setup.tp3Price)}
              sub={`R:R ${setup.tp3RR.toFixed(1)}× — Chốt 20%`}
              valueColor="#22C55E"
            />

            <View style={styles.sizeBox}>
              <Text style={styles.sizeLine}>
                Size: {setup.marginUsdt} USDT · {setup.leverage}× · Max -{setup.maxLossUsdt.toFixed(2)}{' '}
                USDT
              </Text>
            </View>

            <Text style={styles.countdownLine}>
              Modal tự đóng sau: {remainingSeconds} giây
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.btn,
                styles.btnConfirm,
                { backgroundColor: headerColor },
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={styles.btnConfirmText}>⚡ Xác nhận {direction}</Text>
            </Pressable>
            <Pressable
              onPress={onSkip}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSkip,
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={styles.btnSkipText}>Bỏ qua cơ hội này</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
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
    maxHeight: '90%',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  headerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 440,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  warnBox: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: SPACING.xs,
  },
  warnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
    lineHeight: 16,
  },
  sourceLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  levelRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  levelValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  levelSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  sizeBox: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  sizeLine: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  countdownLine: {
    marginTop: SPACING.xs,
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    padding: SPACING.md,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  btnConfirm: {},
  btnConfirmText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnSkip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnSkipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  btnPressed: {
    opacity: 0.85,
  },
});

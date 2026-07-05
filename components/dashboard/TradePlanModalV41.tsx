import {
  ActivityIndicator,
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
import type { OpportunitySnapshot } from '../../services/v41/entryQualityEngine';
import type { TradeSetupV41 } from '../../services/v41/tradeSetupGenerator';
import { formatPrice } from '../../utils/formatPrice';

const LONG_COLOR = '#22C55E';
const SHORT_COLOR = '#EF4444';
const BLOCKED_HEADER_COLOR = '#374151';
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export interface TradePlanModalV41Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  direction: 'LONG' | 'SHORT';
  symbol: string;
  setup: TradeSetupV41 | null;
  opportunity?: OpportunitySnapshot;
}

function PlanLevelRow({
  label,
  labelColor,
  price,
  priceColor,
}: {
  label: string;
  labelColor?: string;
  price: string;
  priceColor?: string;
}) {
  return (
    <View style={styles.levelRow}>
      <View style={styles.levelTop}>
        <Text style={[styles.levelLabel, labelColor ? { color: labelColor } : null]}>
          {label}
        </Text>
        <Text style={[styles.levelPrice, priceColor ? { color: priceColor } : null]}>
          {price}
        </Text>
      </View>
    </View>
  );
}

export function TradePlanModalV41({
  visible,
  onClose,
  onConfirm,
  onSkip,
  direction,
  symbol,
  setup,
  opportunity,
}: TradePlanModalV41Props) {
  const symbolLabel = symbolLabelVi(symbol as AppTradeSymbol);
  const headerColor = direction === 'LONG' ? LONG_COLOR : SHORT_COLOR;

  const handleBackdropPress =
    Platform.OS === 'web'
      ? (e: { target?: unknown; currentTarget?: unknown }) => {
          if (e.target === e.currentTarget) onClose();
        }
      : onClose;

  if (!visible) {
    return null;
  }

  if (!setup) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
          <View style={styles.sheet}>
            <View style={[styles.body, styles.loadingBody]}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>Đang chuẩn bị kế hoạch...</Text>
            </View>
          </View>
        </Pressable>
      </Modal>
    );
  }

  const canEnter = setup.riskApproved && (opportunity?.opportunityValid ?? setup.entryQuality >= 70);
  const fmt = (price: number) => formatPrice(symbol, price);

  if (canEnter) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
          <View style={styles.sheet}>
            <View style={[styles.header, { backgroundColor: headerColor }]}>
              <Text style={styles.headerText}>
                ✅ KẾ HOẠCH V4.1 {direction} — {symbolLabel}
              </Text>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={Platform.OS === 'web'}
            >
              <Text style={styles.metaLine}>
                Entry Quality: {Math.round(setup.entryQuality)}/100 · R:R{' '}
                {setup.riskRewardRatio.toFixed(1)}×
              </Text>

              <PlanLevelRow
                label="ENTRY ZONE"
                price={`${fmt(setup.entryZoneLow)} – ${fmt(setup.entryZoneHigh)}`}
              />

              <PlanLevelRow
                label="SL"
                labelColor={SHORT_COLOR}
                price={fmt(setup.smartSlPrice)}
                priceColor={SHORT_COLOR}
              />

              <PlanLevelRow
                label="TP1"
                price={fmt(setup.tp1Price)}
                priceColor={LONG_COLOR}
              />

              <PlanLevelRow
                label="TP2"
                price={fmt(setup.tp2Price)}
                priceColor={LONG_COLOR}
              />

              <PlanLevelRow
                label="TP3"
                price={fmt(setup.tp3Price)}
                priceColor={LONG_COLOR}
              />

              <View style={styles.sizeBox}>
                <Text style={styles.sizeLine}>
                  Size: {setup.marginUsdt.toFixed(1)} USDT | Đòn bẩy: {setup.leverage}×
                </Text>
                <Text style={styles.maxLossLine}>
                  Lỗ tối đa: -{setup.maxLossUsdt.toFixed(2)} USDT · SL{' '}
                  {setup.smartSlDistancePct.toFixed(2)}%
                </Text>
              </View>
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
                <Text style={styles.btnConfirmText}>Xác nhận vào lệnh</Text>
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
                <Text style={styles.btnSkipText}>Bỏ qua — Ghi nhận setup</Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnClose,
                  pressed && styles.btnPressed,
                  webPointer,
                ]}
              >
                <Text style={styles.btnCloseText}>Đóng</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <View style={styles.sheet}>
          <View style={[styles.header, { backgroundColor: BLOCKED_HEADER_COLOR }]}>
            <Text style={styles.headerText}>❌ CHƯA ĐỦ ĐIỀU KIỆN {direction}</Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={Platform.OS === 'web'}
          >
            <Text style={styles.blockText}>
              Entry Quality: {Math.round(setup.entryQuality)}/100
            </Text>
            <Text style={styles.blockText}>
              Risk approved: {setup.riskApproved ? 'Có' : 'Không'}
            </Text>
            <Text style={styles.blockText}>
              SL distance: {setup.smartSlDistancePct.toFixed(2)}% · Max loss:{' '}
              {setup.maxLossUsdt.toFixed(2)} USDT
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={onSkip}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSkip,
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={styles.btnSkipText}>Bỏ qua</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.btn,
                styles.btnClose,
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={styles.btnCloseText}>Đóng</Text>
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
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 420,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  loadingBody: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  metaLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  levelRow: {
    gap: 4,
  },
  levelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  levelPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sizeBox: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    gap: 4,
  },
  sizeLine: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  maxLossLine: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  blockText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
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
    color: '#02110A',
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
  btnClose: {
    backgroundColor: 'transparent',
  },
  btnCloseText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  btnPressed: {
    opacity: 0.85,
  },
});

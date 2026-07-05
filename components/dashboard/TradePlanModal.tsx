import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  COLORS,
  TRADE_PLAN_V3_CONFIG,
  type AppTradeSymbol,
  type TradeDirection,
  type TradePlanV3,
} from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import { symbolLabelVi } from '../../constants/vi';
import type { SignalRow } from '../../hooks/useSignalBoard';
import type { BlockSeverity, ExplainBlocksResult } from '../../services/tradePlanExplainer';
import { formatUsdPrice } from '../../utils/formatPrice';

const LONG_COLOR = '#22C55E';
const SHORT_COLOR = '#EF4444';
const BLOCKED_HEADER_COLOR = '#374151';
const BLOCK_HIGH_COLOR = '#EF4444';
const BLOCK_LOW_COLOR = '#F59E0B';
const ENTER_SCORE_MIN = 9;
const MAX_SCORE = 15;
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

const TP_ALLOC: Record<1 | 2 | 3, string> = {
  1: '50',
  2: '30',
  3: '20',
};

export interface TradePlanModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Đóng modal sau khi ghi nhận (nếu có). */
  onSkip: () => void;
  onRecordSkippedSetup?: (row: SignalRow, setupDirection: TradeDirection) => void;
  direction: TradeDirection;
  symbol: AppTradeSymbol;
  row: SignalRow;
  canEnter: boolean;
  entryExplain: string;
  slExplain: string;
  tp1Explain: string;
  tp2Explain: string;
  tp3Explain: string;
  blockInfo: ExplainBlocksResult;
}

function resolvePlan(row: SignalRow, direction: TradeDirection): TradePlanV3 | null {
  const v4 = row.tradePlansByScorer?.v4;
  if (v4?.direction === direction) return v4;
  const v3 = row.tradePlansByScorer?.v3;
  if (v3?.direction === direction) return v3;
  if (row.tradePlanV3?.direction === direction) return row.tradePlanV3;
  return null;
}

function PlanLevelRow({
  label,
  labelColor,
  price,
  priceColor,
  explain,
}: {
  label: string;
  labelColor?: string;
  price: string;
  priceColor?: string;
  explain: string;
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
      <Text style={styles.levelExplain}>{explain}</Text>
    </View>
  );
}

/** Modal kế hoạch lệnh — case A: canEnter; case B: chưa đủ điều kiện. */
export function TradePlanModal({
  visible,
  onClose,
  onConfirm,
  onSkip,
  onRecordSkippedSetup,
  direction,
  symbol,
  row,
  canEnter,
  entryExplain,
  slExplain,
  tp1Explain,
  tp2Explain,
  tp3Explain,
  blockInfo,
}: TradePlanModalProps) {
  const symbolLabel = symbolLabelVi(symbol);
  const directionScore = direction === 'LONG' ? row.longScore : row.shortScore;

  const handleSkipPress = () => {
    onRecordSkippedSetup?.(row, direction);
    onSkip();
  };

  const handleBackdropPress =
    Platform.OS === 'web'
      ? (e: { target?: unknown; currentTarget?: unknown }) => {
          if (e.target === e.currentTarget) onClose();
        }
      : onClose;

  if (canEnter) {
    const plan = resolvePlan(row, direction);
    const headerColor = direction === 'LONG' ? LONG_COLOR : SHORT_COLOR;
    const entryPrice = plan?.recommendedEntry ?? row.price;
    const slPrice = plan?.stopLoss.price;
    const sizeUsdt =
      plan?.positionSizeAdjusted ?? plan?.positionSize ?? TRADE_PLAN_V3_CONFIG.BASE_SIZE_USDT;
    const leverage = TRADE_PLAN_V3_CONFIG.LEVERAGE;
    const maxLoss = TRADE_PLAN_V3_CONFIG.MAX_LOSS_USDT;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
          <View style={styles.sheet}>
            <View style={[styles.header, { backgroundColor: headerColor }]}>
              <Text style={styles.headerText}>
                ✅ KẾ HOẠCH {direction} — {symbolLabel}
              </Text>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={Platform.OS === 'web'}
            >
              <PlanLevelRow
                label="ENTRY"
                price={formatUsdPrice(symbol, entryPrice)}
                explain={entryExplain}
              />

              <PlanLevelRow
                label="SL"
                labelColor={SHORT_COLOR}
                price={formatUsdPrice(symbol, slPrice)}
                priceColor={SHORT_COLOR}
                explain={slExplain}
              />

              <PlanLevelRow
                label={`TP1 — Chốt ${TP_ALLOC[1]}%`}
                price={formatUsdPrice(symbol, plan?.tp1.price)}
                priceColor={LONG_COLOR}
                explain={tp1Explain}
              />

              <PlanLevelRow
                label={`TP2 — Chốt ${TP_ALLOC[2]}%`}
                price={formatUsdPrice(symbol, plan?.tp2.price)}
                priceColor={LONG_COLOR}
                explain={tp2Explain}
              />

              <PlanLevelRow
                label={`TP3 — Chốt ${TP_ALLOC[3]}%`}
                price={formatUsdPrice(symbol, plan?.tp3.price)}
                priceColor={LONG_COLOR}
                explain={tp3Explain}
              />

              <View style={styles.sizeBox}>
                <Text style={styles.sizeLine}>
                  Size: {sizeUsdt.toFixed(1)} USDT | Đòn bẩy: {leverage}×
                </Text>
                <Text style={styles.maxLossLine}>
                  Lỗ tối đa: -{maxLoss.toFixed(1)} USDT
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
                onPress={handleSkipPress}
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

  const blockDotColor = (severity: BlockSeverity) =>
    severity === 'HIGH' ? BLOCK_HIGH_COLOR : BLOCK_LOW_COLOR;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <View style={styles.sheet}>
          <View style={[styles.header, { backgroundColor: BLOCKED_HEADER_COLOR }]}>
            <Text style={styles.headerText}>
              ❌ CHƯA ĐỦ ĐIỀU KIỆN {direction}
            </Text>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={Platform.OS === 'web'}
          >
            <Text style={styles.sectionTitle}>Lý do chặn:</Text>
            {blockInfo.blocks.map((block) => (
              <View key={block.text} style={styles.blockRow}>
                <View
                  style={[
                    styles.blockDot,
                    { backgroundColor: blockDotColor(block.severity) },
                  ]}
                />
                <Text style={styles.blockText}>{block.text}</Text>
              </View>
            ))}

            <Text style={styles.suggestionsTitle}>Cần theo dõi thêm:</Text>
            {blockInfo.suggestions.map((suggestion) => (
              <Text key={suggestion} style={styles.suggestionItem}>
                • {suggestion}
              </Text>
            ))}

            <View style={styles.scoreBox}>
              <Text style={styles.scoreLine}>
                Score {directionScore.toFixed(1)}/{MAX_SCORE}
              </Text>
              <Text style={styles.scoreThreshold}>
                Cần ≥ {ENTER_SCORE_MIN}/{MAX_SCORE}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={handleSkipPress}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  header: {
    padding: 16,
  },
  headerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    padding: 16,
    gap: 12,
  },
  levelRow: {
    gap: 4,
  },
  levelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  levelLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  levelPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  levelExplain: {
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  sizeBox: {
    marginTop: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: 4,
  },
  sizeLine: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  maxLossLine: {
    fontSize: 12,
    fontWeight: '700',
    color: SHORT_COLOR,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    padding: 16,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnConfirm: {
    borderWidth: 0,
  },
  btnConfirmText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnSkip: {
    backgroundColor: COLORS.surfaceElevated,
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
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnCloseText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  blockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  blockText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textPrimary,
    lineHeight: 18,
  },
  suggestionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
  },
  suggestionItem: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  scoreBox: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  scoreLine: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  scoreThreshold: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

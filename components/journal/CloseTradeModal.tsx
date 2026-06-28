import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  AiTradeJournalEntry,
  ManualExitReason,
  PlanHealthAtExit,
  PositionAdvisorActionAtExit,
  TradeExitReason,
} from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { RADIUS, SPACING } from '../../constants/theme';
import type { SignalRow } from '../../hooks/useSignalBoard';
import { computeTradePnl } from '../../services/journalService';
import {
  advisorActionCompactLabel,
  buildCloseAdvisorContext,
  followedAdvisorFromManualReason,
  MANUAL_EXIT_REASON_OPTIONS,
} from '../../services/positionAdvisorExitTracking';
import { useTradeStore } from '../../store/useTradeStore';
import { formatSignedPercent, formatSignedUsdt } from '../../utils/positionPnl';
import { formatUsdPrice } from '../../utils/formatPrice';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export interface CloseTradeResult {
  exitPrice: number;
  exitReason: TradeExitReason;
  notes?: string;
  offlineClose?: boolean;
  exitTimestamp?: number;
  positionAdvisorActionAtExit: PositionAdvisorActionAtExit | null;
  followedAdvisorRecommendation: boolean;
  manualExitReason: ManualExitReason;
  manualExitNote?: string;
  scoringDecisionAtExit: string | null;
  planHealthAtExit: PlanHealthAtExit | null;
}

interface CloseTradeModalProps {
  visible: boolean;
  entry: AiTradeJournalEntry | null;
  markPrice?: number | null;
  signalRow?: SignalRow | null;
  onClose: () => void;
  onConfirm: (result: CloseTradeResult) => void;
}

function advisorBoxStyle(action: PositionAdvisorActionAtExit) {
  if (action === 'HOLD_STRONG' || action === 'HOLD_CONDITIONAL') {
    return { borderColor: COLORS.bullish, backgroundColor: 'rgba(14, 203, 129, 0.08)' };
  }
  if (
    action === 'PARTIAL_CLOSE_30' ||
    action === 'PARTIAL_TP1' ||
    action === 'MOVE_SL_BE' ||
    action === 'MOVE_SL_TIGHTER'
  ) {
    return { borderColor: '#F0B90B', backgroundColor: 'rgba(240, 185, 11, 0.08)' };
  }
  if (action === 'CLOSE_NOW' || action === 'CLOSE_URGENT') {
    return { borderColor: COLORS.bearish, backgroundColor: 'rgba(246, 70, 93, 0.08)' };
  }
  if (action === 'FUNDING_REVERSAL' || action === 'SQUEEZE_ALERT') {
    return { borderColor: '#F97316', backgroundColor: 'rgba(249, 115, 22, 0.08)' };
  }
  return { borderColor: COLORS.border, backgroundColor: COLORS.background };
}

export function CloseTradeModal({
  visible,
  entry,
  markPrice,
  signalRow,
  onClose,
  onConfirm,
}: CloseTradeModalProps) {
  const [selectedReason, setSelectedReason] = useState<ManualExitReason | null>(null);
  const [otherText, setOtherText] = useState('');

  const scorerVersion = useTradeStore((s) => s.scorerVersion);
  const scoringResultV4 = useTradeStore((s) => s.scoringResultV4);
  const scoringResultV3 = useTradeStore((s) => s.scoringResultV3);
  const lockedPlan = useTradeStore((s) => s.lockedPlan);
  const leverage = useTradeStore((s) => s.settings.leverage) ?? 5;

  const advisorContext = useMemo(() => {
    if (!entry || !visible) return null;
    return buildCloseAdvisorContext({
      entry,
      markPrice: markPrice ?? entry.market.priceAtAnalysis,
      scorerVersion,
      signalRow,
      scoringResultV4,
      scoringResultV3,
      lockedPlan,
      currentFundingState: scoringResultV4?.l6Detail?.fundingState,
      currentSqueezeRisk: signalRow?.squeezeRisk ?? scoringResultV4?.squeezeRisk ?? null,
    });
  }, [
    entry,
    visible,
    markPrice,
    scorerVersion,
    signalRow,
    scoringResultV4,
    scoringResultV3,
    lockedPlan,
  ]);

  useEffect(() => {
    if (!visible) return;
    setSelectedReason(null);
    setOtherText('');
  }, [entry?.id, visible]);

  if (!entry) return null;

  const sym = entry.symbol as import('../../constants/scoring').AppTradeSymbol;
  const exitPrice =
    markPrice != null && Number.isFinite(markPrice)
      ? markPrice
      : entry.market.priceAtAnalysis ?? entry.market.entryPrice;
  const pnl = computeTradePnl(entry, exitPrice, leverage);
  const advisorAction = advisorContext?.positionAdvisorActionAtExit ?? 'NO_ACTIVE_ADVISOR';
  const advisorLabel = advisorActionCompactLabel(advisorAction);
  const advisorStyle = advisorBoxStyle(advisorAction);

  const needsOtherText = selectedReason === 'OTHER';
  const otherValid = !needsOtherText || otherText.trim().length > 0;
  const canConfirm = selectedReason != null && otherValid;

  const handleConfirm = () => {
    if (!canConfirm || selectedReason == null) return;

    const reasonLabel =
      MANUAL_EXIT_REASON_OPTIONS.find((o) => o.value === selectedReason)?.label ?? selectedReason;
    const noteParts: string[] = [`[Lý do đóng: ${reasonLabel}]`];
    if (selectedReason === 'OTHER' && otherText.trim()) {
      noteParts.push(otherText.trim());
    }

    onConfirm({
      exitPrice,
      exitReason: 'MANUAL_CLOSE',
      notes: noteParts.join(' — '),
      positionAdvisorActionAtExit: advisorAction,
      followedAdvisorRecommendation: followedAdvisorFromManualReason(selectedReason),
      manualExitReason: selectedReason,
      manualExitNote: selectedReason === 'OTHER' ? otherText.trim() : undefined,
      scoringDecisionAtExit: advisorContext?.scoringDecisionAtExit ?? null,
      planHealthAtExit: advisorContext?.planHealthAtExit ?? null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scrollWrap}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Xác nhận đóng lệnh</Text>
            <Text style={styles.sub}>
              {entry.symbol.replace('USDT', '')} {entry.scoring.direction} ·{' '}
              {formatUsdPrice(sym, exitPrice)}
            </Text>
            <Text style={styles.pnl}>
              PnL: {formatSignedUsdt(pnl.pnlUSDT)} ({formatSignedPercent(pnl.pnlPct)} ROE)
            </Text>

            <View style={[styles.advisorBox, advisorStyle]}>
              <Text style={styles.advisorTitle}>App đang khuyến nghị:</Text>
              <Text style={styles.advisorLabel}>{advisorLabel}</Text>
              {advisorContext?.recommendationLabel ? (
                <Text style={styles.advisorSub}>{advisorContext.recommendationLabel}</Text>
              ) : null}
            </View>

            <Text style={styles.fieldLabel}>Lý do đóng lệnh: (chọn 1)</Text>
            {MANUAL_EXIT_REASON_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setSelectedReason(opt.value)}
                style={[
                  styles.choiceRow,
                  selectedReason === opt.value && styles.choiceActive,
                  webPointer,
                ]}
              >
                <Text style={styles.choiceMark}>
                  {selectedReason === opt.value ? '●' : '○'}
                </Text>
                <Text style={styles.choiceText}>{opt.label}</Text>
              </Pressable>
            ))}

            {needsOtherText ? (
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                style={styles.input}
                placeholder="Nhập lý do..."
                placeholderTextColor={COLORS.textMuted}
              />
            ) : null}

            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.cancelBtn, webPointer]}>
                <Text style={styles.cancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled, webPointer]}
                disabled={!canConfirm}
              >
                <Text style={styles.confirmText}>Xác nhận đóng</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
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
  scrollWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sub: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 6,
  },
  pnl: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  advisorBox: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: 4,
  },
  advisorTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  advisorLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  advisorSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  choiceActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(14, 203, 129, 0.1)',
  },
  choiceMark: {
    fontSize: 12,
    color: COLORS.accent,
    width: 16,
  },
  choiceText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 13,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.background,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
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
  confirmBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.45,
  },
  confirmText: { fontSize: 12, fontWeight: '800', color: '#02110A' },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { COLORS, type AppTradeSymbol, type SkipReason } from '../../constants/scoring';
import { SCAN_INTERVAL_SECONDS } from '../../constants/scanSchedule';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { symbolLabelVi } from '../../constants/vi';
import { fetch24hTickerChange, fetchTickerPrice } from '../../services/binanceApi';
import {
  buildMarketSnapshot,
  buildPlanSnapshot,
  buildScoringSnapshot,
} from '../../services/journalService';
import { computeEntryQuality } from '../../services/v41/entryQualityEngine';
import { NEUTRAL_PROTECTION } from '../../services/v41/protectionLayer';
import type { UnifiedSignalResult, UnifiedSignalStrength } from '../../services/unifiedSignalEngine';
import { hasUnifiedSourceData } from '../../services/scanUnified';
import { DEFAULT_SCAN_SYMBOLS_V41, type SignalRowV41 } from '../../services/v41/scanV41';
import type { EarlyWarningSeverity } from '../../services/v41/earlyWarningEngine';
import type { MomentumResult } from '../../services/v41/momentumEngine1H';
import { useTradeStore } from '../../store/useTradeStore';
import { useV41Store, type V41SymbolState } from '../../store/useV41Store';
import { useUnifiedStore } from '../../store/useUnifiedStore';
import { formatPrice } from '../../utils/formatPrice';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

const MODULE_DEFAULT_SYMBOLS: string[] = [...DEFAULT_SCAN_SYMBOLS_V41];

const SYMBOL_COLORS: Record<string, string> = {
  BTCUSDT: '#F7931A',
  NEARUSDT: '#00C08B',
  SOLUSDT: '#9945FF',
  BNBUSDT: '#F0B90B',
};

const MARGIN_USDT = 6;
const LEVERAGE = 5;
const MAX_LOSS_USDT = 1.5;

const DEFAULT_EW_BLOCK_MESSAGE =
  '🔴 Đảo chiều xác nhận 30M+1H+Volume — không vào lệnh';

type DisplayUnifiedSignal = UnifiedSignalResult & {
  earlyWarningBadge?: string;
  ewCustomStrengthLabel?: string;
};

type EarlyWarningOverlay = {
  severity: EarlyWarningSeverity;
  blockMessage: string;
};

function buildV41RowFromStore(
  symbol: string,
  v41State: V41SymbolState | undefined,
): SignalRowV41 | undefined {
  if (!v41State?.lastSnapshot) return undefined;
  return {
    symbol,
    snapshot: v41State.lastSnapshot,
    visibilityMode: v41State.previousMode,
    earlyWarning: v41State.lastEarlyWarning,
    reversalState: v41State.lastReversalState,
    opportunity: v41State.lastOpportunity,
    fetchedAt: v41State.updatedAt ?? 0,
  };
}

function mergeV41Rows(
  symbol: string,
  fromStore?: SignalRowV41,
  fromScan?: SignalRowV41,
): SignalRowV41 | undefined {
  if (!fromStore && !fromScan) return undefined;
  return {
    ...fromStore,
    ...fromScan,
    symbol,
    snapshot: fromScan?.snapshot ?? fromStore!.snapshot,
    earlyWarning: fromScan?.earlyWarning ?? fromStore?.earlyWarning,
    reversalState: fromScan?.reversalState ?? fromStore?.reversalState,
    opportunity: fromScan?.opportunity ?? fromStore?.opportunity,
    momentum: fromScan?.momentum ?? fromStore?.momentum,
    exhaustion: fromScan?.exhaustion ?? fromStore?.exhaustion,
    fetchedAt: Math.max(fromScan?.fetchedAt ?? 0, fromStore?.fetchedAt ?? 0),
  };
}

function resolveMomentumBadgeDisplay(
  momentum: MomentumResult | undefined,
  direction: 'LONG' | 'SHORT' | 'NONE' | null,
): { text: string; color: string } {
  const dir = direction === 'SHORT' ? 'SHORT' : 'LONG';
  if (dir === 'LONG') {
    if (momentum?.momentumConfirmedLong) {
      return { text: 'Momentum: ✅', color: '#22C55E' };
    }
    if (momentum?.momentumLong === 1) {
      return { text: 'Momentum: ⚠️', color: '#F59E0B' };
    }
    return { text: 'Momentum: —', color: COLORS.textMuted };
  }
  if (momentum?.momentumConfirmedShort) {
    return { text: 'Momentum: ✅', color: '#22C55E' };
  }
  if (momentum?.momentumShort === 1) {
    return { text: 'Momentum: ⚠️', color: '#F59E0B' };
  }
  return { text: 'Momentum: —', color: COLORS.textMuted };
}

function resolveRescueBadgeText(v41Row?: SignalRowV41): string {
  const type =
    v41Row?.exhaustion?.exhaustionType ??
    v41Row?.opportunity?.exhaustionType ??
    'Unknown';
  return `⚡ ${type} — V4.1 Rescue`;
}

function resolveEarlyWarningOverlay(
  symbol: string,
  v41Row?: SignalRowV41,
): EarlyWarningOverlay | undefined {
  const fromRow = v41Row?.earlyWarning;
  const severity =
    fromRow?.severity ??
    useV41Store.getState().getSymbolState(symbol).ewCurrentSeverity;
  if (!severity || severity === 'CLEAR') return undefined;
  return {
    severity,
    blockMessage: fromRow?.blockMessage ?? DEFAULT_EW_BLOCK_MESSAGE,
  };
}

function applyEarlyWarningToUnifiedSignal(
  signal: UnifiedSignalResult,
  ew?: EarlyWarningOverlay,
): DisplayUnifiedSignal {
  if (!ew) return signal;

  if (signal.strength === 'STRONG_V41' && ew.severity === 'BLOCK') {
    return {
      ...signal,
      strength: 'WATCH',
      canEnter: false,
      strengthLabel: '🔵 Theo dõi thêm',
      strengthColor: '#3B82F6',
      blockReasons: [ew.blockMessage],
      priority: 40,
    };
  }

  if (signal.strength === 'STRONG_V41' && ew.severity === 'WARNING_HARD') {
    return {
      ...signal,
      earlyWarningBadge: '⚠️ Cảnh báo 1H',
    };
  }

  if (signal.strength === 'STRONG' && ew.severity === 'BLOCK') {
    const label = '🟡 V4 ✅ · V4.1 ⚠️ Block';
    return {
      ...signal,
      strength: 'MEDIUM',
      ewCustomStrengthLabel: label,
      strengthLabel: label,
      strengthColor: '#F59E0B',
      blockReasons: [],
    };
  }

  if (signal.strength === 'STRONG' && ew.severity === 'WARNING_HARD') {
    return {
      ...signal,
      earlyWarningBadge: '⚠️ Cảnh báo 1H',
    };
  }

  return signal;
}

const STRENGTH_BORDER: Record<
  UnifiedSignalStrength,
  { width: number; color: string }
> = {
  STRONG: { width: 3, color: '#22C55E' },
  STRONG_V41: { width: 3, color: '#22C55E' },
  RESCUE: { width: 3, color: '#A855F7' },
  MEDIUM: { width: 3, color: '#F59E0B' },
  WATCH: { width: 3, color: '#3B82F6' },
  NONE: { width: 1, color: '#374151' },
};

const STRENGTH_BADGE_STYLE: Record<
  UnifiedSignalStrength,
  { border: string; textColor: string }
> = {
  STRONG: { border: '#22C55E', textColor: '#22C55E' },
  STRONG_V41: { border: '#22C55E', textColor: '#22C55E' },
  RESCUE: { border: '#A855F7', textColor: '#A855F7' },
  MEDIUM: { border: '#F59E0B', textColor: '#F59E0B' },
  WATCH: { border: '#3B82F6', textColor: '#3B82F6' },
  NONE: { border: '#374151', textColor: '#6B7280' },
};

function resolveV41Confidence(symbol: string): number {
  const snapshot = useV41Store.getState().getSymbolState(symbol).lastSnapshot;
  return snapshot?.marketConfidence ?? 0;
}

function resolveStrengthBadgeText(signal: DisplayUnifiedSignal): string {
  if (signal.ewCustomStrengthLabel) return signal.ewCustomStrengthLabel;
  switch (signal.strength) {
    case 'STRONG':
      return '⭐ V4 + V4.1 đồng thuận';
    case 'STRONG_V41': {
      const conf = Math.round(resolveV41Confidence(signal.symbol));
      const eq = Math.round(signal.v41EQ ?? 0);
      const state = signal.v41MarketState ?? 'Unknown';
      return `🚀 V4.1 — ${state}\nConf ${conf} · EQ ${eq}`;
    }
    case 'RESCUE':
      return signal.strengthLabel;
    case 'MEDIUM':
      return '🟡 V4 xác nhận';
    case 'WATCH':
      return '🔵 Theo dõi thêm';
    default:
      return '⚪ Chưa có setup';
  }
}

function resolveDirectionActionColor(direction: 'LONG' | 'SHORT' | null): string {
  return direction === 'SHORT' ? '#EF4444' : '#22C55E';
}

type SymbolQuote = {
  price: number | null;
  changePct: number | null;
};

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function formatChangePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function formatV4Score(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return '—/15';
  return `${score.toFixed(1)}/15`;
}

function formatEq(eq: number | null): string {
  if (eq == null || !Number.isFinite(eq)) return '—';
  return String(Math.round(eq));
}

function resolveV41EqThreshold(symbol: string): number {
  const snapshot = useV41Store.getState().getSymbolState(symbol).lastSnapshot;
  if (!snapshot) return 70;
  return computeEntryQuality({ snapshot, protection: NEUTRAL_PROTECTION }).eqThreshold;
}

function resolveSkipDirection(signal: UnifiedSignalResult): 'LONG' | 'SHORT' {
  if (signal.direction === 'LONG' || signal.direction === 'SHORT') return signal.direction;
  if (signal.v4Direction === 'LONG' || signal.v4Direction === 'SHORT') return signal.v4Direction;
  if (signal.v41Direction === 'LONG' || signal.v41Direction === 'SHORT') return signal.v41Direction;
  return 'LONG';
}

function resolveTradeDirection(signal: UnifiedSignalResult): 'LONG' | 'SHORT' | null {
  if (signal.direction === 'LONG' || signal.direction === 'SHORT') return signal.direction;
  return null;
}

interface PlanLevelRowProps {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}

function PlanLevelRow({ label, value, sub, valueColor }: PlanLevelRowProps) {
  return (
    <View style={styles.planLevelRow}>
      <Text style={styles.planLevelLabel}>{label}</Text>
      <View style={styles.planLevelRight}>
        <Text style={[styles.planLevelValue, valueColor ? { color: valueColor } : null]}>
          {value}
        </Text>
        {sub ? <Text style={styles.planLevelSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

interface UnifiedTradePlanModalProps {
  visible: boolean;
  signal: UnifiedSignalResult;
  onClose: () => void;
  onConfirm: () => void;
  onSkip: () => void;
}

function UnifiedTradePlanModal({
  visible,
  signal,
  onClose,
  onConfirm,
  onSkip,
}: UnifiedTradePlanModalProps) {
  const direction = resolveTradeDirection(signal);
  const isStrongV41 = signal.strength === 'STRONG_V41';
  const headerColor = isStrongV41
    ? '#22C55E'
    : direction === 'SHORT'
      ? '#EF4444'
      : '#22C55E';
  const symbolLabel = symbolLabelVi(signal.symbol as AppTradeSymbol);
  const fmt = (price: number | null) => formatPrice(signal.symbol, price);
  const v41Conf = Math.round(resolveV41Confidence(signal.symbol));
  const v41Eq = Math.round(signal.v41EQ ?? 0);

  const handleBackdropPress =
    Platform.OS === 'web'
      ? (e: { target?: unknown; currentTarget?: unknown }) => {
          if (e.target === e.currentTarget) onClose();
        }
      : onClose;

  if (!direction || signal.entryPrice == null) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress}>
        <View style={styles.modalSheet}>
          <View style={[styles.modalHeader, { backgroundColor: headerColor }]}>
            <Text style={styles.modalHeaderText}>
              {isStrongV41
                ? `✅ KẾ HOẠCH ${direction}`
                : `✅ XÁC NHẬN ${direction} — ${symbolLabel}`}
            </Text>
            {!isStrongV41 ? (
              <View
                style={[
                  styles.modalStrengthBadge,
                  {
                    backgroundColor: hexWithAlpha(
                      STRENGTH_BADGE_STYLE[signal.strength]?.textColor ?? signal.strengthColor,
                      0.2,
                    ),
                    borderColor:
                      STRENGTH_BADGE_STYLE[signal.strength]?.border ?? signal.strengthColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalStrengthText,
                    {
                      color:
                        STRENGTH_BADGE_STYLE[signal.strength]?.textColor ?? signal.strengthColor,
                    },
                  ]}
                >
                  {resolveStrengthBadgeText(signal)}
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalBody}
            showsVerticalScrollIndicator={Platform.OS === 'web'}
          >
            {isStrongV41 ? (
              <>
                <Text style={styles.modalSource}>
                  Nguồn: V4.1 — {signal.v41MarketState ?? '—'}
                </Text>
                <Text style={styles.modalSource}>
                  Conf: {v41Conf}/100 · EQ: {v41Eq}/100
                </Text>
                <Text style={styles.modalV41Warn}>
                  ⚠️ V4 chưa xác nhận — trade theo V4.1 thuần
                </Text>
              </>
            ) : (
              <Text style={styles.modalSource}>Nguồn: {resolveStrengthBadgeText(signal)}</Text>
            )}

            <PlanLevelRow label="ENTRY" value={fmt(signal.entryPrice)} />
            <PlanLevelRow
              label="SL"
              value={fmt(signal.slPrice)}
              sub={
                signal.slDistancePct != null
                  ? `(-${signal.slDistancePct.toFixed(1)}%)`
                  : undefined
              }
              valueColor="#EF4444"
            />
            <PlanLevelRow
              label="TP1"
              value={fmt(signal.tp1Price)}
              sub={
                signal.tp1RR != null
                  ? `R:R ${signal.tp1RR.toFixed(1)}× — Chốt 50%`
                  : undefined
              }
              valueColor="#22C55E"
            />
            <PlanLevelRow
              label="TP2"
              value={fmt(signal.tp2Price)}
              sub={
                signal.tp2RR != null
                  ? `R:R ${signal.tp2RR.toFixed(1)}× — Chốt 30%`
                  : undefined
              }
              valueColor="#22C55E"
            />
            <PlanLevelRow
              label="TP3"
              value={fmt(signal.tp3Price)}
              sub={
                signal.tp3RR != null
                  ? `R:R ${signal.tp3RR.toFixed(1)}× — Chốt 20%`
                  : undefined
              }
              valueColor="#22C55E"
            />

            <View style={styles.modalSizeBox}>
              <Text style={styles.modalSizeText}>
                Size: {MARGIN_USDT} USDT · {LEVERAGE}× · Max -{MAX_LOSS_USDT} USDT
              </Text>
            </View>

            <Text style={styles.modalMeta}>
              V4: {formatV4Score(signal.v4Score)} · V4.1: EQ {formatEq(signal.v41EQ)}/100
            </Text>
            <Text style={styles.modalMeta}>
              MarketState: {signal.v41MarketState ?? '—'}
            </Text>
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.modalPrimaryBtn,
                { backgroundColor: headerColor },
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={styles.modalPrimaryBtnText}>XÁC NHẬN VÀO LỆNH</Text>
            </Pressable>
            <Pressable
              onPress={onSkip}
              style={({ pressed }) => [
                styles.modalSecondaryBtn,
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={styles.modalSecondaryBtnText}>Bỏ qua — Ghi nhận setup</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalGhostBtn,
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={styles.modalGhostBtnText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

interface UnifiedSignalCardProps {
  signal: DisplayUnifiedSignal;
  quote: SymbolQuote;
  v41Row?: SignalRowV41;
  onToast: (message: string) => void;
}

function UnifiedSignalCard({ signal, quote, v41Row, onToast }: UnifiedSignalCardProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const border = STRENGTH_BORDER[signal.strength] ?? STRENGTH_BORDER.NONE;
  const base = symbolLabelVi(signal.symbol as AppTradeSymbol);
  const iconColor = SYMBOL_COLORS[signal.symbol] ?? COLORS.accent;
  const changeColor =
    quote.changePct != null && quote.changePct < 0 ? COLORS.bearish : COLORS.bullish;
  const tradeDirection = resolveTradeDirection(signal);

  const recordSkip = useCallback(() => {
    const price = quote.price ?? signal.entryPrice;
    if (price == null || !Number.isFinite(price)) {
      console.warn('[Unified] no price for skip', signal.symbol);
      return;
    }

    const direction = resolveSkipDirection(signal);
    const skipReason: SkipReason = 'USER_SKIP';
    const skipReasonDetail = `${signal.strengthLabel} · ${signal.v41MarketState ?? '—'} · manual skip`;
    const totalScore = signal.v4Score ?? signal.v41EQ ?? 0;

    void useTradeStore.getState().addSkippedSetup(
      signal.symbol,
      direction,
      totalScore,
      skipReason,
      skipReasonDetail,
      price,
    );

    setModalVisible(false);
    const symbolLabel = signal.symbol.replace('USDT', '');
    onToast(`📋 Đã ghi nhận setup ${symbolLabel}`);
  }, [onToast, quote.price, signal]);

  const handleConfirm = useCallback(() => {
    const direction = resolveTradeDirection(signal);
    const entryPrice = signal.entryPrice;
    const currentPrice = quote.price ?? entryPrice;

    if (
      !direction ||
      entryPrice == null ||
      signal.slPrice == null ||
      signal.tp1Price == null ||
      currentPrice == null ||
      !Number.isFinite(currentPrice)
    ) {
      console.warn('[Unified] incomplete plan for confirm', signal.symbol);
      return;
    }

    const openReason = `${signal.strengthLabel} · ${signal.v41MarketState ?? '—'}`;
    const scorerVersion =
      signal.strength === 'STRONG'
        ? ('unified' as 'v4')
        : signal.strength === 'STRONG_V41'
          ? ('v41' as 'v4')
          : ('v4' as const);

    const market = buildMarketSnapshot({
      entryPrice,
      priceAtAnalysis: currentPrice,
    });

    const scoring = buildScoringSnapshot({
      totalScore: signal.v4Score ?? signal.v41EQ ?? 0,
      direction,
      layers: [],
      mandatoryViolations: [],
      decision: openReason,
      scorerVersion,
      score: signal.v4Score ?? undefined,
      marketState: signal.v41MarketState ?? undefined,
      recommendationLabel: signal.strengthLabel,
    });

    const planBase = buildPlanSnapshot({
      tradePlan: null,
      entryPrice,
      stopLoss: signal.slPrice,
      takeProfit1: signal.tp1Price,
      sizeActual: MARGIN_USDT,
      sizeProposed: MARGIN_USDT,
    });

    const plan = {
      ...planBase,
      tp2: signal.tp2Price ?? 0,
      tp3: signal.tp3Price ?? 0,
      rrProposed: signal.tp1RR ?? 0,
      openReason,
    };

    void useTradeStore.getState().addTradeEntry(
      signal.symbol,
      market,
      scoring,
      plan,
      [
        'unified',
        `strength:${signal.strength}`,
        `v41EQ:${Math.round(signal.v41EQ ?? 0)}`,
        `marketState:${signal.v41MarketState ?? 'unknown'}`,
      ],
    );

    setModalVisible(false);
    const symbolLabel = signal.symbol.replace('USDT', '');
    onToast(`✅ Đã vào lệnh ${direction} ${symbolLabel}`);
  }, [onToast, quote.price, signal]);

  const openModal = useCallback(() => {
    if (!signal.canEnter || !tradeDirection) return;
    setModalVisible(true);
  }, [signal.canEnter, tradeDirection]);

  const v4BadgeText = signal.v4CanEnter
    ? `V4 ✅ ${formatV4Score(signal.v4Score)}`
    : `V4 ❌ ${formatV4Score(signal.v4Score)}`;

  const v41EqThreshold = resolveV41EqThreshold(signal.symbol);
  const v41EqRounded = signal.v41EQ != null ? Math.round(signal.v41EQ) : null;
  const v41BelowThreshold =
    v41EqRounded != null && v41EqRounded < v41EqThreshold;

  const v41BadgeText =
    v41EqRounded == null
      ? 'V4.1 —'
      : v41BelowThreshold
        ? `V4.1 ⚠️ EQ ${v41EqRounded}/${v41EqThreshold}`
        : signal.v41CanEnter
          ? `V4.1 ✅ EQ ${v41EqRounded}/${v41EqThreshold}`
          : `V4.1 ❌ EQ ${v41EqRounded}/${v41EqThreshold}`;

  const v41BadgeBoxStyle = v41BelowThreshold
    ? styles.sourceBadgeWarn
    : signal.v41CanEnter
      ? styles.sourceBadgeOk
      : styles.sourceBadgeMuted;

  const v41BadgeTextStyle = v41BelowThreshold
    ? styles.sourceBadgeTextWarn
    : signal.v41CanEnter
      ? styles.sourceBadgeTextOk
      : styles.sourceBadgeTextMuted;

  const momentumBadge = resolveMomentumBadgeDisplay(
    v41Row?.momentum,
    tradeDirection ?? signal.v41Direction,
  );

  const actionConfig = (() => {
    const enterColor = resolveDirectionActionColor(tradeDirection);

    switch (signal.strength) {
      case 'STRONG':
        return {
          label: `VÀO LỆNH ${tradeDirection ?? ''}`.trim(),
          bg: enterColor,
          text: '#FFFFFF',
          border: enterColor,
          disabled: !signal.canEnter,
          onPress: openModal,
        };
      case 'STRONG_V41':
        return {
          label: `VÀO LỆNH ${tradeDirection ?? ''} — V4.1`.trim(),
          bg: enterColor,
          text: '#FFFFFF',
          border: enterColor,
          disabled: !signal.canEnter,
          onPress: openModal,
        };
      case 'RESCUE':
        return {
          label: `VÀO LỆNH ${tradeDirection ?? ''} — Rescue`.trim(),
          bg: '#A855F7',
          text: '#FFFFFF',
          border: '#A855F7',
          disabled: !signal.canEnter,
          onPress: openModal,
        };
      case 'MEDIUM':
        return {
          label: 'XEM XÉT VÀO LỆNH',
          bg: '#F59E0B',
          text: '#000000',
          border: '#F59E0B',
          disabled: !signal.canEnter,
          onPress: openModal,
        };
      case 'WATCH':
        return {
          label: 'THEO DÕI THÊM',
          bg: COLORS.surface,
          text: '#3B82F6',
          border: '#3B82F6',
          disabled: true,
          onPress: undefined,
        };
      default:
        return {
          label: 'Bỏ qua — Ghi nhận',
          bg: COLORS.surface,
          text: COLORS.textMuted,
          border: COLORS.border,
          disabled: false,
          onPress: recordSkip,
        };
    }
  })();

  const strengthBadge = STRENGTH_BADGE_STYLE[signal.strength] ?? STRENGTH_BADGE_STYLE.NONE;
  const strengthBadgeText = resolveStrengthBadgeText(signal);
  const blockReasonColor =
    signal.strength === 'WATCH'
      ? '#3B82F6'
      : signal.strength === 'NONE'
        ? COLORS.textMuted
        : COLORS.textMuted;

  return (
    <View
      style={[
        styles.card,
        {
          borderLeftWidth: border.width,
          borderLeftColor: border.color,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.pairRow}>
          <View style={[styles.icon, { backgroundColor: iconColor }]}>
            <Text style={styles.iconText}>{base.charAt(0)}</Text>
          </View>
          <Text style={styles.pairText}>
            <Text style={styles.pairBase}>{base}</Text>
            <Text style={styles.pairQuote}>/USDT</Text>
          </Text>
        </View>
        <View style={styles.topRight}>
          <Text style={styles.price}>{formatPrice(signal.symbol, quote.price)}</Text>
          <Text style={[styles.change, { color: changeColor }]}>
            {formatChangePct(quote.changePct)}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.strengthBadge,
          {
            backgroundColor: hexWithAlpha(strengthBadge.border, 0.15),
            borderColor: strengthBadge.border,
          },
        ]}
      >
        <Text style={[styles.strengthBadgeText, { color: strengthBadge.textColor }]}>
          {strengthBadgeText}
        </Text>
      </View>

      {signal.earlyWarningBadge ? (
        <View
          style={[
            styles.ewWarnBadge,
            {
              backgroundColor: hexWithAlpha('#F59E0B', 0.15),
              borderColor: '#F59E0B',
            },
          ]}
        >
          <Text style={[styles.ewWarnBadgeText, { color: '#F59E0B' }]}>
            {signal.earlyWarningBadge}
          </Text>
        </View>
      ) : null}

      {signal.strength === 'RESCUE' ? (
        <View
          style={[
            styles.rescueBadge,
            {
              backgroundColor: hexWithAlpha('#A855F7', 0.15),
              borderColor: '#A855F7',
            },
          ]}
        >
          <Text style={[styles.rescueBadgeText, { color: '#A855F7' }]}>
            {resolveRescueBadgeText(v41Row)}
          </Text>
        </View>
      ) : null}

      {v41Row?.reversalState?.phase === 'WATCHING' &&
      v41Row.reversalState.counterDirection ? (
        <View
          style={[
            styles.reversalWatchBanner,
            { backgroundColor: hexWithAlpha('#3B82F6', 0.1) },
          ]}
        >
          <Text style={styles.reversalWatchText}>
            🔄 V4.1 theo dõi retest {v41Row.reversalState.counterDirection}...
          </Text>
        </View>
      ) : null}

      {v41Row?.reversalState?.phase === 'RETEST_CONFIRMED' ? (
        <Text style={styles.reversalConfirmedText}>
          ⚡ V4.1 Retest xác nhận! Kiểm tra tab V4.1
        </Text>
      ) : null}

      {signal.canEnter ? (
        <View style={styles.planGrid}>
          <PlanLevelRow label="Entry" value={formatPrice(signal.symbol, signal.entryPrice)} />
          <PlanLevelRow
            label="SL"
            value={formatPrice(signal.symbol, signal.slPrice)}
            valueColor="#EF4444"
          />
          <PlanLevelRow
            label="TP1"
            value={formatPrice(signal.symbol, signal.tp1Price)}
            sub={signal.tp1RR != null ? `R:R ${signal.tp1RR.toFixed(1)}×` : undefined}
            valueColor="#22C55E"
          />
          <PlanLevelRow
            label="TP2"
            value={formatPrice(signal.symbol, signal.tp2Price)}
            sub={signal.tp2RR != null ? `R:R ${signal.tp2RR.toFixed(1)}×` : undefined}
            valueColor="#22C55E"
          />
          <PlanLevelRow
            label="TP3"
            value={formatPrice(signal.symbol, signal.tp3Price)}
            sub={signal.tp3RR != null ? `R:R ${signal.tp3RR.toFixed(1)}×` : undefined}
            valueColor="#22C55E"
          />
        </View>
      ) : null}

      <View style={styles.sourceRow}>
        <View
          style={[
            styles.sourceBadge,
            signal.v4CanEnter ? styles.sourceBadgeOk : styles.sourceBadgeMuted,
          ]}
        >
          <Text
            style={[
              styles.sourceBadgeText,
              signal.v4CanEnter ? styles.sourceBadgeTextOk : styles.sourceBadgeTextMuted,
            ]}
          >
            {v4BadgeText}
          </Text>
        </View>
        <View style={[styles.sourceBadge, v41BadgeBoxStyle]}>
          <Text style={[styles.sourceBadgeText, v41BadgeTextStyle]}>
            {v41BadgeText}
          </Text>
          <Text style={[styles.momentumBadgeText, { color: momentumBadge.color }]}>
            {momentumBadge.text}
          </Text>
        </View>
      </View>

      {!signal.canEnter && signal.blockReasons.length > 0 ? (
        <View style={styles.blockBox}>
          {signal.blockReasons.slice(0, 2).map((reason) => (
            <Text key={reason} style={[styles.blockLine, { color: blockReasonColor }]}>
              • {reason}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={actionConfig.onPress}
        disabled={actionConfig.disabled}
        style={({ pressed }) => [
          styles.actionBtn,
          {
            backgroundColor: actionConfig.bg,
            borderColor: actionConfig.border,
          },
          actionConfig.disabled && styles.actionBtnDisabled,
          pressed && !actionConfig.disabled && styles.btnPressed,
          webPointer,
        ]}
      >
        <Text style={[styles.actionBtnText, { color: actionConfig.text }]}>
          {actionConfig.label}
        </Text>
      </Pressable>

      {signal.canEnter && tradeDirection ? (
        <UnifiedTradePlanModal
          visible={modalVisible}
          signal={signal}
          onClose={() => setModalVisible(false)}
          onConfirm={handleConfirm}
          onSkip={recordSkip}
        />
      ) : null}
    </View>
  );
}

interface SignalBoardUnifiedProps {
  symbols?: string[];
  v41Rows?: SignalRowV41[];
  onRequestScan?: () => void;
}

export function SignalBoardUnified({
  symbols = MODULE_DEFAULT_SYMBOLS,
  v41Rows,
  onRequestScan,
}: SignalBoardUnifiedProps) {
  const signals = useUnifiedStore((s) => s.signals);
  const isScanning = useUnifiedStore((s) => s.isScanning);
  const lastScanAt = useUnifiedStore((s) => s.lastScanAt);
  const v41SymbolStates = useV41Store((s) => s.symbolStates);
  const [quotes, setQuotes] = useState<Record<string, SymbolQuote>>({});
  const [journalToast, setJournalToast] = useState<string | null>(null);
  const [awaitingSources, setAwaitingSources] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let retryId: ReturnType<typeof setTimeout> | undefined;

    const checkSourcesAndScan = async () => {
      const ready = await hasUnifiedSourceData(symbols);
      if (cancelled) return;

      if (!ready) {
        setAwaitingSources(true);
        onRequestScan?.();
        retryId = setTimeout(() => {
          void checkSourcesAndScan();
        }, 3000);
        return;
      }

      setAwaitingSources(false);
      onRequestScan?.();
    };

    void checkSourcesAndScan();

    return () => {
      cancelled = true;
      if (retryId) clearTimeout(retryId);
    };
  }, [symbols, onRequestScan]);

  useEffect(() => {
    if (signals.length > 0) {
      setAwaitingSources(false);
    }
  }, [signals.length]);

  const showToast = useCallback((message: string) => {
    setJournalToast(message);
    setTimeout(() => setJournalToast(null), 4000);
  }, []);

  const loadQuotes = useCallback(async (symbolList: string[]) => {
    const entries = await Promise.allSettled(
      symbolList.map(async (symbol) => {
        const [priceResult, changePct] = await Promise.all([
          fetchTickerPrice(symbol as AppTradeSymbol),
          fetch24hTickerChange(symbol as AppTradeSymbol),
        ]);
        return {
          symbol,
          quote: {
            price: priceResult.price,
            changePct,
          } satisfies SymbolQuote,
        };
      }),
    );

    const next: Record<string, SymbolQuote> = {};
    for (const entry of entries) {
      if (entry.status === 'fulfilled') {
        next[entry.value.symbol] = entry.value.quote;
      }
    }
    setQuotes((prev) => ({ ...prev, ...next }));
  }, []);

  useEffect(() => {
    if (signals.length > 0) {
      void loadQuotes(symbols);
    }
  }, [signals, symbols, loadQuotes]);

  const showSourceLoading = awaitingSources && signals.length === 0;

  const v41RowBySymbol = useMemo(() => {
    const scanMap = new Map((v41Rows ?? []).map((row) => [row.symbol, row]));
    const map = new Map<string, SignalRowV41>();
    for (const symbol of symbols) {
      const merged = mergeV41Rows(
        symbol,
        buildV41RowFromStore(symbol, v41SymbolStates[symbol]),
        scanMap.get(symbol),
      );
      if (merged) {
        map.set(symbol, merged);
      }
    }
    return map;
  }, [v41Rows, v41SymbolStates, symbols]);

  const displaySignals = useMemo((): DisplayUnifiedSignal[] => {
    const base: UnifiedSignalResult[] =
      signals.length > 0
        ? signals
        : showSourceLoading
          ? []
          : symbols.map((symbol) => ({
            symbol,
            direction: 'NONE' as const,
            strength: 'NONE' as const,
            canEnter: false,
            entryPrice: null,
            slPrice: null,
            tp1Price: null,
            tp2Price: null,
            tp3Price: null,
            slDistancePct: null,
            tp1RR: null,
            tp2RR: null,
            tp3RR: null,
            v4Score: null,
            v4CanEnter: false,
            v4Direction: 'NONE' as const,
            v41EQ: null,
            v41CanEnter: false,
            v41Direction: 'NONE' as const,
            v41MarketState: null,
            strengthLabel: '⚪ Chưa có setup',
            strengthColor: '#6B7280',
            blockReasons: [],
            priority: 0,
          }));

    return base.map((signal) =>
      applyEarlyWarningToUnifiedSignal(
        signal,
        resolveEarlyWarningOverlay(signal.symbol, v41RowBySymbol.get(signal.symbol)),
      ),
    );
  }, [signals, showSourceLoading, symbols, v41RowBySymbol]);

  const scannedTimeLabel =
    lastScanAt > 0
      ? new Date(lastScanAt).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <View style={styles.panel}>
      <View style={styles.accentStrip} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Tín hiệu tổng hợp</Text>
            <Text style={styles.subtitle}>
              V4 + V4.1 · {scannedTimeLabel} · Quét {SCAN_INTERVAL_SECONDS}s
            </Text>
          </View>
          <View style={styles.scanBtnWrap}>
            <Pressable
              onPress={() => onRequestScan?.()}
              disabled={isScanning}
              style={({ pressed }) => [
                styles.scanBtn,
                isScanning && styles.scanBtnDisabled,
                pressed && !isScanning && styles.scanBtnPressed,
                webPointer,
              ]}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Text style={styles.scanBtnText}>Quét lại</Text>
              )}
            </Pressable>
            {isScanning ? (
              <Text style={styles.scanningHint}>Đang quét...</Text>
            ) : null}
          </View>
        </View>

        {showSourceLoading ? (
          <View style={styles.sourceLoadingBox}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.sourceLoadingText}>
              Đang tải dữ liệu V4 + V4.1...
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {displaySignals.map((signal) => (
              <UnifiedSignalCard
                key={signal.symbol}
                signal={signal}
                quote={quotes[signal.symbol] ?? { price: null, changePct: null }}
                v41Row={v41RowBySymbol.get(signal.symbol)}
                onToast={showToast}
              />
            ))}
          </View>
        )}
      </View>

      {journalToast ? (
        <View style={styles.journalToast}>
          <Text style={styles.journalToastText}>{journalToast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...PANEL,
    padding: 0,
    overflow: 'hidden',
  },
  accentStrip: {
    height: 3,
    backgroundColor: '#22C55E',
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  scanBtnWrap: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  scanBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    minWidth: 88,
    alignItems: 'center',
  },
  scanBtnDisabled: {
    opacity: 0.65,
  },
  scanBtnPressed: {
    opacity: 0.85,
  },
  scanBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.background,
  },
  scanningHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  sourceLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  sourceLoadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  card: {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 260,
    maxWidth: 380,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  pairText: {
    fontSize: 15,
    fontWeight: '800',
  },
  pairBase: {
    color: COLORS.textPrimary,
  },
  pairQuote: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  topRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  change: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  strengthBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
  },
  strengthBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  ewWarnBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    marginBottom: SPACING.xs,
  },
  ewWarnBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rescueBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    marginBottom: SPACING.xs,
  },
  rescueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  momentumBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  reversalWatchBanner: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    marginBottom: SPACING.xs,
  },
  reversalWatchText: {
    fontSize: 10,
    color: '#3B82F6',
    fontWeight: '600',
    lineHeight: 14,
  },
  reversalConfirmedText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '800',
    marginBottom: SPACING.xs,
    lineHeight: 15,
  },
  planGrid: {
    gap: 4,
  },
  planLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  planLevelLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  planLevelRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  planLevelValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  planLevelSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceBadge: {
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sourceBadgeOk: {
    backgroundColor: hexWithAlpha('#22C55E', 0.12),
  },
  sourceBadgeWarn: {
    backgroundColor: hexWithAlpha('#F59E0B', 0.12),
  },
  sourceBadgeMuted: {
    backgroundColor: COLORS.surface,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sourceBadgeTextOk: {
    color: '#22C55E',
  },
  sourceBadgeTextWarn: {
    color: '#F59E0B',
  },
  sourceBadgeTextMuted: {
    color: COLORS.textMuted,
  },
  blockBox: {
    gap: 2,
  },
  blockLine: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15,
  },
  actionBtn: {
    marginTop: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  btnPressed: {
    opacity: 0.85,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  modalHeader: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  modalHeaderText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalStrengthBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalStrengthText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modalScroll: {
    maxHeight: 360,
  },
  modalBody: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  modalSource: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  modalV41Warn: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
    marginBottom: SPACING.sm,
    lineHeight: 16,
  },
  modalSizeBox: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  modalSizeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modalMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  modalActions: {
    padding: SPACING.md,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalPrimaryBtn: {
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalSecondaryBtn: {
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalGhostBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  modalGhostBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  journalToast: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: '#111827',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  journalToastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

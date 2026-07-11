import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, type AppTradeSymbol, type SkipReason } from '../../constants/scoring';
import { SCAN_INTERVAL_MS, SCAN_INTERVAL_SECONDS } from '../../constants/scanSchedule';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { symbolLabelVi } from '../../constants/vi';
import { fetch24hTickerChange, fetchTickerPrice } from '../../services/binanceApi';
import {
  buildMarketSnapshot,
  buildPlanSnapshot,
  buildScoringSnapshot,
} from '../../services/journalService';
import type { ConfidenceTier } from '../../services/v41/entryQualityEngine';
import type { ExhaustionResult } from '../../services/v41/exhaustionEngine';
import type { MomentumResult } from '../../services/v41/momentumEngine1H';
import { NEUTRAL_PROTECTION } from '../../services/v41/protectionLayer';
import {
  generateTradeSetupV41,
  type TradeSetupV41,
} from '../../services/v41/tradeSetupGenerator';
import {
  generateReversalSetup,
  type ReversalTradeSetup,
} from '../../services/v41/reversalTradeSetup';
import type { KlineV41 } from '../../services/v41/indicators';
import { useReversalStore } from '../../store/useReversalStore';
import { useTradeStore } from '../../store/useTradeStore';
import { useV41Store } from '../../store/useV41Store';
import {
  DEFAULT_SCAN_SYMBOLS_V41,
  type SignalRowV41,
} from '../../services/v41/scanV41';
import type { MarketState, OpenDirection } from '../../services/v41/types';
import { formatPrice } from '../../utils/formatPrice';
import { ReversalModal } from './ReversalModal';
import { TradePlanModalV41 } from './TradePlanModalV41';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

function resolveFinitePrice(...candidates: Array<number | null | undefined>): number | null {
  for (const value of candidates) {
    if (value != null && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/** Stable default — tránh tạo mảng mới mỗi render (gây quét Binance liên tục). */
const MODULE_DEFAULT_SYMBOLS_V41: string[] = [...DEFAULT_SCAN_SYMBOLS_V41];

const SYMBOL_COLORS: Record<string, string> = {
  BTCUSDT: '#F7931A',
  NEARUSDT: '#00C08B',
  SOLUSDT: '#9945FF',
  BNBUSDT: '#F0B90B',
};

const CONFIDENCE_TIER_META: Record<ConfidenceTier, { label: string; color: string }> = {
  HIGH: { label: 'Tin cậy cao', color: '#22C55E' },
  MID: { label: 'Tin cậy TB', color: '#F59E0B' },
  LOW: { label: 'Tin cậy thấp', color: '#EF4444' },
};

type MarketStateBadge = {
  label: string;
  backgroundColor: string;
  textColor: string;
};

const MARKET_STATE_BADGES: Record<MarketState, MarketStateBadge> = {
  StrongUptrend: {
    label: '🚀 STRONG UPTREND',
    backgroundColor: '#22C55E',
    textColor: '#02110A',
  },
  HealthyUptrend: {
    label: '📈 HEALTHY UPTREND',
    backgroundColor: '#86EFAC',
    textColor: '#14532D',
  },
  LateUptrend: {
    label: '⚠️ LATE UPTREND — sắp kiệt',
    backgroundColor: '#F59E0B',
    textColor: '#422006',
  },
  Distribution: {
    label: '🔴 DISTRIBUTION — cẩn thận',
    backgroundColor: '#EF4444',
    textColor: '#FFFFFF',
  },
  Accumulation: {
    label: '🔵 ACCUMULATION — tích lũy',
    backgroundColor: '#3B82F6',
    textColor: '#FFFFFF',
  },
  WeakDowntrend: {
    label: '📉 WEAK DOWNTREND',
    backgroundColor: '#F97316',
    textColor: '#FFFFFF',
  },
  StrongDowntrend: {
    label: '💥 STRONG DOWNTREND',
    backgroundColor: '#DC2626',
    textColor: '#FFFFFF',
  },
  Transition: {
    label: '⚪ TRANSITION — chờ rõ xu hướng',
    backgroundColor: '#6B7280',
    textColor: '#FFFFFF',
  },
};

type SymbolQuote = {
  price: number | null;
  changePct: number | null;
};

function confidenceColor(score: number): string {
  if (score >= 70) return '#22C55E';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

function entryQualityColor(score: number): string {
  if (score >= 85) return '#22C55E';
  if (score >= 70) return '#86EFAC';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

function btcAlignmentIcon(factor: number): string {
  if (factor >= 0.9) return '✅';
  if (factor >= 0.75) return '⚠️';
  return '❌';
}

function formatChangePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

const MARKET_STATE_SHORT: Record<MarketState, string> = {
  StrongUptrend: 'Strong Up',
  HealthyUptrend: 'Healthy Up',
  LateUptrend: 'Late Up',
  Distribution: 'Distribution',
  Accumulation: 'Accumulation',
  WeakDowntrend: 'Weak Down',
  StrongDowntrend: 'Strong Down',
  Transition: 'Transition',
};

function resolveMomentumLongDisplay(momentum?: MomentumResult): {
  text: string;
  color: string;
} {
  if (momentum?.momentumConfirmedLong) {
    return { text: '⚡ Momentum LONG: ✅ Mạnh', color: '#22C55E' };
  }
  if (momentum?.momentumLong === 1) {
    return { text: '⚡ Momentum LONG: ⚠️ Yếu', color: '#F59E0B' };
  }
  return { text: '⚡ Momentum LONG: — Chưa xác nhận', color: COLORS.textMuted };
}

function resolveExhaustionDisplay(exhaustion?: ExhaustionResult): {
  text: string;
  color: string;
} | null {
  if (!exhaustion?.exhaustionDetected) return null;

  switch (exhaustion.exhaustionType) {
    case 'CAPITULATION':
      return {
        text: '💥 Capitulation — Lực bán kiệt sức → LONG',
        color: '#A855F7',
      };
    case 'VOLUME_FADE':
      return {
        text: '📉 Volume fade — Xu hướng mất động lực',
        color: '#F59E0B',
      };
    case 'FUNDING_EXTREME':
      if (exhaustion.direction === 'LONG') {
        return { text: '⚡ Short Squeeze sắp xảy ra', color: '#22C55E' };
      }
      if (exhaustion.direction === 'SHORT') {
        return { text: '⚡ Long Squeeze sắp xảy ra', color: '#EF4444' };
      }
      return null;
    default:
      return null;
  }
}

interface SignalCardV41Props {
  row: SignalRowV41;
  quote: SymbolQuote;
}

type SignalRowV41WithKlines = SignalRowV41 & { klines1H?: KlineV41[] };

function SignalCardV41({ row, quote }: SignalCardV41Props) {
  const {
    snapshot,
    visibilityMode,
    symbol,
    error,
    opportunity,
    protection,
    earlyWarning,
    reversalState,
    momentum,
    exhaustion,
  } = row;
  const [modalVisible, setModalVisible] = useState(false);
  const [modalDir, setModalDir] = useState<'LONG' | 'SHORT'>('LONG');
  const [tradeSetup, setTradeSetup] = useState<TradeSetupV41 | null>(null);
  const [reversalModalVisible, setReversalModalVisible] = useState(false);
  const [reversalSetup, setReversalSetup] = useState<ReversalTradeSetup | null>(null);
  const [journalToast, setJournalToast] = useState<string | null>(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const shownRetestAtRef = useRef<number | null>(null);

  const currentPrice = resolveFinitePrice(quote.price, row.markPrice);

  const showJournalToast = useCallback((message: string) => {
    setJournalToast(message);
    setTimeout(() => setJournalToast(null), 4000);
  }, []);

  useEffect(() => {
    if (reversalState?.phase !== 'RETEST_CONFIRMED') {
      shownRetestAtRef.current = null;
      return;
    }
    if (reversalModalVisible) return;
    if (currentPrice == null) return;
    if (shownRetestAtRef.current === reversalState.detectedAt) return;

    const rowWithKlines = row as SignalRowV41WithKlines;
    const setup = generateReversalSetup({
      symbol: row.symbol,
      reversalState,
      klines1H: rowWithKlines.klines1H ?? [],
      markPrice: currentPrice,
      marginUsdt: 6,
      leverage: 5,
      snapshot: row.snapshot,
      opportunity: row.opportunity,
      momentum: row.momentum,
    });

    if (setup != null) {
      shownRetestAtRef.current = reversalState.detectedAt;
      setReversalSetup(setup);
      setReversalModalVisible(true);
    }
  }, [reversalState, row, currentPrice, reversalModalVisible]);

  const handleReversalConfirm = useCallback(() => {
    if (!reversalSetup) return;

    const openReason = `V4.1 Reversal — ${reversalSetup.direction} counter-trend`;
    const entryPrice = reversalSetup.entryPrice;

    const market = buildMarketSnapshot({
      entryPrice,
      priceAtAnalysis: currentPrice ?? entryPrice,
    });

    const scoring = buildScoringSnapshot({
      totalScore: 0,
      direction: reversalSetup.direction,
      layers: [],
      mandatoryViolations: [],
      decision: openReason,
      scorerVersion: 'v41',
      score: 0,
      marketState: snapshot.marketState,
      recommendationLabel: openReason,
    });

    const planBase = buildPlanSnapshot({
      tradePlan: null,
      entryPrice,
      stopLoss: reversalSetup.slPrice,
      takeProfit1: reversalSetup.tp1Price,
      sizeActual: reversalSetup.marginUsdt,
      sizeProposed: reversalSetup.marginUsdt,
    });

    const plan = {
      ...planBase,
      tp2: reversalSetup.tp2Price,
      tp3: reversalSetup.tp3Price,
      rrProposed: reversalSetup.tp1RR,
      openReason,
    };

    void useTradeStore.getState().addTradeEntry(
      reversalSetup.symbol,
      market,
      { ...scoring, scorerVersion: 'v41' as typeof scoring.scorerVersion },
      plan,
      ['v41', 'reversal', `counterTrend:${reversalSetup.direction}`],
    );

    setReversalModalVisible(false);
    useReversalStore.getState().reset(reversalSetup.symbol);
    const symbolLabel = symbol.replace('USDT', '');
    showJournalToast(`✅ Đã vào lệnh reversal ${reversalSetup.direction} ${symbolLabel}`);
  }, [currentPrice, reversalSetup, showJournalToast, snapshot.marketState, symbol]);

  const handleReversalSkip = useCallback(() => {
    setReversalModalVisible(false);
    useReversalStore.getState().reset(reversalSetup?.symbol ?? symbol);
  }, [reversalSetup?.symbol, symbol]);

  const handleConfirm = useCallback(() => {
    if (!tradeSetup || !opportunity) return;

    const entryPrice = tradeSetup.markPrice;
    const qualityLabel = opportunity.qualityLabel;
    const v41Snapshot = {
      trendStrength: snapshot.trendStrength,
      trendDirection: snapshot.trendDirection,
      trendExhaustion: snapshot.trendExhaustion,
      reversalProbability: snapshot.reversalProbability,
      marketConfidence: snapshot.marketConfidence,
      marketState: snapshot.marketState,
      btcDirection: snapshot.btcDirection,
      btcAlignmentFactor: snapshot.btcAlignmentFactor,
      entryQuality: opportunity.entryQuality,
      entryQualityLong: opportunity.entryQualityLong,
      entryQualityShort: opportunity.entryQualityShort,
      qualityLabel: opportunity.qualityLabel,
      opportunityDirection: opportunity.opportunityDirection,
      protectionRisk: protection?.volatilityRisk ?? 'NORMAL',
      stopHuntDetected: protection?.stopHuntDetected ?? false,
      smartSlPct: tradeSetup.smartSlDistancePct,
      riskRewardRatio: tradeSetup.riskRewardRatio,
      scannedAt: snapshot.scanTimestamp,
    };
    const v41SnapshotJson = JSON.stringify(v41Snapshot);
    const openReason = `V4.1 — ${qualityLabel} · ${tradeSetup.marketState}`;

    const market = buildMarketSnapshot({
      entryPrice,
      priceAtAnalysis: currentPrice ?? entryPrice,
    });

    const scoring = buildScoringSnapshot({
      totalScore: tradeSetup.entryQuality,
      direction: modalDir,
      layers: [],
      mandatoryViolations: [],
      decision: openReason,
      scorerVersion: 'v41' as 'v4',
      score: tradeSetup.entryQuality,
      marketState: tradeSetup.marketState,
      recommendationLabel: qualityLabel,
    });

    const planBase = buildPlanSnapshot({
      tradePlan: null,
      entryPrice,
      stopLoss: tradeSetup.smartSlPrice,
      takeProfit1: tradeSetup.tp1Price,
      sizeActual: tradeSetup.marginUsdt,
      sizeProposed: tradeSetup.marginUsdt,
    });

    const plan = {
      ...planBase,
      entryZoneRangeLow: tradeSetup.entryZoneLow,
      entryZoneRangeHigh: tradeSetup.entryZoneHigh,
      tp2: tradeSetup.tp2Price,
      tp3: tradeSetup.tp3Price,
      rrProposed: tradeSetup.riskRewardRatio,
      openReason,
    };

    void useTradeStore.getState().addTradeEntry(
      symbol,
      market,
      { ...scoring, scorerVersion: 'v41' as typeof scoring.scorerVersion },
      plan,
      [
        'v41',
        `entryQualityV41:${Math.round(tradeSetup.entryQuality)}`,
        `marketStateV41:${tradeSetup.marketState}`,
        `confidenceV41:${Math.round(tradeSetup.marketConfidence)}`,
        `v41Snapshot:${v41SnapshotJson}`,
      ],
    );

    setModalVisible(false);
    const symbolLabel = symbol.replace('USDT', '');
    showJournalToast(`✅ Đã vào lệnh ${modalDir} ${symbolLabel}`);
  }, [
    currentPrice,
    modalDir,
    opportunity,
    protection,
    showJournalToast,
    snapshot,
    symbol,
    tradeSetup,
  ]);

  const handleSkip = useCallback(() => {
    if (currentPrice == null || !Number.isFinite(currentPrice)) {
      console.warn('[V4.1] no price for skip', symbol);
      return;
    }

    const skipReason: SkipReason = 'USER_SKIP';
    const skipReasonDetail = `V4.1 · ${snapshot.marketState} · manual skip`;

    void useTradeStore.getState().addSkippedSetup(
      symbol,
      modalDir,
      opportunity?.entryQuality ?? 0,
      skipReason,
      skipReasonDetail,
      currentPrice,
    );

    setModalVisible(false);
    const symbolLabel = symbol.replace('USDT', '');
    showJournalToast(`📋 Đã ghi nhận setup ${symbolLabel}`);
  }, [
    currentPrice,
    modalDir,
    opportunity?.entryQuality,
    showJournalToast,
    snapshot.marketState,
    symbol,
  ]);

  const badge = MARKET_STATE_BADGES[snapshot.marketState];
  const base = symbolLabelVi(symbol as AppTradeSymbol);
  const iconColor = SYMBOL_COLORS[symbol] ?? COLORS.accent;
  const changeColor =
    quote.changePct != null && quote.changePct < 0 ? COLORS.bearish : COLORS.bullish;

  const showButtons =
    visibilityMode !== 'INACTIVE' &&
    (visibilityMode === 'TRADE_MODE' ||
      visibilityMode === 'WATCH_MODE' ||
      visibilityMode === 'POSITION_MODE');

  const isWatchMode = visibilityMode === 'WATCH_MODE';
  const isTradeMode = visibilityMode === 'TRADE_MODE';
  const isPositionMode = visibilityMode === 'POSITION_MODE';
  const ewSeverity = earlyWarning?.severity;
  const isEwBlock = ewSeverity === 'BLOCK';
  const tradePressEnabled = (isTradeMode || isPositionMode) && !isEwBlock;

  const eqThresholdLong = opportunity?.eqThreshold ?? 70;
  const confThreshold = opportunity?.effectiveConfThreshold ?? 60;
  const momentumConfirmedLong =
    momentum?.momentumConfirmedLong ?? opportunity?.momentumConfirmedLong ?? false;

  const longEntryReady =
    isTradeMode &&
    !isEwBlock &&
    opportunity?.opportunityDirection === 'LONG' &&
    (opportunity?.entryQualityLong ?? 0) >= eqThresholdLong &&
    snapshot.marketConfidence >= confThreshold &&
    momentumConfirmedLong;

  const longPressEnabled = tradePressEnabled && longEntryReady;

  const handleTradePress = useCallback(
    async (direction: OpenDirection) => {
      if (direction === 'LONG' && (!longPressEnabled || tradeLoading)) return;
      if (direction === 'SHORT' && (!tradePressEnabled || tradeLoading)) return;
      if (!opportunity) {
        console.warn('[V4.1] no opportunity for', symbol);
        return;
      }

      setTradeLoading(true);
      try {
        let markPrice = currentPrice;
        if (markPrice == null) {
          try {
            const ticker = await fetchTickerPrice(symbol as AppTradeSymbol);
            markPrice = resolveFinitePrice(ticker.price);
          } catch (fetchError) {
            console.warn('[V4.1] fetchTickerPrice failed', symbol, fetchError);
          }
        }

        if (markPrice == null) {
          showJournalToast('⚠️ Chưa có giá — thử lại sau');
          return;
        }

        const setup = generateTradeSetupV41({
          snapshot,
          opportunity,
          protection: protection ?? NEUTRAL_PROTECTION,
          direction,
          markPrice,
          marginUsdt: 6,
          leverage: 5,
        });

        setTradeSetup(setup);
        setModalDir(direction);
        setModalVisible(true);
      } catch (pressError) {
        console.error('[V4.1] trade setup failed', symbol, pressError);
        showJournalToast('⚠️ Không tạo được kế hoạch lệnh');
      } finally {
        setTradeLoading(false);
      }
    },
    [
      currentPrice,
      opportunity,
      protection,
      showJournalToast,
      snapshot,
      symbol,
      tradeLoading,
      tradePressEnabled,
      longPressEnabled,
    ],
  );

  const entryQualityScore = opportunity?.entryQuality ?? 0;
  const eqColor = entryQualityColor(entryQualityScore);

  const tradeValidLong = longEntryReady;
  const tradeValidShort =
    isTradeMode &&
    opportunity?.opportunityDirection === 'SHORT' &&
    (opportunity?.entryQualityShort ?? 0) >= 70;
  const tradeInvalidWatch = isTradeMode && opportunity != null && !opportunity.opportunityValid;

  const longBtnBg =
    isEwBlock ? COLORS.surface : tradeValidLong ? '#22C55E' : COLORS.surface;
  const longBtnBorder =
    isEwBlock ? COLORS.border : tradeValidLong ? '#22C55E' : COLORS.border;
  const longBtnTextColor =
    isEwBlock ? COLORS.textMuted : tradeValidLong ? '#02110A' : COLORS.textMuted;

  const shortBtnBg =
    isEwBlock ? COLORS.surface : tradeValidShort ? '#EF4444' : COLORS.surface;
  const shortBtnBorder =
    isEwBlock ? COLORS.border : tradeValidShort ? '#EF4444' : COLORS.border;
  const shortBtnTextColor =
    isEwBlock ? COLORS.textMuted : tradeValidShort ? '#FFFFFF' : COLORS.textMuted;

  const longBtnLabel = tradeInvalidWatch
    ? `WATCH ${Math.round(entryQualityScore)}`
    : isWatchMode
      ? 'WATCH'
      : 'LONG';
  const shortBtnLabel = tradeInvalidWatch
    ? `WATCH ${Math.round(entryQualityScore)}`
    : isWatchMode
      ? 'WATCH'
      : 'SHORT';

  const direction = opportunity?.opportunityDirection ?? 'NONE';
  const longDirectionColor =
    direction === 'LONG' ? '#22C55E' : direction === 'NONE' ? COLORS.textMuted : COLORS.textSecondary;
  const shortDirectionColor =
    direction === 'SHORT' ? '#EF4444' : direction === 'NONE' ? COLORS.textMuted : COLORS.textSecondary;
  const longDirectionWeight = direction === 'LONG' ? '800' : '400';
  const shortDirectionWeight = direction === 'SHORT' ? '800' : '400';

  const momentumLongDisplay = resolveMomentumLongDisplay(momentum);
  const exhaustionDisplay = resolveExhaustionDisplay(exhaustion);

  return (
    <View style={[styles.card, { borderColor: COLORS.border }]}>
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
          <Text style={styles.price}>{formatPrice(symbol, quote.price)}</Text>
          <Text style={[styles.change, { color: changeColor }]}>
            {formatChangePct(quote.changePct)}
          </Text>
        </View>
      </View>

      <View style={[styles.stateBadge, { backgroundColor: badge.backgroundColor }]}>
        <Text style={[styles.stateBadgeText, { color: badge.textColor }]}>{badge.label}</Text>
      </View>

      {ewSeverity === 'BLOCK' ? (
        <View
          style={[
            styles.ewBadge,
            {
              backgroundColor: hexWithAlpha('#EF4444', 0.15),
              borderColor: '#EF4444',
            },
          ]}
        >
          <Text style={[styles.ewBadgeText, { color: '#EF4444' }]}>
            🔴 {earlyWarning?.blockMessage ?? 'Đảo chiều xác nhận'}
          </Text>
        </View>
      ) : null}

      {ewSeverity === 'WARNING_HARD' ? (
        <View
          style={[
            styles.ewBadge,
            {
              backgroundColor: hexWithAlpha('#F97316', 0.15),
              borderColor: '#F97316',
            },
          ]}
        >
          <Text style={[styles.ewBadgeText, { color: '#F97316' }]}>
            ⚠️ Cảnh báo 1H — {earlyWarning?.warningMessage ?? 'thận trọng'}
          </Text>
        </View>
      ) : null}

      {ewSeverity === 'WARNING_SOFT' ? (
        <View
          style={[
            styles.ewBadge,
            {
              backgroundColor: hexWithAlpha('#F59E0B', 0.15),
              borderColor: '#F59E0B',
            },
          ]}
        >
          <Text style={[styles.ewBadgeText, { color: '#F59E0B' }]}>
            ⚠️ Tín hiệu 30M — theo dõi
          </Text>
        </View>
      ) : null}

      {reversalState?.phase === 'WATCHING' && reversalState.counterDirection ? (
        <View
          style={[
            styles.reversalWatchBanner,
            { backgroundColor: hexWithAlpha('#3B82F6', 0.1) },
          ]}
        >
          <Text style={styles.reversalWatchText}>
            🔄 Đang theo dõi retest {reversalState.counterDirection}...
          </Text>
        </View>
      ) : null}

      <View style={styles.confidenceRow}>
        <Text
          style={[
            styles.confidenceValue,
            { color: confidenceColor(snapshot.marketConfidence) },
          ]}
        >
          Confidence: {Math.round(snapshot.marketConfidence)}/100
        </Text>
        <Text style={styles.confidenceStateShort}>
          {MARKET_STATE_SHORT[snapshot.marketState]}
        </Text>
      </View>

      <View style={styles.metricsRow}>
        <Text style={styles.metricText}>Trend: {Math.round(snapshot.trendStrength)}</Text>
        <Text style={styles.metricText}>Exhaust: {Math.round(snapshot.trendExhaustion)}</Text>
        <Text style={styles.metricText}>
          BTC: {snapshot.btcDirection} {btcAlignmentIcon(snapshot.btcAlignmentFactor)}
        </Text>
      </View>

      {opportunity ? (
        <View style={styles.eqBlock}>
          <View style={styles.eqRow}>
            <Text style={styles.eqLine1}>
              <Text style={[styles.eqScore, { color: eqColor }]}>
                EQ: {Math.round(opportunity.entryQuality)}/100
              </Text>
              <Text style={styles.eqLabel}> {opportunity.qualityLabel}</Text>
            </Text>
            <Text style={styles.eqDir}>
              <Text style={{ color: longDirectionColor, fontWeight: longDirectionWeight }}>
                L:{Math.round(opportunity.entryQualityLong)}
              </Text>
              <Text style={{ color: COLORS.textMuted }}> </Text>
              <Text style={{ color: shortDirectionColor, fontWeight: shortDirectionWeight }}>
                S:{Math.round(opportunity.entryQualityShort)}
              </Text>
            </Text>
          </View>
          <Text
            style={[
              styles.eqThresholdLine,
              { color: CONFIDENCE_TIER_META[opportunity.confidenceTier].color },
            ]}
          >
            Ngưỡng: {opportunity.eqThreshold} — {CONFIDENCE_TIER_META[opportunity.confidenceTier].label}
          </Text>
          <Text style={[styles.momentumLine, { color: momentumLongDisplay.color }]}>
            {momentumLongDisplay.text}
          </Text>
          {exhaustionDisplay ? (
            <Text style={[styles.exhaustionLine, { color: exhaustionDisplay.color }]}>
              {exhaustionDisplay.text}
            </Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {showButtons ? (
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              void handleTradePress('LONG');
            }}
            disabled={!longPressEnabled || tradeLoading}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: longBtnBg,
                borderColor: longBtnBorder,
                opacity: !longPressEnabled || tradeLoading ? 0.55 : 1,
              },
              pressed && longPressEnabled && !tradeLoading && styles.actionBtnPressed,
              webPointer,
            ]}
          >
            <Text style={[styles.actionBtnText, { color: longBtnTextColor }]}>
              {longBtnLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void handleTradePress('SHORT');
            }}
            disabled={!tradePressEnabled || tradeLoading}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: shortBtnBg,
                borderColor: shortBtnBorder,
                opacity: !tradePressEnabled || tradeLoading ? 0.55 : 1,
              },
              pressed && tradePressEnabled && !tradeLoading && styles.actionBtnPressed,
              webPointer,
            ]}
          >
            <Text style={[styles.actionBtnText, { color: shortBtnTextColor }]}>
              {shortBtnLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isEwBlock && showButtons ? (
        <Text style={styles.ewPauseText}>Tạm dừng — đảo chiều xác nhận</Text>
      ) : null}

      <TradePlanModalV41
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={handleConfirm}
        onSkip={handleSkip}
        direction={modalDir}
        symbol={symbol}
        setup={tradeSetup}
        opportunity={opportunity}
      />

      {reversalSetup ? (
        <ReversalModal
          visible={reversalModalVisible}
          onClose={() => setReversalModalVisible(false)}
          onConfirm={handleReversalConfirm}
          onSkip={handleReversalSkip}
          setup={reversalSetup}
          symbol={row.symbol}
          marketState={row.snapshot.marketState}
        />
      ) : null}

      {journalToast ? (
        <View style={styles.journalToast}>
          <Text style={styles.journalToastText}>{journalToast}</Text>
        </View>
      ) : null}
    </View>
  );
}

interface SignalBoardV41Props {
  symbols?: string[];
  rows?: SignalRowV41[];
  loading?: boolean;
  lastScannedAt?: number | null;
  onRequestScan?: () => void;
}

export function SignalBoardV41({
  symbols = MODULE_DEFAULT_SYMBOLS_V41,
  rows = [],
  loading = false,
  lastScannedAt = null,
  onRequestScan,
}: SignalBoardV41Props) {
  const [quotes, setQuotes] = useState<Record<string, SymbolQuote>>({});
  const isScanning = useV41Store((s) => s.isScanning);

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
    void loadQuotes(symbols);
  }, [symbols, loadQuotes]);

  useEffect(() => {
    if (rows.length > 0) {
      void loadQuotes(symbols);
    }
  }, [rows, symbols, loadQuotes]);

  const scanBusy = loading || isScanning;

  return (
    <View style={styles.panel}>
      <View style={styles.accentStrip} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Tín hiệu V4.1</Text>
            <Text style={styles.subtitle}>
              Market Intelligence · 4H · Quét {SCAN_INTERVAL_SECONDS}s
              {lastScannedAt
                ? ` · ${new Date(lastScannedAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.scanBtnWrap}>
              <Pressable
                onPress={() => onRequestScan?.()}
                disabled={scanBusy}
                style={({ pressed }) => [
                  styles.scanBtn,
                  scanBusy && styles.scanBtnDisabled,
                  pressed && !scanBusy && styles.scanBtnPressed,
                  webPointer,
                ]}
              >
                {scanBusy ? (
                  <ActivityIndicator size="small" color={COLORS.background} />
                ) : (
                  <Text style={styles.scanBtnText}>Quét lại</Text>
                )}
              </Pressable>
              {isScanning ? (
                <Text style={styles.scanStatusText}>Đang quét...</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.grid}>
          {rows.map((row) => (
            <SignalCardV41
              key={row.symbol}
              row={row}
              quote={quotes[row.symbol] ?? { price: null, changePct: null }}
            />
          ))}
        </View>
      </View>
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
    backgroundColor: '#3B82F6',
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  scanBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    minWidth: 88,
    alignItems: 'center',
  },
  scanBtnWrap: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  scanStatusText: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
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
  stateBadge: {
    alignSelf: 'stretch',
    borderRadius: RADIUS.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  ewBadge: {
    alignSelf: 'stretch',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: SPACING.xs,
  },
  ewBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  ewPauseText: {
    marginTop: SPACING.xs,
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '700',
    textAlign: 'center',
  },
  reversalWatchBanner: {
    alignSelf: 'stretch',
    borderRadius: RADIUS.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: SPACING.xs,
  },
  reversalWatchText: {
    fontSize: 10,
    color: '#3B82F6',
    fontWeight: '600',
    lineHeight: 14,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  confidenceValue: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  confidenceStateShort: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.xs,
  },
  metricText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  eqBlock: {
    gap: 2,
  },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  eqLine1: {
    flexShrink: 1,
  },
  eqScore: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  eqLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    flexShrink: 1,
  },
  eqDir: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  eqThresholdLine: {
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  momentumLine: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  exhaustionLine: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  errorText: {
    fontSize: 11,
    color: COLORS.bearish,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: SPACING.xs,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  journalToast: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  journalToastText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
});

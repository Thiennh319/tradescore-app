import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  COLORS,
  TRADE_PLAN_V3_CONFIG,
  type AppTradeSymbol,
  type MarketTrend,
  type ScorerVersion,
  type TradeDecisionLabel,
  type TradeDirection,
  type TradePlanV3,
} from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import type { StrategySource } from '../../constants/aiJournal';
import { symbolLabelVi, vi } from '../../constants/vi';
import type { SignalRow } from '../../hooks/useSignalBoard';
import { formatUsdPrice } from '../../utils/formatPrice';
import {
  resolveFinalEntryStatus,
  resolveSignalRow,
  resolveTradePlanV3,
} from '../../services/signalRowView';
import {
  collectHardBlockReasons,
  resolveFinalEntryDecision,
  type HardBlockSnapInput,
} from '../../services/tradePlanDisplay';
import { FinalEntryStatus } from '../../types/scoring';
import { calculateFinalEntryStatus, resolveFinalEntryDisplay } from '../../services/finalEntryStatus';
import { FinalEntryBadge } from '../FinalEntryBadge';
import { GroupScoreBar } from '../GroupScoreBar';
import { LayerCard } from '../LayerCard';
import { ScoreRing } from '../ScoreRing';
import { TradeRecommendationTable, type ManualTradeSetup } from '../TradeRecommendationTable';
import { TradePlanV3View } from '../TradePlanV3View';
import { useTradeStore } from '../../store/useTradeStore';
import type { useLockedPlanMonitor } from '../../hooks/useLockedPlanMonitor';
import type { LockedTradePlan } from '../../constants/aiJournal';
import { GRACE_ATR_MULTIPLIER, resolveGraceAtr } from '../../services/gracePeriod';

type LockedPlanMonitorState = ReturnType<typeof useLockedPlanMonitor>;

interface SignalBoardProps {
  rows: SignalRow[];
  loading: boolean;
  lastScannedAt: number | null;
  autoTriggeredAt: number | null;
  onScan: () => void;
  tierName?: string;
  onTierPress?: () => void;
  onOpenPosition?: (row: SignalRow, manual?: boolean, setup?: ManualTradeSetup) => void;
  onRequestConfirmTrade?: (row: SignalRow, setup: ManualTradeSetup) => void;
  onRequestPendingOrder?: (row: SignalRow, setup: ManualTradeSetup) => void;
  onPendingOrder?: (row: SignalRow, setup: ManualTradeSetup) => void;
  onRecordSkippedSetup?: (row: SignalRow) => void;
  lockedPlanOverlay?: {
    symbol: string;
    direction: TradeDirection;
    lockedScore: number;
    decisionLabel: string;
  } | null;
  lockedPlanMonitor?: LockedPlanMonitorState;
}

const SYMBOL_COLORS: Record<string, string> = {
  BTCUSDT: '#F7931A',
  NEARUSDT: '#00C08B',
  SOLUSDT: '#9945FF',
  BNBUSDT: '#F0B90B',
};

const DECISION_COLOR: Record<TradeDecisionLabel, string> = {
  KHONG_VAO: COLORS.bearish,
  CHO_THEM: COLORS.warning,
  CO_THE_VAO: COLORS.bullishMuted,
  VAO_TU_TIN: COLORS.bullish,
  CHO_TAI_CHAM: COLORS.textSecondary,
  SETUP_NGON: COLORS.accent,
};

const MAX_SCORE = 15;
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

function manualSetupFromTradePlanV3(
  plan: TradePlanV3,
  planSource: ScorerVersion,
  strategySource: StrategySource,
): ManualTradeSetup {
  return {
    entryPrice: plan.recommendedEntry,
    stopLoss: plan.stopLoss.price,
    takeProfit1: plan.tp1.price,
    takeProfit2: plan.tp2.price,
    takeProfit3: plan.tp3.price,
    marginUsdt: plan.positionSizeAdjusted,
    leverage: TRADE_PLAN_V3_CONFIG.LEVERAGE,
    planSource,
    strategySource,
  };
}

function trendMeta(trend: MarketTrend): { label: string; color: string; arrow: string } {
  if (trend === 'BULLISH') return { label: vi.signalBoard.trendUp, color: COLORS.bullish, arrow: '▲' };
  if (trend === 'BEARISH') return { label: vi.signalBoard.trendDown, color: COLORS.bearish, arrow: '▼' };
  return { label: vi.signalBoard.trendFlat, color: COLORS.neutral, arrow: '◆' };
}

/** |currentPrice - entryPrice| < 0.5×ATR — cùng ngưỡng Grace Period (giá chưa rời entry). */
function isNearLockedPlanEntry(
  currentPrice: number,
  plan: LockedTradePlan,
  atr1h?: number,
): boolean {
  const { atr } = resolveGraceAtr(
    {
      direction: plan.lockedDirection,
      entryPrice: plan.limitOrderPrice,
      sl: plan.sl,
      tp1: plan.tp1,
      tp2: plan.tp2,
      tp3: plan.tp3,
      openedAt: 0,
      currentPnlPct: 0,
      currentPnlUSDT: 0,
    },
    atr1h,
  );
  if (!Number.isFinite(atr) || atr <= 0) return false;
  return Math.abs(currentPrice - plan.limitOrderPrice) < GRACE_ATR_MULTIPLIER * atr;
}

export function SignalBoard({
  rows,
  loading,
  lastScannedAt,
  autoTriggeredAt,
  onScan,
  tierName = 'GD1',
  onTierPress,
  onOpenPosition,
  onRequestConfirmTrade,
  onRequestPendingOrder,
  onPendingOrder,
  onRecordSkippedSetup,
  lockedPlanOverlay = null,
  lockedPlanMonitor,
}: SignalBoardProps) {
  const [planSymbol, setPlanSymbol] = useState<AppTradeSymbol | null>(null);
  const scorerVersion = useTradeStore((s) => s.scorerVersion);
  const setScorerVersion = useTradeStore((s) => s.setScorerVersion);
  const boardStrategySource =
    (scorerVersion === 'v3' ? vi.signalBoard.scorerV3 : vi.signalBoard.scorerV4) as StrategySource;

  const entryRows = rows
    .map((row) => ({ row, snap: resolveSignalRow(row, scorerVersion) }))
    .filter(({ row, snap }) => snap.canEnter && !row.error);
  const isAutoLatest =
    autoTriggeredAt != null &&
    lastScannedAt != null &&
    Math.abs(lastScannedAt - autoTriggeredAt) < 120_000;

  return (
    <View style={styles.panel}>
      <View style={styles.accentStrip} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{vi.signalBoard.title}</Text>
            <View style={styles.versionRow}>
              <Text style={styles.versionLabel}>{vi.signalBoard.scorerEngine}:</Text>
              {onTierPress ? (
                <Pressable
                  onPress={onTierPress}
                  style={[styles.tierBadge, webPointer]}
                  accessibilityLabel={vi.signalBoard.tierBadgeHint}
                >
                  <Text style={styles.tierBadgeText}>{tierName}</Text>
                </Pressable>
              ) : null}
              {(['v3', 'v4'] as const).map((v) => {
                const active = scorerVersion === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => setScorerVersion(v)}
                    style={[
                      styles.versionPill,
                      active && styles.versionPillActive,
                      webPointer,
                    ]}
                  >
                    <Text
                      style={[
                        styles.versionPillText,
                        active && styles.versionPillTextActive,
                      ]}
                    >
                      {v === 'v3' ? vi.signalBoard.scorerV3 : vi.signalBoard.scorerV4}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Pressable
            onPress={onScan}
            disabled={loading}
            style={({ pressed }) => [
              styles.scanBtn,
              loading && styles.scanBtnDisabled,
              pressed && !loading && styles.scanBtnPressed,
              webPointer,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.background} />
            ) : (
              <Text style={styles.scanBtnText}>{vi.signalBoard.rescan}</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.scannedAt}>
          {lastScannedAt
            ? `${vi.signalBoard.scannedAt(new Date(lastScannedAt).toLocaleTimeString('vi-VN'))}${
                isAutoLatest ? ` · ${vi.signalBoard.autoTag}` : ''
              } · ${vi.signalBoard.autoSchedule}`
            : vi.signalBoard.scanning}
        </Text>

        {!loading && rows.length > 0 ? (
          <View
            style={[
              styles.banner,
              entryRows.length > 0 ? styles.bannerActive : styles.bannerIdle,
            ]}
          >
            <Text
              style={[
                styles.bannerText,
                { color: entryRows.length > 0 ? COLORS.accent : COLORS.textMuted },
              ]}
            >
              {entryRows.length > 0
                ? vi.signalBoard.alert(
                    entryRows.length,
                    entryRows
                      .map(({ row, snap }) => `${symbolLabelVi(row.symbol)} ${snap.direction}`)
                      .join(' · '),
                  )
                : vi.signalBoard.alertNone}
            </Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          {rows.length === 0 && loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : rows.map((row) => (
                <SignalCard
                  key={row.symbol}
                  row={row}
                  scorerVersion={scorerVersion}
                  boardStrategySource={boardStrategySource}
                  lockedPlanOverlay={lockedPlanOverlay}
                  showPlan={planSymbol === row.symbol}
                  onShowPlan={() => setPlanSymbol(row.symbol)}
                  onHidePlan={() => setPlanSymbol(null)}
                  onOpenPosition={onOpenPosition}
                  onRequestConfirmTrade={onRequestConfirmTrade}
                  onRequestPendingOrder={onRequestPendingOrder}
                  onPendingOrder={onPendingOrder}
                  onRecordSkippedSetup={onRecordSkippedSetup}
                  lockedPlanMonitor={lockedPlanMonitor}
                />
              ))}
        </View>
      </View>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={[styles.card, styles.cardSkeleton]}>
      <ActivityIndicator color={COLORS.accent} />
    </View>
  );
}

function SignalCard({
  row,
  scorerVersion,
  boardStrategySource,
  lockedPlanOverlay = null,
  showPlan,
  onShowPlan,
  onHidePlan,
  onOpenPosition,
  onRequestConfirmTrade,
  onRequestPendingOrder,
  onPendingOrder,
  onRecordSkippedSetup,
  lockedPlanMonitor,
}: {
  row: SignalRow;
  scorerVersion: ScorerVersion;
  boardStrategySource: StrategySource;
  lockedPlanOverlay?: SignalBoardProps['lockedPlanOverlay'];
  lockedPlanMonitor?: LockedPlanMonitorState;
  showPlan?: boolean;
  onShowPlan?: () => void;
  onHidePlan?: () => void;
  onOpenPosition?: (row: SignalRow, manual?: boolean, setup?: ManualTradeSetup) => void;
  onRequestConfirmTrade?: (row: SignalRow, setup: ManualTradeSetup) => void;
  onRequestPendingOrder?: (row: SignalRow, setup: ManualTradeSetup) => void;
  onPendingOrder?: (row: SignalRow, setup: ManualTradeSetup) => void;
  onRecordSkippedSetup?: (row: SignalRow) => void;
}) {
  const [showLayers, setShowLayers] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const [manualSetup, setManualSetup] = useState<ManualTradeSetup | null>(null);
  const settings = useTradeStore((st) => st.settings);
  const snap = resolveSignalRow(row, scorerVersion);
  const base = symbolLabelVi(row.symbol);
  const iconColor = SYMBOL_COLORS[row.symbol] ?? COLORS.accent;
  const lockedMatch =
    lockedPlanOverlay != null &&
    lockedPlanOverlay.symbol === row.symbol &&
    lockedPlanOverlay.direction === snap.direction
      ? lockedPlanOverlay
      : null;
  const displayScore = snap.awaitingRescore
    ? null
    : lockedMatch
      ? lockedMatch.lockedScore
      : snap.score;
  const displayDecisionLabel = (lockedMatch
    ? lockedMatch.decisionLabel
    : snap.decisionLabel) as TradeDecisionLabel;
  const planForRow =
    lockedPlanMonitor?.lockedPlan?.symbol === row.symbol ? lockedPlanMonitor : null;
  const lockedPlanForRow =
    planForRow?.lockedPlan != null &&
    planForRow.lockedPlan.lockedDirection === snap.direction
      ? planForRow.lockedPlan
      : null;
  const activePlanV3 = resolveTradePlanV3(row, scorerVersion);
  const hardBlockSnapInput: HardBlockSnapInput = {
    direction: snap.direction,
    mandatoryViolations: snap.mandatoryViolations,
    groupBlocks: snap.groupBlocks,
    longHardBlocks: snap.longHardBlocks,
    shortHardBlocks: snap.shortHardBlocks,
    hardBlocked: snap.hardBlocked,
    lockedPlanHealthStatus: lockedPlanForRow
      ? planForRow?.planHealth?.status
      : undefined,
    isNearEntryZone:
      lockedPlanForRow != null && row.price != null
        ? isNearLockedPlanEntry(row.price, lockedPlanForRow, row.atr1h)
        : undefined,
  };
  const sideHardBlocks =
    snap.direction === 'LONG'
      ? (snap.longHardBlocks ?? [])
      : (snap.shortHardBlocks ?? []);
  const rawHardBlockReasons =
    sideHardBlocks.length > 0
      ? sideHardBlocks
      : !snap.hardBlocked
        ? []
        : snap.mandatoryViolations.filter(
            (v) => !(snap.groupBlocks ?? []).includes(v),
          );
  const hardBlockReasons = collectHardBlockReasons(hardBlockSnapInput);
  const macdSuppressed =
    rawHardBlockReasons.some((reason) => reason.startsWith('L3 MACD vi phạm')) &&
    !hardBlockReasons.some((reason) => reason.startsWith('L3 MACD vi phạm'));
  const rawFinalEntryStatus =
    resolveFinalEntryStatus(row, scorerVersion) ?? FinalEntryStatus.SCORE_BLOCKED;
  const displayFinalEntryStatus =
    rawFinalEntryStatus === FinalEntryStatus.HARD_BLOCKED &&
    macdSuppressed &&
    hardBlockReasons.length === 0
      ? calculateFinalEntryStatus(
          displayDecisionLabel,
          activePlanV3?.tradePlanValid ?? false,
          false,
          (snap.groupBlocks?.length ?? 0) > 0,
        )
      : rawFinalEntryStatus;
  const showMacdSuppressedHint =
    macdSuppressed && displayFinalEntryStatus !== FinalEntryStatus.HARD_BLOCKED;
  const entryDisplay = resolveFinalEntryDisplay({
    status: displayFinalEntryStatus,
    scoringDecision: displayDecisionLabel,
    score: displayScore,
    plan: activePlanV3,
    symbol: row.symbol,
    hardBlockReasons,
    groupBlockReasons: snap.groupBlocks ?? [],
  });
  const cardBorderColor = entryDisplay.borderColor;
  const trend = trendMeta(row.trend);
  const changeColor = row.change24h >= 0 ? COLORS.bullish : COLORS.bearish;
  const isTrending = snap.marketMode === 'TRENDING';
  const hasLegacyPlan = row.tradePlan != null;
  const hasPlan = activePlanV3 != null || hasLegacyPlan;
  const canShowPlan = hasPlan || snap.canEnter;
  const effectiveHardBlocked =
    displayFinalEntryStatus === FinalEntryStatus.HARD_BLOCKED;
  const finalDecision = resolveFinalEntryDecision({
    decisionLabel: displayDecisionLabel,
    hardBlocked: effectiveHardBlocked,
    awaitingRescore: snap.awaitingRescore,
  });

  return (
    <View style={[styles.card, { borderColor: cardBorderColor }]}>
      <View style={styles.cardTop}>
        <View style={styles.pairRow}>
          <View style={[styles.icon, { backgroundColor: iconColor }]}>
            <Text style={styles.iconText}>{base.charAt(0)}</Text>
          </View>
          <View>
            <Text style={styles.pairText}>
              <Text style={styles.pairBase}>{base}</Text>
              <Text style={styles.pairQuote}>/USDT</Text>
            </Text>
            <Text style={styles.price}>{formatUsdPrice(row.symbol, row.price)}</Text>
          </View>
        </View>
        <View style={styles.topRight}>
          <Text style={[styles.change, { color: changeColor }]}>
            {row.change24h >= 0 ? '+' : ''}
            {row.change24h.toFixed(2)}%
          </Text>
          <View style={[styles.trendBadge, { borderColor: trend.color }]}>
            <Text style={[styles.trendText, { color: trend.color }]}>
              {trend.arrow} {trend.label}
            </Text>
          </View>
        </View>
      </View>

      {row.error ? (
        <Text style={styles.error}>{row.error}</Text>
      ) : (
        <>
          <View style={styles.scoreRow}>
            {displayScore != null ? (
              <ScoreRing
                score={displayScore}
                maxScore={MAX_SCORE}
                size={84}
                strokeWidth={9}
                color={cardBorderColor}
              />
            ) : (
              <View style={[styles.rescoreRing, { borderColor: cardBorderColor }]}>
                <Text style={[styles.rescoreRingText, { color: cardBorderColor }]}>—</Text>
              </View>
            )}
            <View style={styles.scoreCol}>
              {lockedMatch ? (
                <Text style={styles.lockedBadge}>🔒 Score đóng băng</Text>
              ) : null}
              <FinalEntryBadge
                display={entryDisplay}
                score={entryDisplay.subtitle ? undefined : displayScore ?? undefined}
                size="md"
              />
              {showMacdSuppressedHint ? (
                <Text style={styles.macdSuppressedHint}>
                  ℹ️ MACD đang nhiễu tại vùng entry — theo dõi Plan Health
                </Text>
              ) : null}
              <Text style={[styles.scoreHint, { color: cardBorderColor }]}>
                {displayScore != null
                  ? `${displayScore.toFixed(1)} / ${MAX_SCORE}`
                  : 'Điểm tổng chờ tái chấm'}
                {snap.winrate && !lockedMatch && snap.winrate !== '—' ? ` · ${snap.winrate}` : ''}
              </Text>
              {snap.marketMode && !lockedMatch ? (
                <Text style={styles.modeHint}>
                  {isTrending ? '🔥 TRENDING' : '↔️ RANGING'}
                </Text>
              ) : null}
            </View>
          </View>

          <BiasBar
            longScore={snap.longScore}
            shortScore={snap.shortScore}
            direction={snap.direction}
          />

          {canShowPlan ? (
            <View style={styles.planWrap}>
              {showPlan ? (
                <>
                  {activePlanV3 ? (
                    <>
                      <TradePlanV3View
                        plan={activePlanV3}
                        finalDecision={finalDecision}
                        finalEntryStatus={displayFinalEntryStatus}
                        hardBlockReasons={hardBlockReasons}
                        squeezeWarning={row.squeezeWarning}
                        embedded
                        onPlacePending={(limitPrice) => {
                          const setup: ManualTradeSetup = {
                            ...manualSetupFromTradePlanV3(activePlanV3, scorerVersion, boardStrategySource),
                            entryPrice: limitPrice,
                          };
                          if (onRequestPendingOrder) {
                            onRequestPendingOrder(row, setup);
                          } else if (onPendingOrder) {
                            onPendingOrder(row, setup);
                          }
                          onHidePlan?.();
                        }}
                        onConfirmEntry={() => {
                          const setup = manualSetupFromTradePlanV3(
                            activePlanV3,
                            scorerVersion,
                            boardStrategySource,
                          );
                          if (onRequestConfirmTrade) {
                            onRequestConfirmTrade(row, setup);
                          } else if (onOpenPosition) {
                            onOpenPosition(row, false, setup);
                          }
                          onHidePlan?.();
                        }}
                      />
                      <Pressable
                        onPress={() => onHidePlan?.()}
                        style={[styles.planSecondaryBtn, webPointer, { marginTop: SPACING.sm }]}
                      >
                        <Text style={styles.planSecondaryText}>{vi.signalBoard.closePlan}</Text>
                      </Pressable>
                      {onRecordSkippedSetup && row.price != null ? (
                        <Pressable
                          onPress={() => {
                            onRecordSkippedSetup(row);
                            onHidePlan?.();
                          }}
                          style={[styles.skipSetupBtn, webPointer]}
                        >
                          <Text style={styles.skipSetupText}>{vi.signalBoard.recordSkip}</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : row.tradePlan ? (
                    <>
                  <TradeRecommendationTable
                    symbol={row.symbol}
                    direction={snap.direction}
                    plan={row.tradePlan}
                    defaultMargin={settings.sizePerTrade}
                    defaultLeverage={settings.leverage}
                    onSetupChange={(setup) =>
                      setManualSetup(
                        setup
                          ? {
                              ...setup,
                              planSource: scorerVersion,
                              strategySource: boardStrategySource,
                            }
                          : null,
                      )
                    }
                  />
                  <View style={styles.planActions}>
                    <Pressable
                      onPress={() => {
                        setManualSetup(null);
                        onHidePlan?.();
                      }}
                      style={[styles.planSecondaryBtn, webPointer]}
                    >
                      <Text style={styles.planSecondaryText}>{vi.signalBoard.closePlan}</Text>
                    </Pressable>
                    {onRequestConfirmTrade || onOpenPosition ? (
                      <Pressable
                        disabled={!manualSetup}
                        onPress={() => {
                          if (!manualSetup || row.price == null) return;
                          if (onRequestConfirmTrade) {
                            onRequestConfirmTrade(row, manualSetup);
                          } else if (onOpenPosition) {
                            onOpenPosition(row, false, {
                              ...manualSetup,
                              entryPrice: row.price,
                            });
                          }
                          setManualSetup(null);
                          onHidePlan?.();
                        }}
                        style={({ pressed }) => [
                          styles.planSecondaryBtn,
                          styles.planMarketBtn,
                          !manualSetup && styles.planPrimaryBtnDisabled,
                          pressed && manualSetup && styles.scanBtnPressed,
                          webPointer,
                        ]}
                      >
                        <Text style={styles.planMarketText}>{vi.signalBoard.confirmOpened}</Text>
                      </Pressable>
                    ) : null}
                    {(onRequestPendingOrder || onPendingOrder) ? (
                      <Pressable
                        disabled={!manualSetup}
                        onPress={() => {
                          if (!manualSetup) return;
                          if (onRequestPendingOrder) {
                            onRequestPendingOrder(row, manualSetup);
                          } else if (onPendingOrder) {
                            onPendingOrder(row, manualSetup);
                          }
                          setManualSetup(null);
                          onHidePlan?.();
                        }}
                        style={({ pressed }) => [
                          styles.planPrimaryBtn,
                          !manualSetup && styles.planPrimaryBtnDisabled,
                          {
                            backgroundColor:
                              snap.direction === 'LONG' ? COLORS.bullish : COLORS.bearish,
                          },
                          pressed && manualSetup && styles.scanBtnPressed,
                          webPointer,
                        ]}
                      >
                        <Text style={styles.planPrimaryText}>{vi.signalBoard.placePending}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {onRecordSkippedSetup && row.price != null ? (
                    <Pressable
                      onPress={() => {
                        onRecordSkippedSetup(row);
                        setManualSetup(null);
                        onHidePlan?.();
                      }}
                      style={[styles.skipSetupBtn, webPointer]}
                    >
                      <Text style={styles.skipSetupText}>{vi.signalBoard.recordSkip}</Text>
                    </Pressable>
                  ) : null}
                    </>
                  ) : null}
                </>
              ) : onOpenPosition || onRequestPendingOrder || onPendingOrder ? (
                <Pressable
                  onPress={() => {
                    setManualSetup(null);
                    onShowPlan?.();
                  }}
                  style={({ pressed }) => [
                    styles.openBtn,
                    { backgroundColor: snap.direction === 'LONG' ? COLORS.bullish : COLORS.bearish },
                    pressed && styles.scanBtnPressed,
                    webPointer,
                  ]}
                >
                  <Text style={styles.openBtnText}>
                    {vi.signalBoard.openPosition(
                      snap.direction === 'LONG' ? vi.signalBoard.long : vi.signalBoard.short,
                    )}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.noEntryBox}>
              <Text style={styles.noEntryText}>{vi.signalBoard.noEntry}</Text>
              {onRecordSkippedSetup && row.price != null ? (
                <Pressable
                  onPress={() => onRecordSkippedSetup(row)}
                  style={[styles.skipSetupBtn, styles.skipSetupBtnCompact, webPointer]}
                >
                  <Text style={styles.skipSetupText}>{vi.signalBoard.recordSkip}</Text>
                </Pressable>
              ) : null}
              {onOpenPosition ? (
                confirmManual ? (
                  <View style={styles.manualWrap}>
                    <Text style={styles.manualWarn}>
                      {vi.signalBoard.manualWarn(
                        snap.direction === 'LONG' ? vi.signalBoard.long : vi.signalBoard.short,
                      )}
                    </Text>
                    <View style={styles.manualRow}>
                      <Pressable
                        onPress={() => setConfirmManual(false)}
                        style={[styles.manualCancel, webPointer]}
                      >
                        <Text style={styles.manualCancelText}>{vi.signalBoard.cancel}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          onOpenPosition(row, true);
                          setConfirmManual(false);
                        }}
                        style={[styles.manualConfirm, webPointer]}
                      >
                        <Text style={styles.manualConfirmText}>{vi.signalBoard.manualConfirm}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setConfirmManual(true)}
                    style={[styles.manualBtn, webPointer]}
                  >
                    <Text style={styles.manualBtnText}>{vi.signalBoard.manualOpen}</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          )}

          {snap.layers.length > 0 ? (
            <>
              <Pressable
                onPress={() => setShowLayers((v) => !v)}
                style={[styles.detailToggle, webPointer]}
              >
                <Text style={styles.detailToggleText}>
                  {showLayers ? vi.signalBoard.hideDetail : vi.signalBoard.showDetail}
                </Text>
                <Text style={styles.detailChevron}>{showLayers ? '▲' : '▼'}</Text>
              </Pressable>
              {showLayers ? (
                <>
                  {snap.groupScores && snap.groupBlocks ? (
                    <GroupScoreBar
                      groupScores={snap.groupScores}
                      groupBlocks={snap.groupBlocks}
                    />
                  ) : null}
                  <LayerCard
                    layers={snap.layers}
                    l6ExpandV4={
                      scorerVersion === 'v4' && row.l6Detail
                        ? {
                            detail: row.l6Detail,
                            longScore:
                              row.v4?.longLayers?.find((l) => l.layer === 6)?.score ?? 0,
                            shortScore:
                              row.v4?.shortLayers?.find((l) => l.layer === 6)?.score ?? 0,
                            activeDirection: snap.direction,
                          }
                        : undefined
                    }
                    l11ExpandV4={
                      scorerVersion === 'v4' && row.squeezeRisk
                        ? { squeezeRisk: row.squeezeRisk }
                        : undefined
                    }
                  />
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

function BiasBar({
  longScore,
  shortScore,
  direction,
}: {
  longScore: number;
  shortScore: number;
  direction: TradeDirection;
}) {
  const total = Math.max(0.001, longScore + shortScore);
  const longPct = (longScore / total) * 100;
  const shortPct = 100 - longPct;
  const isLong = direction === 'LONG';
  const dirColor = isLong ? COLORS.bullish : COLORS.bearish;

  return (
    <View style={styles.biasWrap}>
      <View style={styles.biasHeader}>
        <Text style={styles.biasLabel}>{vi.signalBoard.biasLabel}</Text>
        <Text style={[styles.biasValue, { color: dirColor }]}>
          {isLong ? `▲ ${vi.signalBoard.long}` : `▼ ${vi.signalBoard.short}`}{' '}
          <Text style={styles.biasScore}>
            {(isLong ? longScore : shortScore).toFixed(1)} / {MAX_SCORE}
          </Text>
        </Text>
      </View>
      <View style={styles.biasBar}>
        <View style={[styles.biasFillLong, { width: `${longPct}%` }]} />
        <View style={[styles.biasFillShort, { width: `${shortPct}%` }]} />
      </View>
      <View style={styles.biasFooter}>
        <Text style={[styles.biasFootText, { color: COLORS.bullish }]}>
          L {longScore.toFixed(1)}
        </Text>
        <Text style={[styles.biasFootText, { color: COLORS.bearish }]}>
          S {shortScore.toFixed(1)}
        </Text>
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
    backgroundColor: COLORS.accent,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  versionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: '#F0B90B18',
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.4,
  },
  versionPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
  },
  versionPillActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#F0B90B18',
  },
  versionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  versionPillTextActive: {
    color: COLORS.accent,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  scanBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    minWidth: 96,
    alignItems: 'center',
  },
  scanBtnDisabled: {
    opacity: 0.5,
  },
  scanBtnPressed: {
    opacity: 0.85,
  },
  scanBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.background,
  },
  scannedAt: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  banner: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: 2,
  },
  bannerActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(240, 185, 11, 0.1)',
  },
  bannerIdle: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '700',
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
  cardSkeleton: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 1,
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
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  rescoreRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  rescoreRingText: {
    fontSize: 28,
    fontWeight: '800',
  },
  scoreCol: {
    flex: 1,
    gap: 4,
  },
  scoreHint: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  macdSuppressedHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#E8C547',
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
  modeHint: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  lockedBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.accent,
  },
  biasWrap: {
    gap: 4,
    marginTop: 2,
  },
  biasHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  biasLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  biasValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  biasScore: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  biasBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceElevated,
  },
  biasFillLong: {
    height: '100%',
    backgroundColor: COLORS.bullish,
  },
  biasFillShort: {
    height: '100%',
    backgroundColor: COLORS.bearish,
  },
  biasFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  biasFootText: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  planWrap: {
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  planActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  planSecondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  planSecondaryText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  planPrimaryBtn: {
    flex: 1.4,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  planPrimaryBtnDisabled: {
    opacity: 0.45,
  },
  planPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#02110A',
  },
  planMarketBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  planMarketText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  skipSetupBtn: {
    marginTop: SPACING.xs,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  skipSetupBtnCompact: {
    marginTop: SPACING.sm,
    alignSelf: 'stretch',
  },
  skipSetupText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  noEntryBox: {
    backgroundColor: 'rgba(246, 70, 93, 0.06)',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(246, 70, 93, 0.3)',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: 2,
    gap: SPACING.sm,
  },
  noEntryText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  manualBtn: {
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.warning,
    alignItems: 'center',
  },
  manualBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.warning,
  },
  manualWrap: {
    gap: SPACING.sm,
  },
  manualWarn: {
    fontSize: 10,
    color: COLORS.warning,
    textAlign: 'center',
    lineHeight: 14,
  },
  manualRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  manualCancel: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  manualCancelText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  manualConfirm: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.warning,
    alignItems: 'center',
  },
  manualConfirmText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#02110A',
  },
  error: {
    fontSize: 11,
    color: COLORS.bearish,
    fontStyle: 'italic',
  },
  openBtn: {
    marginTop: SPACING.sm,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  openBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#02110A',
    letterSpacing: 0.4,
  },
  openTag: {
    marginTop: SPACING.sm,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  openTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    marginTop: 2,
  },
  detailToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailChevron: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
});

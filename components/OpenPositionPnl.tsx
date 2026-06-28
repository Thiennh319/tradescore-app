import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, type AppTradeSymbol, type TradePlan } from '../constants/scoring';
import { RADIUS, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import { evaluatePositionV2, type RecommendationType } from '../services/positionAdvisorV3';
import { computePositionMaxLossUSDT, evaluatePositionV4 } from '../services/positionAdvisorV4';
import type { ScorerVersion } from '../constants/scoring';
import type { SignalRow } from '../hooks/useSignalBoard';
import { scoringResultV3FromSignalRow } from '../services/signalRowView';
import { scoringResultV4ToLegacyV3 } from '../services/tradePlanV4';
import type { ScoringResultV3 } from '../services/scorerV3';
import { compareOpenLevels } from '../services/tradePlanOptimize';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import { useTradeStore } from '../store/useTradeStore';
import { formatUsdPrice, formatUsdt } from '../utils/formatPrice';
import { isPriceLevelHit } from '../utils/priceLevelHit';
import {
  computePositionPnl,
  formatSignedPercent,
  formatSignedUsdt,
} from '../utils/positionPnl';
import { PositionRecommendationWidget } from './PositionRecommendation';
import { TradeRecommendationTable, type ManualTradeSetup } from './TradeRecommendationTable';
import { TradeOptimizeHint } from './TradeOptimizeHint';

interface OpenPositionPnlProps {
  entry: StoredTradeJournalEntry;
  /** Giá mark hiện tại từ scan board */
  markPrice?: number | null;
  scanPlan?: TradePlan | null;
  /** Mở dialog xác nhận đóng lệnh (mark price) */
  onRequestClose?: () => void;
  /** Snapshot scan board — dùng để lấy scoring đúng engine V3/V4 */
  signalRow?: SignalRow | null;
  scorerVersion?: ScorerVersion;
  isRefreshing?: boolean;
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

function entryToPlan(entry: StoredTradeJournalEntry): TradePlan {
  const notional = entry.size * entry.leverage;
  return {
    direction: entry.direction,
    entryPrice: entry.entryPrice,
    stopLoss: entry.stopLoss ?? entry.entryPrice,
    takeProfit1: entry.takeProfit1 ?? entry.entryPrice,
    takeProfit2: entry.takeProfit2 ?? entry.entryPrice,
    takeProfit3: entry.takeProfit3 ?? entry.entryPrice,
    positionSize: notional,
    marginRequired: entry.size,
    notional,
    riskAmount: 0,
    atrMultiplier: 2,
    rrRatios: [1, 2, 3],
    notes: '',
    marketPrice: undefined,
  };
}

/** Khối PnL lệnh đang chạy — layout gọn kiểu Binance Futures. */
export function OpenPositionPnl({
  entry,
  markPrice,
  scanPlan = null,
  onRequestClose,
  signalRow = null,
  scorerVersion: scorerVersionProp,
  isRefreshing = false,
}: OpenPositionPnlProps) {
  const [editingLevels, setEditingLevels] = useState(false);
  const [editSetup, setEditSetup] = useState<ManualTradeSetup | null>(null);
  const updateJournalEntry = useTradeStore((s) => s.updateJournalEntry);
  const logPositionRecommendation = useTradeStore((s) => s.logPositionRecommendation);
  const markGracePeriodTriggered = useTradeStore((s) => s.markGracePeriodTriggered);
  const updatePositionLastFundingState = useTradeStore((s) => s.updatePositionLastFundingState);
  const updatePositionLastSqueezeRisk = useTradeStore((s) => s.updatePositionLastSqueezeRisk);
  const aiOpenTrade = useTradeStore((s) => {
    const matches = s.aiTradeJournal.filter(
      (t) =>
        t.symbol === entry.symbol &&
        t.scoring.direction === entry.direction &&
        t.outcome.status === 'OPEN' &&
        !t.archived,
    );
    return matches.sort((a, b) => b.timestamp - a.timestamp)[0];
  });
  const recommendationTradeId = aiOpenTrade?.id ?? null;
  const selectedSymbol = useTradeStore((s) => s.selectedSymbol);
  const storeScorerVersion = useTradeStore((s) => s.scorerVersion);
  const scorerVersion = scorerVersionProp ?? storeScorerVersion;
  const storeScoringV4 = useTradeStore((s) => s.scoringResultV4);
  const storeScoringV3 = useTradeStore((s) => s.scoringResultV3);
  const advisorScoring: ScoringResultV3 | null = useMemo(() => {
    if (signalRow) {
      return scoringResultV3FromSignalRow(signalRow, scorerVersion);
    }
    if (entry.symbol !== selectedSymbol) return null;
    if (scorerVersion === 'v4') {
      return storeScoringV4 ? scoringResultV4ToLegacyV3(storeScoringV4) : null;
    }
    return storeScoringV3;
  }, [signalRow, scorerVersion, entry.symbol, selectedSymbol, storeScoringV4, storeScoringV3]);
  const symbol = entry.symbol as AppTradeSymbol;
  const isLong = entry.direction === 'LONG';
  const dirColor = isLong ? COLORS.bullish : COLORS.bearish;
  const snapshot = computePositionPnl(entry, markPrice);
  const liveMark = snapshot.markPrice ?? markPrice ?? null;
  const currentPrice = liveMark;

  const calculateCurrentPnl = (
    current: number,
    entryPrice: number,
    direction: 'LONG' | 'SHORT',
  ) => {
    const size = entry.size ?? 6;
    const leverage = entry.leverage ?? 5;
    const units = (size * leverage) / entryPrice;
    const priceDiff = direction === 'LONG' ? current - entryPrice : entryPrice - current;
    return {
      pct: (priceDiff / entryPrice) * 100 * leverage,
      usdt: priceDiff * units,
    };
  };

  const currentFundingState = useMemo(() => {
    if (scorerVersion !== 'v4') return undefined;
    if (signalRow?.l6Detail) return signalRow.l6Detail.fundingState;
    if (entry.symbol === selectedSymbol && storeScoringV4?.l6Detail) {
      return storeScoringV4.l6Detail.fundingState;
    }
    return undefined;
  }, [scorerVersion, signalRow?.l6Detail, entry.symbol, selectedSymbol, storeScoringV4?.l6Detail]);

  const currentSqueezeRisk = useMemo(() => {
    if (signalRow?.squeezeRisk) return signalRow.squeezeRisk;
    if (entry.symbol === selectedSymbol && storeScoringV4?.squeezeRisk) {
      return storeScoringV4.squeezeRisk;
    }
    return undefined;
  }, [signalRow?.squeezeRisk, entry.symbol, selectedSymbol, storeScoringV4?.squeezeRisk]);

  const recommendation = useMemo(() => {
    if (!entry || !advisorScoring || currentPrice == null) return null;
    const ownScore =
      entry.direction === 'LONG' ? advisorScoring.long : advisorScoring.short;
    const oppositeScore =
      entry.direction === 'LONG' ? advisorScoring.short : advisorScoring.long;
    const pnl = calculateCurrentPnl(currentPrice, entry.entryPrice, entry.direction);
    const sl = entry.stopLoss ?? entry.entryPrice;
    const positionPayload = {
      direction: entry.direction,
      entryPrice: entry.entryPrice,
      sl,
      tp1: entry.takeProfit1 ?? entry.entryPrice,
      tp2: entry.takeProfit2 ?? entry.entryPrice,
      tp3: entry.takeProfit3 ?? entry.entryPrice,
      openedAt: entry.entryTime,
      openTime: entry.entryTime,
      currentPnlPct: pnl.pct,
      currentPnlUSDT: pnl.usdt,
      lastFundingState: aiOpenTrade?.lastFundingState,
      lastSqueezeRiskLevel: aiOpenTrade?.lastSqueezeRiskLevel,
      lastSqueezeRiskDirection: aiOpenTrade?.lastSqueezeRiskDirection,
      maxLossUSDT: computePositionMaxLossUSDT(
        entry.entryPrice,
        sl,
        entry.size,
        entry.leverage,
      ),
    };
    const advisorInput = {
      position: positionPayload,
      currentPrice,
      ownDirectionScore: {
        totalScore: ownScore.totalScore,
        direction: entry.direction,
        groupScores: ownScore.groupScores,
        decision: ownScore.decision,
        hardBlocks: ownScore.hardBlocks,
        groupBlocks: ownScore.groupBlocks,
        warnings: ownScore.warnings,
        layers: ownScore.layers.map((l) => ({
          layerNumber: l.layerNumber,
          score: l.score,
          reason: l.reason,
        })),
      },
      oppositeDirectionScore: {
        totalScore: oppositeScore.totalScore,
        decision: oppositeScore.decision,
        hardBlocks: oppositeScore.hardBlocks,
      },
      marketMode: advisorScoring.marketMode,
    };
    const advisorExtras = {
      atr1h: signalRow?.atr1h ?? advisorScoring.atr1h,
    };
    if (scorerVersion === 'v4') {
      return evaluatePositionV4({
        ...advisorInput,
        ...advisorExtras,
        currentFundingState,
        currentSqueezeRisk,
      });
    }
    return evaluatePositionV2({
      ...advisorInput,
      ...advisorExtras,
    });
  }, [
    entry,
    advisorScoring,
    currentPrice,
    scorerVersion,
    signalRow?.atr1h,
    aiOpenTrade?.lastFundingState,
    aiOpenTrade?.lastSqueezeRiskLevel,
    aiOpenTrade?.lastSqueezeRiskDirection,
    currentFundingState,
    currentSqueezeRisk,
  ]);

  const ownDirectionScore = useMemo(() => {
    if (!advisorScoring) return null;
    return entry.direction === 'LONG' ? advisorScoring.long : advisorScoring.short;
  }, [entry.direction, advisorScoring]);

  const buildRecommendationLogPayload = () => {
    if (!recommendation || !ownDirectionScore || currentPrice == null || !recommendationTradeId) {
      return null;
    }
    const pnl = calculateCurrentPnl(currentPrice, entry.entryPrice, entry.direction);
    return {
      tradeId: recommendationTradeId,
      timestamp: Date.now(),
      type: recommendation.type,
      label: recommendation.label,
      urgency: recommendation.urgency,
      confidence: recommendation.confidence,
      triggeredBy: recommendation.triggeredBy,
      scoreSnapshot: {
        totalScore: ownDirectionScore.totalScore,
        groupScores: ownDirectionScore.groupScores,
      },
      priceAtLog: currentPrice,
      pnlUSDTAtLog: pnl.usdt,
    };
  };

  useEffect(() => {
    const payload = buildRecommendationLogPayload();
    if (!payload) return;
    void logPositionRecommendation(payload);
  }, [recommendation?.urgency, recommendation?.type, recommendationTradeId]);

  useEffect(() => {
    if (
      !recommendationTradeId ||
      !recommendation?.gracePeriodActive ||
      !recommendation.graceSuppressedRules?.length
    ) {
      return;
    }
    void markGracePeriodTriggered(recommendationTradeId);
  }, [
    recommendation?.gracePeriodActive,
    recommendation?.graceSuppressedRules,
    recommendationTradeId,
    markGracePeriodTriggered,
  ]);

  useEffect(() => {
    if (!recommendationTradeId || currentFundingState == null) return;
    void updatePositionLastFundingState(recommendationTradeId, currentFundingState);
  }, [recommendationTradeId, currentFundingState, updatePositionLastFundingState]);

  useEffect(() => {
    if (!recommendationTradeId || !currentSqueezeRisk) return;
    void updatePositionLastSqueezeRisk(
      recommendationTradeId,
      currentSqueezeRisk.level,
      currentSqueezeRisk.direction,
    );
  }, [recommendationTradeId, currentSqueezeRisk, updatePositionLastSqueezeRisk]);

  const logUserInteraction = () => {
    const payload = buildRecommendationLogPayload();
    if (!payload) return;
    void logPositionRecommendation(payload, true);
  };

  const canRequestClose = onRequestClose != null && liveMark != null && Number.isFinite(liveMark);

  const openCloseConfirmModal = () => {
    if (!canRequestClose) return;
    onRequestClose?.();
  };

  const openMoveSLModal = (breakeven: number) => {
    setEditSetup({
      entryPrice: entry.entryPrice,
      stopLoss: breakeven,
      takeProfit1: entry.takeProfit1 ?? entry.entryPrice,
      takeProfit2: entry.takeProfit2 ?? entry.entryPrice,
      takeProfit3: entry.takeProfit3 ?? entry.entryPrice,
      marginUsdt: entry.size,
      leverage: entry.leverage,
    });
    setEditingLevels(true);
  };

  const openPartialCloseModal = (type: RecommendationType) => {
    const label =
      type === 'PARTIAL_CLOSE_30'
        ? 'Chốt 30%'
        : type === 'PARTIAL_TP2'
          ? 'Chốt thêm 30%'
          : 'Chốt 50%';
    Alert.alert(
      label,
      'Chốt một phần sẽ được hỗ trợ đầy đủ trong bản cập nhật tiếp theo.',
    );
  };

  const handleRecommendationAction = (type: RecommendationType) => {
    logUserInteraction();
    switch (type) {
      case 'PARTIAL_TP1':
      case 'PARTIAL_TP2':
      case 'PARTIAL_CLOSE_30':
        openPartialCloseModal(type);
        break;
      case 'CLOSE_NOW':
      case 'CLOSE_URGENT':
      case 'CLOSE_REVERSE':
        openCloseConfirmModal();
        break;
      case 'HOLD_MOVE_SL':
        openMoveSLModal(entry.entryPrice);
        break;
    }
  };
  const pnlColor =
    snapshot.pnlUsdt == null
      ? COLORS.textMuted
      : snapshot.pnlUsdt >= 0
        ? COLORS.bullish
        : COLORS.bearish;

  const levelsOptimize = compareOpenLevels(entry, scanPlan);
  const levelDetail =
    levelsOptimize?.improvements
      .map((i) => `${i.label}: ${formatUsdPrice(symbol, i.current)} → ${formatUsdPrice(symbol, i.suggested)}`)
      .join(' · ') ?? '';

  const saveLevels = async () => {
    if (!entry.id || !editSetup) return;
    await updateJournalEntry(entry.id, {
      stopLoss: editSetup.stopLoss,
      takeProfit1: editSetup.takeProfit1,
      takeProfit2: editSetup.takeProfit2,
      takeProfit3: editSetup.takeProfit3,
    });
    setEditingLevels(false);
    setEditSetup(null);
  };

  return (
    <View style={[styles.wrap, { borderColor: pnlColor }]}>
      <View style={styles.headRow}>
        <Text style={styles.headLabel}>{vi.signalBoard.runningPosition}</Text>
        <View style={styles.headRight}>
          <View style={[styles.dirBadge, { backgroundColor: `${dirColor}22`, borderColor: dirColor }]}>
            <Text style={[styles.dirText, { color: dirColor }]}>
              {isLong ? vi.activePosition.long : vi.activePosition.short} · {entry.leverage}x
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.pnlRow}>
        <View style={styles.pnlMain}>
          <Text style={styles.pnlCaption}>{vi.signalBoard.unrealizedPnl}</Text>
          <Text style={[styles.pnlUsdt, { color: pnlColor }]}>
            {formatSignedUsdt(snapshot.pnlUsdt)}
          </Text>
          <Text style={[styles.pnlPct, { color: pnlColor }]}>
            {formatSignedPercent(snapshot.pnlPercent)} {vi.signalBoard.roe}
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <Metric label={vi.activePosition.entry} value={formatUsdPrice(symbol, entry.entryPrice)} />
        <Metric
          label={vi.signalBoard.markPrice}
          value={liveMark != null ? formatUsdPrice(symbol, liveMark) : '—'}
        />
        <Metric
          label={vi.signalBoard.margin}
          value={entry.size > 0 ? `$${formatUsdt(entry.size)}` : '—'}
        />
        <Metric
          label={vi.signalBoard.notional}
          value={
            snapshot.notionalUsdt != null ? `$${formatUsdt(snapshot.notionalUsdt)}` : '—'
          }
        />
        {entry.size > 0 && entry.leverage > 0 && snapshot.notionalUsdt != null ? (
          <Text style={styles.formulaText}>
            {vi.signalBoard.marginSizeFormula(
              `$${formatUsdt(entry.size)}`,
              entry.leverage,
              `$${formatUsdt(snapshot.notionalUsdt)}`,
            )}
          </Text>
        ) : null}
      </View>

      {recommendation ? (
        <PositionRecommendationWidget
          recommendation={recommendation}
          onAction={handleRecommendationAction}
          onUserView={logUserInteraction}
          isLoading={isRefreshing}
        />
      ) : null}

      <View style={styles.levelsWrap}>
        <Text style={styles.levelsTitle}>{vi.activePosition.levelsTitle}</Text>
        <View style={styles.levelsRow}>
          <LevelChip
            label={vi.activePosition.stopLoss}
            value={entry.stopLoss}
            symbol={symbol}
            hit={
              liveMark != null &&
              entry.stopLoss != null &&
              isPriceLevelHit(entry.direction, liveMark, entry.stopLoss, 'SL')
            }
            color={COLORS.bearish}
          />
          <LevelChip
            label={vi.activePosition.takeProfit(1)}
            value={entry.takeProfit1}
            symbol={symbol}
            hit={
              liveMark != null &&
              entry.takeProfit1 != null &&
              isPriceLevelHit(entry.direction, liveMark, entry.takeProfit1, 'TP1')
            }
            color={COLORS.bullish}
          />
          <LevelChip
            label={vi.activePosition.takeProfit(2)}
            value={entry.takeProfit2}
            symbol={symbol}
            hit={
              liveMark != null &&
              entry.takeProfit2 != null &&
              isPriceLevelHit(entry.direction, liveMark, entry.takeProfit2, 'TP2')
            }
            color={COLORS.bullish}
          />
          <LevelChip
            label={vi.activePosition.takeProfit(3)}
            value={entry.takeProfit3}
            symbol={symbol}
            hit={
              liveMark != null &&
              entry.takeProfit3 != null &&
              isPriceLevelHit(entry.direction, liveMark, entry.takeProfit3, 'TP3')
            }
            color={COLORS.bullishMuted}
          />
        </View>
      </View>

      {!editingLevels && levelsOptimize ? (
        <TradeOptimizeHint
          summary={levelsOptimize.summary}
          detail={levelDetail}
          applyLabel={vi.optimize.applyLevels}
          onApply={() => {
            if (!entry.id) return;
            void updateJournalEntry(entry.id, levelsOptimize.patch);
          }}
          onEdit={() => {
            setEditingLevels(true);
            setEditSetup(null);
          }}
        />
      ) : null}

      {editingLevels ? (
        <View style={styles.editBox}>
          <Text style={styles.editTitle}>{vi.activePosition.editLevels}</Text>
          <TradeRecommendationTable
            symbol={symbol}
            direction={entry.direction}
            plan={entryToPlan(entry)}
            defaultMargin={entry.size}
            defaultLeverage={entry.leverage}
            initialShowDetail
            onSetupChange={setEditSetup}
          />
          <View style={styles.editActions}>
            <Pressable
              onPress={() => {
                setEditingLevels(false);
                setEditSetup(null);
              }}
              style={[styles.editBtn, styles.editBtnMuted, webPointer]}
            >
              <Text style={styles.editBtnMutedText}>{vi.activePosition.stopCancel}</Text>
            </Pressable>
            <Pressable
              disabled={!editSetup}
              onPress={() => void saveLevels()}
              style={[
                styles.editBtn,
                styles.editBtnSave,
                !editSetup && styles.editBtnDisabled,
                webPointer,
              ]}
            >
              <Text style={styles.editBtnSaveText}>{vi.activePosition.saveLevels}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {onRequestClose ? (
        <Pressable
          onPress={() => {
            if (!canRequestClose) return;
            onRequestClose();
          }}
          disabled={!canRequestClose}
          style={[styles.stopBtn, !canRequestClose && styles.stopConfirmBtnDisabled, webPointer]}
        >
          <Text style={styles.stopBtnText}>{vi.activePosition.stopOrder}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function LevelChip({
  label,
  value,
  symbol,
  hit,
  color,
}: {
  label: string;
  value?: number;
  symbol: AppTradeSymbol;
  hit: boolean;
  color: string;
}) {
  return (
    <View style={[styles.levelChip, hit && { borderColor: color, backgroundColor: `${color}18` }]}>
      <Text style={styles.levelChipLabel}>{label}</Text>
      <Text style={[styles.levelChipValue, hit && { color }]}>
        {value != null ? formatUsdPrice(symbol, value) : '—'}
        {hit ? ' ✓' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    gap: SPACING.sm,
    marginTop: 2,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexShrink: 1,
  },
  headLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dirBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  dirText: {
    fontSize: 10,
    fontWeight: '800',
  },
  pnlRow: {
    paddingVertical: 2,
  },
  pnlMain: {
    gap: 2,
  },
  pnlCaption: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pnlUsdt: {
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  pnlPct: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  formulaText: {
    flexBasis: '100%',
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  metric: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    gap: 2,
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  adviseCell: {
    flexBasis: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    gap: SPACING.sm,
  },
  adviseVal: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  levelsWrap: {
    gap: 4,
  },
  levelsTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  levelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  levelChip: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    gap: 2,
  },
  levelChipLabel: {
    fontSize: 8,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  levelChipValue: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  stopBtn: {
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.bearish,
    backgroundColor: 'rgba(246, 70, 93, 0.12)',
    alignItems: 'center',
  },
  stopBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.bearish,
    letterSpacing: 0.3,
  },
  stopConfirmBox: {
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.bearish,
    backgroundColor: 'rgba(246, 70, 93, 0.08)',
  },
  stopConfirmText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stopConfirmPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stopConfirmRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  stopCancelBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  stopCancelText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  stopConfirmBtn: {
    flex: 1.2,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bearish,
    alignItems: 'center',
  },
  stopConfirmBtnDisabled: {
    opacity: 0.45,
  },
  stopConfirmBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  editBox: {
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.background,
  },
  editTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent,
    textTransform: 'uppercase',
  },
  editActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  editBtnMuted: {
    borderColor: COLORS.border,
  },
  editBtnMutedText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  editBtnSave: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  editBtnDisabled: {
    opacity: 0.45,
  },
  editBtnSaveText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.background,
  },
});

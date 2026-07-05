import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  COLORS,
  HARD_BLOCK_RULES_V4,
  TRADE_PLAN_V3_CONFIG,
  type AppTradeSymbol,
  type LayerResult,
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
import { AdxMarketRegimeSection } from './AdxMarketRegimeSection';
import { StructureSLSection } from './StructureSLSection';
import { VWAPSection } from './VWAPSection';
import { LayerCard } from '../LayerCard';
import { ScoreRing } from '../ScoreRing';
import { TradeRecommendationTable, type ManualTradeSetup } from '../TradeRecommendationTable';
import { TradePlanV3View } from '../TradePlanV3View';
import { useTradeStore } from '../../store/useTradeStore';
import type { useLockedPlanMonitor } from '../../hooks/useLockedPlanMonitor';
import type { LockedTradePlan } from '../../constants/aiJournal';
import { GRACE_ATR_MULTIPLIER, resolveGraceAtr } from '../../services/gracePeriod';
import {
  explainBlocks,
  explainEntry,
  explainSL,
  explainTP,
} from '../../services/tradePlanExplainer';
import { TradePlanModal } from './TradePlanModal';
import { formatUsdPrice } from '../../utils/formatPrice';

const CARD_DANGER = '#EF4444';
const CARD_SUCCESS = '#22C55E';
const CARD_WARNING = '#F59E0B';
const CARD_MUTED = '#6B7280';

type LockedPlanMonitorState = ReturnType<typeof useLockedPlanMonitor>;

type SignalRowWithDirSnapshots = SignalRow & {
  longSnapshot?: { canEnter?: boolean };
  shortSnapshot?: { canEnter?: boolean };
};

function resolvePlanForDirection(
  row: SignalRow,
  direction: TradeDirection,
): TradePlanV3 | null {
  const v4 = row.tradePlansByScorer?.v4;
  if (v4?.direction === direction) return v4;
  const v3 = row.tradePlansByScorer?.v3;
  if (v3?.direction === direction) return v3;
  if (row.tradePlanV3?.direction === direction) return row.tradePlanV3;
  return null;
}

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
  onRecordSkippedSetup?: (row: SignalRow, setupDirection?: TradeDirection) => void;
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
const AMBIGUOUS_BORDER_COLOR = '#D97706';
const BIAS_NEUTRAL_COLOR = '#9CA3AF';
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

type CardBadgeKind =
  | 'HARD_BLOCK'
  | 'PARTIAL_BLOCK'
  | 'UNCLEAR'
  | 'BAD_SESSION'
  | 'READY'
  | 'WATCH';

type CardBadgeDisplay = {
  kind: CardBadgeKind;
  text: string;
  backgroundColor: string;
};

function layer9Score(layers: LayerResult[]): number | null {
  const l9 = layers.find((l) => l.layer === 9);
  return l9 != null ? l9.score : null;
}

function sessionLabelFromL9(l9Score: number | null): string {
  if (l9Score == null) return '—';
  if (l9Score === 0) return 'Xấu';
  if (l9Score === 1) return 'Bình thường';
  if (l9Score >= 2) return 'London';
  if (Math.abs(l9Score - 1.5) < 0.01) return 'NY';
  return 'Bình thường';
}

const SCORE_TOTAL_GREEN = '#22C55E';
const SCORE_TOTAL_GREEN_LIGHT = '#86EFAC';
const SCORE_TOTAL_YELLOW = '#FCD34D';
const SCORE_TOTAL_ORANGE = '#F97316';
const SCORE_TOTAL_RED = '#EF4444';
const SCORE_DIR_LONG_ACTIVE = '#22C55E';
const SCORE_DIR_SHORT_ACTIVE = '#EF4444';

function totalScoreDisplayColor(score: number): string {
  if (score >= 11.5) return SCORE_TOTAL_GREEN;
  if (score >= 10) return SCORE_TOTAL_GREEN_LIGHT;
  if (score >= 9) return SCORE_TOTAL_YELLOW;
  if (score >= 8) return SCORE_TOTAL_ORANGE;
  return SCORE_TOTAL_RED;
}

function btcTier2Color(btcChange: number): string {
  if (Math.abs(btcChange) < 0.5) return COLORS.textMuted;
  if (btcChange > 0) return SCORE_DIR_LONG_ACTIVE;
  return SCORE_DIR_SHORT_ACTIVE;
}

function shortenBlockReason(reason: string): string {
  return reason.replace(/^❌\s*/, '').replace(/^⛔\s*/, '').trim();
}

function formatBtcChangePct(btcChange24h: number): string {
  return `${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(1)}%`;
}

function sideHardBlocks(
  direction: TradeDirection,
  snap: ReturnType<typeof resolveSignalRow>,
): string[] {
  return direction === 'LONG'
    ? (snap.longHardBlocks ?? [])
    : (snap.shortHardBlocks ?? []);
}

function isSideHardBlockedForBadge(
  direction: TradeDirection,
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  btcChange24h: number,
): boolean {
  if (sideHardBlocks(direction, snap).length > 0) return true;
  if (row.adxGate?.block) return true;
  if (Math.abs(btcChange24h) > HARD_BLOCK_RULES_V4.BTC_EXTREME_PCT) return true;
  if (
    direction === 'LONG' &&
    btcChange24h <= HARD_BLOCK_RULES_V4.BTC_LONG_BLOCK_PCT
  ) {
    return true;
  }
  if (
    direction === 'SHORT' &&
    btcChange24h >= HARD_BLOCK_RULES_V4.BTC_SHORT_BLOCK_PCT
  ) {
    return true;
  }
  return false;
}

function resolveDirectionCanEnter(
  row: SignalRow,
  direction: TradeDirection,
  snap: ReturnType<typeof resolveSignalRow>,
  btcChange24h: number,
): boolean {
  const snaps = row as SignalRowWithDirSnapshots;
  const snapshot =
    direction === 'LONG' ? snaps.longSnapshot : snaps.shortSnapshot;
  if (snapshot?.canEnter != null) return snapshot.canEnter;

  const score = direction === 'LONG' ? snap.longScore : snap.shortScore;
  if (score < 9) return false;
  return !isSideHardBlockedForBadge(direction, row, snap, btcChange24h);
}

function primaryBlockReasonForDirection(
  direction: TradeDirection,
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  blockReasons: string[],
  btcChange24h: number,
): string {
  const sideBlocks = sideHardBlocks(direction, snap);
  if (sideBlocks.length > 0) {
    return shortenBlockReason(sideBlocks[0]);
  }

  if (row.adxGate?.block) {
    return shortenBlockReason(
      row.adxGate.message || row.adxBlockReason || 'Thị trường CHOPPY',
    );
  }

  if (Math.abs(btcChange24h) > HARD_BLOCK_RULES_V4.BTC_EXTREME_PCT) {
    return `BTC ${formatBtcChangePct(btcChange24h)}`;
  }
  if (
    direction === 'SHORT' &&
    btcChange24h >= HARD_BLOCK_RULES_V4.BTC_SHORT_BLOCK_PCT
  ) {
    return 'BTC tăng mạnh';
  }
  if (
    direction === 'LONG' &&
    btcChange24h <= HARD_BLOCK_RULES_V4.BTC_LONG_BLOCK_PCT
  ) {
    return 'BTC giảm mạnh';
  }

  const lines = [
    ...blockReasons,
    ...(snap.longHardBlocks ?? []),
    ...(snap.shortHardBlocks ?? []),
    ...(snap.mandatoryViolations ?? []),
  ];

  const fundingDir = resolveFundingBlockDirection(lines);
  if (fundingDir === direction) return 'Funding cực đoan';
  if (hasCvdHardBlock(lines)) return 'CVD phân kỳ ngược chiều';
  if (hasMacdHardBlock(lines)) return 'MACD vi phạm';

  const btcReason = blockReasons.find((r) => /BTC/i.test(r));
  if (btcReason) return shortenBlockReason(btcReason);

  return shortenBlockReason(lines[0] ?? 'Điều kiện chặn vào lệnh');
}

function resolveFundingBlockDirection(lines: string[]): TradeDirection | null {
  const isFunding = (r: string) => /Funding/i.test(r);
  const blocksLong = lines.some(
    (r) => isFunding(r) && (/chặn Long/i.test(r) || /LONG SQUEEZE/i.test(r)),
  );
  const blocksShort = lines.some(
    (r) => isFunding(r) && (/chặn Short/i.test(r) || /SHORT SQUEEZE/i.test(r)),
  );
  if (blocksLong) return 'LONG';
  if (blocksShort) return 'SHORT';
  return null;
}

function hasCvdHardBlock(lines: string[]): boolean {
  return lines.some(
    (r) =>
      /CVD/i.test(r) &&
      (/HARD BLOCK/i.test(r) || /chặn/i.test(r) || /phân kỳ/i.test(r)),
  );
}

function hasMacdHardBlock(lines: string[]): boolean {
  return lines.some(
    (r) => r.startsWith('L3 MACD vi phạm') || /MACD vi phạm/i.test(r),
  );
}

function formatBothBlockedBadgeText(
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  blockReasons: string[],
  btcChange24h: number,
  longCanEnter: boolean,
  shortCanEnter: boolean,
): string {
  if (row.adxGate?.block) {
    return '🔴 BLOCK CẢ HAI — Thị trường CHOPPY';
  }

  if (Math.abs(btcChange24h) > HARD_BLOCK_RULES_V4.BTC_EXTREME_PCT) {
    return `🔴 BLOCK CẢ HAI — BTC ${formatBtcChangePct(btcChange24h)}`;
  }

  const lines = [
    ...blockReasons,
    ...(snap.longHardBlocks ?? []),
    ...(snap.shortHardBlocks ?? []),
    ...(snap.mandatoryViolations ?? []),
  ];
  if (hasCvdHardBlock(lines)) {
    return '🔴 BLOCK CẢ HAI — CVD phân kỳ ngược chiều';
  }
  if (hasMacdHardBlock(lines)) {
    return '🔴 BLOCK CẢ HAI — MACD vi phạm';
  }

  if (!longCanEnter && shortCanEnter) {
    const reason = primaryBlockReasonForDirection(
      'LONG',
      row,
      snap,
      blockReasons,
      btcChange24h,
    );
    return `🔴 BLOCK LONG — ${reason}`;
  }
  if (!shortCanEnter && longCanEnter) {
    const reason = primaryBlockReasonForDirection(
      'SHORT',
      row,
      snap,
      blockReasons,
      btcChange24h,
    );
    return `🔴 BLOCK SHORT — ${reason}`;
  }

  const mainReason = primaryBlockReasonForDirection(
    snap.direction,
    row,
    snap,
    blockReasons,
    btcChange24h,
  );
  return `🔴 BLOCK CẢ HAI — ${mainReason}`;
}

function formatPartialBlockBadgeText(
  blockedDirection: TradeDirection,
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  blockReasons: string[],
  btcChange24h: number,
): string {
  if (
    blockedDirection === 'SHORT' &&
    btcChange24h >= HARD_BLOCK_RULES_V4.BTC_SHORT_BLOCK_PCT
  ) {
    return '🟡 BLOCK SHORT — BTC tăng mạnh';
  }
  if (
    blockedDirection === 'LONG' &&
    btcChange24h <= HARD_BLOCK_RULES_V4.BTC_LONG_BLOCK_PCT
  ) {
    return '🟡 BLOCK LONG — BTC giảm mạnh';
  }

  const reason = primaryBlockReasonForDirection(
    blockedDirection,
    row,
    snap,
    blockReasons,
    btcChange24h,
  );
  return `🟡 BLOCK ${blockedDirection} — ${reason}`;
}

function hasAnyHardBlock(
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  blockReasons: string[],
): boolean {
  return (
    row.adxGate?.block === true ||
    snap.hardBlocked === true ||
    blockReasons.length > 0
  );
}

function resolveCardBadge(
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  totalScore: number,
  blockReasons: string[],
  btcChange24h: number,
): CardBadgeDisplay {
  const longCanEnter = resolveDirectionCanEnter(row, 'LONG', snap, btcChange24h);
  const shortCanEnter = resolveDirectionCanEnter(row, 'SHORT', snap, btcChange24h);
  const longHard = isSideHardBlockedForBadge('LONG', row, snap, btcChange24h);
  const shortHard = isSideHardBlockedForBadge('SHORT', row, snap, btcChange24h);

  // [1] Đỏ — cả 2 chiều bị block
  if (
    (longHard && shortHard) ||
    (!longCanEnter && !shortCanEnter && (longHard || shortHard))
  ) {
    return {
      kind: 'HARD_BLOCK',
      text: formatBothBlockedBadgeText(
        row,
        snap,
        blockReasons,
        btcChange24h,
        longCanEnter,
        shortCanEnter,
      ),
      backgroundColor: CARD_DANGER,
    };
  }

  // [2] Vàng — chỉ 1 chiều bị block, chiều kia ok
  if (longHard && !shortHard && shortCanEnter) {
    return {
      kind: 'PARTIAL_BLOCK',
      text: formatPartialBlockBadgeText(
        'LONG',
        row,
        snap,
        blockReasons,
        btcChange24h,
      ),
      backgroundColor: CARD_WARNING,
    };
  }
  if (shortHard && !longHard && longCanEnter) {
    return {
      kind: 'PARTIAL_BLOCK',
      text: formatPartialBlockBadgeText(
        'SHORT',
        row,
        snap,
        blockReasons,
        btcChange24h,
      ),
      backgroundColor: CARD_WARNING,
    };
  }

  // [3] Vàng — ADX CHOPPY
  if (row.adxData?.regime === 'CHOPPY') {
    return {
      kind: 'UNCLEAR',
      text: '🟡 THỊ TRƯỜNG CHOPPY — chờ xu hướng rõ',
      backgroundColor: CARD_WARNING,
    };
  }

  // [4] Vàng — phiên xấu
  const l9 = layer9Score(snap.layers);
  if (l9 === 0) {
    return {
      kind: 'BAD_SESSION',
      text: '🟡 PHIÊN XẤU — chờ 08:00 AM',
      backgroundColor: CARD_WARNING,
    };
  }

  // [5] Xanh — score ≥ 9, không block
  if (longCanEnter || shortCanEnter || totalScore >= 9) {
    return {
      kind: 'READY',
      text: '🟢 SẴN SÀNG',
      backgroundColor: CARD_SUCCESS,
    };
  }

  // [6] Xám — còn lại
  return {
    kind: 'WATCH',
    text: '⚪ THEO DÕI THÊM',
    backgroundColor: CARD_MUTED,
  };
}

function btcSummaryDisplay(btcChange: number): { color: string; icon: string } {
  if (Math.abs(btcChange) < 0.5) {
    return { color: COLORS.textSecondary, icon: '⚠️' };
  }
  if (btcChange > 0) {
    return { color: COLORS.success, icon: '✅' };
  }
  return { color: COLORS.danger, icon: '❌' };
}

function isDirectionBlocked(
  direction: TradeDirection,
  row: SignalRow,
  snap: ReturnType<typeof resolveSignalRow>,
  blockReasons: string[],
): boolean {
  if (hasAnyHardBlock(row, snap, blockReasons)) return true;
  const sideBlocks =
    direction === 'LONG'
      ? (snap.longHardBlocks ?? [])
      : (snap.shortHardBlocks ?? []);
  return sideBlocks.length > 0;
}

function isDirectionReady(
  direction: TradeDirection,
  snap: ReturnType<typeof resolveSignalRow>,
  row: SignalRow,
  blockReasons: string[],
): boolean {
  const score = direction === 'LONG' ? snap.longScore : snap.shortScore;
  return score >= 9 && !isDirectionBlocked(direction, row, snap, blockReasons);
}

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
                  btcChange24h={
                    rows.find((r) => r.symbol === 'BTCUSDT')?.change24h ?? 0
                  }
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
  btcChange24h,
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
  btcChange24h: number;
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
  onRecordSkippedSetup?: (row: SignalRow, setupDirection?: TradeDirection) => void;
}) {
  const [showLayers, setShowLayers] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const [manualSetup, setManualSetup] = useState<ManualTradeSetup | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalDir, setModalDir] = useState<TradeDirection>('LONG');

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
  const adxBlocked = row.adxGate?.block === true;
  let displayFinalEntryStatus =
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
  if (adxBlocked) {
    displayFinalEntryStatus = FinalEntryStatus.HARD_BLOCKED;
  }
  const showMacdSuppressedHint =
    macdSuppressed && displayFinalEntryStatus !== FinalEntryStatus.HARD_BLOCKED;
  const entryDisplay = resolveFinalEntryDisplay({
    status: displayFinalEntryStatus,
    scoringDecision: displayDecisionLabel,
    score: displayScore,
    plan: activePlanV3,
    symbol: row.symbol,
    hardBlockReasons: adxBlocked
      ? [row.adxGate?.message ?? row.adxBlockReason ?? 'ADX_CHOPPY', ...hardBlockReasons]
      : hardBlockReasons,
    groupBlockReasons: snap.groupBlocks ?? [],
  });
  const isAmbiguous = snap.isAmbiguousDirection === true;
  const cardBorderColor = isAmbiguous ? AMBIGUOUS_BORDER_COLOR : entryDisplay.borderColor;
  const trend = trendMeta(row.trend);
  const changeColor = row.change24h >= 0 ? COLORS.bullish : COLORS.bearish;
  const isTrending = snap.marketMode === 'TRENDING';
  const hasLegacyPlan = row.tradePlan != null;
  const hasPlan = activePlanV3 != null || hasLegacyPlan;
  const canShowPlan = hasPlan || snap.canEnter;
  const effectiveHardBlocked =
    displayFinalEntryStatus === FinalEntryStatus.HARD_BLOCKED;
  const finalDecision = adxBlocked
    ? ('HARD_BLOCK' as const)
    : resolveFinalEntryDecision({
        decisionLabel: displayDecisionLabel,
        hardBlocked: effectiveHardBlocked,
        awaitingRescore: snap.awaitingRescore,
      });
  const adxGate = row.adxGate;
  const planBlockReasons = activePlanV3?.blockReasons ?? [];
  const blockReasons = [...new Set([...hardBlockReasons, ...planBlockReasons])];
  const totalScore = displayScore ?? snap.score ?? 0;
  const cardBadge = resolveCardBadge(row, snap, totalScore, blockReasons, btcChange24h);
  const sessionLabel = sessionLabelFromL9(layer9Score(snap.layers));
  const btcPctLabel = `${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(1)}%`;
  const btcDisplay = btcSummaryDisplay(btcChange24h);
  const longReady = isDirectionReady('LONG', snap, row, blockReasons);
  const shortReady = isDirectionReady('SHORT', snap, row, blockReasons);

  const rowWithSnapshots = row as SignalRowWithDirSnapshots;
  const longScoreActive =
    snap.longScore >= 9 && rowWithSnapshots.longSnapshot?.canEnter === true;
  const shortScoreActive =
    snap.shortScore >= 9 && rowWithSnapshots.shortSnapshot?.canEnter === true;
  const totalScoreValue = displayScore ?? snap.score;
  const totalScoreColor =
    totalScoreValue != null
      ? totalScoreDisplayColor(totalScoreValue)
      : COLORS.textMuted;

  return (
    <View style={[styles.card, { borderColor: COLORS.border }]}>
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
          <View
            style={[styles.statusBadgeBox, { backgroundColor: cardBadge.backgroundColor }]}
          >
            <Text style={styles.statusBadgeTitle}>{cardBadge.text}</Text>
          </View>

          <View style={styles.scoreTier1Row}>
            <View style={styles.scoreTotalCol}>
              <Text style={[styles.scoreTotalValue, { color: totalScoreColor }]}>
                {totalScoreValue != null ? totalScoreValue.toFixed(1) : '—'}
              </Text>
              <Text style={styles.scoreTotalDenom}>/15</Text>
            </View>

            <View style={styles.scoreDirCol}>
              <Text style={styles.scoreDirLabel}>LONG</Text>
              <Text
                style={[
                  styles.scoreDirValue,
                  {
                    color: longScoreActive
                      ? SCORE_DIR_LONG_ACTIVE
                      : COLORS.textMuted,
                  },
                ]}
              >
                {snap.longScore.toFixed(1)}
              </Text>
            </View>

            <View style={styles.scoreDirCol}>
              <Text style={styles.scoreDirLabel}>SHORT</Text>
              <Text
                style={[
                  styles.scoreDirValue,
                  {
                    color: shortScoreActive
                      ? SCORE_DIR_SHORT_ACTIVE
                      : COLORS.textMuted,
                  },
                ]}
              >
                {snap.shortScore.toFixed(1)}
              </Text>
            </View>
          </View>

          <View style={styles.scoreTier2Row}>
            <Text style={styles.scoreTier2Text}>Phiên: {sessionLabel}</Text>
            <Text
              style={[
                styles.scoreTier2Text,
                { color: btcTier2Color(btcChange24h) },
              ]}
            >
              BTC: {btcPctLabel} {btcDisplay.icon}
            </Text>
          </View>

          <View style={styles.directionBtnRow}>
            <Pressable
              onPress={() => {
                setModalDir('LONG');
                setModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.directionBtn,
                longReady ? styles.directionBtnLongReady : styles.directionBtnIdle,
                pressed && styles.scanBtnPressed,
                webPointer,
              ]}
            >
              <Text
                style={[
                  styles.directionBtnText,
                  longReady ? styles.directionBtnTextReady : styles.directionBtnTextIdle,
                ]}
              >
                LONG  {snap.longScore.toFixed(1)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setModalDir('SHORT');
                setModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.directionBtn,
                shortReady ? styles.directionBtnShortReady : styles.directionBtnIdle,
                pressed && styles.scanBtnPressed,
                webPointer,
              ]}
            >
              <Text
                style={[
                  styles.directionBtnText,
                  shortReady ? styles.directionBtnTextReady : styles.directionBtnTextIdle,
                ]}
              >
                SHORT  {snap.shortScore.toFixed(1)}
              </Text>
            </Pressable>
          </View>

          <TradePlanModal
            visible={modalVisible}
            direction={modalDir}
            symbol={row.symbol}
            row={row}
            onClose={() => setModalVisible(false)}
            onConfirm={() => {
              setModalVisible(false);
              const plan = resolvePlanForDirection(row, modalDir);
              if (!plan) return;
              const setup = manualSetupFromTradePlanV3(
                plan,
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
            onRecordSkippedSetup={onRecordSkippedSetup}
            onSkip={() => {
              setModalVisible(false);
              onHidePlan?.();
            }}
            entryExplain={explainEntry(row, modalDir)}
            slExplain={explainSL(row, modalDir)}
            tp1Explain={explainTP(row, 1, modalDir)}
            tp2Explain={explainTP(row, 2, modalDir)}
            tp3Explain={explainTP(row, 3, modalDir)}
            blockInfo={explainBlocks(row, modalDir)}
            canEnter={
              modalDir === 'LONG'
                ? rowWithSnapshots.longSnapshot?.canEnter ??
                  isDirectionReady('LONG', snap, row, blockReasons)
                : rowWithSnapshots.shortSnapshot?.canEnter ??
                  isDirectionReady('SHORT', snap, row, blockReasons)
            }
          />

          {false && (
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
              <View style={styles.entryBadgeRow}>
                <FinalEntryBadge
                  display={entryDisplay}
                  score={entryDisplay.subtitle ? undefined : displayScore ?? undefined}
                  size="md"
                  isAmbiguousDirection={isAmbiguous}
                />
                {adxGate?.severity === 'BLOCK' ? (
                  <View style={styles.adxBadgeBlock}>
                    <Text style={styles.adxBadgeBlockText}>⛔ CHOPPY</Text>
                  </View>
                ) : adxGate?.severity === 'WARNING' ? (
                  <View style={styles.adxBadgeWarning}>
                    <Text style={styles.adxBadgeWarningText} numberOfLines={2}>
                      {adxGate.message}
                    </Text>
                  </View>
                ) : adxGate?.severity === 'BONUS' ? (
                  <View style={styles.adxBadgeBonus}>
                    <Text style={styles.adxBadgeBonusText}>✅ TRENDING STRONG</Text>
                  </View>
                ) : null}
              </View>
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
            isAmbiguousDirection={isAmbiguous}
          />

          {isAmbiguous && snap.ambiguousMessage ? (
            <Text style={styles.ambiguousMessage}>⚠️ {snap.ambiguousMessage}</Text>
          ) : null}

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

          {row.adxData != null ? (
            <AdxMarketRegimeSection adxData={row.adxData} adxGate={row.adxGate} />
          ) : null}

          {row.structureSL != null ? (
            <StructureSLSection structureSL={row.structureSL} />
          ) : null}

          {row.vwapData != null && row.price != null ? (
            <VWAPSection
              vwapData={row.vwapData}
              currentPrice={row.price}
              vwapSignal={row.vwapSignal}
              vwapBonus={row.vwapBonus}
            />
          ) : null}
            </>
          )}

          {showPlan && canShowPlan && !isAmbiguous ? (
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
              ) : false &&
                (onOpenPosition || onRequestPendingOrder || onPendingOrder) ? (
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
          ) : false ? (
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
              {onOpenPosition && !isAmbiguous ? (
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
  isAmbiguousDirection,
}: {
  longScore: number;
  shortScore: number;
  direction: TradeDirection;
  isAmbiguousDirection?: boolean;
}) {
  const total = Math.max(0.001, longScore + shortScore);
  const longPct = (longScore / total) * 100;
  const shortPct = 100 - longPct;

  if (isAmbiguousDirection) {
    return (
      <View style={styles.biasWrap}>
        <View style={styles.biasHeader}>
          <Text style={styles.biasLabel}>{vi.signalBoard.biasLabel}</Text>
          <Text style={[styles.biasValue, { color: BIAS_NEUTRAL_COLOR }]}>
            ⇄ Long {longScore.toFixed(1)}đ ↔ Short {shortScore.toFixed(1)}đ
          </Text>
        </View>
        <View style={styles.biasBar}>
          <View style={[styles.biasFillNeutral, { width: `${longPct}%` }]} />
          <View style={[styles.biasFillNeutral, { width: `${shortPct}%` }]} />
        </View>
        <View style={styles.biasFooter}>
          <Text style={[styles.biasFootText, { color: BIAS_NEUTRAL_COLOR }]}>
            L {longScore.toFixed(1)}
          </Text>
          <Text style={[styles.biasFootText, { color: BIAS_NEUTRAL_COLOR }]}>
            S {shortScore.toFixed(1)}
          </Text>
        </View>
      </View>
    );
  }

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
  statusBadgeBox: {
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: SPACING.xs,
    gap: 4,
    width: '100%',
  },
  statusBadgeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusBadgeSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  scoreTier1Row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: SPACING.xs,
  },
  scoreTotalCol: {
    alignItems: 'flex-start',
  },
  scoreTotalValue: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 36,
  },
  scoreTotalDenom: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  scoreDirCol: {
    alignItems: 'center',
    minWidth: 56,
  },
  scoreDirLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  scoreDirValue: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  scoreTier2Row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  scoreTier2Text: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  directionBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.sm,
  },
  directionBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionBtnIdle: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  directionBtnLongReady: {
    backgroundColor: '#22C55E',
    borderWidth: 0,
  },
  directionBtnShortReady: {
    backgroundColor: '#EF4444',
    borderWidth: 0,
  },
  directionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  directionBtnTextReady: {
    color: '#FFFFFF',
  },
  directionBtnTextIdle: {
    color: COLORS.textMuted,
  },
  directionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  directionModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  directionModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  directionModalHint: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  directionModalClose: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  directionModalCloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
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
  entryBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  adxBadgeBlock: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.bearish,
  },
  adxBadgeBlockText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.bearish,
  },
  adxBadgeWarning: {
    flex: 1,
    minWidth: 120,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(240, 185, 11, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  adxBadgeWarningText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.warning,
  },
  adxBadgeBonus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(14, 203, 129, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.bullish,
  },
  adxBadgeBonusText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.bullish,
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
  biasFillNeutral: {
    height: '100%',
    backgroundColor: BIAS_NEUTRAL_COLOR,
  },
  ambiguousMessage: {
    marginTop: SPACING.xs,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    color: AMBIGUOUS_BORDER_COLOR,
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

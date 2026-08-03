import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS, type AppTradeSymbol } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import {
  hasJournalPartialClose,
  isStalePendingOrder,
  resolveJournalCloseReasonDisplay,
  resolveJournalOpenReasonDisplay,
  resolveJournalStatusLabel,
  type JournalPnlBreakdown,
} from '../../services/journalService';
import { formatUsdPrice } from '../../utils/formatPrice';
import { formatSignedPercent, formatSignedUsdt } from '../../utils/positionPnl';
import { resolveJournalLiveMark } from '../../hooks/useJournalMarketSync';
import {
  resolveJournalUlReviewExplanation,
  resolveJournalUlReviewRecommendation,
  resolveJournalUlReviewRecommendationColor,
} from '../../utils/journalRecommendationDisplay';
import { getEsmSnapshotForSymbol, type EsmBridgeState } from '../../store/esmBridgeTypes';
import { EsmRecommendationCell } from './EsmRecommendationCell';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

function statusColor(status: string): string {
  if (status.includes('PARTIAL')) return '#F97316';
  if (status === 'RUNNING' || status === 'OPEN') return COLORS.bullish;
  if (status === 'PENDING') return COLORS.warning;
  if (status === 'WIN') return COLORS.bullish;
  if (status === 'LOSS') return COLORS.bearish;
  if (status === 'CANCELLED') return COLORS.textMuted;
  return COLORS.textSecondary;
}

function formatJournalTime(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceLabel(entry: AiTradeJournalEntry): string {
  const v = entry.scoring.scorerVersion as string | undefined;
  if (v === 'unified') return '⭐ V4+V4.1';
  if (v === 'v41') return 'V4.1';
  if (v === 'v4') return 'V4';
  if (v === 'v3') return 'V3';
  return '—';
}

export interface JournalTradeMobileCardProps {
  entry: AiTradeJournalEntry;
  markPrice?: number;
  unrealizedPnl?: number | null;
  pnlBreakdown?: JournalPnlBreakdown;
  esmUlReviewLabel?: string;
  esmBridge: EsmBridgeState;
  onDetail?: (entry: AiTradeJournalEntry) => void;
  onStopTrade?: (entry: AiTradeJournalEntry) => void;
  onConfirmFill?: (entry: AiTradeJournalEntry) => void;
  onCancelPending?: (entry: AiTradeJournalEntry) => void;
}

export function JournalTradeMobileCard({
  entry,
  markPrice,
  unrealizedPnl,
  pnlBreakdown,
  esmUlReviewLabel,
  esmBridge,
  onDetail,
  onStopTrade,
  onConfirmFill,
  onCancelPending,
}: JournalTradeMobileCardProps) {
  const sym = entry.symbol as AppTradeSymbol;
  const isOpen = entry.outcome.status === 'OPEN';
  const isPending = entry.outcome.status === 'PENDING';
  const isLong = entry.scoring.direction === 'LONG';
  const dirColor = isLong ? COLORS.bullish : COLORS.bearish;
  const displayStatus = resolveJournalStatusLabel(entry);
  const hasPartial = hasJournalPartialClose(entry);
  const openReason = resolveJournalOpenReasonDisplay(entry);
  const closeReason = resolveJournalCloseReasonDisplay(entry);
  const stalePending = isPending && isStalePendingOrder(entry);
  const showPartialPnl = isOpen && (pnlBreakdown?.hasPartial ?? hasPartial);
  const marketPrice =
    isOpen || isPending
      ? markPrice != null && Number.isFinite(markPrice)
        ? markPrice
        : undefined
      : undefined;
  const currentExit =
    isOpen || isPending
      ? marketPrice != null
        ? formatUsdPrice(sym, marketPrice)
        : '—'
      : entry.outcome.exitPrice != null
        ? formatUsdPrice(sym, entry.outcome.exitPrice)
        : '—';
  const pnl = isOpen ? unrealizedPnl : entry.outcome.pnlUSDT;
  const totalPnl = showPartialPnl ? pnlBreakdown?.totalPnl : pnl;
  const pnlColor =
    totalPnl == null ? COLORS.textMuted : totalPnl >= 0 ? COLORS.bullish : COLORS.bearish;
  const esmSnapshot = getEsmSnapshotForSymbol(esmBridge, entry.symbol);
  const ulReview = resolveJournalUlReviewRecommendation(entry, esmSnapshot);
  const ulExplanation = resolveJournalUlReviewExplanation(entry, esmSnapshot);
  const recommendation = esmUlReviewLabel ?? ulReview.label;
  const toneKey = resolveJournalUlReviewRecommendationColor(ulReview.tone);
  const recommendationColor =
    toneKey === 'close'
      ? COLORS.bearish
      : toneKey === 'hold'
        ? COLORS.bullish
        : toneKey === 'wait'
          ? COLORS.warning
          : COLORS.textSecondary;

  return (
    <View style={[styles.card, stalePending && styles.cardStale]}>
      <View style={styles.topRow}>
        <View style={styles.symbolBlock}>
          <Text style={styles.sourceTag}>{sourceLabel(entry)}</Text>
          <Text style={styles.symbolText}>
            {entry.symbol.replace('USDT', '')}{' '}
            <Text style={{ color: dirColor }}>{entry.scoring.direction}</Text>
          </Text>
        </View>
        <View style={styles.statusBlock}>
          <Text style={[styles.statusText, { color: statusColor(displayStatus) }]}>
            {displayStatus}
          </Text>
          <Text style={styles.timeText}>{formatJournalTime(entry.timestamp)}</Text>
        </View>
      </View>

      <EsmRecommendationCell
        recommendationLabel={recommendation}
        recommendationColor={recommendationColor}
        hintBadge={null}
        width={0}
        tooltipLines={ulReview.tooltipLines}
        explanationPanel={ulExplanation}
        stacked
      />

      <View style={styles.priceGrid}>
        <View style={styles.priceCell}>
          <Text style={styles.priceLabel}>{vi.journal.colEntry}</Text>
          <Text style={styles.priceValue}>{formatUsdPrice(sym, entry.market.entryPrice)}</Text>
        </View>
        <View style={styles.priceCell}>
          <Text style={styles.priceLabel}>{vi.journal.colCurrentExit}</Text>
          <Text style={styles.priceValue}>{currentExit}</Text>
        </View>
        <View style={styles.priceCell}>
          <Text style={styles.priceLabel}>{vi.journal.colPnl}</Text>
          {showPartialPnl && pnlBreakdown ? (
            <Text style={[styles.priceValue, { color: pnlColor }]} numberOfLines={3}>
              {vi.journal.pnlTotalLine(formatSignedUsdt(pnlBreakdown.totalPnl))}
            </Text>
          ) : (
            <Text style={[styles.priceValue, { color: pnlColor }]}>
              {pnl != null ? formatSignedUsdt(pnl) : '—'}
              {!isOpen && !isPending && entry.outcome.pnlPct != null
                ? ` (${formatSignedPercent(entry.outcome.pnlPct)})`
                : ''}
            </Text>
          )}
        </View>
      </View>

      {openReason ? (
        <Text style={styles.reasonLine} numberOfLines={2}>
          {vi.journal.colOpenReason}: {openReason}
        </Text>
      ) : null}
      {closeReason ? (
        <Text style={styles.reasonLine} numberOfLines={2}>
          {vi.journal.colCloseReason}: {closeReason}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {isOpen && onStopTrade ? (
          <Pressable onPress={() => onStopTrade(entry)} style={[styles.actionBtn, styles.stopBtn, webPointer]}>
            <Text style={styles.stopText}>STOP</Text>
          </Pressable>
        ) : null}
        {isPending && onConfirmFill ? (
          <Pressable onPress={() => onConfirmFill(entry)} style={[styles.actionBtn, styles.fillBtn, webPointer]}>
            <Text style={styles.fillText}>Fill</Text>
          </Pressable>
        ) : null}
        {isPending && onCancelPending ? (
          <Pressable
            onPress={() => onCancelPending(entry)}
            style={[styles.actionBtn, styles.cancelBtn, webPointer]}
          >
            <Text style={styles.cancelText}>Huỷ</Text>
          </Pressable>
        ) : null}
        {onDetail ? (
          <Pressable onPress={() => onDetail(entry)} style={[styles.actionBtn, styles.detailBtn, webPointer]}>
            <Text style={styles.detailText}>Chi tiết</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...PANEL,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  cardStale: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    backgroundColor: 'rgba(240, 185, 11, 0.04)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  symbolBlock: {
    flex: 1,
    minWidth: 0,
    gap: SPACING.xs,
  },
  sourceTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
  },
  symbolText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statusBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: SPACING.xs,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  priceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  priceCell: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    gap: SPACING.xs,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  priceValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  reasonLine: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
  },
  stopBtn: {
    borderColor: COLORS.bearish,
    backgroundColor: 'rgba(246, 70, 93, 0.12)',
  },
  stopText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.bearish,
  },
  fillBtn: {
    borderColor: COLORS.bullish,
    backgroundColor: 'rgba(14, 203, 129, 0.12)',
  },
  fillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.bullish,
  },
  cancelBtn: {
    borderColor: COLORS.warning,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.warning,
  },
  detailBtn: {
    marginLeft: 'auto',
  },
  detailText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});

export const MemoJournalTradeMobileCard = memo(JournalTradeMobileCard, (prev, next) => {
  if (prev.entry.id !== next.entry.id) return false;
  if (prev.entry.outcome.status !== next.entry.outcome.status) return false;
  if (prev.markPrice !== next.markPrice) return false;
  if (prev.unrealizedPnl !== next.unrealizedPnl) return false;
  if (prev.esmUlReviewLabel !== next.esmUlReviewLabel) return false;
  const p = prev.pnlBreakdown;
  const n = next.pnlBreakdown;
  if (p?.totalPnl !== n?.totalPnl) return false;
  if (p?.unrealizedPnl !== n?.unrealizedPnl) return false;
  return true;
});

import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { PANEL, RADIUS, SPACING } from '../constants/theme';
import {
  formatPendingWaitDuration,
  formatPendingCancelLabel,
  isStalePendingOrder,
} from '../services/journalService';
import { formatUsdPrice } from '../utils/formatPrice';
import { formatSignedUsdt } from '../utils/positionPnl';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

interface JournalEntryCardProps {
  entry: AiTradeJournalEntry;
  unrealizedPnl?: number | null;
  onDetail?: (entry: AiTradeJournalEntry) => void;
  onCloseTrade?: (entry: AiTradeJournalEntry) => void;
  onConfirmFill?: (entry: AiTradeJournalEntry) => void;
  onCancelPending?: (entry: AiTradeJournalEntry) => void;
}

function formatHolding(minutes?: number): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function JournalEntryCard({
  entry,
  unrealizedPnl,
  onDetail,
  onCloseTrade,
  onConfirmFill,
  onCancelPending,
}: JournalEntryCardProps) {
  const sym = entry.symbol as import('../constants/scoring').AppTradeSymbol;
  const isOpen = entry.outcome.status === 'OPEN';
  const isPending = entry.outcome.status === 'PENDING';
  const isCancelled = entry.outcome.status === 'CANCELLED';
  const pnl = isOpen ? unrealizedPnl : entry.outcome.pnlUSDT;
  const pnlColor =
    pnl == null ? COLORS.textMuted : pnl >= 0 ? COLORS.bullish : COLORS.bearish;
  const dirColor = entry.scoring.direction === 'LONG' ? COLORS.bullish : COLORS.bearish;
  const stalePending = isPending && isStalePendingOrder(entry);
  const limitPrice = entry.outcome.limitOrderPrice ?? entry.market.entryPrice;
  const placedAt = entry.outcome.limitOrderPlacedAt ?? entry.timestamp;

  const statusIcon =
    entry.outcome.status === 'WIN'
      ? '✅'
      : entry.outcome.status === 'LOSS'
        ? '❌'
        : entry.outcome.status === 'BREAKEVEN'
          ? '➖'
          : isPending
            ? '⏳'
            : isCancelled
              ? '🚫'
              : isOpen
                ? '⏳'
                : '·';
  const cancelLabel = isCancelled
    ? formatPendingCancelLabel(entry.outcome.exitReason, entry.outcome.notes)
    : null;

  return (
    <View style={[styles.card, stalePending && styles.cardStalePending]}>
      {isPending ? (
        <View style={styles.pendingBadgeRow}>
          <Text style={styles.pendingBadge}>⏳ CHỜ FILL</Text>
          {stalePending ? (
            <Text style={styles.staleBadge}>⚠️ Lệnh chờ lâu — kiểm tra lại</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.topRow}>
        <Text style={styles.title}>
          {entry.symbol.replace('USDT', '')}{' '}
          <Text style={{ color: dirColor }}>{entry.scoring.direction}</Text>
          {'  '}
          <Text style={styles.score}>{entry.scoring.totalScore.toFixed(1)}đ</Text>
        </Text>
        <Text style={styles.decision}>{entry.scoring.decision.replace(/_/g, ' ')}</Text>
      </View>

      {isPending ? (
        <Text style={styles.priceLine}>
          Chờ fill tại {formatUsdPrice(sym, limitPrice)}
          {'  ·  '}
          Đặt {formatPendingWaitDuration(placedAt)} trước
        </Text>
      ) : isCancelled ? (
        <Text style={styles.priceLine}>
          Limit {formatUsdPrice(sym, limitPrice)}
          {'  ·  '}
          Chờ {formatPendingWaitDuration(placedAt, entry.outcome.exitTimestamp ?? Date.now())}
        </Text>
      ) : isOpen ? (
        <Text style={styles.priceLine}>
          Entry: {formatUsdPrice(sym, entry.market.entryPrice)}
          {'  '}SL: {formatUsdPrice(sym, entry.plan.slActual)}
        </Text>
      ) : (
        <Text style={styles.priceLine}>
          Entry: {formatUsdPrice(sym, entry.market.entryPrice)}
          {'  →  '}
          Exit: {entry.outcome.exitPrice != null ? formatUsdPrice(sym, entry.outcome.exitPrice) : '—'}
        </Text>
      )}

      <View style={styles.bottomRow}>
        {isPending ? (
          <Text style={styles.pnl}>{statusIcon} PENDING · Limit {formatUsdPrice(sym, limitPrice)}</Text>
        ) : isCancelled ? (
          <Text style={[styles.pnl, styles.cancelledPnl]}>
            {statusIcon} ĐÃ HỦY
            {entry.outcome.holdingTimeMinutes != null
              ? ` · chờ ${formatHolding(entry.outcome.holdingTimeMinutes)}`
              : ''}
          </Text>
        ) : pnl != null ? (
          <Text style={[styles.pnl, { color: pnlColor }]}>
            {formatSignedUsdt(pnl)}
            {!isOpen && entry.outcome.pnlPct != null
              ? ` (${entry.outcome.pnlPct.toFixed(2)}%)`
              : ''}
            {'  '}
            {statusIcon} {isOpen ? 'ĐANG MỞ' : entry.outcome.status}
            {!isOpen && entry.outcome.holdingTimeMinutes != null
              ? `  ${formatHolding(entry.outcome.holdingTimeMinutes)}`
              : ''}
          </Text>
        ) : (
          <Text style={styles.pnl}>{statusIcon} {entry.outcome.status}</Text>
        )}
      </View>

      {cancelLabel ? (
        <Text style={styles.cancelNote}>{cancelLabel}</Text>
      ) : null}

      <View style={styles.actions}>
        {onDetail ? (
          <Pressable onPress={() => onDetail(entry)} style={[styles.actionBtn, webPointer]}>
            <Text style={styles.actionText}>Chi tiết</Text>
          </Pressable>
        ) : null}
        {isPending && onConfirmFill ? (
          <Pressable
            onPress={() => onConfirmFill(entry)}
            style={[styles.actionBtn, styles.fillBtn, webPointer]}
          >
            <Text style={styles.fillText}>✅ Đã Fill</Text>
          </Pressable>
        ) : null}
        {isPending && onCancelPending ? (
          <Pressable
            onPress={() => onCancelPending(entry)}
            style={[styles.actionBtn, styles.cancelPendingBtn, webPointer]}
          >
            <Text style={styles.cancelPendingText}>❌ Huỷ</Text>
          </Pressable>
        ) : null}
        {isOpen && onCloseTrade ? (
          <Pressable
            onPress={() => onCloseTrade(entry)}
            style={[styles.actionBtn, styles.closeBtn, webPointer]}
          >
            <Text style={styles.closeText}>Đóng lệnh</Text>
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
    marginBottom: SPACING.sm,
  },
  cardStalePending: {
    borderColor: COLORS.warning,
    backgroundColor: 'rgba(240, 185, 11, 0.06)',
  },
  pendingBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: 6,
    alignItems: 'center',
  },
  pendingBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  staleBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.warning,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
  },
  score: {
    color: COLORS.accent,
  },
  decision: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  priceLine: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  bottomRow: { marginTop: 6 },
  pnl: {
    fontSize: 12,
    fontWeight: '700',
  },
  cancelledPnl: {
    color: COLORS.textMuted,
  },
  cancelNote: {
    marginTop: 4,
    fontSize: 10,
    color: COLORS.warning,
    lineHeight: 14,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  fillBtn: {
    borderColor: COLORS.bullish,
    backgroundColor: 'rgba(14, 203, 129, 0.1)',
  },
  fillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.bullish,
  },
  cancelPendingBtn: {
    borderColor: COLORS.bearishMuted,
  },
  cancelPendingText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.bearish,
  },
  closeBtn: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(14, 203, 129, 0.1)',
  },
  closeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.accent,
  },
});

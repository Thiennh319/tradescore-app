import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS, type AppTradeSymbol } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import {
  isStalePendingOrder,
  resolveJournalCloseReasonDisplay,
  resolveJournalDisplayStatus,
  resolveJournalOpenReasonDisplay,
} from '../../services/journalService';
import { formatUsdPrice } from '../../utils/formatPrice';
import { formatSignedPercent, formatSignedUsdt } from '../../utils/positionPnl';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

const COL = {
  source: 44,
  coin: 76,
  status: 72,
  recommendation: 108,
  entry: 76,
  currentExit: 76,
  pnl: 72,
  openReason: 96,
  closeReason: 96,
  action: 108,
  time: 72,
} as const;

const TABLE_MIN_WIDTH =
  COL.source +
  COL.coin +
  COL.status +
  COL.recommendation +
  COL.entry +
  COL.currentExit +
  COL.pnl +
  COL.openReason +
  COL.closeReason +
  COL.action +
  COL.time +
  SPACING.sm * 22;

export interface JournalTradeTableProps {
  entries: AiTradeJournalEntry[];
  markBySymbol: Record<string, number>;
  unrealizedById: Record<string, number | null>;
  onDetail?: (entry: AiTradeJournalEntry) => void;
  onStopTrade?: (entry: AiTradeJournalEntry) => void;
  onConfirmFill?: (entry: AiTradeJournalEntry) => void;
  onCancelPending?: (entry: AiTradeJournalEntry) => void;
}

function HeadCell({ text, width }: { text: string; width: number }) {
  return (
    <Text style={[styles.headCell, { width }]} numberOfLines={1}>
      {text}
    </Text>
  );
}

function statusColor(status: string): string {
  if (status === 'RUNNING') return COLORS.bullish;
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

function JournalTradeRow({
  entry,
  markPrice,
  unrealizedPnl,
  onDetail,
  onStopTrade,
  onConfirmFill,
  onCancelPending,
}: {
  entry: AiTradeJournalEntry;
  markPrice?: number;
  unrealizedPnl?: number | null;
  onDetail?: (entry: AiTradeJournalEntry) => void;
  onStopTrade?: (entry: AiTradeJournalEntry) => void;
  onConfirmFill?: (entry: AiTradeJournalEntry) => void;
  onCancelPending?: (entry: AiTradeJournalEntry) => void;
}) {
  const sym = entry.symbol as AppTradeSymbol;
  const isOpen = entry.outcome.status === 'OPEN';
  const isPending = entry.outcome.status === 'PENDING';
  const isLong = entry.scoring.direction === 'LONG';
  const dirColor = isLong ? COLORS.bullish : COLORS.bearish;
  const displayStatus = resolveJournalDisplayStatus(entry.outcome.status);
  const openReason = resolveJournalOpenReasonDisplay(entry);
  const closeReason = resolveJournalCloseReasonDisplay(entry);
  const stalePending = isPending && isStalePendingOrder(entry);
  const limitPrice = entry.outcome.limitOrderPrice ?? entry.market.entryPrice;

  const currentExit = isOpen
    ? markPrice != null
      ? formatUsdPrice(sym, markPrice)
      : '—'
    : isPending
      ? formatUsdPrice(sym, limitPrice)
      : entry.outcome.exitPrice != null
        ? formatUsdPrice(sym, entry.outcome.exitPrice)
        : '—';

  const pnl = isOpen ? unrealizedPnl : entry.outcome.pnlUSDT;
  const pnlColor =
    pnl == null ? COLORS.textMuted : pnl >= 0 ? COLORS.bullish : COLORS.bearish;

  const sourceLabel = entry.strategySource ?? '—';
  const recommendation = entry.scoring.recommendationLabel?.trim() || '—';

  return (
    <View style={[styles.tableRow, stalePending && styles.rowStale]}>
      <Text style={[styles.cell, styles.sourceCell, { width: COL.source }]} numberOfLines={1}>
        {sourceLabel}
      </Text>
      <View style={{ width: COL.coin }}>
        <Text style={styles.coinText} numberOfLines={1}>
          {entry.symbol.replace('USDT', '')}{' '}
          <Text style={{ color: dirColor }}>{entry.scoring.direction}</Text>
        </Text>
      </View>
      <Text
        style={[styles.cell, styles.statusCell, { width: COL.status, color: statusColor(displayStatus) }]}
        numberOfLines={1}
      >
        {displayStatus}
      </Text>
      <Text style={[styles.cell, { width: COL.recommendation }]} numberOfLines={2}>
        {recommendation}
      </Text>
      <Text style={[styles.cell, { width: COL.entry }]} numberOfLines={1}>
        {formatUsdPrice(sym, entry.market.entryPrice)}
      </Text>
      <Text style={[styles.cell, { width: COL.currentExit }]} numberOfLines={1}>
        {currentExit}
      </Text>
      <View style={{ width: COL.pnl }}>
        <Text style={[styles.pnlCell, { color: pnlColor }]} numberOfLines={1}>
          {pnl != null ? formatSignedUsdt(pnl) : '—'}
        </Text>
        {!isOpen && !isPending && entry.outcome.pnlPct != null ? (
          <Text style={[styles.pnlPctCell, { color: pnlColor }]}>
            {formatSignedPercent(entry.outcome.pnlPct)}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.cell, styles.reasonCell, { width: COL.openReason }]} numberOfLines={2}>
        {openReason ?? '—'}
      </Text>
      <Text style={[styles.cell, styles.reasonCell, { width: COL.closeReason }]} numberOfLines={2}>
        {closeReason ?? '—'}
      </Text>
      <View style={[styles.actionCell, { width: COL.action }]}>
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
          <Pressable onPress={() => onDetail(entry)} style={[styles.actionBtn, webPointer]}>
            <Text style={styles.detailText}>···</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.cell, styles.timeCell, { width: COL.time }]} numberOfLines={2}>
        {formatJournalTime(entry.timestamp)}
      </Text>
    </View>
  );
}

export function JournalTradeTable({
  entries,
  markBySymbol,
  unrealizedById,
  onDetail,
  onStopTrade,
  onConfirmFill,
  onCancelPending,
}: JournalTradeTableProps) {
  if (entries.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'}>
        <View style={[styles.table, { minWidth: TABLE_MIN_WIDTH }]}>
          <View style={styles.tableHead}>
            <HeadCell text={vi.journal.colSource} width={COL.source} />
            <HeadCell text={vi.journal.colCoin} width={COL.coin} />
            <HeadCell text={vi.journal.colStatus} width={COL.status} />
            <HeadCell text={vi.journal.colRecommendation} width={COL.recommendation} />
            <HeadCell text={vi.journal.colEntry} width={COL.entry} />
            <HeadCell text={vi.journal.colCurrentExit} width={COL.currentExit} />
            <HeadCell text={vi.journal.colPnl} width={COL.pnl} />
            <HeadCell text={vi.journal.colOpenReason} width={COL.openReason} />
            <HeadCell text={vi.journal.colCloseReason} width={COL.closeReason} />
            <HeadCell text={vi.journal.colAction} width={COL.action} />
            <HeadCell text={vi.journal.colTime} width={COL.time} />
          </View>
          {entries.map((entry) => (
            <JournalTradeRow
              key={entry.id}
              entry={entry}
              markPrice={markBySymbol[entry.symbol]}
              unrealizedPnl={unrealizedById[entry.id] ?? null}
              onDetail={onDetail}
              onStopTrade={onStopTrade}
              onConfirmFill={onConfirmFill}
              onCancelPending={onCancelPending}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...PANEL,
    padding: 0,
    overflow: 'hidden',
  },
  table: {
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    gap: SPACING.sm,
  },
  headCell: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rowStale: {
    backgroundColor: 'rgba(240, 185, 11, 0.04)',
    borderLeftWidth: 2,
    borderLeftColor: COLORS.warning,
  },
  cell: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  sourceCell: {
    fontWeight: '800',
    color: COLORS.accent,
    letterSpacing: 0.2,
  },
  coinText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statusCell: {
    fontWeight: '800',
    fontSize: 9,
    letterSpacing: 0.2,
  },
  reasonCell: {
    fontSize: 9,
    lineHeight: 12,
    color: COLORS.textMuted,
  },
  pnlCell: {
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pnlPctCell: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeCell: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  actionCell: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  actionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 28,
    alignItems: 'center',
  },
  detailText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  fillBtn: {
    borderColor: COLORS.bullish,
    backgroundColor: 'rgba(14, 203, 129, 0.08)',
  },
  fillText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.bullish,
  },
  cancelBtn: {
    borderColor: COLORS.bearishMuted,
  },
  cancelText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.bearish,
  },
  stopBtn: {
    borderColor: COLORS.bearish,
    backgroundColor: 'rgba(246, 70, 93, 0.08)',
  },
  stopText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.bearish,
  },
});

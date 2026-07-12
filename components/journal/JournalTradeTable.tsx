import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS, type AppTradeSymbol } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import {
  isStalePendingOrder,
  resolveJournalCloseReasonDisplay,
  resolveJournalOpenReasonDisplay,
  resolveJournalStatusLabel,
  hasJournalPartialClose,
  type JournalPnlBreakdown,
} from '../../services/journalService';
import { formatUsdPrice } from '../../utils/formatPrice';
import { formatSignedPercent, formatSignedUsdt } from '../../utils/positionPnl';
import { resolveJournalMarketPrice } from '../../hooks/useJournalMarketSync';
import { EsmRecommendationCell } from './EsmRecommendationCell';
import { resolveEsmHintDisplay } from '../../utils/esmUiDisplay';
import { useTradeStore } from '../../store/useTradeStore';
import { getEsmSnapshotForSymbol, type EsmBridgeState } from '../../store/esmBridgeTypes';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

export const JOURNAL_TABLE_PAGE_SIZE = 5;

const COL = {
  source: 44,
  coin: 76,
  status: 108,
  recommendation: 108,
  entry: 76,
  currentExit: 76,
  pnl: 108,
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
  /** Live Position Advisor label keyed by entry id (OPEN only). */
  advisorLabelById?: Record<string, string>;
  /** PnL tách partial — OPEN only (từ useJournalMarketSync). */
  pnlBreakdownById?: Record<string, JournalPnlBreakdown>;
  onDetail?: (entry: AiTradeJournalEntry) => void;
  onStopTrade?: (entry: AiTradeJournalEntry) => void;
  onConfirmFill?: (entry: AiTradeJournalEntry) => void;
  onCancelPending?: (entry: AiTradeJournalEntry) => void;
  /** Bật phân trang (mặc định 5 dòng/trang). */
  paginated?: boolean;
  pageSize?: number;
  /** Đổi khi filter thay đổi → reset về trang 1. */
  pageResetKey?: string;
}

function HeadCell({ text, width }: { text: string; width: number }) {
  return (
    <Text style={[styles.headCell, { width }]} numberOfLines={1}>
      {text}
    </Text>
  );
}

function statusColorForBase(status: AiTradeJournalEntry['outcome']['status'] | string): string {
  if (status === 'RUNNING' || status === 'OPEN') return COLORS.bullish;
  if (status === 'PENDING') return COLORS.warning;
  if (status === 'WIN') return COLORS.bullish;
  if (status === 'LOSS') return COLORS.bearish;
  if (status === 'CANCELLED') return COLORS.textMuted;
  return COLORS.textSecondary;
}

function statusColor(status: string): string {
  if (status.includes('PARTIAL')) return '#F97316';
  return statusColorForBase(status);
}

function formatJournalTime(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function JournalSourceCell({ entry, width }: { entry: AiTradeJournalEntry; width: number }) {
  const scorerVersion = entry.scoring.scorerVersion as string | undefined;

  if (scorerVersion === 'unified') {
    return (
      <View style={[styles.sourceBadgeWrap, { width }]}>
        <View
          style={[
            styles.sourceBadgeUnified,
            Platform.OS === 'web'
              ? ({
                  backgroundImage: 'linear-gradient(135deg, #A78BFA 0%, #8B5CF6 50%, #6D28D9 100%)',
                } as object)
              : null,
          ]}
        >
          <Text style={styles.sourceBadgeUnifiedText} numberOfLines={1}>
            ⭐ V4+V4.1
          </Text>
        </View>
      </View>
    );
  }

  if (scorerVersion === 'v41') {
    return (
      <View style={[styles.sourceBadgeWrap, { width }]}>
        <View style={styles.sourceBadgeV41}>
          <Text style={styles.sourceBadgeV41Text} numberOfLines={1}>
            V4.1
          </Text>
        </View>
      </View>
    );
  }

  if (scorerVersion === 'v4') {
    return (
      <Text style={[styles.cell, styles.sourceCell, { width }]} numberOfLines={1}>
        V4
      </Text>
    );
  }

  if (scorerVersion === 'v3') {
    return (
      <Text style={[styles.cell, styles.sourceCell, { width }]} numberOfLines={1}>
        V3
      </Text>
    );
  }

  return (
    <Text style={[styles.cell, styles.sourceMuted, { width }]} numberOfLines={1}>
      —
    </Text>
  );
}

function JournalTradeRow({
  entry,
  markBySymbol,
  unrealizedPnl,
  pnlBreakdown,
  advisorLabel,
  esmBridge,
  onDetail,
  onStopTrade,
  onConfirmFill,
  onCancelPending,
}: {
  entry: AiTradeJournalEntry;
  markBySymbol: Record<string, number>;
  unrealizedPnl?: number | null;
  pnlBreakdown?: JournalPnlBreakdown;
  advisorLabel?: string;
  esmBridge: EsmBridgeState;
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
  const displayStatus = resolveJournalStatusLabel(entry);
  const hasPartial = hasJournalPartialClose(entry);
  const openReason = resolveJournalOpenReasonDisplay(entry);
  const closeReason = resolveJournalCloseReasonDisplay(entry);
  const stalePending = isPending && isStalePendingOrder(entry);

  const showPartialPnl = isOpen && (pnlBreakdown?.hasPartial ?? hasPartial);

  const marketPrice = resolveJournalMarketPrice(entry, markBySymbol);

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
  const realizedColor =
    pnlBreakdown != null && pnlBreakdown.realizedPnl >= 0 ? COLORS.bullish : COLORS.bearish;
  const unrealizedColor =
    pnlBreakdown?.unrealizedPnl == null
      ? COLORS.textMuted
      : pnlBreakdown.unrealizedPnl >= 0
        ? COLORS.bullish
        : COLORS.bearish;

  const esmSnapshot = getEsmSnapshotForSymbol(esmBridge, entry.symbol);
  const esmHint = resolveEsmHintDisplay(esmSnapshot, entry.symbol);

  const liveAdvisor = isOpen ? advisorLabel?.trim() : '';
  const recommendation =
    liveAdvisor || entry.scoring.recommendationLabel?.trim() || '—';
  const recommendationColor =
    isOpen && liveAdvisor
      ? liveAdvisor.toLowerCase().includes('đóng') ||
        liveAdvisor.toLowerCase().includes('cắt')
        ? COLORS.bearish
        : COLORS.bullish
      : COLORS.textSecondary;

  return (
    <View style={[styles.tableRow, stalePending && styles.rowStale]}>
      <JournalSourceCell entry={entry} width={COL.source} />
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
      <EsmRecommendationCell
        recommendationLabel={recommendation}
        recommendationColor={recommendationColor}
        hintBadge={esmHint.hintBadge}
        width={COL.recommendation}
        tooltipLines={esmHint.tooltipLines}
      />
      <Text style={[styles.cell, { width: COL.entry }]} numberOfLines={1}>
        {formatUsdPrice(sym, entry.market.entryPrice)}
      </Text>
      <Text style={[styles.cell, { width: COL.currentExit }]} numberOfLines={1}>
        {currentExit}
      </Text>
      <View style={{ width: COL.pnl }}>
        {showPartialPnl && pnlBreakdown ? (
          <>
            <Text style={[styles.pnlLine, { color: realizedColor }]} numberOfLines={2}>
              {vi.journal.pnlRealizedLine(
                formatSignedUsdt(pnlBreakdown.realizedPnl),
                pnlBreakdown.closedPercent,
              )}
            </Text>
            <Text style={[styles.pnlLine, { color: unrealizedColor }]} numberOfLines={2}>
              {vi.journal.pnlUnrealizedLine(
                formatSignedUsdt(pnlBreakdown.unrealizedPnl),
                pnlBreakdown.remainingPercent,
              )}
            </Text>
            <Text style={[styles.pnlTotalLine, { color: pnlColor }]} numberOfLines={1}>
              {vi.journal.pnlTotalLine(formatSignedUsdt(pnlBreakdown.totalPnl))}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.pnlCell, { color: pnlColor }]} numberOfLines={1}>
              {pnl != null ? formatSignedUsdt(pnl) : '—'}
            </Text>
            {!isOpen && !isPending && entry.outcome.pnlPct != null ? (
              <Text style={[styles.pnlPctCell, { color: pnlColor }]}>
                {formatSignedPercent(entry.outcome.pnlPct)}
              </Text>
            ) : null}
          </>
        )}
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
  pnlBreakdownById,
  onDetail,
  onStopTrade,
  onConfirmFill,
  onCancelPending,
  paginated = true,
  pageSize = JOURNAL_TABLE_PAGE_SIZE,
  pageResetKey,
}: JournalTradeTableProps) {
  const [page, setPage] = useState(1);
  const esmBridge = useTradeStore((s) => s.esmBridge);

  useEffect(() => {
    setPage(1);
  }, [pageResetKey]);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const visibleEntries = useMemo(() => {
    if (!paginated) return entries;
    const start = (safePage - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [entries, paginated, safePage, pageSize]);

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
          {visibleEntries.map((entry) => (
            <JournalTradeRow
              key={entry.id}
              entry={entry}
              markBySymbol={markBySymbol}
              unrealizedPnl={unrealizedById[entry.id] ?? null}
              pnlBreakdown={pnlBreakdownById?.[entry.id]}
              advisorLabel={advisorLabelById?.[entry.id]}
              esmBridge={esmBridge}
              onDetail={onDetail}
              onStopTrade={onStopTrade}
              onConfirmFill={onConfirmFill}
              onCancelPending={onCancelPending}
            />
          ))}
        </View>
      </ScrollView>
      {paginated && entries.length > pageSize ? (
        <View style={styles.pagination}>
          <Pressable
            disabled={safePage <= 1}
            onPress={() => setPage(safePage - 1)}
            style={[styles.pageBtn, safePage <= 1 && styles.pageBtnDisabled, webPointer]}
          >
            <Text style={[styles.pageBtnText, safePage <= 1 && styles.pageBtnTextDisabled]}>
              {vi.journal.prevPage}
            </Text>
          </Pressable>
          <View style={styles.pageLabelWrap}>
            <Text style={styles.pageLabelPrefix}>Trang </Text>
            <View style={styles.pageCurrentPill}>
              <Text style={styles.pageCurrentText}>{safePage}</Text>
            </View>
            <Text style={styles.pageLabelSuffix}> / {totalPages}</Text>
          </View>
          <Pressable
            disabled={safePage >= totalPages}
            onPress={() => setPage(safePage + 1)}
            style={[styles.pageBtn, safePage >= totalPages && styles.pageBtnDisabled, webPointer]}
          >
            <Text
              style={[styles.pageBtnText, safePage >= totalPages && styles.pageBtnTextDisabled]}
            >
              {vi.journal.nextPage}
            </Text>
          </Pressable>
        </View>
      ) : null}
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
  sourceMuted: {
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  sourceBadgeWrap: {
    justifyContent: 'center',
  },
  sourceBadgeV41: {
    alignSelf: 'flex-start',
    backgroundColor: '#8B5CF6',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  sourceBadgeUnified: {
    alignSelf: 'flex-start',
    backgroundColor: '#8B5CF6',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  sourceBadgeUnifiedText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  sourceBadgeV41Text: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
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
  pnlLine: {
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 11,
    fontVariant: ['tabular-nums'],
  },
  pnlTotalLine: {
    fontSize: 9,
    fontWeight: '800',
    marginTop: 1,
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
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
  },
  pageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  pageBtnTextDisabled: {
    color: COLORS.textMuted,
  },
  pageLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 88,
    justifyContent: 'center',
  },
  pageLabelPrefix: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  pageLabelSuffix: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  pageCurrentPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.accent,
    marginHorizontal: 2,
  },
  pageCurrentText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.background,
    fontVariant: ['tabular-nums'],
  },
});

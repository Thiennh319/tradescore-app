import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, type AppTradeSymbol } from '../../constants/scoring';
import { PANEL, RADIUS, SPACING } from '../../constants/theme';
import { symbolLabelVi, vi } from '../../constants/vi';
import type { StoredTradeJournalEntry, TradeCloseReason } from '../../store/useTradeStore';
import { formatUsdPrice } from '../../utils/formatPrice';
import {
  formatSignedPercent,
  formatSignedUsdt,
} from '../../utils/positionPnl';
import { getClosedTradePnl, summarizeTradeHistory } from '../../utils/tradeHistory';
import { useTradeStore } from '../../store/useTradeStore';

const PAGE_SIZE = 5;

/** Bảng tổng hợp lịch sử lệnh đã đóng. */
export function TradeHistoryPanel() {
  const hydrated = useTradeStore((s) => s.hydrated);
  const lastSavedAt = useTradeStore((s) => s.lastSavedAt);
  const tradeJournal = useTradeStore((s) => s.tradeJournal);
  const aiTradeJournal = useTradeStore((s) => s.aiTradeJournal);
  const clearClosedTradeHistory = useTradeStore((s) => s.clearClosedTradeHistory);
  const [confirmClear, setConfirmClear] = useState(false);
  const [page, setPage] = useState(1);

  const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {};

  const closedEntries = useMemo(
    () => useTradeStore.getState().getClosedTradeHistory(),
    [tradeJournal, aiTradeJournal],
  );

  const totalPages = Math.max(1, Math.ceil(closedEntries.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageEntries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return closedEntries.slice(start, start + PAGE_SIZE);
  }, [closedEntries, page]);

  const summary = useMemo(
    () => summarizeTradeHistory(closedEntries),
    [closedEntries],
  );

  const totalPnlColor =
    summary.totalPnlUsdt >= 0 ? COLORS.bullish : COLORS.bearish;

  return (
    <View style={styles.panel}>
      <View style={styles.accentStrip} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{vi.tradeHistory.title}</Text>
            <Text style={styles.subtitle}>{vi.tradeHistory.subtitle}</Text>
            {hydrated ? (
              <Text style={styles.persistMeta}>
                Phase 1 · {aiTradeJournal.length} journal AI ·{' '}
                {lastSavedAt
                  ? `Lưu ${new Date(lastSavedAt).toLocaleString('vi-VN')}`
                  : 'Chưa ghi snapshot'}
              </Text>
            ) : (
              <Text style={styles.persistMeta}>Đang tải lịch sử đã lưu…</Text>
            )}
          </View>
          {closedEntries.length > 0 ? (
            confirmClear ? (
              <View style={styles.clearConfirmBox}>
                <Text style={styles.clearConfirmText}>
                  {vi.tradeHistory.clearConfirm(closedEntries.length)}
                </Text>
                <View style={styles.clearConfirmRow}>
                  <Pressable
                    onPress={() => setConfirmClear(false)}
                    style={[styles.clearCancelBtn, webPointer]}
                  >
                    <Text style={styles.clearCancelText}>{vi.tradeHistory.clearCancel}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void clearClosedTradeHistory();
                      setConfirmClear(false);
                      setPage(1);
                    }}
                    style={[styles.clearConfirmBtn, webPointer]}
                  >
                    <Text style={styles.clearConfirmBtnText}>
                      {vi.tradeHistory.clearConfirmBtn}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmClear(true)}
                style={[styles.clearBtn, webPointer]}
              >
                <Text style={styles.clearBtnText}>{vi.tradeHistory.clearAll}</Text>
              </Pressable>
            )
          ) : null}
        </View>

        <View style={styles.summaryGrid}>
          <SummaryTile label={vi.tradeHistory.total} value={String(summary.total)} />
          <SummaryTile
            label={vi.tradeHistory.wins}
            value={String(summary.wins)}
            color={COLORS.bullish}
          />
          <SummaryTile
            label={vi.tradeHistory.losses}
            value={String(summary.losses)}
            color={COLORS.bearish}
          />
          <SummaryTile
            label={vi.tradeHistory.winRate}
            value={
              summary.winRate != null ? `${summary.winRate.toFixed(0)}%` : '—'
            }
          />
          <SummaryTile
            label={vi.tradeHistory.totalPnl}
            value={formatSignedUsdt(summary.totalPnlUsdt)}
            color={totalPnlColor}
            wide
          />
        </View>

        {closedEntries.length === 0 ? (
          <Text style={styles.empty}>{vi.tradeHistory.empty}</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <HeadCell flex={1.1} text={vi.tradeHistory.colCoin} />
              <HeadCell flex={0.7} text={vi.tradeHistory.colEntry} />
              <HeadCell flex={0.7} text={vi.tradeHistory.colExit} />
              <HeadCell flex={0.9} text={vi.tradeHistory.colPnl} />
              <HeadCell flex={0.8} text={vi.tradeHistory.colReason} />
              <HeadCell flex={0.9} text={vi.tradeHistory.colTime} />
            </View>
            {pageEntries.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </View>
        )}
        {closedEntries.length > PAGE_SIZE ? (
          <HistoryPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            webPointer={webPointer}
          />
        ) : null}
      </View>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  color,
  wide,
}: {
  label: string;
  value: string;
  color?: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.summaryTile, wide && styles.summaryTileWide]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function HeadCell({ text, flex }: { text: string; flex: number }) {
  return (
    <Text style={[styles.headCell, { flex }]} numberOfLines={1}>
      {text}
    </Text>
  );
}

function HistoryRow({ entry }: { entry: StoredTradeJournalEntry }) {
  const symbol = entry.symbol as AppTradeSymbol;
  const isLong = entry.direction === 'LONG';
  const dirColor = isLong ? COLORS.bullish : COLORS.bearish;
  const { pnlUsdt, pnlPercent } = getClosedTradePnl(entry);
  const pnlColor =
    pnlUsdt == null ? COLORS.textMuted : pnlUsdt >= 0 ? COLORS.bullish : COLORS.bearish;
  const closedAt = entry.closedAt ?? entry.entryTime;
  const timeLabel = new Date(closedAt).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.tableRow}>
      <View style={[styles.cellCoin, { flex: 1.1 }]}>
        <Text style={styles.coinText}>
          {symbolLabelVi(symbol)}{' '}
          <Text style={{ color: dirColor }}>
            {isLong ? vi.activePosition.long : vi.activePosition.short}
          </Text>
        </Text>
        <Text style={styles.coinMeta}>{entry.leverage}x</Text>
      </View>
      <Text style={[styles.cell, { flex: 0.7 }]} numberOfLines={1}>
        {formatUsdPrice(symbol, entry.entryPrice)}
      </Text>
      <Text style={[styles.cell, { flex: 0.7 }]} numberOfLines={1}>
        {entry.exitPrice != null ? formatUsdPrice(symbol, entry.exitPrice) : '—'}
      </Text>
      <View style={{ flex: 0.9 }}>
        <Text style={[styles.pnlCell, { color: pnlColor }]}>
          {formatSignedUsdt(pnlUsdt)}
        </Text>
        <Text style={[styles.pnlPctCell, { color: pnlColor }]}>
          {formatSignedPercent(pnlPercent)}
        </Text>
      </View>
      <Text style={[styles.cell, styles.reasonCell, { flex: 0.8 }]} numberOfLines={2}>
        {formatCloseReason(entry.closeReason)}
      </Text>
      <Text style={[styles.cell, styles.timeCell, { flex: 0.9 }]} numberOfLines={2}>
        {timeLabel}
      </Text>
    </View>
  );
}

function formatCloseReason(reason?: TradeCloseReason): string {
  if (!reason) return vi.tradeHistory.closeReason.OTHER;
  return vi.tradeHistory.closeReason[reason] ?? vi.tradeHistory.closeReason.OTHER;
}

function HistoryPagination({
  page,
  totalPages,
  onPageChange,
  webPointer,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  webPointer: { cursor: 'pointer' } | Record<string, never>;
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <View style={styles.pagination}>
      <Pressable
        disabled={!canPrev}
        onPress={() => onPageChange(page - 1)}
        style={[styles.pageBtn, !canPrev && styles.pageBtnDisabled, webPointer]}
      >
        <Text style={[styles.pageBtnText, !canPrev && styles.pageBtnTextDisabled]}>
          {vi.tradeHistory.prevPage}
        </Text>
      </Pressable>
      <Text style={styles.pageLabel}>{vi.tradeHistory.pageLabel(page, totalPages)}</Text>
      <Pressable
        disabled={!canNext}
        onPress={() => onPageChange(page + 1)}
        style={[styles.pageBtn, !canNext && styles.pageBtnDisabled, webPointer]}
      >
        <Text style={[styles.pageBtnText, !canNext && styles.pageBtnTextDisabled]}>
          {vi.tradeHistory.nextPage}
        </Text>
      </Pressable>
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
    backgroundColor: COLORS.info,
  },
  body: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  headerText: {
    gap: 2,
    flex: 1,
    minWidth: 180,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  persistMeta: {
    marginTop: 4,
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.bearish,
    backgroundColor: 'rgba(246, 70, 93, 0.08)',
  },
  clearBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.bearish,
  },
  clearConfirmBox: {
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.bearish,
    backgroundColor: 'rgba(246, 70, 93, 0.06)',
    maxWidth: 280,
  },
  clearConfirmText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  clearConfirmRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  clearCancelBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  clearCancelText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  clearConfirmBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bearish,
    alignItems: 'center',
  },
  clearConfirmBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  summaryTile: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 88,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: 2,
  },
  summaryTileWide: {
    flexBasis: '100%',
  },
  summaryLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  table: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    gap: 4,
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
    paddingVertical: 10,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cellCoin: {
    gap: 1,
  },
  coinText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  coinMeta: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  cell: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  pnlCell: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pnlPctCell: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  reasonCell: {
    fontSize: 9,
    lineHeight: 13,
  },
  timeCell: {
    fontSize: 9,
    lineHeight: 13,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingTop: SPACING.xs,
  },
  pageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    minWidth: 64,
    alignItems: 'center',
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  pageBtnTextDisabled: {
    color: COLORS.textMuted,
  },
  pageLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
    minWidth: 72,
    textAlign: 'center',
  },
});

import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { JournalEntryCard } from '../components/JournalEntryCard';
import { CloseTradeModal } from '../components/journal/CloseTradeModal';
import { ConfirmFillModal } from '../components/journal/ConfirmFillModal';
import { JournalEntryDetail } from '../components/journal/JournalEntryDetail';
import {
  JournalFilterBar,
  type JournalStatusFilter,
} from '../components/journal/JournalFilterBar';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { COLORS, type AppTradeSymbol } from '../constants/scoring';
import { PANEL, SPACING } from '../constants/theme';
import { shareJournalCsv, shareSkippedSetupsCsv } from '../services/exportShare';
import { computeTradePnl, groupJournalByDate } from '../services/journalService';
import { useTradeStore } from '../store/useTradeStore';

export function JournalScreen() {
  const getVisibleAiJournal = useTradeStore((s) => s.getVisibleAiJournal);
  const getAccountHistory = useTradeStore((s) => s.getAccountHistory);
  const closeTradeEntry = useTradeStore((s) => s.closeTradeEntry);
  const confirmOrderFilled = useTradeStore((s) => s.confirmOrderFilled);
  const cancelPendingOrder = useTradeStore((s) => s.cancelPendingOrder);
  const skippedSetups = useTradeStore((s) => s.skippedSetups);
  const markPrices = useTradeStore((s) => s.tradeJournal);
  const leverage = useTradeStore((s) => s.settings.leverage) ?? 5;

  const [symbolFilter, setSymbolFilter] = useState<AppTradeSymbol | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<JournalStatusFilter>('ALL');
  const [detailEntry, setDetailEntry] = useState<AiTradeJournalEntry | null>(null);
  const [closeEntry, setCloseEntry] = useState<AiTradeJournalEntry | null>(null);
  const [fillEntry, setFillEntry] = useState<AiTradeJournalEntry | null>(null);

  const allVisible = getVisibleAiJournal();

  const entries = useMemo(() => {
    let list = [...allVisible];
    if (symbolFilter !== 'ALL') list = list.filter((e) => e.symbol === symbolFilter);
    if (statusFilter === 'OPEN') list = list.filter((e) => e.outcome.status === 'OPEN');
    else if (statusFilter === 'PENDING') list = list.filter((e) => e.outcome.status === 'PENDING');
    else if (statusFilter === 'WIN') list = list.filter((e) => e.outcome.status === 'WIN');
    else if (statusFilter === 'LOSS') list = list.filter((e) => e.outcome.status === 'LOSS');
    else if (statusFilter === 'CLOSED') {
      list = list.filter(
        (e) =>
          e.outcome.status !== 'OPEN' &&
          e.outcome.status !== 'PENDING',
      );
    }
    return list;
  }, [allVisible, symbolFilter, statusFilter]);

  const groups = useMemo(() => groupJournalByDate(entries), [entries]);

  const markBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of markPrices) {
      if (t.status !== 'OPEN' || !t.symbol) continue;
      map[t.symbol] = t.entryPrice;
    }
    return map;
  }, [markPrices]);

  const handleExport = async () => {
    try {
      await shareJournalCsv(allVisible, getAccountHistory());
      if (skippedSetups.some((e) => !e.archived)) {
        await shareSkippedSetupsCsv(skippedSetups);
      }
    } catch (e) {
      Alert.alert('Export', String(e));
    }
  };

  const handleCancelPending = (entry: AiTradeJournalEntry) => {
    Alert.alert(
      'Huỷ lệnh chờ',
      `Huỷ limit ${entry.symbol.replace('USDT', '')} ${entry.scoring.direction}?`,
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Huỷ lệnh',
          style: 'destructive',
          onPress: () => void cancelPendingOrder(entry.id),
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>📓 NHẬT KÝ LỆNH</Text>
      <Text style={styles.subtitle}>{allVisible.length} lệnh · snapshot đầy đủ cho AI</Text>

      <JournalFilterBar
        symbol={symbolFilter}
        status={statusFilter}
        onSymbolChange={setSymbolFilter}
        onStatusChange={setStatusFilter}
        onExportCsv={() => void handleExport()}
      />

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Chưa có lệnh. Từ Trade Plan bấm ✅ XÁC NHẬN VÀO LỆNH hoặc ⏳ ĐẶT LỆNH CHỜ để lưu snapshot.
          </Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.date} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{group.label}</Text>
            {group.items.map((entry) => {
              const mark = markBySymbol[entry.symbol];
              const unrealized =
                entry.outcome.status === 'OPEN' && mark != null
                  ? computeTradePnl(entry, mark, leverage).pnlUSDT
                  : null;
              return (
                <JournalEntryCard
                  key={entry.id}
                  entry={entry}
                  unrealizedPnl={unrealized}
                  onDetail={setDetailEntry}
                  onCloseTrade={setCloseEntry}
                  onConfirmFill={setFillEntry}
                  onCancelPending={handleCancelPending}
                />
              );
            })}
          </View>
        ))
      )}

      <JournalEntryDetail
        entry={detailEntry}
        visible={detailEntry != null}
        onClose={() => setDetailEntry(null)}
      />

      <CloseTradeModal
        visible={closeEntry != null}
        entry={closeEntry}
        markPrice={closeEntry ? markBySymbol[closeEntry.symbol] : null}
        onClose={() => setCloseEntry(null)}
        onConfirm={(result) => {
          if (!closeEntry) return;
          void closeTradeEntry(closeEntry.id, result).then(() => setCloseEntry(null));
        }}
      />

      <ConfirmFillModal
        visible={fillEntry != null}
        entry={fillEntry}
        onClose={() => setFillEntry(null)}
        onConfirm={(values) => {
          if (!fillEntry) return;
          void confirmOrderFilled(
            fillEntry.id,
            values.marketPriceAtFill,
            values.actualSL,
            values.actualSize,
          ).then(() => setFillEntry(null));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.md },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  dayGroup: { marginTop: SPACING.sm },
  dayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  empty: {
    ...PANEL,
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});

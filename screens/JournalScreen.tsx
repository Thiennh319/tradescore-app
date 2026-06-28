import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CloseTradeModal } from '../components/journal/CloseTradeModal';
import { ConfirmFillModal } from '../components/journal/ConfirmFillModal';
import { JournalEntryDetail } from '../components/journal/JournalEntryDetail';
import {
  JournalFilterBar,
  type JournalStatusFilter,
} from '../components/journal/JournalFilterBar';
import { JournalTradeTable } from '../components/journal/JournalTradeTable';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { COLORS, type AppTradeSymbol } from '../constants/scoring';
import { PANEL, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import { shareJournalCsv, shareSkippedSetupsCsv } from '../services/exportShare';
import { computeTradePnl } from '../services/journalService';
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
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [allVisible, symbolFilter, statusFilter]);

  const markBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of markPrices) {
      if (t.status !== 'OPEN' || !t.symbol) continue;
      map[t.symbol] = t.entryPrice;
    }
    return map;
  }, [markPrices]);

  const unrealizedById = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const entry of entries) {
      if (entry.outcome.status !== 'OPEN') continue;
      const mark = markBySymbol[entry.symbol];
      map[entry.id] =
        mark != null ? computeTradePnl(entry, mark, leverage).pnlUSDT : null;
    }
    return map;
  }, [entries, markBySymbol, leverage]);

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

  const handleStopTrade = (entry: AiTradeJournalEntry) => {
    Alert.alert(
      'Dừng lệnh',
      'Bạn có muốn dừng lệnh này không?',
      [
        { text: 'Không', style: 'cancel' },
        { text: 'Có', onPress: () => setCloseEntry(entry) },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{vi.journal.title}</Text>
        <Text style={styles.version}>{vi.journal.versionLabel}</Text>
        <Text style={styles.subtitle}>{vi.journal.subtitle(allVisible.length)}</Text>
      </View>

      <View style={styles.releaseBox}>
        <Text style={styles.releaseTitle}>{vi.journal.releaseTitle}</Text>
        {vi.journal.releaseNotes.map((note) => (
          <Text key={note} style={styles.releaseItem}>
            · {note}
          </Text>
        ))}
      </View>

      <JournalFilterBar
        symbol={symbolFilter}
        status={statusFilter}
        onSymbolChange={setSymbolFilter}
        onStatusChange={setStatusFilter}
        onExportCsv={() => void handleExport()}
      />

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{vi.journal.empty}</Text>
        </View>
      ) : (
        <JournalTradeTable
          entries={entries}
          markBySymbol={markBySymbol}
          unrealizedById={unrealizedById}
          onDetail={setDetailEntry}
          onStopTrade={handleStopTrade}
          onConfirmFill={setFillEntry}
          onCancelPending={handleCancelPending}
        />
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
  header: { gap: 2 },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.2,
  },
  version: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.accent,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  releaseBox: {
    ...PANEL,
    padding: SPACING.md,
    gap: 2,
  },
  releaseTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  releaseItem: {
    fontSize: 10,
    color: COLORS.textMuted,
    lineHeight: 15,
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

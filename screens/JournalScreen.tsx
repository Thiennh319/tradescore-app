import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CancelPendingConfirmModal } from '../components/journal/CancelPendingConfirmModal';
import { CloseTradeModal } from '../components/journal/CloseTradeModal';
import { ConfirmFillModal } from '../components/journal/ConfirmFillModal';
import { JournalEntryDetail } from '../components/journal/JournalEntryDetail';
import {
  JournalFilterBar,
  type JournalStatusFilter,
} from '../components/journal/JournalFilterBar';
import { JournalTradeTable } from '../components/journal/JournalTradeTable';
import { JournalPartialStats } from '../components/journal/JournalPartialStats';
import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { COLORS, type AppTradeSymbol } from '../constants/scoring';
import { PANEL, SPACING } from '../constants/theme';
import { vi } from '../constants/vi';
import { useJournalMarketSync, resolveJournalMarketPrice } from '../hooks/useJournalMarketSync';
import type { SignalRow } from '../hooks/useSignalBoard';
import type { SignalRowV41 } from '../services/v41/scanV41';
import { shareJournalCsv, shareSkippedSetupsCsv } from '../services/exportShare';
import { useTradeStore } from '../store/useTradeStore';

interface JournalScreenProps {
  signalRows: SignalRow[];
  v41Rows?: SignalRowV41[];
}

export function JournalScreen({ signalRows, v41Rows = [] }: JournalScreenProps) {
  const getVisibleAiJournal = useTradeStore((s) => s.getVisibleAiJournal);
  const getAccountHistory = useTradeStore((s) => s.getAccountHistory);
  const closeTradeEntry = useTradeStore((s) => s.closeTradeEntry);
  const confirmOrderFilled = useTradeStore((s) => s.confirmOrderFilled);
  const cancelPendingOrder = useTradeStore((s) => s.cancelPendingOrder);
  const skippedSetups = useTradeStore((s) => s.skippedSetups);
  const scorerVersion = useTradeStore((s) => s.scorerVersion);
  const scoringResultV4 = useTradeStore((s) => s.scoringResultV4);
  const scoringResultV3 = useTradeStore((s) => s.scoringResultV3);
  const lockedPlan = useTradeStore((s) => s.lockedPlan);
  const leverage = useTradeStore((s) => s.settings.leverage) ?? 5;

  const [symbolFilter, setSymbolFilter] = useState<AppTradeSymbol | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<JournalStatusFilter>('ALL');
  const [detailEntry, setDetailEntry] = useState<AiTradeJournalEntry | null>(null);
  const [closeEntry, setCloseEntry] = useState<AiTradeJournalEntry | null>(null);
  const [fillEntry, setFillEntry] = useState<AiTradeJournalEntry | null>(null);
  const [cancelEntry, setCancelEntry] = useState<AiTradeJournalEntry | null>(null);

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

  const { markBySymbol, unrealizedById, pnlBreakdownById, advisorLabelById } = useJournalMarketSync({
    entries,
    signalRows,
    v41Rows,
    leverage,
    scorerVersion,
    scoringResultV4,
    scoringResultV3,
    lockedPlan,
  });

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
    setCancelEntry(entry);
  };

  const handleStopTrade = (entry: AiTradeJournalEntry) => {
    setCloseEntry(entry);
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
          pageResetKey={`${symbolFilter}|${statusFilter}`}
          markBySymbol={markBySymbol}
          unrealizedById={unrealizedById}
          pnlBreakdownById={pnlBreakdownById}
          advisorLabelById={advisorLabelById}
          onDetail={setDetailEntry}
          onStopTrade={handleStopTrade}
          onConfirmFill={setFillEntry}
          onCancelPending={handleCancelPending}
        />
      )}

      <JournalPartialStats entries={allVisible} />

      <JournalEntryDetail
        entry={detailEntry}
        visible={detailEntry != null}
        onClose={() => setDetailEntry(null)}
      />

      <CloseTradeModal
        visible={closeEntry != null}
        entry={closeEntry}
        markPrice={closeEntry ? resolveJournalMarketPrice(closeEntry, markBySymbol) ?? null : null}
        signalRow={
          closeEntry
            ? signalRows.find((r) => r.symbol === closeEntry.symbol) ?? null
            : null
        }
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

      <CancelPendingConfirmModal
        visible={cancelEntry != null}
        entry={cancelEntry}
        onCancel={() => setCancelEntry(null)}
        onConfirm={() => {
          if (!cancelEntry) return;
          void cancelPendingOrder(cancelEntry.id).then(() => setCancelEntry(null));
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

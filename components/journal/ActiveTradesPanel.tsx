import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SignalRow } from '../../hooks/useSignalBoard';
import { useJournalMarketSync } from '../../hooks/useJournalMarketSync';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { COLORS } from '../../constants/scoring';
import { PANEL, SPACING } from '../../constants/theme';
import { vi } from '../../constants/vi';
import {
  getVisibleJournalEntries,
} from '../../services/journalService';
import { CancelPendingConfirmModal } from './CancelPendingConfirmModal';
import { CloseTradeModal } from './CloseTradeModal';
import { ConfirmFillModal } from './ConfirmFillModal';
import { JournalEntryDetail } from './JournalEntryDetail';
import { JournalTradeTable } from './JournalTradeTable';
import { useTradeStore } from '../../store/useTradeStore';

interface ActiveTradesPanelProps {
  signalRows: SignalRow[];
}

export function ActiveTradesPanel({ signalRows }: ActiveTradesPanelProps) {
  const aiTradeJournal = useTradeStore((s) => s.aiTradeJournal);
  const closeTradeEntry = useTradeStore((s) => s.closeTradeEntry);
  const confirmOrderFilled = useTradeStore((s) => s.confirmOrderFilled);
  const cancelPendingOrder = useTradeStore((s) => s.cancelPendingOrder);
  const scorerVersion = useTradeStore((s) => s.scorerVersion);
  const scoringResultV4 = useTradeStore((s) => s.scoringResultV4);
  const scoringResultV3 = useTradeStore((s) => s.scoringResultV3);
  const lockedPlan = useTradeStore((s) => s.lockedPlan);
  const leverage = useTradeStore((s) => s.settings.leverage) ?? 5;

  const [detailEntry, setDetailEntry] = useState<AiTradeJournalEntry | null>(null);
  const [closeEntry, setCloseEntry] = useState<AiTradeJournalEntry | null>(null);
  const [fillEntry, setFillEntry] = useState<AiTradeJournalEntry | null>(null);
  const [cancelEntry, setCancelEntry] = useState<AiTradeJournalEntry | null>(null);

  const activeEntries = useMemo(() => {
    return getVisibleJournalEntries(aiTradeJournal)
      .filter((e) => e.outcome.status === 'OPEN' || e.outcome.status === 'PENDING')
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [aiTradeJournal]);

  const { markBySymbol, unrealizedById, pnlBreakdownById, advisorLabelById } = useJournalMarketSync({
    entries: activeEntries,
    signalRows,
    leverage,
    scorerVersion,
    scoringResultV4,
    scoringResultV3,
    lockedPlan,
  });

  const handleCancelPending = (entry: AiTradeJournalEntry) => {
    setCancelEntry(entry);
  };

  const handleStopTrade = (entry: AiTradeJournalEntry) => {
    setCloseEntry(entry);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.accentStrip} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{vi.journal.activeTradesTitle}</Text>
            <Text style={styles.subtitle}>{vi.journal.activeTradesSubtitle(activeEntries.length)}</Text>
          </View>
        </View>

        {activeEntries.length === 0 ? (
          <Text style={styles.empty}>{vi.journal.activeTradesEmpty}</Text>
        ) : (
          <JournalTradeTable
            entries={activeEntries}
            pageResetKey={`active-${activeEntries.length}`}
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
      </View>

      <JournalEntryDetail
        entry={detailEntry}
        visible={detailEntry != null}
        onClose={() => setDetailEntry(null)}
      />

      <CloseTradeModal
        visible={closeEntry != null}
        entry={closeEntry}
        markPrice={closeEntry ? markBySymbol[closeEntry.symbol] : null}
        signalRow={closeEntry ? signalRows.find((r) => r.symbol === closeEntry.symbol) ?? null : null}
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
    gap: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  empty: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
});

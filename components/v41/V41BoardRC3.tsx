import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/theme';
import type { SignalRowV41 } from '../../services/v41/scanV41';
import { useV41TradeSessionStore } from '../../store/useV41TradeSessionStore';
import { buildRc3Cards } from './buildRc3Cards';
import { V41ExecutionMonitor } from './V41ExecutionMonitor';
import { V41SignalPanel } from './V41SignalPanel';
import { V41_RC3_SYMBOLS, type V41Rc3SignalCardModel } from './v41Rc3Types';

type Props = {
  /**
   * ViewModel inject từ tầng trên (Core orchestrator).
   * UI KHÔNG tự gọi Engine — chỉ render.
   */
  cards?: V41Rc3SignalCardModel[];
  /** Scan rows — truyền xuống panel để Export MI (copy-only). */
  rows?: readonly SignalRowV41[];
  loading?: boolean;
  lastScannedAt?: number | null;
  onRequestScan?: () => void;
};

/**
 * V4.1 RC3 board — Signal Panel + Execution Monitor.
 * Task 10.1 — polish UX only (Last Scan / Trigger col / button lock / Updating).
 */
export function V41BoardRC3({
  cards: cardsOverride,
  rows = [],
  loading = false,
}: Props) {
  const createSession = useV41TradeSessionStore((s) => s.createSession);
  const sessions = useV41TradeSessionStore((s) => s.sessions);

  const cards = useMemo(
    () =>
      cardsOverride != null && cardsOverride.length > 0
        ? cardsOverride
        : buildRc3Cards([...V41_RC3_SYMBOLS]),
    [cardsOverride],
  );

  const lockedSymbols = useMemo(() => {
    const locked = new Set<string>();
    for (const session of sessions) {
      if (session.status === 'Pending' || session.status === 'Running') {
        locked.add(session.symbol);
      }
    }
    return locked;
  }, [sessions]);

  const openFromCard = useCallback(
    (card: V41Rc3SignalCardModel, action: 'LONG' | 'SHORT') => {
      if (card.decision !== action || card.levels == null) return;
      if (lockedSymbols.has(card.symbol)) return;
      createSession({
        symbol: card.symbol,
        action,
        entry: card.levels.entry,
        stop: card.levels.stop,
        tp: card.levels.tp1,
        tp2: card.levels.tp2,
        tp3: card.levels.tp3,
        triggerType: card.triggerType,
      });
    },
    [createSession, lockedSymbols],
  );

  return (
    <View style={styles.root}>
      <V41SignalPanel
        cards={cards}
        rows={rows}
        loading={loading}
        lockedSymbols={lockedSymbols}
        onOpenLong={(card) => openFromCard(card, 'LONG')}
        onOpenShort={(card) => openFromCard(card, 'SHORT')}
      />

      <V41ExecutionMonitor />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.xl,
  },
});

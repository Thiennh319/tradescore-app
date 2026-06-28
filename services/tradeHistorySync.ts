import type { AiTradeJournalEntry, TradeExitReason } from '../constants/aiJournal';
import type {
  StoredTradeJournalEntry,
  TradeCloseReason,
  TradeJournalStatus,
} from '../store/useTradeStore';

function isClosedAiStatus(status: AiTradeJournalEntry['outcome']['status']): boolean {
  return status !== 'OPEN' && status !== 'PENDING';
}

export function exitReasonToCloseReason(reason?: TradeExitReason): TradeCloseReason {
  switch (reason) {
    case 'TP1_HIT':
      return 'TP1';
    case 'TP2_HIT':
      return 'TP2';
    case 'TP3_HIT':
      return 'TP3';
    case 'SL_HIT':
      return 'SL';
    case 'MANUAL_CLOSE':
    case 'OFFLINE_CLOSE':
      return 'MANUAL_STOP';
    case 'BE_CLOSE':
      return 'OTHER';
  }
  return 'OTHER';
}

/** Chuyển lệnh AI journal đã đóng sang định dạng legacy cho bảng lịch sử. */
export function aiClosedEntryToLegacy(entry: AiTradeJournalEntry): StoredTradeJournalEntry {
  const exitTs = entry.outcome.exitTimestamp ?? entry.timestamp;
  return {
    id: `ai-${entry.id}`,
    symbol: entry.symbol,
    direction: entry.scoring.direction,
    entryPrice: entry.market.entryPrice,
    entryTime: entry.timestamp,
    leverage: 5,
    size: entry.plan.sizeActual,
    stopLoss: entry.plan.slActual,
    takeProfit1: entry.plan.tp1Actual,
    takeProfit2: entry.plan.tp2,
    takeProfit3: entry.plan.tp3,
    status: 'CLOSED' satisfies TradeJournalStatus,
    closedAt: exitTs,
    exitPrice: entry.outcome.exitPrice,
    closeReason: exitReasonToCloseReason(entry.outcome.exitReason),
    realizedPnlUsdt: entry.outcome.pnlUSDT,
    realizedPnlPercent: entry.outcome.pnlPct,
    notes: entry.outcome.notes,
    strategySource: entry.strategySource,
  };
}

function legacyClosedKey(entry: StoredTradeJournalEntry): string {
  return `${entry.symbol}|${entry.direction}|${entry.entryTime}|${entry.entryPrice}`;
}

function aiClosedKey(entry: AiTradeJournalEntry): string {
  return `${entry.symbol}|${entry.scoring.direction}|${entry.timestamp}|${entry.market.entryPrice}`;
}

/** Gộp lịch sử đóng từ legacy journal + AI journal (không trùng). */
export function mergeClosedTradeHistory(
  legacyJournal: StoredTradeJournalEntry[],
  aiJournal: AiTradeJournalEntry[],
): StoredTradeJournalEntry[] {
  const legacyClosed = legacyJournal.filter((e) => e.status === 'CLOSED');
  const legacyKeys = new Set(legacyClosed.map(legacyClosedKey));

  const fromAi = aiJournal
    .filter((e) => isClosedAiStatus(e.outcome.status))
    .filter((e) => !legacyKeys.has(aiClosedKey(e)))
    .map(aiClosedEntryToLegacy);

  return [...legacyClosed, ...fromAi].sort(
    (a, b) => (b.closedAt ?? b.entryTime) - (a.closedAt ?? a.entryTime),
  );
}

/** Bổ sung lệnh đóng từ AI vào legacy journal nếu thiếu (sau migrate / đổi port). */
export function syncLegacyJournalClosedFromAi(
  legacyJournal: StoredTradeJournalEntry[],
  aiJournal: AiTradeJournalEntry[],
): StoredTradeJournalEntry[] {
  const openOrPending = legacyJournal.filter((e) => e.status !== 'CLOSED');
  const mergedClosed = mergeClosedTradeHistory(legacyJournal, aiJournal);
  return [...openOrPending, ...mergedClosed];
}

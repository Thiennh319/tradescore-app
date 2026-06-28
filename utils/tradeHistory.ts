import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import { computePositionPnl } from './positionPnl';

export interface ClosedTradePnl {
  pnlUsdt: number | null;
  pnlPercent: number | null;
}

export interface TradeHistorySummary {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  totalPnlUsdt: number;
}

/** PnL thực tế của lệnh đã đóng — ưu tiên số đã lưu khi stop. */
export function getClosedTradePnl(entry: StoredTradeJournalEntry): ClosedTradePnl {
  if (entry.realizedPnlUsdt != null && Number.isFinite(entry.realizedPnlUsdt)) {
    return {
      pnlUsdt: entry.realizedPnlUsdt,
      pnlPercent: entry.realizedPnlPercent ?? null,
    };
  }

  if (entry.exitPrice != null) {
    const snap = computePositionPnl(entry, entry.exitPrice);
    return { pnlUsdt: snap.pnlUsdt, pnlPercent: snap.pnlPercent };
  }

  return { pnlUsdt: null, pnlPercent: null };
}

export function summarizeTradeHistory(
  closedEntries: StoredTradeJournalEntry[],
): TradeHistorySummary {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let totalPnlUsdt = 0;
  let counted = 0;

  for (const entry of closedEntries) {
    const { pnlUsdt } = getClosedTradePnl(entry);
    if (pnlUsdt == null || !Number.isFinite(pnlUsdt)) continue;
    counted += 1;
    totalPnlUsdt += pnlUsdt;
    if (pnlUsdt > 0) wins += 1;
    else if (pnlUsdt < 0) losses += 1;
    else breakeven += 1;
  }

  return {
    total: closedEntries.length,
    wins,
    losses,
    breakeven,
    winRate: counted > 0 ? (wins / counted) * 100 : null,
    totalPnlUsdt,
  };
}

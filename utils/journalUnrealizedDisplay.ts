import type { AiTradeJournalEntry } from '../constants/aiJournal';
import type { JournalPnlBreakdown } from '../services/journalService';
import {
  sumPartialClosePercent,
  sumRealizedPartialPnl,
} from '../services/partialClose';

/**
 * UI-only unrealized PnL for OPEN trades from latest market vs entry.
 * LONG:  (Market − Entry) × qty
 * SHORT: (Entry − Market) × qty
 * qty = (margin × leverage) / entry
 */
export function computeOpenUnrealizedPnlUsdt(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  marketPrice: number | null | undefined,
  marginUsdt: number,
  leverage: number,
): number | null {
  if (entryPrice <= 0 || !Number.isFinite(entryPrice)) return null;
  if (marketPrice == null || !Number.isFinite(marketPrice)) return null;
  if (!(marginUsdt > 0) || !(leverage > 0)) return null;

  const priceDelta =
    direction === 'LONG' ? marketPrice - entryPrice : entryPrice - marketPrice;
  const quantity = (marginUsdt * leverage) / entryPrice;
  return quantity * priceDelta;
}

/** OPEN-only PnL breakdown for journal UI — closed trades must use stored outcome. */
export function buildOpenPnlBreakdownDisplay(
  entry: AiTradeJournalEntry,
  marketPrice: number | null | undefined,
  leverage: number,
): JournalPnlBreakdown {
  const partials = entry.partialCloses ?? [];
  const closedPercent = sumPartialClosePercent(partials);
  const hasPartial = closedPercent > 0;
  const realizedPnl = sumRealizedPartialPnl(partials);
  const lev = leverage > 0 ? leverage : 1;

  const unrealizedPnl = computeOpenUnrealizedPnlUsdt(
    entry.scoring.direction,
    entry.market.entryPrice,
    marketPrice,
    entry.plan.sizeActual,
    lev,
  );

  const totalPnl = unrealizedPnl != null ? realizedPnl + unrealizedPnl : null;

  return {
    hasPartial,
    closedPercent,
    remainingPercent: Math.max(0, 100 - closedPercent),
    realizedPnl,
    unrealizedPnl,
    totalPnl,
  };
}

import type { JournalDirection } from '../constants/aiJournal';
import type { TradeDirection } from '../constants/scoring';
import { computeSlippagePct } from './journalService';

export interface ResolvedOrderFill {
  /** Giá entry trên lệnh (limit / stop / trigger) lúc đặt. */
  orderEntryPrice: number;
  /** Giá market tại thời điểm khớp. */
  marketPriceAtFill: number;
  /** Giá entry ghi nhận cho PnL / R:R — có thể khác orderEntryPrice. */
  actualEntryPrice: number;
  /** true khi rule slippage/adverse điều chỉnh actualEntryPrice. */
  entryAdjusted: boolean;
}

function normalizePrice(price: number): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

/**
 * Quy tắc khớp lệnh thống nhất (limit + stop/trigger):
 * - LONG:  order > market → actual = market (không ghi nhận entry rẻ hơn thực tế)
 * - SHORT: order < market → actual = market
 */
export function resolveActualEntryPrice(
  direction: TradeDirection | JournalDirection,
  orderEntryPrice: number,
  marketPriceAtFill: number,
): ResolvedOrderFill | null {
  const order = normalizePrice(orderEntryPrice);
  const market = normalizePrice(marketPriceAtFill);
  if (order == null || market == null) return null;

  let actualEntryPrice = order;
  let entryAdjusted = false;

  if (direction === 'LONG' && order > market) {
    actualEntryPrice = market;
    entryAdjusted = true;
  } else if (direction === 'SHORT' && order < market) {
    actualEntryPrice = market;
    entryAdjusted = true;
  }

  return {
    orderEntryPrice: order,
    marketPriceAtFill: market,
    actualEntryPrice,
    entryAdjusted,
  };
}

export function resolveOrderFillWithSlippage(
  direction: TradeDirection | JournalDirection,
  orderEntryPrice: number,
  marketPriceAtFill: number,
  entryZoneOptimal: number,
): (ResolvedOrderFill & { slippagePct: number }) | null {
  const resolved = resolveActualEntryPrice(direction, orderEntryPrice, marketPriceAtFill);
  if (!resolved) return null;
  return {
    ...resolved,
    slippagePct: computeSlippagePct(resolved.actualEntryPrice, entryZoneOptimal),
  };
}

/** Ghi audit trail dạng text (log / notes). */
export function formatFillAuditNote(resolved: ResolvedOrderFill): string {
  if (!resolved.entryAdjusted) {
    return `Fill: order=${resolved.orderEntryPrice}, market=${resolved.marketPriceAtFill}, actual=${resolved.actualEntryPrice}`;
  }
  return (
    `Fill (adjusted): order=${resolved.orderEntryPrice}, market=${resolved.marketPriceAtFill}, ` +
    `actual=${resolved.actualEntryPrice}`
  );
}

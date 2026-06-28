import type { TradeDirection } from '../constants/scoring';

/** Giá đã chạm mức entry limit — sẵn sàng khớp lệnh chờ. */
export function isPendingEntryFilled(
  direction: TradeDirection,
  markPrice: number,
  limitEntryPrice: number,
): boolean {
  if (!Number.isFinite(markPrice) || !Number.isFinite(limitEntryPrice) || limitEntryPrice <= 0) {
    return false;
  }
  return direction === 'LONG'
    ? markPrice <= limitEntryPrice
    : markPrice >= limitEntryPrice;
}

/** Khoảng cách % còn lại tới entry limit (0 = đã chạm / sắp khớp). */
export function pendingEntryDistancePercent(
  direction: TradeDirection,
  markPrice: number,
  limitEntryPrice: number,
): number | null {
  if (!Number.isFinite(markPrice) || !Number.isFinite(limitEntryPrice) || limitEntryPrice <= 0) {
    return null;
  }
  if (isPendingEntryFilled(direction, markPrice, limitEntryPrice)) {
    return 0;
  }
  if (direction === 'LONG') {
    return ((markPrice - limitEntryPrice) / markPrice) * 100;
  }
  return ((limitEntryPrice - markPrice) / markPrice) * 100;
}

import type { StoredTradeJournalEntry } from '../store/useTradeStore';

export interface PositionPnlSnapshot {
  markPrice: number | null;
  pnlUsdt: number | null;
  /** ROE trên margin (%), đã nhân đòn bẩy */
  pnlPercent: number | null;
  notionalUsdt: number | null;
}

type PositionLike = Pick<
  StoredTradeJournalEntry,
  'direction' | 'entryPrice' | 'leverage' | 'size'
>;

export function computePositionPnl(
  entry: PositionLike,
  markPrice: number | null | undefined,
  fallbackPnlPercent?: number | null,
): PositionPnlSnapshot {
  const notionalUsdt =
    entry.size > 0 && entry.leverage > 0 ? entry.size * entry.leverage : null;

  if (
    markPrice != null &&
    Number.isFinite(markPrice) &&
    entry.entryPrice > 0 &&
    entry.leverage > 0 &&
    entry.size > 0
  ) {
    const rawMove =
      entry.direction === 'LONG'
        ? (markPrice - entry.entryPrice) / entry.entryPrice
        : (entry.entryPrice - markPrice) / entry.entryPrice;
    const pnlPercent = rawMove * 100 * entry.leverage;
    const pnlUsdt = entry.size * (pnlPercent / 100);
    return { markPrice, pnlUsdt, pnlPercent, notionalUsdt };
  }

  if (fallbackPnlPercent != null && entry.size > 0) {
    const pnlUsdt = entry.size * (fallbackPnlPercent / 100);
    return {
      markPrice: null,
      pnlUsdt,
      pnlPercent: fallbackPnlPercent,
      notionalUsdt,
    };
  }

  return { markPrice: null, pnlUsdt: null, pnlPercent: null, notionalUsdt };
}

export function formatSignedUsdt(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)} USDT`;
}

export function formatSignedPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

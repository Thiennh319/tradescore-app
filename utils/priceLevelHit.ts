import type { TradeDirection } from '../constants/scoring';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';

export type PriceAlertKind = 'SL' | 'TP1' | 'TP2' | 'TP3';

export interface PriceLevelHit {
  kind: PriceAlertKind;
  levelPrice: number;
}

const LEVEL_FIELDS: Array<{ kind: PriceAlertKind; key: keyof StoredTradeJournalEntry }> = [
  { kind: 'SL', key: 'stopLoss' },
  { kind: 'TP1', key: 'takeProfit1' },
  { kind: 'TP2', key: 'takeProfit2' },
  { kind: 'TP3', key: 'takeProfit3' },
];

/** Giá đã chạm mức SL hoặc TP theo hướng lệnh. */
export function isPriceLevelHit(
  direction: TradeDirection,
  currentPrice: number,
  levelPrice: number,
  kind: PriceAlertKind,
): boolean {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(levelPrice) || levelPrice <= 0) {
    return false;
  }

  if (kind === 'SL') {
    return direction === 'LONG' ? currentPrice <= levelPrice : currentPrice >= levelPrice;
  }

  return direction === 'LONG' ? currentPrice >= levelPrice : currentPrice <= levelPrice;
}

/** Các mức SL/TP chưa báo và đã bị giá chạm. */
export function detectNewPriceLevelHits(
  entry: StoredTradeJournalEntry,
  currentPrice: number,
): PriceLevelHit[] {
  const fired = new Set(entry.priceAlertsFired ?? []);
  const hits: PriceLevelHit[] = [];

  for (const { kind, key } of LEVEL_FIELDS) {
    if (fired.has(kind)) continue;
    const levelPrice = entry[key];
    if (typeof levelPrice !== 'number' || !Number.isFinite(levelPrice)) continue;
    if (isPriceLevelHit(entry.direction, currentPrice, levelPrice, kind)) {
      hits.push({ kind, levelPrice });
    }
  }

  return hits;
}

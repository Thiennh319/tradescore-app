import type { AppTradeSymbol } from '../constants/scoring';
import { symbolLabelVi, vi } from '../constants/vi';
import { formatUsdPrice } from '../utils/formatPrice';
import type { PriceAlertKind } from '../utils/priceLevelHit';

export interface PriceAlertPayload {
  symbol: AppTradeSymbol;
  direction: 'LONG' | 'SHORT';
  kind: PriceAlertKind;
  levelPrice: number;
  markPrice: number;
}

export interface PriceAlertMessage {
  title: string;
  body: string;
  tag: string;
}

export function buildPriceAlertMessage(payload: PriceAlertPayload): PriceAlertMessage {
  const coin = symbolLabelVi(payload.symbol);
  const dir = payload.direction === 'LONG' ? vi.activePosition.long : vi.activePosition.short;
  const levelLabel = vi.priceAlert.levelLabel(payload.kind);
  const mark = formatUsdPrice(payload.symbol, payload.markPrice);
  const target = formatUsdPrice(payload.symbol, payload.levelPrice);

  return {
    title: vi.priceAlert.title(coin, dir, levelLabel),
    body: vi.priceAlert.body(mark, target),
    tag: `tradescore-price-${payload.symbol}-${payload.kind}`,
  };
}

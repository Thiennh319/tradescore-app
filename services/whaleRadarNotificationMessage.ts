import type { AppTradeSymbol } from '../constants/scoring';
import { symbolLabelVi, vi } from '../constants/vi';
import type { WhaleRadarEvent } from './whaleRadarDetect';

function formatPrice(price: number): string {
  return price.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function sideLabelVi(side: WhaleRadarEvent['side']): string {
  return side === 'BID' ? vi.whaleRadar.sideBuy : vi.whaleRadar.sideSell;
}

/** Một dòng thông báo ngắn — dùng cho toast in-app và thông báo OS. */
export function formatWhaleEventLine(event: WhaleRadarEvent): string {
  const coin = symbolLabelVi(event.symbol as AppTradeSymbol);
  const priceStr = formatPrice(event.price);
  const side = sideLabelVi(event.side);
  if (event.kind === 'WALL_PLACED') {
    return vi.whaleRadar.placed(coin, side, priceStr);
  }
  return vi.whaleRadar.pulled(coin, side, priceStr);
}

export function buildWhaleRadarMessage(event: WhaleRadarEvent): {
  title: string;
  body: string;
  tag: string;
  requireInteraction: boolean;
} {
  const body = formatWhaleEventLine(event);
  const tag = `whale-${event.kind}-${event.symbol}-${event.side}-${formatPrice(event.price)}`;

  return {
    title: vi.whaleRadar.notifyTitle,
    body,
    tag,
    requireInteraction: event.kind === 'WALL_PULLED',
  };
}

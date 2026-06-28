import type { Kline } from './binanceApi';
import { calculateATR, klinesToOHLCV } from './indicators';

/** ATR(14) tuyệt đối trên khung 1H — cùng công thức Trade Plan / L4 Bollinger. */
export function computeAtr1hFromKlines(
  klines: Kline[],
  currentPrice: number,
  period = 14,
): number {
  const fallbackPrice =
    currentPrice > 0 ? currentPrice : (klines[klines.length - 1]?.close ?? 0);
  const atrFallback = fallbackPrice * 0.015;
  if (klines.length < 2) return atrFallback;
  const ohlcv = klinesToOHLCV(klines);
  const atrSeries = calculateATR(ohlcv.high, ohlcv.low, ohlcv.close, period);
  for (let i = atrSeries.length - 1; i >= 0; i--) {
    if (Number.isFinite(atrSeries[i]) && atrSeries[i] > 0) return atrSeries[i];
  }
  return atrFallback;
}

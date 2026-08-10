import {
  HARD_BLOCK_RULES_V4,
  XRP_CVD_SOFT_PCT_OF_24H_QUOTE,
} from '../constants/scoring';
import type { CVDPoint } from './indicators';

type QuoteBar = { volume: number; close: number };

/** Sum quote volume over the last 24 1H bars (volume × close). */
export function quoteVolume24hFromKlines(klines1h: QuoteBar[]): number {
  return klines1h.slice(-24).reduce((s, k) => s + k.volume * k.close, 0);
}

/**
 * Scale base-asset CVD so production mild ±500K maps onto softPct × 24h quote (USD).
 * hard Short ±2M / deep −20M keep production ratios automatically.
 */
export function scaleCvdPointsToXrpVolRel(
  points: CVDPoint[],
  price: number,
  quote24h: number,
  softPct: number = XRP_CVD_SOFT_PCT_OF_24H_QUOTE,
): CVDPoint[] {
  if (points.length === 0) return points;
  const softUsd = softPct * Math.max(1, quote24h);
  const mildAbs = Math.abs(HARD_BLOCK_RULES_V4.CVD_MILD_NEGATIVE);
  const px = Number.isFinite(price) && price > 0 ? price : 0;
  if (!(softUsd > 0) || !(px > 0) || !(mildAbs > 0)) return points;
  const factor = (px * mildAbs) / softUsd;
  return points.map((p) => ({ ...p, cvd: p.cvd * factor }));
}

/**
 * Option A SSOT: only XRPUSDT is scaled; peers return the same array reference.
 */
export function applyXrpOnlyCvdVolRelScale(
  symbol: string,
  cvdPoints: CVDPoint[],
  currentPrice: number,
  klines1h: QuoteBar[],
): CVDPoint[] {
  // Research/backtest escape hatch: absolute CVD for all symbols (incl. XRP).
  if (process.env.TRADESCORE_FORCE_ABSOLUTE_CVD === '1') return cvdPoints;
  if (symbol !== 'XRPUSDT') return cvdPoints;
  if (!cvdPoints.length) return cvdPoints;
  const q24 = quoteVolume24hFromKlines(klines1h);
  return scaleCvdPointsToXrpVolRel(
    cvdPoints,
    currentPrice,
    q24,
    XRP_CVD_SOFT_PCT_OF_24H_QUOTE,
  );
}

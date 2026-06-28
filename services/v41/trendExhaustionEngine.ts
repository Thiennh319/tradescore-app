import { calculateRSI, calculateEMA } from './indicators';
import type { KlineV41 } from './indicators';
import type { TrendDirection } from './types';

/**
 * Bước 1 Engine 2 — RSI Extreme Score (0-30 điểm).
 * Theo V4.1_FORMULAS.md Engine 2 Bước 1.
 */
export function calculateRSIExtremeScore(rsiValue: number): number {
  if (!Number.isFinite(rsiValue)) return 0;
  if (rsiValue > 75 || rsiValue < 25) return 30;
  if ((rsiValue >= 70 && rsiValue <= 75) || (rsiValue >= 25 && rsiValue < 30)) return 20;
  if ((rsiValue >= 60 && rsiValue < 70) || (rsiValue >= 30 && rsiValue < 40)) return 10;
  return 0; // 40-60: vùng trung tính
}

/**
 * Bước 2 Engine 2 — Distance From EMA20 Score (0-30 điểm).
 * Theo V4.1_FORMULAS.md Engine 2 Bước 2.
 * distancePercent = |price - EMA20| / EMA20 × 100
 */
export function calculateDistanceEMA20Score(distancePercent: number): number {
  if (!Number.isFinite(distancePercent)) return 0;
  const absDistance = Math.abs(distancePercent);
  if (absDistance > 8) return 30;
  if (absDistance >= 5) return 20;
  if (absDistance >= 3) return 10;
  return 0;
}

/**
 * Bước 3 Engine 2 — Volume Divergence Score (0-20 điểm).
 * Theo V4.1_FORMULAS.md Engine 2 Bước 3.
 * "new high/low" = giá close hiện tại là close cao/thấp nhất
 * trong 20 nến gần nhất (bao gồm chính nó).
 * volumeMA20 = trung bình volume 20 nến TRƯỚC (không gồm nến hiện tại).
 */
export function calculateVolumeDivergenceScore(
  klines: KlineV41[],
  trendDirection: TrendDirection,
): number {
  const n = klines.length;
  if (n < 21) return 0; // cần 20 nến trước + 1 nến hiện tại

  const currentIdx = n - 1;
  const current = klines[currentIdx];

  // 20 nến gần nhất bao gồm chính nó: index [n-20, n-1]
  const last20Closes = klines.slice(n - 20, n).map((k) => k.close);
  const isNewHigh = current.close === Math.max(...last20Closes);
  const isNewLow = current.close === Math.min(...last20Closes);

  const triggeredByTrend =
    (trendDirection === 'BULL' && isNewHigh) ||
    (trendDirection === 'BEAR' && isNewLow);

  if (!triggeredByTrend) return 0;

  // volumeMA20: 20 nến TRƯỚC nến hiện tại, index [n-21, n-2]
  const prev20Volumes = klines.slice(n - 21, n - 1).map((k) => k.volume);
  const volumeMA20 =
    prev20Volumes.reduce((sum, v) => sum + v, 0) / prev20Volumes.length;

  const volumeWeak = current.volume < volumeMA20 * 0.8;

  return volumeWeak ? 20 : 0;
}

/**
 * Bước 4 Engine 2 — Candle Streak Score (0-20 điểm).
 * Theo V4.1_FORMULAS.md Engine 2 Bước 4.
 * Đếm số nến liên tiếp CÙNG MÀU (close > open = xanh, close < open
 * = đỏ) tính từ nến gần nhất lùi về trước.
 */
export function calculateCandleStreakScore(klines: KlineV41[]): number {
  const n = klines.length;
  if (n === 0) return 0;

  const isGreen = (k: KlineV41) => k.close > k.open;
  const isRed = (k: KlineV41) => k.close < k.open;

  const lastCandle = klines[n - 1];
  const lastIsGreen = isGreen(lastCandle);
  const lastIsRed = isRed(lastCandle);

  if (!lastIsGreen && !lastIsRed) return 0; // nến doji, không tính streak

  let streak = 1;
  for (let i = n - 2; i >= 0; i--) {
    const candle = klines[i];
    const sameColor = lastIsGreen ? isGreen(candle) : isRed(candle);
    if (!sameColor) break;
    streak++;
  }

  if (streak >= 7) return 20;
  if (streak >= 5) return 12;
  return 0;
}

/**
 * Engine 2 — Trend Exhaustion tổng hợp (0-100).
 * Theo V4.1_FORMULAS.md Engine 2 — ghép Bước 1+2+3+4.
 * Nhận klines + trendDirection (từ Engine 1), tự tính RSI/EMA20
 * bên trong.
 */
export function calculateTrendExhaustion(
  klines: KlineV41[],
  trendDirection: TrendDirection,
): {
  trendExhaustion: number;
  rsiExtremeScore: number;
  distanceEMA20Score: number;
  volumeDivergencePts: 0 | 20;
  candleStreakScore: number;
} {
  const closes = klines.map((k) => k.close);
  const rsiValues = calculateRSI(closes, 14);
  const ema20Values = calculateEMA(closes, 20);

  const lastIdx = klines.length - 1;
  const lastRsi = rsiValues[lastIdx];
  const lastEma20 = ema20Values[lastIdx];
  const lastPrice = closes[lastIdx];

  // Thiếu dữ liệu → trả 0 toàn bộ, không suy đoán
  if (!Number.isFinite(lastRsi) || !Number.isFinite(lastEma20)) {
    return {
      trendExhaustion: 0,
      rsiExtremeScore: 0,
      distanceEMA20Score: 0,
      volumeDivergencePts: 0,
      candleStreakScore: 0,
    };
  }

  const rsiExtremeScore = calculateRSIExtremeScore(lastRsi);

  const distancePercent = ((lastPrice - lastEma20) / lastEma20) * 100;
  const distanceEMA20Score = calculateDistanceEMA20Score(distancePercent);

  const volumeDivergencePts: 0 | 20 =
    calculateVolumeDivergenceScore(klines, trendDirection) === 20 ? 20 : 0;

  const candleStreakScore = calculateCandleStreakScore(klines);

  const trendExhaustion = Math.min(
    100,
    rsiExtremeScore + distanceEMA20Score + volumeDivergencePts + candleStreakScore,
  );

  return {
    trendExhaustion,
    rsiExtremeScore,
    distanceEMA20Score,
    volumeDivergencePts,
    candleStreakScore,
  };
}

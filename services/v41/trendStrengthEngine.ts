import type { TrendDirection } from './types';
import { calculateEMA, calculateADX, calculateEMASlope } from './indicators';
import type { KlineV41 } from './indicators';

/**
 * Xác định trend_direction từ EMA20/EMA50.
 * Theo V4.1_FORMULAS.md Engine 1 — định nghĩa direction TRƯỚC khi
 * tính điểm: BULL nếu price > EMA20 > EMA50, BEAR nếu ngược lại,
 * NEUTRAL nếu không thỏa cả 2 điều kiện.
 */
export function resolveTrendDirection(
  price: number,
  ema20: number,
  ema50: number,
): TrendDirection {
  if (price > ema20 && ema20 > ema50) return 'BULL';
  if (price < ema20 && ema20 < ema50) return 'BEAR';
  return 'NEUTRAL';
}

/**
 * Bước 1 Engine 1 — EMA Alignment Score (0-40 điểm).
 * Theo V4.1_FORMULAS.md Engine 1 Bước 1.
 * Dùng CẢ EMA200 để tính điểm (khác với resolveTrendDirection chỉ
 * dùng EMA20/EMA50 để xác định hướng).
 */
export function calculateEMAAlignmentScore(
  direction: TrendDirection,
  price: number,
  ema20: number,
  ema50: number,
  ema200: number,
): number {
  if (direction === 'NEUTRAL') return 0;

  if (direction === 'BULL') {
    if (price > ema20 && ema20 > ema50 && ema50 > ema200) return 40;
    if (price > ema20 && ema20 > ema50) return 30;
    if (price > ema20) return 20;
    return 0;
  }

  if (price < ema20 && ema20 < ema50 && ema50 < ema200) return 40;
  if (price < ema20 && ema20 < ema50) return 30;
  if (price < ema20) return 20;
  return 0;
}

/**
 * Bước 2 Engine 1 — ADX Score (0-35 điểm).
 * Theo V4.1_FORMULAS.md Engine 1 Bước 2.
 */
export function calculateADXScore(adxValue: number): number {
  if (!Number.isFinite(adxValue)) return 0;
  if (adxValue > 40) return 35;
  if (adxValue >= 25) return 25;
  if (adxValue >= 20) return 15;
  return 0;
}

/**
 * Bước 3 Engine 1 — EMA50 Slope Score (0-25 điểm).
 * Theo V4.1_FORMULAS.md Engine 1 Bước 3. Dùng GIÁ TRỊ TUYỆT ĐỐI
 * của slope (vì slope có dấu, nhưng độ mạnh xu hướng không phân
 * biệt hướng ở bước chấm điểm này — hướng đã quyết ở Bước 1).
 */
export function calculateSlopeScore(slopePercent: number): number {
  if (!Number.isFinite(slopePercent)) return 0;
  const absSlope = Math.abs(slopePercent);
  if (absSlope > 2) return 25;
  if (absSlope >= 1) return 15;
  if (absSlope >= 0.3) return 8;
  return 0;
}

/**
 * Engine 1 — Trend Strength tổng hợp (0-100).
 * Theo V4.1_FORMULAS.md Engine 1 — ghép Bước 1+2+3.
 * Nhận trực tiếp klines 4H, tự tính EMA/ADX/Slope bên trong.
 */
export function calculateTrendStrength(
  klines: KlineV41[],
): {
  trendStrength: number;
  trendDirection: TrendDirection;
  emaAlignmentScore: number;
  adxScore: number;
  slopeScore: number;
} {
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const adxValues = calculateADX(klines, 14);

  const lastIdx = klines.length - 1;
  const price = closes[lastIdx];
  const lastEma20 = ema20[lastIdx];
  const lastEma50 = ema50[lastIdx];
  const lastEma200 = ema200[lastIdx];
  const lastAdx = adxValues[lastIdx];

  if (
    !Number.isFinite(lastEma20) ||
    !Number.isFinite(lastEma50) ||
    !Number.isFinite(lastEma200)
  ) {
    return {
      trendStrength: 0,
      trendDirection: 'NEUTRAL',
      emaAlignmentScore: 0,
      adxScore: 0,
      slopeScore: 0,
    };
  }

  const direction = resolveTrendDirection(price, lastEma20, lastEma50);
  const emaAlignmentScore = calculateEMAAlignmentScore(
    direction,
    price,
    lastEma20,
    lastEma50,
    lastEma200,
  );
  const adxScore = calculateADXScore(lastAdx);
  const slope = calculateEMASlope(ema50, 10);
  const slopeScore = calculateSlopeScore(slope);

  const trendStrength = emaAlignmentScore + adxScore + slopeScore;

  return {
    trendStrength,
    trendDirection: direction,
    emaAlignmentScore,
    adxScore,
    slopeScore,
  };
}

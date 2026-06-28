import type { KlineV41 } from './indicators';
import { calculateRSI } from './indicators';

export interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

/**
 * Tìm tất cả Swing High/Low trong klines.
 * Theo V4.1_FORMULAS.md Engine 3 — Swing Point.
 * Nến tại vị trí i là Swing High nếu high[i] cao nhất trong
 * [i-3, i+3]. Swing Low tương tự với low[i] thấp nhất.
 * CHỈ closed candles — klines đầu vào PHẢI đã loại bỏ nến chưa
 * đóng trước khi gọi hàm này (hàm không tự kiểm tra điều này).
 */
export function findSwingPoints(klines: KlineV41[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const n = klines.length;

  // Cần ít nhất 3 nến mỗi bên → index từ 3 đến n-4
  for (let i = 3; i <= n - 4; i++) {
    const window = klines.slice(i - 3, i + 4); // 7 nến: i-3 đến i+3
    const currentHigh = klines[i].high;
    const currentLow = klines[i].low;

    const isSwingHigh = window.every((k) => k.high <= currentHigh);
    const isSwingLow = window.every((k) => k.low >= currentLow);

    if (isSwingHigh) {
      swings.push({ index: i, price: currentHigh, type: 'HIGH' });
    }
    if (isSwingLow) {
      swings.push({ index: i, price: currentLow, type: 'LOW' });
    }
  }

  return swings;
}

/**
 * Lấy 2 swing gần nhất CÙNG LOẠI (cả 2 HIGH hoặc cả 2 LOW),
 * quét trong tối đa maxLookback nến gần nhất.
 * Theo V4.1_FORMULAS.md Engine 3 — "2 swing gần nhất".
 * Return null nếu không tìm đủ 2 swing cùng loại trong giới hạn.
 */
export function getLastTwoSwings(
  klines: KlineV41[],
  swingType: 'HIGH' | 'LOW',
  maxLookback: number = 50,
): { older: SwingPoint; newer: SwingPoint } | null {
  const n = klines.length;
  const startIdx = Math.max(0, n - maxLookback);
  const recentKlines = klines.slice(startIdx);

  const allSwings = findSwingPoints(recentKlines);
  const filtered = allSwings
    .filter((s) => s.type === swingType)
    .sort((a, b) => a.index - b.index); // tăng dần theo thời gian

  if (filtered.length < 2) return null;

  const newer = filtered[filtered.length - 1];
  const older = filtered[filtered.length - 2];

  // Điều chỉnh index về đúng vị trí trong klines GỐC (không phải
  // recentKlines đã slice) — quan trọng để hàm gọi sau dùng đúng
  // index tra cứu RSI/CVD tại đúng nến
  return {
    older: { ...older, index: older.index + startIdx },
    newer: { ...newer, index: newer.index + startIdx },
  };
}

/**
 * RSI Divergence Score — Regular Bullish/Bearish Divergence.
 * Theo V4.1_FORMULAS.md Engine 3 — RSI Divergence Score.
 *
 * Logic (đọc kỹ, có 2 NHÁNH riêng theo divergenceType):
 *
 * BULLISH (dùng khi đang ở downtrend, tìm đáy):
 *   - Lấy 2 swing LOW gần nhất (older, newer)
 *   - Điều kiện GIÁ: newer.price < older.price (đáy sau thấp hơn)
 *   - Điều kiện RSI: RSI tại newer.index > RSI tại older.index
 *     (RSI đáy sau CAO HƠN — đây mới là Regular Bullish thật)
 *   - Nếu CẢ 2 điều kiện đúng → tính % chênh lệch RSI, phân loại điểm
 *   - Nếu giá+RSI KHÔNG cùng thỏa pattern này → Score = 0
 *
 * BEARISH (dùng khi đang ở uptrend, tìm đỉnh):
 *   - Lấy 2 swing HIGH gần nhất
 *   - Điều kiện GIÁ: newer.price > older.price (đỉnh sau cao hơn)
 *   - Điều kiện RSI: RSI tại newer.index < RSI tại older.index
 *     (RSI đỉnh sau THẤP HƠN)
 *   - Tương tự tính điểm nếu thỏa
 *
 * % chênh lệch RSI = |RSI_newer - RSI_older| / RSI_older × 100
 *   > 15%  → 100 điểm
 *   5-15%  → 50 điểm
 *   < 5%   → 0 điểm (dù có thỏa điều kiện giá+RSI, vẫn coi là
 *            "chưa đủ rõ" nếu % chênh quá nhỏ)
 *
 * Không tìm đủ 2 swing → return 0 (không suy đoán).
 */
export function calculateRSIDivergenceScore(
  klines: KlineV41[],
  divergenceType: 'BULLISH' | 'BEARISH',
  maxLookback: number = 50,
): number {
  const swingType = divergenceType === 'BULLISH' ? 'LOW' : 'HIGH';
  const swings = getLastTwoSwings(klines, swingType, maxLookback);
  if (!swings) return 0;

  const { older, newer } = swings;
  const closes = klines.map((k) => k.close);
  const rsiValues = calculateRSI(closes, 14);

  const rsiOlder = rsiValues[older.index];
  const rsiNewer = rsiValues[newer.index];

  if (!Number.isFinite(rsiOlder) || !Number.isFinite(rsiNewer)) return 0;
  if (rsiOlder === 0) return 0; // tránh chia 0

  let priceConditionMet = false;
  let rsiConditionMet = false;

  if (divergenceType === 'BULLISH') {
    priceConditionMet = newer.price < older.price;
    rsiConditionMet = rsiNewer > rsiOlder;
  } else {
    priceConditionMet = newer.price > older.price;
    rsiConditionMet = rsiNewer < rsiOlder;
  }

  if (!priceConditionMet || !rsiConditionMet) return 0;

  const percentDiff = (Math.abs(rsiNewer - rsiOlder) / rsiOlder) * 100;

  if (percentDiff > 15) return 100;
  if (percentDiff >= 5) return 50;
  return 0;
}

/**
 * CVD V4.1 — Cumulative Volume Delta riêng cho V4.1.
 * Theo V4.1_FORMULAS.md Engine 3 — CVD V4.1 (rolling 100 nến).
 * delta[i] = takerBuyVolume[i] - (volume[i] - takerBuyVolume[i])
 *          = 2×takerBuyVolume[i] - volume[i]
 * CVD[i] = CVD[i-1] + delta[i] (rolling, KHÔNG reset, tính trên
 * TOÀN BỘ mảng klines đưa vào — caller chịu trách nhiệm chỉ truyền
 * đúng 100 nến gần nhất nếu muốn đúng "rolling 100" theo spec)
 */
export function calculateCVDV41(klines: KlineV41[]): number[] {
  const cvd: number[] = new Array(klines.length).fill(0);
  let cumulative = 0;

  for (let i = 0; i < klines.length; i++) {
    const takerSellVolume = klines[i].volume - klines[i].takerBuyVolume;
    const delta = klines[i].takerBuyVolume - takerSellVolume;
    cumulative += delta;
    cvd[i] = cumulative;
  }

  return cvd;
}

/**
 * CVD Divergence Score — CÙNG logic Regular Divergence như RSI,
 * nhưng dùng CVD V4.1 thay RSI.
 * Theo V4.1_FORMULAS.md Engine 3 — CVD Divergence Score.
 */
export function calculateCVDDivergenceScore(
  klines: KlineV41[],
  divergenceType: 'BULLISH' | 'BEARISH',
  maxLookback: number = 50,
): number {
  const swingType = divergenceType === 'BULLISH' ? 'LOW' : 'HIGH';
  const swings = getLastTwoSwings(klines, swingType, maxLookback);
  if (!swings) return 0;

  const { older, newer } = swings;

  // CVD tính trên TOÀN BỘ klines truyền vào (không chỉ phần lookback)
  // để đảm bảo tính "cumulative" đúng nghĩa từ điểm bắt đầu mảng
  const cvdValues = calculateCVDV41(klines);

  const cvdOlder = cvdValues[older.index];
  const cvdNewer = cvdValues[newer.index];

  if (!Number.isFinite(cvdOlder) || !Number.isFinite(cvdNewer)) return 0;
  if (cvdOlder === 0) return 0; // tránh chia 0 (CVD có thể = 0 thật)

  let priceConditionMet = false;
  let cvdConditionMet = false;

  if (divergenceType === 'BULLISH') {
    priceConditionMet = newer.price < older.price;
    cvdConditionMet = cvdNewer > cvdOlder;
  } else {
    priceConditionMet = newer.price > older.price;
    cvdConditionMet = cvdNewer < cvdOlder;
  }

  if (!priceConditionMet || !cvdConditionMet) return 0;

  const percentDiff = (Math.abs(cvdNewer - cvdOlder) / Math.abs(cvdOlder)) * 100;

  if (percentDiff > 15) return 100;
  if (percentDiff >= 5) return 50;
  return 0;
}

import type {
  FundingOIRegime,
  LiquidityPool,
  MarketRegime,
  MarketTrend,
  SMCSignal,
  StructureType,
  SwingPoint,
} from '../constants/scoring';
import { SESSION_RULES_V3, WIN_STREAK_CONFIG } from '../constants/scoring';
import type {
  DeepOrderBookResult,
  ForceOrder,
  FundingRateRecord,
  Kline,
  OpenInterestHistPoint,
} from './binanceApi';

// ─── Shared types ──────────────────────────────────────────────────────────────

export interface OHLCVSeries {
  open: Float32Array;
  high: Float32Array;
  low: Float32Array;
  close: Float32Array;
  volume: Float32Array;
  timestamp: Float32Array;
  /** Taker buy base volume từ Binance kline (field index 9), nếu có */
  takerBuyVolume?: Float32Array;
}

export interface MACDResult {
  macd: Float32Array;
  signal: Float32Array;
  histogram: Float32Array;
}

export interface BollingerResult {
  upper: Float32Array;
  middle: Float32Array;
  lower: Float32Array;
  bandwidth: Float32Array;
}

export interface SMCStructureResult {
  swings: SwingPoint[];
  signals: SMCSignal[];
  trend: MarketTrend;
}

export interface HeatmapPoint {
  price: number;
  volume: number;
  strength: number;
  type: 'LIQUIDATION' | 'ORDERBOOK_WALL';
  side: 'BID' | 'ASK' | 'NEUTRAL';
}

/** Skia-ready flat buffer: [price, volume, strength, sideCode] × N (sideCode: 0=bid, 1=ask, 2=liq) */
export interface LiquidityHeatmapResult {
  coords: Float32Array;
  pools: LiquidityPool[];
  averageVolume: number;
  points: HeatmapPoint[];
}

export type CVDDivergenceType = 'BULLISH' | 'BEARISH' | 'NONE';

export interface CVDDivergence {
  type: CVDDivergenceType;
  priceIndex: number;
  timestamp: number;
  note: string;
}

export interface OrderFlowAnalysis {
  cvd: Float32Array;
  deltaPerBar: Float32Array;
  divergences: CVDDivergence[];
  fundingOI: {
    DeltaOI: number;
    fundingVelocity: number;
    regime: FundingOIRegime;
  };
}

export interface RegimeClassification {
  regime: MarketRegime;
  trend: MarketTrend;
  bollingerBandwidth: number;
  confidence: number;
}

const HEATMAP_STRIDE = 4;
const LIQ_MULTIPLIER = 5;

// ─── Safe helpers ──────────────────────────────────────────────────────────────

function f32(length: number): Float32Array {
  const arr = new Float32Array(length);
  arr.fill(NaN);
  return arr;
}

function isValidSeries(values: Float32Array, minLen = 1): boolean {
  return values instanceof Float32Array && values.length >= minLen;
}

function lastValid(values: Float32Array): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// ─── Kline → Typed arrays ──────────────────────────────────────────────────────

export function klinesToOHLCV(klines: Kline[]): OHLCVSeries {
  const n = klines.length;
  const open = new Float32Array(n);
  const high = new Float32Array(n);
  const low = new Float32Array(n);
  const close = new Float32Array(n);
  const volume = new Float32Array(n);
  const timestamp = new Float32Array(n);
  const takerBuyVolume = new Float32Array(n);
  let hasTaker = false;

  for (let i = 0; i < n; i++) {
    const k = klines[i];
    open[i] = k.open;
    high[i] = k.high;
    low[i] = k.low;
    close[i] = k.close;
    volume[i] = k.volume;
    timestamp[i] = k.openTime;
    if (typeof k.takerBuyVolume === 'number' && Number.isFinite(k.takerBuyVolume)) {
      takerBuyVolume[i] = k.takerBuyVolume;
      hasTaker = true;
    }
  }

  return hasTaker
    ? { open, high, low, close, volume, timestamp, takerBuyVolume }
    : { open, high, low, close, volume, timestamp };
}

// ─── Technical indicators (Float32Array) ───────────────────────────────────────

export function calculateSMA(values: Float32Array, period: number): Float32Array {
  const n = values.length;
  const out = f32(n);
  if (!isValidSeries(values) || period < 1 || n < period) return out;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function calculateWilderEMA(values: Float32Array, period: number): Float32Array {
  const n = values.length;
  const out = f32(n);
  if (!isValidSeries(values) || period < 1 || n < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = ema;

  const k = 1 / period;
  for (let i = period; i < n; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Standard EMA with smoothing α = 2/(n+1) — chuẩn ngành dùng cho MACD/EMA20/EMA50,
 * khớp giá trị TradingView/Binance chart. Dùng `calculateWilderEMA` cho RSI/ATR.
 *
 * Bỏ qua các giá trị NaN ở đầu chuỗi khi seed (cần thiết để chạy trên macdLine
 * vốn có 25 phần tử NaN ban đầu khi tính signal line).
 */
export function calculateEMA(values: Float32Array, period: number): Float32Array {
  const n = values.length;
  const out = f32(n);
  if (!isValidSeries(values) || period < 1 || n < period) return out;

  // Tìm cửa sổ `period` giá trị finite liên tiếp đầu tiên để seed SMA.
  let seedStart = -1;
  for (let i = 0; i + period <= n; i++) {
    let ok = true;
    for (let j = 0; j < period; j++) {
      if (!Number.isFinite(values[i + j])) {
        ok = false;
        break;
      }
    }
    if (ok) {
      seedStart = i;
      break;
    }
  }
  if (seedStart < 0) return out;

  let sum = 0;
  for (let i = seedStart; i < seedStart + period; i++) sum += values[i];
  let ema = sum / period;
  out[seedStart + period - 1] = ema;

  const k = 2 / (period + 1);
  for (let i = seedStart + period; i < n; i++) {
    if (!Number.isFinite(values[i])) {
      out[i] = ema;
      continue;
    }
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calculateRSI(closes: Float32Array, period = 14): Float32Array {
  const n = closes.length;
  const out = f32(n);
  if (!isValidSeries(closes, period + 1)) return out;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function calculateMACD(
  closes: Float32Array,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  const n = closes.length;
  const empty = { macd: f32(n), signal: f32(n), histogram: f32(n) };
  if (!isValidSeries(closes, slowPeriod + signalPeriod)) return empty;

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  const macd = f32(n);

  for (let i = 0; i < n; i++) {
    if (Number.isFinite(emaFast[i]) && Number.isFinite(emaSlow[i])) {
      macd[i] = emaFast[i] - emaSlow[i];
    }
  }

  const signal = calculateEMA(macd, signalPeriod);
  const histogram = f32(n);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(macd[i]) && Number.isFinite(signal[i])) {
      histogram[i] = macd[i] - signal[i];
    }
  }

  return { macd, signal, histogram };
}

export function calculateBollingerBands(
  closes: Float32Array,
  period = 20,
  stdDevMult = 2,
): BollingerResult {
  const n = closes.length;
  const upper = f32(n);
  const middle = f32(n);
  const lower = f32(n);
  const bandwidth = f32(n);

  if (!isValidSeries(closes, period)) {
    return { upper, middle, lower, bandwidth };
  }

  const sma = calculateSMA(closes, period);

  for (let i = period - 1; i < n; i++) {
    let sumSq = 0;
    const mean = sma[i];
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - mean;
      sumSq += d * d;
    }
    const std = Math.sqrt(sumSq / period);
    middle[i] = mean;
    upper[i] = mean + stdDevMult * std;
    lower[i] = mean - stdDevMult * std;
    bandwidth[i] = mean !== 0 ? (upper[i] - lower[i]) / mean : 0;
  }

  return { upper, middle, lower, bandwidth };
}

export function calculateATR(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  period = 14,
): Float32Array {
  const n = closes.length;
  const out = f32(n);
  if (!isValidSeries(highs, 2) || !isValidSeries(lows, 2) || highs.length !== lows.length) {
    return out;
  }

  const tr = new Float32Array(n);
  tr[0] = highs[0] - lows[0];

  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }

  return calculateWilderEMA(tr, period);
}

// ─── SMC structure ─────────────────────────────────────────────────────────────

export function findSwingPoints(
  highs: Float32Array,
  lows: Float32Array,
  timestamps: Float32Array,
  lookback = 2,
): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const n = highs.length;
  if (!isValidSeries(highs, lookback * 2 + 1) || lows.length !== n) return swings;

  for (let i = lookback; i < n - lookback; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }

    if (isHigh) {
      swings.push({ price: highs[i], timestamp: timestamps[i], type: 'HIGH' });
    }
    if (isLow) {
      swings.push({ price: lows[i], timestamp: timestamps[i], type: 'LOW' });
    }
  }

  swings.sort((a, b) => a.timestamp - b.timestamp);
  return swings;
}

export function detectSMCStructure(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  timestamps: Float32Array,
  fractalLookback = 2,
): SMCStructureResult {
  const empty: SMCStructureResult = { swings: [], signals: [], trend: 'SIDEWAYS' };
  if (!isValidSeries(closes, fractalLookback * 2 + 3)) return empty;

  const swings = findSwingPoints(highs, lows, timestamps, fractalLookback);
  if (swings.length < 2) return { swings, signals: [], trend: 'SIDEWAYS' };

  const signals: SMCSignal[] = [];
  let trend: MarketTrend = 'SIDEWAYS';

  const swingHighs = swings.filter((s) => s.type === 'HIGH');
  const swingLows = swings.filter((s) => s.type === 'LOW');

  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastHigh = swingHighs[swingHighs.length - 1];
    const prevHigh = swingHighs[swingHighs.length - 2];
    const lastLow = swingLows[swingLows.length - 1];
    const prevLow = swingLows[swingLows.length - 2];

    if (lastHigh.price > prevHigh.price && lastLow.price > prevLow.price) {
      trend = 'BULLISH';
    } else if (lastHigh.price < prevHigh.price && lastLow.price < prevLow.price) {
      trend = 'BEARISH';
    }
  } else if (swingHighs.length >= 1 && swingLows.length >= 1) {
    const closeLast = closes[closes.length - 1];
    if (closeLast > swingHighs[swingHighs.length - 1].price * 0.998) trend = 'BULLISH';
    else if (closeLast < swingLows[swingLows.length - 1].price * 1.002) trend = 'BEARISH';
  }

  const lastClose = closes[closes.length - 1];
  const lastTs = timestamps[timestamps.length - 1];
  const refHigh = swingHighs[swingHighs.length - 1];
  const refLow = swingLows[swingLows.length - 1];

  if (refHigh && lastClose > refHigh.price) {
    const type: StructureType = trend === 'BEARISH' ? 'CHOCH' : 'BOS';
    signals.push({
      type,
      trend: type === 'BOS' ? 'BULLISH' : 'BULLISH',
      breakPrice: refHigh.price,
      timestamp: lastTs,
    });
    if (type === 'BOS') trend = 'BULLISH';
    else trend = 'BULLISH';
  }

  if (refLow && lastClose < refLow.price) {
    const type: StructureType = trend === 'BULLISH' ? 'CHOCH' : 'BOS';
    signals.push({
      type,
      trend: type === 'BOS' ? 'BEARISH' : 'BEARISH',
      breakPrice: refLow.price,
      timestamp: lastTs,
    });
    if (type === 'BOS') trend = 'BEARISH';
    else trend = 'BEARISH';
  }

  return { swings, signals, trend };
}

// ─── Liquidity heatmap ─────────────────────────────────────────────────────────

function clusterLevels(
  levels: { price: number; qty: number }[],
  bucketSize: number,
): Map<number, number> {
  const buckets = new Map<number, number>();
  if (bucketSize <= 0) return buckets;

  for (const { price, qty } of levels) {
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) continue;
    const key = Math.round(price / bucketSize) * bucketSize;
    buckets.set(key, (buckets.get(key) ?? 0) + qty);
  }
  return buckets;
}

function bucketSizeFromBook(orderBook: DeepOrderBookResult): number {
  const prices = [
    ...orderBook.bids.slice(0, 20).map((b) => b.price),
    ...orderBook.asks.slice(0, 20).map((a) => a.price),
  ];
  if (prices.length < 2) return 1;

  let minDiff = Infinity;
  for (let i = 1; i < prices.length; i++) {
    const d = Math.abs(prices[i] - prices[i - 1]);
    if (d > 0 && d < minDiff) minDiff = d;
  }
  return Number.isFinite(minDiff) && minDiff < Infinity ? minDiff * 10 : 10;
}

export function calculateLiquidityHeatmap(
  orderBook: DeepOrderBookResult | null,
  forceOrders: ForceOrder[] | null,
  bucketSize?: number,
): LiquidityHeatmapResult {
  const empty: LiquidityHeatmapResult = {
    coords: new Float32Array(0),
    pools: [],
    averageVolume: 0,
    points: [],
  };

  if (!orderBook?.bids?.length && !orderBook?.asks?.length && !forceOrders?.length) {
    return empty;
  }

  const size = bucketSize ?? (orderBook ? bucketSizeFromBook(orderBook) : 10);
  const bidBuckets = clusterLevels(
    (orderBook?.bids ?? []).map((b) => ({ price: b.price, qty: b.quantity })),
    size,
  );
  const askBuckets = clusterLevels(
    (orderBook?.asks ?? []).map((a) => ({ price: a.price, qty: a.quantity })),
    size,
  );
  const liqBuckets = clusterLevels(
    (forceOrders ?? []).map((o) => ({ price: o.avgPrice || o.price, qty: o.executedQty })),
    size,
  );

  const allVolumes: number[] = [];
  for (const v of bidBuckets.values()) allVolumes.push(v);
  for (const v of askBuckets.values()) allVolumes.push(v);
  for (const v of liqBuckets.values()) allVolumes.push(v);

  if (allVolumes.length === 0) return empty;

  const averageVolume = allVolumes.reduce((a, b) => a + b, 0) / allVolumes.length;
  const threshold = averageVolume * LIQ_MULTIPLIER;

  const points: HeatmapPoint[] = [];
  const pools: LiquidityPool[] = [];

  const pushBucket = (
    price: number,
    volume: number,
    side: HeatmapPoint['side'],
    poolType: LiquidityPool['type'],
  ) => {
    if (volume < threshold) return;
    const strength = averageVolume > 0 ? volume / averageVolume : 1;
    points.push({
      price,
      volume,
      strength,
      type: poolType,
      side,
    });
    pools.push({ price, volume, strength, type: poolType });
  };

  for (const [price, volume] of bidBuckets) pushBucket(price, volume, 'BID', 'ORDERBOOK_WALL');
  for (const [price, volume] of askBuckets) pushBucket(price, volume, 'ASK', 'ORDERBOOK_WALL');
  for (const [price, volume] of liqBuckets) pushBucket(price, volume, 'NEUTRAL', 'LIQUIDATION');

  const coords = new Float32Array(points.length * HEATMAP_STRIDE);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const o = i * HEATMAP_STRIDE;
    coords[o] = p.price;
    coords[o + 1] = p.volume;
    coords[o + 2] = p.strength;
    coords[o + 3] = p.side === 'BID' ? 0 : p.side === 'ASK' ? 1 : 2;
  }

  return { coords, pools, averageVolume, points };
}

// ─── Order flow & CVD ──────────────────────────────────────────────────────────

/**
 * Bar delta thực = takerBuyVolume − takerSellVolume = 2·takerBuyVolume − totalVolume.
 * Nếu không có taker volume từ Binance, fallback wick proxy:
 * (2·close − high − low) / (high − low) × volume
 */
export function calculateBarDelta(
  open: Float32Array,
  high: Float32Array,
  low: Float32Array,
  close: Float32Array,
  volume: Float32Array,
  takerBuyVolume?: Float32Array,
): Float32Array {
  const n = close.length;
  const delta = new Float32Array(n);
  if (!isValidSeries(close, 1)) return delta;

  const hasTaker = takerBuyVolume && takerBuyVolume.length === n;

  for (let i = 0; i < n; i++) {
    if (hasTaker && Number.isFinite(takerBuyVolume![i])) {
      delta[i] = 2 * takerBuyVolume![i] - volume[i];
      continue;
    }
    const range = high[i] - low[i];
    if (range <= 0 || volume[i] <= 0) {
      delta[i] = close[i] >= open[i] ? volume[i] * 0.5 : -volume[i] * 0.5;
      continue;
    }
    const imbalance = (2 * close[i] - high[i] - low[i]) / range;
    delta[i] = imbalance * volume[i];
  }
  return delta;
}

export function calculateCVD(deltaPerBar: Float32Array): Float32Array {
  const n = deltaPerBar.length;
  const cvd = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += deltaPerBar[i];
    cvd[i] = acc;
  }
  return cvd;
}

export function detectCVDDivergence(
  closes: Float32Array,
  cvd: Float32Array,
  timestamps: Float32Array,
  lookback = 20,
): CVDDivergence[] {
  const divergences: CVDDivergence[] = [];
  const n = closes.length;
  if (!isValidSeries(closes, lookback * 2) || cvd.length !== n) return divergences;

  const start = n - lookback;
  let priceMaxIdx = start;
  let priceMinIdx = start;
  let cvdMaxIdx = start;
  let cvdMinIdx = start;

  for (let i = start; i < n; i++) {
    if (closes[i] > closes[priceMaxIdx]) priceMaxIdx = i;
    if (closes[i] < closes[priceMinIdx]) priceMinIdx = i;
    if (cvd[i] > cvd[cvdMaxIdx]) cvdMaxIdx = i;
    if (cvd[i] < cvd[cvdMinIdx]) cvdMinIdx = i;
  }

  const prevStart = Math.max(0, start - lookback);
  let prevPriceMax = closes[prevStart];
  let prevCvdMax = cvd[prevStart];
  let prevPriceMin = closes[prevStart];
  let prevCvdMin = cvd[prevStart];

  for (let i = prevStart; i < start; i++) {
    if (closes[i] > prevPriceMax) prevPriceMax = closes[i];
    if (closes[i] < prevPriceMin) prevPriceMin = closes[i];
    if (cvd[i] > prevCvdMax) prevCvdMax = cvd[i];
    if (cvd[i] < prevCvdMin) prevCvdMin = cvd[i];
  }

  const priceHH = closes[priceMaxIdx] > prevPriceMax;
  const cvdLH = cvd[cvdMaxIdx] < prevCvdMax;
  if (priceHH && cvdLH) {
    divergences.push({
      type: 'BEARISH',
      priceIndex: priceMaxIdx,
      timestamp: timestamps[priceMaxIdx],
      note: 'Price higher high, CVD lower high',
    });
  }

  const priceLL = closes[priceMinIdx] < prevPriceMin;
  const cvdHL = cvd[cvdMinIdx] > prevCvdMin;
  if (priceLL && cvdHL) {
    divergences.push({
      type: 'BULLISH',
      priceIndex: priceMinIdx,
      timestamp: timestamps[priceMinIdx],
      note: 'Price lower low, CVD higher low',
    });
  }

  if (divergences.length === 0) {
    divergences.push({ type: 'NONE', priceIndex: n - 1, timestamp: timestamps[n - 1], note: '' });
  }

  return divergences;
}

export function classifyFundingOIRegime(
  deltaOI: number,
  fundingVelocity: number,
  priceChangePct: number,
): FundingOIRegime {
  const oiUp = deltaOI > 0;
  const oiDown = deltaOI < 0;
  const fundUp = fundingVelocity > 0;
  const fundDown = fundingVelocity < 0;
  const priceUp = priceChangePct > 0.2;
  const priceDown = priceChangePct < -0.2;

  if (oiDown && priceUp && fundUp) return 'LONG_SQUEEZE_RISK';
  if (oiDown && priceDown && fundDown) return 'SHORT_SQUEEZE_RISK';
  if (oiUp && !priceDown && fundDown) return 'ACCUMULATION';
  if (oiUp && !priceUp && fundUp) return 'DISTRIBUTION';
  return 'NEUTRAL';
}

function fundingVelocityFromHistory(records: FundingRateRecord[]): number {
  if (!records?.length || records.length < 2) return 0;
  const sorted = [...records].sort((a, b) => a.fundingTime - b.fundingTime);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dtHours = (last.fundingTime - first.fundingTime) / 3_600_000;
  if (dtHours <= 0) return 0;
  return (last.fundingRate - first.fundingRate) / dtHours;
}

function priceChangePct(closes: Float32Array, bars = 10): number {
  const n = closes.length;
  if (n < bars + 1) return 0;
  const prev = closes[n - bars - 1];
  const last = closes[n - 1];
  if (prev === 0) return 0;
  return ((last - prev) / prev) * 100;
}

export function analyzeOrderFlow(
  ohlcv: OHLCVSeries,
  oiHistory: OpenInterestHistPoint[] | null,
  fundingHistory: FundingRateRecord[] | null,
): OrderFlowAnalysis {
  const n = ohlcv.close.length;
  const deltaPerBar = calculateBarDelta(
    ohlcv.open,
    ohlcv.high,
    ohlcv.low,
    ohlcv.close,
    ohlcv.volume,
    ohlcv.takerBuyVolume,
  );
  const cvd = calculateCVD(deltaPerBar);
  const divergences = detectCVDDivergence(ohlcv.close, cvd, ohlcv.timestamp);

  let deltaOI = 0;
  if (oiHistory && oiHistory.length >= 2) {
    const sorted = [...oiHistory].sort((a, b) => a.timestamp - b.timestamp);
    deltaOI = sorted[sorted.length - 1].sumOpenInterest - sorted[0].sumOpenInterest;
  }

  const fundingVelocity = fundingVelocityFromHistory(fundingHistory ?? []);
  const pct = priceChangePct(ohlcv.close);
  const regime = classifyFundingOIRegime(deltaOI, fundingVelocity, pct);

  return {
    cvd,
    deltaPerBar,
    divergences,
    fundingOI: { DeltaOI: deltaOI, fundingVelocity, regime },
  };
}

// ─── Market regime ─────────────────────────────────────────────────────────────

export function classifyMarketRegime(
  closes: Float32Array,
  highs: Float32Array,
  lows: Float32Array,
  timestamps: Float32Array,
): RegimeClassification {
  const fallback: RegimeClassification = {
    regime: 'HIGH_VOLATILITY_CHOP',
    trend: 'SIDEWAYS',
    bollingerBandwidth: 0,
    confidence: 0,
  };

  if (!isValidSeries(closes, 30)) return fallback;

  const bb = calculateBollingerBands(closes, 20, 2);
  const atr = calculateATR(highs, lows, closes, 14);
  const rsi = calculateRSI(closes, 14);
  const sma50 = calculateSMA(closes, Math.min(50, closes.length));
  const smc = detectSMCStructure(highs, lows, closes, timestamps);

  const bw = lastValid(bb.bandwidth) ?? 0;
  const atrVal = lastValid(atr) ?? 0;
  const rsiVal = lastValid(rsi) ?? 50;
  const smaVal = lastValid(sma50) ?? closes[closes.length - 1];
  const closeLast = closes[closes.length - 1];
  const atrPct = closeLast > 0 ? atrVal / closeLast : 0;

  let regime: MarketRegime = 'MEAN_REVERSION';
  let confidence = 0.5;

  const compressed = bw < 0.04;
  const expanded = bw > 0.08;
  const volatile = atrPct > 0.015;

  if (volatile && !compressed && smc.trend === 'SIDEWAYS') {
    regime = 'HIGH_VOLATILITY_CHOP';
    confidence = 0.7;
  } else if (smc.trend === 'BULLISH' && closeLast > smaVal && expanded) {
    regime = 'TRENDING_BULL';
    confidence = 0.75;
  } else if (smc.trend === 'BEARISH' && closeLast < smaVal && expanded) {
    regime = 'TRENDING_BEAR';
    confidence = 0.75;
  } else if (compressed || (rsiVal > 70 || rsiVal < 30)) {
    regime = 'MEAN_REVERSION';
    confidence = 0.65;
  } else if (smc.trend === 'BULLISH') {
    regime = 'TRENDING_BULL';
    confidence = 0.6;
  } else if (smc.trend === 'BEARISH') {
    regime = 'TRENDING_BEAR';
    confidence = 0.6;
  } else {
    regime = 'HIGH_VOLATILITY_CHOP';
    confidence = 0.55;
  }

  return {
    regime,
    trend: smc.trend,
    bollingerBandwidth: bw,
    confidence,
  };
}

// ─── Phase 4 v2 helpers (giữ nguyên hàm cũ phía trên) ─────────────────────────

function lastValidFromSeries(values: Float32Array): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function closesFromKlines(klines: Kline[]): Float32Array {
  const closes = new Float32Array(klines.length);
  for (let i = 0; i < klines.length; i++) closes[i] = klines[i].close;
  return closes;
}

/** SMA cuối cùng trên `period` nến — null nếu không đủ dữ liệu */
export function getMA(klines: Kline[], period: number): number | null {
  if (klines.length < period) return null;
  const sma = calculateSMA(closesFromKlines(klines), period);
  return lastValidFromSeries(sma);
}

export function getEMAs(klines: Kline[]): { ema20: number; ema50: number } {
  const closes = closesFromKlines(klines);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema20 = lastValidFromSeries(ema20Arr);
  const ema50 = lastValidFromSeries(ema50Arr);
  return {
    ema20: ema20 ?? NaN,
    ema50: ema50 ?? NaN,
  };
}

export function getSMA200(klines: Kline[]): number | null {
  return getMA(klines, 200);
}

/** %B Bollinger (0–100) tại nến cuối hoặc chỉ số `barIndex` */
export function getBollingerPercentB(
  bb: BollingerResult,
  price: number,
  barIndex?: number,
): number {
  const idx =
    barIndex != null && barIndex >= 0 && barIndex < bb.upper.length
      ? barIndex
      : bb.upper.length - 1;
  if (idx < 0) return 50;

  const upper = bb.upper[idx];
  const lower = bb.lower[idx];
  if (!Number.isFinite(upper) || !Number.isFinite(lower)) return 50;

  const range = upper - lower;
  if (range === 0) return 50;
  const pctB = ((price - lower) / range) * 100;
  return Math.max(0, Math.min(100, pctB));
}

export type RatioSlope = 'UP' | 'DOWN' | 'FLAT';

/** Độ dốc Long/Short Ratio — mảng giá trị cũ → mới */
export function getRatioSlope(
  ratioValues: number[],
  lookback = 5,
): RatioSlope {
  if (ratioValues.length < lookback + 1) return 'FLAT';

  const recent = ratioValues.slice(-lookback - 1);
  const start = recent[0];
  const end = recent[recent.length - 1];
  const changePct = start !== 0 ? ((end - start) / start) * 100 : 0;

  const threshold = 1;
  if (changePct > threshold) return 'UP';
  if (changePct < -threshold) return 'DOWN';
  return 'FLAT';
}

/** Giờ hiện tại theo múi giờ VN (0–24, có phần thập phân từ phút) */
export function getCurrentHourVN(timezoneOffset = 7): number {
  const now = new Date();
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  let vnHour = utcHour + timezoneOffset;
  if (vnHour >= 24) vnHour -= 24;
  if (vnHour < 0) vnHour += 24;
  return vnHour;
}

// ─── Kline wrappers for Scorer v2 ─────────────────────────────────────────────

export interface AllMAs {
  ema20: number;
  ema50: number;
  sma200: number | null;
}

export function getAllMAs(klines: Kline[]): AllMAs {
  const { ema20, ema50 } = getEMAs(klines);
  return { ema20, ema50, sma200: getSMA200(klines) };
}

export function getRSI(klines: Kline[], period = 14): number {
  const rsiArr = calculateRSI(closesFromKlines(klines), period);
  return lastValidFromSeries(rsiArr) ?? 50;
}

export interface MACDValues {
  macd: number;
  signal: number;
  histogram: number;
}

export function getMACD(klines: Kline[]): MACDValues {
  const result = calculateMACD(closesFromKlines(klines));
  return {
    macd: lastValidFromSeries(result.macd) ?? 0,
    signal: lastValidFromSeries(result.signal) ?? 0,
    histogram: lastValidFromSeries(result.histogram) ?? 0,
  };
}

export function getBollinger(klines: Kline[], period = 20, stdDev = 2): BollingerResult {
  return calculateBollingerBands(closesFromKlines(klines), period, stdDev);
}

/** Volume nến cuối / trung bình `lookback` nến trước đó */
export function getVolumeRatio(klines: Kline[], lookback = 20): number {
  if (klines.length < lookback + 1) return 1;
  const lastVol = klines[klines.length - 1].volume;
  let sum = 0;
  for (let i = klines.length - lookback - 1; i < klines.length - 1; i++) {
    sum += klines[i].volume;
  }
  const avg = sum / lookback;
  if (avg <= 0 || !Number.isFinite(lastVol)) return 1;
  return lastVol / avg;
}

export interface CVDPoint {
  timestamp: number;
  cvd: number;
  price: number;
}

/** Internal — phân loại trạng thái CVD (logic gán state ở task sau). */
enum CvdState {
  STRONG_BEARISH,
  BEARISH,
  RECOVERING,
  NEUTRAL,
  BULLISH,
  STRONG_BULLISH,
}

export interface CVDAnalysis {
  slope: 'up' | 'down' | 'flat';
  divergence: boolean;
  supportive: boolean;
  reason: string;
  /** currentCvd − cvd 24 nến 1H trước (delta tích lũy 24h). */
  cvdMomentum24h: number;
}

/** 24 nến 1H = 24 giờ — dùng chuỗi CVDPoint hiện có (~220 nến). */
const CVD_MOMENTUM_24H_BARS = 24;

/** Ngưỡng phân loại CVD — deep negative + momentum 24h. */
const CVD_STATE_DEEP_NEGATIVE = -20_000_000;
const CVD_STATE_MOMENTUM_RECOVERING = 3_000_000;
const CVD_STATE_MOMENTUM_STRONG_BEARISH = -3_000_000;

function computeCvdMomentum24h(points: CVDPoint[]): number {
  if (points.length < CVD_MOMENTUM_24H_BARS + 1) return 0;
  const currentCvd = points[points.length - 1].cvd;
  const cvdValue24HoursAgo = points[points.length - 1 - CVD_MOMENTUM_24H_BARS].cvd;
  return currentCvd - cvdValue24HoursAgo;
}

/** Phân loại trạng thái CVD — module CVD only. */
export function classifyCvdState(currentCvd: number, cvdMomentum24h: number): CvdState {
  if (currentCvd < CVD_STATE_DEEP_NEGATIVE) {
    if (cvdMomentum24h > CVD_STATE_MOMENTUM_RECOVERING) return CvdState.RECOVERING;
    if (cvdMomentum24h < CVD_STATE_MOMENTUM_STRONG_BEARISH) return CvdState.STRONG_BEARISH;
    return CvdState.BEARISH;
  }
  return CvdState.NEUTRAL;
}

/** LONG CVD hard block — STRONG_BEARISH + giá dưới EMA20 (không đụng scoring layer). */
export function evaluateLongCvdHardBlock(input: {
  currentCvd: number;
  cvdMomentum24h: number;
  currentPrice: number;
  ema20: number;
}): string | null {
  if (classifyCvdState(input.currentCvd, input.cvdMomentum24h) !== CvdState.STRONG_BEARISH) {
    return null;
  }
  if (input.currentPrice >= input.ema20) {
    return null;
  }
  return 'CVD deeply negative and still deteriorating.';
}

export const CVD_RECOVERING_SCORE_PENALTY = 1;
export const CVD_RECOVERING_SOFT_WARNING =
  'CVD deeply negative but recovering. Confidence slightly reduced.';

/** Penalty cục bộ L5a khi CVD đang RECOVERING — không hard block. */
export function applyRecoveringCvdLocalPenalty(
  score: number,
  currentCvd: number,
  cvdMomentum24h: number,
): { score: number; warning: string | null; reason: string | null } {
  if (classifyCvdState(currentCvd, cvdMomentum24h) !== CvdState.RECOVERING) {
    return { score, warning: null, reason: null };
  }
  return {
    score: Math.max(0, score - CVD_RECOVERING_SCORE_PENALTY),
    warning: CVD_RECOVERING_SOFT_WARNING,
    reason: CVD_RECOVERING_SOFT_WARNING,
  };
}

/** Phân tích CVD từ chuỗi điểm (cũ → mới) cho Scorer v2 Lớp 5 */
export function analyzeCVD(points: CVDPoint[], direction: 'LONG' | 'SHORT'): CVDAnalysis {
  const cvdMomentum24h = computeCvdMomentum24h(points);

  if (points.length < 3) {
    return {
      slope: 'flat',
      divergence: false,
      supportive: false,
      reason: 'Thiếu dữ liệu CVD',
      cvdMomentum24h,
    };
  }

  const lookback = Math.min(12, points.length);
  const recent = points.slice(-lookback);
  const start = recent[0];
  const end = recent[recent.length - 1];
  const cvdDelta = end.cvd - start.cvd;
  const priceDelta = end.price - start.price;
  const flatThreshold = Math.max(1, Math.abs(end.cvd) * 0.02);

  const slope: CVDAnalysis['slope'] =
    Math.abs(cvdDelta) < flatThreshold ? 'flat' : cvdDelta > 0 ? 'up' : 'down';

  const divergence =
    (priceDelta > 0 && cvdDelta < 0) || (priceDelta < 0 && cvdDelta > 0);

  let supportive = false;
  if (direction === 'LONG') {
    supportive = slope === 'up' && !divergence;
  } else {
    supportive = slope === 'down' && !divergence;
  }

  let reason = `CVD ${slope}`;
  if (divergence) reason += ' · phân kỳ giá/CVD';
  else if (supportive) reason += ' · thuận hướng';

  return { slope, divergence, supportive, reason, cvdMomentum24h };
}

// ─── Entry Zone (limit thông minh) ───────────────────────────────────────────

export type EntryZoneType =
  | 'PULLBACK_EMA'
  | 'WALL_SUPPORT'
  | 'BREAKOUT_RETEST'
  | 'MARKET_NEAR';

export interface WhaleWall {
  price: number;
  distancePct: number;
  multiplier: number;
}

export interface EntryWhaleWalls {
  bidWalls: WhaleWall[];
  askWalls: WhaleWall[];
}

export interface EntryZone {
  optimal: number;
  rangeLow: number;
  rangeHigh: number;
  type: EntryZoneType;
  reasoning: string;
  distanceFromCurrentPct: number;
}

/** Gom heatmap pools thành bid/ask walls kèm khoảng cách % so với giá hiện tại. */
export function buildEntryWhaleWalls(
  currentPrice: number,
  pools: LiquidityPool[],
): EntryWhaleWalls {
  const bidWalls: WhaleWall[] = [];
  const askWalls: WhaleWall[] = [];
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { bidWalls, askWalls };
  }

  for (const wall of detectWhaleWalls(pools)) {
    const distancePct = ((wall.price - currentPrice) / currentPrice) * 100;
    const mapped: WhaleWall = {
      price: wall.price,
      distancePct,
      multiplier: wall.strength,
    };
    if (wall.price <= currentPrice) {
      bidWalls.push(mapped);
    } else {
      askWalls.push(mapped);
    }
  }

  bidWalls.sort((a, b) => b.price - a.price);
  askWalls.sort((a, b) => a.price - b.price);
  return { bidWalls, askWalls };
}

export function calculateEntryZone(
  currentPrice: number,
  ema20: number,
  atr: number,
  direction: 'LONG' | 'SHORT',
  whaleWalls: EntryWhaleWalls,
): EntryZone {
  const safeAtr = Number.isFinite(atr) && atr > 0 ? atr : currentPrice * 0.005;
  const safeEma = Number.isFinite(ema20) && ema20 > 0 ? ema20 : currentPrice;

  const distanceToEMA = currentPrice - safeEma;
  const distancePct = (Math.abs(distanceToEMA) / currentPrice) * 100;

  if (distancePct > 0.8) {
    if (direction === 'LONG') {
      const optimal = safeEma + safeAtr * 0.2;
      return {
        optimal,
        rangeLow: safeEma - safeAtr * 0.3,
        rangeHigh: safeEma + safeAtr * 0.5,
        type: 'PULLBACK_EMA',
        reasoning: `Giá cách EMA20 ${distancePct.toFixed(2)}% — chờ pullback về ~${optimal.toFixed(4)}`,
        distanceFromCurrentPct: ((optimal - currentPrice) / currentPrice) * 100,
      };
    }
    const optimal = safeEma - safeAtr * 0.2;
    return {
      optimal,
      rangeLow: safeEma - safeAtr * 0.5,
      rangeHigh: safeEma + safeAtr * 0.3,
      type: 'PULLBACK_EMA',
      reasoning: `Giá cách EMA20 ${distancePct.toFixed(2)}% — chờ hồi lên ~${optimal.toFixed(4)}`,
      distanceFromCurrentPct: ((optimal - currentPrice) / currentPrice) * 100,
    };
  }

  const relevantWall =
    direction === 'LONG'
      ? whaleWalls.bidWalls.find((w) => w.distancePct >= -1.5 && w.distancePct <= 0.2)
      : whaleWalls.askWalls.find((w) => w.distancePct <= 1.5 && w.distancePct >= -0.2);

  if (relevantWall) {
    const offset = safeAtr * 0.1;
    if (direction === 'LONG') {
      const optimal = relevantWall.price + offset;
      return {
        optimal,
        rangeLow: relevantWall.price,
        rangeHigh: relevantWall.price + safeAtr * 0.3,
        type: 'WALL_SUPPORT',
        reasoning: `Limit ngay trên Whale Bid Wall ${relevantWall.price.toFixed(4)} (${relevantWall.multiplier.toFixed(1)}× volume TB)`,
        distanceFromCurrentPct: ((optimal - currentPrice) / currentPrice) * 100,
      };
    }
    const optimal = relevantWall.price - offset;
    return {
      optimal,
      rangeLow: relevantWall.price - safeAtr * 0.3,
      rangeHigh: relevantWall.price,
      type: 'WALL_SUPPORT',
      reasoning: `Limit ngay dưới Whale Ask Wall ${relevantWall.price.toFixed(4)} (${relevantWall.multiplier.toFixed(1)}× volume TB)`,
      distanceFromCurrentPct: ((optimal - currentPrice) / currentPrice) * 100,
    };
  }

  const microOffset = safeAtr * 0.1;
  if (direction === 'LONG') {
    const optimal = currentPrice - microOffset;
    return {
      optimal,
      rangeLow: currentPrice - safeAtr * 0.25,
      rangeHigh: currentPrice,
      type: 'MARKET_NEAR',
      reasoning: `Giá gần EMA20 (${distancePct.toFixed(2)}%) — đặt limit thấp hơn giá hiện tại ${microOffset.toFixed(4)} để vào tốt hơn`,
      distanceFromCurrentPct: ((optimal - currentPrice) / currentPrice) * 100,
    };
  }
  const optimal = currentPrice + microOffset;
  return {
    optimal,
    rangeLow: currentPrice,
    rangeHigh: currentPrice + safeAtr * 0.25,
    type: 'MARKET_NEAR',
    reasoning: `Giá gần EMA20 (${distancePct.toFixed(2)}%) — đặt limit cao hơn giá hiện tại ${microOffset.toFixed(4)} để vào tốt hơn`,
    distanceFromCurrentPct: ((optimal - currentPrice) / currentPrice) * 100,
  };
}

/** Kiểm tra SL có được whale wall bảo vệ phía sau không. */
export function evaluateWhaleWallSLSafety(
  walls: WhaleWall[],
  slPrice: number,
  direction: 'LONG' | 'SHORT',
): { isSafe: boolean; safeSLReason?: string } {
  const isSafe = walls.some((w) => isWallProtectingSL(w.price, slPrice, direction));
  return {
    isSafe,
    safeSLReason: isSafe
      ? 'Vị thế cắt lỗ cực kỳ an toàn nhờ nấp sau tường gom hàng của Cá mập'
      : undefined,
  };
}

/** Tường thanh khoản lớn từ heatmap pools */
export function detectWhaleWalls(
  pools: LiquidityPool[],
  minStrength = 3,
): LiquidityPool[] {
  return pools.filter(
    (p) =>
      p.type === 'ORDERBOOK_WALL' &&
      Number.isFinite(p.price) &&
      p.price > 0 &&
      p.strength >= minStrength,
  );
}

/** Whale wall nằm phía bảo vệ SL (long: wall ≤ SL, short: wall ≥ SL) */
export function isWallProtectingSL(
  wallPrice: number,
  slPrice: number,
  direction: 'LONG' | 'SHORT',
): boolean {
  if (!Number.isFinite(wallPrice) || !Number.isFinite(slPrice)) return false;
  if (direction === 'LONG') return wallPrice <= slPrice;
  return wallPrice >= slPrice;
}

/** Xây chuỗi CVDPoint từ klines 1H */
export function buildCVDPointsFromKlines(klines: Kline[]): CVDPoint[] {
  if (klines.length < 2) return [];
  const ohlcv = klinesToOHLCV(klines);
  const delta = calculateBarDelta(
    ohlcv.open,
    ohlcv.high,
    ohlcv.low,
    ohlcv.close,
    ohlcv.volume,
    ohlcv.takerBuyVolume,
  );
  const cvd = calculateCVD(delta);
  const points: CVDPoint[] = [];
  for (let i = 0; i < klines.length; i++) {
    if (!Number.isFinite(cvd[i])) continue;
    points.push({
      timestamp: klines[i].openTime,
      cvd: cvd[i],
      price: klines[i].close,
    });
  }
  return points;
}

// ─────────────────────────────────────────
// EMA ANALYSIS V3 — thêm slope + distance
// ─────────────────────────────────────────

export interface EMAAnalysisV3 {
  ema20: number;
  ema50: number;
  ema200: number | null;
  slope20: 'UP' | 'DOWN' | 'FLAT';
  slope50: 'UP' | 'DOWN' | 'FLAT';
  priceVsEma20Pct: number;
  priceVsEma50Pct: number;
  priceAboveEma20: boolean;
  priceAboveEma50: boolean;
}

export function getEMAAnalysisV3(klines: Kline[]): EMAAnalysisV3 {
  if (klines.length < 50) {
    const price = klines[klines.length - 1]?.close ?? 0;
    return {
      ema20: price,
      ema50: price,
      ema200: null,
      slope20: 'FLAT',
      slope50: 'FLAT',
      priceVsEma20Pct: 0,
      priceVsEma50Pct: 0,
      priceAboveEma20: true,
      priceAboveEma50: true,
    };
  }

  const closes = closesFromKlines(klines);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = klines.length >= 200 ? calculateEMA(closes, 200) : null;

  const last = closes.length - 1;
  const price = closes[last];
  const ema20 = ema20Arr[last];
  const ema50 = ema50Arr[last];

  const calcSlope = (arr: Float32Array, lookback = 3): 'UP' | 'DOWN' | 'FLAT' => {
    const prevIdx = last - lookback;
    if (prevIdx < 0 || !Number.isFinite(arr[prevIdx]) || !Number.isFinite(arr[last])) {
      return 'FLAT';
    }
    const changePct = ((arr[last] - arr[prevIdx]) / arr[prevIdx]) * 100;
    if (changePct > 0.15) return 'UP';
    if (changePct < -0.15) return 'DOWN';
    return 'FLAT';
  };

  return {
    ema20,
    ema50,
    ema200: ema200Arr ? ema200Arr[last] : null,
    slope20: calcSlope(ema20Arr),
    slope50: calcSlope(ema50Arr),
    priceVsEma20Pct:
      !Number.isFinite(ema20) || ema20 === 0 ? 0 : ((price - ema20) / ema20) * 100,
    priceVsEma50Pct:
      !Number.isFinite(ema50) || ema50 === 0 ? 0 : ((price - ema50) / ema50) * 100,
    priceAboveEma20: price > ema20,
    priceAboveEma50: price > ema50,
  };
}

// ─────────────────────────────────────────
// BOLLINGER V3 — thêm bandwidth + marketMode
// ─────────────────────────────────────────

export interface BollingerAnalysisV3 extends Omit<BollingerResult, 'bandwidth'> {
  percentB: number;
  bandwidth: number;
  bandwidthSlope: 'EXPANDING' | 'CONTRACTING' | 'FLAT';
  marketMode: 'TRENDING' | 'RANGING';
}

function bollingerBandwidthPct(bb: BollingerResult, barIndex: number): number {
  const upper = bb.upper[barIndex];
  const lower = bb.lower[barIndex];
  const middle = bb.middle[barIndex];
  if (!Number.isFinite(upper) || !Number.isFinite(lower) || !Number.isFinite(middle) || middle === 0) {
    return 0;
  }
  return ((upper - lower) / middle) * 100;
}

export function getBollingerAnalysisV3(klines: Kline[]): BollingerAnalysisV3 {
  const bb = getBollinger(klines);
  const last = bb.upper.length - 1;
  const price = klines[klines.length - 1]?.close ?? 0;
  const percentB = getBollingerPercentB(bb, price, last);
  const bw = bollingerBandwidthPct(bb, last);

  let bwPrev = bw;
  if (klines.length > 25) {
    const slicePrev = klines.slice(0, klines.length - 5);
    const bbPrev = getBollinger(slicePrev);
    const prevIdx = bbPrev.upper.length - 1;
    if (prevIdx >= 0) {
      bwPrev = bollingerBandwidthPct(bbPrev, prevIdx);
    }
  }

  let bandwidthSlope: BollingerAnalysisV3['bandwidthSlope'] = 'FLAT';
  if (bw > bwPrev * 1.08) bandwidthSlope = 'EXPANDING';
  else if (bw < bwPrev * 0.92) bandwidthSlope = 'CONTRACTING';

  const marketMode: BollingerAnalysisV3['marketMode'] =
    bandwidthSlope === 'EXPANDING' && bw > 4 ? 'TRENDING' : 'RANGING';

  return { ...bb, percentB, bandwidth: bw, bandwidthSlope, marketMode };
}

// ─────────────────────────────────────────
// MACD V3 — thêm turning point + zero cross
// ─────────────────────────────────────────

export interface MACDAnalysisV3 extends MACDValues {
  isTurningUp: boolean;
  isTurningDown: boolean;
  crossedZeroRecentlyUp: boolean;
  crossedZeroRecentlyDown: boolean;
}

export function getMACDAnalysisV3(klines: Kline[]): MACDAnalysisV3 {
  const base = getMACD(klines);
  const { histogram } = calculateMACD(closesFromKlines(klines));

  const getHist = (offset: number): number => {
    const idx = histogram.length - 1 - offset;
    if (idx < 0) return NaN;
    const v = histogram[idx];
    return Number.isFinite(v) ? v : NaN;
  };

  const h0 = getHist(0);
  const h1 = getHist(1);
  const h2 = getHist(2);
  const h3 = getHist(3);

  return {
    ...base,
    isTurningUp: !Number.isNaN(h0) && !Number.isNaN(h1) && !Number.isNaN(h2) && h0 > h1 && h1 > h2,
    isTurningDown:
      !Number.isNaN(h0) && !Number.isNaN(h1) && !Number.isNaN(h2) && h0 < h1 && h1 < h2,
    crossedZeroRecentlyUp: !Number.isNaN(h3) && !Number.isNaN(h0) && h3 < 0 && h0 > 0,
    crossedZeroRecentlyDown: !Number.isNaN(h3) && !Number.isNaN(h0) && h3 > 0 && h0 < 0,
  };
}

// ─────────────────────────────────────────
// RSI DIVERGENCE — đơn giản, ít false positive
// ─────────────────────────────────────────

export function detectRSIDivergenceV3(
  klines: Kline[],
  lookback = 20,
): 'BULLISH' | 'BEARISH' | 'NONE' {
  if (klines.length < lookback + 5) return 'NONE';

  const closes = klines.map((k) => k.close);
  const rsiArr = calculateRSI(closesFromKlines(klines), 14);
  const len = closes.length;

  const mid = Math.floor(lookback / 2);
  const recentPrices = closes.slice(len - mid);
  const olderPrices = closes.slice(len - lookback, len - mid);
  const recentRSI = Array.from(rsiArr.slice(len - mid)).filter((v) => Number.isFinite(v));
  const olderRSI = Array.from(rsiArr.slice(len - lookback, len - mid)).filter((v) =>
    Number.isFinite(v),
  );

  if (recentRSI.length === 0 || olderRSI.length === 0) return 'NONE';

  const recentLowPrice = Math.min(...recentPrices);
  const olderLowPrice = Math.min(...olderPrices);
  const recentLowRSI = Math.min(...recentRSI);
  const olderLowRSI = Math.min(...olderRSI);

  if (recentLowPrice < olderLowPrice * 0.995 && recentLowRSI > olderLowRSI + 4) {
    return 'BULLISH';
  }

  const recentHighPrice = Math.max(...recentPrices);
  const olderHighPrice = Math.max(...olderPrices);
  const recentHighRSI = Math.max(...recentRSI);
  const olderHighRSI = Math.max(...olderRSI);

  if (recentHighPrice > olderHighPrice * 1.005 && recentHighRSI < olderHighRSI - 4) {
    return 'BEARISH';
  }

  return 'NONE';
}

// ─────────────────────────────────────────
// SESSION SCORE V3
// ─────────────────────────────────────────

export function getSessionScoreV3(timezoneOffset = 7): {
  score: number;
  sessionName: string;
  reason: string;
} {
  const hourVN = getCurrentHourVN(timezoneOffset);

  for (const session of SESSION_RULES_V3) {
    const { start, end, score, name, description } = session;
    const normalEnd = end > 24 ? end - 24 : end;
    const wraps = end > 24;

    if (wraps) {
      if (hourVN >= start || hourVN < normalEnd) {
        return { score, sessionName: name, reason: description };
      }
    } else if (hourVN >= start && hourVN < end) {
      return { score, sessionName: name, reason: description };
    }
  }

  return {
    score: 0,
    sessionName: 'Unknown',
    reason: 'Không xác định phiên',
  };
}

// ─────────────────────────────────────────
// BTC ANALYSIS V3 — thêm 1H momentum
// ─────────────────────────────────────────

export interface BTCAnalysisV3 {
  change24h: number;
  change1h: number;
  momentum: 'ACCELERATING' | 'DECELERATING' | 'NEUTRAL';
  riskMode: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
}

export function getBTCAnalysisV3(
  btcKlines1h: Kline[],
  btc24hChangePct: number,
): BTCAnalysisV3 {
  let change1h = 0;
  if (btcKlines1h.length >= 2) {
    const last = btcKlines1h[btcKlines1h.length - 1].close;
    const prev = btcKlines1h[btcKlines1h.length - 2].close;
    change1h = prev === 0 ? 0 : ((last - prev) / prev) * 100;
  }

  let momentum: BTCAnalysisV3['momentum'] = 'NEUTRAL';
  if (btc24hChangePct > 0 && change1h > (btc24hChangePct / 24) * 2) {
    momentum = 'ACCELERATING';
  } else if (btc24hChangePct > 0 && change1h < 0) {
    momentum = 'DECELERATING';
  } else if (btc24hChangePct < 0 && change1h < (btc24hChangePct / 24) * 2) {
    momentum = 'ACCELERATING';
  } else if (btc24hChangePct < 0 && change1h > 0) {
    momentum = 'DECELERATING';
  }

  const riskMode: BTCAnalysisV3['riskMode'] =
    btc24hChangePct > 0.5 ? 'RISK_ON' : btc24hChangePct < -0.5 ? 'RISK_OFF' : 'NEUTRAL';

  return { change24h: btc24hChangePct, change1h, momentum, riskMode };
}

// ─────────────────────────────────────────
// FUNDING ANALYSIS V3 — thêm trend
// ─────────────────────────────────────────

export interface FundingAnalysisV3 {
  currentRate: number;
  rateHistory: number[];
  trend: 'RISING' | 'FALLING' | 'STABLE';
  extremeRisk: 'LONG_SQUEEZE' | 'SHORT_SQUEEZE' | 'NONE';
}

export function getFundingAnalysisV3(
  fundingHistory: { rate: number; timestamp: number }[],
): FundingAnalysisV3 {
  if (fundingHistory.length === 0) {
    return {
      currentRate: 0,
      rateHistory: [],
      trend: 'STABLE',
      extremeRisk: 'NONE',
    };
  }

  const sorted = [...fundingHistory].sort((a, b) => a.timestamp - b.timestamp).slice(-5);
  const rates = sorted.map((f) => f.rate);
  const current = rates[rates.length - 1] ?? 0;

  let trend: FundingAnalysisV3['trend'] = 'STABLE';
  if (rates.length >= 2) {
    const delta = current - rates[0];
    if (delta > 0.002) trend = 'RISING';
    else if (delta < -0.002) trend = 'FALLING';
  }

  const extremeRisk: FundingAnalysisV3['extremeRisk'] =
    current > 0.03 ? 'LONG_SQUEEZE' : current < -0.03 ? 'SHORT_SQUEEZE' : 'NONE';

  return { currentRate: current, rateHistory: rates, trend, extremeRisk };
}

// ─────────────────────────────────────────
// WIN STREAK CHECK
// ─────────────────────────────────────────

export function checkWinStreakV3(
  journal: Array<{ outcome: { status: string } }>,
): { hasWarning: boolean; streak: number; message: string } {
  const closed = journal
    .filter((t) => t.outcome.status === 'WIN' || t.outcome.status === 'LOSS')
    .slice(-10)
    .reverse();

  let streak = 0;
  for (const t of closed) {
    if (t.outcome.status === 'WIN') streak++;
    else break;
  }

  if (streak >= WIN_STREAK_CONFIG.warningThreshold) {
    return {
      hasWarning: true,
      streak,
      message:
        `⚠️ Chuỗi ${streak} lệnh thắng liên tiếp — ` +
        `nguy cơ overconfidence. ` +
        `Cân nhắc giảm size 50% lệnh này.`,
    };
  }

  return { hasWarning: false, streak, message: '' };
}

// ─────────────────────────────────────────
// SWING HIGH / LOW DETECTION
// ─────────────────────────────────────────

export interface SwingLevel {
  price: number;
  type: 'HIGH' | 'LOW';
  strength: number; // số nến confirm (1-5)
  timestamp: number;
  distanceFromCurrentPct: number;
}

export function detectSwingLevels(
  klines: Kline[],
  currentPrice: number,
  lookback: number = 50,
  strength: number = 3,
): SwingLevel[] {
  const levels: SwingLevel[] = [];
  const slice = klines.slice(-lookback);

  for (let i = strength; i < slice.length - strength; i++) {
    const curr = slice[i];

    // Swing High: nến giữa có High cao hơn tất cả nến xung quanh
    let isSwingHigh = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (slice[j].high >= curr.high) {
        isSwingHigh = false;
        break;
      }
    }

    // Swing Low: nến giữa có Low thấp hơn tất cả
    let isSwingLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (slice[j].low <= curr.low) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingHigh) {
      levels.push({
        price: curr.high,
        type: 'HIGH',
        strength,
        timestamp: curr.openTime,
        distanceFromCurrentPct: ((curr.high - currentPrice) / currentPrice) * 100,
      });
    }
    if (isSwingLow) {
      levels.push({
        price: curr.low,
        type: 'LOW',
        strength,
        timestamp: curr.openTime,
        distanceFromCurrentPct: ((curr.low - currentPrice) / currentPrice) * 100,
      });
    }
  }

  // Sort: swing gần giá hiện tại nhất trước
  return levels.sort(
    (a, b) => Math.abs(a.distanceFromCurrentPct) - Math.abs(b.distanceFromCurrentPct),
  );
}

// ─────────────────────────────────────────
// KEY LEVELS: Tìm mức hỗ trợ/kháng cự gần nhất
// ─────────────────────────────────────────

export interface KeyLevel {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE';
  strength: 'STRONG' | 'MEDIUM' | 'WEAK';
  source: 'SWING' | 'EMA' | 'ROUND_NUMBER' | 'WHALE_WALL';
  distancePct: number;
  distanceUSDT: number;
}

export function getKeyLevels(
  klines1h: Kline[],
  klines4h: Kline[],
  currentPrice: number,
  ema1h: EMAAnalysisV3,
  ema4h: EMAAnalysisV3,
  whaleWalls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
): { supports: KeyLevel[]; resistances: KeyLevel[] } {
  const supports: KeyLevel[] = [];
  const resistances: KeyLevel[] = [];

  // 1. Swing levels từ 4H (mạnh hơn)
  const swings4h = detectSwingLevels(klines4h, currentPrice, 50, 3);
  for (const s of swings4h) {
    const level: KeyLevel = {
      price: s.price,
      type: s.type === 'LOW' ? 'SUPPORT' : 'RESISTANCE',
      strength: 'STRONG',
      source: 'SWING',
      distancePct: s.distanceFromCurrentPct,
      distanceUSDT: Math.abs(s.price - currentPrice),
    };
    if (s.type === 'LOW') supports.push(level);
    else resistances.push(level);
  }

  // 2. Swing levels từ 1H (yếu hơn)
  const swings1h = detectSwingLevels(klines1h, currentPrice, 30, 2);
  for (const s of swings1h) {
    const level: KeyLevel = {
      price: s.price,
      type: s.type === 'LOW' ? 'SUPPORT' : 'RESISTANCE',
      strength: 'MEDIUM',
      source: 'SWING',
      distancePct: s.distanceFromCurrentPct,
      distanceUSDT: Math.abs(s.price - currentPrice),
    };
    if (s.type === 'LOW') supports.push(level);
    else resistances.push(level);
  }

  // 3. EMA levels
  const emas = [
    { price: ema1h.ema20, label: 'EMA20 1H' },
    { price: ema1h.ema50, label: 'EMA50 1H' },
    { price: ema4h.ema20, label: 'EMA20 4H' },
    { price: ema4h.ema50, label: 'EMA50 4H' },
  ];
  for (const ema of emas) {
    if (isNaN(ema.price)) continue;
    const distPct = ((ema.price - currentPrice) / currentPrice) * 100;
    const level: KeyLevel = {
      price: ema.price,
      type: ema.price < currentPrice ? 'SUPPORT' : 'RESISTANCE',
      strength: 'MEDIUM',
      source: 'EMA',
      distancePct: distPct,
      distanceUSDT: Math.abs(ema.price - currentPrice),
    };
    if (ema.price < currentPrice) supports.push(level);
    else resistances.push(level);
  }

  // 4. Round numbers (tâm lý thị trường)
  const roundInterval =
    currentPrice < 1
      ? 0.1
      : currentPrice < 10
        ? 0.5
        : currentPrice < 100
          ? 5
          : currentPrice < 1000
            ? 50
            : 500;

  for (let mult = -10; mult <= 10; mult++) {
    if (mult === 0) continue;
    const roundPrice =
      Math.round(currentPrice / roundInterval) * roundInterval + mult * roundInterval;
    if (roundPrice <= 0) continue;
    const distPct = ((roundPrice - currentPrice) / currentPrice) * 100;
    if (Math.abs(distPct) > 10) continue;

    const level: KeyLevel = {
      price: +roundPrice.toFixed(4),
      type: roundPrice < currentPrice ? 'SUPPORT' : 'RESISTANCE',
      strength: 'WEAK',
      source: 'ROUND_NUMBER',
      distancePct: distPct,
      distanceUSDT: Math.abs(roundPrice - currentPrice),
    };
    if (roundPrice < currentPrice) supports.push(level);
    else resistances.push(level);
  }

  // 5. Whale Walls
  for (const w of whaleWalls.bidWalls) {
    supports.push({
      price: w.price,
      type: 'SUPPORT',
      strength: w.multiplier >= 10 ? 'STRONG' : 'MEDIUM',
      source: 'WHALE_WALL',
      distancePct: w.distancePct,
      distanceUSDT: Math.abs(w.price - currentPrice),
    });
  }
  for (const w of whaleWalls.askWalls) {
    resistances.push({
      price: w.price,
      type: 'RESISTANCE',
      strength: w.multiplier >= 10 ? 'STRONG' : 'MEDIUM',
      source: 'WHALE_WALL',
      distancePct: w.distancePct,
      distanceUSDT: Math.abs(w.price - currentPrice),
    });
  }

  // Sort: gần giá nhất trước
  const sortByDist = (a: KeyLevel, b: KeyLevel) =>
    Math.abs(a.distancePct) - Math.abs(b.distancePct);

  return {
    supports: supports.filter((s) => s.price < currentPrice).sort(sortByDist).slice(0, 8),
    resistances: resistances.filter((r) => r.price > currentPrice).sort(sortByDist).slice(0, 8),
  };
}

interface KeyLevelsCacheEntry {
  value: ReturnType<typeof getKeyLevels>;
  computedAt: number;
  priceAtComputation: number;
}

const keyLevelsCache: Record<string, KeyLevelsCacheEntry> = {};

const CACHE_VALID_MS = 5 * 60_000;
const PRICE_CHANGE_INVALIDATE_PCT = 1.5;

function whaleWallsToKeyLevels(
  whaleWalls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
  currentPrice: number,
): { supports: KeyLevel[]; resistances: KeyLevel[] } {
  const supports = whaleWalls.bidWalls.map((w) => ({
    price: w.price,
    type: 'SUPPORT' as const,
    strength: (w.multiplier >= 10 ? 'STRONG' : 'MEDIUM') as KeyLevel['strength'],
    source: 'WHALE_WALL' as const,
    distancePct: w.distancePct,
    distanceUSDT: Math.abs(w.price - currentPrice),
  }));
  const resistances = whaleWalls.askWalls.map((w) => ({
    price: w.price,
    type: 'RESISTANCE' as const,
    strength: (w.multiplier >= 10 ? 'STRONG' : 'MEDIUM') as KeyLevel['strength'],
    source: 'WHALE_WALL' as const,
    distancePct: w.distancePct,
    distanceUSDT: Math.abs(w.price - currentPrice),
  }));
  return { supports, resistances };
}

/** Lọc theo giá hiện tại, cập nhật khoảng cách, sort và giới hạn 8 level — giống getKeyLevels(). */
function finalizeKeyLevels(
  supports: KeyLevel[],
  resistances: KeyLevel[],
  currentPrice: number,
): { supports: KeyLevel[]; resistances: KeyLevel[] } {
  const refreshDist = (level: KeyLevel): KeyLevel => {
    const distancePct = ((level.price - currentPrice) / currentPrice) * 100;
    return {
      ...level,
      distancePct,
      distanceUSDT: Math.abs(level.price - currentPrice),
    };
  };
  const sortByDist = (a: KeyLevel, b: KeyLevel) =>
    Math.abs(a.distancePct) - Math.abs(b.distancePct);

  return {
    supports: supports
      .filter((s) => s.price < currentPrice)
      .map(refreshDist)
      .sort(sortByDist)
      .slice(0, 8),
    resistances: resistances
      .filter((r) => r.price > currentPrice)
      .map(refreshDist)
      .sort(sortByDist)
      .slice(0, 8),
  };
}

export function getKeyLevelsCached(
  symbol: string,
  klines1h: Kline[],
  klines4h: Kline[],
  currentPrice: number,
  ema1h: EMAAnalysisV3,
  ema4h: EMAAnalysisV3,
  whaleWalls: { bidWalls: WhaleWall[]; askWalls: WhaleWall[] },
): ReturnType<typeof getKeyLevels> {
  const cached = keyLevelsCache[symbol];
  const now = Date.now();

  if (cached && cached.priceAtComputation > 0) {
    const ageMs = now - cached.computedAt;
    const priceChangePct =
      Math.abs((currentPrice - cached.priceAtComputation) / cached.priceAtComputation) * 100;

    if (ageMs < CACHE_VALID_MS && priceChangePct < PRICE_CHANGE_INVALIDATE_PCT) {
      const { supports: whaleSupports, resistances: whaleResistances } = whaleWallsToKeyLevels(
        whaleWalls,
        currentPrice,
      );
      return finalizeKeyLevels(
        cached.value.supports.filter((s) => s.source !== 'WHALE_WALL').concat(whaleSupports),
        cached.value.resistances.filter((r) => r.source !== 'WHALE_WALL').concat(whaleResistances),
        currentPrice,
      );
    }
  }

  const fresh = getKeyLevels(klines1h, klines4h, currentPrice, ema1h, ema4h, whaleWalls);

  keyLevelsCache[symbol] = {
    value: fresh,
    computedAt: now,
    priceAtComputation: currentPrice,
  };

  return fresh;
}

export function clearKeyLevelsCache(symbol?: string): void {
  if (symbol) {
    delete keyLevelsCache[symbol];
    return;
  }
  for (const key of Object.keys(keyLevelsCache)) {
    delete keyLevelsCache[key];
  }
}

// ─────────────────────────────────────────
// WIN PROBABILITY ESTIMATE
// Dựa trên Score + Market Mode + R:R
// ─────────────────────────────────────────

export function estimateWinProbability(
  totalScore: number,
  marketMode: 'TRENDING' | 'RANGING',
  direction: 'LONG' | 'SHORT',
  groupScores: { A: number; B: number; C: number },
  rrRatio: number,
): number {

  // Base probability từ score
  let prob = 0.5; // baseline

  if (totalScore >= 11.5) prob = 0.78;
  else if (totalScore >= 11) prob = 0.74;
  else if (totalScore >= 10.5) prob = 0.71;
  else if (totalScore >= 10) prob = 0.68;
  else if (totalScore >= 9.5) prob = 0.65;
  else if (totalScore >= 9) prob = 0.62;
  else prob = 0.52;

  // Điều chỉnh theo Market Mode
  if (marketMode === 'TRENDING') prob += 0.02;
  else prob -= 0.01;

  // Bonus Group B (dòng tiền) — quan trọng nhất
  if (groupScores.B >= 4.0) prob += 0.04;
  else if (groupScores.B >= 3.5) prob += 0.02;
  else if (groupScores.B < 2.5) prob -= 0.03;

  // Bonus Group A (xu hướng rõ)
  if (groupScores.A >= 4.5) prob += 0.02;

  // Penalty nếu R:R quá cao (unrealistic)
  if (rrRatio > 4) prob -= 0.05;
  if (rrRatio > 3) prob -= 0.02;

  return Math.max(0.4, Math.min(0.9, prob));
}

// ─────────────────────────────────────────
// ADX — Average Directional Index (Wilder)
// ─────────────────────────────────────────

export interface ADXAnalysis {
  adx1H: number;
  adx4H: number;
  adxAvg: number;
  regime: 'CHOPPY' | 'RANGING' | 'TRENDING';
  /** Chỉ mang ý nghĩa khi `regime === 'TRENDING'` — mặc định WEAK nếu không. */
  regimeStrength: 'WEAK' | 'STRONG';
  isChoppy1H: boolean;
  isChoppy4H: boolean;
  /** Cả 1H và 4H ADX < 15 — tín hiệu hard block cho caller. */
  bothChoppy: boolean;
}

const ADX_PERIOD = 14;
const ADX_CHOPPY_THRESHOLD = 15;
const ADX_RANGING_THRESHOLD = 25;
const ADX_TRENDING_WEAK_THRESHOLD = 35;

function wilderAdxFromKlines(klines: Kline[], period = ADX_PERIOD): number {
  if (klines.length < period + 2) return 0;

  const { high, low, close } = klinesToOHLCV(klines);
  const n = close.length;
  const dmLen = n - 1;
  const plusDm = new Float32Array(dmLen);
  const minusDm = new Float32Array(dmLen);
  const tr = new Float32Array(dmLen);

  for (let i = 1; i < n; i++) {
    const idx = i - 1;
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    plusDm[idx] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[idx] = downMove > upMove && downMove > 0 ? downMove : 0;
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr[idx] = Math.max(hl, hc, lc);
  }

  const smoothTr = calculateWilderEMA(tr, period);
  const smoothPlusDm = calculateWilderEMA(plusDm, period);
  const smoothMinusDm = calculateWilderEMA(minusDm, period);

  const dx = new Float32Array(dmLen);
  for (let i = period - 1; i < dmLen; i++) {
    const atr = smoothTr[i];
    if (!Number.isFinite(atr) || atr <= 0) continue;
    const plusDi = (100 * smoothPlusDm[i]) / atr;
    const minusDi = (100 * smoothMinusDm[i]) / atr;
    const diSum = plusDi + minusDi;
    dx[i] = diSum > 0 ? (100 * Math.abs(plusDi - minusDi)) / diSum : 0;
  }

  const smoothDx = calculateWilderEMA(dx, period);
  const adx = lastValid(smoothDx);
  return adx != null && Number.isFinite(adx) ? adx : 0;
}

function resolveAdxRegime(adxAvg: number): Pick<ADXAnalysis, 'regime' | 'regimeStrength'> {
  if (adxAvg < ADX_CHOPPY_THRESHOLD) {
    return { regime: 'CHOPPY', regimeStrength: 'WEAK' };
  }
  if (adxAvg < ADX_RANGING_THRESHOLD) {
    return { regime: 'RANGING', regimeStrength: 'WEAK' };
  }
  if (adxAvg < ADX_TRENDING_WEAK_THRESHOLD) {
    return { regime: 'TRENDING', regimeStrength: 'WEAK' };
  }
  return { regime: 'TRENDING', regimeStrength: 'STRONG' };
}

export function getADXAnalysis(klines1H: Kline[], klines4H: Kline[]): ADXAnalysis {
  const adx1H = wilderAdxFromKlines(klines1H, ADX_PERIOD);
  const adx4H = wilderAdxFromKlines(klines4H, ADX_PERIOD);
  const adxAvg = (adx1H + adx4H) / 2;
  const { regime, regimeStrength } = resolveAdxRegime(adxAvg);
  const isChoppy1H = adx1H < ADX_CHOPPY_THRESHOLD;
  const isChoppy4H = adx4H < ADX_CHOPPY_THRESHOLD;

  return {
    adx1H,
    adx4H,
    adxAvg,
    regime,
    regimeStrength,
    isChoppy1H,
    isChoppy4H,
    bothChoppy: isChoppy1H && isChoppy4H,
  };
}

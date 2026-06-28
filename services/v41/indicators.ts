/**
 * V4.1 technical indicators — standalone, no imports from services/ (V3/V4).
 * Formulas: docs/V4.1_FORMULAS.md — Engine 1 (EMA, ADX, EMA slope).
 */

export interface KlineV41 {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  takerBuyVolume: number; // Volume mua chủ động (taker buy base volume)
}

/**
 * Standard EMA: α = 2/(period+1), seed = SMA of first `period` closes.
 * Indices 0..period-2 are NaN; EMA starts at index period-1.
 */
export function calculateEMA(closes: number[], period: number): number[] {
  const length = closes.length;
  const result = new Array<number>(length).fill(NaN);

  if (period <= 0 || length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < length; i++) {
    const prev = result[i - 1];
    result[i] = closes[i] * multiplier + prev * (1 - multiplier);
  }

  return result;
}

function wilderSmooth(
  values: number[],
  period: number,
  startIndex: number,
): number[] {
  const length = values.length;
  const smoothed = new Array<number>(length).fill(NaN);

  if (period <= 0 || length <= startIndex + period - 1) {
    return smoothed;
  }

  let sum = 0;
  for (let i = startIndex; i < startIndex + period; i++) {
    sum += values[i];
  }
  smoothed[startIndex + period - 1] = sum;

  for (let i = startIndex + period; i < length; i++) {
    smoothed[i] = smoothed[i - 1] - smoothed[i - 1] / period + values[i];
  }

  return smoothed;
}

/**
 * Wilder's ADX(period): TR, +DM, −DM → Wilder smooth → +DI/−DI → DX → ADX.
 * Bar 0 has no prior close; TR/DM from index 1.
 * ADX first valid at index 2*period - 1 (needs 2×period smoothed DX values).
 */
export function calculateADX(
  klines: KlineV41[],
  period: number = 14,
): number[] {
  const length = klines.length;
  const adx = new Array<number>(length).fill(NaN);

  if (period <= 0 || length < 2 * period) {
    return adx;
  }

  const tr = new Array<number>(length).fill(0);
  const plusDm = new Array<number>(length).fill(0);
  const minusDm = new Array<number>(length).fill(0);

  for (let i = 1; i < length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevHigh = klines[i - 1].high;
    const prevLow = klines[i - 1].low;
    const prevClose = klines[i - 1].close;

    tr[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  const smoothedTr = wilderSmooth(tr, period, 1);
  const smoothedPlusDm = wilderSmooth(plusDm, period, 1);
  const smoothedMinusDm = wilderSmooth(minusDm, period, 1);

  const dx = new Array<number>(length).fill(NaN);

  for (let i = period; i < length; i++) {
    const trVal = smoothedTr[i];
    if (!Number.isFinite(trVal) || trVal === 0) {
      continue;
    }

    const plusDi = (100 * smoothedPlusDm[i]) / trVal;
    const minusDi = (100 * smoothedMinusDm[i]) / trVal;
    const diSum = plusDi + minusDi;

    if (diSum === 0) {
      continue;
    }

    dx[i] = (100 * Math.abs(plusDi - minusDi)) / diSum;
  }

  const firstAdxIndex = 2 * period - 1;
  if (firstAdxIndex >= length) {
    return adx;
  }

  let dxSum = 0;
  let dxCount = 0;
  for (let i = period; i <= firstAdxIndex; i++) {
    if (Number.isFinite(dx[i])) {
      dxSum += dx[i];
      dxCount++;
    }
  }

  if (dxCount < period) {
    return adx;
  }

  adx[firstAdxIndex] = dxSum / period;

  for (let i = firstAdxIndex + 1; i < length; i++) {
    if (!Number.isFinite(dx[i])) {
      continue;
    }
    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }

  return adx;
}

/**
 * % change of EMA over `lookback` bars (signed, not clamped).
 * slope = (EMA_now − EMA_{lookback}) / EMA_{lookback} × 100
 */
export function calculateEMASlope(
  emaValues: number[],
  lookback: number = 10,
): number {
  if (lookback <= 0 || emaValues.length < lookback + 1) {
    return NaN;
  }

  const last = emaValues[emaValues.length - 1];
  const prior = emaValues[emaValues.length - 1 - lookback];

  if (!Number.isFinite(last) || !Number.isFinite(prior) || prior === 0) {
    return NaN;
  }

  return ((last - prior) / prior) * 100;
}

function computeTrueRange(klines: KlineV41[]): number[] {
  const length = klines.length;
  const tr = new Array<number>(length).fill(0);

  if (length === 0) {
    return tr;
  }

  tr[0] = klines[0].high - klines[0].low;

  for (let i = 1; i < length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;

    tr[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
  }

  return tr;
}

/**
 * Wilder's RSI(period): gain/loss from close changes → Wilder smooth → RS → RSI.
 * First RSI at index `period` (needs period+1 closes).
 */
export function calculateRSI(
  closes: number[],
  period: number = 14,
): number[] {
  const length = closes.length;
  const rsi = new Array<number>(length).fill(NaN);

  if (period <= 0 || length < period + 1) {
    return rsi;
  }

  const gains = new Array<number>(length).fill(0);
  const losses = new Array<number>(length).fill(0);

  for (let i = 1; i < length; i++) {
    const change = closes[i] - closes[i - 1];
    gains[i] = change > 0 ? change : 0;
    losses[i] = change < 0 ? -change : 0;
  }

  const avgGain = wilderSmooth(gains, period, 1);
  const avgLoss = wilderSmooth(losses, period, 1);

  for (let i = period; i < length; i++) {
    const gain = avgGain[i];
    const loss = avgLoss[i];

    if (!Number.isFinite(gain) || !Number.isFinite(loss)) {
      continue;
    }

    if (loss === 0) {
      rsi[i] = gain > 0 ? 100 : 50;
      continue;
    }

    const rs = gain / loss;
    rsi[i] = 100 - 100 / (1 + rs);
  }

  return rsi;
}

/**
 * Wilder's ATR(period): True Range → Wilder smooth.
 * TR[0] = high−low; TR[i≥1] includes prev close.
 * First ATR at index period−1.
 */
export function calculateATR(
  klines: KlineV41[],
  period: number = 14,
): number[] {
  const length = klines.length;
  const atr = new Array<number>(length).fill(NaN);

  if (period <= 0 || length < period) {
    return atr;
  }

  const tr = computeTrueRange(klines);
  const smoothedTr = wilderSmooth(tr, period, 0);

  for (let i = period - 1; i < length; i++) {
    if (Number.isFinite(smoothedTr[i])) {
      atr[i] = smoothedTr[i] / period;
    }
  }

  return atr;
}

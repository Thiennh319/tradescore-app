import { calculateEMA, type KlineV41 } from './indicators';
import type { TrendDirection } from './types';

export type EarlyWarningSeverity = 'CLEAR' | 'WARNING_SOFT' | 'WARNING_HARD' | 'BLOCK';

export type EarlyWarningSignal =
  | 'PRICE_BELOW_EMA20_30M'
  | 'PRICE_ABOVE_EMA20_30M'
  | 'EMA20_SLOPE_DOWN_30M'
  | 'EMA20_SLOPE_UP_30M'
  | 'SELL_PRESSURE_30M'
  | 'BUY_PRESSURE_30M'
  | 'PRICE_BELOW_EMA20_1H'
  | 'PRICE_ABOVE_EMA20_1H'
  | 'BTC_REVERSAL_1H';

export interface EarlyWarningResult {
  rawSeverity: EarlyWarningSeverity;
  signals30M: EarlyWarningSignal[];
  signals1H: EarlyWarningSignal[];
  signalCount: number;
  volumeConfirmed: boolean;
  warningMessage: string;
  blockMessage: string;
  direction: 'LONG' | 'SHORT' | 'BOTH';
}

export interface ComputeRawEarlyWarningParams {
  klines30M: KlineV41[];
  klines1H: KlineV41[];
  btcKlines1H: KlineV41[];
  trendDirection: TrendDirection;
}

const EMA_PERIOD = 20;
const VOLUME_MA_PERIOD = 20;
const VOLUME_CONFIRM_MULTIPLIER = 1.2;
const SELL_PRESSURE_RATIO = 0.4;
const BUY_PRESSURE_RATIO = 0.6;
const SLOPE_LOOKBACK_30M = 3;

type TradeDirection = 'LONG' | 'SHORT';

function resolveDirection(trendDirection: TrendDirection): 'LONG' | 'SHORT' | 'BOTH' {
  if (trendDirection === 'BULL') return 'LONG';
  if (trendDirection === 'BEAR') return 'SHORT';
  return 'BOTH';
}

function resolveTradeDirection(trendDirection: TrendDirection): TradeDirection {
  if (trendDirection === 'BEAR') return 'SHORT';
  return 'LONG';
}

function average(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function lastFiniteEma(emaValues: number[], index: number): number | null {
  const value = emaValues[index];
  return Number.isFinite(value) ? value : null;
}

function detectPriceVsEma20(klines: KlineV41[], direction: TradeDirection): boolean {
  if (klines.length < EMA_PERIOD) return false;
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines.length - 1;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  if (lastEma == null) return false;
  if (direction === 'LONG') return closes[lastIdx] < lastEma;
  return closes[lastIdx] > lastEma;
}

function detectEma20Slope(klines: KlineV41[], direction: TradeDirection): boolean {
  if (klines.length < EMA_PERIOD + SLOPE_LOOKBACK_30M) return false;
  const closes = klines.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = klines.length - 1;
  const prevIdx = lastIdx - SLOPE_LOOKBACK_30M;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  const prevEma = lastFiniteEma(ema20, prevIdx);
  if (lastEma == null || prevEma == null) return false;
  if (direction === 'LONG') return lastEma < prevEma;
  return lastEma > prevEma;
}

function detectPressure(klines: KlineV41[], direction: TradeDirection): boolean {
  if (klines.length < 3) return false;
  const lastThree = klines.slice(-3);
  if (direction === 'LONG') {
    return lastThree.every(
      (kline) => kline.takerBuyVolume < kline.volume * SELL_PRESSURE_RATIO,
    );
  }
  return lastThree.every(
    (kline) => kline.takerBuyVolume > kline.volume * BUY_PRESSURE_RATIO,
  );
}

function detectBtcSignal(btcKlines1H: KlineV41[], direction: TradeDirection): boolean {
  if (btcKlines1H.length < EMA_PERIOD) return false;
  const closes = btcKlines1H.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastIdx = btcKlines1H.length - 1;
  const lastEma = lastFiniteEma(ema20, lastIdx);
  if (lastEma == null) return false;

  if (direction === 'LONG') {
    return closes[lastIdx] < lastEma;
  }

  if (closes[lastIdx] <= lastEma) return false;
  if (btcKlines1H.length < EMA_PERIOD + SLOPE_LOOKBACK_30M) return false;

  const prevIdx = lastIdx - SLOPE_LOOKBACK_30M;
  const prevEma = lastFiniteEma(ema20, prevIdx);
  if (prevEma == null) return false;

  return lastEma > prevEma;
}

function detectVolumeConfirmed(klines30M: KlineV41[]): boolean {
  if (klines30M.length < VOLUME_MA_PERIOD + 1) return false;
  const lastIdx = klines30M.length - 1;
  const volumes = klines30M
    .slice(lastIdx - VOLUME_MA_PERIOD, lastIdx)
    .map((kline) => kline.volume);
  const volumeMA20 = average(volumes);
  if (!Number.isFinite(volumeMA20) || volumeMA20 <= 0) return false;
  return klines30M[lastIdx].volume > volumeMA20 * VOLUME_CONFIRM_MULTIPLIER;
}

function resolveTimeframeLabel(signalCount30M: number, signalCount1H: number): string {
  if (signalCount30M > 0 && signalCount1H > 0) return '30M+1H';
  if (signalCount1H > 0) return '1H';
  if (signalCount30M > 0) return '30M';
  return '';
}

function buildWarningMessage(
  signalCount: number,
  signalCount30M: number,
  signalCount1H: number,
): string {
  if (signalCount <= 0) return '';
  const timeframe = resolveTimeframeLabel(signalCount30M, signalCount1H);
  return `⚠️ ${signalCount} tín hiệu đảo chiều ${timeframe} — thận trọng`;
}

function buildBlockMessage(): string {
  return '🔴 Đảo chiều xác nhận 30M+1H+Volume — không vào lệnh';
}

function resolveRawSeverity(
  signalCount30M: number,
  signalCount1H: number,
  volumeConfirmed: boolean,
): EarlyWarningSeverity {
  const totalSignals = signalCount30M + signalCount1H;

  if (totalSignals >= 2 && volumeConfirmed) return 'BLOCK';
  if (signalCount1H >= 1 && volumeConfirmed) return 'WARNING_HARD';
  if (signalCount1H >= 1 && !volumeConfirmed) return 'WARNING_SOFT';
  if (signalCount30M >= 1) return 'WARNING_SOFT';
  return 'CLEAR';
}

function emptyResult(trendDirection: TrendDirection): EarlyWarningResult {
  return {
    rawSeverity: 'CLEAR',
    signals30M: [],
    signals1H: [],
    signalCount: 0,
    volumeConfirmed: false,
    warningMessage: '',
    blockMessage: '',
    direction: resolveDirection(trendDirection),
  };
}

export function computeRawEarlyWarning(
  params: ComputeRawEarlyWarningParams,
): EarlyWarningResult {
  const { klines30M, klines1H, btcKlines1H, trendDirection } = params;

  if (klines30M.length === 0 && klines1H.length === 0) {
    return emptyResult(trendDirection);
  }

  const tradeDirection = resolveTradeDirection(trendDirection);
  const signals30M: EarlyWarningSignal[] = [];
  const signals1H: EarlyWarningSignal[] = [];

  if (klines30M.length > 0) {
    if (detectPriceVsEma20(klines30M, tradeDirection)) {
      signals30M.push(
        tradeDirection === 'LONG' ? 'PRICE_BELOW_EMA20_30M' : 'PRICE_ABOVE_EMA20_30M',
      );
    }
    if (detectEma20Slope(klines30M, tradeDirection)) {
      signals30M.push(
        tradeDirection === 'LONG' ? 'EMA20_SLOPE_DOWN_30M' : 'EMA20_SLOPE_UP_30M',
      );
    }
    if (detectPressure(klines30M, tradeDirection)) {
      signals30M.push(
        tradeDirection === 'LONG' ? 'SELL_PRESSURE_30M' : 'BUY_PRESSURE_30M',
      );
    }
  }

  if (klines1H.length > 0 && detectPriceVsEma20(klines1H, tradeDirection)) {
    signals1H.push(
      tradeDirection === 'LONG' ? 'PRICE_BELOW_EMA20_1H' : 'PRICE_ABOVE_EMA20_1H',
    );
  }

  if (detectBtcSignal(btcKlines1H, tradeDirection)) {
    signals1H.push('BTC_REVERSAL_1H');
  }

  const signalCount30M = signals30M.length;
  const signalCount1H = signals1H.length;
  const signalCount = signalCount30M + signalCount1H;
  const volumeConfirmed = detectVolumeConfirmed(klines30M);
  const rawSeverity = resolveRawSeverity(signalCount30M, signalCount1H, volumeConfirmed);

  return {
    rawSeverity,
    signals30M,
    signals1H,
    signalCount,
    volumeConfirmed,
    warningMessage: buildWarningMessage(signalCount, signalCount30M, signalCount1H),
    blockMessage: buildBlockMessage(),
    direction: resolveDirection(trendDirection),
  };
}

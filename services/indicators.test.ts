import { describe, expect, it } from 'vitest';
import type { Kline } from './binanceApi';
import {
  calculateATR,
  calculateBarDelta,
  calculateBollingerBands,
  calculateCVD,
  calculateEMA,
  calculateLiquidityHeatmap,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateWilderEMA,
  classifyFundingOIRegime,
  classifyMarketRegime,
  detectSMCStructure,
  getBollingerPercentB,
  getCurrentHourVN,
  getEMAs,
  getMACD,
  getRSI,
  getVolumeRatio,
  getRatioSlope,
  getSMA200,
  analyzeCVD,
  type CVDPoint,
  buildCVDPointsFromKlines,
  classifyCvdState,
  evaluateLongCvdHardBlock,
  applyRecoveringCvdLocalPenalty,
  CVD_RECOVERING_SOFT_WARNING,
  detectWhaleWalls,
  isWallProtectingSL,
  klinesToOHLCV,
  analyzeOrderFlow,
} from './indicators';

function makeKlines(closes: number[]): Kline[] {
  return closes.map((close, i) => ({
    openTime: i * 60_000,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100 + i,
    closeTime: i * 60_000 + 59_999,
    quoteVolume: close * 100,
    trades: 10,
  }));
}

function risingCloses(n: number, start = 100): Float32Array {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = start + i;
  return arr;
}

describe('indicators — typed arrays', () => {
  it('klinesToOHLCV produces Float32Array series', () => {
    const series = klinesToOHLCV(makeKlines([100, 101, 102]));
    expect(series.close).toBeInstanceOf(Float32Array);
    expect(series.close[2]).toBe(102);
  });

  it('calculateSMA returns Float32Array', () => {
    const closes = risingCloses(10);
    const sma = calculateSMA(closes, 3);
    expect(sma).toBeInstanceOf(Float32Array);
    expect(sma[2]).toBeCloseTo(101, 0);
  });

  it('calculateWilderEMA and RSI handle short input safely', () => {
    const short = new Float32Array([1, 2]);
    expect(calculateWilderEMA(short, 14).every((v) => Number.isNaN(v))).toBe(true);
    expect(calculateRSI(short, 14).every((v) => Number.isNaN(v))).toBe(true);
  });

  it('calculateBollingerBands includes bandwidth', () => {
    const closes = risingCloses(30, 50);
    const bb = calculateBollingerBands(closes, 20);
    const bw = bb.bandwidth[29];
    expect(Number.isFinite(bw)).toBe(true);
    expect(bw).toBeGreaterThan(0);
  });

  it('calculateATR returns finite values on valid OHLC', () => {
    const highs = risingCloses(20, 101);
    const lows = risingCloses(20, 99);
    const closes = risingCloses(20, 100);
    const atr = calculateATR(highs, lows, closes, 14);
    expect(Number.isFinite(atr[19])).toBe(true);
  });

  it('calculateEMA standard (α=2/(n+1)) khác Wilder và phản ứng nhanh hơn với giá', () => {
    const closes = new Float32Array([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    ]);
    const ema = calculateEMA(closes, 5);
    const wilder = calculateWilderEMA(closes, 5);
    // Cả hai cùng seed bằng SMA(5) nhưng EMA chuẩn dùng α lớn hơn → bám giá nhanh hơn
    expect(ema[14]).toBeGreaterThan(wilder[14]);
    expect(Number.isFinite(ema[14])).toBe(true);
  });

  it('calculateMACD trả histogram = MACD − signal (không phải MACD line)', () => {
    // Chuỗi có inflection để histogram đổi dấu rõ ràng
    const closes = new Float32Array(60);
    for (let i = 0; i < 30; i++) closes[i] = 100 + i;
    for (let i = 30; i < 60; i++) closes[i] = 130 - (i - 30);
    const { macd, signal, histogram } = calculateMACD(closes, 12, 26, 9);
    const last = closes.length - 1;
    expect(Number.isFinite(macd[last])).toBe(true);
    expect(Number.isFinite(signal[last])).toBe(true);
    // histogram phải bằng macd − signal trong sai số float
    expect(histogram[last]).toBeCloseTo(macd[last] - signal[last], 5);
  });

  it('calculateBarDelta dùng takerBuyVolume khi có (CVD thật, không phải proxy wick)', () => {
    const open = new Float32Array([100, 100]);
    const high = new Float32Array([101, 101]);
    const low = new Float32Array([99, 99]);
    const close = new Float32Array([100, 100]); // close = open → wick proxy ≈ 0
    const volume = new Float32Array([1000, 1000]);
    const taker = new Float32Array([700, 300]); // bar1: net buy +400, bar2: net sell -400

    const proxyDelta = calculateBarDelta(open, high, low, close, volume);
    const realDelta = calculateBarDelta(open, high, low, close, volume, taker);

    expect(Math.abs(proxyDelta[0])).toBeLessThan(50); // proxy gần 0 vì close=open
    expect(realDelta[0]).toBeCloseTo(400, 5); // 2·700 − 1000 = 400
    expect(realDelta[1]).toBeCloseTo(-400, 5); // 2·300 − 1000 = −400
  });
});

describe('detectSMCStructure', () => {
  it('finds swings and trend on synthetic wave', () => {
    const n = 30;
    const highs = new Float32Array(n);
    const lows = new Float32Array(n);
    const closes = new Float32Array(n);
    const timestamps = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const wave = Math.sin(i / 3) * 5;
      closes[i] = 100 + wave;
      highs[i] = closes[i] + 1;
      lows[i] = closes[i] - 1;
      timestamps[i] = i * 60_000;
    }

    const smc = detectSMCStructure(highs, lows, closes, timestamps, 2);
    expect(smc.swings.length).toBeGreaterThan(0);
    expect(['BULLISH', 'BEARISH', 'SIDEWAYS']).toContain(smc.trend);
  });

  it('returns empty safe result on insufficient data', () => {
    const smc = detectSMCStructure(
      new Float32Array(2),
      new Float32Array(2),
      new Float32Array(2),
      new Float32Array(2),
    );
    expect(smc.swings).toHaveLength(0);
    expect(smc.trend).toBe('SIDEWAYS');
  });
});

describe('calculateLiquidityHeatmap', () => {
  it('clusters walls above 5× average into Skia coords', () => {
    const thinAsks = Array.from({ length: 50 }, (_, i) => ({
      price: 200 + i,
      quantity: 1,
    }));
    const result = calculateLiquidityHeatmap(
      {
        symbol: 'BTCUSDT',
        lastUpdateId: 1,
        fromCache: false,
        bids: [{ price: 100, quantity: 500 }],
        asks: thinAsks,
      },
      null,
      1,
    );

    expect(result.coords).toBeInstanceOf(Float32Array);
    expect(result.coords.length % 4).toBe(0);
    expect(result.pools.length).toBeGreaterThan(0);
    expect(result.pools[0].strength).toBeGreaterThanOrEqual(5);
  });
});

describe('analyzeOrderFlow', () => {
  it('computes cumulative CVD', () => {
    const klines: Kline[] = [100, 101, 102, 103, 104].map((base, i) => ({
      openTime: i * 60_000,
      open: base - 0.5,
      high: base + 1,
      low: base - 1,
      close: base + 0.8,
      volume: 200,
      closeTime: i * 60_000 + 59_999,
      quoteVolume: base * 200,
      trades: 10,
    }));
    const series = klinesToOHLCV(klines);
    const flow = analyzeOrderFlow(series, null, null);
    expect(flow.cvd).toBeInstanceOf(Float32Array);
    expect(flow.cvd[4]).toBeGreaterThan(0);
    expect(flow.deltaPerBar).toBeInstanceOf(Float32Array);
  });

  it('classifyFundingOIRegime maps squeeze scenarios', () => {
    expect(classifyFundingOIRegime(-100, 0.001, 2)).toBe('LONG_SQUEEZE_RISK');
    expect(classifyFundingOIRegime(-100, -0.001, -2)).toBe('SHORT_SQUEEZE_RISK');
    expect(classifyFundingOIRegime(100, -0.001, 0)).toBe('ACCUMULATION');
  });
});

describe('classifyMarketRegime', () => {
  it('classifies trending bull on rising series', () => {
    const n = 60;
    const closes = risingCloses(n, 100);
    const highs = new Float32Array(n);
    const lows = new Float32Array(n);
    const ts = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      highs[i] = closes[i] + 2;
      lows[i] = closes[i] - 1;
      ts[i] = i * 3_600_000;
    }

    const result = classifyMarketRegime(closes, highs, lows, ts);
    expect(['TRENDING_BULL', 'MEAN_REVERSION', 'HIGH_VOLATILITY_CHOP']).toContain(result.regime);
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe('calculateCVD', () => {
  it('accumulates bar deltas', () => {
    const delta = new Float32Array([10, -5, 3]);
    const cvd = calculateCVD(delta);
    expect(cvd[2]).toBe(8);
  });
});

function makeCvdPoints(cvds: number[]): CVDPoint[] {
  return cvds.map((cvd, i) => ({
    timestamp: i * 3_600_000,
    cvd,
    price: 100 + i,
  }));
}

describe('cvdMomentum24h', () => {
  it('equals currentCvd minus cvd 24 bars ago on 1H series', () => {
    const cvds = Array.from({ length: 30 }, (_, i) => 100 + i * 10);
    const points = makeCvdPoints(cvds);
    const analysis = analyzeCVD(points, 'LONG');
    expect(analysis.cvdMomentum24h).toBe(240);
  });

  it('returns 0 when fewer than 25 CVD points', () => {
    const points = makeCvdPoints([100, 200, 300]);
    expect(analyzeCVD(points, 'LONG').cvdMomentum24h).toBe(0);
    expect(analyzeCVD(points, 'SHORT').cvdMomentum24h).toBe(0);
  });

  it('is exposed on analyzeCVD early return (< 3 points)', () => {
    const points = makeCvdPoints([50, 60]);
    expect(analyzeCVD(points, 'LONG').cvdMomentum24h).toBe(0);
  });

  it('uses buildCVDPointsFromKlines 1H history without extra API', () => {
    const klines = makeKlines(Array.from({ length: 30 }, (_, i) => 100 + i));
    for (let i = 0; i < klines.length; i++) {
      klines[i] = {
        ...klines[i],
        takerBuyVolume: 80 + i,
      };
    }
    const points = buildCVDPointsFromKlines(klines);
    const analysis = analyzeCVD(points, 'LONG');
    expect(typeof analysis.cvdMomentum24h).toBe('number');
    expect(Number.isFinite(analysis.cvdMomentum24h)).toBe(true);
    if (points.length >= 25) {
      const current = points[points.length - 1].cvd;
      const ago24 = points[points.length - 25].cvd;
      expect(analysis.cvdMomentum24h).toBe(current - ago24);
    }
  });
});

/** Enum order in indicators.ts — for classifyCvdState assertions only. */
const CvdState = {
  STRONG_BEARISH: 0,
  BEARISH: 1,
  RECOVERING: 2,
  NEUTRAL: 3,
  BULLISH: 4,
  STRONG_BULLISH: 5,
} as const;

describe('classifyCvdState', () => {
  it('RECOVERING when currentCvd < -20M and cvdMomentum24h > 3M', () => {
    expect(classifyCvdState(-25_000_000, 3_500_000)).toBe(CvdState.RECOVERING);
    expect(classifyCvdState(-21_000_000, 3_000_001)).toBe(CvdState.RECOVERING);
  });

  it('STRONG_BEARISH when currentCvd < -20M and cvdMomentum24h < -3M', () => {
    expect(classifyCvdState(-25_000_000, -3_500_000)).toBe(CvdState.STRONG_BEARISH);
    expect(classifyCvdState(-21_000_000, -3_000_001)).toBe(CvdState.STRONG_BEARISH);
  });

  it('BEARISH when deep negative but momentum between thresholds', () => {
    expect(classifyCvdState(-25_000_000, 0)).toBe(CvdState.BEARISH);
    expect(classifyCvdState(-25_000_000, 3_000_000)).toBe(CvdState.BEARISH);
    expect(classifyCvdState(-25_000_000, -3_000_000)).toBe(CvdState.BEARISH);
  });

  it('NEUTRAL when currentCvd is not deep negative', () => {
    expect(classifyCvdState(-20_000_000, 5_000_000)).toBe(CvdState.NEUTRAL);
    expect(classifyCvdState(-19_000_000, -5_000_000)).toBe(CvdState.NEUTRAL);
    expect(classifyCvdState(0, 0)).toBe(CvdState.NEUTRAL);
  });

  it('does not change analyzeCVD slope/divergence output', () => {
    const points = makeCvdPoints(Array.from({ length: 30 }, (_, i) => 100 + i * 10));
    const analysis = analyzeCVD(points, 'LONG');
    expect(analysis.slope).toBe('up');
    expect(analysis.cvdMomentum24h).toBe(240);
    expect(analysis.supportive).toBe(true);
  });
});

describe('evaluateLongCvdHardBlock', () => {
  it('blocks LONG when deep negative, momentum < -3M, price below EMA20', () => {
    const msg = evaluateLongCvdHardBlock({
      currentCvd: -25_000_000,
      cvdMomentum24h: -3_500_000,
      currentPrice: 95,
      ema20: 100,
    });
    expect(msg).toBe('CVD deeply negative and still deteriorating.');
  });

  it('does not block when CVD only mildly negative (old -2M rule would block)', () => {
    expect(
      evaluateLongCvdHardBlock({
        currentCvd: -2_500_000,
        cvdMomentum24h: -5_000_000,
        currentPrice: 95,
        ema20: 100,
      }),
    ).toBeNull();
  });

  it('does not block when recovering (momentum > 3M)', () => {
    expect(
      evaluateLongCvdHardBlock({
        currentCvd: -25_000_000,
        cvdMomentum24h: 3_500_000,
        currentPrice: 95,
        ema20: 100,
      }),
    ).toBeNull();
  });

  it('does not block when price at or above EMA20', () => {
    expect(
      evaluateLongCvdHardBlock({
        currentCvd: -25_000_000,
        cvdMomentum24h: -3_500_000,
        currentPrice: 100,
        ema20: 100,
      }),
    ).toBeNull();
    expect(
      evaluateLongCvdHardBlock({
        currentCvd: -25_000_000,
        cvdMomentum24h: -3_500_000,
        currentPrice: 101,
        ema20: 100,
      }),
    ).toBeNull();
  });
});

describe('applyRecoveringCvdLocalPenalty', () => {
  it('applies -1 score penalty and soft warning when RECOVERING', () => {
    const result = applyRecoveringCvdLocalPenalty(2, -25_000_000, 3_500_000);
    expect(result.score).toBe(1);
    expect(result.warning).toBe(CVD_RECOVERING_SOFT_WARNING);
    expect(result.reason).toBe(CVD_RECOVERING_SOFT_WARNING);
  });

  it('floors score at 0 after penalty', () => {
    expect(applyRecoveringCvdLocalPenalty(0, -25_000_000, 3_500_000).score).toBe(0);
    expect(applyRecoveringCvdLocalPenalty(1, -25_000_000, 3_500_000).score).toBe(0);
  });

  it('no penalty when not RECOVERING', () => {
    const result = applyRecoveringCvdLocalPenalty(2, -25_000_000, -3_500_000);
    expect(result.score).toBe(2);
    expect(result.warning).toBeNull();
    expect(result.reason).toBeNull();
  });
});

describe('v2 indicator helpers', () => {
  it('getEMAs returns last EMA20/50 values', () => {
    const klines = makeKlines(Array.from(risingCloses(60, 100)));
    const { ema20, ema50 } = getEMAs(klines);
    expect(Number.isFinite(ema20)).toBe(true);
    expect(Number.isFinite(ema50)).toBe(true);
    expect(ema20).toBeGreaterThan(ema50 - 5);
  });

  it('getSMA200 returns null when insufficient bars', () => {
    expect(getSMA200(makeKlines([100, 101, 102]))).toBeNull();
  });

  it('getBollingerPercentB returns 0–100', () => {
    const closes = risingCloses(40, 100);
    const bb = calculateBollingerBands(closes, 20, 2);
    const pctB = getBollingerPercentB(bb, closes[closes.length - 1]!);
    expect(pctB).toBeGreaterThanOrEqual(0);
    expect(pctB).toBeLessThanOrEqual(100);
  });

  it('getRatioSlope detects UP/DOWN/FLAT', () => {
    expect(getRatioSlope([1, 1.01, 1.02, 1.03, 1.04, 1.05])).toBe('UP');
    expect(getRatioSlope([1.05, 1.04, 1.03, 1.02, 1.01, 1])).toBe('DOWN');
    expect(getRatioSlope([1, 1, 1, 1, 1, 1])).toBe('FLAT');
  });

  it('getCurrentHourVN returns hour in 0–24 range', () => {
    const h = getCurrentHourVN(7);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(24);
  });

  it('getRSI and getMACD return finite scalars from klines', () => {
    const klines = makeKlines(Array.from(risingCloses(80, 100)));
    expect(getRSI(klines)).toBeGreaterThan(50);
    const macd = getMACD(klines);
    expect(Number.isFinite(macd.histogram)).toBe(true);
  });

  it('getVolumeRatio compares last bar to average', () => {
    const klines = makeKlines(Array.from({ length: 25 }, (_, i) => 100 + i));
    klines[klines.length - 1] = {
      ...klines[klines.length - 1],
      volume: 500,
    };
    expect(getVolumeRatio(klines)).toBeGreaterThan(1);
  });

  it('analyzeCVD and buildCVDPointsFromKlines work on klines', () => {
    const klines = makeKlines(Array.from(risingCloses(30, 100)));
    const points = buildCVDPointsFromKlines(klines);
    expect(points.length).toBeGreaterThan(0);
    const analysis = analyzeCVD(points, 'LONG');
    expect(['up', 'down', 'flat']).toContain(analysis.slope);
  });

  it('detectWhaleWalls and isWallProtectingSL filter walls', () => {
    const walls = detectWhaleWalls([
      { price: 99, volume: 1000, strength: 5, type: 'ORDERBOOK_WALL' },
      { price: 101, volume: 100, strength: 1, type: 'ORDERBOOK_WALL' },
    ]);
    expect(walls).toHaveLength(1);
    expect(isWallProtectingSL(98, 99, 'LONG')).toBe(true);
    expect(isWallProtectingSL(100, 99, 'LONG')).toBe(false);
  });
});

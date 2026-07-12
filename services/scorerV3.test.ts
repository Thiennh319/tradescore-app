import { describe, expect, it } from 'vitest';
import type { Kline } from './binanceApi';
import type { BollingerAnalysisV3, EMAAnalysisV3, MACDAnalysisV3 } from './indicators';
import { scoreL1V3, scoreL2V3, scoreL3V3, scoreL4V3, scoreL5V3, scoreAnalysisV3 } from './scorerV3';
import { computeAtr1hFromKlines } from './atr1h';
import type { AnalysisInput } from './analysisInput';
import { DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST } from '../constants/scoring';
import type { AllMarketData } from './binanceApi';
import {
  buildAnalysisInputV3FromMarket,
  buildTodayStatsFromJournal,
  canEnterV3,
  scoringLayersToDisplayV3,
  suggestDirectionV3,
} from './scorerV3';

function ema(overrides: Partial<EMAAnalysisV3> = {}): EMAAnalysisV3 {
  return {
    ema20: 100,
    ema50: 99,
    ema200: 98,
    slope20: 'UP',
    slope50: 'UP',
    priceVsEma20Pct: 1,
    priceVsEma50Pct: 1.5,
    priceAboveEma20: true,
    priceAboveEma50: true,
    ...overrides,
  };
}

function macd(histogram: number, extras: Partial<MACDAnalysisV3> = {}): MACDAnalysisV3 {
  return {
    macd: histogram,
    signal: 0,
    histogram,
    isTurningUp: false,
    isTurningDown: false,
    crossedZeroRecentlyUp: false,
    crossedZeroRecentlyDown: false,
    ...extras,
  };
}

function bb(percentB: number, marketMode: 'TRENDING' | 'RANGING'): BollingerAnalysisV3 {
  return {
    upper: new Float32Array([110]),
    middle: new Float32Array([100]),
    lower: new Float32Array([90]),
    percentB,
    bandwidth: 5,
    bandwidthSlope: 'FLAT',
    marketMode,
  };
}

function klines(closes: number[]): Kline[] {
  return closes.map((close, i) => ({
    openTime: i,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
    closeTime: i + 1,
    quoteVolume: 1000,
    trades: 10,
    takerBuyBaseVolume: 500,
    takerBuyQuoteVolume: 500,
  }));
}

describe('scorerV3 L1-L5', () => {
  it('scoreL1V3 LONG full trend', () => {
    const r = scoreL1V3('LONG', ema(), ema());
    expect(r.score).toBe(2);
    expect(r.group).toBe('A');
  });

  it('scoreL1V3 LONG mâu thuẫn 1H/4H hiển thị 1đ', () => {
    const ema1hAbove = ema({ priceAboveEma20: true, priceAboveEma50: true, priceVsEma20Pct: 3 });
    const ema4hBelow = ema({
      priceAboveEma20: false,
      priceAboveEma50: false,
      priceVsEma20Pct: -3,
      slope20: 'DOWN',
    });
    const r = scoreL1V3('LONG', ema1hAbove, ema4hBelow);
    expect(r.reason).toContain('Mâu thuẫn 1H vs 4H');
    const [display] = scoringLayersToDisplayV3([r]);
    expect(display.score).toBe(1);
  });

  it('scoreL1V3 SHORT mâu thuẫn 1H/4H hiển thị 1đ', () => {
    const ema1hBelow = ema({
      priceAboveEma20: false,
      priceAboveEma50: false,
      priceVsEma20Pct: -3,
      slope20: 'DOWN',
    });
    const ema4hAbove = ema({ priceAboveEma20: true, priceAboveEma50: true, priceVsEma20Pct: 3 });
    const r = scoreL1V3('SHORT', ema1hBelow, ema4hAbove);
    expect(r.reason).toContain('Mâu thuẫn 1H vs 4H');
    const [display] = scoringLayersToDisplayV3([r]);
    expect(display.score).toBe(1);
  });

  it('scoreL1V3 SHORT partial bearish — dưới EMA20, trên EMA50 (1H)', () => {
    const ema1hPartial = ema({
      priceAboveEma20: false,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const ema4hAbove = ema({
      priceAboveEma20: true,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const r = scoreL1V3('SHORT', ema1hPartial, ema4hAbove);
    expect(r.score).toBe(1.0);
    expect(r.reason).toContain('chưa qua EMA50');
  });

  it('scoreL1V3 SHORT else — cả 2 khung trên EMA20 và EMA50', () => {
    const ema1hAbove = ema({
      priceAboveEma20: true,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const ema4hAbove = ema({
      priceAboveEma20: true,
      priceAboveEma50: true,
      slope20: 'FLAT',
      slope50: 'FLAT',
    });
    const r = scoreL1V3('SHORT', ema1hAbove, ema4hAbove);
    expect(r.score).toBe(0);
    expect(r.reason).toContain('EMA chưa đồng thuận');
  });

  it('scoreL3V3 SHORT negative histogram', () => {
    const r = scoreL3V3('SHORT', macd(-0.5), macd(-0.3));
    expect(r.score).toBe(2);
    expect(r.reason).toContain('Histogram âm cả 1H & 4H');
  });

  it('scoreL3V3 SHORT both negative with turning down still gets 2', () => {
    const r = scoreL3V3(
      'SHORT',
      macd(-0.5, { isTurningDown: true }),
      macd(-0.3, { isTurningDown: true }),
    );
    expect(r.score).toBe(2);
  });

  it('scoreL3V3 SHORT both positive histogram VI PHẠM', () => {
    const r = scoreL3V3('SHORT', macd(0.5), macd(0.3));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('VI PHẠM');
  });

  it('scoreL3V3 LONG h1 negative h4 positive gets 1 khung thuận', () => {
    const r = scoreL3V3('LONG', macd(-42.29), macd(145.61));
    expect(r.score).toBe(1);
    expect(r.reason).toContain('1 khung thuận');
  });

  it('scoreL3V3 LONG h1 positive h4 negative gets 1 khung thuận', () => {
    const r = scoreL3V3('LONG', macd(0.5), macd(-0.3));
    expect(r.score).toBe(1);
    expect(r.reason).toContain('1 khung thuận');
  });

  it('scoreL4V3 LONG ranging mid band', () => {
    const r = scoreL4V3('LONG', bb(45, 'RANGING'));
    expect(r.score).toBe(2);
  });

  it('scoreL4V3 SHORT ranging %B=17 giá đáy dải → 0đ', () => {
    const r = scoreL4V3('SHORT', bb(17, 'RANGING'));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('đáy dải');
  });

  it('scoreL4V3 SHORT ranging %B=50 vùng giữa → 2đ', () => {
    const r = scoreL4V3('SHORT', bb(50, 'RANGING'));
    expect(r.score).toBe(2);
  });

  it('scoreL4V3 SHORT ranging %B=35 nửa dải → 1đ', () => {
    const r = scoreL4V3('SHORT', bb(35, 'RANGING'));
    expect(r.score).toBe(1);
  });

  it('scoreL4V3 SHORT trending %B=17 ride band → 2đ', () => {
    const r = scoreL4V3('SHORT', bb(17, 'TRENDING'));
    expect(r.score).toBe(2);
  });

  it('scoreL4V3 SHORT trending %B=75 → 0đ', () => {
    const r = scoreL4V3('SHORT', bb(75, 'TRENDING'));
    expect(r.score).toBe(0);
  });

  it('scoreL5V3 rejects CVD divergence against LONG', () => {
    const { layerResult, warning } = scoreL5V3(
      'LONG',
      klines([100, 101, 102, 103]),
      [
        { timestamp: 1, price: 100, cvd: 1000 },
        { timestamp: 2, price: 101, cvd: 990 },
        { timestamp: 3, price: 102, cvd: 980 },
        { timestamp: 4, price: 103, cvd: 800 },
      ],
      1000,
      900,
      1,
    );
    expect(layerResult.score).toBe(0);
    expect(warning).toContain('bull trap');
  });

  it('scoreAnalysisV3 returns long and short with group scores', () => {
    const closes = Array.from({ length: 220 }, (_, i) => 100 + i * 0.01);
    const klines = closes.map((close, i) => ({
      openTime: i,
      open: close,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 2000,
      closeTime: i + 1,
      quoteVolume: 2000,
      trades: 20,
      takerBuyBaseVolume: 1000,
      takerBuyQuoteVolume: 1000,
    }));

    const input: AnalysisInput = {
      symbol: 'BTCUSDT',
      currentPrice: closes[closes.length - 1],
      klines1h: klines,
      klines4h: klines,
      fundingRate: 0.01,
      oiCurrent: 1000,
      oiPrevious: 990,
      topLongShortRatios: [1, 0.95, 0.9],
      globalLongShortRatios: [1, 0.95, 0.9],
      btc24hChangePct: 1.2,
      cvdPoints: [],
      psychologyChecklist: {
        alert: true,
        noLossStreak: true,
        dailyLossOk: true,
        noFomo: true,
        slTpReady: true,
      },
      priceChangePct1h: 0.3,
      atr1h: computeAtr1hFromKlines(klines, closes[closes.length - 1]),
    };

    const result = scoreAnalysisV3(input, { consecutiveLosses: 0, dailyLossUSDT: 0 });
    expect(result.long.totalScore).toBeGreaterThan(0);
    expect(result.short.totalScore).toBeGreaterThan(0);
    expect(result.long.groupScores.A).toBeLessThanOrEqual(5);
    expect(result.marketMode).toMatch(/TRENDING|RANGING/);
  });
});

function risingKlines(n: number, start = 100): Kline[] {
  const closes: number[] = [];
  for (let i = 0; i < n; i++) closes.push(start + i * 0.8);
  return klines(closes);
}

function baseInput(overrides?: Partial<AnalysisInput>): AnalysisInput {
  const klines1h = risingKlines(120, 100);
  const klines4h = risingKlines(80, 95);
  const currentPrice = klines1h[klines1h.length - 1].close;
  return {
    symbol: 'BTCUSDT',
    currentPrice,
    klines1h,
    klines4h,
    fundingRate: -0.005,
    oiCurrent: 1_000_000,
    oiPrevious: 990_000,
    topLongShortRatios: [0.95, 0.92, 0.9, 0.88],
    globalLongShortRatios: [0.95, 0.92, 0.9, 0.88],
    btc24hChangePct: 1.5,
    cvdPoints: klines1h.slice(-20).map((k, i) => ({
      timestamp: k.openTime,
      cvd: i * 10_000,
      price: k.close,
    })),
    psychologyChecklist: {
      ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
      alert: true,
      slTpReady: true,
    },
    priceChangePct1h: 0.5,
    atr1h: computeAtr1hFromKlines(klines1h, currentPrice),
    ...overrides,
  };
}

function mockMarket(klines1h: Kline[], klines4h: Kline[]): AllMarketData {
  return {
    symbol: 'BTCUSDT',
    fetchedAt: Date.now(),
    fromCache: false,
    klines: {
      '1h': { symbol: 'BTCUSDT', timeframe: '1h', klines: klines1h, fromCache: false },
      '4h': { symbol: 'BTCUSDT', timeframe: '4h', klines: klines4h, fromCache: false },
    },
    orderBook: null,
    forceOrders: null,
    oiEngine: {
      symbol: 'BTCUSDT',
      current: { symbol: 'BTCUSDT', openInterest: 1_000_000, time: 2 },
      history: [
        { symbol: 'BTCUSDT', sumOpenInterest: 990_000, sumOpenInterestValue: 0, timestamp: 1 },
        { symbol: 'BTCUSDT', sumOpenInterest: 1_000_000, sumOpenInterestValue: 0, timestamp: 2 },
      ],
      deltaOI: 10_000,
      fromCache: false,
    },
    fundingHistory: {
      symbol: 'BTCUSDT',
      records: [
        { symbol: 'BTCUSDT', fundingRate: 0.0001, fundingTime: 1, markPrice: 100 },
        { symbol: 'BTCUSDT', fundingRate: 0.00012, fundingTime: 2, markPrice: 101 },
      ],
      fromCache: false,
    },
    longShortRatio: {
      symbol: 'BTCUSDT',
      ratio: 0.92,
      history: [
        { symbol: 'BTCUSDT', longAccount: 0.5, shortAccount: 0.5, longShortRatio: 0.95, timestamp: 1 },
        { symbol: 'BTCUSDT', longAccount: 0.5, shortAccount: 0.5, longShortRatio: 0.92, timestamp: 2 },
      ],
      fromCache: false,
    },
    errors: {},
  };
}

describe('scorerV3 pipeline', () => {
  it('buildAnalysisInputV3FromMarket extends V2 input with funding and whale walls', () => {
    const k1 = risingKlines(120);
    const k4 = risingKlines(80, 95);
    const price = k1[k1.length - 1].close;
    const input = buildAnalysisInputV3FromMarket({
      symbol: 'BTCUSDT',
      currentPrice: price,
      market: mockMarket(k1, k4),
      psychologyChecklist: baseInput().psychologyChecklist,
      btc24hChangePct: 1.5,
      liquidityPools: [],
    });
    expect(input).not.toBeNull();
    expect(input!.fundingHistory?.length).toBe(2);
    expect(input!.whaleWalls).toBeDefined();
    expect(input!.btcKlines1h?.length).toBe(120);
  });

  it('totalScore equals sum of group scores for each direction', () => {
    const result = scoreAnalysisV3(baseInput(), buildTodayStatsFromJournal(0, 0));
    for (const side of [result.long, result.short] as const) {
      const sum =
        side.groupScores.A + side.groupScores.B + side.groupScores.C;
      expect(side.totalScore).toBeCloseTo(sum, 1);
      expect(side.totalScore).toBeGreaterThanOrEqual(0);
      expect(side.totalScore).toBeLessThanOrEqual(15);
    }
  });

  it('scoringLayersToDisplayV3 produces 10 layers with max 1.5 each', () => {
    const result = scoreAnalysisV3(baseInput(), buildTodayStatsFromJournal(0, 0));
    const layers = scoringLayersToDisplayV3(result.long.layers);
    expect(layers).toHaveLength(10);
    for (const l of layers) {
      expect(l.score).toBeGreaterThanOrEqual(0);
      expect(l.score).toBeLessThanOrEqual(1.5);
      expect(l.name.length).toBeGreaterThan(0);
    }
  });

  it('suggestDirectionV3 returns LONG or SHORT', () => {
    const result = scoreAnalysisV3(baseInput(), buildTodayStatsFromJournal(0, 0));
    const dir = suggestDirectionV3(result);
    expect(['LONG', 'SHORT']).toContain(dir);
  });

  it('hard blocks daily loss trigger L10 block', () => {
    const result = scoreAnalysisV3(
      baseInput(),
      buildTodayStatsFromJournal(0, 5),
    );
    const hasLossBlock = [...result.long.hardBlocks, ...result.short.hardBlocks].some(
      (b) => /lỗ|loss|daily/i.test(b) || b.includes('L10'),
    );
    expect(hasLossBlock || result.long.layers[9].score < 2).toBe(true);
  });

  it('canEnterV3 false when group blocks present', () => {
    const blocked = {
      direction: 'LONG' as const,
      layers: [],
      rawLayerScores: {},
      groupScores: { A: 1, B: 4, C: 4 },
      totalScore: 9,
      hardBlocks: [],
      groupBlocks: ['Nhóm A (Xu hướng) 1.0/5đ < 2.5đ'],
      warnings: [],
      decision: 'KHONG_VAO' as const,
      decisionLabel: 'KHÔNG VÀO',
      decisionColor: '#F6465D',
      winrate: '~50%',
    };
    expect(canEnterV3(blocked)).toBe(false);
  });
});

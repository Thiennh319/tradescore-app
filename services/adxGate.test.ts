import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Kline } from './binanceApi';
import { DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST } from '../constants/scoring';
import type { ADXAnalysis } from './indicators';
import { evaluateADXGate } from './adxGate';

const wireChoppyAdx: ADXAnalysis = {
  adx1H: 10,
  adx4H: 12,
  adxAvg: 11,
  regime: 'CHOPPY',
  regimeStrength: 'WEAK',
  isChoppy1H: true,
  isChoppy4H: true,
  bothChoppy: true,
};

const wireTrendingStrongAdx: ADXAnalysis = {
  adx1H: 40,
  adx4H: 38,
  adxAvg: 39,
  regime: 'TRENDING',
  regimeStrength: 'STRONG',
  isChoppy1H: false,
  isChoppy4H: false,
  bothChoppy: false,
};

function wireRisingKlines(n: number, start = 100): Kline[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + i * 0.8;
    return {
      openTime: i * 3_600_000,
      open: close - 0.2,
      high: close + 2,
      low: close - 2,
      close,
      volume: 2000 + i,
      closeTime: i * 3_600_000 + 3_599_999,
      quoteVolume: close * 2000,
      trades: 50,
      takerBuyBaseVolume: 1000,
      takerBuyQuoteVolume: 1000,
    };
  });
}

const mockGetAdxAnalysis = vi.fn<() => ADXAnalysis>();

vi.mock('./indicators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./indicators')>();
  return {
    ...actual,
    getADXAnalysis: () => mockGetAdxAnalysis(),
  };
});

vi.mock('./binanceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./binanceApi')>();
  const klines1h = wireRisingKlines(220, 100);
  const klines4h = wireRisingKlines(80, 95);
  const klinesBundle = (tf: string, klines: Kline[]) => ({
    timeframe: tf as '1h',
    klines,
    fromCache: false,
    cachedAt: Date.now(),
  });
  const market = {
    symbol: 'BTCUSDT' as const,
    fetchedAt: Date.now(),
    fromCache: false,
    klines: {
      '1h': klinesBundle('1h', klines1h),
      '4h': klinesBundle('4h', klines4h),
      '15m': klinesBundle('15m', klines1h),
      '5m': klinesBundle('5m', klines1h),
      '1d': klinesBundle('1d', klines4h),
    },
    orderBook: {
      symbol: 'BTCUSDT' as const,
      bids: [[klines1h.at(-1)!.close - 1, 10]],
      asks: [[klines1h.at(-1)!.close + 1, 10]],
      spread: 2,
      fromCache: false,
      cachedAt: Date.now(),
      lastUpdateId: 1,
    },
    forceOrders: { symbol: 'BTCUSDT' as const, orders: [], fromCache: false },
    oiEngine: {
      symbol: 'BTCUSDT' as const,
      deltaOI: 100,
      oiChangePct: 1,
      fromCache: false,
    },
    fundingHistory: {
      symbol: 'BTCUSDT' as const,
      records: [{ rate: -0.0001, timestamp: 1 }],
      fromCache: false,
    },
    longShortRatio: {
      symbol: 'BTCUSDT' as const,
      ratios: [0.95],
      fromCache: false,
    },
    errors: {},
  };

  return {
    ...actual,
    fetchAllMarketData: vi.fn(async () => market),
    fetchTickerPrice: vi.fn(async () => ({
      symbol: 'BTCUSDT' as const,
      price: klines1h.at(-1)!.close,
      fromCache: false,
    })),
    fetch24hTickerChange: vi.fn(async () => 1.5),
  };
});

function adx(partial: Partial<ADXAnalysis> & Pick<ADXAnalysis, 'regime'>): ADXAnalysis {
  return {
    adx1H: 20,
    adx4H: 20,
    adxAvg: 20,
    regimeStrength: 'WEAK',
    isChoppy1H: false,
    isChoppy4H: false,
    bothChoppy: false,
    ...partial,
  };
}

describe('evaluateADXGate', () => {
  it('BLOCK when bothChoppy', () => {
    const result = evaluateADXGate(
      adx({
        adx1H: 10,
        adx4H: 12,
        adxAvg: 11,
        regime: 'CHOPPY',
        isChoppy1H: true,
        isChoppy4H: true,
        bothChoppy: true,
      }),
      'LONG',
    );

    expect(result).toEqual({
      allowed: false,
      block: true,
      regime: 'CHOPPY',
      tpMultiplier: 1.0,
      slMultiplier: 1.0,
      message: '⛔ Thị trường CHOPPY cả 1H+4H — chờ xu hướng rõ',
      severity: 'BLOCK',
    });
  });

  it('WARNING when only one timeframe is choppy', () => {
    const result = evaluateADXGate(
      adx({
        adx1H: 12,
        adx4H: 22,
        adxAvg: 17,
        regime: 'RANGING',
        isChoppy1H: true,
        isChoppy4H: false,
        bothChoppy: false,
      }),
      'SHORT',
    );

    expect(result.allowed).toBe(true);
    expect(result.block).toBe(false);
    expect(result.tpMultiplier).toBe(0.9);
    expect(result.slMultiplier).toBe(1.1);
    expect(result.message).toBe('⚠️ Xu hướng yếu — thu hẹp kỳ vọng');
    expect(result.severity).toBe('WARNING');
  });

  it('WARNING when RANGING (adxAvg 15-25)', () => {
    const result = evaluateADXGate(
      adx({
        adx1H: 18,
        adx4H: 22,
        adxAvg: 20,
        regime: 'RANGING',
      }),
      'LONG',
    );

    expect(result.allowed).toBe(true);
    expect(result.block).toBe(false);
    expect(result.regime).toBe('RANGING');
    expect(result.tpMultiplier).toBe(0.85);
    expect(result.slMultiplier).toBe(1.1);
    expect(result.message).toBe('⚠️ Thị trường RANGING — TP thu hẹp');
    expect(result.severity).toBe('WARNING');
  });

  it('OK when TRENDING WEAK (adxAvg 25-35)', () => {
    const result = evaluateADXGate(
      adx({
        adx1H: 28,
        adx4H: 30,
        adxAvg: 29,
        regime: 'TRENDING',
        regimeStrength: 'WEAK',
      }),
      'LONG',
    );

    expect(result).toEqual({
      allowed: true,
      block: false,
      regime: 'TRENDING',
      tpMultiplier: 1.0,
      slMultiplier: 1.0,
      message: '✅ Xu hướng hình thành',
      severity: 'OK',
    });
  });

  it('BONUS when TRENDING STRONG (adxAvg > 35)', () => {
    const result = evaluateADXGate(
      adx({
        adx1H: 40,
        adx4H: 38,
        adxAvg: 39,
        regime: 'TRENDING',
        regimeStrength: 'STRONG',
      }),
      'SHORT',
    );

    expect(result).toEqual({
      allowed: true,
      block: false,
      regime: 'TRENDING',
      tpMultiplier: 1.2,
      slMultiplier: 0.9,
      message: '✅ Xu hướng mạnh — mở rộng TP',
      severity: 'BONUS',
    });
  });

  it('fallback OK when adxData is undefined', () => {
    const result = evaluateADXGate(undefined, 'LONG');

    expect(result).toEqual({
      allowed: true,
      block: false,
      regime: '',
      tpMultiplier: 1.0,
      slMultiplier: 1.0,
      message: '',
      severity: 'OK',
    });
  });
});

describe('signalBoardScan ADX wire', () => {
  afterEach(() => {
    mockGetAdxAnalysis.mockReset();
  });

  it(
    'mock CHOPPY adxData qua scan → row.adxGate.block true',
    async () => {
      mockGetAdxAnalysis.mockReturnValue(wireChoppyAdx);
      const { scanSignalSymbol } = await import('./signalBoardScan');
      const row = await scanSignalSymbol(
        'BTCUSDT',
        '1h',
        1.5,
        { ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST, alert: true, slTpReady: true },
      );

      expect(row.adxGate?.block).toBe(true);
      expect(row.adxBlockReason).toBe('ADX_CHOPPY');
      expect(row.adxData).toEqual(wireChoppyAdx);
    },
    30_000,
  );

  it(
    'mock TRENDING STRONG adxData qua scan → TP1 scaled ×1.2',
    async () => {
      mockGetAdxAnalysis.mockReturnValue(wireTrendingStrongAdx);
      const { scanSignalSymbol } = await import('./signalBoardScan');
      const row = await scanSignalSymbol(
        'BTCUSDT',
        '1h',
        1.5,
        { ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST, alert: true, slTpReady: true },
      );

      expect(row.adxGate?.tpMultiplier).toBe(1.2);
      const plan = row.tradePlansByScorer?.v4;
      expect(plan).not.toBeNull();
      if (!plan) return;

      const entry = plan.recommendedEntry;
      const scaledTp1 = plan.tp1.price;
      const unscaledTp1 = entry + (scaledTp1 - entry) / 1.2;
      expect(scaledTp1).toBeCloseTo(entry + (unscaledTp1 - entry) * 1.2, 2);
      expect(scaledTp1).toBeGreaterThan(unscaledTp1);
    },
    30_000,
  );
});

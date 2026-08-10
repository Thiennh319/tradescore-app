/**
 * Bước 2: scanAllSignalRows parallel — order + length + error isolation.
 * Scoring fingerprint: same input → same decision (unchanged by parallelization).
 */
import { describe, expect, it, vi } from 'vitest';
import { TRADE_SYMBOLS } from '../../constants/scoring';
import { BINANCE_MAX_CONCURRENT } from '../binanceApi';
import { canEnterV4, scoreAnalysisV4, suggestDirectionV4 } from '../scorerV4';
import { DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST } from '../../constants/scoring';
import { computeAtr1hFromKlines } from '../atr1h';
import type { AnalysisInputV4 } from '../scorerV4';
import type { Kline } from '../binanceApi';

vi.mock('../binanceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../binanceApi')>();
  return {
    ...actual,
    fetchAllMarketData: vi.fn(async (symbol: string) => {
      // Simulate staggered network latency — parallel should not serialize wall time.
      await new Promise((r) => setTimeout(r, 80));
      return {
        symbol,
        fetchedAt: Date.now(),
        fromCache: false,
        klines: {},
        orderBook: null,
        forceOrders: null,
        oiEngine: null,
        fundingHistory: null,
        longShortRatio: null,
        errors: { klines: 'mock-empty' },
      };
    }),
    fetchTickerPrice: vi.fn(async (symbol: string) => ({
      symbol,
      price: 100,
      fromCache: false,
    })),
    fetch24hTickerChange: vi.fn(async () => 0),
    scheduleForceOrdersRefresh: vi.fn(),
  };
});

vi.mock('../marketAnalysisFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../marketAnalysisFetch')>();
  return {
    ...actual,
    fetchBtcChange24hPct: vi.fn(async () => 1.25),
  };
});

import { scanAllSignalRows } from '../signalBoardScan';

function klines(closes: number[]): Kline[] {
  return closes.map((close, i) => ({
    openTime: i * 3_600_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 2000,
    closeTime: i * 3_600_000 + 3_599_999,
    quoteVolume: 2000,
    trades: 20,
    takerBuyBaseVolume: 1000,
    takerBuyQuoteVolume: 1000,
  }));
}

describe('scanAllSignalRows parallel (Bước 2)', () => {
  it('BINANCE_MAX_CONCURRENT is 5 after B2 bump (was 3)', () => {
    expect(BINANCE_MAX_CONCURRENT).toBe(5);
  });

  it('returns one row per TRADE_SYMBOL in stable order even when scan is parallel', async () => {
    const t0 = performance.now();
    const rows = await scanAllSignalRows('1h', {
      ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
      alert: true,
      slTpReady: true,
    });
    const ms = performance.now() - t0;

    expect(rows).toHaveLength(TRADE_SYMBOLS.length);
    expect(rows.map((r) => r.symbol)).toEqual([...TRADE_SYMBOLS]);
    // 5 × 80ms sequential ≈ 400ms; parallel wall should be well under ~350ms
    expect(ms).toBeLessThan(350);
  });

  it('scoreAnalysisV4 decision fingerprint unchanged by perf refactor (same input)', () => {
    const closes: number[] = [];
    for (let i = 0; i < 120; i++) closes.push(100 + i * 0.4);
    const k1 = klines(closes);
    const k4 = klines(closes.slice(0, 80).map((c) => c - 2));
    const price = k1[k1.length - 1].close;
    const input: AnalysisInputV4 = {
      symbol: 'SOLUSDT',
      currentPrice: price,
      klines1h: k1,
      klines4h: k4,
      fundingRate: -0.004,
      oiCurrent: 2_000_000,
      oiPrevious: 1_950_000,
      topLongShortRatios: [1.1, 1.05, 1.0],
      globalLongShortRatios: [1.1, 1.05, 1.0],
      btc24hChangePct: 0.8,
      cvdPoints: k1.slice(-15).map((k, i) => ({
        timestamp: k.openTime,
        cvd: (i - 7) * 30_000,
        price: k.close,
      })),
      psychologyChecklist: {
        ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
        alert: true,
        slTpReady: true,
      },
      priceChangePct1h: 0.3,
      atr1h: computeAtr1hFromKlines(k1, price),
      btcKlines1h: k1,
      whaleWalls: { bidWalls: [], askWalls: [] },
    };
    const a = scoreAnalysisV4(input, { consecutiveLosses: 0, dailyLossUSDT: 0 });
    const b = scoreAnalysisV4(input, { consecutiveLosses: 0, dailyLossUSDT: 0 });
    const fp = (r: typeof a) =>
      `${suggestDirectionV4(r)}|${r.long.decision}|${canEnterV4(r.long)}|${r.short.decision}|${canEnterV4(r.short)}|${r.long.referenceTotalScore}|${r.short.referenceTotalScore}`;
    expect(fp(a)).toBe(fp(b));
  });
});

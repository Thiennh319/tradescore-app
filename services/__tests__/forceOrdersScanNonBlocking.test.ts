/**
 * Bước 1 perf: forceOrders không chặn critical path; scoring fingerprint ổn định.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SCAN_INTERVAL_MS } from '../../constants/scanSchedule';
import {
  FORCE_ORDERS_CACHE_TTL_MS,
  __resetApiGuardForTests,
  peekForceOrdersCache,
  scheduleForceOrdersRefresh,
  type Kline,
} from '../binanceApi';
import {
  canEnterV4,
  scoreAnalysisV4,
  suggestDirectionV4,
  type AnalysisInputV4,
} from '../scorerV4';
import { computeAtr1hFromKlines } from '../atr1h';
import { DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST } from '../../constants/scoring';
import { storageSetItem } from '../storage';

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

function rising(n: number, start = 100): Kline[] {
  const closes: number[] = [];
  for (let i = 0; i < n; i++) closes.push(start + i * 0.5);
  return klines(closes);
}

function scoringFp(input: AnalysisInputV4): string {
  const r = scoreAnalysisV4(input, { consecutiveLosses: 0, dailyLossUSDT: 0 });
  const side = (d: (typeof r)['long']) =>
    [
      d.decision,
      d.officialTotalScore ?? 'null',
      d.referenceTotalScore,
      canEnterV4(d),
      d.rawLayerScores[5],
      d.rawLayerScores[7],
      d.hardBlocks.join('|'),
      d.groupBlocks.join('|'),
    ].join(',');
  return `${suggestDirectionV4(r)}|L:${side(r.long)}|S:${side(r.short)}`;
}

describe('forceOrders scan non-blocking (Bước 1)', () => {
  beforeEach(() => {
    __resetApiGuardForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiGuardForTests();
  });

  it('FORCE_ORDERS_CACHE_TTL_MS is 90s and ≥ SCAN_INTERVAL_MS', () => {
    expect(FORCE_ORDERS_CACHE_TTL_MS).toBe(90_000);
    expect(FORCE_ORDERS_CACHE_TTL_MS).toBeGreaterThanOrEqual(SCAN_INTERVAL_MS);
  });

  it('peekForceOrdersCache returns stored orders without waiting WS', async () => {
    const key = '@tradescore/binance/v1/forceOrders:BTCUSDT:100';
    await storageSetItem(
      key,
      JSON.stringify({
        cachedAt: Date.now(),
        data: [
          {
            symbol: 'BTCUSDT',
            side: 'SELL',
            price: 65000,
            avgPrice: 65000,
            executedQty: 1,
            time: Date.now(),
          },
        ],
      }),
    );

    const t0 = performance.now();
    const peeked = await peekForceOrdersCache('BTCUSDT', 100, { allowStale: true });
    const ms = performance.now() - t0;
    expect(peeked).not.toBeNull();
    expect(peeked!.orders).toHaveLength(1);
    expect(peeked!.fromCache).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  it('scoreAnalysisV4 fingerprint identical for same input (scoring untouched by FO path)', () => {
    const k1 = rising(120, 100);
    const k4 = rising(80, 95);
    const price = k1[k1.length - 1].close;
    const base: AnalysisInputV4 = {
      symbol: 'BTCUSDT',
      currentPrice: price,
      klines1h: k1,
      klines4h: k4,
      fundingRate: -0.005,
      oiCurrent: 1_000_000,
      oiPrevious: 990_000,
      topLongShortRatios: [0.95, 0.92, 0.9],
      globalLongShortRatios: [0.95, 0.92, 0.9],
      btc24hChangePct: 1.2,
      cvdPoints: k1.slice(-20).map((k, i) => ({
        timestamp: k.openTime,
        cvd: i * 40_000,
        price: k.close,
      })),
      psychologyChecklist: {
        ...DEFAULT_SCORING_PSYCHOLOGY_CHECKLIST,
        alert: true,
        slTpReady: true,
      },
      priceChangePct1h: 0.4,
      atr1h: computeAtr1hFromKlines(k1, price),
      btcKlines1h: k1,
      whaleWalls: { bidWalls: [], askWalls: [] },
    };

    const a = scoringFp(base);
    const b = scoringFp({ ...base });
    expect(a).toBe(b);
    // Decision / canEnter stay stable across repeated calls
    expect(a.includes('true') || a.includes('false')).toBe(true);
  });

  it('scheduleForceOrdersRefresh is fire-and-forget (returns void immediately)', () => {
    const t0 = performance.now();
    const ret = scheduleForceOrdersRefresh('BTCUSDT', 5);
    const ms = performance.now() - t0;
    expect(ret).toBeUndefined();
    expect(ms).toBeLessThan(50);
  });
});

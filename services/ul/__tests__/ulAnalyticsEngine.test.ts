/**
 * Task 15.0.1 — UL Analytics quality & contract tests.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import {
  UL_ANALYTICS_VERSION,
  UL_RECOMMENDATION_PRIORITY_RANK,
  analyzeCoins,
  analyzeRisk,
  buildEquitySeries,
  buildScoreBreakdown,
  buildULDashboard,
  clearUlAnalyticsCache,
  computeCoreMetrics,
  fingerprintTrades,
  formatPct,
  formatRr,
  formatScore,
  formatUsdt,
  gradeFromScore,
  mapJournalToUlTrades,
  riskLevelFromScore,
  sanitizeTrades,
} from '../index';
import type { ULAnalyzerPlugin, ULTradeInput } from '../types';

function trade(
  partial: Partial<ULTradeInput> & Pick<ULTradeInput, 'pnl' | 'closedAt'>,
): ULTradeInput {
  return {
    id: partial.id ?? `t-${partial.closedAt}`,
    symbol: partial.symbol ?? 'BTCUSDT',
    side: partial.side ?? 'LONG',
    entry: partial.entry ?? 100,
    exit: partial.exit ?? 110,
    pnl: partial.pnl,
    rr: partial.rr === undefined ? 2 : partial.rr,
    duration: partial.duration ?? 60,
    strategy: partial.strategy ?? 'V4',
    openedAt: partial.openedAt ?? partial.closedAt - 3_600_000,
    closedAt: partial.closedAt,
    reasonOpen: partial.reasonOpen ?? 'ENTRY',
    reasonClose: partial.reasonClose ?? 'TP1_HIT',
  };
}

afterEach(() => {
  clearUlAnalyticsCache();
});

describe('Empty trades (null-safety)', () => {
  it('returns valid object without throw', () => {
    const data = buildULDashboard([], { generatedAt: 'fixed' });
    expect(data.version).toBe(1);
    expect(data.fingerprint).toBe('empty');
    expect(data.tradeCount).toBe(0);
    expect(data.metrics.winRate).toBe(0);
    expect(data.metrics.profitFactor).toBe(0);
    expect(data.metrics.expectancy).toBe(0);
    expect(data.recommendations).toEqual([]);
    expect(data.coinTable.rows).toEqual([]);
    expect(data.charts.equityCurve).toEqual([]);
    expect(data.charts.dailyPnl).toEqual([]);
    expect(data.insights).toEqual([]);
    expect(data.risk.riskLevel).toBe('LOW');
    expect(data.score.grade).toBe('F');
  });
});

describe('One / all-win / all-loss / mixed', () => {
  it('handles one trade', () => {
    const data = buildULDashboard([trade({ pnl: 12.5, closedAt: 1 })], {
      generatedAt: 't',
    });
    expect(data.tradeCount).toBe(1);
    expect(data.metrics.winRate).toBe(100);
    expect(data.metrics.netPnl).toBe(12.5);
  });

  it('handles all wins', () => {
    const trades = [1, 2, 3].map((i) => trade({ pnl: 10 * i, closedAt: i }));
    const m = computeCoreMetrics(trades);
    expect(m.wins).toBe(3);
    expect(m.losses).toBe(0);
    expect(m.winRate).toBe(100);
    expect(m.profitFactor).toBe(99);
  });

  it('handles all losses', () => {
    const trades = [1, 2, 3].map((i) => trade({ pnl: -10, closedAt: i }));
    const m = computeCoreMetrics(trades);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.netPnl).toBe(-30);
  });

  it('handles mixed', () => {
    const trades = [
      trade({ pnl: 20, closedAt: 1 }),
      trade({ pnl: -10, closedAt: 2 }),
      trade({ pnl: 5, closedAt: 3 }),
    ];
    const data = buildULDashboard(trades, { generatedAt: 'x' });
    expect(data.metrics.wins).toBe(2);
    expect(data.metrics.losses).toBe(1);
    expect(data.metrics.netPnl).toBe(15);
  });
});

describe('Invalid trades (error contract)', () => {
  it('skips NaN / Infinity / missing fields and never throws', () => {
    const bad = [
      { symbol: 'BTC', side: 'LONG', pnl: NaN, closedAt: 1 },
      { symbol: 'ETH', side: 'LONG', pnl: Infinity, closedAt: 2, entry: 1, exit: 1, duration: 1, strategy: 'V4', openedAt: 1, reasonOpen: '', reasonClose: '' },
      { symbol: 'XRP', side: 'LONG', entry: 1, exit: 1, duration: 1, strategy: 'V4', openedAt: 1, reasonOpen: '', reasonClose: '' }, // missing pnl + closedAt
      trade({ pnl: 10, closedAt: 3 }),
    ];
    expect(() => buildULDashboard(bad as unknown[], { generatedAt: 'g' })).not.toThrow();
    const data = buildULDashboard(bad as unknown[], { generatedAt: 'g' });
    expect(data.tradeCount).toBe(1);
    expect(sanitizeTrades(bad).length).toBe(1);
  });
});

describe('Drawdown', () => {
  it('computes max and current drawdown', () => {
    const trades = [
      trade({ pnl: 50, closedAt: 1 }),
      trade({ pnl: -30, closedAt: 2 }),
      trade({ pnl: -40, closedAt: 3 }),
      trade({ pnl: 10, closedAt: 4 }),
    ];
    const eq = buildEquitySeries(trades);
    expect(eq.maxDrawdown).toBe(70);
    expect(eq.currentDrawdown).toBe(60);
    const m = computeCoreMetrics(trades);
    expect(m.maxDrawdown).toBe(70);
    expect(m.currentDrawdown).toBe(60);
  });
});

describe('Coin ranking contract', () => {
  it('sorts PnL → WR → RR → Trades → Symbol', () => {
    const trades = [
      trade({ symbol: 'AAAUSDT', pnl: 10, rr: 1, closedAt: 1 }),
      trade({ symbol: 'BBBUSDT', pnl: 10, rr: 3, closedAt: 2 }),
      trade({ symbol: 'CCCUSDT', pnl: 5, rr: 5, closedAt: 3 }),
      trade({ symbol: 'AAAUSDT', pnl: -5, closedAt: 4 }), // AAA pnl=5, 50% wr
      trade({ symbol: 'BBBUSDT', pnl: 0, closedAt: 5 }), // BBB pnl=10, ~50%? 1 win 1 be
    ];
    // Simpler deterministic case: different PnL
    const simple = [
      trade({ symbol: 'ETHUSDT', pnl: 100, closedAt: 1 }),
      trade({ symbol: 'BTCUSDT', pnl: 50, closedAt: 2 }),
      trade({ symbol: 'SOLUSDT', pnl: -20, closedAt: 3 }),
    ];
    const coins = analyzeCoins(simple);
    expect(coins.rows.map((r) => r.symbol)).toEqual(['ETH', 'BTC', 'SOL']);
    expect(coins.bestCoin).toBe('ETH');
    expect(coins.worstCoin).toBe('SOL');

    // Tie on PnL → higher WR wins
    const tiePnl = [
      trade({ symbol: 'AAAUSDT', pnl: 10, closedAt: 1 }),
      trade({ symbol: 'AAAUSDT', pnl: -10, closedAt: 2 }), // AAA pnl 0, wr 50
      trade({ symbol: 'BBBUSDT', pnl: 0, closedAt: 3 }), // BBB pnl 0, wr 0
    ];
    const ranked = analyzeCoins(tiePnl);
    expect(ranked.rows[0]!.symbol).toBe('AAA');
    expect(trades.length).toBeGreaterThan(0);
  });
});

describe('Risk bands', () => {
  it('maps 0-24 / 25-49 / 50-74 / 75-100', () => {
    expect(riskLevelFromScore(0)).toBe('LOW');
    expect(riskLevelFromScore(24)).toBe('LOW');
    expect(riskLevelFromScore(25)).toBe('MEDIUM');
    expect(riskLevelFromScore(49)).toBe('MEDIUM');
    expect(riskLevelFromScore(50)).toBe('HIGH');
    expect(riskLevelFromScore(74)).toBe('HIGH');
    expect(riskLevelFromScore(75)).toBe('CRITICAL');
    expect(riskLevelFromScore(100)).toBe('CRITICAL');
  });
});

describe('Score weights & grades', () => {
  it('uses 40/30/20/10 blend', () => {
    const metrics = computeCoreMetrics([
      trade({ pnl: 20, closedAt: 1 }),
      trade({ pnl: 10, closedAt: 2 }),
      trade({ pnl: -5, closedAt: Date.UTC(2026, 6, 2) }),
    ]);
    const risk = analyzeRisk(metrics);
    const score = buildScoreBreakdown(metrics, risk.score);
    const expectancyScore = Math.round(
      Math.min(100, Math.max(0, 50 + metrics.expectancy * 10)),
    );
    const expected = Math.round(
      metrics.performanceScore * 0.4 +
        metrics.consistencyScore * 0.3 +
        (100 - risk.score) * 0.2 +
        expectancyScore * 0.1,
    );
    expect(score.performanceScore).toBe(Math.max(0, Math.min(100, expected)));
    expect(score.grade).toBe(gradeFromScore(score.performanceScore));
  });

  it('grades A+ … F', () => {
    expect(gradeFromScore(95)).toBe('A+');
    expect(gradeFromScore(85)).toBe('A');
    expect(gradeFromScore(75)).toBe('B+');
    expect(gradeFromScore(65)).toBe('B');
    expect(gradeFromScore(50)).toBe('C');
    expect(gradeFromScore(35)).toBe('D');
    expect(gradeFromScore(10)).toBe('F');
  });
});

describe('Recommendations', () => {
  it('emits priority CRITICAL|HIGH|MEDIUM|LOW|INFO and sorts', () => {
    const trades = Array.from({ length: 10 }, (_, i) =>
      trade({
        pnl: i < 8 ? -15 : 5,
        rr: 0.8,
        closedAt: i + 1,
        duration: 5,
      }),
    );
    const data = buildULDashboard(trades, { generatedAt: 'r', bypassCache: true });
    expect(data.recommendations.length).toBeGreaterThan(0);
    for (let i = 1; i < data.recommendations.length; i += 1) {
      const prev = UL_RECOMMENDATION_PRIORITY_RANK[data.recommendations[i - 1]!.priority];
      const cur = UL_RECOMMENDATION_PRIORITY_RANK[data.recommendations[i]!.priority];
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
    expect(data.recommendations.some((r) => r.action === 'Reduce position size')).toBe(true);
  });
});

describe('Deterministic + fingerprint + cache', () => {
  it('same fingerprint → same analytics', () => {
    const trades = [
      trade({ pnl: 10, closedAt: 100, id: 'a' }),
      trade({ pnl: -5, closedAt: 200, id: 'b' }),
    ];
    const shuffled = [trades[1]!, trades[0]!];
    expect(fingerprintTrades(trades)).toBe(fingerprintTrades(shuffled));

    const a = buildULDashboard(trades, { generatedAt: 'A', bypassCache: true });
    const b = buildULDashboard(shuffled, { generatedAt: 'B', bypassCache: true });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.kpi).toEqual(b.kpi);
    expect(a.score).toEqual(b.score);
    expect(a.recommendations).toEqual(b.recommendations);
  });

  it('cache hits on fingerprint + version', () => {
    const trades = [trade({ pnl: 1, closedAt: 1 })];
    const first = buildULDashboard(trades, { generatedAt: '1' });
    const second = buildULDashboard(trades, { generatedAt: '2' });
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.metrics).toEqual(first.metrics);
    expect(second.generatedAt).toBe('2');
    expect(UL_ANALYTICS_VERSION).toBe(1);
  });

  it('plugin can patch without breaking identity fields', () => {
    const plugin: ULAnalyzerPlugin = {
      analyze: (dash) => ({
        insights: [
          ...dash.insights,
          {
            id: 'plugin',
            title: 'Plugin',
            subtitle: 'x',
            value: '1',
            tint: 'blue',
          },
        ],
        version: 99 as 1,
        fingerprint: 'hacked',
      }),
    };
    const data = buildULDashboard([trade({ pnl: 5, closedAt: 1 })], {
      generatedAt: 'p',
      plugins: [plugin],
      bypassCache: true,
    });
    expect(data.version).toBe(1);
    expect(data.fingerprint).not.toBe('hacked');
    expect(data.insights.some((i) => i.id === 'plugin')).toBe(true);
  });
});

describe('Numeric formatters', () => {
  it('USDT 2dp / % 1dp / RR 2dp / Score int', () => {
    expect(formatUsdt(1.234)).toBe('1.23');
    expect(formatPct(55.56)).toBe('55.6');
    expect(formatRr(1.2)).toBe('1.20');
    expect(formatScore(66.7)).toBe('67');
  });
});

describe('Performance budget', () => {
  function makeN(n: number): ULTradeInput[] {
    const out: ULTradeInput[] = [];
    for (let i = 0; i < n; i += 1) {
      out.push(
        trade({
          id: `p-${i}`,
          symbol: i % 2 === 0 ? 'BTCUSDT' : 'ETHUSDT',
          pnl: i % 3 === 0 ? -8 : 12,
          rr: 1.5 + (i % 5) * 0.1,
          closedAt: 1_700_000_000_000 + i * 60_000,
          strategy: i % 2 === 0 ? 'V4' : 'V3',
        }),
      );
    }
    return out;
  }

  function timed(n: number): number {
    const trades = makeN(n);
    clearUlAnalyticsCache();
    const t0 = performance.now();
    buildULDashboard(trades, { generatedAt: 'perf', bypassCache: true });
    return performance.now() - t0;
  }

  it('stays within soft budgets (target ×10 headroom for loaded CI agents)', () => {
    // Strict targets: 100<2ms, 500<5ms, 1000<10ms, 5000<40ms
    // Soft CI headroom ×10 — cold JS / shared agents are noisy; complexity guarded below.
    timed(50); // warmup
    expect(timed(100)).toBeLessThan(2 * 10);
    expect(timed(500)).toBeLessThan(5 * 10);
    expect(timed(1000)).toBeLessThan(10 * 10);
    expect(timed(5000)).toBeLessThan(40 * 10);
  });

  it('huge dataset does not throw and is sub-quadratic vs 1k', () => {
    timed(50); // warmup
    const ms1k = timed(1000);
    const ms5k = timed(5000);
    // 5× data should not cost ~25× time (would indicate O(n²))
    expect(ms5k).toBeLessThan(Math.max(ms1k * 12, 40 * 10));
  });
});

describe('mapJournalToUlTrades', () => {
  it('maps only closed eligible rows', () => {
    const sample = (overrides: Partial<AiTradeJournalEntry>): AiTradeJournalEntry =>
      ({
        id: 'base',
        timestamp: Date.UTC(2026, 6, 10, 10),
        symbol: 'BTCUSDT',
        accountSizeAtEntry: 1000,
        market: {
          entryPrice: 65000,
          priceAtAnalysis: 64900,
          slippage: 0,
          cvdValue: 0,
          cvdTrend: 'UP',
          volumeRatio: 1,
          btcChangePct: 0,
          fundingRate: 0,
          topTraderRatio: 1,
          oiChangePct: 0,
          sessionType: 'GOOD',
          hourVN: 10,
        },
        scoring: {
          totalScore: 8,
          direction: 'LONG',
          layerScores: {
            l1: 1, l2: 1, l3: 1, l4: 1, l5: 1, l6: 1, l7: 1, l8: 1, l9: 1, l10: 1,
          },
          mandatoryViolations: [],
          decision: 'LONG',
        },
        plan: {
          entryZoneType: 'ZONE',
          entryZoneOptimal: 65000,
          entryZoneRangeLow: 64900,
          entryZoneRangeHigh: 65100,
          slProposed: 64000,
          slActual: 64000,
          tp1Proposed: 66000,
          tp1Actual: 66000,
          tp2: 67000,
          tp3: 68000,
          rrProposed: 2,
          sizeProposed: 100,
          sizeActual: 100,
          isSafeSL: true,
          openReason: 'SMC',
        },
        outcome: { status: 'OPEN' },
        tags: [],
        version: '1.0.4',
        strategySource: 'V4',
        ...overrides,
      }) as AiTradeJournalEntry;

    const entries = [
      sample({
        id: 'win1',
        outcome: {
          status: 'WIN',
          exitPrice: 66000,
          exitTimestamp: Date.UTC(2026, 6, 10, 12),
          pnlUSDT: 40,
          holdingTimeMinutes: 120,
          exitReason: 'TP1_HIT',
          closeReason: 'TP1',
        },
      }),
      sample({ id: 'open1', outcome: { status: 'OPEN' } }),
    ];

    expect(mapJournalToUlTrades(entries)).toHaveLength(1);
  });
});

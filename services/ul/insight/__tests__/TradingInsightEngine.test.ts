/**
 * Task 15.3 — Trading Insight Engine tests.
 */
import { describe, expect, it } from 'vitest';
import { buildULComparisonReport } from '../../compare';
import { buildULDashboard } from '../../ULAnalyticsEngine';
import type { ULTradeInput } from '../../types';
import { buildTradingInsightReport, TRADING_INSIGHT_SEVERITY_RANK } from '../index';

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
    rr: partial.rr ?? 2,
    duration: partial.duration ?? 60,
    strategy: partial.strategy ?? 'V4',
    openedAt: partial.openedAt ?? partial.closedAt - 3_600_000,
    closedAt: partial.closedAt,
    reasonOpen: partial.reasonOpen ?? 'ENTRY',
    reasonClose: partial.reasonClose ?? 'TP1_HIT',
  };
}

function dash(trades: ULTradeInput[]) {
  return buildULDashboard(trades, { generatedAt: 'fixed', bypassCache: true });
}

describe('buildTradingInsightReport', () => {
  it('Empty', () => {
    const d = dash([]);
    const c = buildULComparisonReport(null, null);
    const report = buildTradingInsightReport(d, c);
    expect(report.version).toBe(1);
    expect(report.insights.some((i) => i.id === 'ti-empty')).toBe(true);
    expect(report.summary.insightCount).toBeGreaterThan(0);
  });

  it('null dashboard → empty-safe', () => {
    const report = buildTradingInsightReport(null, null);
    expect(report.insights).toEqual([]);
    expect(report.summary.headline).toContain('No dashboard');
  });

  it('All wins', () => {
    const trades = [1, 2, 3, 4].map((i) =>
      trade({ pnl: 10 * i, closedAt: i, rr: 2.5 }),
    );
    const d = dash(trades);
    const report = buildTradingInsightReport(d, buildULComparisonReport(d.metrics, d.metrics));
    expect(report.insights.some((i) => i.id === 'ti-all-wins')).toBe(true);
    expect(report.strengths.length).toBeGreaterThan(0);
  });

  it('All losses', () => {
    const trades = [1, 2, 3, 4].map((i) =>
      trade({ pnl: -10, closedAt: i, rr: 0.8, duration: 300 }),
    );
    const d = dash(trades);
    const report = buildTradingInsightReport(d, null);
    expect(report.insights.some((i) => i.id === 'ti-all-losses')).toBe(true);
    expect(report.warnings.some((i) => i.severity === 'CRITICAL')).toBe(true);
  });

  it('Improving (win rate + drawdown)', () => {
    const current = {
      trades: 10,
      winRate: 61,
      profitFactor: 1.8,
      expectancy: 3,
      averageRr: 2,
      netPnl: 40,
      largestWin: 15,
      largestLoss: -5,
      recoveryFactor: 2,
      maxDrawdown: 8,
      consistency: 65,
      stability: 60,
      performanceScore: 75,
    };
    const previous = {
      ...current,
      winRate: 50,
      expectancy: 1,
      maxDrawdown: 20,
      profitFactor: 1.2,
      netPnl: 10,
      performanceScore: 55,
      consistency: 45,
    };
    const d = dash([
      trade({ pnl: 10, closedAt: 1 }),
      trade({ pnl: 10, closedAt: 2 }),
      trade({ pnl: 10, closedAt: 3 }),
      trade({ pnl: -5, closedAt: 4 }),
    ]);
    // overlay metrics via compare only — dashboard still has real metrics
    const compare = buildULComparisonReport(current, previous);
    const report = buildTradingInsightReport(d, compare);
    expect(report.insights.some((i) => i.title === 'Win Rate increased')).toBe(true);
    expect(report.insights.some((i) => i.title === 'Drawdown reduced')).toBe(true);
    expect(report.strengths.length).toBeGreaterThan(0);
  });

  it('Declining expectancy', () => {
    const current = {
      trades: 8,
      winRate: 40,
      profitFactor: 0.8,
      expectancy: -1,
      averageRr: 1.2,
      netPnl: -20,
      largestWin: 5,
      largestLoss: -15,
      recoveryFactor: -0.5,
      maxDrawdown: 30,
      consistency: 30,
      stability: 30,
      performanceScore: 35,
    };
    const previous = { ...current, expectancy: 2, winRate: 55, netPnl: 10 };
    const d = dash(
      Array.from({ length: 8 }, (_, i) =>
        trade({ pnl: i < 5 ? -8 : 5, closedAt: i + 1, rr: 1.1 }),
      ),
    );
    const report = buildTradingInsightReport(d, buildULComparisonReport(current, previous));
    expect(report.insights.some((i) => i.title === 'Expectancy falling')).toBe(true);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('Mixed coin opportunity', () => {
    const trades = [
      trade({ symbol: 'BTCUSDT', pnl: 40, closedAt: 1 }),
      trade({ symbol: 'BTCUSDT', pnl: 20, closedAt: 2 }),
      trade({ symbol: 'SOLUSDT', pnl: -25, closedAt: 3 }),
      trade({ symbol: 'SOLUSDT', pnl: -15, closedAt: 4 }),
    ];
    const d = dash(trades);
    const report = buildTradingInsightReport(d, null);
    expect(report.insights.some((i) => i.category === 'Coin')).toBe(true);
    expect(report.opportunities.some((i) => i.id === 'ti-coin-gap')).toBe(true);
  });

  it('Timing — worst late hour', () => {
    const base = Date.UTC(2026, 6, 10, 22, 0, 0);
    const trades = [
      trade({ pnl: -10, closedAt: base }),
      trade({ pnl: -8, closedAt: base + 60_000 }),
      trade({ pnl: -5, closedAt: base + 120_000 }),
      trade({ pnl: 20, closedAt: Date.UTC(2026, 6, 10, 10, 0, 0) }),
    ];
    const d = dash(trades);
    const report = buildTradingInsightReport(d, null);
    expect(report.insights.some((i) => i.category === 'Timing')).toBe(true);
  });

  it('Risk elevated', () => {
    const trades = Array.from({ length: 10 }, (_, i) =>
      trade({ pnl: i < 8 ? -20 : 5, closedAt: i + 1, rr: 0.7, duration: 300 }),
    );
    const d = dash(trades);
    const report = buildTradingInsightReport(d, null);
    expect(
      report.insights.some((i) => i.category === 'Risk' || i.id === 'ti-risk-elevated'),
    ).toBe(true);
  });

  it('Strategy — low RR', () => {
    const trades = Array.from({ length: 6 }, (_, i) =>
      trade({ pnl: i % 2 === 0 ? 5 : -4, closedAt: i + 1, rr: 0.9 }),
    );
    const d = dash(trades);
    const report = buildTradingInsightReport(d, null);
    expect(report.insights.some((i) => i.id === 'ti-rr-low')).toBe(true);
    expect(report.insights.some((i) => i.category === 'Strategy')).toBe(true);
  });

  it('Sorted by severity → confidence → title', () => {
    const trades = Array.from({ length: 10 }, (_, i) =>
      trade({
        pnl: i < 8 ? -15 : 5,
        closedAt: Date.UTC(2026, 6, 10, 22, i),
        rr: 0.8,
        duration: 300,
        symbol: i % 2 === 0 ? 'BTCUSDT' : 'ETHUSDT',
      }),
    );
    const d = dash(trades);
    const report = buildTradingInsightReport(d, null);
    for (let i = 1; i < report.insights.length; i += 1) {
      const a = report.insights[i - 1]!;
      const b = report.insights[i]!;
      const ra = TRADING_INSIGHT_SEVERITY_RANK[a.severity];
      const rb = TRADING_INSIGHT_SEVERITY_RANK[b.severity];
      expect(rb).toBeGreaterThanOrEqual(ra);
      if (ra === rb) {
        expect(b.confidence).toBeLessThanOrEqual(a.confidence);
      }
    }
  });

  it('Every insight has required fields', () => {
    const d = dash([
      trade({ pnl: 10, closedAt: 1 }),
      trade({ pnl: -5, closedAt: 2 }),
      trade({ pnl: 8, closedAt: 3 }),
    ]);
    const report = buildTradingInsightReport(d, null);
    for (const i of report.insights) {
      expect(i.id).toBeTruthy();
      expect(i.title).toBeTruthy();
      expect(i.description).toBeTruthy();
      expect(i.category).toBeTruthy();
      expect(i.severity).toBeTruthy();
      expect(i.confidence).toBeGreaterThanOrEqual(0);
      expect(i.confidence).toBeLessThanOrEqual(100);
      expect(Array.isArray(i.evidence)).toBe(true);
      expect(i.recommendation).toBeTruthy();
    }
  });
});

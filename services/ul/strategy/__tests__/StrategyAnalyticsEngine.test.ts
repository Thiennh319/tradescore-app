/**
 * Task 15.6 — Strategy Analytics Engine tests.
 */
import { describe, expect, it } from 'vitest';
import { buildULDashboard } from '../../ULAnalyticsEngine';
import type { ULTradeInput } from '../../types';
import {
  buildStrategyAnalyticsReport,
  rankStrategies,
  strategyGradeFromScore,
} from '../index';

function trade(
  partial: Partial<ULTradeInput> & Pick<ULTradeInput, 'pnl' | 'closedAt' | 'strategy'>,
): ULTradeInput {
  return {
    id: partial.id ?? `t-${partial.closedAt}-${partial.strategy}`,
    symbol: partial.symbol ?? 'BTCUSDT',
    side: partial.side ?? 'LONG',
    entry: 100,
    exit: 110,
    pnl: partial.pnl,
    rr: partial.rr ?? 2,
    duration: partial.duration ?? 60,
    strategy: partial.strategy,
    openedAt: partial.openedAt ?? partial.closedAt - 3_600_000,
    closedAt: partial.closedAt,
    reasonOpen: 'E',
    reasonClose: 'X',
  };
}

describe('buildStrategyAnalyticsReport', () => {
  it('Empty', () => {
    const report = buildStrategyAnalyticsReport(null, []);
    expect(report.version).toBe(1);
    expect(report.strategies).toEqual([]);
    expect(report.bestStrategy).toBeNull();
    expect(report.confidence).toBe(0);
  });

  it('One strategy', () => {
    const trades = [
      trade({ strategy: 'V4', pnl: 20, closedAt: 1 }),
      trade({ strategy: 'V4', pnl: -5, closedAt: 2 }),
      trade({ strategy: 'V4', pnl: 10, closedAt: 3 }),
    ];
    const dash = buildULDashboard(trades, { generatedAt: 'o', bypassCache: true });
    const report = buildStrategyAnalyticsReport(dash, trades);
    expect(report.strategies).toHaveLength(1);
    expect(report.strategies[0]!.name).toBe('V4');
    expect(report.ranking[0]!.rank).toBe(1);
    expect(report.bestStrategy?.name).toBe('V4');
    expect(report.lifecycle[0]!.lifecycle).toBeTruthy();
  });

  it('Multiple strategies + ranking', () => {
    const trades = [
      trade({ strategy: 'V4', pnl: 50, closedAt: 1, rr: 2.5 }),
      trade({ strategy: 'V4', pnl: 30, closedAt: 2, rr: 2.5 }),
      trade({ strategy: 'V4', pnl: 20, closedAt: 3, rr: 2.5 }),
      trade({ strategy: 'V3', pnl: -20, closedAt: 4, rr: 1 }),
      trade({ strategy: 'V3', pnl: -15, closedAt: 5, rr: 1 }),
      trade({ strategy: 'V3', pnl: -10, closedAt: 6, rr: 1 }),
      trade({ strategy: 'MANUAL', pnl: 5, closedAt: 7 }),
      trade({ strategy: 'MANUAL', pnl: -5, closedAt: 8 }),
    ];
    const report = buildStrategyAnalyticsReport(null, trades);
    expect(report.strategies.length).toBe(3);
    expect(report.ranking[0]!.name).toBe('V4');
    expect(report.bestStrategy?.name).toBe('V4');
    expect(report.worstStrategy?.name).toBeTruthy();
    expect(report.ranking.map((r) => r.rank)).toEqual([1, 2, 3]);
    const ranked = rankStrategies(report.strategies);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });

  it('Lifecycle declining', () => {
    const trades = [
      // early wins
      trade({ strategy: 'V4', pnl: 30, closedAt: 1 }),
      trade({ strategy: 'V4', pnl: 25, closedAt: 2 }),
      trade({ strategy: 'V4', pnl: 20, closedAt: 3 }),
      trade({ strategy: 'V4', pnl: 15, closedAt: 4 }),
      // later losses
      trade({ strategy: 'V4', pnl: -20, closedAt: 5 }),
      trade({ strategy: 'V4', pnl: -25, closedAt: 6 }),
      trade({ strategy: 'V4', pnl: -30, closedAt: 7 }),
      trade({ strategy: 'V4', pnl: -35, closedAt: 8 }),
    ];
    const report = buildStrategyAnalyticsReport(null, trades);
    const row = report.strategies[0]!;
    expect(row.tags.includes('Declining Strategy') || row.lifecycle === 'Declining').toBe(true);
  });

  it('Confidence + grade', () => {
    const trades = Array.from({ length: 10 }, (_, i) =>
      trade({ strategy: 'V4', pnl: i % 3 === 0 ? -5 : 12, closedAt: i + 1, rr: 2 }),
    );
    const report = buildStrategyAnalyticsReport(null, trades);
    expect(report.confidence).toBeGreaterThan(0);
    expect(report.strategies[0]!.confidence).toBeGreaterThan(0);
    expect(strategyGradeFromScore(report.strategies[0]!.score)).toBe(report.strategies[0]!.grade);
  });

  it('Heatmap hour / weekday / market / coin', () => {
    const trades = [
      trade({
        strategy: 'V4',
        pnl: 10,
        closedAt: Date.UTC(2026, 6, 10, 14, 0, 0),
        symbol: 'BTCUSDT',
        side: 'LONG',
      }),
      trade({
        strategy: 'V4',
        pnl: -5,
        closedAt: Date.UTC(2026, 6, 11, 22, 0, 0),
        symbol: 'ETHUSDT',
        side: 'SHORT',
      }),
    ];
    const report = buildStrategyAnalyticsReport(null, trades);
    expect(report.heatmap.hour.length).toBeGreaterThan(0);
    expect(report.heatmap.weekday.length).toBeGreaterThan(0);
    expect(report.heatmap.market.some((c) => c.bucket === 'LONG')).toBe(true);
    expect(report.heatmap.coin.some((c) => c.bucket === 'BTC')).toBe(true);
  });

  it('Dead / weak small sample', () => {
    const trades = [
      trade({ strategy: 'DEAD', pnl: -10, closedAt: 1 }),
      trade({ strategy: 'DEAD', pnl: -5, closedAt: 2 }),
    ];
    const report = buildStrategyAnalyticsReport(null, trades);
    const row = report.strategies[0]!;
    expect(
      row.tags.includes('Dead Strategy') ||
        row.status === 'Deprecated' ||
        row.lifecycle === 'Deprecated',
    ).toBe(true);
  });

  it('Overfit small perfect sample', () => {
    const trades = [
      trade({ strategy: 'PERF', pnl: 10, closedAt: 1 }),
      trade({ strategy: 'PERF', pnl: 12, closedAt: 2 }),
      trade({ strategy: 'PERF', pnl: 8, closedAt: 3 }),
    ];
    const report = buildStrategyAnalyticsReport(null, trades);
    expect(report.strategies[0]!.tags.includes('Overfit Strategy')).toBe(true);
  });

  it('Stable output', () => {
    const trades = [
      trade({ strategy: 'V4', pnl: 10, closedAt: 1 }),
      trade({ strategy: 'V3', pnl: -5, closedAt: 2 }),
      trade({ strategy: 'V4', pnl: 8, closedAt: 3 }),
    ];
    const dash = buildULDashboard(trades, { generatedAt: 's', bypassCache: true });
    const a = buildStrategyAnalyticsReport(dash, trades);
    const b = buildStrategyAnalyticsReport(dash, trades);
    expect(a).toEqual(b);
  });

  it('Disabled status path via empty disabled set still returns statuses', () => {
    const report = buildStrategyAnalyticsReport(null, [
      trade({ strategy: 'V4', pnl: 1, closedAt: 1 }),
    ]);
    expect(report.strategies[0]!.status).toBeTruthy();
    expect(['Excellent', 'Healthy', 'Watch', 'Weak', 'Deprecated', 'Disabled']).toContain(
      report.strategies[0]!.status,
    );
  });
});

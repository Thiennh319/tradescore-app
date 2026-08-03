/**
 * Task 15.2 — UL Compare Engine tests.
 */
import { describe, expect, it } from 'vitest';
import { computeCoreMetrics } from '../../ULMetrics';
import type { ULTradeInput } from '../../types';
import {
  buildULComparisonReport,
  buildULComparisonReportForPeriods,
  customPeriod,
  detectTrend,
  filterTradesByPeriod,
  periodSpec,
} from '../index';

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

const NOW = Date.UTC(2026, 6, 16, 12, 0, 0);

describe('detectTrend', () => {
  it('UP / DOWN / FLAT', () => {
    expect(detectTrend(61, 52)).toBe('UP');
    expect(detectTrend(40, 52)).toBe('DOWN');
    expect(detectTrend(50, 50)).toBe('FLAT');
    expect(detectTrend(null, 10)).toBe('FLAT');
  });
});

describe('buildULComparisonReport', () => {
  it('Empty compare', () => {
    const report = buildULComparisonReport(null, null);
    expect(report.version).toBe(1);
    expect(report.current.metrics.trades).toBe(0);
    expect(report.previous.metrics.trades).toBe(0);
    expect(report.rows).toHaveLength(13);
    expect(report.rows.every((r) => r.trend === 'FLAT')).toBe(true);
  });

  it('Win rate trend UP with delta', () => {
    const report = buildULComparisonReport(
      {
        trades: 10,
        winRate: 61,
        profitFactor: 1.5,
        expectancy: 2,
        averageRr: 2,
        netPnl: 20,
        largestWin: 10,
        largestLoss: -5,
        recoveryFactor: 1,
        maxDrawdown: 8,
        consistency: 60,
        stability: 55,
        performanceScore: 70,
      },
      {
        trades: 10,
        winRate: 52,
        profitFactor: 1.2,
        expectancy: 1,
        averageRr: 1.8,
        netPnl: 10,
        largestWin: 8,
        largestLoss: -12,
        recoveryFactor: 0.5,
        maxDrawdown: 15,
        consistency: 50,
        stability: 50,
        performanceScore: 60,
      },
    );
    const wr = report.rows.find((r) => r.key === 'winRate')!;
    expect(wr.trend).toBe('UP');
    expect(wr.delta).toBeCloseTo(9, 5);
    expect(report.highlights.some((h) => h.title === 'Win rate improved')).toBe(true);
    expect(report.highlights.some((h) => h.title === 'Drawdown reduced')).toBe(true);
    expect(report.highlights.some((h) => h.title === 'Largest loss reduced')).toBe(true);
  });

  it('Negative PnL trend', () => {
    const report = buildULComparisonReport(
      { ...emptyLike(), netPnl: -30, trades: 5 },
      { ...emptyLike(), netPnl: -10, trades: 5 },
    );
    const pnl = report.rows.find((r) => r.key === 'netPnl')!;
    expect(pnl.trend).toBe('DOWN');
    expect(report.highlights.some((h) => h.title === 'Net PnL declined')).toBe(true);
  });

  it('All wins vs all losses bags', () => {
    const wins = computeCoreMetrics([
      trade({ pnl: 10, closedAt: 1 }),
      trade({ pnl: 20, closedAt: 2 }),
    ]);
    const losses = computeCoreMetrics([
      trade({ pnl: -10, closedAt: 1 }),
      trade({ pnl: -20, closedAt: 2 }),
    ]);
    const report = buildULComparisonReport(wins, losses);
    expect(report.current.metrics.winRate).toBe(100);
    expect(report.previous.metrics.winRate).toBe(0);
    expect(report.rows.find((r) => r.key === 'winRate')!.trend).toBe('UP');
  });
});

describe('Period compares', () => {
  function seededTrades(): ULTradeInput[] {
    const out: ULTradeInput[] = [];
    // within 7d
    out.push(trade({ id: '7a', pnl: 10, closedAt: NOW - 2 * 86_400_000 }));
    out.push(trade({ id: '7b', pnl: -5, closedAt: NOW - 3 * 86_400_000 }));
    // within 30d but outside 7d
    out.push(trade({ id: '30a', pnl: 20, closedAt: NOW - 20 * 86_400_000 }));
    out.push(trade({ id: '30b', pnl: 15, closedAt: NOW - 25 * 86_400_000 }));
    // within 90d outside 30d
    out.push(trade({ id: '90a', pnl: -8, closedAt: NOW - 60 * 86_400_000 }));
    // within 180d outside 90d
    out.push(trade({ id: '180a', pnl: 5, closedAt: NOW - 120 * 86_400_000 }));
    return out;
  }

  it('7 vs 30', () => {
    const report = buildULComparisonReportForPeriods(
      seededTrades(),
      periodSpec('7d'),
      periodSpec('30d'),
      NOW,
    );
    expect(report.current.label).toBe('7 Days');
    expect(report.previous.label).toBe('30 Days');
    expect(report.current.metrics.trades).toBe(2);
    expect(report.previous.metrics.trades).toBe(4);
  });

  it('30 vs 90', () => {
    const report = buildULComparisonReportForPeriods(
      seededTrades(),
      periodSpec('30d'),
      periodSpec('90d'),
      NOW,
    );
    expect(report.current.metrics.trades).toBe(4);
    expect(report.previous.metrics.trades).toBe(5);
  });

  it('90 vs 180', () => {
    const report = buildULComparisonReportForPeriods(
      seededTrades(),
      periodSpec('90d'),
      periodSpec('180d'),
      NOW,
    );
    expect(report.current.metrics.trades).toBe(5);
    expect(report.previous.metrics.trades).toBe(6);
  });

  it('Custom range', () => {
    const start = NOW - 10 * 86_400_000;
    const end = NOW - 1 * 86_400_000;
    const trades = seededTrades();
    const filtered = filterTradesByPeriod(trades, customPeriod(start, end), NOW);
    expect(filtered.every((t) => t.closedAt >= start && t.closedAt <= end)).toBe(true);
    const report = buildULComparisonReportForPeriods(
      trades,
      customPeriod(start, end),
      periodSpec('all'),
      NOW,
    );
    expect(report.current.label).toBe('Custom Range');
    expect(report.previous.label).toBe('All Time');
    expect(report.previous.metrics.trades).toBe(6);
  });
});

function emptyLike() {
  return {
    trades: 0,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    averageRr: null as number | null,
    netPnl: 0,
    largestWin: null as number | null,
    largestLoss: null as number | null,
    recoveryFactor: null as number | null,
    maxDrawdown: 0,
    consistency: 0,
    stability: 0,
    performanceScore: 0,
  };
}

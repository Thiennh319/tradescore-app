/**
 * Task 15.0.2 — UL Dashboard Adapter tests.
 * Pure mapping — no metric recomputation.
 */
import { describe, expect, it } from 'vitest';
import { buildULDashboard } from '../../ULAnalyticsEngine';
import type { ULDashboardData, ULTradeInput } from '../../types';
import {
  buildPerformanceDashboardVM,
  deepFreezeVm,
  mapRiskLevel,
  PERFORMANCE_DASHBOARD_VM_VERSION,
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

describe('mapRiskLevel (enum convert only)', () => {
  it('maps UL → display casing', () => {
    expect(mapRiskLevel('LOW')).toBe('Low');
    expect(mapRiskLevel('MEDIUM')).toBe('Medium');
    expect(mapRiskLevel('HIGH')).toBe('High');
    expect(mapRiskLevel('CRITICAL')).toBe('Critical');
    expect(mapRiskLevel(undefined)).toBe('Unknown');
  });
});

describe('buildPerformanceDashboardVM', () => {
  it('Empty dashboard → safe defaults', () => {
    const ul = buildULDashboard([], { generatedAt: 'empty-at', bypassCache: true });
    const vm = buildPerformanceDashboardVM(ul);
    expect(vm.version).toBe(PERFORMANCE_DASHBOARD_VM_VERSION);
    expect(vm.summary.winRate).toBe(0);
    expect(vm.summary.profitFactor).toBe(0);
    expect(vm.coinPerformance.rows).toEqual([]);
    expect(vm.recommendationPanel.items).toEqual([]);
    expect(vm.equityChart.data).toEqual([]);
    expect(vm.dailyChart.data).toEqual([]);
    expect(vm.riskWidget.level).toBe('Low');
    expect(vm.insightCards).toEqual([]);
  });

  it('null / undefined input → safe defaults (no throw)', () => {
    expect(() => buildPerformanceDashboardVM(null)).not.toThrow();
    expect(() => buildPerformanceDashboardVM(undefined)).not.toThrow();
    const vm = buildPerformanceDashboardVM(null);
    expect(vm.summary.totalTrades).toBe(0);
    expect(vm.fingerprint).toBe('empty');
  });

  it('Missing fields → normalized defaults', () => {
    const vm = buildPerformanceDashboardVM({} as Partial<ULDashboardData>);
    expect(vm.summary.winRate).toBe(0);
    expect(vm.summary.grade).toBe('F');
    expect(vm.coinPerformance.bestCoin).toBeNull();
    expect(vm.riskWidget.level).toBe('Unknown');
    expect(vm.equityChart.data).toEqual([]);
  });

  it('Null nested values → safe numbers / nulls', () => {
    const vm = buildPerformanceDashboardVM({
      version: 1,
      generatedAt: 'g',
      tradeCount: 1,
      fingerprint: 'fp',
      metrics: {
        totalTrades: 1,
        wins: 1,
        losses: 0,
        breakevens: 0,
        winRate: 100,
        profitFactor: 2,
        expectancy: 5,
        averageRr: null,
        averageWinner: null,
        averageLoser: null,
        largestWin: null,
        largestLoss: null,
        averageHoldingTime: null,
        maxDrawdown: 0,
        currentDrawdown: 0,
        recoveryFactor: null,
        calmarRatio: null,
        consistencyScore: 50,
        stabilityScore: 50,
        performanceScore: 60,
        netPnl: 5,
        grossProfit: 5,
        grossLoss: 0,
      },
      kpi: undefined,
      charts: undefined,
      coinTable: undefined,
      recommendations: undefined,
      risk: undefined,
      score: undefined,
      insights: undefined,
      patterns: undefined,
    } as unknown as ULDashboardData);

    expect(vm.summary.winRate).toBe(100);
    expect(vm.summary.averageRr).toBeNull();
    expect(vm.recommendationPanel.items).toEqual([]);
    expect(vm.equityChart.data).toEqual([]);
    expect(vm.coinPerformance.rows).toEqual([]);
  });

  it('Full dashboard field mapping', () => {
    const trades = [
      trade({ symbol: 'BTCUSDT', pnl: 30, closedAt: Date.UTC(2026, 6, 1, 10), id: 'a' }),
      trade({ symbol: 'ETHUSDT', pnl: -10, closedAt: Date.UTC(2026, 6, 2, 11), id: 'b' }),
      trade({ symbol: 'BTCUSDT', pnl: 20, closedAt: Date.UTC(2026, 6, 3, 12), id: 'c' }),
    ];
    const ul = buildULDashboard(trades, { generatedAt: 'full-at', bypassCache: true });
    const vm = buildPerformanceDashboardVM(ul);

    // Mapping examples from task brief
    expect(vm.summary.winRate).toBe(ul.metrics.winRate);
    expect(vm.coinPerformance.rows.length).toBe(ul.coinTable.rows.length);
    expect(vm.coinPerformance.bestCoin).toBe(ul.coinTable.bestCoin);
    expect(vm.recommendationPanel.items.length).toBe(ul.recommendations.length);
    expect(vm.riskWidget.level).toBe(mapRiskLevel(ul.risk.riskLevel));
    expect(vm.riskWidget.score).toBe(ul.risk.score);
    expect(vm.equityChart.data.length).toBe(ul.charts.equityCurve.length);
    expect(vm.dailyChart.data.length).toBe(ul.charts.dailyPnl.length);
    expect(vm.fingerprint).toBe(ul.fingerprint);
    expect(vm.generatedAt).toBe('full-at');
  });

  it('Stable mapping (deterministic)', () => {
    const trades = [
      trade({ pnl: 10, closedAt: 1, id: '1' }),
      trade({ pnl: -4, closedAt: 2, id: '2' }),
    ];
    const ul = buildULDashboard(trades, { generatedAt: 'stable', bypassCache: true });
    const a = buildPerformanceDashboardVM(ul);
    const b = buildPerformanceDashboardVM(ul);
    expect(a).toEqual(b);
  });

  it('No metric recomputation — copies UL values verbatim', () => {
    const ul = buildULDashboard(
      [
        trade({ pnl: 12.345, closedAt: 1 }),
        trade({ pnl: -3.21, closedAt: 2 }),
      ],
      { generatedAt: 'copy', bypassCache: true },
    );
    const vm = buildPerformanceDashboardVM(ul);

    expect(vm.summary.winRate).toBe(ul.metrics.winRate);
    expect(vm.summary.profitFactor).toBe(ul.metrics.profitFactor);
    expect(vm.summary.expectancy).toBe(ul.metrics.expectancy);
    expect(vm.summary.netPnl).toBe(ul.metrics.netPnl);
    expect(vm.summary.maxDrawdown).toBe(ul.metrics.maxDrawdown);
    expect(vm.summary.performanceScore).toBe(ul.score.performanceScore);
    expect(vm.summary.grade).toBe(ul.score.grade);

    // Coin row fields copied, not re-ranked
    for (let i = 0; i < ul.coinTable.rows.length; i += 1) {
      const src = ul.coinTable.rows[i]!;
      const dst = vm.coinPerformance.rows[i]!;
      expect(dst.rank).toBe(src.rank);
      expect(dst.totalPnl).toBe(src.totalPnl);
      expect(dst.winRate).toBe(src.winRate);
      expect(dst.score).toBe(src.score);
    }

    // Equity points copied
    for (let i = 0; i < ul.charts.equityCurve.length; i += 1) {
      expect(vm.equityChart.data[i]!.equity).toBe(ul.charts.equityCurve[i]!.equity);
      expect(vm.equityChart.data[i]!.pnl).toBe(ul.charts.equityCurve[i]!.pnl);
    }
  });

  it('Deep readonly — frozen tree', () => {
    const ul = buildULDashboard([trade({ pnl: 1, closedAt: 1 })], {
      generatedAt: 'freeze',
      bypassCache: true,
    });
    const vm = buildPerformanceDashboardVM(ul);
    expect(Object.isFrozen(vm)).toBe(true);
    expect(Object.isFrozen(vm.summary)).toBe(true);
    expect(Object.isFrozen(vm.coinPerformance)).toBe(true);
    expect(Object.isFrozen(vm.recommendationPanel)).toBe(true);
    expect(Object.isFrozen(vm.riskWidget)).toBe(true);
    expect(Object.isFrozen(vm.equityChart)).toBe(true);

    expect(() => {
      (vm as { tradeCount: number }).tradeCount = 999;
    }).toThrow();

    const again = deepFreezeVm(vm);
    expect(again).toBe(vm);
  });

  it('Recommendation panel flatten (evidence / target)', () => {
    const vm = buildPerformanceDashboardVM({
      version: 1,
      generatedAt: '',
      tradeCount: 1,
      fingerprint: 'r',
      recommendations: [
        {
          id: 'ul-rec-1',
          priority: 'HIGH',
          title: 'Giảm size',
          description: 'Rủi ro cao',
          reason: 'risk=HIGH',
          severity: 'WARN',
          action: 'Reduce position size',
        },
      ],
    } as Partial<ULDashboardData>);

    const item = vm.recommendationPanel.items[0]!;
    expect(item.target).toBe('Giảm size');
    expect(item.evidence).toEqual(['Rủi ro cao', 'risk=HIGH']);
    expect(item.action).toBe('Reduce position size');
  });
});

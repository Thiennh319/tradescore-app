/**
 * Task 15.0.3 — Performance Dashboard ViewModel Validator tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceDashboardViewModel } from '../performanceDashboardTypes';
import { PERFORMANCE_DASHBOARD_VM_VERSION } from '../performanceDashboardTypes';
import { validatePerformanceDashboardVM } from '../PerformanceDashboardValidator';

afterEach(() => {
  vi.restoreAllMocks();
});

function baseVm(
  overrides: Partial<PerformanceDashboardViewModel> = {},
): PerformanceDashboardViewModel {
  return {
    version: PERFORMANCE_DASHBOARD_VM_VERSION,
    generatedAt: 't',
    tradeCount: 2,
    fingerprint: 'fp',
    summary: {
      totalTrades: 2,
      wins: 1,
      losses: 1,
      breakevens: 0,
      winRate: 50,
      profitFactor: 1.5,
      expectancy: 1,
      netPnl: 2,
      averageRr: 2,
      averageWinner: 10,
      averageLoser: -5,
      largestWin: 10,
      largestLoss: -5,
      averageHoldingTime: 30,
      maxDrawdown: 5,
      currentDrawdown: 0,
      recoveryFactor: 0.4,
      calmarRatio: 0.4,
      consistencyScore: 60,
      stabilityScore: 55,
      performanceScore: 70,
      grade: 'B',
      riskLevel: 'Medium',
    },
    coinPerformance: {
      rows: [
        {
          rank: 1,
          symbol: 'BTC',
          trades: 2,
          wins: 1,
          losses: 1,
          winRate: 50,
          totalPnl: 2,
          averageRr: 2,
          expectancy: 1,
          score: 10,
        },
      ],
      bestCoin: 'BTC',
      worstCoin: 'BTC',
    },
    recommendationPanel: {
      items: [
        {
          id: 'r1',
          priority: 'HIGH',
          title: 'Title',
          description: 'Desc',
          reason: 'Reason',
          severity: 'WARN',
          action: 'Act',
          evidence: ['Desc', 'Reason'],
          target: 'Title',
        },
      ],
    },
    riskWidget: {
      level: 'Medium',
      score: 40,
      summary: 'ok',
      drawdown: 5,
      winRate: 50,
      profitFactor: 1.5,
      recoveryFactor: 0.4,
      consistency: 60,
    },
    equityChart: {
      data: [{ index: 0, equity: 10, pnl: 10, closedAt: 1 }],
    },
    dailyChart: {
      data: [{ dayKey: '2026-07-01', pnl: 10, trades: 1 }],
    },
    scoreWidget: {
      performanceScore: 70,
      consistencyScore: 60,
      stabilityScore: 55,
      riskScore: 40,
      expectancyScore: 50,
      grade: 'B',
    },
    insightCards: [
      { id: 'i1', title: 'T', subtitle: 'S', value: 'V', tint: 'green' },
    ],
    patterns: {
      winningStreak: 1,
      losingStreak: 0,
      bestTradingHour: 10,
      worstTradingHour: 2,
      bestWeekday: 1,
      worstWeekday: 0,
      bestStrategy: 'V4',
      worstStrategy: 'V3',
      averageTradeDuration: 30,
    },
    ...overrides,
  };
}

describe('validatePerformanceDashboardVM', () => {
  it('Empty / null VM → safe defaults, never throws', () => {
    expect(() => validatePerformanceDashboardVM(null)).not.toThrow();
    expect(() => validatePerformanceDashboardVM(undefined)).not.toThrow();
    const vm = validatePerformanceDashboardVM(null);
    expect(vm.summary.winRate).toBe(0);
    expect(vm.summary.grade).toBe('F');
    expect(vm.equityChart.data).toEqual([]);
    expect(vm.dailyChart.data).toEqual([]);
    expect(vm.recommendationPanel.items).toEqual([]);
    expect(vm.insightCards).toEqual([]);
    expect(vm.coinPerformance.rows).toEqual([]);
  });

  it('Missing fields → normalized', () => {
    const vm = validatePerformanceDashboardVM({} as PerformanceDashboardViewModel);
    expect(vm.version).toBe(1);
    expect(vm.tradeCount).toBe(0);
    expect(vm.summary.performanceScore).toBe(0);
    expect(vm.summary.grade).toBe('F');
    expect(vm.riskWidget.level).toBe('Unknown');
    expect(vm.coinPerformance.bestCoin).toBeNull();
    expect(vm.coinPerformance.worstCoin).toBeNull();
    expect(Array.isArray(vm.insightCards)).toBe(true);
    expect(Array.isArray(vm.equityChart.data)).toBe(true);
  });

  it('NaN → 0 (finite sanitization)', () => {
    const vm = validatePerformanceDashboardVM(
      baseVm({
        summary: {
          ...baseVm().summary,
          winRate: NaN,
          profitFactor: NaN,
          expectancy: NaN,
          netPnl: NaN,
          performanceScore: NaN,
        },
      }),
    );
    expect(vm.summary.winRate).toBe(0);
    expect(vm.summary.profitFactor).toBe(0);
    expect(vm.summary.expectancy).toBe(0);
    expect(vm.summary.netPnl).toBe(0);
    expect(vm.summary.performanceScore).toBe(0);
  });

  it('Infinity → 0 / clamped scores', () => {
    const vm = validatePerformanceDashboardVM(
      baseVm({
        summary: {
          ...baseVm().summary,
          winRate: Infinity,
          profitFactor: -Infinity,
          performanceScore: 250,
        },
        scoreWidget: {
          ...baseVm().scoreWidget,
          riskScore: Infinity,
          performanceScore: -10,
        },
      }),
    );
    expect(vm.summary.winRate).toBe(0);
    expect(vm.summary.profitFactor).toBe(0);
    expect(vm.summary.performanceScore).toBe(100);
    expect(vm.scoreWidget.riskScore).toBe(0);
    expect(vm.scoreWidget.performanceScore).toBe(0);
  });

  it('Invalid risk level → Unknown', () => {
    const vm = validatePerformanceDashboardVM(
      baseVm({
        riskWidget: { ...baseVm().riskWidget, level: 'EXTREME' as 'Low' },
        summary: { ...baseVm().summary, riskLevel: 'BAD' as 'Low' },
      }),
    );
    expect(vm.riskWidget.level).toBe('Unknown');
    expect(vm.summary.riskLevel).toBe('Unknown');
  });

  it('Invalid grade → F', () => {
    const vm = validatePerformanceDashboardVM(
      baseVm({
        summary: { ...baseVm().summary, grade: 'Z' },
        scoreWidget: { ...baseVm().scoreWidget, grade: 'A++' },
      }),
    );
    expect(vm.summary.grade).toBe('F');
    expect(vm.scoreWidget.grade).toBe('F');
  });

  it('Missing arrays → []', () => {
    const raw = baseVm();
    const broken = {
      ...raw,
      equityChart: undefined,
      dailyChart: undefined,
      insightCards: null,
      coinPerformance: { bestCoin: undefined, worstCoin: undefined },
      recommendationPanel: undefined,
    } as unknown as PerformanceDashboardViewModel;

    const vm = validatePerformanceDashboardVM(broken);
    expect(vm.equityChart.data).toEqual([]);
    expect(vm.dailyChart.data).toEqual([]);
    expect(vm.insightCards).toEqual([]);
    expect(vm.coinPerformance.rows).toEqual([]);
    expect(vm.coinPerformance.bestCoin).toBeNull();
    expect(vm.coinPerformance.worstCoin).toBeNull();
    expect(vm.recommendationPanel.items).toEqual([]);
  });

  it('Recommendation null / incomplete → sanitized array', () => {
    const vm = validatePerformanceDashboardVM(
      baseVm({
        recommendationPanel: {
          items: [
            null as unknown as PerformanceDashboardViewModel['recommendationPanel']['items'][0],
            {
              id: 'x',
              priority: undefined as unknown as string,
              title: undefined as unknown as string,
              description: undefined as unknown as string,
              reason: undefined as unknown as string,
              severity: undefined as unknown as string,
              action: undefined as unknown as string,
              evidence: undefined as unknown as string[],
              target: undefined as unknown as string,
            },
          ],
        },
      }),
    );
    expect(Array.isArray(vm.recommendationPanel.items)).toBe(true);
    expect(vm.recommendationPanel.items.length).toBe(1);
    const item = vm.recommendationPanel.items[0]!;
    expect(item.priority).toBe('INFO');
    expect(item.title).toBe('');
    expect(item.description).toBe('');
    expect(item.action).toBe('');
    expect(Array.isArray(item.evidence)).toBe(true);
  });

  it('Readonly / deep frozen', () => {
    const vm = validatePerformanceDashboardVM(baseVm());
    expect(Object.isFrozen(vm)).toBe(true);
    expect(Object.isFrozen(vm.summary)).toBe(true);
    expect(Object.isFrozen(vm.equityChart)).toBe(true);
    expect(Object.isFrozen(vm.recommendationPanel)).toBe(true);
    expect(() => {
      (vm as { tradeCount: number }).tradeCount = -1;
    }).toThrow();
  });

  it('Never throws on garbage input', () => {
    const garbage = [
      null,
      undefined,
      {},
      { summary: null, riskWidget: 'x', equityChart: 1 },
      { recommendationPanel: { items: 'nope' } },
    ];
    for (const g of garbage) {
      expect(() =>
        validatePerformanceDashboardVM(g as PerformanceDashboardViewModel),
      ).not.toThrow();
    }
  });

  it('Preserves finite valid values (no metric recalculation)', () => {
    const input = baseVm();
    const vm = validatePerformanceDashboardVM(input);
    expect(vm.summary.winRate).toBe(50);
    expect(vm.summary.profitFactor).toBe(1.5);
    expect(vm.summary.expectancy).toBe(1);
    expect(vm.summary.netPnl).toBe(2);
    expect(vm.summary.performanceScore).toBe(70);
    expect(vm.summary.grade).toBe('B');
    expect(vm.riskWidget.level).toBe('Medium');
    expect(vm.coinPerformance.rows[0]!.totalPnl).toBe(2);
    expect(vm.equityChart.data[0]!.equity).toBe(10);
  });

  it('tradeCount >= 0', () => {
    const vm = validatePerformanceDashboardVM(baseVm({ tradeCount: -5 }));
    expect(vm.tradeCount).toBe(0);
  });
});

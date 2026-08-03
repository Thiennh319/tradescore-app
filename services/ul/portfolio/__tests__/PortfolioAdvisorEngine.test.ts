/**
 * Task 15.9 — Portfolio Advisor Engine tests.
 */
import { describe, expect, it } from 'vitest';
import type { ULCompareReport } from '../../compare/ULCompareTypes';
import type { EntryQualityReport } from '../../entry/EntryQualityTypes';
import type { TradingInsightReport } from '../../insight/TradingInsightTypes';
import type { TradingPsychologyReport } from '../../psychology/TradingPsychologyTypes';
import type { TradingRecommendationReport } from '../../recommendation/TradingRecommendationTypes';
import type { StrategyAnalyticsReport, StrategyAnalyticsRow } from '../../strategy/StrategyAnalyticsTypes';
import type { TradingCoachReport } from '../../coach/TradingCoachTypes';
import type { ULDashboardData } from '../../types';
import { buildPortfolioAdvisorReport } from '../index';

function dashboard(riskScore = 15): ULDashboardData {
  return {
    version: 1,
    generatedAt: '2026-07-16T00:00:00.000Z',
    tradeCount: 30,
    fingerprint: 'portfolio-fixture',
    kpi: {
      totalTrades: 30,
      winRate: 58,
      profitFactor: 1.9,
      expectancy: 8,
      netPnl: 240,
      performanceScore: 82,
      grade: 'B+',
      riskLevel: riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : 'LOW',
    },
    metrics: {
      totalTrades: 30,
      wins: 18,
      losses: 12,
      breakevens: 0,
      winRate: 58,
      profitFactor: 1.9,
      expectancy: 8,
      averageRr: 2.2,
      averageWinner: 30,
      averageLoser: -15,
      largestWin: 80,
      largestLoss: -40,
      averageHoldingTime: 90,
      maxDrawdown: 50,
      currentDrawdown: 10,
      recoveryFactor: 4.8,
      calmarRatio: 2,
      consistencyScore: 72,
      stabilityScore: 76,
      performanceScore: 82,
      netPnl: 240,
      grossProfit: 540,
      grossLoss: 300,
    },
    charts: { equityCurve: [], dailyPnl: [] },
    coinTable: {
      bestCoin: 'BTCUSDT',
      worstCoin: 'NEARUSDT',
      rows: [
        {
          symbol: 'BTCUSDT',
          trades: 12,
          wins: 8,
          losses: 4,
          winRate: 66,
          totalPnl: 160,
          averageRr: 2.4,
          expectancy: 13,
          rank: 1,
          score: 88,
        },
        {
          symbol: 'SOLUSDT',
          trades: 10,
          wins: 6,
          losses: 4,
          winRate: 60,
          totalPnl: 90,
          averageRr: 2.1,
          expectancy: 9,
          rank: 2,
          score: 72,
        },
        {
          symbol: 'BNBUSDT',
          trades: 5,
          wins: 2,
          losses: 3,
          winRate: 40,
          totalPnl: 5,
          averageRr: 1.8,
          expectancy: 1,
          rank: 3,
          score: 50,
        },
        {
          symbol: 'NEARUSDT',
          trades: 3,
          wins: 0,
          losses: 3,
          winRate: 0,
          totalPnl: -15,
          averageRr: 1,
          expectancy: -5,
          rank: 4,
          score: 20,
        },
      ],
    },
    patterns: {
      winningStreak: 4,
      losingStreak: 1,
      bestTradingHour: 9,
      worstTradingHour: 22,
      bestWeekday: 2,
      worstWeekday: 6,
      bestStrategy: 'EMA Trend',
      worstStrategy: 'Reversal',
      averageTradeDuration: 90,
      pnlByHour: [],
      pnlByWeekday: [],
    },
    risk: {
      riskLevel: riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : 'LOW',
      score: riskScore,
      factors: {
        drawdown: 50,
        winRate: 58,
        profitFactor: 1.9,
        recoveryFactor: 4.8,
        consistency: 72,
      },
      summary: 'fixture',
    },
    score: {
      performanceScore: 82,
      consistencyScore: 72,
      stabilityScore: 76,
      riskScore,
      expectancyScore: 80,
      grade: 'B+',
    },
    insights: [],
    recommendations: [],
  };
}

function strategyRow(
  partial: Partial<StrategyAnalyticsRow> & Pick<StrategyAnalyticsRow, 'id' | 'name'>,
): StrategyAnalyticsRow {
  return {
    id: partial.id,
    name: partial.name,
    tradeCount: partial.tradeCount ?? 15,
    winRate: partial.winRate ?? 60,
    profitFactor: partial.profitFactor ?? 2,
    expectancy: partial.expectancy ?? 10,
    averageRR: partial.averageRR ?? 2,
    netPnL: partial.netPnL ?? 100,
    largestWin: partial.largestWin ?? 50,
    largestLoss: partial.largestLoss ?? -25,
    maxDrawdown: partial.maxDrawdown ?? 30,
    recoveryFactor: partial.recoveryFactor ?? 3,
    consistency: partial.consistency ?? 70,
    performance: partial.performance ?? 80,
    stability: partial.stability ?? 75,
    confidence: partial.confidence ?? 80,
    score: partial.score ?? 85,
    grade: partial.grade ?? 'A',
    status: partial.status ?? 'Healthy',
    lifecycle: partial.lifecycle ?? 'Stable',
    recommendation: partial.recommendation ?? 'Keep',
    tags: partial.tags ?? ['Stable Strategy'],
  };
}

function strategies(): StrategyAnalyticsReport {
  const ema = strategyRow({
    id: 'strategy-ema',
    name: 'EMA Trend',
    score: 90,
    confidence: 90,
    profitFactor: 2.3,
    tags: ['Best Strategy', 'Stable Strategy'],
  });
  const breakout = strategyRow({
    id: 'strategy-breakout',
    name: 'Breakout',
    score: 75,
    confidence: 70,
    profitFactor: 1.7,
  });
  const reversal = strategyRow({
    id: 'strategy-reversal',
    name: 'Reversal',
    score: 35,
    confidence: 50,
    profitFactor: 0.8,
    status: 'Weak',
    lifecycle: 'Declining',
    tags: ['Worst Strategy', 'Declining Strategy'],
  });
  return {
    version: 1,
    summary: {
      strategyCount: 3,
      totalTrades: 30,
      headline: 'EMA Trend',
      bestStrategyId: ema.id,
      worstStrategyId: reversal.id,
    },
    strategies: [reversal, breakout, ema],
    ranking: [],
    bestStrategy: ema,
    worstStrategy: reversal,
    heatmap: {
      hour: [],
      weekday: [],
      market: [
        { key: 'LONG', bucket: 'LONG', trades: 20, pnl: 180 },
        { key: 'SHORT', bucket: 'SHORT', trades: 10, pnl: 60 },
      ],
      coin: [],
    },
    lifecycle: [],
    confidence: 82,
  };
}

function entry(decision: 'ENTER' | 'WAIT' | 'AVOID' = 'ENTER'): EntryQualityReport {
  const failed =
    decision === 'ENTER'
      ? []
      : [
          {
            id: 'risk_reward' as const,
            title: 'Risk Reward',
            status: 'FAIL' as const,
            weight: 6,
            pillar: 'Risk' as const,
            reason: 'RR low',
            recommendation: 'Wait',
          },
        ];
  return {
    version: 1,
    summary: {
      headline: decision,
      checkCount: 1,
      passCount: decision === 'ENTER' ? 1 : 0,
      warnCount: 0,
      failCount: failed.length,
      blockerCount: failed.length,
      topDetection: failed.length ? 'Poor RR' : null,
    },
    score: decision === 'ENTER' ? 85 : decision === 'WAIT' ? 55 : 25,
    grade: decision === 'ENTER' ? 'A' : decision === 'WAIT' ? 'C' : 'F',
    confidence: 80,
    decision,
    strengths: [],
    weaknesses: [],
    passedChecks: [],
    failedChecks: failed,
    blockedReasons: failed.length ? ['RR low'] : [],
    recommendations: [],
    pillars: [],
    checks: failed,
    detections: failed.length ? ['Poor RR'] : [],
    evidence: [
      {
        checkId: 'trend_direction',
        title: 'Trend Direction',
        status: 'PASS',
        actual: 'BULL',
        expected: 'BULL',
        unit: '',
        weight: 8,
        reason: 'aligned',
        recommendation: 'keep',
        source: 'Trend',
      },
    ],
  };
}

function psychology(score = 85): TradingPsychologyReport {
  const warning =
    score < 50
      ? {
          id: 'psy-revenge',
          title: 'Tâm lý chưa ổn',
          description: 'fixture',
          severity: 'HIGH' as const,
          confidence: 80,
          psychologyType: 'Revenge Trading' as const,
          evidence: ['ti-lose-streak'],
          habit: 'Chase',
          improvement: 'Stop',
        }
      : null;
  return {
    version: 1,
    summary: {
      headline: warning?.title ?? 'Ổn định',
      findingCount: warning ? 1 : 0,
      strengthCount: 0,
      weaknessCount: 0,
      warningCount: warning ? 1 : 0,
      habitCount: 0,
      topSeverity: warning?.severity ?? null,
    },
    score,
    grade: score >= 85 ? 'A' : 'D',
    traits: [],
    strengths: [],
    weaknesses: [],
    warnings: warning ? [warning] : [],
    habits: [],
    findings: warning ? [warning] : [],
  };
}

function insight(): TradingInsightReport {
  const item = {
    id: 'ti-btc',
    title: 'BTC outperforming',
    description: 'BTC performance positive',
    category: 'Coin' as const,
    severity: 'INFO' as const,
    confidence: 80,
    evidence: ['coin:BTC'],
    recommendation: 'Prioritize BTC',
  };
  return {
    version: 1,
    summary: {
      headline: item.title,
      insightCount: 1,
      strengthCount: 1,
      weaknessCount: 0,
      opportunityCount: 0,
      warningCount: 0,
      topSeverity: 'INFO',
    },
    insights: [item],
    strengths: [item],
    weaknesses: [],
    opportunities: [],
    warnings: [],
  };
}

function recommendations(): TradingRecommendationReport {
  const item = {
    id: 'tr-btc',
    title: 'Prioritize BTC',
    description: 'Focus BTC',
    reason: 'BTC strong',
    priority: 'MEDIUM' as const,
    confidence: 80,
    impact: 'HIGH' as const,
    effort: 'EASY' as const,
    expectedBenefit: 'Consistency' as const,
    category: 'Coin' as const,
    action: 'Prioritize BTC',
    evidence: ['ti-btc'],
    sourceInsightIds: ['ti-btc'],
  };
  return {
    version: 1,
    summary: {
      headline: item.title,
      total: 1,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 1,
      lowCount: 0,
      infoCount: 0,
    },
    recommendations: [item],
    critical: [],
    high: [],
    medium: [item],
    low: [],
  };
}

function coach(status: 'Healthy' | 'Critical' = 'Healthy'): TradingCoachReport {
  return {
    version: 1,
    summary: {
      headline: status === 'Critical' ? 'Protect capital' : 'Healthy plan',
      overallStatus: status,
      coachScore: status === 'Critical' ? 30 : 85,
      grade: status === 'Critical' ? 'F' : 'A',
    },
    dailyFocus: [],
    topPriorities: [],
    actionPlan: [],
    coachMessages: [],
    weeklyGoals: [],
    nextSessionChecklist: [],
    confidence: 80,
    evidence: [],
  };
}

function compare(): ULCompareReport {
  return {
    version: 1,
    current: {} as ULCompareReport['current'],
    previous: {} as ULCompareReport['previous'],
    rows: [],
    summary: { improvedCount: 5, worsenedCount: 1, flatCount: 0, headline: 'Improving' },
    highlights: [],
  };
}

function args(overrides?: {
  dashboard?: ULDashboardData;
  psychology?: TradingPsychologyReport;
  strategy?: StrategyAnalyticsReport;
  entry?: EntryQualityReport;
  coach?: TradingCoachReport;
}) {
  return [
    overrides?.dashboard ?? dashboard(),
    compare(),
    insight(),
    recommendations(),
    overrides?.psychology ?? psychology(),
    overrides?.strategy ?? strategies(),
    overrides?.entry ?? entry(),
    overrides?.coach ?? coach(),
  ] as const;
}

describe('buildPortfolioAdvisorReport', () => {
  it('Empty', () => {
    const report = buildPortfolioAdvisorReport(null, null, null, null, null, null, null, null);
    expect(report.version).toBe(1);
    expect(report.summary.advisorScore).toBe(0);
    expect(report.tradePlan.maxTrades).toBe(0);
    expect(report.capitalAllocation.Cash).toBe(100);
  });

  it('Healthy', () => {
    const report = buildPortfolioAdvisorReport(...args());
    expect(['Healthy', 'Excellent', 'Improving']).toContain(report.summary.status);
    expect(report.tradePlan.maxTrades).toBe(4);
    expect(report.riskPlan.level).toBe('Low');
    expect(report.tradePlan.preferredSide).toBe('LONG');
  });

  it('Critical', () => {
    const report = buildPortfolioAdvisorReport(
      ...args({ coach: coach('Critical'), entry: entry('AVOID') }),
    );
    expect(report.summary.status).toBe('Critical');
    expect(report.tradePlan.maxTrades).toBe(0);
    expect(report.capitalAllocation.Cash).toBe(100);
    expect(report.limits.maxLeverage).toBe(0);
  });

  it('High DD increases cash and adds warning', () => {
    const report = buildPortfolioAdvisorReport(...args({ dashboard: dashboard(65) }));
    expect(report.riskPlan.level).toBe('High');
    expect(report.capitalAllocation.Cash).toBe(50);
    expect(report.warnings.some((warning) => warning.id === 'portfolio-high-drawdown')).toBe(true);
  });

  it('Poor Psychology reduces position risk', () => {
    const report = buildPortfolioAdvisorReport(...args({ psychology: psychology(40) }));
    expect(report.riskPlan.level).toBe('High');
    expect(report.tradePlan.riskPerTrade).toBeLessThanOrEqual(0.5);
    expect(report.limits.maxPositionSize).toBe(10);
  });

  it('Preferred and avoid coins', () => {
    const report = buildPortfolioAdvisorReport(...args());
    expect(report.portfolio.preferredCoins[0]).toBe('BTC');
    expect(report.portfolio.preferredCoins).toContain('SOL');
    expect(report.portfolio.avoidCoins).toContain('NEAR');
  });

  it('WAIT moves ranked coins to watch', () => {
    const report = buildPortfolioAdvisorReport(...args({ entry: entry('WAIT') }));
    expect(report.portfolio.preferredCoins).toEqual([]);
    expect(report.portfolio.watchCoins.length).toBeGreaterThan(0);
  });

  it('Allocation totals are always 100', () => {
    const report = buildPortfolioAdvisorReport(...args());
    expect(Object.values(report.capitalAllocation).reduce((sum, value) => sum + value, 0)).toBe(
      100,
    );
    expect(
      report.strategyAllocation.reduce((sum, item) => sum + item.allocationPct, 0),
    ).toBe(100);
    expect(report.capitalAllocation.BTC).toBeGreaterThan(report.capitalAllocation.SOL);
  });

  it('Trade plan and session plan', () => {
    const report = buildPortfolioAdvisorReport(...args());
    expect(report.tradePlan.targetRR).toBe('>=2');
    expect(report.tradePlan.maxDailyLoss).toBe(3);
    expect(report.sessionPlan.bestTradingHours).toEqual([9]);
    expect(report.sessionPlan.avoidHours).toEqual([22]);
  });

  it('Confidence averages existing report confidences', () => {
    const report = buildPortfolioAdvisorReport(...args());
    // Coach 80 + Entry 80 + Strategy 82 + Psychology 85 + Insight 80 = 81.4 → 81.
    expect(report.confidence).toBe(81);
  });

  it('Stable Output / deterministic', () => {
    const input = args();
    const a = buildPortfolioAdvisorReport(...input);
    const b = buildPortfolioAdvisorReport(...input);
    expect(a).toEqual(b);
  });
});

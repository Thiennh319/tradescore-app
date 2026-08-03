/**
 * Task 15.1 — Project validated PerformanceDashboardViewModel → Task14-shaped
 * stats/perf/dash for pixel-locked HT JSX (rename/copy only — no metric math).
 */

import type {
  DashboardViewModel,
  DashboardHealthLabel,
  DashboardFilterPeriod,
} from '../intelligence/dashboard/dashboardTypes';
import { DASHBOARD_VERSION, DEFAULT_DASHBOARD_FILTER } from '../intelligence/dashboard/dashboardTypes';
import { buildDashboardWidgets } from '../intelligence/dashboard/dashboardWidgets';
import type {
  PerformanceViewModel,
  PerformanceGrade,
} from '../intelligence/performance/performanceTypes';
import {
  PERFORMANCE_VERSION,
  RECOMMENDATION_VERSION,
  STATISTICS_CONSUMER_VERSION,
} from '../intelligence/performance/performanceTypes';
import type { StatisticsViewModel } from '../intelligence/statistics/statisticsTypes';
import type { PerformanceDashboardViewModel } from '../ul/adapters/performanceDashboardTypes';

function healthFromRisk(
  level: PerformanceDashboardViewModel['riskWidget']['level'],
): DashboardHealthLabel {
  switch (level) {
    case 'Low':
      return 'Excellent';
    case 'Medium':
      return 'Good';
    case 'High':
      return 'Warning';
    case 'Critical':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

function toPerfGrade(grade: string): PerformanceGrade {
  if (grade === 'A' || grade === 'B' || grade === 'C' || grade === 'D' || grade === 'F') {
    return grade;
  }
  // A+ / B+ display as letter family for Task14 grade ring typing
  if (grade === 'A+') return 'A';
  if (grade === 'B+') return 'B';
  return 'NA';
}

function emptyGroupMetrics(key = ''): StatisticsViewModel['byCoin'][number] {
  return {
    key,
    trades: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    winRate: null,
    pnlUsdt: null,
    averageRr: null,
    avgHoldingMinutes: null,
    profitFactor: null,
    expectancyUsdt: null,
    averageWinUsdt: null,
    averageLossUsdt: null,
  };
}

/**
 * Pure field projection — copies UL VM numbers into Task14 VM shapes.
 * Does not recompute win rate / PF / rankings.
 */
export function projectUlVmToTask14Shapes(
  vm: PerformanceDashboardViewModel,
  period: DashboardFilterPeriod,
): {
  stats: StatisticsViewModel;
  perf: PerformanceViewModel;
  dash: DashboardViewModel;
} {
  const s = vm.summary;
  const overviewWins = s.wins;
  const overviewLosses = s.losses;
  const breakEven = s.breakevens;

  const byDay: StatisticsViewModel['byDay'] = vm.dailyChart.data.map((d) => ({
    ...emptyGroupMetrics(d.dayKey),
    key: d.dayKey,
    period: 'day' as const,
    trades: d.trades,
    pnlUsdt: d.pnl,
  }));

  const stats: StatisticsViewModel = {
    overview: {
      totalTrades: s.totalTrades,
      wins: overviewWins,
      losses: overviewLosses,
      breakEven,
      winRate: s.winRate,
      netPnlUsdt: s.netPnl,
      grossProfitUsdt: null,
      grossLossUsdt: null,
      averageRr: s.averageRr,
      averageHoldingMinutes: s.averageHoldingTime,
    },
    profit: {
      profitFactor: s.profitFactor,
      expectancyUsdt: s.expectancy,
      averageWinUsdt: s.averageWinner,
      averageLossUsdt: s.averageLoser,
      largestWinUsdt: s.largestWin,
      largestLossUsdt: s.largestLoss,
      averageTradeUsdt: s.expectancy,
      medianTradeUsdt: null,
    },
    drawdown: {
      currentDrawdownUsdt: s.currentDrawdown,
      maxDrawdownUsdt: s.maxDrawdown,
      recoveryFactor: s.recoveryFactor,
      longestLosingStreak: vm.patterns.losingStreak,
      longestWinningStreak: vm.patterns.winningStreak,
    },
    byCoin: vm.coinPerformance.rows.map((r) => ({
      key: r.symbol,
      trades: r.trades,
      wins: r.wins,
      losses: r.losses,
      breakevens: Math.max(0, r.trades - r.wins - r.losses),
      winRate: r.winRate,
      pnlUsdt: r.totalPnl,
      averageRr: r.averageRr,
      avgHoldingMinutes: null,
      profitFactor: null,
      expectancyUsdt: r.expectancy,
      averageWinUsdt: null,
      averageLossUsdt: null,
    })),
    byStrategy: [],
    byTrigger: [],
    byConfidence: [],
    byAdvisor: [],
    byTag: [],
    byTagCombo: [],
    byDay,
    byWeek: [],
    byMonth: [],
    bySessionZone: [],
    bySessionType: [],
    byFunding: [],
    byWhale: [],
    sampleSize: s.totalTrades,
    projectionFingerprint: vm.fingerprint,
    cancelledCount: 0,
  };

  const coinRanking = vm.coinPerformance.rows.map((r) => ({
    rank: r.rank,
    key: r.symbol,
    score: r.score,
    winRate: r.winRate,
    profitFactor: null,
    expectancyUsdt: r.expectancy,
    averageRr: r.averageRr,
    pnlUsdt: r.totalPnl,
    trades: r.trades,
    avgHoldingMinutes: null,
  }));

  const perf: PerformanceViewModel = {
    overall: {
      overallScore: s.performanceScore,
      overallRank: s.grade,
      overallGrade: toPerfGrade(s.grade),
      systemStability: s.stabilityScore,
      consistency: s.consistencyScore,
      growthTrend: 'NA',
    },
    strategyRanking: [],
    coinRanking,
    triggerRanking: [],
    confidenceAnalysis: [],
    advisorRanking: [],
    tagIntelligence: {
      topWinningTags: [],
      topLosingTags: [],
      bestTagCombination: null,
      worstTagCombination: null,
    },
    trends: [],
    recommendations: vm.recommendationPanel.items.map((item) => ({
      id: item.id,
      action: 'MONITOR' as const,
      target: item.target,
      reason: item.reason,
      evidenceIds: [],
      evidence: [...item.evidence],
    })),
    comparisons: [],
    snapshot: {
      performanceVersion: PERFORMANCE_VERSION,
      statisticsVersion: STATISTICS_CONSUMER_VERSION,
      recommendationVersion: RECOMMENDATION_VERSION,
      projectionFingerprint: vm.fingerprint,
      statisticsFingerprint: vm.fingerprint,
      generatedAt: vm.generatedAt,
    },
  };

  const systemHealth = healthFromRisk(vm.riskWidget.level);
  const dash: DashboardViewModel = {
    tradingSummary: {
      overallGrade: s.grade,
      overallScore: s.performanceScore,
      systemHealth,
      tradingStatus:
        s.totalTrades === 0 ? 'IDLE' : vm.riskWidget.level === 'Critical' ? 'CAUTION' : 'ACTIVE',
      generatedAt: vm.generatedAt || '',
    },
    todayPerformance: {
      todayTrades: null,
      todayWinrate: null,
      todayNetPnl: null,
      todayRr: null,
      todayBestCoin: null,
      todayWorstCoin: null,
      sourceWindow: 'ul',
    },
    systemHealth,
    topPicks: {
      topStrategy: vm.patterns.bestStrategy,
      topCoin: vm.coinPerformance.bestCoin,
      topTrigger: null,
      topConfidence: null,
      topAdvisor: null,
      topTag: null,
    },
    riskMonitor: {
      currentDrawdownLabel:
        s.currentDrawdown != null ? `DD=${s.currentDrawdown}` : null,
      recoveryTrend: null,
      largestLosingStreakLabel: `streak=${vm.patterns.losingStreak}`,
      riskLevel: vm.riskWidget.level,
      stability: s.stabilityScore,
      consistency: s.consistencyScore,
    },
    recommendationPanel: {
      items: vm.recommendationPanel.items.map((item) => ({
        id: item.id,
        action: item.action,
        target: item.target,
        reason: item.reason,
        evidence: [...item.evidence],
      })),
      recommendationVersion: RECOMMENDATION_VERSION,
    },
    recentTrends: [],
    activeInsights: vm.insightCards.map((c) => c.title),
    quickStatistics: {
      trades: s.totalTrades,
      winrate: s.winRate,
      profitFactor: s.profitFactor,
      expectancy: s.expectancy,
      averageRr: s.averageRr,
      holdingTime: s.averageHoldingTime,
      sourceKey: 'ul',
    },
    filter: { ...DEFAULT_DASHBOARD_FILTER, period },
    widgets: buildDashboardWidgets(),
    snapshot: {
      dashboardVersion: DASHBOARD_VERSION,
      performanceVersion: PERFORMANCE_VERSION,
      statisticsVersion: STATISTICS_CONSUMER_VERSION,
      recommendationVersion: RECOMMENDATION_VERSION,
      projectionFingerprint: vm.fingerprint,
      performanceFingerprint: vm.fingerprint,
      generatedAt: vm.generatedAt || '',
    },
  };

  return { stats, perf, dash };
}

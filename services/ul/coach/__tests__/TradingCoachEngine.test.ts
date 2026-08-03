/**
 * Task 15.8 — Trading Coach Engine tests.
 */
import { describe, expect, it } from 'vitest';
import type { ULCompareReport } from '../../compare/ULCompareTypes';
import type { EntryQualityReport } from '../../entry/EntryQualityTypes';
import type { TradingInsightReport } from '../../insight/TradingInsightTypes';
import type { TradingPsychologyReport } from '../../psychology/TradingPsychologyTypes';
import type { TradingRecommendationReport } from '../../recommendation/TradingRecommendationTypes';
import type { StrategyAnalyticsReport } from '../../strategy/StrategyAnalyticsTypes';
import type { ULDashboardData } from '../../types';
import { buildTradingCoachReport, coachGradeFromScore } from '../index';

function dash(score = 80): ULDashboardData {
  return {
    metrics: { performanceScore: score },
    score: { performanceScore: score },
  } as ULDashboardData;
}

function insight(partial?: Partial<TradingInsightReport>): TradingInsightReport {
  return {
    version: 1,
    summary: {
      headline: 'ok',
      insightCount: 1,
      strengthCount: 0,
      weaknessCount: 1,
      opportunityCount: 0,
      warningCount: 0,
      topSeverity: 'MEDIUM',
    },
    insights: [
      {
        id: 'ti-rr-low',
        title: 'RR below target',
        description: 'avg RR soft',
        category: 'Execution',
        severity: 'HIGH',
        confidence: 80,
        evidence: ['avgRr'],
        recommendation: 'Raise RR',
      },
    ],
    strengths: [],
    weaknesses: [],
    opportunities: [],
    warnings: [],
    ...partial,
  };
}

function recs(partial?: Partial<TradingRecommendationReport>): TradingRecommendationReport {
  const r = {
    id: 'tr-rr',
    title: 'Enforce minimum RR',
    description: 'Raise planned RR',
    reason: 'RR below target',
    priority: 'HIGH' as const,
    confidence: 80,
    impact: 'HIGH' as const,
    effort: 'EASY' as const,
    expectedBenefit: 'Discipline' as const,
    category: 'Execution' as const,
    action: 'Avoid low RR entries',
    evidence: ['avgRr'],
    sourceInsightIds: ['ti-rr-low'],
  };
  return {
    version: 1,
    summary: {
      headline: r.title,
      total: 1,
      criticalCount: 0,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0,
    },
    recommendations: [r],
    critical: [],
    high: [r],
    medium: [],
    low: [],
    ...partial,
  };
}

function psyHealthy(): TradingPsychologyReport {
  return {
    version: 1,
    summary: {
      headline: 'Healthy',
      findingCount: 1,
      strengthCount: 1,
      weaknessCount: 0,
      warningCount: 0,
      habitCount: 1,
      topSeverity: 'INFO',
    },
    score: 85,
    grade: 'A',
    traits: [{ id: 'Discipline', score: 88, label: 'Discipline' }],
    strengths: [],
    weaknesses: [],
    warnings: [],
    habits: [],
    findings: [
      {
        id: 'psy-healthy',
        title: 'Healthy habit',
        description: 'ok',
        severity: 'INFO',
        confidence: 70,
        psychologyType: 'Healthy Habit',
        evidence: [],
        habit: 'Follow plan',
        improvement: 'Keep plan',
      },
    ],
  };
}

function psyRevenge(): TradingPsychologyReport {
  return {
    version: 1,
    summary: {
      headline: 'Revenge',
      findingCount: 1,
      strengthCount: 0,
      weaknessCount: 0,
      warningCount: 1,
      habitCount: 0,
      topSeverity: 'HIGH',
    },
    score: 40,
    grade: 'D',
    traits: [{ id: 'Emotional Control', score: 30, label: 'Emotional Control' }],
    strengths: [],
    weaknesses: [],
    warnings: [
      {
        id: 'psy-revenge',
        title: 'Revenge trading pressure',
        description: 'after losses',
        severity: 'HIGH',
        confidence: 85,
        psychologyType: 'Revenge Trading',
        evidence: ['ti-lose-streak'],
        habit: 'Chase after losses',
        improvement: 'Hard stop after 2 losses',
      },
    ],
    habits: [],
    findings: [
      {
        id: 'psy-revenge',
        title: 'Revenge trading pressure',
        description: 'after losses',
        severity: 'HIGH',
        confidence: 85,
        psychologyType: 'Revenge Trading',
        evidence: ['ti-lose-streak'],
        habit: 'Chase after losses',
        improvement: 'Hard stop after 2 losses',
      },
    ],
  };
}

function strategyStrong(): StrategyAnalyticsReport {
  const row = {
    id: 's-v4',
    name: 'V4',
    tradeCount: 20,
    winRate: 60,
    profitFactor: 2.1,
    expectancy: 12,
    averageRR: 2.2,
    netPnL: 200,
    largestWin: 50,
    largestLoss: -20,
    maxDrawdown: 30,
    recoveryFactor: 2,
    consistency: 70,
    performance: 80,
    stability: 75,
    confidence: 80,
    score: 88,
    grade: 'A' as const,
    status: 'Excellent' as const,
    lifecycle: 'Stable' as const,
    recommendation: 'Keep',
    tags: ['Best Strategy' as const, 'Stable Strategy' as const],
  };
  return {
    version: 1,
    summary: {
      strategyCount: 1,
      totalTrades: 20,
      headline: 'V4',
      bestStrategyId: 's-v4',
      worstStrategyId: null,
    },
    strategies: [row],
    ranking: [{ rank: 1, strategyId: 's-v4', name: 'V4', score: 88, profitFactor: 2.1, expectancy: 12, tradeCount: 20 }],
    bestStrategy: row,
    worstStrategy: null,
    heatmap: { hour: [], weekday: [], market: [], coin: [] },
    lifecycle: [{ strategyId: 's-v4', lifecycle: 'Stable' }],
    confidence: 80,
  };
}

function strategyWeak(): StrategyAnalyticsReport {
  const row = {
    id: 's-dead',
    name: 'DEAD',
    tradeCount: 8,
    winRate: 20,
    profitFactor: 0.4,
    expectancy: -10,
    averageRR: 1,
    netPnL: -80,
    largestWin: 10,
    largestLoss: -40,
    maxDrawdown: 90,
    recoveryFactor: null,
    consistency: 20,
    performance: 15,
    stability: 10,
    confidence: 40,
    score: 25,
    grade: 'F' as const,
    status: 'Weak' as const,
    lifecycle: 'Declining' as const,
    recommendation: 'Pause',
    tags: ['Declining Strategy' as const, 'Worst Strategy' as const],
  };
  return {
    version: 1,
    summary: {
      strategyCount: 1,
      totalTrades: 8,
      headline: 'DEAD',
      bestStrategyId: 's-dead',
      worstStrategyId: 's-dead',
    },
    strategies: [row],
    ranking: [{ rank: 1, strategyId: 's-dead', name: 'DEAD', score: 25, profitFactor: 0.4, expectancy: -10, tradeCount: 8 }],
    bestStrategy: row,
    worstStrategy: row,
    heatmap: { hour: [], weekday: [], market: [], coin: [] },
    lifecycle: [{ strategyId: 's-dead', lifecycle: 'Declining' }],
    confidence: 40,
  };
}

function entryOk(): EntryQualityReport {
  return {
    version: 1,
    summary: {
      headline: 'ENTER',
      checkCount: 2,
      passCount: 2,
      warnCount: 0,
      failCount: 0,
      blockerCount: 0,
      topDetection: null,
    },
    score: 85,
    grade: 'A',
    confidence: 80,
    decision: 'ENTER',
    strengths: ['Trend Direction'],
    weaknesses: [],
    passedChecks: [
      {
        id: 'trend_direction',
        title: 'Trend Direction',
        status: 'PASS',
        weight: 8,
        pillar: 'Trend',
        reason: 'ok',
        recommendation: 'ok',
      },
    ],
    failedChecks: [],
    blockedReasons: [],
    recommendations: [],
    pillars: [],
    checks: [
      {
        id: 'trend_direction',
        title: 'Trend Direction',
        status: 'PASS',
        weight: 8,
        pillar: 'Trend',
        reason: 'ok',
        recommendation: 'ok',
      },
      {
        id: 'volume_confirmation',
        title: 'Volume Confirmation',
        status: 'PASS',
        weight: 7,
        pillar: 'Volume',
        reason: 'ok',
        recommendation: 'ok',
      },
      {
        id: 'whale_wall',
        title: 'Whale Wall',
        status: 'PASS',
        weight: 4,
        pillar: 'Context',
        reason: 'ok',
        recommendation: 'ok',
      },
      {
        id: 'funding',
        title: 'Funding',
        status: 'PASS',
        weight: 4,
        pillar: 'Context',
        reason: 'ok',
        recommendation: 'ok',
      },
      {
        id: 'risk_reward',
        title: 'Risk Reward',
        status: 'PASS',
        weight: 6,
        pillar: 'Risk',
        reason: 'ok',
        recommendation: 'ok',
      },
      {
        id: 'rulebook_gate',
        title: 'RuleBook Gate',
        status: 'PASS',
        weight: 5,
        pillar: 'Execution',
        reason: 'ok',
        recommendation: 'ok',
      },
    ],
    detections: [],
    evidence: [],
  };
}

function entryPoorRr(): EntryQualityReport {
  const base = entryOk();
  return {
    ...base,
    score: 55,
    grade: 'C',
    decision: 'WAIT',
    confidence: 60,
    detections: ['Poor RR'],
    failedChecks: [
      {
        id: 'risk_reward',
        title: 'Risk Reward',
        status: 'FAIL',
        weight: 6,
        pillar: 'Risk',
        reason: 'RR low',
        recommendation: 'WAIT until RR meets minimum',
      },
    ],
    recommendations: ['WAIT until RR meets minimum'],
    checks: base.checks.map((c) =>
      c.id === 'risk_reward'
        ? {
            ...c,
            status: 'FAIL' as const,
            reason: 'RR low',
            recommendation: 'WAIT until RR meets minimum',
          }
        : c,
    ),
  };
}

function compareImproving(): ULCompareReport {
  return {
    version: 1,
    current: {} as ULCompareReport['current'],
    previous: {} as ULCompareReport['previous'],
    rows: [],
    summary: { improvedCount: 5, worsenedCount: 1, flatCount: 2, headline: 'Improving' },
    highlights: [],
  };
}

describe('buildTradingCoachReport', () => {
  it('Empty', () => {
    const report = buildTradingCoachReport(null, null, null, null, null, null, null);
    expect(report.version).toBe(1);
    expect(report.confidence).toBe(0);
    expect(report.actionPlan).toEqual([]);
  });

  it('Healthy trader', () => {
    const report = buildTradingCoachReport(
      dash(88),
      compareImproving(),
      insight({
        insights: [
          {
            id: 'ti-ok',
            title: 'Stable',
            description: 'ok',
            category: 'Performance',
            severity: 'INFO',
            confidence: 70,
            evidence: [],
            recommendation: 'Keep',
          },
        ],
      }),
      {
        version: 1,
        summary: { headline: 'none', total: 0, criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0 },
        recommendations: [],
        critical: [],
        high: [],
        medium: [],
        low: [],
      },
      psyHealthy(),
      strategyStrong(),
      entryOk(),
    );
    expect(['Excellent', 'Healthy', 'Improving', 'Neutral']).toContain(report.summary.overallStatus);
    expect(report.dailyFocus.length).toBeGreaterThan(0);
    expect(report.dailyFocus.length).toBeLessThanOrEqual(3);
    expect(report.nextSessionChecklist.length).toBe(6);
    expect(coachGradeFromScore(report.summary.coachScore)).toBe(report.summary.grade);
  });

  it('Risk trader / revenge trading', () => {
    const report = buildTradingCoachReport(
      dash(35),
      null,
      insight(),
      recs(),
      psyRevenge(),
      strategyWeak(),
      entryPoorRr(),
    );
    expect(['Warning', 'Critical']).toContain(report.summary.overallStatus);
    expect(report.coachMessages.some((m) => /consecutive losses/i.test(m.text))).toBe(true);
    expect(report.dailyFocus).toContain('Protect Capital');
  });

  it('Poor RR', () => {
    const report = buildTradingCoachReport(dash(50), null, insight(), recs(), psyHealthy(), strategyStrong(), entryPoorRr());
    expect(report.dailyFocus.some((f) => /RR/i.test(f))).toBe(true);
    expect(report.actionPlan.some((a) => /RR/i.test(a.title) || /RR/i.test(a.description))).toBe(true);
    expect(report.evidence.some((e) => e.id === 'ti-rr-low' || e.id === 'risk_reward')).toBe(true);
  });

  it('Weak strategy', () => {
    const report = buildTradingCoachReport(dash(40), null, null, null, psyHealthy(), strategyWeak(), entryOk());
    expect(report.topPriorities.some((p) => /weak strategy/i.test(p.title))).toBe(true);
    expect(report.coachMessages.some((m) => /strongest strategy/i.test(m.text))).toBe(true);
  });

  it('Strong strategy', () => {
    const report = buildTradingCoachReport(dash(85), null, null, null, psyHealthy(), strategyStrong(), entryOk());
    expect(report.dailyFocus.some((f) => /V4/i.test(f))).toBe(true);
    expect(report.coachMessages.some((m) => /leading strategy/i.test(m.text))).toBe(true);
  });

  it('Mixed', () => {
    const report = buildTradingCoachReport(
      dash(60),
      compareImproving(),
      insight(),
      recs(),
      psyRevenge(),
      strategyStrong(),
      entryPoorRr(),
    );
    expect(report.topPriorities[0]!.priority).toMatch(/CRITICAL|HIGH/);
    expect(report.weeklyGoals.length).toBeGreaterThan(0);
    expect(report.weeklyGoals.length).toBeLessThanOrEqual(5);
    expect(report.confidence).toBeGreaterThan(0);
  });

  it('Stable + deterministic', () => {
    const args = [
      dash(70),
      compareImproving(),
      insight(),
      recs(),
      psyRevenge(),
      strategyStrong(),
      entryPoorRr(),
    ] as const;
    const a = buildTradingCoachReport(...args);
    const b = buildTradingCoachReport(...args);
    expect(a).toEqual(b);
  });

  it('Priorities sorted Critical→Low', () => {
    const report = buildTradingCoachReport(
      dash(40),
      null,
      insight(),
      {
        version: 1,
        summary: { headline: 'x', total: 2, criticalCount: 1, highCount: 1, mediumCount: 0, lowCount: 0, infoCount: 0 },
        recommendations: [
          {
            id: 'tr-low',
            title: 'Low item',
            description: 'd',
            reason: 'r',
            priority: 'LOW',
            confidence: 50,
            impact: 'LOW',
            effort: 'EASY',
            expectedBenefit: 'Consistency',
            category: 'Execution',
            action: 'Note timing',
            evidence: [],
            sourceInsightIds: [],
          },
          {
            id: 'tr-crit',
            title: 'Critical risk',
            description: 'd',
            reason: 'r',
            priority: 'CRITICAL',
            confidence: 90,
            impact: 'HIGH',
            effort: 'MEDIUM',
            expectedBenefit: 'Risk',
            category: 'Risk',
            action: 'Reduce position size',
            evidence: [],
            sourceInsightIds: ['ti-risk-elevated'],
          },
        ],
        critical: [],
        high: [],
        medium: [],
        low: [],
      },
      psyHealthy(),
      null,
      entryOk(),
    );
    expect(report.topPriorities[0]!.priority).toBe('CRITICAL');
  });

  it('Evidence references only existing ids', () => {
    const report = buildTradingCoachReport(dash(50), null, insight(), recs(), psyRevenge(), strategyStrong(), entryPoorRr());
    for (const e of report.evidence) {
      expect(e.id).toBeTruthy();
      expect(e.kind).toMatch(/insight|recommendation|psychology|strategy|entry/);
    }
  });
});

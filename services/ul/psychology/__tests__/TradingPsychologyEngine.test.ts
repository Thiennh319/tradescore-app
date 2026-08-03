/**
 * Task 15.5 — Trading Psychology Engine tests.
 */
import { describe, expect, it } from 'vitest';
import { buildULDashboard } from '../../ULAnalyticsEngine';
import { buildTradingInsightReport } from '../../insight';
import type { TradingInsight, TradingInsightReport } from '../../insight/TradingInsightTypes';
import { TRADING_INSIGHT_VERSION } from '../../insight/TradingInsightTypes';
import { buildTradingRecommendationReport } from '../../recommendation';
import type { ULTradeInput } from '../../types';
import {
  TRADING_PSYCHOLOGY_SEVERITY_RANK,
  buildTradingPsychologyReport,
  psychologyGradeFromScore,
} from '../index';

function trade(
  partial: Partial<ULTradeInput> & Pick<ULTradeInput, 'pnl' | 'closedAt'>,
): ULTradeInput {
  return {
    id: partial.id ?? `t-${partial.closedAt}`,
    symbol: partial.symbol ?? 'BTCUSDT',
    side: 'LONG',
    entry: 100,
    exit: 110,
    pnl: partial.pnl,
    rr: partial.rr ?? 2,
    duration: partial.duration ?? 60,
    strategy: 'V4',
    openedAt: partial.closedAt - 3_600_000,
    closedAt: partial.closedAt,
    reasonOpen: 'E',
    reasonClose: 'X',
  };
}

function insight(partial: Partial<TradingInsight> & Pick<TradingInsight, 'id' | 'title'>): TradingInsight {
  return {
    description: partial.description ?? partial.title,
    category: partial.category ?? 'Psychology',
    severity: partial.severity ?? 'HIGH',
    confidence: partial.confidence ?? 80,
    evidence: partial.evidence ?? ['e'],
    recommendation: partial.recommendation ?? 'Improve',
    ...partial,
  };
}

function ir(insights: TradingInsight[]): TradingInsightReport {
  return {
    version: TRADING_INSIGHT_VERSION,
    summary: {
      headline: insights[0]?.title ?? '',
      insightCount: insights.length,
      strengthCount: 0,
      weaknessCount: 0,
      opportunityCount: 0,
      warningCount: 0,
      topSeverity: insights[0]?.severity ?? null,
    },
    insights,
    strengths: [],
    weaknesses: [],
    opportunities: [],
    warnings: [],
  };
}

describe('buildTradingPsychologyReport', () => {
  it('Empty', () => {
    const report = buildTradingPsychologyReport(null, null, null);
    expect(report.version).toBe(1);
    expect(report.findings.length).toBe(0);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.grade).toBe(psychologyGradeFromScore(report.score));
  });

  it('Empty dashboard sample', () => {
    const dash = buildULDashboard([], { generatedAt: 'e', bypassCache: true });
    const report = buildTradingPsychologyReport(dash, ir([]), null);
    expect(report.findings.some((f) => f.id === 'psy-empty')).toBe(true);
  });

  it('Healthy trader', () => {
    const trades = Array.from({ length: 6 }, (_, i) =>
      trade({ pnl: i === 5 ? -5 : 12, closedAt: i + 1, rr: 2.2 }),
    );
    const dash = buildULDashboard(trades, { generatedAt: 'h', bypassCache: true });
    const insights = buildTradingInsightReport(dash, null);
    const recs = buildTradingRecommendationReport(insights, dash);
    const report = buildTradingPsychologyReport(dash, insights, recs);
    expect(report.traits).toHaveLength(7);
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']).toContain(report.grade);
  });

  it('Over trader', () => {
    const trades = Array.from({ length: 14 }, (_, i) =>
      trade({ pnl: -3, closedAt: i + 1 }),
    );
    const dash = buildULDashboard(trades, { generatedAt: 'o', bypassCache: true });
    const report = buildTradingPsychologyReport(dash, ir([]), null);
    expect(report.findings.some((f) => f.psychologyType === 'Over Trading')).toBe(true);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('Revenge trader', () => {
    const report = buildTradingPsychologyReport(
      buildULDashboard([trade({ pnl: -10, closedAt: 1 })], { generatedAt: 'r', bypassCache: true }),
      ir([
        insight({
          id: 'ti-lose-streak',
          title: 'Losing streak pressure',
          severity: 'HIGH',
          confidence: 90,
        }),
      ]),
      null,
    );
    expect(report.findings.some((f) => f.psychologyType === 'Revenge Trading')).toBe(true);
    const emo = report.traits.find((t) => t.id === 'Emotional Control')!;
    expect(emo.score).toBeLessThan(70);
  });

  it('High DD', () => {
    const report = buildTradingPsychologyReport(
      buildULDashboard(
        Array.from({ length: 8 }, (_, i) => trade({ pnl: i < 6 ? -25 : 5, closedAt: i + 1 })),
        { generatedAt: 'dd', bypassCache: true },
      ),
      ir([insight({ id: 'ti-risk-elevated', title: 'Elevated risk level', severity: 'HIGH' })]),
      null,
    );
    expect(
      report.findings.some((f) => f.psychologyType === 'Large Drawdown Behavior'),
    ).toBe(true);
  });

  it('Low RR', () => {
    const report = buildTradingPsychologyReport(
      buildULDashboard(
        Array.from({ length: 5 }, (_, i) => trade({ pnl: 1, closedAt: i + 1, rr: 0.8 })),
        { generatedAt: 'rr', bypassCache: true },
      ),
      ir([insight({ id: 'ti-rr-low', title: 'Average RR below target', severity: 'HIGH' })]),
      null,
    );
    expect(report.findings.some((f) => f.psychologyType === 'Poor RR Discipline')).toBe(true);
  });

  it('FOMO', () => {
    const report = buildTradingPsychologyReport(
      null,
      ir([
        insight({
          id: 'ti-exp-fall',
          title: 'Expectancy falling',
          severity: 'HIGH',
          confidence: 85,
        }),
      ]),
      null,
    );
    expect(report.findings.some((f) => f.psychologyType === 'FOMO')).toBe(true);
  });

  it('Mixed + stable', () => {
    const dash = buildULDashboard(
      [
        trade({ symbol: 'BTCUSDT', pnl: 20, closedAt: 1 }),
        trade({ symbol: 'BTCUSDT', pnl: 10, closedAt: 2 }),
        trade({ symbol: 'SOLUSDT', pnl: -15, closedAt: 3 }),
        trade({ symbol: 'SOLUSDT', pnl: -10, closedAt: 4 }),
        trade({ pnl: -5, closedAt: Date.UTC(2026, 6, 10, 22, 0, 0), duration: 300, rr: 0.9 }),
      ],
      { generatedAt: 'm', bypassCache: true },
    );
    const insights = buildTradingInsightReport(dash, null);
    const recs = buildTradingRecommendationReport(insights, dash);
    const a = buildTradingPsychologyReport(dash, insights, recs);
    const b = buildTradingPsychologyReport(dash, insights, recs);
    expect(a).toEqual(b);
    expect(a.findings.length).toBeGreaterThan(0);
    for (let i = 1; i < a.findings.length; i += 1) {
      const x = a.findings[i - 1]!;
      const y = a.findings[i]!;
      const rx = TRADING_PSYCHOLOGY_SEVERITY_RANK[x.severity];
      const ry = TRADING_PSYCHOLOGY_SEVERITY_RANK[y.severity];
      expect(ry).toBeGreaterThanOrEqual(rx);
    }
  });

  it('Finding shape', () => {
    const report = buildTradingPsychologyReport(
      null,
      ir([insight({ id: 'ti-hold-long', title: 'Holding too long', severity: 'MEDIUM' })]),
      null,
    );
    const f = report.findings[0]!;
    expect(f.id).toBeTruthy();
    expect(f.title).toBeTruthy();
    expect(f.psychologyType).toBe('Holding Too Long');
    expect(f.habit).toBeTruthy();
    expect(f.improvement).toBeTruthy();
    expect(Array.isArray(f.evidence)).toBe(true);
  });
});

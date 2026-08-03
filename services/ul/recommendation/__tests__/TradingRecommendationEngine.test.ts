/**
 * Task 15.4 — Trading Recommendation Engine tests.
 */
import { describe, expect, it } from 'vitest';
import { buildULDashboard } from '../../ULAnalyticsEngine';
import { buildTradingInsightReport } from '../../insight';
import type { TradingInsight, TradingInsightReport } from '../../insight/TradingInsightTypes';
import { TRADING_INSIGHT_VERSION } from '../../insight/TradingInsightTypes';
import type { ULTradeInput } from '../../types';
import {
  TRADING_RECOMMENDATION_IMPACT_RANK,
  TRADING_RECOMMENDATION_PRIORITY_RANK,
  buildTradingRecommendationReport,
} from '../index';

function trade(
  partial: Partial<ULTradeInput> & Pick<ULTradeInput, 'pnl' | 'closedAt'>,
): ULTradeInput {
  return {
    id: partial.id ?? `t-${partial.closedAt}`,
    symbol: partial.symbol ?? 'BTCUSDT',
    side: partial.side ?? 'LONG',
    entry: 100,
    exit: 110,
    pnl: partial.pnl,
    rr: partial.rr ?? 2,
    duration: partial.duration ?? 60,
    strategy: partial.strategy ?? 'V4',
    openedAt: partial.closedAt - 3_600_000,
    closedAt: partial.closedAt,
    reasonOpen: 'E',
    reasonClose: 'X',
  };
}

function insight(partial: Partial<TradingInsight> & Pick<TradingInsight, 'id' | 'title'>): TradingInsight {
  return {
    description: partial.description ?? partial.title,
    category: partial.category ?? 'Performance',
    severity: partial.severity ?? 'HIGH',
    confidence: partial.confidence ?? 80,
    evidence: partial.evidence ?? ['e1'],
    recommendation: partial.recommendation ?? 'Do something',
    ...partial,
  };
}

function insightReport(insights: TradingInsight[]): TradingInsightReport {
  return {
    version: TRADING_INSIGHT_VERSION,
    summary: {
      headline: insights[0]?.title ?? 'none',
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

describe('buildTradingRecommendationReport', () => {
  it('Empty', () => {
    const report = buildTradingRecommendationReport(null, null);
    expect(report.version).toBe(1);
    expect(report.recommendations).toEqual([]);
    expect(report.summary.total).toBe(0);
  });

  it('Empty insights list', () => {
    const report = buildTradingRecommendationReport(insightReport([]), null);
    expect(report.recommendations).toEqual([]);
  });

  it('Single recommendation — RR insight', () => {
    const ir = insightReport([
      insight({
        id: 'ti-rr-low',
        title: 'Average RR below target',
        category: 'Strategy',
        severity: 'HIGH',
        confidence: 84,
      }),
    ]);
    const report = buildTradingRecommendationReport(ir, null);
    expect(report.recommendations).toHaveLength(1);
    expect(report.recommendations[0]!.action).toBe('Increase minimum RR to 2.0');
    expect(report.recommendations[0]!.priority).toBe('HIGH');
    expect(report.recommendations[0]!.expectedBenefit).toBe('Expectancy');
    expect(report.high).toHaveLength(1);
  });

  it('Multiple priorities + sorting', () => {
    const ir = insightReport([
      insight({ id: 'ti-consistency-high', title: 'Consistency solid', severity: 'LOW', confidence: 70 }),
      insight({ id: 'ti-all-losses', title: 'All losing sample', severity: 'CRITICAL', confidence: 95 }),
      insight({ id: 'ti-rr-low', title: 'Average RR below target', severity: 'HIGH', confidence: 84 }),
      insight({ id: 'ti-hold-long', title: 'Holding too long', severity: 'MEDIUM', confidence: 74 }),
    ]);
    const report = buildTradingRecommendationReport(ir, null);
    expect(report.recommendations.length).toBeGreaterThanOrEqual(4);
    expect(report.recommendations[0]!.priority).toBe('CRITICAL');
    for (let i = 1; i < report.recommendations.length; i += 1) {
      const a = report.recommendations[i - 1]!;
      const b = report.recommendations[i]!;
      const pa = TRADING_RECOMMENDATION_PRIORITY_RANK[a.priority];
      const pb = TRADING_RECOMMENDATION_PRIORITY_RANK[b.priority];
      expect(pb).toBeGreaterThanOrEqual(pa);
      if (pa === pb) {
        expect(b.confidence).toBeLessThanOrEqual(a.confidence);
        if (b.confidence === a.confidence) {
          const ia = TRADING_RECOMMENDATION_IMPACT_RANK[a.impact];
          const ib = TRADING_RECOMMENDATION_IMPACT_RANK[b.impact];
          expect(ib).toBeGreaterThanOrEqual(ia);
        }
      }
    }
  });

  it('Confidence copied from insight', () => {
    const ir = insightReport([
      insight({ id: 'ti-wr-up', title: 'Win Rate increased', confidence: 92, severity: 'HIGH' }),
    ]);
    const report = buildTradingRecommendationReport(ir, null);
    expect(report.recommendations[0]!.confidence).toBe(92);
  });

  it('Impact and effort present', () => {
    const ir = insightReport([
      insight({ id: 'ti-risk-elevated', title: 'Elevated risk level', severity: 'HIGH' }),
    ]);
    const report = buildTradingRecommendationReport(ir, null);
    const rec = report.recommendations[0]!;
    expect(rec.impact).toBe('HIGH');
    expect(rec.effort).toBe('EASY');
    expect(rec.action).toBe('Reduce position size by 30%');
  });

  it('Expected benefit set', () => {
    const ir = insightReport([
      insight({ id: 'ti-timing-worst-hour', title: 'Trading after 22:00 losing', severity: 'HIGH' }),
    ]);
    const report = buildTradingRecommendationReport(ir, null);
    expect(report.recommendations[0]!.expectedBenefit).toBe('Win Rate');
    expect(report.recommendations[0]!.action).toContain('22:00');
  });

  it('Duplicate removal by action', () => {
    const ir = insightReport([
      insight({ id: 'ti-rr-low', title: 'Average RR below target', severity: 'HIGH', confidence: 80 }),
      insight({
        id: 'ti-rr-low',
        title: 'Average RR below target',
        severity: 'MEDIUM',
        confidence: 60,
      }),
    ]);
    const report = buildTradingRecommendationReport(ir, null);
    expect(report.recommendations).toHaveLength(1);
    expect(report.recommendations[0]!.priority).toBe('HIGH');
  });

  it('Stable output', () => {
    const ir = insightReport([
      insight({ id: 'ti-coin-gap', title: 'BTC outperforming SOL', category: 'Coin', severity: 'HIGH' }),
      insight({ id: 'ti-hold-long', title: 'Holding too long', category: 'Execution', severity: 'MEDIUM' }),
    ]);
    const dash = buildULDashboard(
      [
        trade({ symbol: 'BTCUSDT', pnl: 40, closedAt: 1 }),
        trade({ symbol: 'BTCUSDT', pnl: 20, closedAt: 2 }),
        trade({ symbol: 'SOLUSDT', pnl: -25, closedAt: 3 }),
        trade({ symbol: 'SOLUSDT', pnl: -15, closedAt: 4 }),
      ],
      { generatedAt: 't', bypassCache: true },
    );
    const a = buildTradingRecommendationReport(ir, dash);
    const b = buildTradingRecommendationReport(ir, dash);
    expect(a).toEqual(b);
    expect(a.recommendations.some((r) => r.action.includes('BTC') || r.title.includes('BTC'))).toBe(
      true,
    );
  });

  it('End-to-end from live insight engine', () => {
    const dash = buildULDashboard(
      Array.from({ length: 6 }, (_, i) =>
        trade({ pnl: i % 2 === 0 ? 5 : -4, closedAt: i + 1, rr: 0.9 }),
      ),
      { generatedAt: 'e2e', bypassCache: true },
    );
    const insights = buildTradingInsightReport(dash, null);
    const report = buildTradingRecommendationReport(insights, dash);
    expect(report.version).toBe(1);
    if (insights.insights.some((i) => i.id === 'ti-rr-low')) {
      expect(report.recommendations.some((r) => r.id === 'tr-min-rr-2')).toBe(true);
    }
    for (const r of report.recommendations) {
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.action).toBeTruthy();
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.sourceInsightIds.length).toBeGreaterThan(0);
    }
  });

  it('Buckets critical/high/medium/low', () => {
    const ir = insightReport([
      insight({ id: 'ti-all-losses', title: 'All losing', severity: 'CRITICAL' }),
      insight({ id: 'ti-rr-low', title: 'RR low', severity: 'HIGH' }),
      insight({ id: 'ti-hold-long', title: 'Hold long', severity: 'MEDIUM' }),
      insight({ id: 'ti-consistency-high', title: 'Consistency', severity: 'LOW' }),
    ]);
    const report = buildTradingRecommendationReport(ir, null);
    expect(report.critical.length).toBe(1);
    expect(report.high.length).toBe(1);
    expect(report.medium.length).toBe(1);
    expect(report.low.length).toBeGreaterThanOrEqual(1);
    expect(report.summary.criticalCount).toBe(1);
  });
});

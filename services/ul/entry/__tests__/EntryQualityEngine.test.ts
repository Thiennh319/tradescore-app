/**
 * Task 15.7 — Entry Quality Engine tests.
 */
import { describe, expect, it } from 'vitest';
import type { ULDashboardData } from '../../types';
import {
  buildEntryQualityReport,
  entryQualityGradeFromScore,
  ENTRY_QUALITY_PILLAR_WEIGHTS,
} from '../index';
import type {
  EntryQualityEntryDecisionInput,
  EntryQualityMarketSnapshot,
  EntryQualityRuleBookView,
} from '../EntryQualityTypes';

function perfectMarket(side: 'LONG' | 'SHORT' = 'LONG'): EntryQualityMarketSnapshot {
  if (side === 'LONG') {
    return {
      price: 100,
      emaFast: 102,
      emaMid: 100,
      emaSlow: 98,
      emaSlope: 'UP',
      trendDirection: 'BULL',
      momentum: 1.5,
      rsi: 52,
      macdHistogram: 0.4,
      volumeRatio: 1.5,
      cvdTrend: 'UP',
      oiChangePct: 2,
      fundingRate: -0.0001,
      longShortRatio: 1.0,
      whaleWall: 'SUPPORT',
      support: 99.5,
      resistance: 105,
      atr: 1.5,
      atrPct: 1.5,
      spreadPct: 0.02,
      liquidityScore: 80,
      sessionQuality: 'GOOD',
    };
  }
  return {
    price: 100,
    emaFast: 98,
    emaMid: 100,
    emaSlow: 102,
    emaSlope: 'DOWN',
    trendDirection: 'BEAR',
    momentum: -1.5,
    rsi: 48,
    macdHistogram: -0.4,
    volumeRatio: 1.5,
    cvdTrend: 'DOWN',
    oiChangePct: -2,
    fundingRate: 0.0001,
    longShortRatio: 1.0,
    whaleWall: 'RESISTANCE',
    support: 95,
    resistance: 100.5,
    atr: 1.5,
    atrPct: 1.5,
    spreadPct: 0.02,
    liquidityScore: 80,
    sessionQuality: 'GOOD',
  };
}

function perfectEntry(side: 'LONG' | 'SHORT' = 'LONG'): EntryQualityEntryDecisionInput {
  return {
    side,
    plannedRr: 2.5,
    timing: 'ON_TIME',
    executionReady: true,
  };
}

function readyBook(): EntryQualityRuleBookView {
  return {
    status: 'READY',
    minRr: 2,
    passedRules: ['trend', 'rr'],
    failedRules: [],
    blockedReasons: [],
  };
}

describe('buildEntryQualityReport', () => {
  it('Empty', () => {
    const report = buildEntryQualityReport(null, null, null);
    expect(report.version).toBe(1);
    expect(report.decision).toBe('AVOID');
    expect(report.score).toBe(0);
    expect(report.checks).toEqual([]);
  });

  it('Perfect setup → ENTER high grade', () => {
    const report = buildEntryQualityReport(
      perfectMarket('LONG'),
      perfectEntry('LONG'),
      readyBook(),
    );
    expect(report.decision).toBe('ENTER');
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(['A+', 'A', 'B+', 'B']).toContain(report.grade);
    expect(report.failedChecks.length).toBe(0);
    expect(report.confidence).toBeGreaterThan(50);
    expect(entryQualityGradeFromScore(report.score)).toBe(report.grade);
  });

  it('Weak setup → WAIT or AVOID', () => {
    const report = buildEntryQualityReport(
      {
        trendDirection: 'RANGE',
        volumeRatio: 1.0,
        rsi: 55,
        fundingRate: 0,
      },
      { side: 'LONG', plannedRr: 2.0, timing: 'EARLY' },
      { status: 'WATCH', minRr: 2 },
    );
    expect(['WAIT', 'AVOID']).toContain(report.decision);
    expect(report.score).toBeLessThan(85);
  });

  it('Trend fail → AVOID', () => {
    const market = { ...perfectMarket('LONG'), trendDirection: 'BEAR' as const };
    const report = buildEntryQualityReport(market, perfectEntry('LONG'), readyBook());
    expect(report.decision).toBe('AVOID');
    expect(report.detections).toContain('Against Trend');
    expect(report.blockedReasons.some((r) => /Trend opposite/i.test(r))).toBe(true);
  });

  it('Funding fail → WARNING path / detection', () => {
    const market = { ...perfectMarket('LONG'), fundingRate: 0.002 };
    const report = buildEntryQualityReport(market, perfectEntry('LONG'), readyBook());
    expect(report.detections).toContain('Funding Risk');
    expect(report.blockedReasons.some((r) => /Funding/i.test(r))).toBe(true);
    const funding = report.checks.find((c) => c.id === 'funding');
    expect(funding?.status === 'FAIL' || funding?.status === 'WARNING').toBe(true);
  });

  it('Whale fail → WAIT', () => {
    const market = { ...perfectMarket('LONG'), whaleWall: 'RESISTANCE' as const };
    const report = buildEntryQualityReport(market, perfectEntry('LONG'), readyBook());
    expect(report.decision).toBe('WAIT');
    expect(report.detections).toContain('Whale Resistance');
    expect(report.blockedReasons.some((r) => /Whale/i.test(r))).toBe(true);
  });

  it('RR fail → WAIT', () => {
    const report = buildEntryQualityReport(
      perfectMarket('LONG'),
      { ...perfectEntry('LONG'), plannedRr: 1.0 },
      readyBook(),
    );
    expect(report.decision).toBe('WAIT');
    expect(report.detections).toContain('Poor RR');
  });

  it('Volume fail → WAIT', () => {
    const market = { ...perfectMarket('LONG'), volumeRatio: 0.5 };
    const report = buildEntryQualityReport(market, perfectEntry('LONG'), readyBook());
    expect(report.decision).toBe('WAIT');
    expect(report.detections).toContain('Weak Volume');
  });

  it('Mixed pillars + weight sum 100', () => {
    const weightSum = Object.values(ENTRY_QUALITY_PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(weightSum).toBe(100);

    const report = buildEntryQualityReport(
      {
        ...perfectMarket('LONG'),
        volumeRatio: 0.7,
        rsi: 78,
        spreadPct: 0.2,
      },
      { side: 'LONG', plannedRr: 2.2, timing: 'LATE', executionReady: true },
      readyBook(),
    );
    expect(report.pillars.length).toBe(8);
    expect(report.detections).toContain('Late Entry');
    expect(report.passedChecks.length + report.failedChecks.length).toBeLessThanOrEqual(
      report.checks.length,
    );
  });

  it('Stable output', () => {
    const dash = {
      metrics: { winRate: 55, consistencyScore: 60, profitFactor: 1.4 },
    } as ULDashboardData;
    const a = buildEntryQualityReport(
      perfectMarket('SHORT'),
      perfectEntry('SHORT'),
      readyBook(),
      dash,
    );
    const b = buildEntryQualityReport(
      perfectMarket('SHORT'),
      perfectEntry('SHORT'),
      readyBook(),
      dash,
    );
    expect(a).toEqual(b);
  });
});

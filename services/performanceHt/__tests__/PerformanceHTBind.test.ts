/**
 * Task 15.1 — Performance HT UL bind tests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { AI_JOURNAL_APP_VERSION } from '../../../constants/aiJournal';
import {
  FEATURE_FLAGS,
  isUlAnalyticsEnabled,
  setUlAnalyticsEnabledForTests,
} from '../../../config/featureFlags';
import { buildDashboardWidgets } from '../../intelligence/dashboard/dashboardWidgets';
import {
  buildPerformanceHtDataBundle,
} from '../index';

function sampleEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  return {
    id: 'p1',
    timestamp: Date.UTC(2026, 6, 10, 10, 0, 0),
    symbol: 'BTCUSDT',
    accountSizeAtEntry: 1000,
    market: {
      entryPrice: 65000,
      priceAtAnalysis: 64900,
      slippage: 0.15,
      cvdValue: 1,
      cvdTrend: 'UP',
      volumeRatio: 1.2,
      btcChangePct: 1,
      fundingRate: 0.01,
      topTraderRatio: 1.3,
      oiChangePct: 0,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: 9,
      direction: 'LONG',
      layerScores: {
        l1: 1, l2: 1, l3: 1, l4: 1, l5: 1, l6: 1, l7: 1, l8: 1, l9: 1, l10: 1,
      },
      mandatoryViolations: [],
      decision: 'LONG',
      scorerVersion: 'v4',
      score: 0.81,
    },
    plan: {
      entryZoneType: 'EVENT_PROJECTED',
      entryZoneOptimal: 65000,
      entryZoneRangeLow: 64900,
      entryZoneRangeHigh: 65100,
      slProposed: 64000,
      slActual: 64000,
      tp1Proposed: 66000,
      tp1Actual: 66000,
      tp2: 67000,
      tp3: 68000,
      rrProposed: 2.2,
      sizeProposed: 100,
      sizeActual: 100,
      isSafeSL: true,
      openReason: 'trigger:TREND_REVERSAL',
    },
    outcome: {
      status: 'WIN',
      exitPrice: 66000,
      exitTimestamp: Date.UTC(2026, 6, 10, 12, 0, 0),
      pnlUSDT: 40,
      pnlPct: 2,
      holdingTimeMinutes: 120,
      exitReason: 'TP1_HIT',
    },
    tags: ['projected', 'projectionVersion:bind-1'],
    version: AI_JOURNAL_APP_VERSION,
    strategySource: 'V4',
    ...overrides,
  } as AiTradeJournalEntry;
}

afterEach(() => {
  setUlAnalyticsEnabledForTests(null);
});

describe('Feature flag USE_UL_ANALYTICS', () => {
  it('defaults to false (Task14 pipeline)', () => {
    expect(FEATURE_FLAGS.USE_UL_ANALYTICS).toBe(false);
    setUlAnalyticsEnabledForTests(null);
    expect(isUlAnalyticsEnabled()).toBe(false);
  });

  it('switches via setUlAnalyticsEnabledForTests', () => {
    setUlAnalyticsEnabledForTests(true);
    expect(isUlAnalyticsEnabled()).toBe(true);
    setUlAnalyticsEnabledForTests(false);
    expect(isUlAnalyticsEnabled()).toBe(false);
  });
});

describe('buildPerformanceHtDataBundle', () => {
  const journal = [
    sampleEntry({ id: '1' }),
    sampleEntry({
      id: '2',
      symbol: 'ETHUSDT',
      outcome: {
        status: 'LOSS',
        exitPrice: 64000,
        exitTimestamp: Date.UTC(2026, 6, 11, 12, 0, 0),
        pnlUSDT: -20,
        holdingTimeMinutes: 60,
        exitReason: 'SL_HIT',
      },
    }),
  ];

  it('Old pipeline (Task14)', () => {
    const bundle = buildPerformanceHtDataBundle(journal, {
      useUlAnalytics: false,
      period: 'all',
    });
    expect(bundle.source).toBe('task14');
    expect(bundle.validatorExecuted).toBe(false);
    expect(bundle.performanceDashboardVm).toBeNull();
    expect(bundle.stats.overview.totalTrades).toBeGreaterThan(0);
    expect(bundle.dash.widgets.length).toBe(buildDashboardWidgets().length);
    expect(bundle.dash.recommendationPanel.items).toBeDefined();
    expect(bundle.perf.coinRanking).toBeDefined();
  });

  it('UL pipeline', () => {
    const bundle = buildPerformanceHtDataBundle(journal, {
      useUlAnalytics: true,
      period: 'all',
      generatedAt: '2026-07-16T00:00:00.000Z',
    });
    expect(bundle.source).toBe('ul');
    expect(bundle.validatorExecuted).toBe(true);
    expect(bundle.performanceDashboardVm).not.toBeNull();
    expect(Object.isFrozen(bundle.performanceDashboardVm)).toBe(true);
    expect(bundle.stats.overview.totalTrades).toBe(2);
    expect(bundle.performanceDashboardVm!.summary.winRate).toBe(
      bundle.stats.overview.winRate,
    );
    // HT layout props present
    expect(bundle.dash.tradingSummary).toBeDefined();
    expect(bundle.dash.riskMonitor).toBeDefined();
    expect(bundle.dash.recommendationPanel).toBeDefined();
    expect(bundle.dash.topPicks).toBeDefined();
    expect(bundle.perf.coinRanking.length).toBeGreaterThan(0);
  });

  it('Same widget count (layout contract)', () => {
    const a = buildPerformanceHtDataBundle(journal, { useUlAnalytics: false });
    const b = buildPerformanceHtDataBundle(journal, { useUlAnalytics: true, generatedAt: 'x' });
    expect(a.dash.widgets.length).toBe(b.dash.widgets.length);
    expect(a.dash.widgets.map((w) => w.id)).toEqual(b.dash.widgets.map((w) => w.id));
  });

  it('Same layout prop keys on dash / stats / perf', () => {
    const a = buildPerformanceHtDataBundle([], { useUlAnalytics: false });
    const b = buildPerformanceHtDataBundle([], { useUlAnalytics: true, generatedAt: '' });
    expect(Object.keys(a.dash).sort()).toEqual(Object.keys(b.dash).sort());
    expect(Object.keys(a.stats).sort()).toEqual(Object.keys(b.stats).sort());
    expect(Object.keys(a.perf).sort()).toEqual(Object.keys(b.perf).sort());
    // Empty → identical zeros for pixel-critical KPIs
    expect(a.stats.overview.totalTrades).toBe(b.stats.overview.totalTrades);
    expect(a.stats.overview.netPnlUsdt ?? 0).toBe(b.stats.overview.netPnlUsdt ?? 0);
  });

  it('Validator always executed on UL path', () => {
    const bundle = buildPerformanceHtDataBundle(journal, { useUlAnalytics: true, generatedAt: 'v' });
    expect(bundle.validatorExecuted).toBe(true);
    expect(bundle.performanceDashboardVm!.summary.grade).toMatch(/^(A\+|A|B\+|B|C|D|F)$/);
  });

  it('Feature flag switching changes source', () => {
    setUlAnalyticsEnabledForTests(false);
    expect(buildPerformanceHtDataBundle(journal).source).toBe('task14');
    setUlAnalyticsEnabledForTests(true);
    expect(buildPerformanceHtDataBundle(journal, { generatedAt: 'f' }).source).toBe('ul');
  });

  it('No React / services/ul imports in PerformanceHtDashboard', () => {
    const src = readFileSync(
      join(__dirname, '../../../components/performance/PerformanceHtDashboard.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/from ['"].*services\/ul/);
    expect(src).toMatch(/buildPerformanceHtDataBundle/);
    expect(src).not.toMatch(/buildStatisticsViewModel/);
    expect(src).not.toMatch(/buildDashboardViewModel/);
    // Layout styles still present (pixel lock — not removed)
    expect(src).toMatch(/styles\.root/);
    expect(src).toMatch(/styles\.header/);
    expect(src).toMatch(/SemiRiskGauge/);
  });
});

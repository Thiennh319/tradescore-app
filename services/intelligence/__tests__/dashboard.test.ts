/**
 * Task 14.4 — Dashboard Intelligence tests.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { AI_JOURNAL_APP_VERSION } from '../../../constants/aiJournal';
import {
  DASHBOARD_VERSION,
  DASHBOARD_WIDGET_IDS,
  RULE_93_DASHBOARD_READ_ONLY,
  RULE_96_PERFORMANCE_VM_ONLY,
  RULE_100_DASHBOARD_CACHE,
  buildDashboardViewModel,
  buildPerformanceViewModel,
  buildStatisticsViewModel,
  clearDashboardIntelligenceCache,
  clearPerformanceIntelligenceCache,
  clearStatisticsIntelligenceCache,
} from '../index';
import {
  applyDashboardFilter,
  getDashboardCacheFingerprint,
  projectDashboardViewModel,
} from '../dashboard';

function sampleEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  return {
    id: 'd1',
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
        l1: 1,
        l2: 1,
        l3: 1,
        l4: 1,
        l5: 1,
        l6: 1,
        l7: 1,
        l8: 1,
        l9: 1,
        l10: 1,
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
    tags: [
      'projected',
      'triggerCode:TREND_REVERSAL',
      'strategyVersion:V4_1',
      'confidence:0.81',
      'adviser:1:HOLD:MOMENTUM',
      'adviser:2:CLOSE_NOW:TP',
      'projectionVersion:dash-1',
    ],
    version: AI_JOURNAL_APP_VERSION,
    strategySource: 'V4',
    ...overrides,
  };
}

function perfOf() {
  clearStatisticsIntelligenceCache();
  clearPerformanceIntelligenceCache();
  clearDashboardIntelligenceCache();
  const journal = [
    sampleEntry({ id: '1' }),
    sampleEntry({
      id: '2',
      symbol: 'SOLUSDT',
      outcome: {
        status: 'LOSS',
        pnlUSDT: -20,
        holdingTimeMinutes: 30,
        exitReason: 'SL_HIT',
        exitTimestamp: Date.UTC(2026, 6, 11, 12, 0, 0),
      },
      tags: [
        'projected',
        'triggerCode:BREAKOUT',
        'strategyVersion:V3',
        'confidence:0.3',
        'projectionVersion:dash-1',
      ],
      strategySource: 'V3',
      scoring: { ...sampleEntry().scoring, score: 0.3 },
    }),
  ];
  const stats = buildStatisticsViewModel(journal);
  return buildPerformanceViewModel(stats, '2026-07-14T12:00:00.000Z');
}

describe('Task 14.4 — Dashboard Projector', () => {
  it('projects Performance VM to Dashboard VM', () => {
    expect(RULE_96_PERFORMANCE_VM_ONLY).toBe(96);
    const perf = perfOf();
    const dash = projectDashboardViewModel(perf);
    expect(dash.tradingSummary.overallGrade).toBeTruthy();
    expect(dash.tradingSummary.generatedAt).toBe(perf.snapshot.generatedAt);
    expect(Object.isFrozen(dash)).toBe(true);
  });
});

describe('Task 14.4 — Widget Mapping', () => {
  it('exposes stable widget ids', () => {
    const dash = buildDashboardViewModel(perfOf());
    expect(DASHBOARD_WIDGET_IDS.overallScore).toBe('overall-score');
    expect(DASHBOARD_WIDGET_IDS.systemHealth).toBe('system-health');
    expect(DASHBOARD_WIDGET_IDS.topStrategy).toBe('top-strategy');
    expect(DASHBOARD_WIDGET_IDS.riskMonitor).toBe('risk-monitor');
    expect(DASHBOARD_WIDGET_IDS.recommendations).toBe('recommendations');
    expect(dash.widgets.map((w) => w.id)).toEqual(
      expect.arrayContaining([
        'overall-score',
        'system-health',
        'risk-monitor',
        'recommendations',
      ]),
    );
  });
});

describe('Task 14.4 — Health / Recommendations / Quick Statistics', () => {
  it('maps health, recommendations, quick stats from Performance', () => {
    const dash = buildDashboardViewModel(perfOf());
    expect(['Excellent', 'Good', 'Warning', 'Critical', 'Unknown']).toContain(dash.systemHealth);
    expect(dash.recommendationPanel.items.length).toBeGreaterThan(0);
    expect(dash.recommendationPanel.items.length).toBeLessThanOrEqual(3);
    expect(dash.recommendationPanel.recommendationVersion).toBe(1);
    expect(dash.quickStatistics.sourceKey).toMatch(/strategyRanking/);
    expect(dash.riskMonitor.riskLevel).toBeTruthy();
    expect(dash.recentTrends).toHaveLength(3);
    expect(dash.activeInsights.length).toBeGreaterThan(0);
  });
});

describe('Task 14.4 — Snapshot / Cache', () => {
  it('stamps snapshot and reuses cache on same performance fingerprint', () => {
    expect(RULE_100_DASHBOARD_CACHE).toBe(100);
    expect(DASHBOARD_VERSION).toBe(1);
    expect(RULE_93_DASHBOARD_READ_ONLY).toBe(93);
    clearDashboardIntelligenceCache();
    const perf = perfOf();
    const a = buildDashboardViewModel(perf);
    const b = buildDashboardViewModel(perf);
    expect(a).toBe(b);
    expect(getDashboardCacheFingerprint()).toBe(perf.snapshot.statisticsFingerprint);
    expect(a.snapshot.dashboardVersion).toBe(1);
    expect(a.snapshot.performanceVersion).toBe(1);
    expect(a.snapshot.statisticsVersion).toBe(1);
  });
});

describe('Task 14.4 — Filters', () => {
  it('applies filter without calculating metrics', () => {
    const perf = perfOf();
    const filtered = applyDashboardFilter(perf, {
      period: 'week',
      coin: 'BTC',
      strategy: null,
      tag: null,
    });
    expect(filtered.filter.period).toBe('week');
    expect(filtered.topPicks.topCoin === 'BTC' || filtered.topPicks.topCoin === null).toBe(true);
  });
});

describe('Task 14.4 — Read Only', () => {
  it('dashboard package does not expose writers / aggregators', async () => {
    const mod = await import('../dashboard');
    const keys = Object.keys(mod);
    expect(keys).not.toContain('aggregateStatistics');
    expect(keys).not.toContain('rankGroups');
    expect(keys).not.toContain('appendJournal');
  });
});

describe('Task 14.4 — Architecture Guard', () => {
  it('dashboard modules do not import Engine / Statistics Aggregator / Journal builders', () => {
    const dir = join(__dirname, '..', 'dashboard');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(
        /from ['"].*(positionAdvisorV41|scanV41|eventStore|persistence|statisticsAggregator|journalIntelligence)/,
      );
      expect(code, f).not.toMatch(/aggregateStatistics|metricWinRate|buildStatisticsViewModel/);
      expect(code, f).not.toMatch(/computeDecision|planTradeExecution/);
      // May import Performance types / ViewModel type path only — forbid Statistics index builders
      expect(code, f).not.toMatch(/from ['"]\.\.\/statistics['"]/);
    }
  });
});

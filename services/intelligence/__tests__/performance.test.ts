/**
 * Task 14.3 — Performance Intelligence tests.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { AI_JOURNAL_APP_VERSION } from '../../../constants/aiJournal';
import {
  PERFORMANCE_VERSION,
  RECOMMENDATION_VERSION,
  RULE_80_NO_METRIC_DEFINITION,
  RULE_81_RANKING_ONLY,
  RULE_84_RANKING_DETERMINISTIC,
  RULE_87_PERFORMANCE_CACHE,
  buildPerformanceIntelligence,
  buildPerformanceViewModel,
  buildStatisticsViewModel,
  clearPerformanceIntelligenceCache,
  clearStatisticsIntelligenceCache,
} from '../index';
import {
  clearPerformanceIntelligenceCache as clearPerfCache,
  getPerformanceCacheFingerprint,
  projectPerformanceViewModel,
  rankGroups,
} from '../performance';

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
      'projectionVersion:perf-1',
    ],
    version: AI_JOURNAL_APP_VERSION,
    strategySource: 'V4',
    ...overrides,
  };
}

function journal(): AiTradeJournalEntry[] {
  return [
    sampleEntry({ id: '1' }),
    sampleEntry({
      id: '2',
      symbol: 'SOLUSDT',
      outcome: {
        status: 'LOSS',
        pnlUSDT: -25,
        holdingTimeMinutes: 40,
        exitReason: 'SL_HIT',
        exitTimestamp: Date.UTC(2026, 6, 11, 12, 0, 0),
      },
      tags: [
        'projected',
        'triggerCode:BREAKOUT',
        'strategyVersion:V3',
        'confidence:0.3',
        'projectionVersion:perf-1',
      ],
      strategySource: 'V3',
      scoring: { ...sampleEntry().scoring, score: 0.3, direction: 'SHORT', decision: 'SHORT' },
      market: { ...sampleEntry().market, hourVN: 16, fundingRate: -0.01 },
    }),
    sampleEntry({
      id: '3',
      symbol: 'BNBUSDT',
      tags: [
        'projected',
        'triggerCode:PULLBACK',
        'strategyVersion:V4',
        'confidence:0.55',
        'adviser:1:MOVE_SL_BE:LOCK',
        'projectionVersion:perf-1',
      ],
      strategySource: 'V4',
      outcome: {
        status: 'WIN',
        pnlUSDT: 15,
        holdingTimeMinutes: 50,
        exitReason: 'TP1_HIT',
        exitTimestamp: Date.UTC(2026, 6, 12, 8, 0, 0),
      },
      scoring: { ...sampleEntry().scoring, score: 0.55 },
      market: { ...sampleEntry().market, hourVN: 21 },
    }),
    sampleEntry({
      id: '4',
      symbol: 'NEARUSDT',
      outcome: {
        status: 'WIN',
        pnlUSDT: 8,
        holdingTimeMinutes: 20,
        exitTimestamp: Date.UTC(2026, 6, 13, 8, 0, 0),
      },
      tags: [
        'projected',
        'triggerCode:TREND_REVERSAL',
        'strategyVersion:V4_1',
        'confidence:0.9',
        'projectionVersion:perf-1',
      ],
    }),
  ];
}

function statsOf() {
  clearStatisticsIntelligenceCache();
  clearPerfCache();
  return buildStatisticsViewModel(journal());
}

describe('Task 14.3 — Ranking / Deterministic', () => {
  it('ranks strategy/coin/trigger deterministically', () => {
    expect(RULE_81_RANKING_ONLY).toBe(81);
    expect(RULE_84_RANKING_DETERMINISTIC).toBe(84);
    const stats = statsOf();
    const a = rankGroups(stats.byStrategy);
    const b = rankGroups(stats.byStrategy);
    expect(a).toEqual(b);
    const vm1 = projectPerformanceViewModel(stats, '2026-07-14T00:00:00.000Z');
    const vm2 = projectPerformanceViewModel(stats, '2026-07-14T00:00:00.000Z');
    expect(vm1.strategyRanking).toEqual(vm2.strategyRanking);
    expect(vm1.coinRanking.map((r) => r.key)).toEqual(vm2.coinRanking.map((r) => r.key));
    expect(vm1.triggerRanking.length).toBeGreaterThan(0);
  });
});

describe('Task 14.3 — Comparison / Trend / Recommendation', () => {
  it('builds comparison axes, trends, evidenced recommendations', () => {
    clearPerfCache();
    const stats = statsOf();
    const vm = buildPerformanceViewModel(stats, '2026-07-14T12:00:00.000Z');
    expect(vm.comparisons.some((c) => c.axis === 'Strategy')).toBe(true);
    expect(vm.trends).toHaveLength(3);
    expect(vm.recommendations.length).toBeGreaterThan(0);
    expect(vm.recommendations.every((r) => r.evidence.length > 0)).toBe(true);
    expect(vm.recommendations.every((r) => r.evidenceIds.length > 0)).toBe(true);
  });
});

describe('Task 14.3 — Sections from Statistics', () => {
  it('exposes coin strategy trigger confidence advisor tags', () => {
    const vm = buildPerformanceViewModel(statsOf());
    expect(vm.coinRanking.some((r) => ['BTC', 'SOL', 'BNB', 'NEAR'].includes(r.key))).toBe(true);
    expect(vm.strategyRanking.some((r) => r.key === 'V4.1' || r.key === 'V3')).toBe(true);
    expect(vm.triggerRanking.length).toBeGreaterThan(0);
    expect(vm.confidenceAnalysis.length).toBeGreaterThan(0);
    expect(vm.advisorRanking.length).toBeGreaterThan(0);
    expect(
      vm.tagIntelligence.topWinningTags.length + vm.tagIntelligence.topLosingTags.length,
    ).toBeGreaterThan(0);
  });
});

describe('Task 14.3 — Cache / Version', () => {
  it('caches by statistics fingerprint and stamps versions', () => {
    expect(RULE_87_PERFORMANCE_CACHE).toBe(87);
    expect(PERFORMANCE_VERSION).toBe(1);
    expect(RECOMMENDATION_VERSION).toBe(1);
    expect(RULE_80_NO_METRIC_DEFINITION).toBe(80);
    clearPerfCache();
    clearStatisticsIntelligenceCache();
    const stats = buildStatisticsViewModel(journal());
    const a = buildPerformanceViewModel(stats);
    const b = buildPerformanceViewModel(stats);
    expect(a).toBe(b);
    expect(getPerformanceCacheFingerprint()).toBe(stats.projectionFingerprint);
    expect(a.snapshot.performanceVersion).toBe(1);
    expect(a.snapshot.recommendationVersion).toBe(1);
    expect(Object.isFrozen(a)).toBe(true);

    const mutated = journal().map((e, i) =>
      i === 0
        ? {
            ...e,
            tags: [
              ...(e.tags ?? []).filter((t) => !t.startsWith('projectionVersion:')),
              'projectionVersion:perf-2',
            ],
          }
        : e,
    );
    clearStatisticsIntelligenceCache();
    const stats2 = buildStatisticsViewModel(mutated);
    const c = buildPerformanceViewModel(stats2);
    expect(c).not.toBe(a);
  });
});

describe('Task 14.3 — Legacy facade', () => {
  it('maps to PerformanceIntelligence recommendations', () => {
    clearPerformanceIntelligenceCache();
    clearStatisticsIntelligenceCache();
    const legacy = buildPerformanceIntelligence(journal());
    expect(legacy.byVersion.length).toBeGreaterThan(0);
    expect(legacy.aiRecommendations[0]).toMatch(/Recommendation/i);
  });
});

describe('Task 14.3 — Read Only', () => {
  it('performance package does not expose journal writers', async () => {
    const mod = await import('../performance');
    const keys = Object.keys(mod);
    expect(keys).not.toContain('appendJournal');
    expect(keys).not.toContain('aggregateStatistics');
  });
});

describe('Task 14.3 — Architecture Guard', () => {
  it('performance modules do not import Engine / Aggregator / EventStore', () => {
    const dir = join(__dirname, '..', 'performance');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(
        /from ['"].*(positionAdvisorV41|scanV41|eventStore|persistence|statisticsAggregator)/,
      );
      expect(code, f).not.toMatch(/aggregateStatistics|metricWinRate|metricProfitFactor/);
      expect(code, f).not.toMatch(/computeDecision|planTradeExecution/);
    }
  });
});

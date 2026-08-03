/**
 * Task 14.2 — Statistics Intelligence tests.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { AI_JOURNAL_APP_VERSION } from '../../../constants/aiJournal';
import {
  RULE_69_SINGLE_METRIC_DEFINITION,
  buildStatisticsIntelligence,
  buildStatisticsViewModel,
  clearStatisticsIntelligenceCache,
  metricExpectancy,
  metricProfitFactor,
  metricWinRate,
} from '../index';
import {
  clearStatisticsIntelligenceCache as clearStatsCache,
  getStatisticsCacheFingerprint,
} from '../statistics';

function sampleEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  return {
    id: 's1',
    timestamp: Date.UTC(2026, 6, 14, 10, 0, 0),
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
      score: 0.8,
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
      rrProposed: 2,
      sizeProposed: 100,
      sizeActual: 100,
      isSafeSL: true,
      openReason: 'trigger:TREND_REVERSAL',
    },
    outcome: {
      status: 'WIN',
      exitPrice: 66000,
      exitTimestamp: Date.UTC(2026, 6, 14, 12, 0, 0),
      pnlUSDT: 40,
      pnlPct: 2,
      holdingTimeMinutes: 120,
      exitReason: 'TP1_HIT',
    },
    tags: [
      'projected',
      'triggerCode:TREND_REVERSAL',
      'decisionCode:LONG',
      'strategyVersion:V4_1',
      'confidence:0.81',
      'adviser:1:HOLD:MOMENTUM_STRONG',
      'adviser:2:MOVE_SL_BE:LOCK_PROFIT',
      'adviser:3:CLOSE_NOW:EXHAUSTION',
      'featureSetVersion:fs-4.1.0',
      'projectionVersion:pv-stats-1',
    ],
    version: AI_JOURNAL_APP_VERSION,
    strategySource: 'V4',
    ...overrides,
  };
}

function fixtureJournal(): AiTradeJournalEntry[] {
  return [
    sampleEntry({ id: 'a' }),
    sampleEntry({
      id: 'b',
      symbol: 'SOLUSDT',
      market: {
        ...sampleEntry().market,
        hourVN: 16,
        fundingRate: 0.02,
        topTraderRatio: 1.4,
        btcChangePct: 0.8,
      },
      outcome: {
        status: 'LOSS',
        pnlUSDT: -20,
        holdingTimeMinutes: 30,
        exitReason: 'SL_HIT',
        exitTimestamp: Date.UTC(2026, 6, 15, 12, 0, 0),
      },
      tags: [
        'projected',
        'triggerCode:FAKE_BREAKOUT',
        'strategyVersion:V3',
        'confidence:0.3',
        'projectionVersion:pv-stats-1',
      ],
      strategySource: 'V3',
      scoring: {
        ...sampleEntry().scoring,
        direction: 'SHORT',
        decision: 'SHORT',
        score: 0.3,
      },
      plan: { ...sampleEntry().plan, rrProposed: 1.5 },
    }),
    sampleEntry({
      id: 'c',
      symbol: 'BNBUSDT',
      market: { ...sampleEntry().market, hourVN: 21 },
      tags: [
        'projected',
        'triggerCode:TREND_REVERSAL',
        'strategyVersion:V4',
        'confidence:0.55',
        'adviser:1:HOLD:WAIT',
        'projectionVersion:pv-stats-1',
      ],
      strategySource: 'V4',
      outcome: {
        status: 'WIN',
        pnlUSDT: 10,
        holdingTimeMinutes: 60,
        exitReason: 'TP1_HIT',
        exitTimestamp: Date.UTC(2026, 6, 16, 8, 0, 0),
      },
      plan: { ...sampleEntry().plan, rrProposed: 1.8 },
      scoring: { ...sampleEntry().scoring, score: 0.55 },
    }),
    sampleEntry({
      id: 'd',
      symbol: 'NEARUSDT',
      outcome: {
        status: 'BREAKEVEN',
        pnlUSDT: 0,
        holdingTimeMinutes: 15,
        exitTimestamp: Date.UTC(2026, 6, 17, 8, 0, 0),
      },
      tags: [
        'projected',
        'triggerCode:TREND_REVERSAL',
        'strategyVersion:V4_1',
        'confidence:0.9',
        'projectionVersion:pv-stats-1',
      ],
    }),
  ];
}

describe('Task 14.2 — Metrics (Rule #69)', () => {
  it('defines winrate / profit factor / expectancy once', () => {
    expect(RULE_69_SINGLE_METRIC_DEFINITION).toBe(69);
    expect(metricWinRate(3, 4)).toBe(75);
    expect(metricProfitFactor(80, 40)).toBe(2);
    expect(metricExpectancy(20, 4)).toBe(5);
  });
});

describe('Task 14.2 — Overview / Profit / Drawdown', () => {
  it('computes winrate profit factor expectancy drawdown', () => {
    clearStatisticsIntelligenceCache();
    clearStatsCache();
    const vm = buildStatisticsViewModel(fixtureJournal());
    expect(vm.overview.totalTrades).toBe(4);
    expect(vm.overview.wins).toBe(2);
    expect(vm.overview.losses).toBe(1);
    expect(vm.overview.breakEven).toBe(1);
    expect(vm.overview.winRate).toBe(50);
    expect(vm.overview.netPnlUsdt).toBe(30);
    expect(vm.profit.profitFactor).toBe(50 / 20);
    expect(vm.profit.expectancyUsdt).toBe(30 / 4);
    expect(vm.drawdown.maxDrawdownUsdt).not.toBeNull();
    expect(vm.drawdown.longestWinningStreak).toBeGreaterThanOrEqual(1);
  });
});

describe('Task 14.2 — Groups', () => {
  it('groups coin strategy trigger confidence advisor', () => {
    clearStatsCache();
    const vm = buildStatisticsViewModel(fixtureJournal());
    expect(vm.byCoin.some((r) => r.key === 'BTC')).toBe(true);
    expect(vm.byCoin.some((r) => r.key === 'SOL')).toBe(true);
    expect(vm.byCoin.some((r) => r.key === 'BNB')).toBe(true);
    expect(vm.byCoin.some((r) => r.key === 'NEAR')).toBe(true);
    expect(vm.byStrategy.some((r) => r.key === 'V4.1')).toBe(true);
    expect(vm.byStrategy.some((r) => r.key === 'V3')).toBe(true);
    expect(vm.byTrigger.some((r) => r.key === 'TREND_REVERSAL')).toBe(true);
    expect(vm.byConfidence.some((r) => r.key === 'High')).toBe(true);
    expect(vm.byConfidence.some((r) => r.key === 'Low')).toBe(true);
    expect(vm.byAdvisor.some((r) => r.key === 'Hold')).toBe(true);
    expect(vm.byAdvisor.some((r) => r.key === 'Move SL' || r.key === 'Close')).toBe(true);
  });
});

describe('Task 14.2 — Trade Tags', () => {
  it('reads tags and supports combos without generating tags', () => {
    clearStatsCache();
    const vm = buildStatisticsViewModel(fixtureJournal());
    expect(vm.byTag.some((r) => r.key === 'trend' || r.key === 'win' || r.key === 'long')).toBe(
      true,
    );
    expect(vm.byTagCombo.every((r) => r.tags.length >= 2)).toBe(true);
  });
});

describe('Task 14.2 — Time Group', () => {
  it('buckets day week month session zones', () => {
    clearStatsCache();
    const vm = buildStatisticsViewModel(fixtureJournal());
    expect(vm.byDay.length).toBeGreaterThan(0);
    expect(vm.byWeek.length).toBeGreaterThan(0);
    expect(vm.byMonth.length).toBeGreaterThan(0);
    const zones = vm.bySessionZone.map((r) => r.key);
    expect(zones.some((z) => z === 'Asian' || z === 'London' || z === 'New York')).toBe(true);
  });
});

describe('Task 14.2 — Cache', () => {
  it('reuses ViewModel when projection fingerprint unchanged', () => {
    clearStatsCache();
    const journal = fixtureJournal();
    const a = buildStatisticsViewModel(journal);
    const fp = getStatisticsCacheFingerprint();
    const b = buildStatisticsViewModel(journal);
    expect(a).toBe(b);
    expect(fp).toBe(getStatisticsCacheFingerprint());

    const mutated = fixtureJournal().map((e, i) =>
      i === 0
        ? {
            ...e,
            tags: [
              ...(e.tags ?? []).filter((t) => !t.startsWith('projectionVersion:')),
              'projectionVersion:pv-stats-2',
            ],
          }
        : e,
    );
    const c = buildStatisticsViewModel(mutated);
    expect(c).not.toBe(a);
    expect(getStatisticsCacheFingerprint()).not.toBe(fp);
  });
});

describe('Task 14.2 — Legacy facade', () => {
  it('maps ViewModel to StatisticsIntelligence', () => {
    clearStatsCache();
    const legacy = buildStatisticsIntelligence(fixtureJournal());
    expect(legacy.sampleSize).toBe(4);
    expect(legacy.expectancyUsdt).toBe(30 / 4);
    expect(legacy.byTrigger.some((r) => r.key === 'TREND_REVERSAL')).toBe(true);
  });
});

describe('Task 14.2 — Read Only', () => {
  it('does not expose journal write APIs', async () => {
    const mod = await import('../statistics');
    const keys = Object.keys(mod);
    expect(keys).not.toContain('appendJournal');
    expect(keys).not.toContain('writeJournal');
  });
});

describe('Task 14.2 — Architecture Guard', () => {
  it('statistics modules do not import Engine / EventStore / Journal Intelligence', () => {
    const dir = join(__dirname, '..', 'statistics');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(
        /from ['"].*(positionAdvisorV41|scanV41|eventStore|persistence|dualWrite|journalIntelligence)/,
      );
      expect(code, f).not.toMatch(/computeDecision|planTradeExecution|appendEvent/);
      expect(code, f).not.toMatch(/from ['"]\.\.\/journalIntelligence['"]/);
      expect(code, f).not.toMatch(/from ['"]\.\.\/journalTimelineBuilder['"]/);
    }
  });
});

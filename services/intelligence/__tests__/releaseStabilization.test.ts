/**
 * Task 14.4.1 — Release Stabilization tests.
 */
import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { AI_JOURNAL_APP_VERSION } from '../../../constants/aiJournal';
import {
  buildDashboardViewModel,
  buildJournalEntryIntelligence,
  buildJournalStatisticsFingerprint,
  buildPerformanceViewModel,
  buildStatisticsViewModel,
  clearDashboardIntelligenceCache,
  clearJournalIntelligenceCache,
  clearPerformanceIntelligenceCache,
  clearStatisticsIntelligenceCache,
  invalidateAllIntelligenceCaches,
  isJournalIntelligenceCached,
  metricExpectancy,
  metricProfitFactor,
  metricWinRate,
  metricWinRatePct1,
} from '../index';
import { getStatisticsCacheFingerprint } from '../statistics';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function entry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  return {
    id: 'stab-1',
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
      'strategyVersion:V4_1',
      'confidence:0.81',
      'projectionVersion:stab-1',
    ],
    version: AI_JOURNAL_APP_VERSION,
    strategySource: 'V4',
    ...overrides,
  };
}

describe('Task 14.4.1 — Cache invalidation on outcome change', () => {
  it('busts Statistics / Performance / Dashboard when PnL changes', () => {
    invalidateAllIntelligenceCaches();
    const a = [entry()];
    const stats1 = buildStatisticsViewModel(a);
    const perf1 = buildPerformanceViewModel(stats1);
    const dash1 = buildDashboardViewModel(perf1);
    const fp1 = getStatisticsCacheFingerprint();

    const b = [
      entry({
        outcome: {
          status: 'WIN',
          pnlUSDT: 99,
          holdingTimeMinutes: 120,
          exitReason: 'TP1_HIT',
          exitTimestamp: Date.UTC(2026, 6, 14, 12, 0, 0),
        },
      }),
    ];
    expect(buildJournalStatisticsFingerprint(b)).not.toBe(
      buildJournalStatisticsFingerprint(a),
    );
    const stats2 = buildStatisticsViewModel(b);
    expect(stats2).not.toBe(stats1);
    expect(stats2.overview.netPnlUsdt).toBe(99);
    expect(getStatisticsCacheFingerprint()).not.toBe(fp1);

    const perf2 = buildPerformanceViewModel(stats2);
    const dash2 = buildDashboardViewModel(perf2);
    expect(perf2).not.toBe(perf1);
    expect(dash2).not.toBe(dash1);
  });

  it('busts Journal Intelligence cache when outcome fingerprint changes', () => {
    clearJournalIntelligenceCache();
    const e1 = entry();
    const intel1 = buildJournalEntryIntelligence(e1);
    expect(isJournalIntelligenceCached('stab-1')).toBe(true);
    const e2 = entry({
      outcome: {
        ...e1.outcome,
        pnlUSDT: 12,
      },
    });
    const intel2 = buildJournalEntryIntelligence(e2);
    expect(intel2).not.toBe(intel1);
    expect(intel2.tradeSummary.pnlUsdt).toBe(12);
  });

  it('invalidateAllIntelligenceCaches clears layers', () => {
    clearStatisticsIntelligenceCache();
    clearPerformanceIntelligenceCache();
    clearDashboardIntelligenceCache();
    clearJournalIntelligenceCache();
    const journal = [entry()];
    buildJournalEntryIntelligence(journal[0]!);
    buildDashboardViewModel(buildPerformanceViewModel(buildStatisticsViewModel(journal)));
    expect(isJournalIntelligenceCached('stab-1')).toBe(true);
    expect(getStatisticsCacheFingerprint()).not.toBeNull();
    invalidateAllIntelligenceCaches();
    expect(isJournalIntelligenceCached('stab-1')).toBe(false);
    expect(getStatisticsCacheFingerprint()).toBeNull();
  });
});

describe('Task 14.4.1 — Statistics fingerprint-first cache hit', () => {
  it('skips rebuild on identical fingerprint', () => {
    invalidateAllIntelligenceCaches();
    const journal = [entry()];
    const a = buildStatisticsViewModel(journal);
    const b = buildStatisticsViewModel(journal);
    expect(a).toBe(b);
  });
});

describe('Task 14.4.1 — Rule #69', () => {
  it('exports single metric definitions', () => {
    expect(metricWinRate(1, 2)).toBe(50);
    expect(metricWinRatePct1(1, 2)).toBe(50);
    expect(metricExpectancy(40, 2)).toBe(20);
    expect(metricProfitFactor(80, 40)).toBe(2);
  });
});

describe('Task 14.4.1 — Layer dependency guard', () => {
  it('statistics never imports journalIntelligence', () => {
    const dir = join(__dirname, '..', 'statistics');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const code = readFileSync(join(dir, f), 'utf8');
      expect(code, f).not.toMatch(/journalIntelligence/);
      expect(code, f).not.toMatch(/journalTimelineBuilder/);
    }
  });
});

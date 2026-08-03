/**
 * Phase 14 — Trading Intelligence unit tests.
 */
import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { AI_JOURNAL_APP_VERSION } from '../../../constants/aiJournal';
import {
  RULE_51_AI_SUGGEST_ONLY,
  buildDashboardIntelligence,
  buildJournalEntryIntelligence,
  buildPerformanceIntelligence,
  buildStatisticsIntelligence,
  parseProjectedTags,
} from '../index';

function sampleEntry(overrides: Partial<AiTradeJournalEntry> = {}): AiTradeJournalEntry {
  return {
    id: 't1',
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
      hourVN: 17,
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
      'adviser:2:CLOSE_NOW:EXHAUSTION',
      'featureSetVersion:fs-4.1.0',
    ],
    version: AI_JOURNAL_APP_VERSION,
    strategySource: 'V4',
    ...overrides,
  };
}

describe('Phase 14 — Parse / Journal Intelligence', () => {
  it('parses projected tags and builds timelines', () => {
    const entry = sampleEntry();
    const meta = parseProjectedTags(entry);
    expect(meta.isProjected).toBe(true);
    expect(meta.triggerCode).toBe('TREND_REVERSAL');
    expect(meta.adviserTimeline).toHaveLength(2);

    const intel = buildJournalEntryIntelligence(entry);
    expect(intel.replayReady).toBe(true);
    expect(intel.eventTimeline.some((e) => e.kind === 'ADVISER')).toBe(true);
    expect(intel.aiSummary.text).toMatch(/thắng|Trend|RR/i);
    expect(intel.evidence.some((e) => e.value === 'TREND_REVERSAL')).toBe(true);
    expect(RULE_51_AI_SUGGEST_ONLY).toBe(51);
  });
});

describe('Phase 14 — Statistics / Performance / Dashboard', () => {
  it('aggregates statistics from TI view', () => {
    const stats = buildStatisticsIntelligence([
      sampleEntry({ id: 'a' }),
      sampleEntry({
        id: 'b',
        outcome: {
          status: 'LOSS',
          pnlUSDT: -20,
          holdingTimeMinutes: 30,
          exitReason: 'SL_HIT',
        },
        tags: ['projected', 'triggerCode:FAKE_BREAKOUT', 'strategyVersion:V3', 'confidence:0.3'],
        strategySource: 'V3',
        scoring: {
          ...sampleEntry().scoring,
          scorerVersion: 'v3',
          decision: 'SHORT',
          direction: 'SHORT',
        },
      }),
    ]);
    expect(stats.sampleSize).toBe(2);
    expect(stats.byTrigger.some((r) => r.key === 'TREND_REVERSAL')).toBe(true);
    expect(stats.expectancyUsdt).not.toBeNull();
  });

  it('compares versions and emits Rule #51 recommendations', () => {
    const perf = buildPerformanceIntelligence([
      sampleEntry({ id: '1' }),
      sampleEntry({ id: '2' }),
      sampleEntry({ id: '3' }),
    ]);
    expect(perf.byVersion.some((v) => v.version === 'V4.1' || v.version === 'V4_1')).toBe(true);
    expect(perf.aiRecommendations.length).toBeGreaterThan(0);
    expect(perf.aiRecommendations[0]).toMatch(/Recommendation/i);
  });

  it('builds dashboard health from performance presentation layer', () => {
    const dash = buildDashboardIntelligence([sampleEntry()], {
      syncStatus: 'READY',
      queueDepth: 0,
    });
    expect(dash.systemHealth === 'OK' || dash.systemHealth === 'DEGRADED' || dash.systemHealth === 'UNKNOWN').toBe(
      true,
    );
    expect(dash.desktopSync).toBe('READY');
    expect(dash.aiInsight.length).toBeGreaterThan(0);
  });
});

describe('Phase 14 — Guard: no engine imports in intelligence', () => {
  it('intelligence modules do not import engines', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '..');
    for (const f of [
      'journalIntelligence.ts',
      'statisticsIntelligence.ts',
      'performanceIntelligence.ts',
      'dashboardIntelligence.ts',
    ]) {
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(
        /from ['"].*positionAdvisorV41|from ['"].*scanV41|computeDecision|planTradeExecution/,
      );
    }
  });
});

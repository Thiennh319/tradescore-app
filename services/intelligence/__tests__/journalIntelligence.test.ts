/**
 * Task 14.1 — Journal Intelligence tests.
 * Timeline · Replay · AI Summary · Root Cause · Evidence · Snapshot · Outcome · Read Only · Architecture Guard
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../constants/aiJournal';
import { AI_JOURNAL_APP_VERSION } from '../../../constants/aiJournal';
import {
  AI_SUMMARY_VERSION,
  REPLAY_VERSION,
  RULE_57_JOURNAL_INTEL_READ_ONLY,
  RULE_58_REPLAY_TIMELINE_ONLY,
  RULE_59_AI_SUMMARY_HAS_EVIDENCE,
  RULE_60_OUTCOME_REPRODUCIBLE,
  RULE_61_JOURNAL_IS_CANONICAL,
  RULE_62_SECTION_HAS_SOURCE,
  RULE_63_REPLAY_VERSION,
  RULE_64_SUMMARY_VERSION,
  RULE_65_INTELLIGENCE_CACHE,
  buildEventTimeline,
  buildJournalAiSummary,
  buildJournalEntryIntelligence,
  buildJournalEvidence,
  buildJournalOutcomeAnalysis,
  buildJournalRootCause,
  clearJournalIntelligenceCache,
  createReplayState,
  deriveIntelligenceTradeTags,
  isJournalIntelligenceCached,
  replayJump,
  replayPause,
  replayPlay,
  replayStep,
  replayTick,
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
      rrProposed: 2.6,
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
      'engineVersion:e-4.1',
    ],
    version: AI_JOURNAL_APP_VERSION,
    strategySource: 'V4',
    ...overrides,
  };
}

describe('Task 14.1 — Snapshot', () => {
  it('exposes trade / decision / market snapshots from TI View only', () => {
    const intel = buildJournalEntryIntelligence(sampleEntry());
    expect(intel.tradeSummary.coin).toBe('BTC');
    expect(intel.tradeSummary.direction).toBe('LONG');
    expect(intel.tradeSummary.rr).toBe(2.6);
    expect(intel.tradeSummary.status).toBe('WIN');
    expect(intel.decisionSnapshot.decision).toBe('LONG');
    expect(intel.decisionSnapshot.confidence).toBe(0.81);
    expect(intel.decisionSnapshot.trigger).toBe('TREND_REVERSAL');
    expect(intel.decisionSnapshot.checklist.length).toBeGreaterThan(0);
    expect(intel.marketSnapshot.trend).toBe('UP');
    expect(intel.marketSnapshot.funding).toBe(0.01);
    expect(intel.marketSnapshot.whale).toBe(1.3);
    expect(intel.marketSnapshot.session).toBe('GOOD');
  });
});

describe('Task 14.1 — Timeline', () => {
  it('builds event timeline in sequence order (not timestamp sort)', () => {
    const entry = sampleEntry({
      outcome: {
        ...sampleEntry().outcome,
        limitOrderPlacedAt: Date.UTC(2026, 6, 14, 9, 0, 0),
      },
    });
    const events = buildEventTimeline(entry);
    const sequences = events.map((e) => e.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        'SIGNAL_CREATED',
        'DECISION',
        'PLANNER',
        'ORDER_CREATED',
        'PENDING',
        'RUNNING',
        'TP1',
        'ADVISER',
        'CLOSE',
      ]),
    );
    expect(events.some((e) => e.kind === 'ADVISER')).toBe(true);
  });

  it('maps adviser action codes to UI labels', () => {
    const intel = buildJournalEntryIntelligence(sampleEntry());
    expect(intel.adviserTimeline.map((a) => a.actionLabel)).toEqual(
      expect.arrayContaining(['Hold', 'Move SL', 'Close']),
    );
  });
});

describe('Task 14.1 — Replay', () => {
  it('supports play / pause / step / jump / tick without mutating source', () => {
    const events = buildEventTimeline(sampleEntry());
    const frozen = events.map((e) => ({ ...e }));
    let state = createReplayState('t1', events);
    expect(state.playing).toBe(false);
    expect(state.current?.sequence).toBe(1);

    state = replayPlay(state);
    expect(state.playing).toBe(true);
    state = replayTick(state);
    expect(state.index).toBe(1);
    state = replayPause(state);
    expect(state.playing).toBe(false);
    state = replayStep(state);
    expect(state.index).toBe(2);
    expect(state.playing).toBe(false);
    state = replayJump(state, events[0]!.sequence);
    expect(state.index).toBe(0);
    expect(events).toEqual(frozen);
  });
});

describe('Task 14.1 — Outcome', () => {
  it('is deterministic (Rule #60)', () => {
    const entry = sampleEntry();
    const a = buildJournalOutcomeAnalysis(entry);
    const b = buildJournalOutcomeAnalysis(entry);
    expect(a).toEqual(b);
    expect(a.success).toBe(true);
    expect(a.failure).toBe(false);
    expect(a.pnlUsdt).toBe(40);
    expect(a.rr).toBe(2.6);
    expect(a.executionQuality).toBeGreaterThan(0);
    expect(a.disciplineScore).toBe(100);
  });
});

describe('Task 14.1 — Root Cause', () => {
  it('classifies WIN / LOSS categories', () => {
    expect(buildJournalRootCause(sampleEntry()).category).toBe('Exit');
    const loss = buildJournalRootCause(
      sampleEntry({
        outcome: {
          status: 'LOSS',
          pnlUSDT: -20,
          exitReason: 'SL_HIT',
          holdingTimeMinutes: 30,
        },
      }),
    );
    expect(loss.category).toBe('Exit');
    expect(loss.primary).toBe('SL Hit');
  });
});

describe('Task 14.1 — Evidence', () => {
  it('attaches related trade ids and journal fields', () => {
    const entry = sampleEntry();
    const outcome = buildJournalOutcomeAnalysis(entry);
    const root = buildJournalRootCause(entry);
    const evidence = buildJournalEvidence(entry, outcome, root);
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.every((e) => e.relatedTradeIds.includes('t1'))).toBe(true);
    expect(evidence.some((e) => e.id === 'ev_trigger')).toBe(true);
  });
});

describe('Task 14.1 — AI Summary', () => {
  it('is read-only narrative with evidence ids (Rule #59)', () => {
    const entry = sampleEntry();
    const outcome = buildJournalOutcomeAnalysis(entry);
    const root = buildJournalRootCause(entry);
    const evidence = buildJournalEvidence(entry, outcome, root);
    const summary = buildJournalAiSummary(entry, outcome, root, evidence);
    expect(summary.text).toMatch(/thắng/i);
    expect(summary.text).toMatch(/Rule #51/);
    expect(summary.text).not.toMatch(/nên\s+(mua|bán|long|short)/i);
    expect(summary.evidenceIds.length).toBe(evidence.length);
    expect(summary.evidenceIds).toContain('ev_pnl');
  });
});

describe('Task 14.1 — Orchestrator', () => {
  it('assembles full intelligence bundle', () => {
    clearJournalIntelligenceCache();
    const intel = buildJournalEntryIntelligence(sampleEntry());
    expect(intel.replayReady).toBe(true);
    expect(intel.isProjected).toBe(true);
    expect(intel.aiSummary.text.length).toBeGreaterThan(0);
    expect(intel.evidence.length).toBe(intel.aiSummary.evidenceIds.length);
    expect(RULE_57_JOURNAL_INTEL_READ_ONLY).toBe(57);
    expect(RULE_58_REPLAY_TIMELINE_ONLY).toBe(58);
    expect(RULE_59_AI_SUMMARY_HAS_EVIDENCE).toBe(59);
    expect(RULE_60_OUTCOME_REPRODUCIBLE).toBe(60);
    expect(RULE_61_JOURNAL_IS_CANONICAL).toBe(61);
  });
});

describe('Task 14.1 — Read Only', () => {
  it('does not expose journal write APIs from intelligence index', async () => {
    const mod = await import('../index');
    const keys = Object.keys(mod);
    expect(keys).not.toContain('appendJournal');
    expect(keys).not.toContain('writeJournal');
    expect(keys).not.toContain('saveJournalEntry');
    expect(keys).not.toContain('upsertJournal');
  });
});

describe('Task 14.1.1 — Replay Version', () => {
  it('exports REPLAY_VERSION=1 and stamps replay state', () => {
    expect(REPLAY_VERSION).toBe(1);
    expect(RULE_63_REPLAY_VERSION).toBe(63);
    const state = createReplayState('t1', buildEventTimeline(sampleEntry()));
    expect(state.replayVersion).toBe(1);
    expect(buildJournalEntryIntelligence(sampleEntry()).replayVersion).toBe(1);
  });
});

describe('Task 14.1.1 — Summary Version', () => {
  it('exports AI_SUMMARY_VERSION=1 without changing narrative contract', () => {
    expect(AI_SUMMARY_VERSION).toBe(1);
    expect(RULE_64_SUMMARY_VERSION).toBe(64);
    const entry = sampleEntry();
    const outcome = buildJournalOutcomeAnalysis(entry);
    const root = buildJournalRootCause(entry);
    const evidence = buildJournalEvidence(entry, outcome, root);
    const a = buildJournalAiSummary(entry, outcome, root, evidence, ['win', 'long']);
    const b = buildJournalAiSummary(entry, outcome, root, evidence, []);
    expect(a.summaryVersion).toBe(1);
    expect(a.text).toBe(b.text);
    expect(a.tagsRead).toEqual(['win', 'long']);
    expect(b.tagsRead).toEqual([]);
  });
});

describe('Task 14.1.1 — Source Mapping', () => {
  it('maps every intelligence section to a TI View source', () => {
    expect(RULE_62_SECTION_HAS_SOURCE).toBe(62);
    clearJournalIntelligenceCache();
    const intel = buildJournalEntryIntelligence(sampleEntry());
    const bySection = Object.fromEntries(
      intel.sectionSources.map((s) => [s.section, s.source]),
    );
    expect(bySection.decisionSnapshot).toMatch(/Decision Event #/);
    expect(bySection.marketSnapshot).toMatch(/Market Snapshot #/);
    expect(bySection.advisorTimeline).toBe('Advisor History');
    expect(bySection.outcome).toBe('Trade Summary');
    expect(bySection.aiSummary).toMatch(/Evidence IDs/);
    expect(intel.sectionSources).toHaveLength(10);
    expect(intel.evidence.every((e) => Boolean(e.sectionSource))).toBe(true);
  });
});

describe('Task 14.1.1 — Cache Invalidation', () => {
  it('reuses cache when projectionVersion unchanged; rebuilds when changed', () => {
    expect(RULE_65_INTELLIGENCE_CACHE).toBe(65);
    clearJournalIntelligenceCache();
    const baseTags = [
      'projected',
      'triggerCode:TREND_REVERSAL',
      'strategyVersion:V4_1',
      'confidence:0.81',
      'featureSetVersion:fs-4.1.0',
      'projectionVersion:pv-1',
    ];
    const e1 = sampleEntry({ id: 'cache-t', tags: baseTags });
    const a = buildJournalEntryIntelligence(e1);
    const b = buildJournalEntryIntelligence(e1);
    expect(isJournalIntelligenceCached('cache-t')).toBe(true);
    expect(a).toBe(b);
    expect(a.projectionVersion).toBe('pv-1');

    const e2 = sampleEntry({
      id: 'cache-t',
      tags: [...baseTags.filter((t) => !t.startsWith('projectionVersion:')), 'projectionVersion:pv-2'],
    });
    const c = buildJournalEntryIntelligence(e2);
    expect(c).not.toBe(a);
    expect(c.projectionVersion).toBe('pv-2');
    clearJournalIntelligenceCache('cache-t');
    expect(isJournalIntelligenceCached('cache-t')).toBe(false);
  });
});

describe('Task 14.1.1 — Trade Tags', () => {
  it('derives search-ready tags from TI View without writing Journal', () => {
    const entry = sampleEntry();
    const before = [...(entry.tags ?? [])];
    const tags = deriveIntelligenceTradeTags(entry);
    expect(tags).toEqual(expect.arrayContaining(['long', 'win', 'trend', 'reversal', 'funding', 'whale', 'btc-leading', 'high-confidence', 'tp1', 'move-sl']));
    expect(entry.tags).toEqual(before);
    const intel = buildJournalEntryIntelligence(entry);
    expect(intel.tradeTags).toEqual(tags);
    expect(intel.aiSummary.tagsRead).toEqual(tags);
  });
});

describe('Task 14.1 — Architecture Guard', () => {
  it('intelligence services do not import Engine / Decision / Planner / Adviser / EventStore / Persistence', () => {
    const dir = join(__dirname, '..');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
    for (const f of files) {
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(
        /from ['"].*(positionAdvisorV41|scanV41|eventStore|persistence|dualWrite)/,
      );
      expect(code, f).not.toMatch(
        /computeDecision|planTradeExecution|appendEvent|writeJournalEntry/,
      );
    }
  });
});

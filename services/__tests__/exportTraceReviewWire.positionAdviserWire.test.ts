/**
 * Task 2.3 — Position Trace wire: match OPEN + evaluate selection + no Entry reuse.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiTradeJournalEntry } from '../../constants/aiJournal';
import { LAYER_L5B_ID } from '../../constants/scoring';
import { FinalEntryStatus } from '../../types/scoring';
import type { SignalRow } from '../signalBoardScan';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';
import {
  evaluateOpenPositionForTraceExport,
  matchOpenTradeForSignalRow,
} from '../positionAdviserExportEvaluate';
import * as positionAdvisorV3 from '../positionAdvisorV3';
import * as positionAdvisorV4 from '../positionAdvisorV4';
import * as positionAdvisorV41 from '../v41/positionAdvisorV41';
import type { MarketIntelligenceSnapshot } from '../v41/types';
import type { PositionRecommendation } from '../positionAdvisorV3';

const ENTRY_DISPLAY = 'VÀO TỰ TIN';
const ENTRY_WINRATE = '~70-75%';
const MOCK_REASON = 'MOCK_ADVISER_REASON_NOT_ENTRY';
const MOCK_LABEL = 'MOCK_ADVISER_LABEL_HOLD';
const MOCK_CONFIDENCE = 0.91;

function layer(
  id: number,
  name: string,
  score: number,
  reason: string,
  passed: boolean,
): SignalRow['layers'][number] {
  return {
    layer: id as SignalRow['layers'][number]['layer'],
    name,
    score,
    maxScore: 1.5,
    passed,
    isMandatory: id === 5,
    isMandatoryViolation: false,
    reason,
  };
}

/** Row with scores so scoringResultV3FromSignalRow can succeed when evaluate is not mocked. */
function btcLongRow(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 1.5, 'ema', true),
    layer(2, 'RSI 14 + Divergence', 1.5, 'rsi', true),
    layer(3, 'MACD + Histogram Momentum', 1.5, 'macd', true),
    layer(4, 'Bollinger %B + Bandwidth', 0, 'bb', false),
    layer(5, 'L5a — CVD Strength', 1.5, 'cvd', true),
    layer(LAYER_L5B_ID as SignalRow['layers'][number]['layer'], 'L5b — Volume / OI', 0.75, 'oi', true),
    layer(6, 'Funding Rate + Trend', 0.38, 'fund', true),
    layer(7, 'L/S Ratio + Whale Wall', 0.75, 'ls', true),
    layer(8, 'BTC 24h + 1H Momentum', 1.5, 'btc', true),
    layer(9, 'Phiên giao dịch', 1.5, 'session', true),
    layer(10, 'Tâm lý & Kỷ luật', 1.13, 'psych', true),
  ];
  const groupScores = { A: 4.5, B: 3.4, C: 3.25 };
  return {
    symbol: 'BTCUSDT',
    price: 65000,
    change24h: 0.5,
    trend: 'BULLISH',
    regimeConfidence: 0.65,
    score: 11.15,
    longScore: 11.15,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: ENTRY_DISPLAY,
    winrate: ENTRY_WINRATE,
    canEnter: true,
    tradePlan: null,
    layers,
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
    atr1h: 380,
    groupScores,
    longGroupScores: groupScores,
    longHardBlocks: [],
    shortHardBlocks: [],
    longBlockReasons: [],
    shortBlockReasons: [],
    groupBlocks: [],
    v4: {
      score: 11.15,
      longScore: 11.15,
      shortScore: 4,
      direction: 'LONG',
      decisionLabel: 'VAO_TU_TIN',
      decisionDisplay: ENTRY_DISPLAY,
      winrate: ENTRY_WINRATE,
      canEnter: true,
      layers,
      mandatoryViolations: [],
      hardBlocked: false,
      groupScores,
      longGroupScores: groupScores,
      longHardBlocks: [],
      shortHardBlocks: [],
      longBlockReasons: [],
      shortBlockReasons: [],
      groupBlocks: [],
    },
  };
}

function openTrade(
  overrides: Partial<AiTradeJournalEntry> & {
    id: string;
    timestamp: number;
    direction?: 'LONG' | 'SHORT';
    symbol?: string;
    tags?: string[];
    scorerVersion?: 'v3' | 'v4';
    strategySource?: AiTradeJournalEntry['strategySource'];
  },
): AiTradeJournalEntry {
  const direction = overrides.direction ?? 'LONG';
  const {
    direction: _d,
    scorerVersion,
    strategySource,
    tags,
    id,
    timestamp,
    symbol,
    ...rest
  } = overrides;
  return {
    id,
    timestamp,
    symbol: symbol ?? 'BTCUSDT',
    accountSizeAtEntry: 1000,
    market: {
      entryPrice: 64000,
      priceAtAnalysis: 64000,
      slippage: 0,
      cvdValue: 0,
      cvdTrend: 'FLAT',
      volumeRatio: 1,
      btcChangePct: 0,
      fundingRate: 0,
      topLSRatio: 1,
      oiChangePct: 0,
      sessionType: 'GOOD',
      hourVN: 10,
    },
    scoring: {
      totalScore: 11,
      direction,
      layerScores: {
        l1: 1, l2: 1, l3: 1, l4: 1, l5: 1, l6: 1, l7: 1, l8: 1, l9: 1, l10: 1,
      },
      mandatoryViolations: [],
      decision: 'VAO_TU_TIN',
      scorerVersion: scorerVersion ?? 'v4',
    },
    plan: {
      entryZoneType: 'LIMIT',
      entryZoneOptimal: 64000,
      entryZoneRangeLow: 63800,
      entryZoneRangeHigh: 64200,
      slProposed: 63000,
      slActual: 63000,
      tp1Proposed: 66000,
      tp1Actual: 66000,
      tp2: 67000,
      tp3: 68000,
      rrProposed: 2.5,
      sizeProposed: 100,
      sizeActual: 100,
      isSafeSL: true,
    },
    outcome: { status: 'OPEN' },
    tags: tags ?? [],
    version: '1',
    strategySource: strategySource ?? 'V4',
    ...rest,
  };
}

function minimalV41Snapshot(): MarketIntelligenceSnapshot {
  return {
    trendStrength: 50,
    trendDirection: 'BULL',
    trendExhaustion: 20,
    volumeDivergencePts: 0,
    reversalProbability: 10,
    rsiDivergenceScore: 0,
    cvdDivergenceScore: 0,
    marketConfidence: 60,
    btcAlignmentFactor: 1,
    btcDirection: 'BULL',
    marketState: 'HealthyUptrend',
  } as MarketIntelligenceSnapshot;
}

function mockV3Rec(): PositionRecommendation {
  return {
    type: 'HOLD',
    label: MOCK_LABEL,
    color: '#22c55e',
    confidence: MOCK_CONFIDENCE,
    reasons: [MOCK_REASON],
    urgency: 'MEDIUM',
    matchedRuleCount: 1,
    triggeredBy: 'HOLD_STRONG',
    thesisHealth: {
      score: 70,
      classification: 'HEALTHY',
      components: {
        trend: 1,
        btc: 1,
        volume: 1,
        breakout: 1,
        structure: 1,
        supportResistance: 1,
      },
    },
    thesisState: { state: 'HEALTHY', score: 70, reason: 'ok' },
  };
}

function extractSection(md: string, heading: string): string {
  const needle = `# ${heading}`;
  const start = md.indexOf(needle);
  if (start < 0) return '';
  const after = start + needle.length;
  const next = md.indexOf('\n# ', after);
  return next < 0 ? md.slice(start) : md.slice(start, next);
}

/** True when section has no real adviser payload (only UNAVAILABLE / empty table chrome). */
function sectionIsEffectivelyUnavailable(section: string): boolean {
  const body = section.replace(/^# .+\n*/, '').trim();
  if (body === 'UNAVAILABLE' || body === '') return true;

  const headerHints =
    /^(Check ID|Check Name|Rule ID|Rule Name|Status|Priority|Reason|Recommendation|Evidence|Source|Triggered|Override)$/;

  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l === '--------------------------------') return false;
      if (/^\|[\s|:-]+\|$/.test(l.replace(/\|/g, '|'))) {
        // divider row like | --- | --- |
        const cells = l.split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.every((c) => /^-+$/.test(c))) return false;
      }
      if (l.startsWith('|')) {
        const cells = l.split('|').map((c) => c.trim()).filter(Boolean);
        // header row (no UNAVAILABLE cells, looks like column titles)
        if (cells.some((c) => headerHints.test(c)) && !cells.includes('UNAVAILABLE')) {
          return false;
        }
      }
      // Formatter boilerplate for contribution section
      if (l.startsWith('Contributions are copied')) return false;
      return true;
    });

  if (lines.length === 0) return true;

  return lines.every((l) => {
    if (l === 'UNAVAILABLE') return true;
    if (l.startsWith('|')) {
      return l
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
        .every((c) => c === 'UNAVAILABLE');
    }
    if (l.includes(':')) return /:\s*UNAVAILABLE\s*$/.test(l);
    return false;
  });
}

function exportPosition(args: {
  row?: SignalRow;
  openTrades?: AiTradeJournalEntry[];
  scorerVersion?: 'v3' | 'v4';
  v41SnapshotBySymbol?: Record<string, MarketIntelligenceSnapshot>;
}) {
  return exportTraceOrReviewMarkdown('trace-position', {
    rows: [args.row ?? btcLongRow()],
    scorerVersion: args.scorerVersion ?? 'v4',
    openTrades: args.openTrades,
    v41SnapshotBySymbol: args.v41SnapshotBySymbol,
    exportedAt: '2026-07-21T05:00:00.000Z',
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildPositionTraceMarkdown / Position Trace wire (Task 2.3)', () => {
  it('1 — OPEN match: RULES/CONTRIBUTION/ACTION/SL/TP/RISK filled; CHECKLIST UNAVAILABLE (engine has no checklist)', () => {
    vi.spyOn(positionAdvisorV4, 'evaluatePositionV4').mockReturnValue(mockV3Rec());

    const result = exportPosition({
      openTrades: [openTrade({ id: 't-long', timestamp: 1000, direction: 'LONG' })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;

    const checklist = extractSection(md, 'ADVISER CHECKLIST');
    // Expected UNAVAILABLE — evaluatePosition* does not return a checklist array.
    expect(sectionIsEffectivelyUnavailable(checklist)).toBe(true);

    expect(sectionIsEffectivelyUnavailable(extractSection(md, 'ADVISER RULES'))).toBe(false);
    expect(sectionIsEffectivelyUnavailable(extractSection(md, 'ADVISER CONTRIBUTION'))).toBe(
      false,
    );
    expect(sectionIsEffectivelyUnavailable(extractSection(md, 'POSITION ACTION'))).toBe(false);
    expect(sectionIsEffectivelyUnavailable(extractSection(md, 'STOP LOSS PLAN'))).toBe(false);
    expect(sectionIsEffectivelyUnavailable(extractSection(md, 'TAKE PROFIT PLAN'))).toBe(false);
    expect(sectionIsEffectivelyUnavailable(extractSection(md, 'RISK REVIEW'))).toBe(false);

    expect(md).toContain('HOLD_STRONG');
    expect(md).toContain(MOCK_REASON);
    expect(md).toContain('Current SL: 63000');
    expect(md).toContain('Current TP: 66000');
  });

  it('2 — match-ok Reason/Summary/Confidence differ from Entry decisionDisplay/winrate', () => {
    // Mock values are intentionally distinct from ENTRY_DISPLAY / ENTRY_WINRATE.
    // If a future real-evaluate fixture ever matched Entry strings, document coincidence here —
    // this test uses mocks so equality would only mean the wire still reuses Entry (a bug).
    vi.spyOn(positionAdvisorV4, 'evaluatePositionV4').mockReturnValue(mockV3Rec());

    const result = exportPosition({
      openTrades: [openTrade({ id: 't-long', timestamp: 1000, direction: 'LONG' })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decision = extractSection(result.markdown, 'ADVISER DECISION');
    expect(decision).toContain(`Reason: ${MOCK_REASON}`);
    expect(decision).toContain(`Summary: ${MOCK_LABEL}`);
    expect(decision).toContain(`Confidence: ${MOCK_CONFIDENCE}`);
    expect(decision).not.toContain(`Reason: ${ENTRY_DISPLAY}`);
    expect(decision).not.toContain(`Summary: ${ENTRY_DISPLAY}`);
    expect(decision).not.toContain(`Confidence: ${ENTRY_WINRATE}`);
  });

  it('3a — same symbol, wrong direction only → UNAVAILABLE (no cross-direction fallback)', () => {
    vi.spyOn(positionAdvisorV4, 'evaluatePositionV4');

    const result = exportPosition({
      openTrades: [openTrade({ id: 't-short', timestamp: 2000, direction: 'SHORT' })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(positionAdvisorV4.evaluatePositionV4).not.toHaveBeenCalled();
    const decision = extractSection(result.markdown, 'ADVISER DECISION');
    expect(decision).toMatch(/Reason: UNAVAILABLE/);
    expect(decision).toMatch(/Summary: UNAVAILABLE/);
    expect(decision).toMatch(/Confidence: UNAVAILABLE/);
    expect(decision).not.toContain(ENTRY_DISPLAY);
    expect(decision).not.toContain(ENTRY_WINRATE);
  });

  it('3b — matchOpenTradeForSignalRow ignores opposite direction', () => {
    const trades = [
      openTrade({ id: 'short', timestamp: 9000, direction: 'SHORT' }),
      openTrade({ id: 'long', timestamp: 1000, direction: 'LONG' }),
    ];
    const hit = matchOpenTradeForSignalRow(trades, 'BTCUSDT', 'LONG');
    expect(hit?.id).toBe('long');
  });

  it('4 — same symbol+direction → newest timestamp wins', () => {
    const older = openTrade({ id: 'old', timestamp: 1000, direction: 'LONG' });
    const newer = openTrade({ id: 'new', timestamp: 5000, direction: 'LONG' });
    expect(matchOpenTradeForSignalRow([older, newer], 'BTCUSDT', 'LONG')?.id).toBe('new');
    expect(matchOpenTradeForSignalRow([newer, older], 'BTCUSDT', 'LONG')?.id).toBe('new');

    vi.spyOn(positionAdvisorV4, 'evaluatePositionV4').mockReturnValue(mockV3Rec());
    const result = exportPosition({ openTrades: [older, newer] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain('Trade ID: new');
    expect(positionAdvisorV4.evaluatePositionV4).toHaveBeenCalled();
  });

  it('5 — no OPEN trade → UNAVAILABLE and no Entry decisionDisplay/winrate reuse', () => {
    const spy = vi.spyOn(positionAdvisorV4, 'evaluatePositionV4');
    const result = exportPosition({ openTrades: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(spy).not.toHaveBeenCalled();
    const decision = extractSection(result.markdown, 'ADVISER DECISION');
    expect(decision).toMatch(/Reason: UNAVAILABLE/);
    expect(decision).toMatch(/Summary: UNAVAILABLE/);
    expect(decision).toMatch(/Confidence: UNAVAILABLE/);
    expect(decision).not.toContain(ENTRY_DISPLAY);
    expect(decision).not.toContain(ENTRY_WINRATE);
    expect(sectionIsEffectivelyUnavailable(extractSection(result.markdown, 'ADVISER RULES'))).toBe(
      true,
    );
  });

  it('5b — OPEN match but row lacks groupScores → scores_unavailable (no evaluate, no Entry reuse)', () => {
    // Trigger: scoringResultV3FromSignalRow returns null when snap has neither
    // longGroupScores nor groupScores (incomplete / error SignalRow). Real path.
    const rowNoScores: SignalRow = {
      symbol: 'BTCUSDT',
      price: 65000,
      change24h: 0.5,
      trend: 'BULLISH',
      regimeConfidence: 0.65,
      score: 0,
      longScore: 0,
      shortScore: 0,
      direction: 'LONG',
      decisionLabel: 'VAO_TU_TIN',
      decisionDisplay: ENTRY_DISPLAY,
      winrate: ENTRY_WINRATE,
      canEnter: false,
      tradePlan: null,
      layers: [],
      mandatoryViolations: [],
      hardBlocked: false,
      fromCache: false,
      // intentionally omit groupScores / longGroupScores / v4 score snapshots
    };

    const trade = openTrade({
      id: 't-noscores',
      timestamp: 1000,
      direction: 'LONG',
      scorerVersion: 'v4',
      strategySource: 'V4',
      tags: [],
    });

    const evaluated = evaluateOpenPositionForTraceExport({
      row: rowNoScores,
      storeScorerVersion: 'v4',
      openTrades: [trade],
      v41SnapshotBySymbol: undefined,
      exportedAt: '2026-07-21T05:00:00.000Z',
      direction: 'LONG',
    });
    expect(evaluated.ok).toBe(false);
    if (evaluated.ok) return;
    expect(evaluated.reason).toBe('scores_unavailable');

    const v4Spy = vi.spyOn(positionAdvisorV4, 'evaluatePositionV4');
    const v2Spy = vi.spyOn(positionAdvisorV3, 'evaluatePositionV2');
    const v41Spy = vi.spyOn(positionAdvisorV41, 'evaluatePositionV41');

    const result = exportPosition({
      row: rowNoScores,
      openTrades: [trade],
      scorerVersion: 'v4',
    });
    expect(result.ok).toBe(true);
    expect(v4Spy).not.toHaveBeenCalled();
    expect(v2Spy).not.toHaveBeenCalled();
    expect(v41Spy).not.toHaveBeenCalled();
    if (!result.ok) return;
    const decision = extractSection(result.markdown, 'ADVISER DECISION');
    expect(decision).toMatch(/Reason: UNAVAILABLE/);
    expect(decision).toMatch(/Summary: UNAVAILABLE/);
    expect(decision).toMatch(/Confidence: UNAVAILABLE/);
    expect(decision).not.toContain(ENTRY_DISPLAY);
    expect(decision).not.toContain(ENTRY_WINRATE);
  });

  it('6 — V4.1 entry calls evaluatePositionV41 with lastSnapshot for symbol', () => {
    const snapshot = minimalV41Snapshot();
    const v41Spy = vi.spyOn(positionAdvisorV41, 'evaluatePositionV41').mockReturnValue({
      action: 'HOLD',
      label: 'V41 mock',
      urgency: 'LOW',
      breakEvenSuggested: false,
      breakEvenPrice: null,
      trailingStopSuggested: false,
      trailingStopPrice: null,
      reason: 'V41_MOCK_REASON',
    });
    vi.spyOn(positionAdvisorV4, 'evaluatePositionV4');
    vi.spyOn(positionAdvisorV3, 'evaluatePositionV2');

    const result = exportPosition({
      openTrades: [
        openTrade({
          id: 'v41-t',
          timestamp: 1000,
          direction: 'LONG',
          tags: ['v41'],
        }),
      ],
      v41SnapshotBySymbol: { BTCUSDT: snapshot },
    });
    expect(result.ok).toBe(true);
    expect(v41Spy).toHaveBeenCalledTimes(1);
    expect(v41Spy.mock.calls[0][0].snapshot).toBe(snapshot);
    expect(positionAdvisorV4.evaluatePositionV4).not.toHaveBeenCalled();
    expect(positionAdvisorV3.evaluatePositionV2).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.markdown).toContain('V41_MOCK_REASON');
    }
  });

  it('6b — V4.1 without snapshot → UNAVAILABLE, no V4/V2 fallback', () => {
    const v41Spy = vi.spyOn(positionAdvisorV41, 'evaluatePositionV41');
    const v4Spy = vi.spyOn(positionAdvisorV4, 'evaluatePositionV4');
    const v2Spy = vi.spyOn(positionAdvisorV3, 'evaluatePositionV2');

    const result = exportPosition({
      openTrades: [
        openTrade({ id: 'v41-nosnap', timestamp: 1000, tags: ['v41'] }),
      ],
      v41SnapshotBySymbol: {},
    });
    expect(result.ok).toBe(true);
    expect(v41Spy).not.toHaveBeenCalled();
    expect(v4Spy).not.toHaveBeenCalled();
    expect(v2Spy).not.toHaveBeenCalled();
    if (result.ok) {
      const decision = extractSection(result.markdown, 'ADVISER DECISION');
      expect(decision).toMatch(/Reason: UNAVAILABLE/);
      expect(decision).not.toContain(ENTRY_DISPLAY);
    }
  });

  it("7 — not V4.1 + scorerVersion 'v4' → evaluatePositionV4", () => {
    const v4Spy = vi
      .spyOn(positionAdvisorV4, 'evaluatePositionV4')
      .mockReturnValue(mockV3Rec());
    vi.spyOn(positionAdvisorV3, 'evaluatePositionV2');
    vi.spyOn(positionAdvisorV41, 'evaluatePositionV41');

    exportPosition({
      scorerVersion: 'v4',
      openTrades: [
        openTrade({
          id: 'v4-t',
          timestamp: 1000,
          scorerVersion: 'v4',
          strategySource: 'V4',
          tags: [],
        }),
      ],
    });
    expect(v4Spy).toHaveBeenCalledTimes(1);
    expect(positionAdvisorV3.evaluatePositionV2).not.toHaveBeenCalled();
    expect(positionAdvisorV41.evaluatePositionV41).not.toHaveBeenCalled();
  });

  it("8 — not V4.1 + scorerVersion 'v3' → evaluatePositionV2", () => {
    const v2Spy = vi
      .spyOn(positionAdvisorV3, 'evaluatePositionV2')
      .mockReturnValue(mockV3Rec());
    vi.spyOn(positionAdvisorV4, 'evaluatePositionV4');
    vi.spyOn(positionAdvisorV41, 'evaluatePositionV41');

    exportPosition({
      scorerVersion: 'v3',
      openTrades: [
        openTrade({
          id: 'v3-t',
          timestamp: 1000,
          scorerVersion: 'v3',
          strategySource: 'V3',
          tags: [],
        }),
      ],
    });
    expect(v2Spy).toHaveBeenCalledTimes(1);
    expect(positionAdvisorV4.evaluatePositionV4).not.toHaveBeenCalled();
    expect(positionAdvisorV41.evaluatePositionV41).not.toHaveBeenCalled();
  });
});

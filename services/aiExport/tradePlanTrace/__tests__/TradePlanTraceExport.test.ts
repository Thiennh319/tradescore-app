import { describe, expect, it } from 'vitest';
import type { AiTradeJournalEntry } from '../../../../constants/aiJournal';
import type { TradeDecisionLabel } from '../../../../constants/scoring';
import { FinalEntryStatus } from '../../../../types/scoring';
import { exportTraceOrReviewMarkdown } from '../../../exportTraceReviewWire';
import type { SignalRow } from '../../../signalBoardScan';
import { mockTradePlanV3 } from '../../../tradePlanTestFixtures';
import { buildTradePlanTrace, buildTradePlanTraceExport } from '../index';
import type { TradePlanTraceInput } from '../TradePlanTraceTypes';

function fullInput(): TradePlanTraceInput {
  return {
    metadata: {
      tradeId: 'T-2026-0718-006',
      coin: 'BTCUSDT',
      side: 'LONG',
      strategy: 'TREND',
      timestamp: '2026-07-18T04:00:00.000Z',
      tradePlanVersion: 'tp2.0',
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
    },
    summary: {
      planStatus: 'READY',
      headline: 'Long BTCUSDT on trend continuation',
      summary: 'Score A with confirmed momentum; enter on pullback',
      confidence: 0.84,
      priority: 'HIGH',
    },
    entryPlan: {
      entryPrice: 106150,
      entryZone: '106000 - 106300',
      preferredEntry: 106100,
      maximumEntry: 106400,
      reason: 'Pullback into demand zone with EMA support',
    },
    riskPlan: {
      stopLoss: 105400,
      riskPct: 1,
      maximumLoss: 100,
      riskReward: 2.5,
      positionSize: 0.5,
      leverage: 5,
      reason: 'SL below structure low and whale support',
    },
    targetPlan: {
      tp1: 107200,
      tp2: 108000,
      tp3: 109500,
      scaleOut: '40% at TP1, 30% at TP2',
      trailing: 'Activate after TP1',
      breakEven: 'Move SL to entry after TP1',
    },
    executionPlan: {
      currentStep: 'WAIT_FOR_ENTRY_ZONE',
      nextStep: 'PLACE_LIMIT_ORDER',
      trigger: 'Price enters 106000 - 106300',
      condition: 'Score remains >= 80',
      fallback: 'Cancel if price breaks 105400 first',
    },
    positionManagement: {
      initialAdviserState: 'MONITOR',
      expectedAdviserState: 'PROTECT_PROFIT after TP1',
      protection: 'Break even after TP1',
      scaleOut: '40/30/30',
      closeCondition: 'Hard exit rule or TP3',
    },
    ruleReferences: [
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        decisionSource: 'RuleBook',
        evidenceReference: '01_RULEBOOK.md#R-101',
      },
      {
        ruleId: 'R-205',
        ruleName: 'Volume Confirmation',
        decisionSource: 'RuleBook',
        evidenceReference: '01_RULEBOOK.md#R-205',
      },
    ],
    contribution: {
      entry: 'Rule Trace + Entry Engine',
      risk: 'Risk Module',
      targets: 'Structure levels',
      management: 'Position Adviser plan',
      timing: 'London session window',
    },
    blockers: [
      {
        blocker: 'Funding spike above 0.05',
        requiredUnlock: 'Funding back below 0.02',
        reason: 'Avoid crowded long entries',
        evidence: [{ label: 'Funding', value: 0.008 }],
      },
    ],
    cancellation: {
      cancelCondition: 'Price closes below 105400 before entry',
      reason: 'Structure invalidated',
      evidence: [{ label: 'Structure Low', value: 105400 }],
    },
    crossReferences: {
      entryDecision: 'ENTER',
      positionState: 'NONE',
    },
  };
}

const SECTIONS = [
  '# Metadata',
  '# TRADE PLAN SUMMARY',
  '# ENTRY PLAN',
  '# RISK PLAN',
  '# TARGET PLAN',
  '# EXECUTION PLAN',
  '# POSITION MANAGEMENT PLAN',
  '# RULE REFERENCES',
  '# DEPENDENCIES',
  '# TRADEPLAN CONTRIBUTION',
  '# PLAN BLOCKERS',
  '# PLAN CANCELLATION',
  '# CONFLICT DETECTION',
  '# AI REVIEW',
];

describe('TASK 16.6 TradePlan Trace Export', () => {
  it('Empty — exports every section with UNAVAILABLE', () => {
    const md = buildTradePlanTraceExport({});
    for (const section of SECTIONS) {
      expect(md).toContain(section);
    }
    expect(md).toContain('Plan Status: UNAVAILABLE');
    expect(md).toContain('Entry Price: UNAVAILABLE');
    expect(md).toContain('Stop Loss: UNAVAILABLE');
    expect(md).toContain('Cancel Condition: UNAVAILABLE');
    expect(md).toContain('Conflict: NO');
  });

  it('READY — plan status, headline and confidence are copied', () => {
    const md = buildTradePlanTraceExport(fullInput());
    expect(md).toContain('Plan Status: READY');
    expect(md).toContain('Headline: Long BTCUSDT on trend continuation');
    expect(md).toContain('Confidence: 0.84');
    expect(md).toContain('Priority: HIGH');
    expect(md).toContain('Conflict: NO');
  });

  it('WAIT — status is copied verbatim without promotion', () => {
    const input = fullInput();
    input.summary = { ...input.summary, planStatus: 'WAIT' };
    const md = buildTradePlanTraceExport(input);
    expect(md).toContain('Plan Status: WAIT');
    expect(md).not.toContain('Plan Status: READY');
    expect(md).toContain('Conflict: NO');
  });

  it('CANCELLED — status and cancellation plan are exported', () => {
    const input = fullInput();
    input.summary = { ...input.summary, planStatus: 'CANCELLED' };
    const md = buildTradePlanTraceExport(input);
    expect(md).toContain('Plan Status: CANCELLED');
    expect(md).toContain(
      'Cancel Condition: Price closes below 105400 before entry',
    );
  });

  it('Risk Plan — all risk fields copied, never recalculated', () => {
    // riskReward is intentionally inconsistent with SL/TP: the exporter
    // must copy it verbatim instead of recomputing it.
    const input = fullInput();
    input.riskPlan = { ...input.riskPlan, riskReward: 99 };
    const md = buildTradePlanTraceExport(input);
    expect(md).toContain('Stop Loss: 105400');
    expect(md).toContain('Risk %: 1');
    expect(md).toContain('Maximum Loss: 100');
    expect(md).toContain('Risk Reward: 99');
    expect(md).toContain('Position Size: 0.5');
    expect(md).toContain('Leverage: 5');
  });

  it('Target Plan — TP levels, scale out, trailing and break even', () => {
    const md = buildTradePlanTraceExport(fullInput());
    expect(md).toContain('TP1: 107200');
    expect(md).toContain('TP2: 108000');
    expect(md).toContain('TP3: 109500');
    expect(md).toContain('Scale Out: 40% at TP1, 30% at TP2');
    expect(md).toContain('Trailing: Activate after TP1');
    expect(md).toContain('Break Even: Move SL to entry after TP1');
  });

  it('Execution Plan — steps, trigger, condition and fallback', () => {
    const md = buildTradePlanTraceExport(fullInput());
    expect(md).toContain('Current Step: WAIT_FOR_ENTRY_ZONE');
    expect(md).toContain('Next Step: PLACE_LIMIT_ORDER');
    expect(md).toContain('Trigger: Price enters 106000 - 106300');
    expect(md).toContain('Condition: Score remains >= 80');
    expect(md).toContain('Fallback: Cancel if price breaks 105400 first');
  });

  it('Cancellation — condition, reason and evidence rendered', () => {
    const md = buildTradePlanTraceExport(fullInput());
    expect(md).toContain(
      'Cancel Condition: Price closes below 105400 before entry',
    );
    expect(md).toContain('Reason: Structure invalidated');
    expect(md).toContain('Evidence: Structure Low=105400');
  });

  it('Conflict — structural scenarios detected from frozen references only', () => {
    const readyWhileWait = fullInput();
    readyWhileWait.crossReferences = {
      entryDecision: 'WAIT',
      positionState: 'NONE',
    };
    const md1 = buildTradePlanTraceExport(readyWhileWait);
    expect(md1).toContain('Conflict: YES');
    expect(md1).toContain('Reason: Plan READY while Entry decision is WAIT');

    const activeWhileClosed = fullInput();
    activeWhileClosed.summary = { ...activeWhileClosed.summary, planStatus: 'ACTIVE' };
    activeWhileClosed.crossReferences = {
      entryDecision: 'ENTER',
      positionState: 'CLOSED',
    };
    const md2 = buildTradePlanTraceExport(activeWhileClosed);
    expect(md2).toContain('Conflict: YES');
    expect(md2).toContain('Reason: TradePlan ACTIVE while Position CLOSED');

    // Consistent plan has no conflict.
    const md3 = buildTradePlanTraceExport(fullInput());
    expect(md3).toContain('Conflict: NO');
  });

  it('Stable — deterministic, byte-identical and input remains untouched', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    const md1 = buildTradePlanTraceExport(input);
    const md2 = buildTradePlanTraceExport(input);
    const md3 = buildTradePlanTraceExport(fullInput());
    expect(md1).toBe(md2);
    expect(md1).toBe(md3);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('Markdown — sections appear in order with rule table and AI review', () => {
    const md = buildTradePlanTraceExport(fullInput());
    let cursor = -1;
    for (const section of SECTIONS) {
      const next = md.indexOf(section);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(md).toContain(
      '| Rule ID | Rule Name | Decision Source | Evidence Reference |',
    );
    expect(md).toContain(
      '| R-101 | Trend Continuation | RuleBook | 01_RULEBOOK.md#R-101 |',
    );
    expect(md).toContain('| Review Item | Result | Notes |');
    expect(md).toContain('| TradePlan Consistency | □ | |');
    expect(md).toContain('Rule Trace: SEE 01_RULEBOOK.md');
    expect(md).toContain('Position Adviser Trace: SEE 04_POSITION_ADVISER.md');
  });

  it('No Undefined — missing values never leak the undefined literal', () => {
    const md = buildTradePlanTraceExport({
      summary: { planStatus: 'WAIT', headline: undefined },
      entryPlan: { entryPrice: undefined, reason: undefined },
      ruleReferences: [{ ruleId: 'R-1', ruleName: undefined }],
      blockers: [{ blocker: undefined, evidence: undefined }],
    });
    expect(md).not.toContain('undefined');
    expect(md).toContain('Headline: UNAVAILABLE');
    expect(md).toContain('| R-1 | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |');
  });

  it('No Null — no null literal, no object dump, contribution copied only', () => {
    const md = buildTradePlanTraceExport({
      metadata: null,
      summary: null,
      entryPlan: null,
      riskPlan: null,
      targetPlan: null,
      executionPlan: null,
      positionManagement: null,
      ruleReferences: null,
      contribution: { entry: 'COPIED-ENTRY', timing: null },
      blockers: null,
      cancellation: null,
      crossReferences: null,
    });
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{');
    expect(md).toContain('Entry: COPIED-ENTRY');
    expect(md).toContain('Timing: UNAVAILABLE');

    const trace = buildTradePlanTrace({ contribution: { entry: 'COPIED-ENTRY' } });
    expect(trace.contribution.entry).toBe('COPIED-ENTRY');
  });
});

function minimalOpenTrade(
  overrides: Partial<AiTradeJournalEntry> & Pick<AiTradeJournalEntry, 'id' | 'timestamp'>,
): AiTradeJournalEntry {
  const direction = overrides.scoring?.direction ?? 'LONG';
  // Same pattern as exportTraceReviewWire.positionAdviserWire.test.ts openTrade():
  // pull required id/timestamp out so ...rest cannot re-specify them (TS2783).
  const { id, timestamp, ...rest } = overrides;
  return {
    id,
    timestamp,
    symbol: 'BTCUSDT',
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
      decision: 'VAO_TU_TIN',
      scorerVersion: 'v4',
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
    tags: [],
    version: '1',
    ...rest,
  };
}

function tradePlanWireRow(overrides: Partial<SignalRow> = {}): SignalRow {
  const plan = mockTradePlanV3({ symbol: 'BTCUSDT', direction: 'LONG', isValid: true });
  const snap = {
    score: 11,
    longScore: 11,
    shortScore: 4,
    direction: 'LONG' as const,
    decisionLabel: 'CO_THE_VAO' as TradeDecisionLabel,
    decisionDisplay: 'Có thể vào',
    winrate: '58%',
    canEnter: false,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
  };
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.7,
    score: 11,
    longScore: 11,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'Có thể vào',
    winrate: '58%',
    canEnter: false,
    tradePlan: null,
    layers: [],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
    tradePlansByScorer: { v4: plan },
    v4: snap,
    ...overrides,
  };
}

function tradePlanTraceMarkdown(
  row: SignalRow,
  openTrades?: readonly AiTradeJournalEntry[],
): string {
  const result = exportTraceOrReviewMarkdown('trace-tradeplan', {
    rows: [row],
    scorerVersion: 'v4',
    exportedAt: '2026-07-21T00:00:00.000Z',
    openTrades,
  });
  expect(result.ok).toBe(true);
  return result.ok ? result.markdown : '';
}

describe('TASK 5/6 — positionState wire + detectConflict rule 3', () => {
  describe('wire — positionState from openTrades', () => {
    it('empty or undefined openTrades → Position State NONE', () => {
      const row = tradePlanWireRow();
      for (const openTrades of [undefined, [] as AiTradeJournalEntry[]]) {
        const md = tradePlanTraceMarkdown(row, openTrades);
        expect(md).toContain('Position State (frozen reference): NONE');
        expect(md).not.toContain('Position State (frozen reference): OPEN');
      }
    });

    it('no matching symbol+direction in openTrades → Position State NONE', () => {
      const row = tradePlanWireRow();
      const md = tradePlanTraceMarkdown(row, [
        minimalOpenTrade({
          id: 't-short',
          timestamp: 1,
          symbol: 'BTCUSDT',
          scoring: {
            totalScore: 11,
            direction: 'SHORT',
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
            decision: 'VAO_TU_TIN',
            scorerVersion: 'v4',
          },
        }),
      ]);
      expect(md).toContain('Position State (frozen reference): NONE');
    });

    it('matching OPEN trade → Position State OPEN', () => {
      const row = tradePlanWireRow();
      const md = tradePlanTraceMarkdown(row, [
        minimalOpenTrade({ id: 't-open', timestamp: 1_700_000_000_000 }),
      ]);
      expect(md).toContain('Position State (frozen reference): OPEN');
      expect(md).not.toContain('Position State (frozen reference): NONE');
    });
  });

  describe('builder — WAIT/AVOID + OPEN conflict rule', () => {
    it('WAIT + OPEN → Conflict YES with entry/position reason', () => {
      const md = buildTradePlanTraceExport({
        crossReferences: { entryDecision: 'WAIT', positionState: 'OPEN' },
      });
      expect(md).toContain('Conflict: YES');
      expect(md).toContain('Reason: Entry decision is WAIT while Position is OPEN');
    });

    it('AVOID + OPEN → Conflict YES with entry/position reason', () => {
      const md = buildTradePlanTraceExport({
        crossReferences: { entryDecision: 'AVOID', positionState: 'OPEN' },
      });
      expect(md).toContain('Conflict: YES');
      expect(md).toContain('Reason: Entry decision is AVOID while Position is OPEN');
    });

    it('WAIT + NONE → Conflict NO (rule 3 must not fire)', () => {
      const md = buildTradePlanTraceExport({
        crossReferences: { entryDecision: 'WAIT', positionState: 'NONE' },
      });
      expect(md).toContain('Conflict: NO');
      expect(md).not.toContain('Entry decision is WAIT while Position is OPEN');
    });
  });

  it('regression — CANCELLED + WAIT + NONE is not a conflict', () => {
    // Confirms original bug (false hard-coded OPEN) is fixed at the wire layer;
    // WAIT + no real open position is NOT a conflict.
    const md = buildTradePlanTraceExport({
      summary: { planStatus: 'CANCELLED' },
      crossReferences: { entryDecision: 'WAIT', positionState: 'NONE' },
    });
    expect(md).toContain('Plan Status: CANCELLED');
    expect(md).toContain('Position State (frozen reference): NONE');
    expect(md).toContain('Conflict: NO');
    expect(md).not.toContain('Conflict: YES');
  });
});

/**
 * TASK 17.5 — TradePlan Review Export tests.
 *
 * Verifies TRADEPLAN_REVIEW.md: self-contained, copy-only, deterministic,
 * 21 sections in frozen order, structural conflict detection, blank
 * workflow templates, no mutation, no undefined/null, no JSON dump.
 */

import { describe, expect, test } from 'vitest';

import { buildTradePlanReviewExport } from '../TradePlanReviewExport';
import type { TradePlanReviewInput } from '../TradePlanReviewTypes';

const SECTION_ORDER = [
  '# REVIEW MISSION',
  '# Metadata',
  '# MARKET SNAPSHOT',
  '# TRADEPLAN SUMMARY',
  '# ENTRY PLAN',
  '# RISK PLAN',
  '# TARGET PLAN',
  '# EXECUTION PLAN',
  '# POSITION MANAGEMENT',
  '# RULE REFERENCES',
  '# EVIDENCE',
  '# PLAN BLOCKERS',
  '# CANCELLATION PLAN',
  '# REVIEW FOCUS',
  '# CONFLICT DETECTION',
  '# AI REVIEW',
  '# CURSOR IMPLEMENTATION PROMPT',
  '# PATCH REQUIREMENTS',
  '# FIX VALIDATION CHECKLIST',
  '# NEXT REVIEW',
  '# FINAL VERDICT',
] as const;

function fullInput(): TradePlanReviewInput {
  return {
    metadata: {
      version: '1',
      tradeId: 'TP-2024-0091',
      coin: 'BTCUSDT',
      side: 'LONG',
      strategy: 'Trend Continuation',
      timestamp: '2024-06-01T09:30:00Z',
      tradePlanVersion: 'tradeplan-2.4.0',
      ruleVersion: 'rulebook-4.1.0',
      engineVersion: 'engine-5.2.1',
    },
    marketSnapshot: {
      Price: 64250.5,
      Trend: 'UP',
      ADX: 27.4,
      'RSI(14)': 58.2,
      Volume: '1.42B',
    },
    summary: {
      status: 'READY',
      headline: 'Long BTC on trend continuation',
      summary: 'All entry conditions satisfied, waiting for fill.',
      confidence: 'HIGH',
      priority: 'P1',
    },
    entryPlan: {
      entryPrice: 64200,
      entryZone: '64000 - 64400',
      preferredEntry: 64150,
      maximumEntry: 64400,
      reason: 'Pullback to broken resistance',
    },
    riskPlan: {
      stopLoss: 63100,
      riskPct: '1.0%',
      maximumLoss: '100 USDT',
      riskReward: '2.8', // intentionally NOT recomputable from copied values
      positionSize: '0.09 BTC',
      leverage: 'x3',
      reason: 'SL below structure low',
    },
    targetPlan: {
      tp1: 65800,
      tp2: 67200,
      tp3: 69500,
      scaleOut: '40% at TP1, 40% at TP2',
      breakEven: 'Move SL to entry after TP1',
      trailing: 'ATR trailing after TP2',
    },
    executionPlan: {
      currentStep: 'WAIT FOR FILL',
      nextStep: 'PLACE SL AND TP',
      trigger: 'Limit order filled',
      condition: 'Price inside entry zone',
      fallback: 'Cancel if zone invalidated',
    },
    positionManagement: {
      initialAdviserState: 'HOLD',
      expectedAdviserState: 'PROTECT',
      protection: 'Break even after TP1',
      scaleOut: 'Partial close at TP1/TP2',
      closeCondition: 'Hard exit rule or TP3',
    },
    ruleReferences: [
      {
        ruleId: 'TPL-001',
        ruleName: 'Trend Alignment',
        module: 'TradePlan',
        priority: 'HIGH',
        evidence: 'Trend=UP, ADX=27.4',
      },
      {
        ruleId: 'TPL-014',
        ruleName: 'Risk Cap',
        module: 'TradePlan',
        priority: 'CRITICAL',
        evidence: 'Risk=1.0% <= 1.0%',
      },
    ],
    ruleEvidence: [
      {
        ruleId: 'TPL-001',
        ruleName: 'Trend Alignment',
        evidence: [
          { label: 'Trend', value: 'UP' },
          { label: 'ADX', value: 27.4 },
        ],
      },
      {
        ruleId: 'TPL-014',
        ruleName: 'Risk Cap',
        evidence: [{ label: 'Risk', value: '1.0%' }],
      },
    ],
    blockers: [
      {
        blocker: 'Funding window',
        requiredUnlock: 'Funding settlement passed',
        reason: 'Avoid entry 5m around funding',
        evidence: [{ label: 'Funding In', value: '3m' }],
      },
    ],
    cancellation: {
      cancelCondition: 'Close below 63400 on H1',
      reason: 'Entry structure invalidated',
      evidence: [{ label: 'Structure Low', value: 63400 }],
    },
    crossReferences: {
      entryDecision: 'ENTER',
      positionState: 'OPEN',
      cancellationTriggered: false,
    },
  };
}

describe('buildTradePlanReviewExport (TASK 17.5)', () => {
  test('empty export renders all 21 sections with UNAVAILABLE and no conflict', () => {
    const md = buildTradePlanReviewExport({});
    for (const title of SECTION_ORDER) {
      expect(md).toContain(title);
    }
    expect(md).toContain('UNAVAILABLE');
    expect(md).toContain('Conflict: NO');
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('null');
  });

  test('metadata is copied verbatim', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Trade ID: TP-2024-0091');
    expect(md).toContain('Coin: BTCUSDT');
    expect(md).toContain('Side: LONG');
    expect(md).toContain('Strategy: Trend Continuation');
    expect(md).toContain('Timestamp: 2024-06-01T09:30:00Z');
    expect(md).toContain('TradePlan Version: tradeplan-2.4.0');
    expect(md).toContain('Rule Version: rulebook-4.1.0');
    expect(md).toContain('Engine Version: engine-5.2.1');
  });

  test('market snapshot copies values with keys sorted', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Price: 64250.5');
    expect(md).toContain('RSI(14): 58.2');
    const adx = md.indexOf('ADX: 27.4');
    const price = md.indexOf('Price: 64250.5');
    const trend = md.indexOf('Trend: UP');
    const volume = md.indexOf('Volume: 1.42B');
    expect(adx).toBeGreaterThan(-1);
    expect(adx).toBeLessThan(price);
    expect(price).toBeLessThan(trend);
    expect(trend).toBeLessThan(volume);
  });

  test('tradeplan summary is copied verbatim', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Status: READY');
    expect(md).toContain('Headline: Long BTC on trend continuation');
    expect(md).toContain('Summary: All entry conditions satisfied, waiting for fill.');
    expect(md).toContain('Confidence: HIGH');
    expect(md).toContain('Priority: P1');
  });

  test('entry plan is copied verbatim', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Entry Price: 64200');
    expect(md).toContain('Entry Zone: 64000 - 64400');
    expect(md).toContain('Preferred Entry: 64150');
    expect(md).toContain('Maximum Entry: 64400');
    expect(md).toContain('Reason: Pullback to broken resistance');
  });

  test('risk plan is copied verbatim and RR never recomputed', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Stop Loss: 63100');
    expect(md).toContain('Risk %: 1.0%');
    expect(md).toContain('Maximum Loss: 100 USDT');
    expect(md).toContain('Risk Reward: 2.8');
    expect(md).toContain('Position Size: 0.09 BTC');
    expect(md).toContain('Leverage: x3');
  });

  test('target plan is copied verbatim', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('TP1: 65800');
    expect(md).toContain('TP2: 67200');
    expect(md).toContain('TP3: 69500');
    expect(md).toContain('Scale Out: 40% at TP1, 40% at TP2');
    expect(md).toContain('Break Even: Move SL to entry after TP1');
    expect(md).toContain('Trailing: ATR trailing after TP2');
  });

  test('execution plan is copied verbatim', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Current Step: WAIT FOR FILL');
    expect(md).toContain('Next Step: PLACE SL AND TP');
    expect(md).toContain('Trigger: Limit order filled');
    expect(md).toContain('Condition: Price inside entry zone');
    expect(md).toContain('Fallback: Cancel if zone invalidated');
  });

  test('position management is copied verbatim', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Initial Adviser State: HOLD');
    expect(md).toContain('Expected Adviser State: PROTECT');
    expect(md).toContain('Protection: Break even after TP1');
    expect(md).toContain('Close Condition: Hard exit rule or TP3');
  });

  test('rule references render as a table', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('| Rule ID | Rule Name | Module | Priority | Evidence |');
    expect(md).toContain(
      '| TPL-001 | Trend Alignment | TradePlan | HIGH | Trend=UP, ADX=27.4 |',
    );
    expect(md).toContain(
      '| TPL-014 | Risk Cap | TradePlan | CRITICAL | Risk=1.0% <= 1.0% |',
    );
  });

  test('evidence is deduplicated by rule id — first wins', () => {
    const input: TradePlanReviewInput = {
      ruleEvidence: [
        {
          ruleId: 'TPL-001',
          ruleName: 'Trend Alignment',
          evidence: [{ label: 'Trend', value: 'UP' }],
        },
        {
          ruleId: 'TPL-001',
          ruleName: 'Trend Alignment (dup)',
          evidence: [{ label: 'Trend', value: 'DOWN' }],
        },
      ],
    };
    const md = buildTradePlanReviewExport(input);
    expect(md.match(/TPL-001/g)).toHaveLength(1);
    expect(md).toContain('Evidence: Trend=UP');
    expect(md).not.toContain('Trend=DOWN');
    expect(md).not.toContain('(dup)');
  });

  test('plan blockers render as a table', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('| Current Blocker | Required Unlock | Reason | Evidence |');
    expect(md).toContain(
      '| Funding window | Funding settlement passed | Avoid entry 5m around funding | Funding In=3m |',
    );
  });

  test('cancellation plan is copied verbatim', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Cancel Condition: Close below 63400 on H1');
    expect(md).toContain('Reason: Entry structure invalidated');
    expect(md).toContain('Evidence: Structure Low=63400');
  });

  test('conflict: READY + Entry WAIT → YES', () => {
    const input = fullInput();
    input.crossReferences = { ...input.crossReferences, entryDecision: 'WAIT' };
    const md = buildTradePlanReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain('Reason: Plan READY while Entry decision WAIT');
  });

  test('conflict: READY + Cancellation TRUE → YES', () => {
    const input = fullInput();
    input.crossReferences = { ...input.crossReferences, cancellationTriggered: true };
    const md = buildTradePlanReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain('Reason: Plan READY while Cancellation TRUE');
  });

  test('conflict: ACTIVE + Position CLOSED → YES', () => {
    const input = fullInput();
    input.summary = { ...input.summary, status: 'ACTIVE' };
    input.crossReferences = { ...input.crossReferences, positionState: 'CLOSED' };
    const md = buildTradePlanReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain('Reason: Plan ACTIVE while Position CLOSED');
  });

  test('consistent snapshot reports Conflict: NO', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('Conflict: NO');
    expect(md).not.toContain('Conflict: YES');
  });

  describe('TASK 5/6 — WAIT/AVOID + OPEN conflict rule', () => {
    test('WAIT + OPEN → Conflict YES with entry/position reason', () => {
      const md = buildTradePlanReviewExport({
        crossReferences: { entryDecision: 'WAIT', positionState: 'OPEN' },
      });
      expect(md).toContain('Conflict: YES');
      expect(md).toContain('Reason: Entry decision is WAIT while Position is OPEN');
    });

    test('AVOID + OPEN → Conflict YES with entry/position reason', () => {
      const md = buildTradePlanReviewExport({
        crossReferences: { entryDecision: 'AVOID', positionState: 'OPEN' },
      });
      expect(md).toContain('Conflict: YES');
      expect(md).toContain('Reason: Entry decision is AVOID while Position is OPEN');
    });

    test('WAIT + NONE → Conflict NO (rule must not fire)', () => {
      const md = buildTradePlanReviewExport({
        crossReferences: { entryDecision: 'WAIT', positionState: 'NONE' },
      });
      expect(md).toContain('Conflict: NO');
      expect(md).not.toContain('Entry decision is WAIT while Position is OPEN');
    });
  });

  test('AI REVIEW blank template contains all mandated rows, exporter fills nothing', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).toContain('| Review Item | Result | Severity | Notes |');
    for (const row of [
      'Wrong Entry Plan',
      'Wrong Risk Plan',
      'Wrong TP Plan',
      'Wrong Execution Plan',
      'Wrong Position Plan',
      'Wrong Blocker',
      'Wrong Cancellation',
      'Missing Evidence',
      'Need Optimization',
      'Code Modification Required',
    ]) {
      expect(md).toContain(`| ${row} | □ | | |`);
    }
  });

  test('CURSOR IMPLEMENTATION PROMPT is a blank template', () => {
    const md = buildTradePlanReviewExport(fullInput());
    for (const field of [
      'Module',
      'Problem',
      'Current Behavior',
      'Expected Behavior',
      'Root Cause',
      'Suggested Fix',
      'Allowed Files',
      'Forbidden Files',
      'Acceptance Criteria',
    ]) {
      expect(md).toContain(`| ${field} | |`);
    }
  });

  test('PATCH REQUIREMENTS contains all six blank subsections', () => {
    const md = buildTradePlanReviewExport(fullInput());
    for (const heading of [
      '### Allowed Files',
      '### Forbidden Files',
      '### Allowed Changes',
      '### Forbidden Changes',
      '### Regression Requirement',
      '### Architecture Requirement',
    ]) {
      expect(md).toContain(heading);
    }
  });

  test('FIX VALIDATION CHECKLIST has exactly 9 rows', () => {
    const md = buildTradePlanReviewExport(fullInput());
    const rows = [
      'Only TradePlan changed',
      'RuleBook unchanged',
      'Score unchanged',
      'Entry unchanged',
      'Position Adviser unchanged',
      'Public API unchanged',
      'Tests PASS',
      'Regression PASS',
      'Stable Output',
    ];
    for (const row of rows) {
      expect(md).toContain(`| ${row} | □ |`);
    }
    const checklist = md
      .slice(md.indexOf('# FIX VALIDATION CHECKLIST'), md.indexOf('# NEXT REVIEW'))
      .split('\n')
      .filter((line) => /^\| .+ \| □ \|$/.test(line));
    expect(checklist).toHaveLength(9);
  });

  test('FINAL VERDICT is the last markdown section', () => {
    const md = buildTradePlanReviewExport(fullInput());
    const verdict = md.indexOf('# FINAL VERDICT');
    expect(verdict).toBeGreaterThan(-1);
    expect(md.indexOf('#', verdict + 1)).toBe(-1);
    expect(md).toContain('- [ ] PASS');
    expect(md).toContain('- [ ] PASS WITH MINOR ISSUE');
    expect(md).toContain('- [ ] PASS WITH MAJOR ISSUE');
    expect(md).toContain('- [ ] INVALID');
  });

  test('sections appear in the exact frozen order', () => {
    const md = buildTradePlanReviewExport(fullInput());
    let cursor = -1;
    for (const title of SECTION_ORDER) {
      const index = md.indexOf(title);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }
  });

  test('output is stable and byte identical for the same input', () => {
    const a = buildTradePlanReviewExport(fullInput());
    const b = buildTradePlanReviewExport(fullInput());
    expect(a).toBe(b);
    const bytesA = new TextEncoder().encode(a);
    const bytesB = new TextEncoder().encode(b);
    expect(bytesA.length).toBe(bytesB.length);
    expect(bytesA.every((byte, index) => byte === bytesB[index])).toBe(true);
  });

  test('input is never mutated', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    buildTradePlanReviewExport(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  test('no undefined, no null, no JSON dump, self-contained', () => {
    const md = buildTradePlanReviewExport(fullInput());
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{"');
    for (const trace of [
      'RULEBOOK_TRACE',
      'SCORE_TRACE',
      'ENTRY_TRACE',
      'POSITION_TRACE',
      'TRADEPLAN_TRACE',
    ]) {
      expect(md).not.toContain(trace);
    }
  });
});

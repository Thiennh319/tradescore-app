import { describe, expect, it } from 'vitest';
import { buildEntryTrace, buildEntryTraceExport } from '../index';
import type {
  EntryTraceCheck,
  EntryTraceInput,
} from '../EntryTraceTypes';

function check(partial: Partial<EntryTraceCheck> = {}): EntryTraceCheck {
  return {
    id: 'EC-001',
    name: 'Trend',
    status: 'PASS',
    weight: 20,
    reason: 'Bullish alignment',
    recommendation: 'Keep',
    evidence: [
      { label: 'EMA20', value: 106210 },
      { label: 'EMA50', value: 105900 },
    ],
    actual: 'EMA20 > EMA50 > EMA200',
    expected: 'EMA20 > EMA50 > EMA200',
    unit: 'price',
    source: 'Trend Module',
    contribution: 'PASS',
    dependency: 'Trend Module',
    enabled: true,
    ...partial,
  };
}

function fullInput(): EntryTraceInput {
  return {
    metadata: {
      tradeId: 'T-2026-0718-004',
      coin: 'BTCUSDT',
      side: 'LONG',
      timestamp: '2026-07-18T04:00:00.000Z',
      ruleVersion: 'r5.0',
      entryVersion: 'e2.1',
      scoreVersion: 's2.0',
      engineVersion: 'v4.1',
    },
    inputSnapshot: {
      EMA20: 106210,
      'EMA Slope': 0.42,
      Trend: 'UP',
      Momentum: 'NEUTRAL',
      RSI: 58.2,
      MACD: 120.5,
      Volume: 2050000,
      Funding: 0.012,
      OI: 245000000,
      CVD: 320000,
      Whale: 105500,
      ATR: 850,
      Spread: 0.03,
      Liquidity: 5200000,
      Support: 105500,
      Resistance: 107200,
      'Risk Reward': 2.5,
      Timing: 'LONDON',
      'RuleBook State': 'BLOCKED',
      'Current Score': 82,
    },
    decision: {
      decision: 'WAIT',
      reason: 'Funding hard block active',
      summary: 'Setup valid but funding extreme',
      confidence: 0.62,
      grade: 'B',
      recommendation: 'Wait for funding reset',
    },
    decisionTree: [
      { stage: 'Trend', result: 'PASS', detail: 'Bullish alignment' },
      { stage: 'Momentum', result: 'PASS', detail: 'RSI neutral-bullish' },
      { stage: 'Volume', result: 'FAIL', detail: 'Ratio 0.84 below 1.20' },
      { stage: 'Liquidity', result: 'PASS', detail: 'Spread 0.03%' },
      { stage: 'Risk', result: 'PASS', detail: 'RR 2.5' },
      { stage: 'RuleBook', result: 'BLOCKED', detail: 'Funding hard block' },
      { stage: 'Entry Score', result: '82', detail: 'Grade B' },
      { stage: 'Decision', result: 'WAIT', detail: 'Hard block override' },
    ],
    checks: [
      check(),
      check({
        id: 'EC-002',
        name: 'Volume',
        status: 'FAIL',
        weight: 15,
        reason: 'Volume below threshold',
        recommendation: 'Wait for confirmation',
        evidence: [{ label: 'Ratio', value: 0.84 }],
        actual: '0.84',
        expected: '>=1.20',
        unit: 'x MA20',
        source: 'Volume Module',
        contribution: 'FAIL',
        dependency: 'Volume Module',
      }),
      check({
        id: 'EC-003',
        name: 'Whale',
        status: 'WARNING',
        weight: 10,
        reason: 'Buy wall thin',
        recommendation: 'Monitor order book',
        evidence: [{ label: 'Buy Wall', value: 105500 }],
        actual: 'Thin wall',
        expected: 'Strong wall near support',
        unit: 'USDT',
        source: 'OrderBook Module',
        contribution: 'WARNING',
        dependency: 'OrderBook Module',
      }),
    ],
    blockers: [
      {
        type: 'HARD',
        trigger: 'FUNDING_EXTREME',
        override: true,
        rule: 'FUNDING_EXTREME',
        reason: 'Funding 0.12% above 0.10% limit',
        priority: 95,
        evidence: [{ label: 'Funding', value: 0.012 }],
      },
      {
        type: 'SOFT',
        trigger: 'LOW_VOLUME',
        override: false,
        rule: 'VOLUME_CONFIRMATION',
        reason: 'Volume ratio 0.84',
        priority: 90,
        evidence: [{ label: 'Ratio', value: 0.84 }],
      },
      {
        type: 'UNLOCK',
        trigger: 'FUNDING_RESET',
        override: false,
        rule: 'FUNDING_RECOVERY',
        reason: 'Unlocks when funding <= 0.10%',
        priority: 60,
        evidence: [],
      },
    ],
    ruleBook: {
      stateBefore: 'WATCH',
      stateAfter: 'BLOCKED',
      triggerRule: 'FUNDING_EXTREME',
      reason: 'Funding hard block engaged',
    },
  };
}

describe('TASK 16.4 Entry Decision Trace Export', () => {
  it('Empty — exports all sections with UNAVAILABLE, no crash', () => {
    const md = buildEntryTraceExport({});
    expect(md).toContain('# ENTRY DECISION');
    expect(md).toContain('# DECISION TREE');
    expect(md).toContain('# BLOCKERS');
    expect(md).toContain('# RULEBOOK INTERACTION');
    expect(md).toContain('Decision: UNAVAILABLE');
    expect(md).toContain('Conflict: NO');
  });

  it('ENTER — decision exported verbatim with confidence and grade', () => {
    const md = buildEntryTraceExport({
      decision: {
        decision: 'ENTER',
        reason: 'All checks pass',
        summary: 'Clean setup',
        confidence: 0.86,
        grade: 'A',
      },
    });
    expect(md).toContain('Decision: ENTER');
    expect(md).toContain('Confidence: 0.86');
    expect(md).toContain('Grade: A');
    expect(md).toContain('Conflict: NO');
  });

  it('WAIT — full journey exported with reason and summary', () => {
    const md = buildEntryTraceExport(fullInput());
    expect(md).toContain('Decision: WAIT');
    expect(md).toContain('Reason: Funding hard block active');
    expect(md).toContain('Summary: Setup valid but funding extreme');
  });

  it('AVOID — exported verbatim', () => {
    const md = buildEntryTraceExport({
      decision: { decision: 'AVOID', reason: 'Choppy market' },
      blockers: [{ type: 'SOFT', rule: 'CHOP', reason: 'Range-bound' }],
    });
    expect(md).toContain('Decision: AVOID');
    expect(md).toContain('Reason: Choppy market');
    expect(md).toContain('Conflict: NO');
  });

  it('Hard Block — counted and rendered with rule, priority, override', () => {
    const md = buildEntryTraceExport(fullInput());
    expect(md).toContain('Hard Block: 1');
    expect(md).toContain('Type: HARD');
    expect(md).toContain('Rule: FUNDING_EXTREME');
    expect(md).toContain('Override: YES');
    expect(md).toContain('Priority: 95');
  });

  it('Soft Block — counted separately with its own evidence', () => {
    const md = buildEntryTraceExport(fullInput());
    expect(md).toContain('Soft Block: 1');
    expect(md).toContain('Type: SOFT');
    expect(md).toContain('Trigger: LOW_VOLUME');
  });

  it('Unlock — unlock blocker exported with trigger condition', () => {
    const md = buildEntryTraceExport(fullInput());
    expect(md).toContain('Unlock: 1');
    expect(md).toContain('Type: UNLOCK');
    expect(md).toContain('Trigger: FUNDING_RESET');
    expect(md).toContain('Reason: Unlocks when funding <= 0.10%');
  });

  it('Conflict — WAIT without blocker detected; ENTER despite hard block detected', () => {
    const waitNoBlocker = buildEntryTraceExport({
      decision: { decision: 'WAIT' },
      checks: [check()],
    });
    expect(waitNoBlocker).toContain('Conflict: YES');
    expect(waitNoBlocker).toContain('Reason: WAIT without blocker');

    const enterWithHard = buildEntryTrace({
      decision: { decision: 'ENTER' },
      blockers: [{ type: 'HARD', rule: 'FUNDING_EXTREME' }],
    });
    expect(enterWithHard.conflict.detected).toBe(true);
    expect(enterWithHard.conflict.reasons[0]).toContain('ENTER despite hard block');

    const consistent = buildEntryTrace(fullInput());
    expect(consistent.conflict.detected).toBe(false);
  });

  it('Checklist — one row per check with status, weight, reason, evidence', () => {
    const md = buildEntryTraceExport(fullInput());
    expect(md).toContain('Check 001');
    expect(md).toContain('Check ID: EC-001');
    expect(md).toContain('Check Name: Trend');
    expect(md).toContain('Status: WARNING');
    expect(md).toContain('Weight: 15');
    expect(md).toContain('- Ratio=0.84');
    expect(md).toContain('- Buy Wall=105500');
  });

  it('Decision Tree — stages exported in engine order', () => {
    const md = buildEntryTraceExport(fullInput());
    const tree = md.slice(md.indexOf('# DECISION TREE'), md.indexOf('# CHECKLIST'));
    const order = [
      'Trend [PASS]',
      'Momentum [PASS]',
      'Volume [FAIL]',
      'Liquidity [PASS]',
      'Risk [PASS]',
      'RuleBook [BLOCKED]',
      'Entry Score [82]',
      'Decision [WAIT]',
    ];
    let last = -1;
    for (const step of order) {
      const idx = tree.indexOf(step);
      expect(idx, `missing tree step ${step}`).toBeGreaterThan(last);
      last = idx;
    }
  });

  it('Contribution / RuleBook Interaction / Decision Chain — copied, not computed', () => {
    const md = buildEntryTraceExport(fullInput());
    expect(md).toContain('Trend: PASS');
    expect(md).toContain('Volume: FAIL');
    expect(md).toContain('Whale: WARNING');
    expect(md).toContain('State Before: WATCH');
    expect(md).toContain('State After: BLOCKED');
    expect(md).toContain('Trigger Rule: FUNDING_EXTREME');
    const chain = md.slice(md.indexOf('# DECISION CHAIN'));
    expect(chain).toContain('Market Snapshot: PROVIDED');
    expect(chain).toContain('RuleBook State: BLOCKED');
    expect(chain).toContain('Entry Decision: WAIT');
    expect(chain).toContain('Recommendation: Wait for funding reset');
    expect(md).toContain('- Whale depends OrderBook Module');
  });

  it('Stable — deterministic, byte-identical, input not mutated', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    const a = buildEntryTraceExport(input);
    const b = buildEntryTraceExport(fullInput());
    expect(a).toBe(b);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('Markdown — all sections present in order, AI checklist complete', () => {
    const md = buildEntryTraceExport(fullInput());
    const sections = [
      '# Metadata',
      '# INPUT SNAPSHOT',
      '# ENTRY DECISION',
      '# DECISION TREE',
      '# CHECKLIST',
      '# BLOCKERS',
      '# ENTRY EVIDENCE',
      '# ENTRY CONTRIBUTION',
      '# RULEBOOK INTERACTION',
      '# DECISION CHAIN',
      '# ENTRY DEPENDENCY',
      '# CONFLICT DETECTION',
      '# AI REVIEW',
    ];
    let last = -1;
    for (const s of sections) {
      const idx = md.indexOf(`${s}\n`);
      expect(idx, `missing ${s}`).toBeGreaterThan(last);
      last = idx;
    }
    for (const item of [
      'Missing Check? YES / NO',
      'Wrong Decision? YES / NO',
      'Wrong Blocker? YES / NO',
      'Threshold Too Strict? YES / NO',
      'Threshold Too Loose? YES / NO',
      'Missing Evidence? YES / NO',
      'Duplicate Evidence? YES / NO',
      'Wrong RuleBook State? YES / NO',
      'Conflict? YES / NO',
      'Need Optimization? YES / NO',
    ]) {
      expect(md).toContain(item);
    }
  });

  it('No Undefined / No Null — literals never leak, no JSON dump', () => {
    for (const input of [{}, fullInput(), { checks: [{}] } as EntryTraceInput]) {
      const md = buildEntryTraceExport(input);
      expect(md).not.toMatch(/\bundefined\b/);
      expect(md).not.toMatch(/\bnull\b/);
      expect(md).not.toContain('[object Object]');
      expect(md).not.toContain('{"');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { buildRuleTrace, buildRuleTraceExport } from '../index';
import type { RuleTraceInput, RuleTraceRule } from '../RuleTraceTypes';

function rule(partial: Partial<RuleTraceRule>): RuleTraceRule {
  return {
    id: 'R001',
    title: 'EMA Alignment',
    status: 'PASS',
    weight: 20,
    priority: 80,
    expected: 'EMA20 > EMA50 > EMA200',
    actual: 'EMA20 > EMA50 > EMA200',
    reason: 'Bullish alignment confirmed',
    recommendation: 'Keep',
    evidence: [
      { label: 'EMA20', value: 106210 },
      { label: 'EMA50', value: 105900 },
      { label: 'EMA200', value: 104800 },
    ],
    contribution: 20,
    dependency: 'EMA Module',
    blockType: 'NONE',
    mandatory: false,
    enabled: true,
    ...partial,
  };
}

function fullInput(): RuleTraceInput {
  return {
    metadata: {
      generatedAt: '2026-07-18T03:00:00.000Z',
      tradeId: 'T-2026-0718-002',
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
      coin: 'BTCUSDT',
      side: 'LONG',
    },
    inputSnapshot: {
      'EMA20': 106210,
      'EMA50': 105900,
      'EMA200': 104800,
      'Volume Ratio': 0.84,
      'Funding': 0.012,
      'OI Change': 2.4,
      'ATR': 850,
      'Spread': 0.03,
      'Support': 105500,
      'Resistance': 107200,
    },
    rules: [
      rule({}),
      rule({
        id: 'R002',
        title: 'Volume',
        status: 'FAIL',
        weight: 15,
        priority: 90,
        expected: '>=1.20 MA20',
        actual: '0.84 MA20',
        reason: 'Volume confirmation missing',
        recommendation: 'Wait for confirmation',
        evidence: [
          { label: 'Current', value: 2050000 },
          { label: 'MA20', value: 2440000 },
          { label: 'Ratio', value: 0.84 },
        ],
        contribution: -15,
        dependency: 'Volume Module',
        blockType: 'SOFT',
      }),
      rule({
        id: 'R003',
        title: 'Funding',
        status: 'FAIL',
        weight: 10,
        priority: 95,
        expected: '<=0.10%',
        actual: '0.12%',
        reason: 'Funding extreme',
        recommendation: 'Wait for funding reset',
        evidence: [{ label: 'Funding', value: 0.012 }],
        contribution: 0,
        dependency: 'Funding Module',
        blockType: 'HARD',
        mandatory: true,
      }),
      rule({
        id: 'R004',
        title: 'Whale',
        status: 'PASS',
        weight: 10,
        priority: 70,
        expected: 'Buy wall near support',
        actual: 'Buy wall at 105500',
        reason: 'Whale support present',
        recommendation: 'Keep',
        evidence: [{ label: 'Buy Wall', value: 105500 }],
        contribution: 10,
        dependency: 'OrderBook',
      }),
      rule({
        id: 'R005',
        title: 'Recovery Unlock',
        status: 'SKIPPED',
        weight: 0,
        priority: 60,
        expected: 'Recovery condition met',
        actual: null,
        reason: 'Not in recovery state',
        recommendation: null,
        evidence: [],
        contribution: null,
        dependency: 'State Machine',
        blockType: 'UNLOCK',
        enabled: false,
      }),
    ],
    decision: {
      score: 82,
      totalScore: 82,
      hardBlock: true,
      decision: 'WAIT',
      recommendation: 'Wait for funding reset',
    },
  };
}

describe('TASK 16.2 Rule Trace Export', () => {
  it('Empty Rule — exports full document with UNAVAILABLE sections', () => {
    const md = buildRuleTraceExport({});
    expect(md).toContain('# RULE TRACE');
    expect(md).toContain('# PRIORITY TREE');
    expect(md).toContain('Conflict: NO');
    expect(md).toContain('UNAVAILABLE');
    expect(md).toContain('Matched Rules: 0');
  });

  it('Single Rule — full journey exported (status/weight/priority/evidence)', () => {
    const md = buildRuleTraceExport({ rules: [rule({})] });
    expect(md).toContain('Rule 001');
    expect(md).toContain('EMA Alignment');
    expect(md).toContain('Status: PASS');
    expect(md).toContain('Weight: 20');
    expect(md).toContain('Priority: 80');
    expect(md).toContain('Expected: EMA20 > EMA50 > EMA200');
    expect(md).toContain('- EMA20=106210');
    expect(md).toContain('- EMA200=104800');
  });

  it('All PASS — summary counts all matched, no conflict', () => {
    const trace = buildRuleTrace({
      rules: [rule({}), rule({ id: 'R002', title: 'Whale' })],
    });
    expect(trace.summary.matchedRules).toBe(2);
    expect(trace.summary.failedRules).toBe(0);
    expect(trace.conflict.detected).toBe(false);
  });

  it('Mixed PASS FAIL — both statuses traced and counted', () => {
    const trace = buildRuleTrace(fullInput());
    expect(trace.summary.matchedRules).toBe(2);
    expect(trace.summary.failedRules).toBe(2);
    expect(trace.summary.ignoredRules).toBe(1);
    const md = buildRuleTraceExport(fullInput());
    expect(md).toContain('Status: PASS');
    expect(md).toContain('Status: FAIL');
    expect(md).toContain('Actual: 0.84 MA20');
    expect(md).toContain('Reason: Volume confirmation missing');
  });

  it('Hard Block — counted in summary and shown in decision chain', () => {
    const trace = buildRuleTrace(fullInput());
    expect(trace.summary.hardBlocks).toBe(1);
    expect(trace.summary.blockedRules).toBe(2);
    const md = buildRuleTraceExport(fullInput());
    expect(md).toContain('Hard Block (Rule Trace Scope): 1');
    expect(md).toContain('Hard Block: YES');
  });

  it('Soft Block — counted separately from hard block', () => {
    const trace = buildRuleTrace(fullInput());
    expect(trace.summary.softBlocks).toBe(1);
    const md = buildRuleTraceExport(fullInput());
    expect(md).toContain('Soft Block: 1');
    expect(md).toContain('Block Type: SOFT');
  });

  it('Unlock — unlock rules counted and disabled rule ignored', () => {
    const trace = buildRuleTrace(fullInput());
    expect(trace.summary.unlockRules).toBe(1);
    expect(trace.summary.ignoredRules).toBe(1);
    const md = buildRuleTraceExport(fullInput());
    expect(md).toContain('Unlock Rules: 1');
    expect(md).toContain('Block Type: UNLOCK');
  });

  it('Priority Tree — sorted descending, highest priority wins', () => {
    const trace = buildRuleTrace(fullInput());
    const priorities = trace.priorityTree.map((r) => r.priorityValue);
    expect(priorities).toEqual([95, 90, 80, 70, 60]);
    const md = buildRuleTraceExport(fullInput());
    const fundingIdx = md.indexOf('Funding [FAIL]', md.indexOf('# PRIORITY TREE'));
    const trendIdx = md.indexOf('EMA Alignment [PASS]', md.indexOf('# PRIORITY TREE'));
    expect(fundingIdx).toBeGreaterThan(-1);
    expect(trendIdx).toBeGreaterThan(fundingIdx);
  });

  it('Decision Chain — Input → Matched → Score → Hard Block → Decision → Recommendation', () => {
    const md = buildRuleTraceExport(fullInput());
    const section = md.slice(md.indexOf('# DECISION CHAIN'));
    for (const line of [
      'Input: BTCUSDT LONG',
      'Matched Rules: 2',
      'Score: 82',
      'Hard Block: YES',
      'Decision: WAIT',
      'Recommendation: Wait for funding reset',
    ]) {
      expect(section).toContain(line);
    }
  });

  it('Conflict — hard block overriding passing rules is detected with reason', () => {
    const md = buildRuleTraceExport(fullInput());
    expect(md).toContain('Conflict: YES');
    expect(md).toContain('Funding Hard Block overrides EMA Alignment, Whale');

    const noConflict = buildRuleTraceExport({ rules: [rule({})] });
    expect(noConflict).toContain('Conflict: NO');
  });

  it('Display Layer Scores — copied verbatim with sign (no Decision Total in this section)', () => {
    const md = buildRuleTraceExport(fullInput());
    const section = md.slice(md.indexOf('# DISPLAY LAYER SCORES'));
    expect(section).toContain('EMA Alignment: +20');
    expect(section).toContain('Volume: -15');
    expect(section).toContain('Funding: 0');
    expect(section).toContain('Whale: +10');
    expect(section).toContain('Recovery Unlock: UNAVAILABLE');
    expect(section).toContain(
      'They do NOT sum directly to the Decision Total — see Group Breakdown below.',
    );
    expect(section).not.toContain('TOTAL: 82');
  });

  it('Markdown Format — all sections present in order, checklist complete', () => {
    const md = buildRuleTraceExport(fullInput());
    const sections = [
      '# Metadata',
      '# INPUT SNAPSHOT',
      '# RULE TRACE',
      '# RULE EVALUATION TABLE',
      '# RULE SUMMARY',
      '# PRIORITY TREE',
      '# DISPLAY LAYER SCORES',
      '# GROUP BREAKDOWN',
      '# RULE DEPENDENCY',
      '# CONFLICT DETECTION',
      '# DECISION CHAIN',
      '# AI REVIEW',
    ];
    let last = -1;
    for (const s of sections) {
      const idx = md.indexOf(`${s}\n`);
      expect(idx, `missing ${s}`).toBeGreaterThan(last);
      last = idx;
    }
    for (const item of [
      'Rule Conflict? YES / NO',
      'Priority Conflict? YES / NO',
      'Missing Rule? YES / NO',
      'Dead Rule? YES / NO',
      'Duplicate Rule? YES / NO',
      'Threshold Issue? YES / NO',
      'Weight Issue? YES / NO',
      'Evidence Missing? YES / NO',
      'Decision Correct? YES / NO',
      'Need Optimization? YES / NO',
    ]) {
      expect(md).toContain(item);
    }
    expect(md).toContain('| Rule | PASS | FAIL | Weight | Priority |');
    expect(md).toContain('- EMA Alignment depends EMA Module');
    expect(md).toContain('- Whale depends OrderBook');
  });

  it('Stable Output — deterministic, byte-identical, input not mutated', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    const a = buildRuleTraceExport(input);
    const b = buildRuleTraceExport(fullInput());
    expect(a).toBe(b);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('No Undefined / No Null — literals never leak, no JSON dump', () => {
    for (const input of [{}, fullInput(), { rules: [{}] } as RuleTraceInput]) {
      const md = buildRuleTraceExport(input);
      expect(md).not.toMatch(/\bundefined\b/);
      expect(md).not.toMatch(/\bnull\b/);
      expect(md).not.toContain('[object Object]');
      expect(md).not.toContain('{"');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { buildRuleBookReview, buildRuleBookReviewExport } from '../index';
import type { RuleBookReviewInput } from '../RuleBookReviewTypes';

function fullInput(): RuleBookReviewInput {
  return {
    metadata: {
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
      timestamp: '2026-07-18T04:00:00.000Z',
      coin: 'BTCUSDT',
      side: 'LONG',
      tradeId: 'T-2026-0718-007',
    },
    marketSnapshot: {
      Trend: 'UP',
      EMA20: 106210,
      RSI: 61,
      MACD: 'BULLISH',
      Volume: 2450000,
      Funding: 0.008,
      OI: 245000000,
      CVD: 320000,
      Whale: 105500,
      Liquidity: 5200000,
      Spread: 0.03,
      ATR: 850,
      Support: 105500,
      Resistance: 107200,
      Timing: 'LONDON',
    },
    summary: {
      totalRules: 24,
      triggeredRules: 6,
      passedRules: 18,
      failedRules: 2,
      blockedRules: 1,
      ignoredRules: 3,
      warningRules: 2,
      rulebookState: 'PASS',
    },
    triggeredRules: [
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        result: 'PASS',
        priority: 90,
        reason: 'EMA20 rising with price above',
        evidence: [{ label: 'EMA20', value: 106210 }],
      },
      {
        ruleId: 'R-205',
        ruleName: 'Volume Confirmation',
        result: 'PASS',
        priority: 70,
        reason: 'Volume above average',
        evidence: [{ label: 'Volume', value: 2450000 }],
      },
    ],
    blockedRules: [
      {
        ruleId: 'R-900',
        ruleName: 'Funding Extreme Block',
        trigger: 'Funding > 0.05',
        reason: 'Crowded long risk',
        unlockCondition: 'Funding back below 0.02',
      },
    ],
    ruleEvidence: [
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        evidence: [
          { label: 'EMA20', value: 106210 },
          { label: 'Price', value: 107000 },
        ],
      },
      {
        ruleId: 'R-205',
        ruleName: 'Volume Confirmation',
        evidence: [{ label: 'Volume', value: 2450000 }],
      },
    ],
    dependencies: [
      { input: 'Funding', module: 'Funding Module' },
      { input: 'EMA', module: 'Trend Module' },
      { input: 'Volume', module: 'Volume Module' },
    ],
  };
}

const SECTIONS = [
  '# REVIEW MISSION',
  '# Metadata',
  '# MARKET SNAPSHOT',
  '# RULE SUMMARY',
  '# TRIGGERED RULES',
  '# BLOCKED RULES',
  '# RULE EVIDENCE',
  '# RULE DEPENDENCY',
  '# REVIEW FOCUS',
  '# CONFLICT DETECTION',
  '# AI REVIEW',
  '# CURSOR IMPLEMENTATION PROMPT',
  '# PATCH REQUIREMENTS',
  '# FIX VALIDATION CHECKLIST',
  '# NEXT REVIEW',
  '# FINAL VERDICT',
];

describe('TASK 17.1 RuleBook Review Export', () => {
  it('Empty — exports every section with UNAVAILABLE, self-contained', () => {
    const md = buildRuleBookReviewExport({});
    for (const s of SECTIONS) expect(md).toContain(s);
    expect(md).toContain('RuleBook State: UNAVAILABLE');
    expect(md).toContain('Conflict: NO');
    // Self-contained: no cross-file references.
    expect(md).not.toContain('01_RULEBOOK.md');
    expect(md).not.toContain('02_SCORE_ENGINE.md');
    expect(md).not.toContain('SEE ');
  });

  it('Full RuleBook — metadata, market snapshot and summary copied', () => {
    const md = buildRuleBookReviewExport(fullInput());
    expect(md).toContain('Rule Version: r5.0');
    expect(md).toContain('Trend: UP');
    expect(md).toContain('EMA20: 106210');
    expect(md).toContain('Total Rules: 24');
    expect(md).toContain('RuleBook State: PASS');
  });

  it('Triggered Rules — one Markdown row each with evidence', () => {
    const md = buildRuleBookReviewExport(fullInput());
    expect(md).toContain(
      '| Rule ID | Rule Name | Result | Priority | Reason | Evidence |',
    );
    expect(md).toContain(
      '| R-101 | Trend Continuation | PASS | 90 | EMA20 rising with price above | EMA20=106210 |',
    );
    expect(md).toContain('| R-205 | Volume Confirmation | PASS | 70 |');
  });

  it('Blocked Rules — trigger, reason and unlock condition rendered', () => {
    const md = buildRuleBookReviewExport(fullInput());
    expect(md).toContain('| Rule | Trigger | Reason | Unlock Condition |');
    expect(md).toContain(
      '| Funding Extreme Block | Funding > 0.05 | Crowded long risk | Funding back below 0.02 |',
    );
  });

  it('Dependency — input to module mapping copied', () => {
    const md = buildRuleBookReviewExport(fullInput());
    expect(md).toContain('Funding');
    expect(md).toContain('Funding Module');
    expect(md).toContain('Trend Module');
    expect(md).toContain('Volume Module');
  });

  it('Rule Evidence — each rule emitted once, no duplicate', () => {
    const input = fullInput();
    // Intentional duplicate ruleId in the frozen snapshot.
    input.ruleEvidence = [
      ...(input.ruleEvidence ?? []),
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        evidence: [{ label: 'DUP', value: 1 }],
      },
    ];
    const review = buildRuleBookReview(input);
    const r101 = review.ruleEvidence.filter((item) => item.ruleId === 'R-101');
    expect(r101).toHaveLength(1);
    // First occurrence wins; the duplicate is dropped.
    expect(r101[0].evidence.some((e) => e.label === 'DUP')).toBe(false);
  });

  it('Conflict — PASS rule while RuleBook State BLOCKED is detected structurally', () => {
    const input = fullInput();
    input.summary = { ...input.summary, rulebookState: 'BLOCKED' };
    const md = buildRuleBookReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain('Reason: Rule R-101 PASS but RuleBook State BLOCKED');
  });

  it('Conflict — same rule in triggered and blocked lists is detected', () => {
    const input = fullInput();
    input.blockedRules = [
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        trigger: 'x',
        reason: 'y',
        unlockCondition: 'z',
      },
    ];
    const md = buildRuleBookReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain(
      'Reason: Rule R-101 present in both triggered and blocked lists',
    );
  });

  it('AI Review Template — blank table with severity column', () => {
    const md = buildRuleBookReviewExport(fullInput());
    expect(md).toContain('| Review Item | Result | Severity | Notes |');
    expect(md).toContain('| Wrong Rule | □ | | |');
    expect(md).toContain('| Rule Conflict | □ | | |');
    expect(md).toContain('| Need Optimization | □ | | |');
  });

  it('Legacy FIX RECOMMENDATION removed — Cursor Implementation Prompt is the unified fix path', () => {
    const md = buildRuleBookReviewExport(fullInput());
    expect(md).not.toContain('# FIX RECOMMENDATION');
    expect(md).not.toContain('| Fix ID | Priority | Module | Suggestion | Expected Impact |');
    expect(md).toContain('# CURSOR IMPLEMENTATION PROMPT');
    expect(md).toContain('| Suggested Fix | |');
    expect(md).toContain('# REVIEW MISSION');
    expect(md).toContain('# REVIEW FOCUS');
  });

  it('Final Verdict — template with four options, none checked', () => {
    const md = buildRuleBookReviewExport(fullInput());
    expect(md).toContain('- [ ] PASS');
    expect(md).toContain('- [ ] PASS WITH MINOR IMPROVEMENTS');
    expect(md).toContain('- [ ] PASS WITH MAJOR IMPROVEMENTS');
    expect(md).toContain('- [ ] INVALID');
  });

  it('Stable — deterministic, byte-identical and input not mutated', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    const md1 = buildRuleBookReviewExport(input);
    const md2 = buildRuleBookReviewExport(input);
    const md3 = buildRuleBookReviewExport(fullInput());
    expect(md1).toBe(md2);
    expect(md1).toBe(md3);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('No Undefined and No Null — no leaked literal, no object dump', () => {
    const md = buildRuleBookReviewExport({
      metadata: null,
      marketSnapshot: null,
      summary: { rulebookState: undefined, totalRules: null },
      triggeredRules: [{ ruleId: 'R-1', ruleName: undefined, evidence: null }],
      blockedRules: null,
      ruleEvidence: null,
      dependencies: null,
    });
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{');
    expect(md).toContain('RuleBook State: UNAVAILABLE');
    expect(md).toContain('Total Rules: UNAVAILABLE');
  });
});

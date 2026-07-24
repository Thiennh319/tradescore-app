import { describe, expect, it } from 'vitest';
import { buildEntryReview, buildEntryReviewExport } from '../index';
import type { EntryReviewInput } from '../EntryReviewTypes';

function fullInput(): EntryReviewInput {
  return {
    metadata: {
      tradeId: 'T-2026-0718-009',
      coin: 'BTCUSDT',
      side: 'LONG',
      timestamp: '2026-07-18T04:00:00.000Z',
      entryVersion: 'e2.0',
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
    },
    marketSnapshot: {
      Trend: 'UP',
      EMA20: 106210,
      RSI: 61,
      Volume: 2450000,
      Funding: 0.008,
      Liquidity: 5200000,
      Spread: 0.03,
      ATR: 850,
      Support: 105500,
      Resistance: 107200,
      Timing: 'LONDON',
    },
    summary: {
      decision: 'ENTER',
      confidence: 0.84,
      grade: 'A',
      recommendation: 'Enter on pullback into demand',
      reason: 'Trend, volume and rulebook aligned',
      summary: 'High-quality long setup',
      rulebookState: 'PASS',
      passedChecks: 9,
      failedChecks: 0,
      warnings: 1,
      hardBlocks: 0,
      groupBlocks: 0,
      softBlocks: 0,
      unlockRules: 0,
    },
    decisionTree: [
      { stage: 'Trend', result: 'PASS', detail: 'UP with EMA support' },
      { stage: 'Momentum', result: 'PASS', detail: 'RSI 61' },
      { stage: 'Volume', result: 'PASS', detail: 'Above average' },
      { stage: 'Liquidity', result: 'PASS', detail: 'Deep book' },
      { stage: 'Risk', result: 'PASS', detail: 'RR 2.5' },
      { stage: 'RuleBook', result: 'PASS', detail: 'No hard block' },
      { stage: 'Entry Score', result: '86', detail: 'Grade A' },
      { stage: 'Decision', result: 'ENTER', detail: 'All gates passed' },
    ],
    checks: [
      {
        checkId: 'EC-001',
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        priority: 'HIGH',
        status: 'PASS',
        actual: 106210,
        expected: '> EMA20',
        threshold: 106000,
        difference: 210,
        reason: 'Price above EMA20',
        recommendation: 'Keep long bias',
        evidence: [{ label: 'EMA20', value: 106210 }],
        source: 'Trend Module',
      },
      {
        checkId: 'EC-002',
        ruleId: 'R-205',
        ruleName: 'Volume Confirmation',
        priority: 'MEDIUM',
        status: 'WARNING',
        actual: 2450000,
        expected: '> 2000000',
        threshold: 2000000,
        difference: 450000,
        reason: 'Volume above threshold but decelerating',
        recommendation: 'Monitor volume',
        evidence: [{ label: 'Volume', value: 2450000 }],
        source: 'Volume Module',
      },
    ],
    blockers: [
      {
        type: 'SOFT',
        rule: 'Funding Elevated',
        priority: 'LOW',
        trigger: 'Funding > 0.05',
        reason: 'Currently below trigger',
        override: 'NO',
        evidence: [{ label: 'Funding', value: 0.008 }],
      },
    ],
    ruleReferences: [
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        module: 'Trend Module',
        priority: 'HIGH',
        evidence: 'EMA20=106210',
      },
      {
        ruleId: 'R-205',
        ruleName: 'Volume Confirmation',
        module: 'Volume Module',
        priority: 'MEDIUM',
        evidence: 'Volume=2450000',
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
  };
}

const SECTIONS = [
  '# REVIEW MISSION',
  '# Metadata',
  '# MARKET SNAPSHOT',
  '# ENTRY SUMMARY',
  '# DECISION TREE',
  '# CHECKLIST',
  '# BLOCKERS',
  '# RULE REFERENCES',
  '# EVIDENCE',
  '# REVIEW FOCUS',
  '# CONFLICT DETECTION',
  '# AI REVIEW',
  '# CURSOR IMPLEMENTATION PROMPT',
  '# PATCH REQUIREMENTS',
  '# FIX VALIDATION CHECKLIST',
  '# NEXT REVIEW',
  '# FINAL VERDICT',
];

describe('TASK 17.3 Entry Review Export', () => {
  it('Empty — exports every section with UNAVAILABLE, self-contained', () => {
    const md = buildEntryReviewExport({});
    for (const s of SECTIONS) expect(md).toContain(s);
    expect(md).toContain('Decision: UNAVAILABLE');
    expect(md).toContain('Conflict: NO');
    // Self-contained: no cross-file references.
    expect(md).not.toContain('01_RULEBOOK.md');
    expect(md).not.toContain('02_SCORE_ENGINE.md');
    expect(md).not.toContain('03_ENTRY_TRACE.md');
    expect(md).not.toContain('SEE ');
  });

  it('Metadata — all fields copied verbatim', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('Trade ID: T-2026-0718-009');
    expect(md).toContain('Entry Version: e2.0');
    expect(md).toContain('Rule Version: r5.0');
    expect(md).toContain('Engine Version: v4.1');
  });

  it('Snapshot — frozen indicators rendered sorted, copy only', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('Trend: UP');
    expect(md).toContain('EMA20: 106210');
    expect(md).toContain('Funding: 0.008');
    const snapshot = md.slice(
      md.indexOf('# MARKET SNAPSHOT'),
      md.indexOf('# ENTRY SUMMARY'),
    );
    expect(snapshot.indexOf('ATR:')).toBeLessThan(snapshot.indexOf('EMA20:'));
    expect(snapshot.indexOf('EMA20:')).toBeLessThan(snapshot.indexOf('Trend:'));
  });

  it('Entry Summary — decision, counts and blocks copied, never counted', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('Decision: ENTER');
    expect(md).toContain('Confidence: 0.84');
    expect(md).toContain('Grade: A');
    expect(md).toContain('RuleBook State: PASS');
    expect(md).toContain('Passed Checks: 9');
    expect(md).toContain('Hard Blocks: 0');
    expect(md).toContain('Group Blocks: 0');
    expect(md).toContain('Unlock Rules: 0');
  });

  it('Decision Tree — stages rendered in snapshot order', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('Trend: PASS (UP with EMA support)');
    expect(md).toContain('Decision: ENTER (All gates passed)');
    const tree = md.slice(md.indexOf('# DECISION TREE'), md.indexOf('# CHECKLIST'));
    expect(tree.indexOf('Trend:')).toBeLessThan(tree.indexOf('Momentum:'));
    expect(tree.indexOf('RuleBook:')).toBeLessThan(tree.indexOf('Entry Score:'));
    expect(tree.indexOf('Entry Score:')).toBeLessThan(tree.indexOf('Decision:'));
  });

  it('Checklist — full table row with threshold and difference copied', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain(
      '| Check ID | Rule ID | Rule Name | Priority | Status | Actual | Expected | Threshold | Difference | Reason | Recommendation | Evidence | Source |',
    );
    expect(md).toContain(
      '| EC-001 | R-101 | Trend Continuation | HIGH | PASS | 106210 | > EMA20 | 106000 | 210 | Price above EMA20 | Keep long bias | EMA20=106210 | Trend Module |',
    );
  });

  it('Blockers — table copied, never inferred', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain(
      '| Type | Rule | Priority | Trigger | Reason | Override | Evidence |',
    );
    expect(md).toContain(
      '| SOFT | Funding Elevated | LOW | Funding > 0.05 | Currently below trigger | NO | Funding=0.008 |',
    );
  });

  it('Group Block — Type GROUP and Group Blocks summary (no Hard double-count)', () => {
    const input = fullInput();
    input.summary = {
      ...input.summary,
      hardBlocks: 0,
      groupBlocks: 1,
      softBlocks: 0,
    };
    input.blockers = [
      {
        type: 'GROUP',
        rule: 'Nhóm A (Xu hướng) 2.1/5đ < 2.5đ',
        priority: 'CRITICAL',
        trigger: 'Nhóm A (Xu hướng) 2.1/5đ < 2.5đ',
        reason: 'Nhóm A (Xu hướng) 2.1/5đ < 2.5đ',
        override: 'NO',
        evidence: [
          {
            label: 'Group Block',
            value: 'Nhóm A (Xu hướng) 2.1/5đ < 2.5đ',
          },
        ],
      },
    ];
    const md = buildEntryReviewExport(input);
    expect(md).toContain('Hard Blocks: 0');
    expect(md).toContain('Group Blocks: 1');
    expect(md).toContain('Soft Blocks: 0');
    expect(md).toContain(
      '| GROUP | Nhóm A (Xu hướng) 2.1/5đ < 2.5đ | CRITICAL | Nhóm A (Xu hướng) 2.1/5đ < 2.5đ | Nhóm A (Xu hướng) 2.1/5đ < 2.5đ | NO | Group Block=Nhóm A (Xu hướng) 2.1/5đ < 2.5đ |',
    );
  });

  it('Rule References — table with module and priority', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('| Rule ID | Rule Name | Module | Priority | Evidence |');
    expect(md).toContain(
      '| R-101 | Trend Continuation | Trend Module | HIGH | EMA20=106210 |',
    );
  });

  it('Evidence — deduplicated by rule id, first wins', () => {
    const input = fullInput();
    input.ruleEvidence = [
      ...(input.ruleEvidence ?? []),
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        evidence: [{ label: 'DUP', value: 1 }],
      },
    ];
    const review = buildEntryReview(input);
    const r101 = review.ruleEvidence.filter((item) => item.ruleId === 'R-101');
    expect(r101).toHaveLength(1);
    expect(r101[0].evidence.some((e) => e.label === 'DUP')).toBe(false);
  });

  it('Review Focus — static ten priorities rendered', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('1. Decision');
    expect(md).toContain('5. Checklist');
    expect(md).toContain('10. Optimization');
  });

  it('AI Review — blank template with all ten rows', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('| Review Item | Result | Severity | Notes |');
    expect(md).toContain('| Wrong Decision | □ | | |');
    expect(md).toContain('| Duplicate Evidence | □ | | |');
    expect(md).toContain('| Logic Conflict | □ | | |');
    expect(md).toContain('| Code Modification Required | □ | | |');
  });

  it('Cursor Prompt — blank field table, exporter fills nothing', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('# CURSOR IMPLEMENTATION PROMPT');
    expect(md).toContain('| Module | |');
    expect(md).toContain('| Root Cause | |');
    expect(md).toContain('| Allowed Files | |');
    expect(md).toContain('| Acceptance Criteria | |');
  });

  it('Patch Requirements — blank scope subsections rendered', () => {
    const md = buildEntryReviewExport(fullInput());
    expect(md).toContain('### Allowed Files\n\n-');
    expect(md).toContain('### Forbidden Files\n\n-');
    expect(md).toContain('### Regression Requirement\n\n-');
    expect(md).toContain('### Architecture Requirement\n\n-');
  });

  it('Validation Checklist — nine unticked entry-specific validations', () => {
    const md = buildEntryReviewExport(fullInput());
    const block = md.slice(
      md.indexOf('# FIX VALIDATION CHECKLIST'),
      md.indexOf('# NEXT REVIEW'),
    );
    expect(block.match(/\| □ \|/g)).toHaveLength(9);
    expect(block).toContain('| Only Entry changed | □ |');
    expect(block).toContain('| RuleBook unchanged | □ |');
    expect(block).toContain('| Stable Output | □ |');
  });

  it('Final Verdict — last section, four options unchecked', () => {
    const md = buildEntryReviewExport(fullInput());
    const verdictIndex = md.indexOf('# FINAL VERDICT');
    expect(verdictIndex).toBeGreaterThan(md.indexOf('# NEXT REVIEW'));
    expect(md.slice(verdictIndex + 1)).not.toContain('\n# ');
    expect(md).toContain('- [ ] PASS');
    expect(md).toContain('- [ ] PASS WITH MINOR ISSUE');
    expect(md).toContain('- [ ] PASS WITH MAJOR ISSUE');
    expect(md).toContain('- [ ] INVALID');
  });

  it('Conflict Detection — three structural scenarios from copied values', () => {
    const enterBlocked = fullInput();
    enterBlocked.summary = { ...enterBlocked.summary, rulebookState: 'BLOCKED' };
    const md1 = buildEntryReviewExport(enterBlocked);
    expect(md1).toContain('Conflict: YES');
    expect(md1).toContain('Reason: Decision ENTER while RuleBook State BLOCKED');

    const waitNoBlocker = fullInput();
    waitNoBlocker.summary = { ...waitNoBlocker.summary, decision: 'WAIT' };
    waitNoBlocker.blockers = [];
    const md2 = buildEntryReviewExport(waitNoBlocker);
    expect(md2).toContain('Conflict: YES');
    expect(md2).toContain('Reason: Decision WAIT without blocker');

    const enterHardBlock = fullInput();
    enterHardBlock.blockers = [
      { type: 'HARD', rule: 'News Block', trigger: 'FOMC', reason: 'Event risk' },
    ];
    const md3 = buildEntryReviewExport(enterHardBlock);
    expect(md3).toContain('Conflict: YES');
    expect(md3).toContain('Reason: Decision ENTER despite HARD BLOCK');

    // Consistent snapshot has no conflict.
    expect(buildEntryReviewExport(fullInput())).toContain('Conflict: NO');
  });

  it('Stable Output — deterministic across repeated exports', () => {
    const input = fullInput();
    expect(buildEntryReviewExport(input)).toBe(buildEntryReviewExport(input));
    expect(buildEntryReviewExport(input)).toBe(
      buildEntryReviewExport(fullInput()),
    );
  });

  it('Byte identical — equivalent snapshots encode to identical bytes', () => {
    const first = new TextEncoder().encode(buildEntryReviewExport(fullInput()));
    const second = new TextEncoder().encode(
      buildEntryReviewExport(fullInput()),
    );
    expect([...first]).toEqual([...second]);
  });

  it('No mutation — input snapshot untouched after export', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    buildEntryReviewExport(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('No undefined and no null — no leaked literal, no object dump', () => {
    const md = buildEntryReviewExport({
      metadata: null,
      marketSnapshot: null,
      summary: { decision: undefined, confidence: null },
      decisionTree: [{ stage: 'Trend', result: undefined, detail: null }],
      checks: [{ checkId: 'EC-1', ruleName: undefined, evidence: null }],
      blockers: null,
      ruleReferences: null,
      ruleEvidence: null,
    });
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{');
    expect(md).toContain('Decision: UNAVAILABLE');
    expect(md).toContain('Confidence: UNAVAILABLE');
  });
});

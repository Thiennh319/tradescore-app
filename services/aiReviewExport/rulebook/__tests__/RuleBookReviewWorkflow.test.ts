import { describe, expect, it } from 'vitest';
import { buildRuleBookReviewExport } from '../index';
import type { RuleBookReviewInput } from '../RuleBookReviewTypes';

function input(): RuleBookReviewInput {
  return {
    metadata: {
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
      timestamp: '2026-07-18T04:00:00.000Z',
      coin: 'BTCUSDT',
      side: 'LONG',
      tradeId: 'T-17-1-1',
    },
    marketSnapshot: { Trend: 'UP', Funding: 0.008 },
    summary: {
      totalRules: 10,
      triggeredRules: 2,
      passedRules: 8,
      failedRules: 0,
      blockedRules: 0,
      ignoredRules: 1,
      warningRules: 1,
      rulebookState: 'PASS',
    },
    triggeredRules: [
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        result: 'PASS',
        priority: 90,
        reason: 'Trend aligned',
        evidence: [{ label: 'Trend', value: 'UP' }],
      },
    ],
    blockedRules: [],
    ruleEvidence: [
      {
        ruleId: 'R-101',
        ruleName: 'Trend Continuation',
        evidence: [{ label: 'Trend', value: 'UP' }],
      },
    ],
    dependencies: [{ input: 'Trend', module: 'Trend Module' }],
  };
}

describe('TASK 17.1.1 AI Audit Workflow Enhancement', () => {
  it('Cursor Implementation Prompt section renders a blank field template', () => {
    const md = buildRuleBookReviewExport(input());
    expect(md).toContain('# CURSOR IMPLEMENTATION PROMPT');
    expect(md).not.toContain('# CURSOR FIX REQUEST');
    expect(md).toContain('| Field | Value |');
    expect(md).toContain('| Module | |');
    expect(md).toContain('| Root Cause | |');
    expect(md).toContain('| Acceptance Criteria | |');
  });

  it('Patch Requirements section renders all blank scope templates', () => {
    const md = buildRuleBookReviewExport(input());
    expect(md).toContain('# PATCH REQUIREMENTS');
    expect(md).toContain('### Allowed Files\n\n-');
    expect(md).toContain('### Forbidden Files\n\n-');
    expect(md).toContain('### Allowed Changes\n\n-');
    expect(md).toContain('### Forbidden Changes\n\n-');
    expect(md).toContain('### Regression Requirement\n\n-');
    expect(md).toContain('### Architecture Requirement\n\n-');
  });

  it('Fix Validation Checklist renders nine unchecked validations', () => {
    const md = buildRuleBookReviewExport(input());
    expect(md).toContain('# FIX VALIDATION CHECKLIST');
    expect(md).toContain('| Validation | Status |');
    const checklist = md.slice(md.indexOf('# FIX VALIDATION CHECKLIST'));
    const beforeNext = checklist.slice(0, checklist.indexOf('# NEXT REVIEW'));
    expect(beforeNext.match(/\| □ \|/g)).toHaveLength(9);
    expect(beforeNext).toContain('| Rule logic unchanged | □ |');
    expect(beforeNext).toContain('| Stable Output | □ |');
  });

  it('Next Review section renders the static review loop guidance', () => {
    const md = buildRuleBookReviewExport(input());
    expect(md).toContain('# NEXT REVIEW');
    expect(md).toContain('1. Export lại RULEBOOK_REVIEW.md');
    expect(md).toContain('2. Reviewer AI chỉ review đúng các mục đã sửa.');
    expect(md).toContain('Nếu FAIL: Sinh CURSOR IMPLEMENTATION PROMPT mới.');
  });

  it('Final Verdict is the last section in the file', () => {
    const md = buildRuleBookReviewExport(input());
    const verdictIndex = md.indexOf('# FINAL VERDICT');
    expect(verdictIndex).toBeGreaterThan(md.indexOf('# NEXT REVIEW'));
    expect(md.slice(verdictIndex + 1)).not.toContain('\n# ');
    expect(md.trimEnd()).toMatch(/- \[ \] INVALID$/);
  });

  it('Stable output — repeated exports are identical', () => {
    const frozen = input();
    expect(buildRuleBookReviewExport(frozen)).toBe(
      buildRuleBookReviewExport(frozen),
    );
  });

  it('Byte-identical output — equivalent snapshots match exactly', () => {
    const first = new TextEncoder().encode(buildRuleBookReviewExport(input()));
    const second = new TextEncoder().encode(buildRuleBookReviewExport(input()));
    expect([...first]).toEqual([...second]);
  });

  it('No mutation — workflow formatting leaves input unchanged', () => {
    const frozen = input();
    const before = JSON.stringify(frozen);
    buildRuleBookReviewExport(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('No undefined literal in workflow output', () => {
    const md = buildRuleBookReviewExport({
      metadata: { ruleVersion: undefined },
      summary: { rulebookState: undefined },
    });
    expect(md).not.toContain('undefined');
    expect(md).toContain('Rule Version: UNAVAILABLE');
  });

  it('No null literal or object dump in workflow output', () => {
    const md = buildRuleBookReviewExport({
      metadata: null,
      marketSnapshot: null,
      summary: null,
      triggeredRules: null,
      blockedRules: null,
      ruleEvidence: null,
      dependencies: null,
    });
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{');
  });
});

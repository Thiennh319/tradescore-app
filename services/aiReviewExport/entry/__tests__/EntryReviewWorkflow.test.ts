import { describe, expect, it } from 'vitest';
import { buildEntryReviewExport } from '../index';
import type { EntryReviewInput } from '../EntryReviewTypes';

function input(): EntryReviewInput {
  return {
    metadata: {
      tradeId: 'T-17-3-1',
      coin: 'BTCUSDT',
      side: 'LONG',
      timestamp: '2026-07-18T04:00:00.000Z',
      entryVersion: 'e2.0',
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
    },
    marketSnapshot: { Trend: 'UP', Funding: 0.008 },
    summary: {
      decision: 'ENTER',
      confidence: 0.84,
      grade: 'A',
      recommendation: 'Enter on pullback',
      reason: 'Checks aligned',
      summary: 'Valid entry',
      rulebookState: 'PASS',
      passedChecks: 2,
      failedChecks: 0,
      warnings: 0,
      hardBlocks: 0,
      groupBlocks: 0,
      softBlocks: 0,
      unlockRules: 0,
    },
    decisionTree: [
      { stage: 'Trend', result: 'PASS', detail: 'UP' },
      { stage: 'Decision', result: 'ENTER', detail: 'Passed' },
    ],
    checks: [
      {
        checkId: 'EC-1',
        ruleId: 'R-1',
        ruleName: 'Trend',
        priority: 'HIGH',
        status: 'PASS',
        actual: 'UP',
        expected: 'UP',
        threshold: 'UP',
        difference: 0,
        reason: 'Aligned',
        recommendation: 'Enter',
        evidence: [{ label: 'Trend', value: 'UP' }],
        source: 'Trend Module',
      },
    ],
    blockers: [],
    ruleReferences: [
      {
        ruleId: 'R-1',
        ruleName: 'Trend',
        module: 'Trend Module',
        priority: 'HIGH',
        evidence: 'Trend=UP',
      },
    ],
    ruleEvidence: [
      {
        ruleId: 'R-1',
        ruleName: 'Trend',
        evidence: [{ label: 'Trend', value: 'UP' }],
      },
    ],
  };
}

describe('TASK 17.3.1 Entry Review Workflow Enhancement', () => {
  it('Review Rules — static scope and reviewer duties rendered', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('# REVIEW RULES');
    expect(md).toContain('Review ONLY Entry Decision.');
    expect(md).toContain('Use ONLY information inside this document.');
    expect(md).toContain('1. Explain');
    expect(md).toContain('4. Generate Cursor Prompt');
    expect(md).toContain('5. Wait for next review');
  });

  it('Review Result — blank manual-review template rendered', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('# REVIEW RESULT');
    expect(md).toContain('| Overall Result | |');
    expect(md).toContain('| PASS / FAIL | |');
    expect(md).toContain('| Confidence | |');
    expect(md).toContain('| Notes | |');
  });

  it('Cursor Prompt extended — all implementation fields remain blank', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('| Current Behaviour | |');
    expect(md).toContain('| Expected Behaviour | |');
    expect(md).toContain('| Files To Modify | |');
    expect(md).toContain('| Functions To Modify | |');
    expect(md).toContain('| Interfaces | |');
    expect(md).toContain('| Tests | |');
    expect(md).toContain('| Acceptance Criteria | |');
  });

  it('Implementation Constraints — allowed and forbidden scope is static', () => {
    const md = buildEntryReviewExport(input());
    const block = md.slice(
      md.indexOf('# IMPLEMENTATION CONSTRAINTS'),
      md.indexOf('# PATCH REQUIREMENTS'),
    );
    expect(block).toContain('### Allowed');
    expect(block).toContain('- Entry Engine');
    expect(block).toContain('- Entry Review Export');
    expect(block).toContain('### Forbidden');
    expect(block).toContain('- RuleBook');
    expect(block).toContain('- UI');
    expect(block).toContain('Architecture: Frozen');
  });

  it('Patch Requirements — six blank requirement areas rendered', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('### Allowed Files\n\n-');
    expect(md).toContain('### Forbidden Files\n\n-');
    expect(md).toContain('### Allowed Changes\n\n-');
    expect(md).toContain('### Forbidden Changes\n\n-');
    expect(md).toContain('### Regression Requirement\n\n-');
    expect(md).toContain('### Architecture Requirement\n\n-');
  });

  it('Expected Behaviour — before and after patch template rendered', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('# EXPECTED BEHAVIOUR');
    expect(md).toContain('### Before Patch\n\n...');
    expect(md).toContain('### After Patch\n\n...');
    expect(md).toContain('Reviewer fills manually.');
  });

  it('Regression Target — unchanged modules and retest targets rendered', () => {
    const md = buildEntryReviewExport(input());
    const block = md.slice(
      md.indexOf('# REGRESSION TARGET'),
      md.indexOf('# PATCH SUMMARY'),
    );
    expect(block).toContain('### Must remain unchanged');
    expect(block).toContain('- [ ] RuleBook');
    expect(block).toContain('- [ ] Trade Engine');
    expect(block).toContain('### Must retest');
    expect(block).toContain('- [ ] Entry Engine');
    expect(block).toContain('- [ ] AI Review Export');
  });

  it('Patch Summary — blank change-summary table rendered', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('# PATCH SUMMARY');
    expect(md).toContain('| Files Modified | |');
    expect(md).toContain('| Functions Modified | |');
    expect(md).toContain('| Rules Modified | |');
    expect(md).toContain('| Tests Added | |');
    expect(md).toContain('| Notes | |');
  });

  it('Regression Result — every module row remains blank', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('# REGRESSION RESULT');
    expect(md).toContain('| Module | Result | Notes |');
    expect(md).toContain('| RuleBook | | |');
    expect(md).toContain('| Entry | | |');
    expect(md).toContain('| AI Export | | |');
    expect(md).toContain('| Overall | | |');
  });

  it('Fix Validation Checklist — all twelve validations are unchecked', () => {
    const md = buildEntryReviewExport(input());
    const block = md.slice(
      md.indexOf('# FIX VALIDATION CHECKLIST'),
      md.indexOf('# NEXT REVIEW'),
    );
    expect(block).toContain('| Only Entry changed | □ |');
    expect(block).toContain('| Trade Engine unchanged | ☐ |');
    expect(block).toContain('| Input Contract unchanged | ☐ |');
    expect(block).toContain('| Architecture Frozen | ☐ |');
    expect(block.match(/[□☐]/g)).toHaveLength(12);
  });

  it('Next Review — static patch-review loop rendered', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('# NEXT REVIEW');
    expect(md).toContain('After Cursor patch:');
    expect(md).toContain('1. Export ENTRY_REVIEW.md again.');
    expect(md).toContain('2. Review ONLY the modified scope.');
    expect(md).toContain('If FAIL: generate another Cursor Prompt.');
  });

  it('Fix History — blank reviewer-maintained table rendered', () => {
    const md = buildEntryReviewExport(input());
    expect(md).toContain('# FIX HISTORY');
    expect(md).toContain('| Round | Problem | Fix | Result |');
    expect(md).toContain('| | | | |');
  });

  it('Final Verdict is the last section and remains unchecked', () => {
    const md = buildEntryReviewExport(input());
    const verdictIndex = md.indexOf('# FINAL VERDICT');
    expect(verdictIndex).toBeGreaterThan(md.indexOf('# FIX HISTORY'));
    expect(md.slice(verdictIndex + 1)).not.toContain('\n# ');
    expect(md.trimEnd()).toMatch(/- \[ \] INVALID$/);
  });

  it('Stable output — repeated exports are identical', () => {
    const frozen = input();
    expect(buildEntryReviewExport(frozen)).toBe(buildEntryReviewExport(frozen));
  });

  it('Byte identical — equivalent snapshots encode identically', () => {
    const first = new TextEncoder().encode(buildEntryReviewExport(input()));
    const second = new TextEncoder().encode(buildEntryReviewExport(input()));
    expect([...first]).toEqual([...second]);
  });

  it('No mutation — formatter workflow leaves the input unchanged', () => {
    const frozen = input();
    const before = JSON.stringify(frozen);
    buildEntryReviewExport(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('No undefined literal in enhanced workflow output', () => {
    const md = buildEntryReviewExport({
      metadata: { entryVersion: undefined },
      summary: { decision: undefined },
    });
    expect(md).not.toContain('undefined');
    expect(md).toContain('Entry Version: UNAVAILABLE');
  });

  it('No null literal or object dump in enhanced workflow output', () => {
    const md = buildEntryReviewExport({
      metadata: null,
      marketSnapshot: null,
      summary: null,
      decisionTree: null,
      checks: null,
      blockers: null,
      ruleReferences: null,
      ruleEvidence: null,
    });
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{');
  });
});

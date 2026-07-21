import { describe, expect, it } from 'vitest';
import { buildEntryTraceExport } from '../index';

describe('TASK 16.4.1 Entry Trace Export Enhancement', () => {
  const input = {
    decision: {
      decision: 'WAIT' as const,
      initialDecision: 'ENTER' as const,
      override: 'Funding Hard Block',
      finalDecision: 'WAIT' as const,
      reason: 'Funding threshold exceeded',
      confidence: 0.62,
      grade: 'B',
    },
    checks: [
      {
        id: 'EC-001',
        name: 'Funding',
        ruleId: 'RB-FUNDING-001',
        ruleName: 'Funding Limit',
        status: 'FAIL' as const,
        weight: 15,
        priority: 'Critical',
        actual: '1.20%',
        expected: '<=1.00%',
        threshold: '<=1.00%',
        difference: '+0.20%',
        reason: 'Funding above limit',
        recommendation: 'Wait for reset',
        source: 'Funding Module',
        unit: '%',
        evidence: [{ label: 'Funding Rate', value: 0.012 }],
      },
    ],
    entrySummary: {
      passedChecks: 6,
      warnings: 1,
      failedChecks: 1,
      hardBlocks: 1,
      softBlocks: 0,
      unlockRules: 1,
      decision: 'WAIT',
      confidence: 0.62,
      grade: 'B',
      ruleBookState: 'BLOCKED',
    },
  };

  it('Rule ID display — copies Rule ID and Rule Name', () => {
    const markdown = buildEntryTraceExport(input);
    expect(markdown).toContain('Rule ID: RB-FUNDING-001');
    expect(markdown).toContain('Rule Name: Funding Limit');
  });

  it('Threshold and Difference display — copied verbatim', () => {
    const markdown = buildEntryTraceExport(input);
    expect(markdown).toContain('Actual: 1.20%');
    expect(markdown).toContain('Threshold: <=1.00%');
    expect(markdown).toContain('Difference: +0.20%');
  });

  it('Priority display — copied from engine without inference', () => {
    expect(buildEntryTraceExport(input)).toContain('Priority: Critical');
  });

  it('Decision Override display — initial, override and final are explicit', () => {
    const markdown = buildEntryTraceExport(input);
    expect(markdown).toContain('Initial Decision: ENTER');
    expect(markdown).toContain('Override: Funding Hard Block');
    expect(markdown).toContain('Final Decision: WAIT');
  });

  it('Entry Summary display — copies all supplied counters and state', () => {
    const markdown = buildEntryTraceExport(input);
    const summary = markdown.slice(markdown.indexOf('# ENTRY SUMMARY'));
    expect(summary).toContain('Passed Checks: 6');
    expect(summary).toContain('Warnings: 1');
    expect(summary).toContain('Failed Checks: 1');
    expect(summary).toContain('Hard Blocks: 1');
    expect(summary).toContain('Soft Blocks: 0');
    expect(summary).toContain('Unlock Rules: 1');
    expect(summary).toContain('Decision: WAIT');
    expect(summary).toContain('Confidence: 0.62');
    expect(summary).toContain('Grade: B');
    expect(summary).toContain('RuleBook State: BLOCKED');
  });

  it('RuleBook State — DECISION CHAIN and ENTRY SUMMARY share one source', () => {
    // Production wire populates entrySummary.ruleBookState but omits ruleBook.
    // Both sections must show PASS (not DECISION CHAIN UNAVAILABLE).
    const md = buildEntryTraceExport({
      entrySummary: { ruleBookState: 'PASS' },
    });
    const chain = md.slice(
      md.indexOf('# DECISION CHAIN'),
      md.indexOf('# ENTRY DEPENDENCY'),
    );
    const summary = md.slice(md.indexOf('# ENTRY SUMMARY'));
    expect(chain).toContain('RuleBook State: PASS');
    expect(summary).toContain('RuleBook State: PASS');
    expect(chain).not.toContain('RuleBook State: UNAVAILABLE');
  });

  it('RuleBook State — entrySummary wins when both sources differ', () => {
    const md = buildEntryTraceExport({
      ruleBook: { stateAfter: 'BLOCKED' },
      entrySummary: { ruleBookState: 'PASS' },
    });
    const chain = md.slice(
      md.indexOf('# DECISION CHAIN'),
      md.indexOf('# ENTRY DEPENDENCY'),
    );
    const summary = md.slice(md.indexOf('# ENTRY SUMMARY'));
    expect(chain).toContain('RuleBook State: PASS');
    expect(summary).toContain('RuleBook State: PASS');
  });

  it('Entry Summary is not recalculated from checks or blockers', () => {
    const markdown = buildEntryTraceExport({
      checks: [{ name: 'Trend', status: 'PASS' }],
      blockers: [{ type: 'HARD', rule: 'R1' }],
      entrySummary: {
        passedChecks: 999,
        hardBlocks: 888,
      },
    });
    const summary = markdown.slice(markdown.indexOf('# ENTRY SUMMARY'));
    expect(summary).toContain('Passed Checks: 999');
    expect(summary).toContain('Hard Blocks: 888');
  });

  it('AI Review table — uses the standardized three-column format', () => {
    const markdown = buildEntryTraceExport(input);
    expect(markdown).toContain('| Review Item | Result | Notes |');
    for (const item of [
      'Missing Check',
      'Wrong Threshold',
      'Wrong Decision',
      'Wrong Blocker',
      'Missing Evidence',
      'Duplicate Evidence',
      'RuleBook Error',
      'Score Conflict',
      'Entry Conflict',
      'Need Optimization',
    ]) {
      expect(markdown).toContain(`| ${item} | □ |`);
    }
  });

  it('Missing enhancement values render UNAVAILABLE', () => {
    const markdown = buildEntryTraceExport({
      decision: { decision: 'WAIT' },
      blockers: [{ type: 'SOFT' }],
      checks: [{ id: 'EC-EMPTY', name: 'Empty Check' }],
    });
    expect(markdown).toContain('Rule ID: UNAVAILABLE');
    expect(markdown).toContain('Rule Name: UNAVAILABLE');
    expect(markdown).toContain('Threshold: UNAVAILABLE');
    expect(markdown).toContain('Difference: UNAVAILABLE');
    expect(markdown).toContain('Priority: UNAVAILABLE');
    expect(markdown).toContain('Initial Decision: UNAVAILABLE');
    expect(markdown).toContain('Override: UNAVAILABLE');
    expect(markdown).toContain('Final Decision: UNAVAILABLE');
    expect(markdown).toContain('Passed Checks: UNAVAILABLE');
  });

  it('Stable and read-only — same input is byte-identical and untouched', () => {
    const before = JSON.stringify(input);
    const first = buildEntryTraceExport(input);
    const second = buildEntryTraceExport(input);
    expect(first).toBe(second);
    expect(JSON.stringify(input)).toBe(before);
  });
});

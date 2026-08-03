import { describe, expect, it } from 'vitest';
import { buildPositionReview, buildPositionReviewExport } from '../index';
import type { PositionReviewInput } from '../PositionReviewTypes';

function fullInput(): PositionReviewInput {
  return {
    metadata: {
      tradeId: 'T-2026-0718-010',
      positionId: 'P-BTC-002',
      coin: 'BTCUSDT',
      side: 'LONG',
      strategy: 'TREND',
      timestamp: '2026-07-18T04:00:00.000Z',
      adviserVersion: 'pa3.0',
      ruleVersion: 'r5.0',
      engineVersion: 'v4.1',
    },
    positionSnapshot: {
      entryPrice: 106150,
      currentPrice: 107000,
      pnlPct: 0.8,
      pnlUsdt: 85,
      riskReward: 2.5,
      stopLoss: 105400,
      takeProfit: 108000,
      trailingStop: 106200,
      breakEven: true,
      leverage: 5,
      positionSize: 0.5,
      exposure: 53075,
      holdingTime: '3h',
    },
    marketSnapshot: {
      Trend: 'UP',
      EMA20: 106210,
      Volume: 2450000,
      Funding: 0.008,
      ATR: 850,
      Support: 105500,
      Resistance: 107200,
      Timing: 'LONDON',
    },
    summary: {
      recommendation: 'MOVE SL',
      reason: 'Protect profit after TP1',
      summary: 'Trend remains bullish; reduce downside',
      confidence: 0.82,
      priority: 'HIGH',
      adviserState: 'PROTECT_PROFIT',
    },
    decisionTree: [
      { stage: 'Position', result: 'OPEN', detail: 'LONG BTCUSDT' },
      { stage: 'Profit', result: 'POSITIVE', detail: '+0.8%' },
      { stage: 'Risk', result: 'CONTROLLED', detail: 'Below allowed risk' },
      { stage: 'Rule', result: 'TRIGGERED', detail: 'PROTECT_TP1' },
      { stage: 'Recommendation', result: 'MOVE SL', detail: 'Protect profit' },
    ],
    checks: [
      {
        checkId: 'PC-001',
        ruleId: 'AR-001',
        ruleName: 'Protect TP1',
        priority: 'HIGH',
        status: 'PASS',
        reason: 'TP1 reached',
        recommendation: 'Move SL to break even',
        evidence: [{ label: 'Current Price', value: 107000 }],
        source: 'Protection Module',
      },
      {
        checkId: 'PC-002',
        ruleId: 'AR-002',
        ruleName: 'Trend Intact',
        priority: 'MEDIUM',
        status: 'PASS',
        reason: 'Trend remains bullish',
        recommendation: 'Hold remainder',
        evidence: [{ label: 'EMA20', value: 106210 }],
        source: 'Trend Module',
      },
    ],
    ruleReferences: [
      {
        ruleId: 'AR-001',
        ruleName: 'Protect TP1',
        module: 'Protection Module',
        priority: 'HIGH',
        evidence: 'Current Price=107000',
        triggered: true,
        hardExit: false,
      },
      {
        ruleId: 'AR-002',
        ruleName: 'Trend Intact',
        module: 'Trend Module',
        priority: 'MEDIUM',
        evidence: 'EMA20=106210',
        triggered: false,
        hardExit: false,
      },
    ],
    stopLossPlan: {
      currentSl: 105400,
      suggestedSl: 106150,
      reason: 'Move to break even after TP1',
      breakEven: 'YES',
      trailing: 'Activate after TP2',
      protectionType: 'BREAK_EVEN',
    },
    takeProfitPlan: {
      currentTp: 108000,
      suggestedTp: 108000,
      scaleOut: '40% done at TP1',
      remaining: '60%',
      reason: 'Keep original target',
    },
    positionManagement: {
      initialAdviserState: 'MONITOR',
      currentAdviserState: 'PROTECT_PROFIT',
      expectedAdviserState: 'TRAILING after TP2',
      protection: 'Break even active',
      closeCondition: 'Hard exit rule or TP3',
    },
    ruleEvidence: [
      {
        ruleId: 'AR-001',
        ruleName: 'Protect TP1',
        evidence: [
          { label: 'Current Price', value: 107000 },
          { label: 'TP1', value: 107200 },
        ],
      },
      {
        ruleId: 'AR-002',
        ruleName: 'Trend Intact',
        evidence: [{ label: 'EMA20', value: 106210 }],
      },
    ],
  };
}

const SECTIONS = [
  '# REVIEW MISSION',
  '# Metadata',
  '# POSITION SNAPSHOT',
  '# MARKET SNAPSHOT',
  '# ADVISER SUMMARY',
  '# ADVISER DECISION TREE',
  '# CHECKLIST',
  '# RULE REFERENCES',
  '# STOP LOSS PLAN',
  '# TAKE PROFIT PLAN',
  '# POSITION MANAGEMENT',
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

describe('TASK 17.4 Position Review Export', () => {
  it('Empty — every section rendered with UNAVAILABLE, self-contained', () => {
    const md = buildPositionReviewExport({});
    for (const s of SECTIONS) expect(md).toContain(s);
    expect(md).toContain('Recommendation: UNAVAILABLE');
    expect(md).toContain('Current SL: UNAVAILABLE');
    expect(md).toContain('Conflict: NO');
    // Self-contained: no cross-file references.
    expect(md).not.toContain('01_RULEBOOK.md');
    expect(md).not.toContain('04_POSITION_TRACE.md');
    expect(md).not.toContain('05_TRADE_PLAN.md');
    expect(md).not.toContain('SEE ');
  });

  it('Full export — sections appear in the exact specified order', () => {
    const md = buildPositionReviewExport(fullInput());
    let cursor = -1;
    for (const s of SECTIONS) {
      const next = md.indexOf(s);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it('Metadata — all fields copied verbatim', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('Trade ID: T-2026-0718-010');
    expect(md).toContain('Position ID: P-BTC-002');
    expect(md).toContain('Adviser Version: pa3.0');
    expect(md).toContain('Engine Version: v4.1');
  });

  it('Snapshot — position and market values copied, market keys sorted', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('Entry Price: 106150');
    expect(md).toContain('PnL %: 0.8');
    expect(md).toContain('Break Even: YES');
    expect(md).toContain('Holding Time: 3h');
    const market = md.slice(
      md.indexOf('# MARKET SNAPSHOT'),
      md.indexOf('# ADVISER SUMMARY'),
    );
    expect(market.indexOf('ATR:')).toBeLessThan(market.indexOf('EMA20:'));
    expect(market.indexOf('EMA20:')).toBeLessThan(market.indexOf('Trend:'));
  });

  it('Adviser Summary — recommendation and state copied', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('Recommendation: MOVE SL');
    expect(md).toContain('Reason: Protect profit after TP1');
    expect(md).toContain('Confidence: 0.82');
    expect(md).toContain('Adviser State: PROTECT_PROFIT');
  });

  it('Decision Tree — stages preserved in snapshot order', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('Position: OPEN (LONG BTCUSDT)');
    expect(md).toContain('Recommendation: MOVE SL (Protect profit)');
    const tree = md.slice(
      md.indexOf('# ADVISER DECISION TREE'),
      md.indexOf('# CHECKLIST'),
    );
    expect(tree.indexOf('Position:')).toBeLessThan(tree.indexOf('Profit:'));
    expect(tree.indexOf('Rule:')).toBeLessThan(tree.indexOf('Recommendation:'));
  });

  it('Checklist — one Markdown row per check with evidence', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain(
      '| Check ID | Rule ID | Rule Name | Priority | Status | Reason | Recommendation | Evidence | Source |',
    );
    expect(md).toContain(
      '| PC-001 | AR-001 | Protect TP1 | HIGH | PASS | TP1 reached | Move SL to break even | Current Price=107000 | Protection Module |',
    );
  });

  it('Rule References — table with copied triggered and hard exit flags', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain(
      '| Rule ID | Rule Name | Module | Priority | Evidence | Triggered | Hard Exit |',
    );
    expect(md).toContain(
      '| AR-001 | Protect TP1 | Protection Module | HIGH | Current Price=107000 | YES | NO |',
    );
  });

  it('Evidence — deduplicated by rule id, first wins', () => {
    const input = fullInput();
    input.ruleEvidence = [
      ...(input.ruleEvidence ?? []),
      {
        ruleId: 'AR-001',
        ruleName: 'Protect TP1',
        evidence: [{ label: 'DUP', value: 1 }],
      },
    ];
    const review = buildPositionReview(input);
    const ar001 = review.ruleEvidence.filter((item) => item.ruleId === 'AR-001');
    expect(ar001).toHaveLength(1);
    expect(ar001[0].evidence.some((e) => e.label === 'DUP')).toBe(false);
  });

  it('Stop Loss Plan — copied verbatim, never calculated', () => {
    // suggestedSl intentionally inconsistent with snapshot values:
    // the exporter must copy it, not derive it.
    const input = fullInput();
    input.stopLossPlan = { ...input.stopLossPlan, suggestedSl: 999999 };
    const md = buildPositionReviewExport(input);
    expect(md).toContain('Current SL: 105400');
    expect(md).toContain('Suggested SL: 999999');
    expect(md).toContain('Protection Type: BREAK_EVEN');
    expect(md).toContain('Trailing: Activate after TP2');
  });

  it('Take Profit Plan — scale out and remaining copied', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('Current TP: 108000');
    expect(md).toContain('Suggested TP: 108000');
    expect(md).toContain('Scale Out: 40% done at TP1');
    expect(md).toContain('Remaining: 60%');
  });

  it('Position Management — adviser states and close condition copied', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('Initial Adviser State: MONITOR');
    expect(md).toContain('Current Adviser State: PROTECT_PROFIT');
    expect(md).toContain('Expected Adviser State: TRAILING after TP2');
    expect(md).toContain('Close Condition: Hard exit rule or TP3');
  });

  it('Conflict — CLOSE on profit without hard exit rule is detected', () => {
    const input = fullInput();
    input.summary = { ...input.summary, recommendation: 'CLOSE' };
    const md = buildPositionReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain(
      'Reason: Recommendation CLOSE on profitable position without hard exit rule',
    );

    // Consistent: CLOSE with a triggered hard exit rule → no conflict.
    const consistent = fullInput();
    consistent.summary = { ...consistent.summary, recommendation: 'CLOSE' };
    consistent.ruleReferences = [
      {
        ruleId: 'AR-900',
        ruleName: 'Hard Exit',
        module: 'Risk Module',
        priority: 'CRITICAL',
        evidence: 'Drawdown=MAX',
        triggered: true,
        hardExit: true,
      },
    ];
    expect(buildPositionReviewExport(consistent)).toContain('Conflict: NO');
  });

  it('Conflict — HOLD despite triggered hard exit rule is detected', () => {
    const input = fullInput();
    input.summary = { ...input.summary, recommendation: 'HOLD' };
    input.ruleReferences = [
      {
        ruleId: 'AR-900',
        ruleName: 'Hard Exit',
        module: 'Risk Module',
        priority: 'CRITICAL',
        evidence: 'Drawdown=MAX',
        triggered: true,
        hardExit: true,
      },
    ];
    const md = buildPositionReviewExport(input);
    expect(md).toContain('Conflict: YES');
    expect(md).toContain(
      'Reason: Recommendation HOLD despite hard exit rule (AR-900)',
    );

    // Consistent full input has no conflict.
    expect(buildPositionReviewExport(fullInput())).toContain('Conflict: NO');
  });

  it('AI Review — blank template with all ten rows', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('| Review Item | Result | Severity | Notes |');
    expect(md).toContain('| Wrong Recommendation | □ | | |');
    expect(md).toContain('| Wrong Scale Out | □ | | |');
    expect(md).toContain('| Wrong Trailing | □ | | |');
    expect(md).toContain('| Code Modification Required | □ | | |');
  });

  it('Cursor Prompt — blank field table, exporter fills nothing', () => {
    const md = buildPositionReviewExport(fullInput());
    expect(md).toContain('# CURSOR IMPLEMENTATION PROMPT');
    expect(md).toContain('| Module | |');
    expect(md).toContain('| Root Cause | |');
    expect(md).toContain('| Allowed Files | |');
    expect(md).toContain('| Acceptance Criteria | |');
    expect(md).toContain('### Allowed Files\n\n-');
    expect(md).toContain('### Architecture Requirement\n\n-');
  });

  it('Validation checklist — nine unticked position-specific validations', () => {
    const md = buildPositionReviewExport(fullInput());
    const block = md.slice(
      md.indexOf('# FIX VALIDATION CHECKLIST'),
      md.indexOf('# NEXT REVIEW'),
    );
    expect(block.match(/\| □ \|/g)).toHaveLength(9);
    expect(block).toContain('| Only Position Adviser changed | □ |');
    expect(block).toContain('| TradePlan unchanged | □ |');
    expect(block).toContain('| Stable Output | □ |');
  });

  it('Final Verdict — last section, four options unchecked', () => {
    const md = buildPositionReviewExport(fullInput());
    const verdictIndex = md.indexOf('# FINAL VERDICT');
    expect(verdictIndex).toBeGreaterThan(md.indexOf('# NEXT REVIEW'));
    expect(md.slice(verdictIndex + 1)).not.toContain('\n# ');
    expect(md).toContain('- [ ] PASS');
    expect(md).toContain('- [ ] PASS WITH MINOR ISSUE');
    expect(md).toContain('- [ ] PASS WITH MAJOR ISSUE');
    expect(md.trimEnd()).toMatch(/- \[ \] INVALID$/);
  });

  it('Stable — deterministic and byte-identical across exports', () => {
    const input = fullInput();
    expect(buildPositionReviewExport(input)).toBe(
      buildPositionReviewExport(input),
    );
    const first = new TextEncoder().encode(
      buildPositionReviewExport(fullInput()),
    );
    const second = new TextEncoder().encode(
      buildPositionReviewExport(fullInput()),
    );
    expect([...first]).toEqual([...second]);
  });

  it('No mutation — input snapshot untouched after export', () => {
    const input = fullInput();
    const frozen = JSON.stringify(input);
    buildPositionReviewExport(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('No undefined and no null — no leaked literal, no object dump', () => {
    const md = buildPositionReviewExport({
      metadata: null,
      positionSnapshot: { entryPrice: undefined, pnlPct: null },
      marketSnapshot: null,
      summary: { recommendation: undefined },
      decisionTree: [{ stage: 'Profit', result: undefined, detail: null }],
      checks: [{ checkId: 'PC-1', ruleName: undefined, evidence: null }],
      ruleReferences: null,
      stopLossPlan: null,
      takeProfitPlan: null,
      positionManagement: null,
      ruleEvidence: null,
    });
    expect(md).not.toContain('undefined');
    expect(md).not.toContain('null');
    expect(md).not.toContain('[object Object]');
    expect(md).not.toContain('{');
    expect(md).toContain('Recommendation: UNAVAILABLE');
    expect(md).toContain('Entry Price: UNAVAILABLE');
  });
});

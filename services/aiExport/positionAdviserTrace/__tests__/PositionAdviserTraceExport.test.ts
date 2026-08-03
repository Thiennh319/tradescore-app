import { describe, expect, it } from 'vitest';
import {
  buildPositionAdviserTrace,
  buildPositionAdviserTraceExport,
} from '../index';
import type { PositionAdviserTraceInput } from '../PositionAdviserTraceTypes';

function fullInput(): PositionAdviserTraceInput {
  return {
    metadata: {
      tradeId: 'T-2026-0718-005',
      positionId: 'P-BTC-001',
      coin: 'BTCUSDT',
      side: 'LONG',
      strategy: 'TREND',
      openedTime: '2026-07-18T01:00:00.000Z',
      holdingDuration: '3h',
      ruleVersion: 'r5.0',
      adviserVersion: 'pa3.0',
      engineVersion: 'v4.1',
    },
    positionSnapshot: {
      entryPrice: 106150,
      currentPrice: 107000,
      pnlPct: 0.8,
      pnlUsdt: 85,
      riskReward: 2.5,
      unrealizedProfit: 85,
      stopLoss: 105400,
      takeProfit: 108000,
      trailingStop: 106200,
      breakEven: true,
      leverage: 5,
      positionSize: 0.5,
      exposure: 53075,
      holdingTime: '3h',
      currentAdviserState: 'PROTECT_PROFIT',
    },
    marketSnapshot: {
      Trend: 'UP',
      Momentum: 'BULLISH',
      EMA20: 106210,
      Volume: 2450000,
      Funding: 0.008,
      OI: 245000000,
      CVD: 320000,
      ATR: 850,
      Spread: 0.03,
      Liquidity: 5200000,
      Whale: 105500,
      Support: 105500,
      Resistance: 107200,
      Timing: 'LONDON',
      'Current Score': 86,
      'Entry Grade': 'A',
    },
    decision: {
      recommendation: 'MOVE SL',
      reason: 'Protect profit after TP1',
      summary: 'Trend remains bullish; reduce downside',
      confidence: 0.82,
      priority: 'HIGH',
    },
    decisionTree: [
      { stage: 'Position', result: 'OPEN', detail: 'LONG BTCUSDT' },
      { stage: 'Profit', result: 'POSITIVE', detail: '+0.8%' },
      { stage: 'Risk', result: 'CONTROLLED', detail: 'Below allowed risk' },
      { stage: 'Market', result: 'FAVORABLE', detail: 'Trend UP' },
      { stage: 'Rule', result: 'TRIGGERED', detail: 'PROTECT_TP1' },
      { stage: 'Protection', result: 'MOVE SL', detail: 'Break even' },
      { stage: 'Recommendation', result: 'MOVE SL', detail: 'Protect profit' },
    ],
    checks: [
      {
        id: 'AC-001',
        name: 'Profit',
        status: 'PASS',
        priority: 'HIGH',
        reason: 'Position profitable',
        recommendation: 'Protect profit',
        evidence: [{ label: 'PnL %', value: 0.8 }],
        source: 'PnL Module',
        dependency: 'PnL Module',
        contribution: 'PROTECT',
      },
      {
        id: 'AC-002',
        name: 'Risk',
        status: 'PASS',
        priority: 'CRITICAL',
        reason: 'Risk controlled',
        recommendation: 'Move SL to break even',
        evidence: [{ label: 'Current SL', value: 105400 }],
        source: 'Risk Module',
        dependency: 'Risk Module',
        contribution: 'MOVE SL',
      },
      {
        id: 'AC-003',
        name: 'Trend',
        status: 'PASS',
        priority: 'MEDIUM',
        reason: 'Trend remains bullish',
        recommendation: 'Hold remainder',
        evidence: [{ label: 'EMA20', value: 106210 }],
        source: 'Trend Module',
        dependency: 'Trend Module',
        contribution: 'HOLD',
      },
    ],
    rules: [
      {
        id: 'AR-001',
        name: 'Protect TP1',
        triggered: true,
        priority: 90,
        reason: 'TP1 reached',
        evidence: [{ label: 'Current Price', value: 107000 }],
        override: false,
        hardExit: false,
      },
    ],
    positionAction: {
      currentAction: 'HOLD',
      suggestedAction: 'MOVE SL',
      reason: 'Protect unrealized profit',
      expectedEffect: 'Remove initial downside',
      risk: 'LOW',
    },
    stopLossPlan: {
      currentStopLoss: 105400,
      suggestedStopLoss: 106150,
      reason: 'Move to break even',
      protectionType: 'BREAK_EVEN',
      breakEven: true,
      trailing: true,
      worsensProtection: false,
    },
    takeProfitPlan: {
      currentTakeProfit: 108000,
      suggestedTakeProfit: 108500,
      scaleOutPct: 50,
      remainingPct: 50,
      reason: 'Scale at resistance',
    },
    riskReview: {
      currentRisk: 'LOW',
      allowedRisk: 'MEDIUM',
      drawdown: 0,
      exposure: 53075,
      ruleStatus: 'PASS',
    },
    contributions: [
      { name: 'Trend', contribution: 'HOLD', reason: 'Bullish' },
      { name: 'Profit', contribution: 'MOVE SL', reason: 'TP1 reached' },
      { name: 'Risk', contribution: 'PROTECT', reason: 'Reduce downside' },
      { name: 'Whale', contribution: 'NEUTRAL', reason: 'No exit signal' },
      { name: 'Funding', contribution: 'NEUTRAL', reason: 'Normal' },
    ],
  };
}

describe('TASK 16.5 Position Adviser Trace Export', () => {
  it('Empty — exports every section with UNAVAILABLE', () => {
    const markdown = buildPositionAdviserTraceExport({});
    expect(markdown).toContain('# POSITION SNAPSHOT');
    expect(markdown).toContain('# ADVISER DECISION TREE');
    expect(markdown).toContain('# STOP LOSS PLAN');
    expect(markdown).toContain('# TAKE PROFIT PLAN');
    expect(markdown).toContain('Recommendation: UNAVAILABLE');
    expect(markdown).toContain('Conflict: NO');
  });

  it('HOLD — recommendation and reason are copied', () => {
    const markdown = buildPositionAdviserTraceExport({
      decision: { recommendation: 'HOLD', reason: 'Trend remains valid' },
    });
    expect(markdown).toContain('Recommendation: HOLD');
    expect(markdown).toContain('Reason: Trend remains valid');
    expect(markdown).toContain('Conflict: NO');
  });

  it('MOVE SL — decision, action and stop plan are exported', () => {
    const markdown = buildPositionAdviserTraceExport(fullInput());
    expect(markdown).toContain('Recommendation: MOVE SL');
    expect(markdown).toContain('Suggested Action: MOVE SL');
    expect(markdown).toContain('Suggested SL: 106150');
    expect(markdown).toContain('Protection Type: BREAK_EVEN');
  });

  it('SCALE OUT — recommendation and percentages remain verbatim', () => {
    const markdown = buildPositionAdviserTraceExport({
      decision: { recommendation: 'SCALE OUT' },
      takeProfitPlan: { scaleOutPct: 30, remainingPct: 70 },
    });
    expect(markdown).toContain('Recommendation: SCALE OUT');
    expect(markdown).toContain('Scale Out %: 30');
    expect(markdown).toContain('Remaining %: 70');
  });

  it('CLOSE — consistent triggered exit rule has no conflict', () => {
    const trace = buildPositionAdviserTrace({
      decision: { recommendation: 'CLOSE', reason: 'Exit rule triggered' },
      positionSnapshot: { pnlPct: 1.2 },
      rules: [{ id: 'EXIT-1', triggered: true, hardExit: true }],
    });
    expect(trace.decision.recommendation).toBe('CLOSE');
    expect(trace.conflict.detected).toBe(false);
  });

  it('Trailing Stop — copied without deriving a price', () => {
    const markdown = buildPositionAdviserTraceExport(fullInput());
    expect(markdown).toContain('Trailing Stop: 106200');
    expect(markdown).toContain('Trailing: YES');
  });

  it('Break Even — copied in position and stop-loss plan', () => {
    const markdown = buildPositionAdviserTraceExport(fullInput());
    expect(markdown.match(/Break Even: YES/g)).toHaveLength(2);
    expect(markdown).toContain('Current SL: 105400');
    expect(markdown).toContain('Suggested SL: 106150');
  });

  it('Conflict — detects all three structural scenarios only from frozen signals', () => {
    const close = buildPositionAdviserTrace({
      decision: { recommendation: 'CLOSE' },
      positionSnapshot: { pnlPct: 2 },
      rules: [],
    });
    expect(close.conflict.reasons).toContain(
      'CLOSE on profitable position without triggered rule',
    );

    const move = buildPositionAdviserTrace({
      decision: { recommendation: 'MOVE SL' },
      stopLossPlan: { worsensProtection: true },
    });
    expect(move.conflict.reasons).toContain('MOVE SL worsens protection');

    const hold = buildPositionAdviserTrace({
      decision: { recommendation: 'HOLD' },
      rules: [{ id: 'EXIT-HARD', triggered: true, hardExit: true }],
    });
    expect(hold.conflict.reasons[0]).toContain(
      'HOLD despite hard exit rule (EXIT-HARD)',
    );
  });

  it('Checklist and rules — one Markdown row each with evidence', () => {
    const markdown = buildPositionAdviserTraceExport(fullInput());
    expect(markdown).toContain(
      '| Check ID | Check Name | Status | Priority | Reason | Recommendation | Evidence | Source |',
    );
    expect(markdown).toContain(
      '| AC-001 | Profit | PASS | HIGH | Position profitable | Protect profit | PnL %=0.8 | PnL Module |',
    );
    expect(markdown).toContain('| AR-001 | Protect TP1 | YES | 90 |');
  });

  it('Decision Tree — stages remain in Adviser order', () => {
    const markdown = buildPositionAdviserTraceExport(fullInput());
    const tree = markdown.slice(
      markdown.indexOf('# ADVISER DECISION TREE'),
      markdown.indexOf('# ADVISER CHECKLIST'),
    );
    const stages = [
      'Position [OPEN]',
      'Profit [POSITIVE]',
      'Risk [CONTROLLED]',
      'Market [FAVORABLE]',
      'Rule [TRIGGERED]',
      'Protection [MOVE SL]',
      'Recommendation [MOVE SL]',
    ];
    let previous = -1;
    for (const stage of stages) {
      const index = tree.indexOf(stage);
      expect(index, `missing ${stage}`).toBeGreaterThan(previous);
      previous = index;
    }
  });

  it('Stable — deterministic, byte-identical and input remains untouched', () => {
    const input = fullInput();
    const before = JSON.stringify(input);
    const first = buildPositionAdviserTraceExport(input);
    const second = buildPositionAdviserTraceExport(fullInput());
    expect(first).toBe(second);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('Markdown — all sections and AI Review table appear in order', () => {
    const markdown = buildPositionAdviserTraceExport(fullInput());
    const sections = [
      '# Metadata',
      '# POSITION SNAPSHOT',
      '# MARKET SNAPSHOT',
      '# ADVISER DECISION',
      '# ADVISER DECISION TREE',
      '# ADVISER CHECKLIST',
      '# ADVISER RULES',
      '# POSITION ACTION',
      '# STOP LOSS PLAN',
      '# TAKE PROFIT PLAN',
      '# RISK REVIEW',
      '# ADVISER CONTRIBUTION',
      '# DECISION CHAIN',
      '# DEPENDENCY',
      '# CONFLICT DETECTION',
      '# AI REVIEW',
    ];
    let previous = -1;
    for (const section of sections) {
      const index = markdown.indexOf(`${section}\n`);
      expect(index, `missing ${section}`).toBeGreaterThan(previous);
      previous = index;
    }
    expect(markdown).toContain('| Review Item | Result | Notes |');
    expect(markdown).toContain('| Wrong Stop Loss | □ | |');
    expect(markdown).toContain('| Adviser Conflict | □ | |');
  });

  it('No Undefined — missing values never leak the undefined literal', () => {
    for (const input of [
      {},
      fullInput(),
      { checks: [{}], rules: [{}] } as PositionAdviserTraceInput,
    ]) {
      expect(buildPositionAdviserTraceExport(input)).not.toMatch(/\bundefined\b/);
    }
  });

  it('No Null — no null/object/JSON dump and contribution is not calculated', () => {
    const input = fullInput();
    input.contributions = [
      { name: 'Trend', contribution: 'IMPOSSIBLE_VALUE', reason: 'Copy only' },
    ];
    const markdown = buildPositionAdviserTraceExport(input);
    expect(markdown).toContain('Trend: IMPOSSIBLE_VALUE — Copy only');
    expect(markdown).not.toMatch(/\bnull\b/);
    expect(markdown).not.toContain('[object Object]');
    expect(markdown).not.toContain('{"');
  });
});

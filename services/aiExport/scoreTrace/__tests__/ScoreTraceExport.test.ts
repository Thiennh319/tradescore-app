import { describe, expect, it } from 'vitest';
import { buildScoreTrace, buildScoreTraceExport } from '../index';
import type {
  ScoreTraceComponent,
  ScoreTraceInput,
} from '../ScoreTraceTypes';

function component(
  partial: Partial<ScoreTraceComponent> = {},
): ScoreTraceComponent {
  return {
    id: 'SC-001',
    name: 'EMA Alignment',
    category: 'Trend',
    weight: 20,
    maxScore: 20,
    actualScore: 20,
    contribution: '+20',
    status: 'PASS',
    actual: 'EMA20 > EMA50 > EMA200',
    expected: 'EMA20 > EMA50 > EMA200',
    reason: 'Bullish alignment',
    recommendation: 'Keep',
    evidence: [
      { label: 'EMA20', value: 106210 },
      { label: 'EMA50', value: 105900 },
      { label: 'EMA200', value: 104800 },
    ],
    sourceModule: 'EMA Module',
    dependency: 'EMA Module',
    enabled: true,
    ...partial,
  };
}

function fullInput(): ScoreTraceInput {
  return {
    metadata: {
      generatedAt: '2026-07-18T03:30:00.000Z',
      tradeId: 'T-2026-0718-003',
      coin: 'BTCUSDT',
      side: 'LONG',
      engineVersion: 'v4.1',
      scoreVersion: 's2.0',
    },
    inputSnapshot: {
      EMA20: 106210,
      'EMA Slope': 0.42,
      Trend: 'UP',
      Volume: 2050000,
      'Volume Ratio': 0.84,
      'Funding Rate': 0.012,
      OI: 245000000,
      'OI Delta': 2.4,
      CVD: 320000,
      Whale: 105500,
      ATR: 850,
      Spread: 0.03,
      Liquidity: 5200000,
      Support: 105500,
      Resistance: 107200,
      'Risk Reward': 2.5,
      Timing: 'LONDON',
      'RuleBook State': 'HARD_BLOCKED',
    },
    components: [
      component(),
      component({
        id: 'SC-002',
        name: 'Volume',
        category: 'Volume',
        weight: 15,
        maxScore: 15,
        actualScore: 0,
        contribution: '-15',
        status: 'FAIL',
        actual: '0.84 MA20',
        expected: '>=1.20 MA20',
        reason: 'Volume below threshold',
        recommendation: 'Wait for confirmation',
        evidence: [{ label: 'Ratio', value: 0.84 }],
        sourceModule: 'Volume Module',
        dependency: 'Volume Module',
      }),
      component({
        id: 'SC-003',
        name: 'Funding',
        category: 'Derivatives',
        weight: 10,
        maxScore: 10,
        actualScore: 0,
        contribution: '0',
        status: 'FAIL',
        actual: '0.12%',
        expected: '<=0.10%',
        reason: 'Funding extreme',
        recommendation: 'Wait for funding reset',
        evidence: [{ label: 'Funding Rate', value: 0.012 }],
        sourceModule: 'Funding Module',
        dependency: 'Funding Module',
      }),
    ],
    bonuses: [
      {
        id: 'B-001',
        reason: 'Strong trend alignment',
        contribution: '+5',
        evidence: [{ label: 'Trend Strength', value: 0.88 }],
        sourceModule: 'Trend Module',
      },
    ],
    penalties: [
      {
        id: 'P-001',
        reason: 'Low volume',
        contribution: '-10',
        evidence: [{ label: 'Volume Ratio', value: 0.84 }],
        sourceModule: 'Volume Module',
      },
    ],
    hardBlocks: [
      {
        id: 'HB-001',
        rule: 'FUNDING_EXTREME',
        reason: 'Funding above hard limit',
        overrideScore: true,
        evidence: [{ label: 'Funding Rate', value: 0.012 }],
      },
    ],
    summary: {
      rawScore: 82,
      bonus: '+5',
      penalty: '-10',
      override: 'HARD BLOCK → WAIT',
      finalScore: 77,
      grade: 'B',
      decision: 'WAIT',
    },
  };
}

describe('TASK 16.3 Score Trace Export', () => {
  it('Empty — exports all sections with UNAVAILABLE values', () => {
    const markdown = buildScoreTraceExport({});
    expect(markdown).toContain('# SCORE COMPONENTS');
    expect(markdown).toContain('# BONUS');
    expect(markdown).toContain('# PENALTY');
    expect(markdown).toContain('# HARD / GROUP BLOCK');
    expect(markdown).toContain('Final Score: UNAVAILABLE');
  });

  it('Single Component — exports full component journey and one evidence set', () => {
    const markdown = buildScoreTraceExport({ components: [component()] });
    expect(markdown).toContain('Component 001');
    expect(markdown).toContain('Score ID: SC-001');
    expect(markdown).toContain('Weight: 20');
    expect(markdown).toContain('Actual Score: 20');
    expect(markdown).toContain('Display Layer Score: +20');
    expect(markdown).toContain('- EMA20=106210');
    expect(markdown.match(/EMA20=106210/g)).toHaveLength(1);
  });

  it('All PASS — preserves every PASS status', () => {
    const trace = buildScoreTrace({
      components: [
        component(),
        component({ id: 'SC-002', name: 'Whale' }),
      ],
    });
    expect(trace.components.map((item) => item.status)).toEqual([
      'PASS',
      'PASS',
    ]);
  });

  it('Mixed PASS FAIL — component table and reasons remain verbatim', () => {
    const markdown = buildScoreTraceExport(fullInput());
    expect(markdown).toContain(
      '| EMA Alignment | 20 | 20 | +20 | PASS |',
    );
    expect(markdown).toContain('| Volume | 15 | 0 | -15 | FAIL |');
    expect(markdown).toContain('Reason: Volume below threshold');
  });

  it('Bonus — exports ID, contribution, reason and evidence', () => {
    const markdown = buildScoreTraceExport(fullInput());
    expect(markdown).toContain('Bonus 001');
    expect(markdown).toContain('Bonus ID: B-001');
    expect(markdown).toContain('Contribution: +5');
    expect(markdown).toContain('- Trend Strength=0.88');
  });

  it('Penalty — exports ID, contribution, reason and evidence', () => {
    const markdown = buildScoreTraceExport(fullInput());
    expect(markdown).toContain('Penalty 001');
    expect(markdown).toContain('Penalty ID: P-001');
    expect(markdown).toContain('Contribution: -10');
    expect(markdown).toContain('- Volume Ratio=0.84');
  });

  it('Hard Block — exports frozen block rule and reason', () => {
    const markdown = buildScoreTraceExport(fullInput());
    expect(markdown).toContain('Block ID: HB-001');
    expect(markdown).toContain('Rule: FUNDING_EXTREME');
    expect(markdown).toContain('Reason: Funding above hard limit');
  });

  it('Override — YES/NO and summary override are explicit', () => {
    const markdown = buildScoreTraceExport(fullInput());
    expect(markdown).toContain('Override Score: YES');
    expect(markdown).toContain('Override: HARD BLOCK → WAIT');

    const noOverride = buildScoreTraceExport({
      hardBlocks: [{ id: 'HB-002', overrideScore: false }],
    });
    expect(noOverride).toContain('Override Score: NO');
  });

  it('No recalculation — inconsistent engine summary is copied as-is', () => {
    const input = fullInput();
    input.summary = {
      rawScore: 999,
      bonus: '+5',
      penalty: '-10',
      finalScore: 123,
      grade: 'Z',
      decision: 'WAIT',
    };
    const markdown = buildScoreTraceExport(input);
    expect(markdown).toContain('Decision Total (snap.score): 999');
    expect(markdown).toContain('Final Score: 123');
    expect(markdown).toContain('Grade: Z');
  });

  it('Stable Output — deterministic and input remains unchanged', () => {
    const input = fullInput();
    const before = JSON.stringify(input);
    const first = buildScoreTraceExport(input);
    const second = buildScoreTraceExport(fullInput());
    expect(first).toBe(second);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('Markdown Format — all required sections appear in order', () => {
    const markdown = buildScoreTraceExport(fullInput());
    const sections = [
      '# Metadata',
      '# INPUT SNAPSHOT',
      '# SCORE COMPONENTS',
      '# SCORE TABLE',
      '# GROUP BREAKDOWN',
      '# SCORE TRACE INTERPRETATION',
      '# BONUS',
      '# PENALTY',
      '# HARD / GROUP BLOCK',
      '# SCORE SUMMARY',
      '# SCORE EXPLAINABILITY',
      '# SCORE DEPENDENCY',
      '# SCORE TIMELINE',
      '# AI REVIEW',
    ];
    let previous = -1;
    for (const section of sections) {
      const index = markdown.indexOf(`${section}\n`);
      expect(index, `missing or misplaced ${section}`).toBeGreaterThan(
        previous,
      );
      previous = index;
    }
    expect(markdown).toContain(
      '| Component | Max | Actual | Display Layer Score | Status |',
    );
    expect(markdown).toContain(
      'They do NOT sum to Decision Total / Final Score — see GROUP BREAKDOWN.',
    );
    expect(markdown).toContain('# SCORE TRACE INTERPRETATION');
    expect(markdown).toContain(
      'Hand-summing these values does NOT produce Decision Total or Final Score.',
    );
    expect(markdown).toContain(
      'If hand-sum of Display Layer Scores (e.g. ~9.76) ≠ Decision Total (e.g. 8.65),',
    );
    expect(markdown).toContain(
      'Do NOT hand-sum Display Layer Scores and compare to Decision Total',
    );
    expect(markdown).toContain('- EMA Alignment depends EMA Module');
  });

  it('Score Timeline — exports every stage without computing it', () => {
    const markdown = buildScoreTraceExport(fullInput());
    const timeline = markdown.slice(markdown.indexOf('# SCORE TIMELINE'));
    for (const step of [
      'Input',
      'Rule Evaluation',
      'Decision Total (snap.score): 82',
      'Bonus: +5',
      'Penalty: -10',
      'Override: HARD BLOCK → WAIT',
      'Final Score: 77',
    ]) {
      expect(timeline).toContain(step);
    }
  });

  it('Score Review Checklist — contains all required questions', () => {
    const markdown = buildScoreTraceExport(fullInput());
    for (const item of [
      'Missing Component?',
      'Wrong Weight?',
      'Wrong Display Layer Score?',
      'Threshold Too Strict?',
      'Threshold Too Loose?',
      'Duplicate Component?',
      'Dead Component?',
      'Bonus Conflict?',
      'Penalty Conflict?',
      'Override Correct?',
      'Final Score Correct?',
      'Need Optimization?',
    ]) {
      expect(markdown).toContain(item);
    }
  });

  it('No Undefined / No Null — no object or JSON dump leaks', () => {
    for (const input of [
      {},
      fullInput(),
      { components: [{}] } as ScoreTraceInput,
    ]) {
      const markdown = buildScoreTraceExport(input);
      expect(markdown).not.toMatch(/\bundefined\b/);
      expect(markdown).not.toMatch(/\bnull\b/);
      expect(markdown).not.toContain('[object Object]');
      expect(markdown).not.toContain('{"');
    }
  });

  // ── TASK 17.X — Score Trace Fix (AI Review Findings) ───────────────

  it('17.X F1 — HardBlocked NO with HARD BLOCK entries reports a conflict', () => {
    const input = fullInput();
    input.summary = { ...input.summary, hardBlocked: false };
    const markdown = buildScoreTraceExport(input);
    expect(markdown).toContain('# CONFLICT DETECTION');
    expect(markdown).toContain('Conflict: YES');
    expect(markdown).toContain(
      'Reason: HardBlocked NO but 1 hard block entry exported',
    );
    expect(markdown).toContain('Hard/Group Blocked: NO');
  });

  it('17.X F1 — HardBlocked flag read from copied input snapshot key', () => {
    const input = fullInput();
    input.inputSnapshot = {
      ...input.inputSnapshot,
      'Hard/Group Blocked State': false,
    };
    const markdown = buildScoreTraceExport(input);
    expect(markdown).toContain(
      'Reason: HardBlocked NO but 1 hard block entry exported',
    );
  });

  it('17.X F1 — consistent flag and entries produce no conflict', () => {
    const consistent = fullInput();
    consistent.summary = { ...consistent.summary, hardBlocked: true };
    expect(buildScoreTraceExport(consistent)).toContain('Conflict: NO');

    const noFlag = fullInput();
    expect(buildScoreTraceExport(noFlag)).toContain('Conflict: NO');
  });

  it('17.X F1 — HardBlocked YES without entries reports a conflict', () => {
    const input = fullInput();
    input.summary = { ...input.summary, hardBlocked: 'YES' };
    input.hardBlocks = [];
    const markdown = buildScoreTraceExport(input);
    expect(markdown).toContain(
      'Reason: HardBlocked YES but no hard block entries exported',
    );
  });

  it('17.X F3/F5 — Decision Policy copied when snapshot provides it', () => {
    const input = fullInput();
    input.decisionPolicy = {
      decisionThreshold: '>= 9.0',
      decisionPolicy: 'SCORE_THRESHOLDS v15d',
      decisionSource: 'Score Engine',
      decisionRule: 'score < CO_THE_VAO threshold',
      decisionMapping: '8.1 → CHO_THEM',
      decisionReason: 'Score below entry threshold',
      overridden: 'YES',
      overrideRule: 'FUNDING_EXTREME',
      overrideModule: 'Funding Module',
      overrideReason: 'Funding above hard limit',
      overrideEvidence: [{ label: 'Funding Rate', value: 0.012 }],
    };
    const markdown = buildScoreTraceExport(input);
    const policy = markdown.slice(
      markdown.indexOf('# DECISION POLICY'),
      markdown.indexOf('# SCORE EXPLAINABILITY'),
    );
    expect(policy).toContain('Decision: WAIT');
    expect(policy).toContain('Decision Threshold: >= 9.0');
    expect(policy).toContain('Decision Policy: SCORE_THRESHOLDS v15d');
    expect(policy).toContain('Decision Mapping: 8.1 → CHO_THEM');
    expect(policy).toContain('Override: YES');
    expect(policy).toContain('Override Rule: FUNDING_EXTREME');
    expect(policy).toContain('Override Module: Funding Module');
    expect(policy).toContain('- Funding Rate=0.012');
  });

  it('17.X F3/F5 — missing Decision Policy renders UNAVAILABLE fields', () => {
    const markdown = buildScoreTraceExport(fullInput());
    const policy = markdown.slice(
      markdown.indexOf('# DECISION POLICY'),
      markdown.indexOf('# SCORE EXPLAINABILITY'),
    );
    expect(policy).toContain('Decision Threshold: UNAVAILABLE');
    expect(policy).toContain('Decision Source: UNAVAILABLE');
    expect(policy).toContain('Decision Mapping: UNAVAILABLE');
    expect(policy).toContain('Override Rule: UNAVAILABLE');
  });

  it('17.X F4 — Override YES without override rule reports a conflict', () => {
    const input = fullInput();
    input.decisionPolicy = { overridden: true };
    const markdown = buildScoreTraceExport(input);
    expect(markdown).toContain(
      'Reason: Decision Override YES but Override Rule UNAVAILABLE',
    );
  });

  it('17.X — deterministic output and no input mutation with new fields', () => {
    const input = fullInput();
    input.summary = { ...input.summary, hardBlocked: false };
    input.decisionPolicy = { decisionThreshold: '>= 9.0' };
    const frozen = JSON.stringify(input);
    const first = buildScoreTraceExport(input);
    const second = buildScoreTraceExport(input);
    expect(first).toBe(second);
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

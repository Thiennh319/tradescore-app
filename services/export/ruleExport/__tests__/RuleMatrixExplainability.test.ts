import { describe, expect, it } from 'vitest';
import {
  buildRuleMatrixExport,
  type RuleEvaluationItem,
  type RuleEvaluationResult,
} from '../RuleMatrixExporter';

function rule(partial: Partial<RuleEvaluationItem>): RuleEvaluationItem {
  return {
    id: 'RR',
    title: 'Risk Reward',
    layer: 'Risk',
    category: 'RR',
    mandatory: false,
    enabled: true,
    weight: 10,
    maxScore: 10,
    score: 0,
    status: 'FAIL',
    reason: 'Risk Reward dưới ngưỡng',
    recommendation: 'Đợi RR >= 2',
    ...partial,
  };
}

function evaluation(rules: RuleEvaluationItem[]): RuleEvaluationResult {
  return { rules, evaluatedAt: '2026-07-18T02:15:00.000Z' };
}

describe('TASK R1.4.1 Rule Matrix Explainability', () => {
  it('Actual export — copies the value the rule actually read', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ actual: 1.35 }),
        rule({ id: 'EMA_ALIGNMENT', actual: 'EMA20 > EMA50 > EMA200' }),
        rule({ id: 'PULLBACK', actual: true }),
      ]),
    );

    expect(out.rules[0].actual).toBe(1.35);
    expect(out.rules[1].actual).toBe('EMA20 > EMA50 > EMA200');
    expect(out.rules[2].actual).toBe(true);
  });

  it('Expected export — copies the required threshold verbatim', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ expected: 2 }),
        rule({ id: 'EMA_ALIGNMENT', expected: 'Bullish Alignment' }),
      ]),
    );

    expect(out.rules[0].expected).toBe(2);
    expect(out.rules[1].expected).toBe('Bullish Alignment');
  });

  it('Unit export', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ unit: 'RR' }),
        rule({ id: 'FUNDING', unit: '%' }),
        rule({ id: 'WHALE', unit: 'USDT' }),
      ]),
    );

    expect(out.rules.map((r) => r.unit)).toEqual(['RR', '%', 'USDT']);
  });

  it('Operator export', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ operator: '>=' }),
        rule({ id: 'FUNDING', operator: '<' }),
        rule({ id: 'STATE', operator: '=' }),
      ]),
    );

    expect(out.rules.map((r) => r.operator)).toEqual(['>=', '<', '=']);
  });

  it('Dependency export — copied list, defaults to []', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ dependency: ['TREND'] }),
        rule({ id: 'WHALE', dependency: ['VOLUME', 'TREND'] }),
        rule({ id: 'NO_DEP' }),
      ]),
    );

    expect(out.rules[0].dependency).toEqual(['TREND']);
    expect(out.rules[1].dependency).toEqual(['VOLUME', 'TREND']);
    expect(out.rules[2].dependency).toEqual([]);
  });

  it('BlockType export — SOFT/HARD copied, missing → NONE', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ blockType: 'SOFT' }),
        rule({ id: 'TREND_OPPOSITE', blockType: 'HARD' }),
        rule({ id: 'INFO_ONLY' }),
      ]),
    );

    expect(out.rules.map((r) => r.blockType)).toEqual(['SOFT', 'HARD', 'NONE']);
  });

  it('Severity export — copied, missing → null (never guessed)', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ severity: 'HIGH' }),
        rule({ id: 'MINOR', severity: 'LOW' }),
        rule({ id: 'UNRATED' }),
      ]),
    );

    expect(out.rules[0].severity).toBe('HIGH');
    expect(out.rules[1].severity).toBe('LOW');
    expect(out.rules[2].severity).toBeNull();
  });

  it('evaluationOrder export — copied, missing → 0', () => {
    const out = buildRuleMatrixExport(
      evaluation([rule({ evaluationOrder: 18 }), rule({ id: 'NO_ORDER' })]),
    );

    expect(out.rules[0].evaluationOrder).toBe(18);
    expect(out.rules[1].evaluationOrder).toBe(0);
  });

  it('Null-safe — engine without explainability exports null / empty', () => {
    const out = buildRuleMatrixExport(evaluation([rule({ actual: NaN })]));
    const item = out.rules[0];

    expect(item.actual).toBeNull();
    expect(item.expected).toBeNull();
    expect(item.operator).toBeNull();
    expect(item.severity).toBeNull();
    expect(item.unit).toBe('');
    expect(item.source).toBe('');
    expect(item.dependency).toEqual([]);
    expect(item.evaluationOrder).toBe(0);
    expect(item.blockType).toBe('NONE');
  });

  it('Deterministic — fingerprint reacts to explainability content only', () => {
    const base = rule({
      actual: 1.35,
      operator: '>=',
      expected: 2,
      unit: 'RR',
      source: 'Risk Engine',
      dependency: ['TREND'],
      evaluationOrder: 18,
      blockType: 'SOFT',
      severity: 'HIGH',
    });

    const a = buildRuleMatrixExport(evaluation([base]));
    const b = buildRuleMatrixExport(evaluation([{ ...base }]));
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a).toEqual(b);

    const changed = buildRuleMatrixExport(
      evaluation([{ ...base, actual: 2.1 }]),
    );
    expect(changed.fingerprint).not.toBe(a.fingerprint);
  });

  it('Read-only — input untouched, dependency array not shared', () => {
    const dependency = ['TREND'];
    const input = evaluation([rule({ dependency, severity: 'HIGH' })]);
    const snapshotBefore = JSON.stringify(input);

    const out = buildRuleMatrixExport(input);
    (out.rules[0].dependency as string[]).push('HACK');

    expect(JSON.stringify(input)).toBe(snapshotBefore);
    expect(dependency).toEqual(['TREND']);
  });

  it('matches spec JSON example shape', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({
          actual: 1.35,
          operator: '>=',
          expected: 2,
          unit: 'RR',
          source: 'Risk Engine',
          dependency: ['TREND'],
          evaluationOrder: 18,
          blockType: 'SOFT',
          severity: 'HIGH',
        }),
      ]),
    );

    expect(out.rules[0]).toMatchObject({
      id: 'RR',
      title: 'Risk Reward',
      status: 'FAIL',
      severity: 'HIGH',
      actual: 1.35,
      operator: '>=',
      expected: 2,
      unit: 'RR',
      source: 'Risk Engine',
      dependency: ['TREND'],
      evaluationOrder: 18,
      blockType: 'SOFT',
      reason: 'Risk Reward dưới ngưỡng',
      recommendation: 'Đợi RR >= 2',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildRuleMatrixExport,
  type RuleEvaluationItem,
  type RuleEvaluationResult,
} from '../RuleMatrixExporter';

function rule(partial: Partial<RuleEvaluationItem>): RuleEvaluationItem {
  return {
    id: 'EMA_ALIGNMENT',
    title: 'EMA Alignment',
    layer: 'Trend',
    category: 'EMA',
    mandatory: false,
    enabled: true,
    weight: 20,
    maxScore: 20,
    score: 20,
    status: 'PASS',
    reason: 'EMA20 > EMA50 > EMA200',
    recommendation: '',
    ...partial,
  };
}

function evaluation(
  rules: RuleEvaluationItem[],
  evaluatedAt = '2026-07-18T02:00:00.000Z',
): RuleEvaluationResult {
  return { rules, evaluatedAt };
}

describe('TASK R1.4 RuleMatrixExporter', () => {
  it('Empty — exports zero counters and empty fingerprint', () => {
    const out = buildRuleMatrixExport(evaluation([]));

    expect(out.version).toBe(1);
    expect(out.totalRules).toBe(0);
    expect(out.passedRules).toBe(0);
    expect(out.warningRules).toBe(0);
    expect(out.failedRules).toBe(0);
    expect(out.mandatoryPassed).toBe(0);
    expect(out.mandatoryFailed).toBe(0);
    expect(out.rules).toEqual([]);
    expect(out.fingerprint).toBe('empty');
    expect(out.generatedAt).toBe('2026-07-18T02:00:00.000Z');
  });

  it('All Pass — counts every rule as passed', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ id: 'R1' }),
        rule({ id: 'R2', mandatory: true }),
        rule({ id: 'R3' }),
      ]),
    );

    expect(out.totalRules).toBe(3);
    expect(out.passedRules).toBe(3);
    expect(out.warningRules).toBe(0);
    expect(out.failedRules).toBe(0);
    expect(out.mandatoryPassed).toBe(1);
    expect(out.mandatoryFailed).toBe(0);
  });

  it('Warning — counted separately, does not affect mandatory tallies', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ id: 'R1', status: 'WARNING', mandatory: true }),
        rule({ id: 'R2' }),
      ]),
    );

    expect(out.warningRules).toBe(1);
    expect(out.passedRules).toBe(1);
    expect(out.mandatoryPassed).toBe(0);
    expect(out.mandatoryFailed).toBe(0);
  });

  it('Fail — exports frozen reason and recommendation as-is', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({
          id: 'VOLUME_CONFIRMATION',
          title: 'Volume Confirmation',
          layer: 'Volume',
          category: 'Volume',
          mandatory: true,
          weight: 10,
          maxScore: 10,
          score: 0,
          status: 'FAIL',
          reason: 'Volume = 0.82 x MA20',
          recommendation: 'Wait for stronger participation',
        }),
      ]),
    );

    expect(out.failedRules).toBe(1);
    expect(out.rules[0]).toEqual({
      id: 'VOLUME_CONFIRMATION',
      title: 'Volume Confirmation',
      layer: 'Volume',
      category: 'Volume',
      mandatory: true,
      enabled: true,
      weight: 10,
      maxScore: 10,
      score: 0,
      status: 'FAIL',
      severity: null,
      actual: null,
      operator: null,
      expected: null,
      unit: '',
      source: '',
      dependency: [],
      evaluationOrder: 0,
      blockType: 'NONE',
      reason: 'Volume = 0.82 x MA20',
      recommendation: 'Wait for stronger participation',
    });
  });

  it('Mandatory Fail — tallied in mandatoryFailed', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ id: 'R1', mandatory: true, status: 'FAIL', score: 0 }),
        rule({ id: 'R2', mandatory: true }),
        rule({ id: 'R3', mandatory: false, status: 'FAIL', score: 0 }),
      ]),
    );

    expect(out.mandatoryFailed).toBe(1);
    expect(out.mandatoryPassed).toBe(1);
    expect(out.failedRules).toBe(2);
  });

  it('Disabled Rule — exported with enabled=false and SKIPPED preserved', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({
          id: 'SPREAD_GUARD',
          layer: 'Liquidity',
          category: 'Spread',
          enabled: false,
          status: 'SKIPPED',
          score: 0,
          reason: 'Skipped — prior condition blocked evaluation',
        }),
      ]),
    );

    expect(out.totalRules).toBe(1);
    expect(out.passedRules).toBe(0);
    expect(out.failedRules).toBe(0);
    expect(out.rules[0].enabled).toBe(false);
    expect(out.rules[0].status).toBe('SKIPPED');
  });

  it('Stable Output — same input produces identical export', () => {
    const input = evaluation([
      rule({ id: 'R1' }),
      rule({ id: 'R2', status: 'FAIL', score: 0 }),
    ]);

    const a = buildRuleMatrixExport(input);
    const b = buildRuleMatrixExport(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('Deterministic — fingerprint is order-independent and content-sensitive', () => {
    const r1 = rule({ id: 'R1' });
    const r2 = rule({ id: 'R2', status: 'WARNING' });

    const forward = buildRuleMatrixExport(evaluation([r1, r2]));
    const reversed = buildRuleMatrixExport(evaluation([r2, r1]));
    expect(forward.fingerprint).toBe(reversed.fingerprint);

    const changed = buildRuleMatrixExport(
      evaluation([r1, rule({ id: 'R2', status: 'FAIL', score: 0 })]),
    );
    expect(changed.fingerprint).not.toBe(forward.fingerprint);
  });

  it('Read Only — input evaluation is never mutated', () => {
    const rules = [rule({ id: 'R1' }), rule({ id: 'R2', status: 'FAIL' })];
    const input = evaluation(rules);
    const snapshotBefore = JSON.stringify(input);

    const out = buildRuleMatrixExport(input);
    out.rules[0].score = 999;
    out.rules[0].status = 'FAIL';

    expect(JSON.stringify(input)).toBe(snapshotBefore);
  });

  it('No Score Recalculation — scores/weights copied verbatim even if inconsistent', () => {
    // score > maxScore would be "wrong" if recalculated; exporter must copy as-is.
    const out = buildRuleMatrixExport(
      evaluation([
        rule({
          id: 'RR_CHECK',
          layer: 'Risk',
          category: 'RR',
          weight: 7,
          maxScore: 5,
          score: 9,
          status: 'PASS',
        }),
      ]),
    );

    expect(out.rules[0].weight).toBe(7);
    expect(out.rules[0].maxScore).toBe(5);
    expect(out.rules[0].score).toBe(9);
    expect(out.passedRules).toBe(1);
  });

  it('exports full JSON shape matching the spec example', () => {
    const out = buildRuleMatrixExport(
      evaluation([
        rule({ mandatory: true }),
        rule({
          id: 'VOLUME_CONFIRMATION',
          title: 'Volume Confirmation',
          layer: 'Volume',
          category: 'Volume',
          mandatory: true,
          weight: 10,
          maxScore: 10,
          score: 0,
          status: 'FAIL',
          reason: 'Volume = 0.82 x MA20',
          recommendation: 'Wait for stronger participation',
        }),
      ]),
    );

    expect(out).toMatchObject({
      version: 1,
      totalRules: 2,
      passedRules: 1,
      failedRules: 1,
      mandatoryPassed: 1,
      mandatoryFailed: 1,
    });
    expect(typeof out.generatedAt).toBe('string');
    expect(typeof out.fingerprint).toBe('string');
  });
});

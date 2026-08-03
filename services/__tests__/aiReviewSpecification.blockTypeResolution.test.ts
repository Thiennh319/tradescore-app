/**
 * AI REVIEW SPEC — BLOCK TYPE RESOLUTION section + Rule 7 must appear in every Trace export.
 */
import { describe, expect, it } from 'vitest';
import { aiReviewSpecificationSection } from '../aiReviewSpecification';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';
import type { SignalRow } from '../signalBoardScan';

function minimalRow(): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 0,
    trend: 'BEARISH',
    regimeConfidence: 0.5,
    score: 8,
    longScore: 8,
    shortScore: 8,
    direction: 'SHORT',
    decisionLabel: 'CHO_THEM',
    decisionDisplay: 'Chờ thêm',
    winrate: '50%',
    canEnter: false,
    tradePlan: null,
    layers: [
      {
        layer: 5,
        name: 'L5a — CVD Strength',
        score: 0,
        maxScore: 1.5,
        passed: false,
        isMandatory: true,
        isMandatoryViolation: true,
        reason: 'test',
      },
    ],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
  };
}

describe('AI REVIEW SPEC — BLOCK TYPE RESOLUTION', () => {
  it('static section includes Rule 7 and deterministic table after BLOCK INTERPRETATION', () => {
    const text = aiReviewSpecificationSection().join('\n');
    const blockInterp = text.indexOf('## BLOCK INTERPRETATION');
    const blockTypeRes = text.indexOf('## BLOCK TYPE RESOLUTION (DETERMINISTIC — DO NOT INFER)');
    const snapshot = text.indexOf('## SNAPSHOT CAPABILITY');
    expect(blockInterp).toBeGreaterThan(0);
    expect(blockTypeRes).toBeGreaterThan(blockInterp);
    expect(snapshot).toBeGreaterThan(blockTypeRes);

    expect(text).toContain('Rule 7: Block Type MUST be derived only via BLOCK TYPE RESOLUTION');
    expect(text).toContain('FORBIDDEN INFERENCE');
    expect(text).toContain('Mandatory = YES does NOT imply Block Type = HARD');
    expect(text).toContain('| BTCUSDT-SHORT | L5a | FAIL | YES | 0 < 1.5 | NO | YES | SOFT |');
    expect(text).toContain('| (hypothetical) any-SHORT | L5a | FAIL | YES | CVD extreme | YES | — | HARD |');
    expect(text).toContain('NEARUSDT-SHORT | L3 | PASS | NO | L3 raw 1.0');
    expect(text).toContain('NEAR-only S1 note:');
  });

  it('RuleBook Trace export embeds BLOCK TYPE RESOLUTION once', () => {
    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [minimalRow()],
      scorerVersion: 'v4',
      coin: 'BTCUSDT',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toContain(
      '## BLOCK TYPE RESOLUTION (DETERMINISTIC — DO NOT INFER)',
    );
    expect(
      result.markdown.match(/## BLOCK TYPE RESOLUTION \(DETERMINISTIC — DO NOT INFER\)/g),
    ).toHaveLength(1);
    expect(result.markdown).toContain('Rule 7: Block Type MUST be derived only via BLOCK TYPE RESOLUTION');
  });
});

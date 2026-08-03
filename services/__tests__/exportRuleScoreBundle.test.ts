import { describe, expect, it } from 'vitest';
import type { SignalRow } from '../signalBoardScan';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';
import {
  exportRuleScoreBundle,
  RULE_SCORE_BUNDLE_FILENAME,
  RULE_SCORE_BUNDLE_SEPARATOR,
} from '../exportRuleScoreBundle';

function frozenRow(): SignalRow {
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.7,
    score: 11,
    longScore: 11,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'Có thể vào',
    winrate: '58%',
    canEnter: true,
    tradePlan: null,
    layers: [
      {
        layer: 1,
        name: 'Trend',
        score: 2,
        maxScore: 2,
        passed: true,
        isMandatory: true,
        isMandatoryViolation: false,
        reason: 'Trend aligned',
      },
    ],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
  };
}

const EXPORTED_AT = '2026-07-19T00:00:00.000Z';

describe('TASK 18.2 — canonical Rule + Score export bundle', () => {
  it('contains byte-identical Rule and Score exports in canonical order', () => {
    const context = {
      rows: [frozenRow()],
      scorerVersion: 'v4' as const,
      exportedAt: EXPORTED_AT,
    };
    const rule = exportTraceOrReviewMarkdown('trace-rulebook', context);
    const score = exportTraceOrReviewMarkdown('trace-score', context);
    const bundle = exportRuleScoreBundle(context);

    expect(rule.ok).toBe(true);
    expect(score.ok).toBe(true);
    expect(bundle.ok).toBe(true);
    if (!rule.ok || !score.ok || !bundle.ok) return;

    expect(bundle.filename).toBe(RULE_SCORE_BUNDLE_FILENAME);
    expect(bundle.markdown).toBe(
      rule.markdown +
        RULE_SCORE_BUNDLE_SEPARATOR +
        score.markdown,
    );
    expect(bundle.markdown.slice(0, rule.markdown.length)).toBe(rule.markdown);
    expect(bundle.markdown.slice(-score.markdown.length)).toBe(score.markdown);
  });

  it('is deterministic for the same frozen context', () => {
    const context = {
      rows: [frozenRow()],
      scorerVersion: 'v4' as const,
      exportedAt: EXPORTED_AT,
    };

    expect(exportRuleScoreBundle(context)).toEqual(
      exportRuleScoreBundle(context),
    );
  });

  it('soft-fails when no frozen snapshot is available', () => {
    const result = exportRuleScoreBundle({
      rows: [],
      scorerVersion: 'v4',
      exportedAt: EXPORTED_AT,
    });

    expect(result).toEqual({ ok: false, message: 'No snapshot available.' });
  });

  it('does not mutate the frozen row', () => {
    const row = frozenRow();
    const before = JSON.stringify(row);

    exportRuleScoreBundle({
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: EXPORTED_AT,
    });

    expect(JSON.stringify(row)).toBe(before);
  });
});

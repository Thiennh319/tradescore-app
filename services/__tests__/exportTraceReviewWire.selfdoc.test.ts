/**
 * TRACE SELF-DOCUMENTATION ENHANCEMENT (V1.0.7) — wire appendix tests.
 *
 * Verifies that every Trace export carries the deterministic
 * self-documentation appendix (SCORE NORMALIZATION, HARD BLOCK ORIGIN,
 * BLOCKING SUMMARY, PRE-FILTERS, TRACE INTERPRETATION) with copy-only
 * values, and that Review exports and runtime behavior are unchanged.
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import type { SignalRow } from '../signalBoardScan';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';

function baseRow(overrides: Partial<SignalRow> = {}): SignalRow {
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
        layer: 5,
        name: 'L5a — CVD Strength',
        score: 1.13,
        maxScore: 1.5,
        passed: true,
        isMandatory: true,
        isMandatoryViolation: false,
        reason: 'CVD +850K dương | VWAP gần giá — bonus L5 +0.5',
      },
    ],
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
    ...overrides,
  };
}

function markdownOf(
  kind: Parameters<typeof exportTraceOrReviewMarkdown>[0],
  row: SignalRow,
): string {
  const result = exportTraceOrReviewMarkdown(kind, {
    rows: [row],
    scorerVersion: 'v4',
    exportedAt: '2026-07-19T00:00:00.000Z',
  });
  expect(result.ok).toBe(true);
  return result.ok ? result.markdown : '';
}

const TRACE_KINDS = [
  'trace-rulebook',
  'trace-score',
  'trace-entry',
  'trace-position',
  'trace-tradeplan',
] as const;

const REVIEW_KINDS = [
  'review-rulebook',
  'review-score',
  'review-entry',
  'review-position',
  'review-tradeplan',
] as const;

describe('TRACE SELF-DOCUMENTATION appendix (V1.0.7)', () => {
  it('every trace carries TRACE INTERPRETATION, PRE-FILTERS, BLOCKING SUMMARY, HARD BLOCK ORIGIN', () => {
    for (const kind of TRACE_KINDS) {
      const md = markdownOf(kind, baseRow());
      expect(md, kind).toContain('# TRACE INTERPRETATION');
      expect(md, kind).toContain('# PRE-FILTERS');
      expect(md, kind).toContain('# BLOCKING SUMMARY');
      expect(md, kind).toContain('# HARD BLOCK ORIGIN');
      expect(md, kind).toContain('Displayed scores are normalized values.');
      expect(md, kind).toContain(
        'A Gate (see PRE-FILTERS) is NOT a Rule',
      );
    }
  });

  it('review exports are NOT touched by the trace appendix', () => {
    for (const kind of REVIEW_KINDS) {
      const md = markdownOf(kind, baseRow());
      expect(md, kind).not.toContain('# TRACE INTERPRETATION');
      expect(md, kind).not.toContain('# PRE-FILTERS');
    }
  });

  it('PART 1 — SCORE NORMALIZATION documents internal vs display scale', () => {
    const md = markdownOf('trace-score', baseRow({ vwapBonus: {
      applied: true,
      bonusRaw: 0.5,
      reason: 'VWAP gần giá — bonus L5 +0.5',
    } }));
    expect(md).toContain('# SCORE NORMALIZATION');
    expect(md).toContain('Internal Layer Max (raw scale): 2');
    expect(md).toContain('Display Layer Max (normalized scale): 1.5');
    expect(md).toContain('display = round((raw / 2) x 1.5, 2)');
    // Raw is not in the frozen snapshot → UNAVAILABLE (never derived).
    const normalization = md.slice(md.indexOf('# SCORE NORMALIZATION'));
    expect(normalization).toContain(
      '| L5a — CVD Strength | UNAVAILABLE | 1.13 | 1.5 | PASS |',
    );
    // Copied VWAP bonus fields:
    expect(md).toContain('Bonus Applied: YES');
    expect(md).toContain('Bonus Raw (internal scale): 0.5');
    expect(md).toContain('Bonus Reason: VWAP gần giá — bonus L5 +0.5');
    // Documentation notes:
    expect(md).toContain('Bonus is always applied to the RAW score BEFORE normalization.');
    expect(md).toContain('A raw bonus of +0.5 appears as +0.375');
  });

  it('PART 1 — missing vwapBonus renders UNAVAILABLE, never fabricated', () => {
    const md = markdownOf('trace-score', baseRow());
    expect(md).toContain('Bonus Applied: UNAVAILABLE');
    expect(md).toContain('Bonus Raw (internal scale): UNAVAILABLE');
    expect(md).toContain('Bonus Reason: UNAVAILABLE');
  });

  function blockedV4Snapshot(): NonNullable<SignalRow['v4']> {
    const base = baseRow();
    return {
      score: base.score,
      longScore: base.longScore,
      shortScore: base.shortScore,
      direction: 'LONG',
      decisionLabel: 'KHONG_VAO',
      decisionDisplay: 'KHÔNG VÀO',
      winrate: '~50%',
      canEnter: false,
      layers: base.layers,
      mandatoryViolations: ['L3 MACD vi phạm', 'Group B dưới chuẩn'],
      hardBlocked: true,
      groupBlocks: ['Group B dưới chuẩn'],
      longHardBlocks: ['L3 MACD vi phạm'],
      longBlockReasons: [],
    };
  }

  it('PART 2 — HARD BLOCK ORIGIN identifies the source list of each block', () => {
    const row = baseRow({
      canEnter: false,
      hardBlocked: true,
      mandatoryViolations: ['L3 MACD vi phạm', 'Group B dưới chuẩn'],
      v4: blockedV4Snapshot(),
      adxBlockReason: 'ADX_CHOPPY',
      adxGate: {
        allowed: false,
        block: true,
        regime: 'CHOPPY',
        tpMultiplier: 1,
        slMultiplier: 1,
        message: '⛔ Thị trường CHOPPY cả 1H+4H — chờ xu hướng rõ',
        severity: 'BLOCK',
      } as SignalRow['adxGate'],
    });

    const md = markdownOf('trace-score', row);
    const origin = md.slice(
      md.indexOf('# HARD BLOCK ORIGIN'),
      md.indexOf('# BLOCKING SUMMARY'),
    );
    expect(origin).toContain('| L3 MACD vi phạm | Score Engine hard block list (per-side) |');
    expect(origin).toContain('| Group B dưới chuẩn | Group Block list |');
    expect(origin).toContain('| ADX_CHOPPY | ADX Gate (independent pre-filter) |');
    expect(origin).toContain('NOT a RuleBook scoring rule');
  });

  it('PART 3 — BLOCKING SUMMARY replaces the mandatory-count wording', () => {
    const row = baseRow({
      canEnter: false,
      hardBlocked: true,
      mandatoryViolations: ['L3 MACD vi phạm', 'Group B dưới chuẩn'],
      v4: blockedV4Snapshot(),
    });

    const md = markdownOf('trace-score', row);
    expect(md).toContain('Total Blocking Events: 2');
    expect(md).toContain('Hard Blocks (Engine / All Sources): 1');
    expect(md).toContain('Group Blocks: 1');
    expect(md).toContain('It is NOT the number of failed mandatory rules.');
    expect(md).not.toContain('Mandatory Violation Count');
  });

  it('PART 4 — PRE-FILTERS renders ADX Gate as a Gate, not a Rule', () => {
    const md = markdownOf('trace-score', baseRow({
      adxData: {
        adx1H: 12,
        adx4H: 13,
        adxAvg: 12.5,
        regime: 'CHOPPY',
        regimeStrength: 'WEAK',
        isChoppy1H: true,
        isChoppy4H: true,
        bothChoppy: true,
      } as SignalRow['adxData'],
      adxGate: {
        allowed: false,
        block: true,
        regime: 'CHOPPY',
        tpMultiplier: 1,
        slMultiplier: 1,
        message: '⛔ Thị trường CHOPPY cả 1H+4H — chờ xu hướng rõ',
        severity: 'BLOCK',
      } as SignalRow['adxGate'],
    }));
    const section = md.slice(
      md.indexOf('# PRE-FILTERS'),
      md.indexOf('# TRACE INTERPRETATION'),
    );
    expect(section).toContain('Type: Independent Market Filter');
    expect(section).toContain('Block Condition (documentation): ADX1H < 15 AND ADX4H < 15');
    expect(section).toContain('Current ADX 1H: 12');
    expect(section).toContain('Current ADX 4H: 13');
    expect(section).toContain('Market Regime: CHOPPY');
    expect(section).toContain('Gate Result: BLOCKED');
    expect(section).toContain('Gate Fired: YES');
    expect(section).toContain('Scope: Pre-RuleBook — not part of Rule scoring');
  });

  it('PART 4 — missing ADX gate renders UNAVAILABLE', () => {
    const md = markdownOf('trace-tradeplan', baseRow());
    const section = md.slice(
      md.indexOf('# PRE-FILTERS'),
      md.indexOf('# TRACE INTERPRETATION'),
    );
    expect(section).toContain('Gate Result: UNAVAILABLE');
    expect(section).toContain('Gate Fired: UNAVAILABLE');
    expect(section).toContain('Current ADX 1H: UNAVAILABLE');
  });

  it('appendix output is deterministic and never leaks undefined/null/JSON', () => {
    const row = baseRow();
    for (const kind of TRACE_KINDS) {
      const first = markdownOf(kind, row);
      const second = markdownOf(kind, row);
      expect(first, kind).toBe(second);
      expect(first, kind).not.toContain('undefined');
      expect(first, kind).not.toMatch(/\bnull\b/);
      expect(first, kind).not.toContain('[object Object]');
      expect(first, kind).not.toContain('{"');
    }
  });

  it('does not mutate the frozen row', () => {
    const row = baseRow({ adxBlockReason: 'ADX_CHOPPY' });
    const before = JSON.stringify(row);
    for (const kind of [...TRACE_KINDS, ...REVIEW_KINDS]) {
      exportTraceOrReviewMarkdown(kind, { rows: [row], scorerVersion: 'v4' });
    }
    expect(JSON.stringify(row)).toBe(before);
  });
});

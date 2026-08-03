/**
 * TASK 17.6.1 — Review Wire Enhancement semantics tests (NEW file; the
 * original TASK 17.6 smoke tests are untouched).
 *
 * Verifies that the wire forwards engine fields verbatim under
 * one-label-one-concept names and never mutates the frozen row.
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
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
    ...overrides,
  };
}

function markdownOf(kind: Parameters<typeof exportTraceOrReviewMarkdown>[0], row: SignalRow): string {
  const result = exportTraceOrReviewMarkdown(kind, {
    rows: [row],
    scorerVersion: 'v4',
    exportedAt: '2026-07-19T00:00:00.000Z',
  });
  expect(result.ok).toBe(true);
  return result.ok ? result.markdown : '';
}

describe('TASK 17.6.1 wire semantics', () => {
  it('renames ambiguous snapshot labels — one label, one concept', () => {
    const md = markdownOf('review-score', baseRow());
    expect(md).toContain('Hard/Group Blocked State: NO');
    expect(md).toContain('Entry Permission: YES');
    expect(md).toContain('Entry State: ENTRY_VALID');
    // TRACE SELF-DOC (V1.0.7): "Mandatory Violation Count" is replaced by
    // the structural "Total Blocking Events" label.
    expect(md).toContain('Total Blocking Events: 0');
    expect(md).not.toContain('Mandatory Violation Count');
    expect(md).toContain('Group Block Count: 0');
    expect(md).toContain('Warning Count: 0');
    // Old ambiguous snapshot keys are gone.
    expect(md).not.toContain('CanEnter:');
    expect(md).not.toContain('\nHardBlocked:');
  });

  it('forwards ADX gate fields when the snapshot carries them', () => {
    const md = markdownOf(
      'review-rulebook',
      baseRow({
        adxGate: {
          allowed: false,
          block: true,
          regime: 'CHOPPY',
          tpMultiplier: 1,
          slMultiplier: 1,
          message: 'ADX too low',
          severity: 'BLOCK',
        } as SignalRow['adxGate'],
        adxBlockReason: 'ADX_CHOPPY',
      }),
    );
    expect(md).toContain('ADX Gate Allowed: NO');
    expect(md).toContain('ADX Gate Regime: CHOPPY');
    expect(md).toContain('ADX Gate Block Reason: ADX_CHOPPY');
  });

  it('missing ADX gate renders UNAVAILABLE — nothing fabricated', () => {
    const md = markdownOf('review-rulebook', baseRow());
    expect(md).toContain('ADX Gate Allowed: UNAVAILABLE');
    expect(md).toContain('ADX Gate Regime: UNAVAILABLE');
    expect(md).toContain('ADX Gate Block Reason: UNAVAILABLE');
  });

  it('score exports: Hard/Group Blocked flag and Hard/Group entries agree by construction', () => {
    // rowSnapshot(v4) only surfaces groupBlocks / longHardBlocks when present
    // on the v4 snapshot (or via mandatoryViolations fallback for hard).
    const withSide = baseRow({
      canEnter: false,
      hardBlocked: true,
      score: 2,
      longScore: 2,
      v4: {
        score: 2,
        longScore: 2,
        shortScore: 0,
        direction: 'LONG',
        decisionLabel: 'KHONG_VAO',
        decisionDisplay: 'Không vào',
        winrate: '58%',
        canEnter: false,
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
        mandatoryViolations: [
          'L3 MACD vi phạm',
          'Nhóm A (Xu hướng) 2.1/5đ < 2.5đ',
        ],
        hardBlocked: true,
        longHardBlocks: ['L3 MACD vi phạm'],
        groupBlocks: ['Nhóm A (Xu hướng) 2.1/5đ < 2.5đ'],
      },
    });

    const trace = markdownOf('trace-score', withSide);
    expect(trace).toContain('Hard/Group Blocked: YES');
    expect(trace).toContain('# HARD / GROUP BLOCK');
    expect(trace).toContain('Block ID: HB-1');
    expect(trace).toContain('Block ID: GB-1');
    expect(trace).toContain('Rule: L3 MACD vi phạm');
    expect(trace).toContain('Rule: Nhóm A (Xu hướng) 2.1/5đ < 2.5đ');
    expect(trace).toContain('Hard Block=L3 MACD vi phạm');
    expect(trace).toContain('Group Block=Nhóm A (Xu hướng) 2.1/5đ < 2.5đ');
    expect(trace).toContain('Conflict: NO');

    const review = markdownOf('review-score', withSide);
    expect(review).toContain('Hard/Group Blocked: YES');
    expect(review).toContain('# HARD / GROUP BLOCKS');
    expect(review).toContain('| L3 MACD vi phạm |');
    expect(review).toContain('Hard Block=L3 MACD vi phạm');
    expect(review).toContain('Group Block=Nhóm A (Xu hướng) 2.1/5đ < 2.5đ');
    expect(review).toContain('Conflict: NO');
  });

  it('no hard/group blocks → empty Hard/Group section and flag NO, no conflict', () => {
    const md = markdownOf('trace-score', baseRow());
    expect(md).toContain('Hard/Group Blocked: NO');
    expect(md).toContain('Conflict: NO');
  });

  it('entry review decision tree exposes Entry State / Hard/Group Blocked State / Entry Permission', () => {
    const md = markdownOf('review-entry', baseRow());
    expect(md).toContain('Entry State');
    expect(md).toContain('ENTRY_VALID');
    expect(md).toContain('Hard/Group Blocked State');
    expect(md).not.toContain('HardBlocked State:');
    expect(md).toContain('Entry Permission');
  });

  it('score decision copied into DECISION POLICY, policy fields stay UNAVAILABLE', () => {
    const md = markdownOf('review-score', baseRow());
    const policy = md.slice(
      md.indexOf('# DECISION POLICY'),
      md.indexOf('# REVIEW FOCUS'),
    );
    expect(policy).toContain('Decision: CO_THE_VAO');
    expect(policy).toContain('Decision Threshold: UNAVAILABLE');
    expect(policy).toContain('Decision Policy: UNAVAILABLE');
    expect(policy).toContain('Override Rule: UNAVAILABLE');
  });

  it('Warning Count reflects layer WARNING status (e.g. L4 Bollinger score=0)', () => {
    const row = baseRow({
      layers: [
        {
          layer: 1,
          name: 'Trend',
          score: 1.5,
          maxScore: 1.5,
          passed: true,
          isMandatory: false,
          isMandatoryViolation: false,
          reason: 'Trend aligned',
        },
        {
          layer: 4,
          name: 'Bollinger %B + Bandwidth',
          score: 0,
          maxScore: 1.5,
          passed: false,
          isMandatory: false,
          isMandatoryViolation: false,
          reason: '%B=81 Không thuận Long Ranging',
        },
      ],
      v4: {
        score: 11,
        longScore: 11,
        shortScore: 4,
        direction: 'LONG',
        decisionLabel: 'CO_THE_VAO',
        decisionDisplay: 'Có thể vào',
        winrate: '58%',
        canEnter: true,
        layers: [
          {
            layer: 1,
            name: 'Trend',
            score: 1.5,
            maxScore: 1.5,
            passed: true,
            isMandatory: false,
            isMandatoryViolation: false,
            reason: 'Trend aligned',
          },
          {
            layer: 4,
            name: 'Bollinger %B + Bandwidth',
            score: 0,
            maxScore: 1.5,
            passed: false,
            isMandatory: false,
            isMandatoryViolation: false,
            reason: '%B=81 Không thuận Long Ranging',
          },
        ],
        mandatoryViolations: [],
        hardBlocked: false,
        groupScores: { A: 3, B: 3, C: 3 },
      },
    } as Partial<SignalRow>);
    const md = markdownOf('review-score', row);
    expect(md).toContain('Warning Count: 1');
  });

  it('Warning Count stays 0 when no layer WARNING status', () => {
    const md = markdownOf('review-score', baseRow());
    expect(md).toContain('Warning Count: 0');
  });

  it('trace-entry: INPUT SNAPSHOT Warning Count matches ENTRY SUMMARY Warnings', () => {
    const row = baseRow({
      layers: [
        {
          layer: 1,
          name: 'Trend',
          score: 1.5,
          maxScore: 1.5,
          passed: true,
          isMandatory: false,
          isMandatoryViolation: false,
          reason: 'Trend aligned',
        },
        {
          layer: 4,
          name: 'Bollinger %B + Bandwidth',
          score: 0,
          maxScore: 1.5,
          passed: false,
          isMandatory: false,
          isMandatoryViolation: false,
          reason: '%B=81 Không thuận Long Ranging',
        },
      ],
      v4: {
        score: 11,
        longScore: 11,
        shortScore: 4,
        direction: 'LONG',
        decisionLabel: 'CO_THE_VAO',
        decisionDisplay: 'Có thể vào',
        winrate: '58%',
        canEnter: true,
        layers: [
          {
            layer: 1,
            name: 'Trend',
            score: 1.5,
            maxScore: 1.5,
            passed: true,
            isMandatory: false,
            isMandatoryViolation: false,
            reason: 'Trend aligned',
          },
          {
            layer: 4,
            name: 'Bollinger %B + Bandwidth',
            score: 0,
            maxScore: 1.5,
            passed: false,
            isMandatory: false,
            isMandatoryViolation: false,
            reason: '%B=81 Không thuận Long Ranging',
          },
        ],
        mandatoryViolations: [],
        hardBlocked: false,
        groupScores: { A: 3, B: 3, C: 3 },
      },
    } as Partial<SignalRow>);
    const md = markdownOf('trace-entry', row);
    const inputSnapshot = md.slice(
      md.indexOf('# INPUT SNAPSHOT'),
      md.indexOf('# ENTRY DECISION'),
    );
    const entrySummary = md.slice(md.indexOf('# ENTRY SUMMARY'));
    const warningCount = inputSnapshot.match(/^Warning Count: (\d+)$/m)?.[1];
    const summaryWarnings = entrySummary.match(/^Warnings: (\d+)$/m)?.[1];
    expect(warningCount).toBe('1');
    expect(summaryWarnings).toBe('1');
    expect(warningCount).toBe(summaryWarnings);
  });

  it('does not mutate the frozen row', () => {
    const row = baseRow({ adxBlockReason: 'ADX_CHOPPY' });
    const before = JSON.stringify(row);
    for (const kind of ['trace-score', 'review-score', 'review-entry'] as const) {
      exportTraceOrReviewMarkdown(kind, { rows: [row], scorerVersion: 'v4' });
    }
    expect(JSON.stringify(row)).toBe(before);
  });
});

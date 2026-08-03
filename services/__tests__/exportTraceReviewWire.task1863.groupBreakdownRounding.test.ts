/**
 * TASK 18.6.3 — GROUP BREAKDOWN Markdown rounding (display-only).
 *
 * Production gap: Option B fixture used already-pretty floats (2.82 / 2.38 / 2.07),
 * so String(groupScore) never leaked long JS division remnants. Real engine
 * groupScores (e.g. 2.0833333333333335) must still render with ≤2 decimals.
 * Does not touch Decision / convertToGroupScoreV4 math.
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import { LAYER_L5B_ID } from '../../constants/scoring';
import type { SignalRow } from '../signalBoardScan';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';

function layer(
  id: number,
  name: string,
  score: number,
  overrides: Partial<SignalRow['layers'][number]> = {},
): SignalRow['layers'][number] {
  return {
    layer: id as SignalRow['layers'][number]['layer'],
    name,
    score,
    maxScore: 1.5,
    passed: score > 0,
    isMandatory: id === 5,
    isMandatoryViolation: id === 5 && score < 0.75,
    reason: `${name} ok`,
    ...overrides,
  };
}

/**
 * Production evidence BTCUSDT-LONG-v4 @ 2026-07-20T05:05:51.605Z.
 * Decision Total 8.65; engine groupScores include long floats from / conversion.
 * Verified by hand: 7/8×5=4.375, A+B+C≈8.6458… → round 8.65.
 */
function btcLongV4Production865Row(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 1.5),
    layer(2, 'RSI 14 + Divergence', 1.5),
    layer(3, 'MACD + Histogram Momentum', 1.5),
    layer(4, 'Bollinger %B + Bandwidth', 0.75),
    layer(5, 'L5a — CVD Strength', 0.75),
    layer(LAYER_L5B_ID as SignalRow['layers'][number]['layer'], 'L5b — Volume / OI', 0.75),
    layer(6, 'Funding Rate + Trend', 0.75),
    layer(7, 'L/S Ratio + Whale Wall', 0.375),
    layer(8, 'BTC 24h + 1H Momentum', 0.75),
    layer(9, 'Phiên giao dịch', 0.75),
    layer(10, 'Tâm lý & Kỷ luật', 0.375),
  ];
  // Exact long floats as seen on production export (pre-fix render).
  const groupScores = {
    A: 4.375,
    B: 2.1875,
    C: 2.0833333333333335,
  };
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.7,
    score: 8.65,
    longScore: 8.65,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: ['L3 MACD vi phạm'],
    hardBlocked: true,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.HARD_BLOCKED,
    groupScores,
    longGroupScores: groupScores,
    longHardBlocks: ['L3 MACD vi phạm'],
    shortHardBlocks: [],
    groupBlocks: [],
    v4: {
      score: 8.65,
      longScore: 8.65,
      shortScore: 4,
      direction: 'LONG',
      decisionLabel: 'KHONG_VAO',
      decisionDisplay: 'KHÔNG VÀO',
      winrate: '~50%',
      canEnter: false,
      layers,
      mandatoryViolations: ['L3 MACD vi phạm'],
      hardBlocked: true,
      groupScores,
      longGroupScores: groupScores,
      longHardBlocks: ['L3 MACD vi phạm'],
      shortHardBlocks: [],
      groupBlocks: [],
    },
  };
}

/** Extract the GROUP BREAKDOWN markdown table body lines (data rows only). */
function groupBreakdownDataRows(md: string): string[] {
  const start = md.indexOf('# GROUP BREAKDOWN');
  expect(start).toBeGreaterThanOrEqual(0);
  const chunk = md.slice(start, md.indexOf('# RULE DEPENDENCY', start));
  return chunk
    .split('\n')
    .filter((line) => /^\| [ABC] \|/.test(line));
}

describe('TASK 18.6.3 — GROUP BREAKDOWN score-column rounding', () => {
  it('rounds long float groupScores to ≤2 decimals; Decision Total stays 8.65', () => {
    const row = btcLongV4Production865Row();
    // Prove engine-side values are still the long floats on the frozen row.
    expect(row.groupScores?.C).toBe(2.0833333333333335);
    expect(row.score).toBe(8.65);

    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: '2026-07-20T05:05:51.605Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;

    expect(md).toContain('Generated Time: 2026-07-20T05:05:51.605Z');
    expect(md).toContain('Score: 8.65');
    expect(md).toContain('Decision Total (snap.score): 8.65');

    // Must NOT leak classic JS division remnants.
    expect(md).not.toContain('2.0833333333333335');
    expect(md).not.toContain('4.375');
    expect(md).not.toContain('2.1875');

    expect(md).toMatch(/\| A \| L1–L4 \| .+ \| 8 \| 5 \| 4\.38 \|/);
    expect(md).toMatch(/\| B \| L5a, L5b, L6, L7 \| .+ \| 8 \| 5 \| 2\.19 \|/);
    expect(md).toMatch(/\| C \| L8–L10 \| .+ \| 6 \| 5 \| 2\.08 \|/);

    const dataRows = groupBreakdownDataRows(md);
    expect(dataRows).toHaveLength(3);
    for (const line of dataRows) {
      // Columns: Group | Layers | Raw Sum* | Raw Max | Group Max | Group Score | Notes
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      const rawSum = cells[2];
      const groupScore = cells[5];
      expect(rawSum).toMatch(/^-?\d+(\.\d{1,2})?$/);
      expect(groupScore).toMatch(/^-?\d+(\.\d{1,2})?$/);
      expect(rawSum).not.toMatch(/\.\d{3,}/);
      expect(groupScore).not.toMatch(/\.\d{3,}/);
    }

    // Hand-check: rounded A+B+C equals Decision Total display.
    expect(+(4.38 + 2.19 + 2.08).toFixed(2)).toBe(8.65);

    const fs = require('node:fs');
    const path = require('node:path');
    const out = path.join(
      process.cwd(),
      'docs',
      'RULE_TRACE_TASK18_6_3_BTCUSDT_LONG_v4_SAMPLE.md',
    );
    fs.writeFileSync(out, md, 'utf8');
  });
});

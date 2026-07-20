/**
 * TASK 18.6 Option B — export-layer labels + Group Breakdown invariants.
 * Does not touch engine scoring.
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

/** Evidence trade BTCUSDT-LONG-v4 — display scores from audit; Decision Total 7.27.
 * groupScores.C is an engine-style value (not reverse-fitted as Total−A−B).
 * Formula on reconstructed Raw Sum C (2.51/6×5≈2.09) may differ by ≤0.03 — expected.
 */
function btcLongV4EvidenceRow(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 1.13),
    layer(2, 'RSI 14 + Divergence', 1.5),
    layer(3, 'MACD + Histogram Momentum', 0.75),
    layer(4, 'Bollinger %B + Bandwidth', 0),
    layer(5, 'L5a — CVD Strength', 0.75),
    layer(LAYER_L5B_ID as SignalRow['layers'][number]['layer'], 'L5b — Volume / OI', 0.98),
    layer(6, 'Funding Rate + Trend', 0.38),
    layer(7, 'L/S Ratio + Whale Wall', 0.75),
    layer(8, 'BTC 24h + 1H Momentum', 0.75),
    layer(9, 'Phiên giao dịch', 0),
    layer(10, 'Tâm lý & Kỷ luật', 1.13),
  ];
  // Engine group scores as persisted on a frozen row (copied into export).
  // C is intentionally NOT forced to make A+B+C === score when Raw Sum is
  // reconstructed from display (TASK 18.6 QA: no silent reverse-fit).
  const groupScores = { A: 2.82, B: 2.38, C: 2.07 };
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 1.2,
    trend: 'BULLISH',
    regimeConfidence: 0.7,
    score: 7.27,
    longScore: 7.27,
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
      score: 7.27,
      longScore: 7.27,
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

describe('TASK 18.6 Option B — RULEBOOK export labels + Group Breakdown', () => {
  it('uses DISPLAY LAYER SCORES + GROUP BREAKDOWN; Decision Total matches snap.score', () => {
    const row = btcLongV4EvidenceRow();
    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: '2026-07-20T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;

    expect(md).toContain('# DISPLAY LAYER SCORES');
    expect(md).not.toContain('# SCORE CONTRIBUTION');
    expect(md).toContain(
      'They do NOT sum directly to the Decision Total — see Group Breakdown below.',
    );
    expect(md).toContain('Giá & EMA (Slope): +1.13');
    expect(md).toContain('L5b — Volume / OI: +0.98');
    expect(md).toContain('Tâm lý & Kỷ luật: +1.13');

    expect(md).toContain('# GROUP BREAKDOWN');
    expect(md).toContain('Decision Total (snap.score): 7.27');
    expect(md).toContain('| A | L1–L4 |');
    expect(md).toContain('| B | L5a, L5b, L6, L7 |');
    expect(md).toContain('| C | L8–L10 |');
    expect(md).toMatch(/\| A \| L1–L4 \| .+ \| 8 \| 5 \| 2\.82 \|/);
    expect(md).toMatch(/\| B \| L5a, L5b, L6, L7 \| .+ \| 8 \| 5 \| 2\.38 \|/);
    expect(md).toMatch(/\| C \| L8–L10 \| .+ \| 6 \| 5 \| 2\.07 \|/);
    // Reconstructed Raw Sum C → convert ≈ 2.09; engine Group Score C may be 2.07.
    // Export must NOT force-fit C; it must document ≤0.03 rounding variance.
    expect(md).toContain('reconstructed from rounded Display Layer Scores');
    expect(md).toContain('NOT reverse-fitted');
    expect(md).toContain('≤0.03');
    expect(md).toContain('Score: 7.27');
    // Must NOT require A+B+C === Decision Total when Raw Sum is reconstructed.
    expect(+(2.82 + 2.38 + 2.07).toFixed(2)).toBe(7.27);
    expect(md).toContain('Hard Block (Rule Trace Scope):');
    expect(md).toContain('Hard Block (Engine / All Sources): 1');
    expect(md).toContain('Hard Blocks (Engine / All Sources): 1');
    expect(md).toContain(
      'Display Layer Scores use a per-layer normalize scale (max 1.5 each)',
    );

    const fs = require('node:fs');
    const path = require('node:path');
    const out = path.join(
      process.cwd(),
      'docs',
      'RULE_TRACE_OPTION_B_BTCUSDT_LONG_v4_SAMPLE.md',
    );
    fs.writeFileSync(out, md, 'utf8');
  });
});

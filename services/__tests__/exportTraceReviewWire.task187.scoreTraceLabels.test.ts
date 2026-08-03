/**
 * TASK 18.7 — Score Trace export label clarity (Option B parity).
 *
 * Two artifacts:
 * 1) FIXTURE — structure/label demo (Trade ID / time clearly marked -FIXTURE).
 * 2) PRODUCTION — regenerate from real BTCUSDT-LONG-v4 @ 2026-07-20T05:05:54.363Z
 *    (layer scores + reason texts copied from user's production 02_SCORE_ENGINE.md).
 *
 * Does not touch Score Engine math.
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
  reason: string,
): SignalRow['layers'][number] {
  return {
    layer: id as SignalRow['layers'][number]['layer'],
    name,
    score,
    maxScore: 1.5,
    passed: score > 0,
    isMandatory: id === 5,
    isMandatoryViolation: id === 5 && score < 0.75,
    reason,
  };
}

/** Label-only fixture — NOT the production trade. Marked -FIXTURE to avoid QA mix-up. */
function scoreTraceLabelFixtureRow(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 1.5, 'FIXTURE L1'),
    layer(2, 'RSI 14 + Divergence', 1.5, 'FIXTURE L2'),
    layer(3, 'MACD + Histogram Momentum', 1.5, 'FIXTURE L3'),
    layer(4, 'Bollinger %B + Bandwidth', 0.75, 'FIXTURE L4'),
    layer(5, 'L5a — CVD Strength', 0.75, 'FIXTURE L5a'),
    layer(LAYER_L5B_ID as SignalRow['layers'][number]['layer'], 'L5b — Volume / OI', 0.75, 'FIXTURE L5b'),
    layer(6, 'Funding Rate + Trend', 0.75, 'FIXTURE L6'),
    layer(7, 'L/S Ratio + Whale Wall', 0.375, 'FIXTURE L7'),
    layer(8, 'BTC 24h + 1H Momentum', 0.75, 'FIXTURE L8'),
    layer(9, 'Phiên giao dịch', 0.75, 'FIXTURE L9'),
    layer(10, 'Tâm lý & Kỷ luật', 0.375, 'FIXTURE L10'),
  ];
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
    decisionLabel: 'CHO_THEM',
    decisionDisplay: 'CHỜ THÊM',
    winrate: '~55%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.SCORE_BLOCKED,
    groupScores,
    longGroupScores: groupScores,
    longHardBlocks: [],
    shortHardBlocks: [],
    longBlockReasons: [],
    shortBlockReasons: [],
    groupBlocks: [],
    v4: {
      score: 8.65,
      longScore: 8.65,
      shortScore: 4,
      direction: 'LONG',
      decisionLabel: 'CHO_THEM',
      decisionDisplay: 'CHỜ THÊM',
      winrate: '~55%',
      canEnter: false,
      layers,
      mandatoryViolations: [],
      hardBlocked: false,
      groupScores,
      longGroupScores: groupScores,
      longHardBlocks: [],
      shortHardBlocks: [],
      longBlockReasons: [],
      shortBlockReasons: [],
      groupBlocks: [],
    },
  };
}

/**
 * Production evidence — values copied from Downloads/02_SCORE_ENGINE.md
 * (Generated Time 2026-07-20T05:05:54.363Z). Group scores from companion
 * RULEBOOK GROUP BREAKDOWN (pre-display-round floats).
 */
function btcLongV4ProductionScore865Row(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 0.75, 'Đang pullback về EMA — vùng entry hợp lý'),
    layer(2, 'RSI 14 + Divergence', 1.5, 'RSI 1H 48.6 & 4H 59.3 — vùng tối ưu 45-65'),
    layer(3, 'MACD + Histogram Momentum', 1.5, 'Histogram dương cả 1H & 4H'),
    layer(4, 'Bollinger %B + Bandwidth', 1.5, '%B=43 Ranging vùng giữa — tốt nhất để buy'),
    layer(5, 'L5a — CVD Strength', 0.75, 'CVD âm nhẹ (-3K) nhưng đang cải thiện'),
    layer(
      LAYER_L5B_ID as SignalRow['layers'][number]['layer'],
      'L5b — Volume / OI',
      0,
      'Không có tín hiệu Volume/OI rõ',
    ),
    layer(6, 'Funding Rate + Trend', 0.75, 'Funding 0.0049% · ➡️ Thị trường cân bằng'),
    layer(7, 'L/S Ratio + Whale Wall', 1.13, 'Đám đông giảm Long — contrarian thuận Long'),
    layer(8, 'BTC 24h + 1H Momentum', 0, 'BTC 24h -0.53%, 1h -0.51% — đỏ cả 2 khung'),
    layer(
      9,
      'Phiên giao dịch',
      0.75,
      'London Lunch: 12-15h VN: London nghỉ trưa, thanh khoản giảm',
    ),
    layer(10, 'Tâm lý & Kỷ luật', 1.13, '4/5 mục — đạt'),
  ];
  const groupScores = {
    A: 4.375,
    B: 2.1875,
    C: 2.0833333333333335,
  };
  return {
    symbol: 'BTCUSDT',
    price: 64398.9,
    change24h: -0.527,
    trend: 'BULLISH',
    regimeConfidence: 0.65,
    score: 8.65,
    longScore: 8.65,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'CHO_THEM',
    decisionDisplay: 'CHỜ THÊM',
    winrate: '~55%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.SCORE_BLOCKED,
    fundingRate: 0.00489,
    cvdValue: -3261.076904296875,
    cvdTrend: 'UP',
    topLSRatio: 1.5253,
    atr1h: 283.1142883300781,
    adxData: {
      adx1H: 24.135910034179688,
      adx4H: 23.565845489501953,
    },
    adxGate: {
      allowed: true,
      regime: 'RANGING',
    },
    groupScores,
    longGroupScores: groupScores,
    longHardBlocks: [],
    shortHardBlocks: [],
    longBlockReasons: [],
    shortBlockReasons: [],
    groupBlocks: [],
    v4: {
      score: 8.65,
      longScore: 8.65,
      shortScore: 4,
      direction: 'LONG',
      decisionLabel: 'CHO_THEM',
      decisionDisplay: 'CHỜ THÊM',
      winrate: '~55%',
      canEnter: false,
      layers,
      mandatoryViolations: [],
      hardBlocked: false,
      groupScores,
      longGroupScores: groupScores,
      longHardBlocks: [],
      shortHardBlocks: [],
      longBlockReasons: [],
      shortBlockReasons: [],
      groupBlocks: [],
    },
  };
}

describe('TASK 18.7 — Score Trace Display Layer Score + GROUP BREAKDOWN', () => {
  it('FIXTURE — labels/structure only (Trade ID marked -FIXTURE)', () => {
    const row = scoreTraceLabelFixtureRow();
    const result = exportTraceOrReviewMarkdown('trace-score', {
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: '2026-07-20T00:00:00.000Z-FIXTURE',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown.replace(
      'Trade ID: BTCUSDT-LONG-v4',
      'Trade ID: BTCUSDT-LONG-v4-FIXTURE',
    );

    expect(md).toContain('Trade ID: BTCUSDT-LONG-v4-FIXTURE');
    expect(md).toContain('Generated Time: 2026-07-20T00:00:00.000Z-FIXTURE');
    expect(md).toContain('| Component | Max | Actual | Display Layer Score | Status |');
    expect(md).not.toContain('| Component | Max | Actual | Contribution | Status |');
    expect(md).toContain(
      'They do NOT sum to Decision Total / Final Score — see GROUP BREAKDOWN.',
    );
    expect(md).toContain('Decision Total (snap.score): 8.65');
    expect(md).toContain('Final Score: 8.65');
    expect(md).not.toContain('Raw Score: 8.65');
    expect(md).toContain('Wrong Display Layer Score?');
    expect(md).toContain('Entry State SCORE_BLOCKED reflects the decision band');
    expect(md).toContain('# SCORE TRACE INTERPRETATION');

    const fs = require('node:fs');
    const path = require('node:path');
    fs.writeFileSync(
      path.join(
        process.cwd(),
        'docs',
        'SCORE_TRACE_TASK18_7_BTCUSDT_LONG_v4_FIXTURE_SAMPLE.md',
      ),
      md,
      'utf8',
    );
  });

  it('PRODUCTION — regenerates real BTCUSDT-LONG-v4 @ 2026-07-20T05:05:54.363Z', () => {
    const row = btcLongV4ProductionScore865Row();
    const result = exportTraceOrReviewMarkdown('trace-score', {
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: '2026-07-20T05:05:54.363Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;

    expect(md).toContain('Trade ID: BTCUSDT-LONG-v4');
    expect(md).not.toContain('-FIXTURE');
    expect(md).toContain('Generated Time: 2026-07-20T05:05:54.363Z');
    expect(md).toContain('Score: 8.65');
    expect(md).toContain('Entry State: SCORE_BLOCKED');

    // Production layer scores (bug-discovery snapshot).
    expect(md).toContain('Actual Score: 0.75');
    expect(md).toContain('Đang pullback về EMA — vùng entry hợp lý');
    expect(md).toContain('BTC 24h -0.53%, 1h -0.51% — đỏ cả 2 khung');
    expect(md).toContain('Không có tín hiệu Volume/OI rõ');
    expect(md).toContain('4/5 mục — đạt');
    expect(md).toContain('Đám đông giảm Long — contrarian thuận Long');

    // New labels applied on production values.
    expect(md).toContain('| Component | Max | Actual | Display Layer Score | Status |');
    expect(md).toContain('| Giá & EMA (Slope) | 1.5 | 0.75 | 0.75 | PASS |');
    expect(md).toContain('| L5b — Volume / OI | 1.5 | 0 | 0 | WARNING |');
    expect(md).toContain('| L/S Ratio + Whale Wall | 1.5 | 1.13 | 1.13 | PASS |');
    expect(md).toContain('| BTC 24h + 1H Momentum | 1.5 | 0 | 0 | WARNING |');
    expect(md).toContain('| Tâm lý & Kỷ luật | 1.5 | 1.13 | 1.13 | PASS |');
    expect(md).not.toContain('| Component | Max | Actual | Contribution | Status |');

    expect(md).toContain('# GROUP BREAKDOWN');
    expect(md).toMatch(/\| A \| L1–L4 \| .+ \| 8 \| 5 \| 4\.38 \|/);
    expect(md).toMatch(/\| B \| L5a, L5b, L6, L7 \| .+ \| 8 \| 5 \| 2\.19 \|/);
    expect(md).toMatch(/\| C \| L8–L10 \| .+ \| 6 \| 5 \| 2\.08 \|/);
    expect(md).not.toContain('2.0833333333333335');

    expect(md).toContain('Decision Total (snap.score): 8.65');
    expect(md).toContain('Final Score: 8.65');
    expect(md).not.toContain('Raw Score: 8.65');

    expect(md).toContain('# SCORE TRACE INTERPRETATION');
    expect(md).toContain(
      'If hand-sum of Display Layer Scores (e.g. ~9.76) ≠ Decision Total (e.g. 8.65),',
    );

    // Hand-sum of production display layers = 9.76 ≠ Final Score 8.65 (root cause).
    const displaySum =
      0.75 + 1.5 + 1.5 + 1.5 + 0.75 + 0 + 0.75 + 1.13 + 0 + 0.75 + 1.13;
    expect(+(displaySum.toFixed(2))).toBe(9.76);
    expect(9.76).not.toBe(8.65);

    const fs = require('node:fs');
    const path = require('node:path');
    fs.writeFileSync(
      path.join(
        process.cwd(),
        'docs',
        'SCORE_TRACE_TASK18_7_BTCUSDT_LONG_v4_PRODUCTION_SAMPLE.md',
      ),
      md,
      'utf8',
    );
  });
});

/**
 * TASK 18.8 — BLOCKING EVENTS ORIGIN label fix (Option A).
 *
 * FIXTURE — label/structure only (Trade ID marked -FIXTURE).
 * PRODUCTION — values copied from Downloads/01_RULEBOOK (1).md @ 2026-07-20T06:54:48.415Z.
 *
 * Wire path (same as UI "RuleBook Trace"):
 *   exportTraceOrReviewMarkdown('trace-rulebook', context)
 */

import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import { LAYER_L5B_ID } from '../../constants/scoring';
import type { SignalRow } from '../signalBoardScan';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';

const GROUP_BLOCK = 'Nhóm A (Xu hướng) 2.4/5đ < 2.5đ';
const SCORE_BLOCK = 'L5a CVD chưa đủ 1đ — CVD -4K — chưa đủ tín hiệu Short';

function layer(
  id: number,
  name: string,
  score: number,
  reason: string,
  opts?: { passed?: boolean; mandatory?: boolean; violation?: boolean },
): SignalRow['layers'][number] {
  return {
    layer: id as SignalRow['layers'][number]['layer'],
    name,
    score,
    maxScore: 1.5,
    passed: opts?.passed ?? score > 0,
    isMandatory: opts?.mandatory ?? id === 5,
    isMandatoryViolation: opts?.violation ?? (id === 5 && score === 0),
    reason,
  };
}

/** Label-only fixture — NOT the production bug-discovery trade. */
function btcShortV4FixtureRow(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 0.5, 'FIXTURE L1'),
    layer(5, 'L5a — CVD Strength', 0.5, 'FIXTURE L5a', { passed: false }),
  ];
  const v4 = {
    score: 7.2,
    longScore: 9,
    shortScore: 7.2,
    direction: 'SHORT' as const,
    decisionLabel: 'CHO_THEM' as const,
    decisionDisplay: 'CHỜ THÊM',
    winrate: '~52%',
    canEnter: false,
    layers,
    mandatoryViolations: [GROUP_BLOCK, SCORE_BLOCK],
    hardBlocked: true,
    groupBlocks: [GROUP_BLOCK],
    shortHardBlocks: [],
    shortBlockReasons: [SCORE_BLOCK],
    shortGroupBlocks: [GROUP_BLOCK],
    groupScores: { A: 2.4, B: 2.5, C: 2.3 },
    shortGroupScores: { A: 2.4, B: 2.5, C: 2.3 },
  };
  return {
    symbol: 'BTCUSDT',
    price: 64200,
    change24h: -0.4,
    trend: 'BEARISH',
    regimeConfidence: 0.6,
    score: 7.2,
    longScore: 9,
    shortScore: 7.2,
    direction: 'SHORT',
    decisionLabel: 'CHO_THEM',
    decisionDisplay: 'CHỜ THÊM',
    winrate: '~52%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: [GROUP_BLOCK, SCORE_BLOCK],
    hardBlocked: true,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.GROUP_BLOCKED,
    v4,
  };
}

/**
 * Production evidence — copied from Downloads/01_RULEBOOK (1).md
 * (Generated Time 2026-07-20T06:54:48.415Z, 11 rules, Score 8.52, KHONG_VAO).
 */
function btcShortV4ProductionRow(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 1, 'Mâu thuẫn 1H vs 4H', { passed: true, mandatory: false }),
    layer(2, 'RSI 14 + Divergence', 0.75, 'RSI gần vùng Short (1H: 37.3, 4H: 59.3)', {
      passed: true,
      mandatory: false,
    }),
    layer(3, 'MACD + Histogram Momentum', 1.13, 'MACD vừa cắt xuống 0 — tín hiệu mạnh', {
      passed: true,
      mandatory: false,
    }),
    layer(4, 'Bollinger %B + Bandwidth', 0, '%B=0 Giá đáy dải — không Short Ranging', {
      passed: false,
      mandatory: false,
    }),
    layer(5, 'L5a — CVD Strength', 0, 'CVD -4K — chưa đủ tín hiệu Short', {
      passed: false,
      mandatory: true,
      violation: true,
    }),
    layer(
      LAYER_L5B_ID as SignalRow['layers'][number]['layer'],
      'L5b — Volume / OI',
      0.98,
      'Vol 2.7×, Long covering',
      { passed: true, mandatory: false },
    ),
    layer(6, 'Funding Rate + Trend', 0.75, 'Funding 0.0049% · ➡️ Thị trường cân bằng', {
      passed: true,
      mandatory: false,
    }),
    layer(7, 'L/S Ratio + Whale Wall', 1.13, 'Đám đông tăng Long — contrarian thuận Short', {
      passed: true,
      mandatory: false,
    }),
    layer(8, 'BTC 24h + 1H Momentum', 1.5, 'BTC 24h -1.26%, 1h -0.63% — cùng chiều giảm', {
      passed: true,
      mandatory: false,
    }),
    layer(
      9,
      'Phiên giao dịch',
      0.75,
      'London Lunch: 12-15h VN: London nghỉ trưa, thanh khoản giảm',
      { passed: true, mandatory: false },
    ),
    layer(10, 'Tâm lý & Kỷ luật', 1.13, '4/5 mục — đạt', { passed: true, mandatory: false }),
  ];
  const shortGroupScores = { A: 2.4, B: 2.38, C: 3.75 };
  const v4 = {
    score: 8.52,
    longScore: 5.83,
    shortScore: 8.52,
    direction: 'SHORT' as const,
    decisionLabel: 'KHONG_VAO' as const,
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    layers,
    mandatoryViolations: [GROUP_BLOCK, SCORE_BLOCK],
    hardBlocked: true,
    groupBlocks: [GROUP_BLOCK],
    shortHardBlocks: [],
    longHardBlocks: [],
    shortBlockReasons: [SCORE_BLOCK],
    longBlockReasons: [],
    groupScores: shortGroupScores,
    shortGroupScores,
    longGroupScores: { A: 1.5, B: 2.0, C: 2.33 },
    shortGroupBlocks: [GROUP_BLOCK],
    longGroupBlocks: [],
  };
  return {
    symbol: 'BTCUSDT',
    price: 63873.5,
    change24h: -1.257,
    trend: 'BEARISH',
    regimeConfidence: 0.65,
    score: 8.52,
    longScore: 5.83,
    shortScore: 8.52,
    direction: 'SHORT',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: [GROUP_BLOCK, SCORE_BLOCK],
    hardBlocked: true,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.GROUP_BLOCKED,
    fundingRate: 0.00489,
    cvdValue: -3959.499755859375,
    cvdTrend: 'UP',
    topLSRatio: 1.576,
    atr1h: 297.89910888671875,
    adxData: {
      adx1H: 23.27311134338379,
      adx4H: 23.565845489501953,
    },
    adxGate: {
      allowed: true,
      regime: 'RANGING',
    },
    groupScores: shortGroupScores,
    v4,
  };
}

const TRACE_KINDS = [
  'trace-rulebook',
  'trace-score',
  'trace-entry',
  'trace-position',
  'trace-tradeplan',
] as const;

describe('TASK 18.8 — BLOCKING EVENTS ORIGIN (Option A)', () => {
  it('all 5 trace kinds use BLOCKING EVENTS ORIGIN — shared appendix', () => {
    const row = btcShortV4ProductionRow();
    const kindsWithSnapshotNote = new Set([
      'trace-rulebook',
      'trace-score',
      'trace-entry',
      'trace-position',
    ]);
    for (const kind of TRACE_KINDS) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt: '2026-07-20T06:54:48.415Z',
      });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) continue;
      expect(result.markdown, kind).toContain('# BLOCKING EVENTS ORIGIN');
      expect(result.markdown, kind).not.toContain('# HARD BLOCK ORIGIN');
      expect(result.markdown, kind).toContain(
        'Every blocking event (Hard, Group, Score/soft, and ADX Gate) is listed here',
      );
      if (kindsWithSnapshotNote.has(kind)) {
        expect(result.markdown, kind).toContain(
          'NOTE — Hard/Group Blocked State: YES if Hard Block OR Group Block is active (not Hard Block alone).',
        );
      }
    }
  });

  it('FIXTURE — labels only (Trade ID marked -FIXTURE)', () => {
    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [btcShortV4FixtureRow()],
      scorerVersion: 'v4',
      exportedAt: '2026-07-20T00:00:00.000Z-FIXTURE',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown.replace(
      'Trade ID: BTCUSDT-SHORT-v4',
      'Trade ID: BTCUSDT-SHORT-v4-FIXTURE',
    );
    expect(md).toContain('Trade ID: BTCUSDT-SHORT-v4-FIXTURE');
    expect(md).toContain('Generated Time: 2026-07-20T00:00:00.000Z-FIXTURE');
    expect(md).toContain('# BLOCKING EVENTS ORIGIN');

    const fs = require('node:fs');
    const path = require('node:path');
    fs.writeFileSync(
      path.join(
        process.cwd(),
        'docs',
        'RULE_TRACE_TASK18_8_BTCUSDT_SHORT_v4_FIXTURE_SAMPLE.md',
      ),
      md,
      'utf8',
    );
  });

  it('PRODUCTION — exports Score / Entry / Position / TradePlan samples (5-kind evidence)', () => {
    const row = btcShortV4ProductionRow();
    const exportedAt = '2026-07-20T06:54:48.415Z';
    const samples: { kind: (typeof TRACE_KINDS)[number]; file: string }[] = [
      { kind: 'trace-score', file: 'SCORE_TRACE_TASK18_8_BTCUSDT_SHORT_v4_PRODUCTION.md' },
      { kind: 'trace-entry', file: 'ENTRY_TRACE_TASK18_8_BTCUSDT_SHORT_v4_PRODUCTION.md' },
      { kind: 'trace-position', file: 'POSITION_TRACE_TASK18_8_BTCUSDT_SHORT_v4_PRODUCTION.md' },
      { kind: 'trace-tradeplan', file: 'TRADEPLAN_TRACE_TASK18_8_BTCUSDT_SHORT_v4_PRODUCTION.md' },
    ];
    const fs = require('node:fs');
    const path = require('node:path');
    for (const { kind, file } of samples) {
      const result = exportTraceOrReviewMarkdown(kind, {
        rows: [row],
        scorerVersion: 'v4',
        exportedAt,
      });
      expect(result.ok, kind).toBe(true);
      if (!result.ok) return;
      const md = result.markdown;
      expect(md, kind).toContain('Trade ID: BTCUSDT-SHORT-v4');
      expect(md, kind).toContain('# BLOCKING EVENTS ORIGIN');
      expect(md, kind).not.toContain('# HARD BLOCK ORIGIN');
      expect(md, kind).toContain(
        'See BLOCKING EVENTS ORIGIN above for detail on every entry (hard, group, score, gate).',
      );
      fs.writeFileSync(path.join(process.cwd(), 'docs', file), md, 'utf8');
    }
  });

  it('PRODUCTION — real BTCUSDT-SHORT-v4 @ 2026-07-20T06:54:48.415Z (UI wire path)', () => {
    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [btcShortV4ProductionRow()],
      scorerVersion: 'v4',
      exportedAt: '2026-07-20T06:54:48.415Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;

    expect(md).toContain('Trade ID: BTCUSDT-SHORT-v4');
    expect(md).not.toContain('-FIXTURE');
    expect(md).toContain('Generated Time: 2026-07-20T06:54:48.415Z');
    expect(md).toContain('Decision: KHONG_VAO');
    expect(md).toContain('Score: 8.52');
    expect(md).toContain('Entry State: GROUP_BLOCKED');
    expect(md).toContain('Hard/Group Blocked State: YES');
    expect(md).toContain(
      'NOTE — Hard/Group Blocked State: YES if Hard Block OR Group Block is active (not Hard Block alone).',
    );
    expect(md).not.toContain('HardBlocked State:');

    expect(md).toContain('Rule 011');
    expect(md).toContain('Mâu thuẫn 1H vs 4H');
    expect(md).toContain('CVD -4K — chưa đủ tín hiệu Short');
    expect(md).toContain('BTC 24h -1.26%, 1h -0.63% — cùng chiều giảm');

    expect(md).toContain('Hard Blocks (Engine / All Sources): 0');
    expect(md).toContain('Group Blocks: 1');
    expect(md).toContain('Score Blocks (block reasons): 1');

    const origin = md.slice(
      md.indexOf('# BLOCKING EVENTS ORIGIN'),
      md.indexOf('# BLOCKING SUMMARY'),
    );
    expect(origin).toContain(`| ${GROUP_BLOCK} | Group Block list |`);
    expect(origin).toContain(`| ${SCORE_BLOCK} | Score Block list (blockReasons) |`);

    const summary = md.slice(
      md.indexOf('# BLOCKING SUMMARY'),
      md.indexOf('# PRE-FILTERS'),
    );
    expect(summary).toContain(
      'See BLOCKING EVENTS ORIGIN above for detail on every entry (hard, group, score, gate).',
    );

    const fs = require('node:fs');
    const path = require('node:path');
    fs.writeFileSync(
      path.join(
        process.cwd(),
        'docs',
        'RULE_TRACE_TASK18_8_BTCUSDT_SHORT_v4_PRODUCTION.md',
      ),
      md,
      'utf8',
    );
  });

  it('UI handler equivalent — same context shape as SignalBoard handleExportAuditPackage', () => {
    const row = btcShortV4ProductionRow();
    const exportedAt = new Date().toISOString();
    const context = {
      rows: [row],
      scorerVersion: 'v4' as const,
      esmBridge: undefined,
      exportedAt,
    };
    const result = exportTraceOrReviewMarkdown('trace-rulebook', context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;
    expect(md).toContain('# DISPLAY LAYER SCORES');
    expect(md).toContain('# GROUP BREAKDOWN');
    expect(md).toContain('# BLOCKING EVENTS ORIGIN');
    expect(md).not.toContain('# HARD BLOCK ORIGIN');
    expect(md).toContain('Hard/Group Blocked State: YES');

    const fs = require('node:fs');
    const path = require('node:path');
    const header = [
      '<!--',
      'Generated via exportTraceOrReviewMarkdown("trace-rulebook", context)',
      'Context matches SignalBoard.handleExportAuditPackage (auditExportMode=trace-rulebook):',
      '  { rows, scorerVersion, esmBridge, exportedAt: new Date().toISOString() }',
      `exportedAt: ${exportedAt}`,
      '-->',
      '',
    ].join('\n');
    fs.writeFileSync(
      path.join(process.cwd(), 'docs', 'UI_RULEBOOK_TRACE_SIGNALBOARD_EXPORT.md'),
      header + md,
      'utf8',
    );
  });
});

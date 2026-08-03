/**
 * L5a / Rule 005 Block Type — Score Block must be SOFT, never HARD.
 *
 * Root cause (fixed): wire mapped isMandatoryViolation → blockType HARD.
 * Engine puts L5a floor miss in blockReasons (Score Block, soft).
 */
import { describe, expect, it } from 'vitest';
import { LAYER_L5B_ID } from '../../constants/scoring';
import {
  layerMatchesEngineBlockReason,
  resolveRuleTraceBlockType,
} from '../aiExport/traceLayerPresentation';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';
import type { SignalRow } from '../signalBoardScan';

const L5A_SCORE_BLOCK_BTC =
  'L5a CVD chưa đủ 1đ — CVD -4K — chưa đủ tín hiệu Short';
const L5A_SCORE_BLOCK_SOL =
  'L5a CVD chưa đủ 1đ — CVD yếu — chưa đủ tín hiệu Short';

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
    passed: opts?.passed ?? score >= 0.75,
    isMandatory: opts?.mandatory ?? id === 5,
    isMandatoryViolation: opts?.violation ?? (id === 5 && score < 0.75),
    reason,
  };
}

function shortRow(partial: {
  symbol: string;
  score: number;
  l5aScore: number;
  l5aReason: string;
  scoreBlock: string;
  hardBlocks?: string[];
}): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 0.75, 'ok'),
    layer(2, 'RSI 14 + Divergence', 0.75, 'ok'),
    layer(3, 'MACD + Histogram Momentum', 0.75, 'ok'),
    layer(4, 'Bollinger %B + Bandwidth', 0.75, 'ok'),
    layer(5, 'L5a — CVD Strength', partial.l5aScore, partial.l5aReason, {
      passed: partial.l5aScore >= 0.75,
      mandatory: true,
      violation: partial.l5aScore < 0.75,
    }),
    layer(LAYER_L5B_ID, 'L5b — Volume / OI', 0.75, 'ok', {
      mandatory: false,
      violation: false,
    }),
    layer(6, 'Funding Rate + Trend', 0.75, 'ok', { mandatory: false }),
    layer(7, 'L/S Ratio + Whale Wall', 0.75, 'ok', { mandatory: false }),
    layer(8, 'BTC 24h + 1H Momentum', 0.75, 'ok', { mandatory: false }),
    layer(9, 'Phiên giao dịch', 0.75, 'ok', { mandatory: false }),
    layer(10, 'Tâm lý & Kỷ luật', 0.75, 'ok', { mandatory: false }),
  ];
  const hardBlocks = partial.hardBlocks ?? [];
  const scoreBlocks = [partial.scoreBlock];
  return {
    symbol: partial.symbol,
    price: 1,
    change24h: -0.5,
    trend: 'BEARISH',
    regimeConfidence: 0.6,
    score: partial.score,
    longScore: 10,
    shortScore: partial.score,
    direction: 'SHORT',
    decisionLabel: partial.score >= 9 ? 'CO_THE_VAO' : 'CHO_THEM',
    decisionDisplay: partial.score >= 9 ? 'Có thể vào' : 'Chờ thêm',
    winrate: '50%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: scoreBlocks,
    hardBlocked: hardBlocks.length > 0,
    fromCache: false,
    v4: {
      score: partial.score,
      longScore: 10,
      shortScore: partial.score,
      direction: 'SHORT',
      decisionLabel: partial.score >= 9 ? 'CO_THE_VAO' : 'CHO_THEM',
      decisionDisplay: partial.score >= 9 ? 'Có thể vào' : 'Chờ thêm',
      winrate: '50%',
      canEnter: false,
      layers,
      mandatoryViolations: scoreBlocks,
      hardBlocked: hardBlocks.length > 0,
      shortHardBlocks: hardBlocks,
      shortBlockReasons: scoreBlocks,
      shortGroupBlocks: [],
      groupBlocks: [],
      groupScores: { A: 3, B: 2.5, C: 2 },
      shortGroupScores: { A: 3, B: 2.5, C: 2 },
    },
  };
}

function blockTypeForRule(markdown: string, ruleTitle: string): string | null {
  // Rule Trace renders each rule as a section; find Block Type near the title.
  const idx = markdown.indexOf(ruleTitle);
  if (idx < 0) return null;
  const slice = markdown.slice(idx, idx + 800);
  const m = slice.match(/Block Type:\s*(\w+)/);
  return m?.[1] ?? null;
}

function mandatoryForRule(markdown: string, ruleTitle: string): string | null {
  const idx = markdown.indexOf(ruleTitle);
  if (idx < 0) return null;
  const slice = markdown.slice(idx, idx + 800);
  const m = slice.match(/Mandatory:\s*(\w+)/i);
  return m?.[1] ?? null;
}

describe('resolveRuleTraceBlockType (L5a Score Block ≠ HARD)', () => {
  it('maps L5a in scoreBlocks → SOFT even when isMandatoryViolation', () => {
    expect(
      resolveRuleTraceBlockType(
        {
          layer: 5,
          name: 'L5a — CVD Strength',
          isMandatoryViolation: true,
        },
        [],
        [L5A_SCORE_BLOCK_BTC],
      ),
    ).toBe('SOFT');
  });

  it('maps L5a CVD extreme in hardBlocks → HARD', () => {
    expect(
      resolveRuleTraceBlockType(
        {
          layer: 5,
          name: 'L5a — CVD Strength',
          isMandatoryViolation: true,
        },
        ['CVD +2.10M > +2M — chặn Short hoàn toàn'],
        [],
      ),
    ).toBe('HARD');
  });

  it('any rule appearing only in Score Block list → SOFT, never HARD', () => {
    const softReasons = [
      L5A_SCORE_BLOCK_BTC,
      'L5a CVD chưa đủ 1đ — weak',
    ];
    for (const reason of softReasons) {
      expect(layerMatchesEngineBlockReason(reason, { layer: 5, name: 'L5a — CVD Strength' })).toBe(
        true,
      );
      expect(
        resolveRuleTraceBlockType(
          { layer: 5, name: 'L5a — CVD Strength', isMandatoryViolation: true },
          [], // Hard Blocks (Engine) = 0
          [reason],
        ),
      ).toBe('SOFT');
    }
  });
});

describe('Rule Trace wire — BTC/SOL SHORT L5a cases', () => {
  it('BTCUSDT-SHORT Score 7.69: L5a Actual=0 → Block Type SOFT, Mandatory YES', () => {
    const row = shortRow({
      symbol: 'BTCUSDT',
      score: 7.69,
      l5aScore: 0,
      l5aReason: 'CVD -4K — chưa đủ tín hiệu Short',
      scoreBlock: L5A_SCORE_BLOCK_BTC,
      hardBlocks: [],
    });
    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      coin: 'BTCUSDT',
      exportedAt: '2026-07-22T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.markdown).toMatch(/^Coin:\s*BTCUSDT$/m);
    expect(blockTypeForRule(result.markdown, 'L5a — CVD Strength')).toBe('SOFT');
    expect(mandatoryForRule(result.markdown, 'L5a — CVD Strength')).toMatch(/YES|true/i);
    expect(result.markdown).toContain('Hard Block (Engine / All Sources): 0');
    // Must not label L5a as HARD anymore
    const l5aSlice = result.markdown.slice(
      result.markdown.indexOf('L5a — CVD Strength'),
      result.markdown.indexOf('L5a — CVD Strength') + 600,
    );
    expect(l5aSlice).not.toMatch(/Block Type:\s*HARD/);
  });

  it('SOLUSDT-SHORT Score 9.46: L5a Actual=0.38 PASS status path → still SOFT if in scoreBlocks', () => {
    // User case: Actual=0.38 Status=PASS but was wrongly HARD.
    // Display pass threshold in fixture helper uses >=0.75; force passed=true
    // with violation=false while scoreBlocks still list L5a (engine soft list).
    const row = shortRow({
      symbol: 'SOLUSDT',
      score: 9.46,
      l5aScore: 0.38,
      l5aReason: 'CVD yếu',
      scoreBlock: L5A_SCORE_BLOCK_SOL,
      hardBlocks: [],
    });
    // Override: Status PASS like user export while still on soft list
    const l5a = row.layers.find((l) => l.layer === 5)!;
    l5a.passed = true;
    l5a.isMandatoryViolation = false;
    if (row.v4) {
      const v4l5a = row.v4.layers.find((l) => l.layer === 5)!;
      v4l5a.passed = true;
      v4l5a.isMandatoryViolation = false;
    }

    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      coin: 'SOLUSDT',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(blockTypeForRule(result.markdown, 'L5a — CVD Strength')).toBe('SOFT');
    expect(mandatoryForRule(result.markdown, 'L5a — CVD Strength')).toMatch(/YES|true/i);
  });

  it('invariant: every Score Block list entry for a matched rule → SOFT in Rule Trace', () => {
    const scoreBlock = 'L5a CVD chưa đủ 1đ — test invariant';
    const row = shortRow({
      symbol: 'BTCUSDT',
      score: 8,
      l5aScore: 0,
      l5aReason: 'test',
      scoreBlock,
      hardBlocks: [],
    });
    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      coin: 'BTCUSDT',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Parse BLOCKING EVENTS ORIGIN soft list presence
    expect(result.markdown).toContain('Score Block list (blockReasons)');
    expect(result.markdown).toContain(scoreBlock);
    expect(blockTypeForRule(result.markdown, 'L5a — CVD Strength')).toBe('SOFT');
  });
});

/**
 * Regression — 03_ENTRY_DECISION Soft Block must include Score Block list
 * (blockReasons). Hard/Group counts and Decision stay unchanged.
 */
import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import type { SignalRow } from '../signalBoardScan';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';

const SCORE_BLOCK = 'L5a CVD chưa đủ 1đ — CVD âm sâu -1.95M';
const GROUP_BLOCK = 'Nhóm B (Dòng tiền) 1.3/5đ < 2đ';

function extractSection(md: string, heading: string, nextHeading?: string): string {
  const start = md.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const from = start;
  const end =
    nextHeading != null && md.indexOf(nextHeading, from + 1) >= 0
      ? md.indexOf(nextHeading, from + 1)
      : md.length;
  return md.slice(from, end);
}

function longRow(opts: {
  scoreBlocks: string[];
  groupBlocks?: string[];
  hardBlocks?: string[];
  canEnter?: boolean;
}): SignalRow {
  const groupBlocks = opts.groupBlocks ?? [GROUP_BLOCK];
  const hardBlocks = opts.hardBlocks ?? [];
  const scoreBlocks = opts.scoreBlocks;
  const canEnter = opts.canEnter ?? false;
  const layers: SignalRow['layers'] = [
    {
      layer: 5,
      name: 'L5a — CVD Strength',
      score: 0,
      maxScore: 1.5,
      passed: false,
      isMandatory: true,
      isMandatoryViolation: true,
      reason: SCORE_BLOCK,
    },
  ];
  const v4 = {
    score: 7.2,
    longScore: 7.2,
    shortScore: 4,
    direction: 'LONG' as const,
    decisionLabel: canEnter ? ('CO_THE_VAO' as const) : ('CHO_THEM' as const),
    decisionDisplay: canEnter ? 'Có thể vào' : 'Chờ thêm',
    winrate: '52%',
    canEnter,
    layers,
    mandatoryViolations: [...hardBlocks, ...groupBlocks, ...scoreBlocks],
    hardBlocked: hardBlocks.length + groupBlocks.length > 0,
    groupBlocks,
    longHardBlocks: hardBlocks,
    shortHardBlocks: [] as string[],
    longBlockReasons: scoreBlocks,
    shortBlockReasons: [] as string[],
    longGroupBlocks: groupBlocks,
    shortGroupBlocks: [] as string[],
  };
  return {
    symbol: 'BTCUSDT',
    price: 64000,
    change24h: 0.5,
    trend: 'BULLISH',
    regimeConfidence: 0.7,
    score: 7.2,
    longScore: 7.2,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: v4.decisionLabel,
    decisionDisplay: v4.decisionDisplay,
    winrate: '52%',
    canEnter,
    tradePlan: null,
    layers,
    mandatoryViolations: v4.mandatoryViolations,
    hardBlocked: v4.hardBlocked,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.GROUP_BLOCKED,
    groupBlocks,
    v4,
  };
}

describe('03_ENTRY_DECISION Soft Block includes Score Block list', () => {
  it('BTCUSDT-LONG-v4 pattern: Soft Block/Soft Blocks = Score Blocks count; Type SOFT entry', () => {
    const result = exportTraceOrReviewMarkdown('trace-entry', {
      rows: [longRow({ scoreBlocks: [SCORE_BLOCK] })],
      scorerVersion: 'v4',
      exportedAt: '2026-07-26T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;

    expect(md).toContain('Score Blocks (block reasons): 1');
    expect(md).toContain(`Score Block list (blockReasons)`);

    const blockers = extractSection(md, '# BLOCKERS', '# ENTRY EVIDENCE');
    expect(blockers).toContain('Hard Block: 0');
    expect(blockers).toContain('Group Block: 1');
    expect(blockers).toContain('Soft Block: 1');
    expect(blockers).toContain('Type: GROUP');
    expect(blockers).toContain('Type: SOFT');
    expect(blockers).toContain(`Rule: ${SCORE_BLOCK}`);
    expect(blockers).toContain(`Reason: ${SCORE_BLOCK}`);

    const summary = extractSection(md, '# ENTRY SUMMARY', '# AI REVIEW');
    expect(summary).toContain('Hard Blocks: 0');
    expect(summary).toContain('Group Blocks: 1');
    expect(summary).toContain('Soft Blocks: 1');
    expect(summary).toContain('Decision: WAIT');
  });

  it('no Score Block → Soft Block/Soft Blocks stay 0; Hard/Group unchanged', () => {
    const result = exportTraceOrReviewMarkdown('trace-entry', {
      rows: [longRow({ scoreBlocks: [] })],
      scorerVersion: 'v4',
      exportedAt: '2026-07-26T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;

    expect(md).toContain('Score Blocks (block reasons): 0');

    const blockers = extractSection(md, '# BLOCKERS', '# ENTRY EVIDENCE');
    expect(blockers).toContain('Hard Block: 0');
    expect(blockers).toContain('Group Block: 1');
    expect(blockers).toContain('Soft Block: 0');
    expect(blockers).not.toContain('Type: SOFT');

    const summary = extractSection(md, '# ENTRY SUMMARY', '# AI REVIEW');
    expect(summary).toContain('Hard Blocks: 0');
    expect(summary).toContain('Group Blocks: 1');
    expect(summary).toContain('Soft Blocks: 0');
    expect(summary).toContain('Decision: WAIT');
  });

  it('Soft Block count matches BLOCKING SUMMARY Score Blocks exactly (N reasons)', () => {
    const two = [
      'L5a CVD chưa đủ 1đ — A',
      'L5b Volume chưa đủ — B',
    ];
    const result = exportTraceOrReviewMarkdown('trace-entry', {
      rows: [longRow({ scoreBlocks: two, groupBlocks: [] })],
      scorerVersion: 'v4',
      exportedAt: '2026-07-26T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const md = result.markdown;
    expect(md).toContain('Score Blocks (block reasons): 2');
    expect(md).toContain('Soft Block: 2');
    expect(md).toContain('Soft Blocks: 2');
    expect(md).toContain(`Rule: ${two[0]}`);
    expect(md).toContain(`Rule: ${two[1]}`);
  });
});

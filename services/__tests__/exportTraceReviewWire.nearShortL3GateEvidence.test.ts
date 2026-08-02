/**
 * NEAR SHORT S1/S3 — sample Trace exports for duyệt before merge.
 * Writes docs/exports/near-short-l3-gate/*.md
 *
 * Run: npx vitest run services/__tests__/exportTraceReviewWire.nearShortL3GateEvidence.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAYER_L5B_ID, LAYER_NAMES_V4 } from '../../constants/scoring';
import { nearShortL3HardBlockReason } from '../../config/nearV4LayerGates';
import {
  exportTraceOrReviewMarkdown,
  TRACE_REVIEW_FILENAMES,
  type TraceReviewExportKind,
} from '../exportTraceReviewWire';
import type { SignalRow } from '../signalBoardScan';

const OUT_DIR = path.join(process.cwd(), 'docs', 'exports', 'near-short-l3-gate');

const TRACE_KINDS: TraceReviewExportKind[] = [
  'trace-rulebook',
  'trace-score',
  'trace-entry',
  'trace-position',
  'trace-tradeplan',
];

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
    isMandatoryViolation: opts?.violation ?? false,
    reason,
  };
}

function baseLayers(l3DisplayScore: number, l3Reason: string): SignalRow['layers'] {
  return [
    layer(1, LAYER_NAMES_V4[1], 1.0, 'ok'),
    layer(2, LAYER_NAMES_V4[2], 0.75, 'ok'),
    layer(3, LAYER_NAMES_V4[3], l3DisplayScore, l3Reason),
    layer(4, LAYER_NAMES_V4[4], 0.75, 'ok'),
    layer(5, LAYER_NAMES_V4[5], 1.0, 'ok'),
    layer(LAYER_L5B_ID, LAYER_NAMES_V4[LAYER_L5B_ID], 0.75, 'ok'),
    layer(6, LAYER_NAMES_V4[6], 0.75, 'ok'),
    layer(7, LAYER_NAMES_V4[7], 0.75, 'ok'),
    layer(8, LAYER_NAMES_V4[8], 0.75, 'ok'),
    layer(9, LAYER_NAMES_V4[9], 0.75, 'ok'),
    layer(10, LAYER_NAMES_V4[10], 0.75, 'ok'),
  ];
}

/** L3 raw 1.0 → display ~0.75; passed=true (score>0) but S1 hard-blocks NEAR SHORT. */
function nearShortS1BlockedRow(): SignalRow {
  const hardBlock = nearShortL3HardBlockReason('NEARUSDT', 'SHORT', 1.0)!;
  const layers = baseLayers(0.75, 'Histogram âm 1H / dương 4H — raw ~1.0');
  return {
    symbol: 'NEARUSDT',
    price: 2.45,
    change24h: -1.2,
    trend: 'BEARISH',
    regimeConfidence: 0.7,
    score: 6,
    longScore: 4,
    shortScore: 6,
    direction: 'SHORT',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'Không vào',
    winrate: '50%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: [hardBlock],
    hardBlocked: true,
    fromCache: false,
    v4: {
      score: 6,
      longScore: 4,
      shortScore: 6,
      direction: 'SHORT',
      decisionLabel: 'KHONG_VAO',
      decisionDisplay: 'Không vào',
      winrate: '50%',
      canEnter: false,
      layers,
      mandatoryViolations: [hardBlock],
      hardBlocked: true,
      shortHardBlocks: [hardBlock],
      shortBlockReasons: [],
      shortGroupBlocks: [],
      groupBlocks: [],
      groupScores: { A: 3, B: 2, C: 1 },
      shortGroupScores: { A: 3, B: 2, C: 1 },
    },
  };
}

/** L3 raw 2.0 → display 1.5 + STRONG_L3 tag (S3 label, no S1 block). */
function nearShortStrongL3Row(): SignalRow {
  const layers = baseLayers(1.5, 'Histogram âm cả 1H & 4H — tín hiệu mạnh');
  return {
    symbol: 'NEARUSDT',
    price: 2.45,
    change24h: -1.2,
    trend: 'BEARISH',
    regimeConfidence: 0.7,
    score: 9,
    longScore: 4,
    shortScore: 9,
    direction: 'SHORT',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'Có thể vào',
    winrate: '65%',
    canEnter: true,
    tradePlan: null,
    layers,
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    v4: {
      score: 9,
      longScore: 4,
      shortScore: 9,
      direction: 'SHORT',
      decisionLabel: 'CO_THE_VAO',
      decisionDisplay: 'Có thể vào',
      winrate: '65%',
      canEnter: true,
      layers,
      mandatoryViolations: [],
      hardBlocked: false,
      shortHardBlocks: [],
      shortBlockReasons: [],
      shortGroupBlocks: [],
      groupBlocks: [],
      groupScores: { A: 4, B: 3, C: 2 },
      shortGroupScores: { A: 4, B: 3, C: 2 },
      signalTags: ['STRONG_L3'],
    },
  };
}

function writeExports(prefix: string, row: SignalRow): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const kind of TRACE_KINDS) {
    const result = exportTraceOrReviewMarkdown(kind, {
      rows: [row],
      scorerVersion: 'v4',
      coin: 'NEARUSDT',
      exportedAt: '2026-08-02T12:00:00.000Z',
    });
    expect(result.ok, `${prefix} ${kind}`).toBe(true);
    if (!result.ok) continue;
    const base = TRACE_REVIEW_FILENAMES[kind].replace(/\.md$/, '');
    const outPath = path.join(OUT_DIR, `${base}_${prefix}.md`);
    fs.writeFileSync(outPath, result.markdown, 'utf8');
  }
}

describe('NEAR SHORT L3 gate — Trace export evidence', () => {
  it('S1 blocked: hard list + L3 Block Type HARD + Warning Count not inflated', () => {
    const row = nearShortS1BlockedRow();
    const hard = nearShortL3HardBlockReason('NEARUSDT', 'SHORT', 1.0)!;
    writeExports('NEARUSDT_SHORT_S1_BLOCKED', row);

    const rulebook = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      coin: 'NEARUSDT',
      exportedAt: '2026-08-02T12:00:00.000Z',
    });
    expect(rulebook.ok).toBe(true);
    if (!rulebook.ok) return;

    expect(rulebook.markdown).toContain(hard);
    expect(rulebook.markdown).toMatch(/Warning Count:\s*0/);
    expect(rulebook.markdown).not.toContain('Signal Tags:');
    expect(rulebook.markdown).not.toContain('L3 Strong Signal:');

    const l3Idx = rulebook.markdown.indexOf('MACD + Histogram Momentum');
    expect(l3Idx).toBeGreaterThan(0);
    const l3Slice = rulebook.markdown.slice(l3Idx, l3Idx + 900);
    expect(l3Slice).toMatch(/Block Type:\s*HARD/);
    expect(l3Slice).toMatch(/Status:\s*PASS/);
  });

  it('S3 STRONG_L3: Signal Tags + L3 Strong Signal on Input Snapshot', () => {
    const row = nearShortStrongL3Row();
    writeExports('NEARUSDT_SHORT_STRONG_L3', row);

    const rulebook = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      coin: 'NEARUSDT',
      exportedAt: '2026-08-02T12:00:00.000Z',
    });
    expect(rulebook.ok).toBe(true);
    if (!rulebook.ok) return;

    expect(rulebook.markdown).toContain('Signal Tags: STRONG_L3');
    expect(rulebook.markdown).toContain('L3 Strong Signal: YES');
    // Spec appendix may mention the S1 string as a worked example — assert engine lists are empty.
    expect(rulebook.markdown).toMatch(/Hard Blocks \(Engine \/ All Sources\):\s*0/);
    expect(rulebook.markdown).toMatch(
      /No blocking events recorded in this frozen snapshot/,
    );

    const l3Idx = rulebook.markdown.indexOf('MACD + Histogram Momentum');
    const l3Slice = rulebook.markdown.slice(l3Idx, l3Idx + 900);
    expect(l3Slice).toMatch(/Block Type:\s*NONE/);
  });
});

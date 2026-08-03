/**
 * (c) Evidence: CVD extreme Short hard block → Rule Trace Block Type HARD.
 * Uses real scoreL5aV4 engine output + same exportTraceOrReviewMarkdown wire as UI.
 *
 * Run: npx vitest run services/__tests__/exportTraceReviewWire.cvdExtremeHardEvidence.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HARD_BLOCK_RULES_V4, LAYER_L5B_ID, LAYER_NAMES_V4 } from '../../constants/scoring';
import type { CVDPoint } from '../indicators';
import { scoreL5aV4 } from '../scorerV4';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';
import type { SignalRow } from '../signalBoardScan';

const OUT_DIR = path.join(
  process.cwd(),
  'docs',
  'exports',
  'rule-trace-l5a-block-type',
);

function makeCvdPointsAboveShortHardBlock(): CVDPoint[] {
  const threshold = HARD_BLOCK_RULES_V4.CVD_SHORT_HARD_BLOCK;
  const now = Date.now();
  const points: CVDPoint[] = [];
  for (let i = 0; i < 30; i++) {
    points.push({
      timestamp: now - (30 - i) * 60_000,
      cvd: threshold * 0.5 + i * (threshold * 0.03),
      price: 66_000,
    });
  }
  // Force last CVD clearly above +2M hard threshold
  points[points.length - 1] = {
    ...points[points.length - 1],
    cvd: threshold + 500_000, // +2.5M
  };
  return points;
}

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

describe('(c) CVD extreme → Block Type HARD (engine + wire export evidence)', () => {
  it('scoreL5aV4 SHORT with CVD>+2M yields hardBlock; Rule Trace L5a = HARD', () => {
    const cvdPoints = makeCvdPointsAboveShortHardBlock();
    const l5a = scoreL5aV4('SHORT', cvdPoints);
    expect(l5a.hardBlock, 'engine must emit CVD extreme hardBlock').toBeTruthy();
    expect(l5a.hardBlock).toMatch(/^CVD\b/i);
    expect(l5a.hardBlock).toMatch(/chặn Short/i);

    const hardBlock = l5a.hardBlock!;
    const layers = [
      layer(1, LAYER_NAMES_V4[1], 0.75, 'ok'),
      layer(2, LAYER_NAMES_V4[2], 0.75, 'ok'),
      layer(3, LAYER_NAMES_V4[3], 0.75, 'ok'),
      layer(4, LAYER_NAMES_V4[4], 0.75, 'ok'),
      layer(5, LAYER_NAMES_V4[5], 0, l5a.layerResult.reason, {
        passed: false,
        mandatory: true,
        violation: true,
      }),
      layer(LAYER_L5B_ID, LAYER_NAMES_V4[LAYER_L5B_ID], 0.75, 'ok'),
      layer(6, LAYER_NAMES_V4[6], 0.75, 'ok'),
      layer(7, LAYER_NAMES_V4[7], 0.75, 'ok'),
      layer(8, LAYER_NAMES_V4[8], 0.75, 'ok'),
      layer(9, LAYER_NAMES_V4[9], 0.75, 'ok'),
      layer(10, LAYER_NAMES_V4[10], 0.75, 'ok'),
    ];

    const row: SignalRow = {
      symbol: 'BTCUSDT',
      price: 66000,
      change24h: -0.2,
      trend: 'BEARISH',
      regimeConfidence: 0.7,
      score: 6,
      longScore: 9,
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
        longScore: 9,
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
        shortBlockReasons: [], // extreme path does NOT push soft score block
        shortGroupBlocks: [],
        groupBlocks: [],
        groupScores: { A: 3, B: 1, C: 2 },
        shortGroupScores: { A: 3, B: 1, C: 2 },
      },
    };

    const result = exportTraceOrReviewMarkdown('trace-rulebook', {
      rows: [row],
      scorerVersion: 'v4',
      coin: 'BTCUSDT',
      exportedAt: new Date().toISOString(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, '01_RULEBOOK_CVD_EXTREME_SHORT_HARD.md');
    fs.writeFileSync(outPath, result.markdown, 'utf8');

    const evidencePath = path.join(OUT_DIR, 'CVD_EXTREME_HARD_EVIDENCE.txt');
    const l5aIdx = result.markdown.indexOf('L5a — CVD Strength');
    const l5aSlice =
      l5aIdx >= 0 ? result.markdown.slice(l5aIdx, l5aIdx + 700) : '(L5a section missing)';
    const evidence = [
      'CVD EXTREME HARD — Rule Trace evidence',
      `engine.hardBlock: ${hardBlock}`,
      `engine.layerReason: ${l5a.layerResult.reason}`,
      `export file: ${path.relative(process.cwd(), outPath)}`,
      '',
      '--- L5a section (raw export) ---',
      l5aSlice,
      '',
    ].join('\n');
    fs.writeFileSync(evidencePath, evidence, 'utf8');

    expect(l5aSlice).toMatch(/Block Type:\s*HARD/);
    expect(l5aSlice).not.toMatch(/Block Type:\s*SOFT/);
    expect(result.markdown).toContain(hardBlock);
  });
});

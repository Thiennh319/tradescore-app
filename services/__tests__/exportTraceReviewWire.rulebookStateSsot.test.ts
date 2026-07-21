/**
 * APPLY FIX verify — RuleBook State SSOT on production wire path.
 * Regenerates 03_ENTRY_DECISION for BTCUSDT-LONG-v4 using INPUT SNAPSHOT
 * values from the bug export (Downloads @ 2026-07-21T01:41:56.458Z).
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
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
  passed = true,
): SignalRow['layers'][number] {
  return {
    layer: id as SignalRow['layers'][number]['layer'],
    name,
    score,
    maxScore: 1.5,
    passed,
    isMandatory: id === 5,
    isMandatoryViolation: false,
    reason,
  };
}

/** Bug evidence row — Entry Permission YES → ruleBookState PASS. */
function btcLongV4BugEvidenceRow(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 1.5, 'LONG alignment'),
    layer(2, 'RSI 14 + Divergence', 1.5, 'RSI optimal'),
    layer(3, 'MACD + Histogram Momentum', 1.5, 'Histogram dương'),
    layer(4, 'Bollinger %B + Bandwidth', 1.13, 'BB mid'),
    layer(5, 'L5a — CVD Strength', 1.13, 'CVD 6742 UP'),
    layer(
      LAYER_L5B_ID as SignalRow['layers'][number]['layer'],
      'L5b — Volume / OI',
      0.98,
      'Vol confirm',
    ),
    layer(6, 'Funding Rate + Trend', 0.75, 'Funding 0.0054'),
    layer(7, 'L/S Ratio + Whale Wall', 1.13, 'LS 1.33'),
    layer(8, 'BTC 24h + 1H Momentum', 1.13, 'Change24h 0.744'),
    layer(9, 'Phiên giao dịch', 0.75, 'Session', false), // → WARNING
    layer(10, 'Tâm lý & Kỷ luật', 1.13, '4/5 mục — đạt'),
  ];
  const groupScores = { A: 4.5, B: 3.4, C: 3.25 };
  return {
    symbol: 'BTCUSDT',
    price: 65345.1,
    change24h: 0.744,
    trend: 'BULLISH',
    regimeConfidence: 0.65,
    score: 11.15,
    longScore: 11.15,
    shortScore: 4,
    direction: 'LONG',
    decisionLabel: 'VAO_TU_TIN',
    decisionDisplay: 'VÀO TỰ TIN',
    winrate: '~70-75%',
    canEnter: true,
    tradePlan: null,
    layers,
    mandatoryViolations: [],
    hardBlocked: false,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.ENTRY_VALID,
    fundingRate: 0.0054,
    cvdValue: 6742.53173828125,
    cvdTrend: 'UP',
    topLSRatio: 1.3337,
    atr1h: 382.71038818359375,
    adxData: {
      adx1H: 26.113727569580078,
      adx4H: 23.018468856811523,
    },
    adxGate: { allowed: true, regime: 'RANGING' },
    groupScores,
    longGroupScores: groupScores,
    longHardBlocks: [],
    shortHardBlocks: [],
    longBlockReasons: [],
    shortBlockReasons: [],
    groupBlocks: [],
    v4: {
      score: 11.15,
      longScore: 11.15,
      shortScore: 4,
      direction: 'LONG',
      decisionLabel: 'VAO_TU_TIN',
      decisionDisplay: 'VÀO TỰ TIN',
      winrate: '~70-75%',
      canEnter: true,
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

function ruleBookStateIn(section: string): string {
  return section.match(/^RuleBook State:.*$/m)?.[0] ?? '(missing)';
}

describe('RuleBook State SSOT — production wire verify', () => {
  it('BTCUSDT-LONG-v4 — DECISION CHAIN and ENTRY SUMMARY both PASS', () => {
    const row = btcLongV4BugEvidenceRow();
    const result = exportTraceOrReviewMarkdown('trace-entry', {
      rows: [row],
      scorerVersion: 'v4',
      exportedAt: '2026-07-21T01:41:56.458Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const md = result.markdown;
    const outPath = join(
      process.cwd(),
      'docs/ENTRY_TRACE_BTCUSDT_LONG_v4_RULEBOOK_STATE_SSOT_VERIFY.md',
    );
    writeFileSync(outPath, md, 'utf8');

    expect(md).toContain('Trade ID: BTCUSDT-LONG-v4');
    expect(md).toContain('Timestamp: 2026-07-21T01:41:56.458Z');

    const chain = md.slice(
      md.indexOf('# DECISION CHAIN'),
      md.indexOf('# ENTRY DEPENDENCY'),
    );
    const summary = md.slice(md.indexOf('# ENTRY SUMMARY'));
    const chainLine = ruleBookStateIn(chain);
    const summaryLine = ruleBookStateIn(summary);

    // Visual confirmation target for QA:
    //   DECISION CHAIN → RuleBook State: PASS
    //   ENTRY SUMMARY  → RuleBook State: PASS
    expect(chainLine).toBe('RuleBook State: PASS');
    expect(summaryLine).toBe('RuleBook State: PASS');
    expect(chain).not.toContain('RuleBook State: UNAVAILABLE');

    // RULEBOOK INTERACTION unchanged (still not populated by wire).
    const interaction = md.slice(
      md.indexOf('# RULEBOOK INTERACTION'),
      md.indexOf('# DECISION CHAIN'),
    );
    expect(interaction).toContain('State After: UNAVAILABLE');
  });
});

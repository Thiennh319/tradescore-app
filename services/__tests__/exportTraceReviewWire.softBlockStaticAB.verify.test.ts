/**
 * Static A/B verify — Soft Block fix on frozen Downloads snapshots
 * (BTC/SOL/NEAR/BNB @ 2026-07-26T12:22:54.943Z). NO live scan.
 *
 * Env VERIFY_SOFT_PHASE=before|after controls output folder label only;
 * code under test is whatever is currently in exportTraceReviewWire.ts.
 *
 * Run (orchestrated by shell):
 *   VERIFY_SOFT_PHASE=after  npx vitest run ...
 *   (revert soft fix)
 *   VERIFY_SOFT_PHASE=before npx vitest run ...
 *   (restore soft fix)
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FinalEntryStatus } from '../../types/scoring';
import type { SignalRow } from '../signalBoardScan';
import { exportTraceOrReviewMarkdown } from '../exportTraceReviewWire';

const PHASE = (process.env.VERIFY_SOFT_PHASE ?? 'after') as 'before' | 'after';
const EXPORTED_AT = '2026-07-26T12:22:54.943Z';
const OUT_DIR = path.join(
  process.cwd(),
  'docs',
  'exports',
  'soft-block-static-ab',
  PHASE,
);

type FrozenTrade = {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  price: number;
  score: number;
  change24h: number;
  trend: string;
  regimeConfidence: number;
  funding: number;
  cvd: number;
  cvdTrend: string;
  topLSRatio: number;
  atr1h: number;
  adx1h: number;
  adx4h: number;
  adxRegime: string;
  decisionLabel: 'KHONG_VAO' | 'CO_THE_VAO' | 'VAO_TU_TIN' | 'CHO_THEM' | 'CHO_TAI_CHAM';
  decisionDisplay: string;
  winrate: string;
  canEnter: boolean;
  hardBlocked: boolean;
  finalEntryStatus: FinalEntryStatus;
  groupBlocks: string[];
  scoreBlocks: string[];
  hardBlocks: string[];
};

/** Exact inputs from C:\\Users\\Thien\\Downloads\\03_ENTRY_DECISION_*.md */
const FROZEN: FrozenTrade[] = [
  {
    id: 'BTCUSDT-LONG-v4',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    price: 64533.2,
    score: 8.44,
    change24h: 0.804,
    trend: 'SIDEWAYS',
    regimeConfidence: 0.65,
    funding: 0.005884,
    cvd: 2951.2724609375,
    cvdTrend: 'DOWN',
    topLSRatio: 1.8482,
    atr1h: 121.68896484375,
    adx1h: 12.77746868133545,
    adx4h: 22.00277328491211,
    adxRegime: 'RANGING',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    hardBlocked: true,
    finalEntryStatus: FinalEntryStatus.GROUP_BLOCKED,
    groupBlocks: ['Nhóm B (Dòng tiền) 1.6/5đ < 2đ'],
    scoreBlocks: ['L5a CVD chưa đủ 1đ — CVD 3K — chưa đủ tín hiệu Long'],
    hardBlocks: [],
  },
  {
    id: 'SOLUSDT-LONG-v4',
    symbol: 'SOLUSDT',
    direction: 'LONG',
    price: 74.88,
    score: 8.13,
    change24h: 1.353,
    trend: 'BULLISH',
    regimeConfidence: 0.65,
    funding: 0.006371,
    cvd: -1110951.75,
    cvdTrend: 'DOWN',
    topLSRatio: 2.9888,
    atr1h: 0.2849373519420624,
    adx1h: 23.130708694458008,
    adx4h: 22.333871841430664,
    adxRegime: 'RANGING',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    hardBlocked: true,
    finalEntryStatus: FinalEntryStatus.GROUP_BLOCKED,
    groupBlocks: ['Nhóm B (Dòng tiền) 1.3/5đ < 2đ'],
    scoreBlocks: ['L5a CVD chưa đủ 1đ — CVD âm sâu -1.11M'],
    hardBlocks: [],
  },
  {
    id: 'BNBUSDT-SHORT-v4',
    symbol: 'BNBUSDT',
    direction: 'SHORT',
    price: 571.9,
    score: 9.06,
    change24h: 1.13,
    trend: 'BULLISH',
    regimeConfidence: 0.65,
    funding: 0.010218,
    cvd: -77291.1640625,
    cvdTrend: 'DOWN',
    topLSRatio: 3.3516,
    atr1h: 1.319026231765747,
    adx1h: 40.086421966552734,
    adx4h: 15.13349437713623,
    adxRegime: 'TRENDING',
    decisionLabel: 'CO_THE_VAO',
    decisionDisplay: 'CÓ THỂ VÀO',
    winrate: '~65%',
    canEnter: true,
    hardBlocked: false,
    finalEntryStatus: FinalEntryStatus.WAIT_ENTRY,
    groupBlocks: [],
    scoreBlocks: [],
    hardBlocks: [],
  },
  {
    id: 'NEARUSDT-LONG-v4',
    symbol: 'NEARUSDT',
    direction: 'LONG',
    price: 1.795,
    score: 6.88,
    change24h: 0.448,
    trend: 'SIDEWAYS',
    regimeConfidence: 0.65,
    funding: -0.00385,
    cvd: -20760100,
    cvdTrend: 'DOWN',
    topLSRatio: 1.2712,
    atr1h: 0.010789027437567711,
    adx1h: 27.2993106842041,
    adx4h: 27.30763816833496,
    adxRegime: 'TRENDING',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    hardBlocked: true,
    finalEntryStatus: FinalEntryStatus.GROUP_BLOCKED,
    groupBlocks: ['Nhóm B (Dòng tiền) 0.6/5đ < 2đ'],
    scoreBlocks: ['L5a CVD chưa đủ 1đ — CVD âm sâu -20.76M'],
    hardBlocks: [],
  },
];

function toRow(t: FrozenTrade): SignalRow {
  const longHard = t.direction === 'LONG' ? t.hardBlocks : [];
  const shortHard = t.direction === 'SHORT' ? t.hardBlocks : [];
  const longScore = t.direction === 'LONG' ? t.scoreBlocks : [];
  const shortScore = t.direction === 'SHORT' ? t.scoreBlocks : [];
  const mandatory = [...t.hardBlocks, ...t.groupBlocks, ...t.scoreBlocks];
  const v4 = {
    score: t.score,
    longScore: t.direction === 'LONG' ? t.score : 0,
    shortScore: t.direction === 'SHORT' ? t.score : 0,
    direction: t.direction,
    decisionLabel: t.decisionLabel,
    decisionDisplay: t.decisionDisplay,
    winrate: t.winrate,
    canEnter: t.canEnter,
    layers: [] as SignalRow['layers'],
    mandatoryViolations: mandatory,
    hardBlocked: t.hardBlocked,
    groupBlocks: t.groupBlocks,
    longHardBlocks: longHard,
    shortHardBlocks: shortHard,
    longBlockReasons: longScore,
    shortBlockReasons: shortScore,
    longGroupBlocks: t.direction === 'LONG' ? t.groupBlocks : [],
    shortGroupBlocks: t.direction === 'SHORT' ? t.groupBlocks : [],
  };
  return {
    symbol: t.symbol,
    price: t.price,
    change24h: t.change24h,
    trend: t.trend,
    regimeConfidence: t.regimeConfidence,
    score: t.score,
    longScore: v4.longScore,
    shortScore: v4.shortScore,
    direction: t.direction,
    decisionLabel: t.decisionLabel,
    decisionDisplay: t.decisionDisplay,
    winrate: t.winrate,
    canEnter: t.canEnter,
    tradePlan: null,
    layers: [],
    mandatoryViolations: mandatory,
    hardBlocked: t.hardBlocked,
    fromCache: true,
    finalEntryStatus: t.finalEntryStatus,
    fundingRate: t.funding,
    cvdValue: t.cvd,
    cvdTrend: t.cvdTrend,
    topLSRatio: t.topLSRatio,
    atr1h: t.atr1h,
    adxData: { adx1H: t.adx1h, adx4H: t.adx4h },
    adxGate: { allowed: true, regime: t.adxRegime as 'RANGING' | 'TRENDING' },
    groupBlocks: t.groupBlocks,
    v4,
  };
}

function kv(section: string, key: string): string | null {
  const m = section.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

function sectionBetween(md: string, start: string, end: string): string {
  const a = md.indexOf(start);
  const b = md.indexOf(end, a + 1);
  expect(a, start).toBeGreaterThanOrEqual(0);
  expect(b, end).toBeGreaterThan(a);
  return md.slice(a, b);
}

function pickFields(md: string) {
  const blockers = sectionBetween(md, '# BLOCKERS', '# ENTRY EVIDENCE');
  const summary = sectionBetween(md, '# ENTRY SUMMARY', '# AI REVIEW');
  const decisionSec = sectionBetween(md, '# ENTRY DECISION', '# DECISION TREE');
  const chain = sectionBetween(md, '# DECISION CHAIN', '# ENTRY DEPENDENCY');
  const blockingSummary = sectionBetween(md, '# BLOCKING SUMMARY', '# PRE-FILTERS');
  return {
    hardBlock: kv(blockers, 'Hard Block'),
    groupBlock: kv(blockers, 'Group Block'),
    softBlock: kv(blockers, 'Soft Block'),
    typeSoft: blockers.includes('Type: SOFT') ? 'YES' : 'NO',
    hardBlocks: kv(summary, 'Hard Blocks'),
    groupBlocks: kv(summary, 'Group Blocks'),
    softBlocks: kv(summary, 'Soft Blocks'),
    decisionSummary: kv(summary, 'Decision'),
    grade: kv(summary, 'Grade'),
    ruleBookStateSummary: kv(summary, 'RuleBook State'),
    entryDecision: kv(decisionSec, 'Decision'),
    entryDecisionChain: kv(chain, 'Entry Decision'),
    ruleBookStateChain: kv(chain, 'RuleBook State'),
    scoreBlocksSummary: kv(blockingSummary, 'Score Blocks (block reasons)'),
    hardBlocksEngine: kv(blockingSummary, 'Hard Blocks (Engine / All Sources)'),
    groupBlocksSummary: kv(blockingSummary, 'Group Blocks'),
  };
}

describe(`Soft Block static A/B (${PHASE})`, () => {
  it('exports 4 frozen Downloads snapshots', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const report: unknown[] = [];

    for (const trade of FROZEN) {
      const row = toRow(trade);
      const result = exportTraceOrReviewMarkdown('trace-entry', {
        rows: [row],
        scorerVersion: 'v4',
        coin: trade.symbol,
        exportedAt: EXPORTED_AT,
      });
      expect(result.ok, trade.id).toBe(true);
      if (!result.ok) continue;

      const md = result.markdown;
      expect(md).toContain(`Trade ID: ${trade.id}`);
      expect(md).toContain(`Price: ${trade.price}`);
      expect(md).toContain(`Score: ${trade.score}`);

      const outPath = path.join(OUT_DIR, `03_ENTRY_DECISION_${trade.symbol}.md`);
      fs.writeFileSync(outPath, md, 'utf8');

      const fields = pickFields(md);
      report.push({ tradeId: trade.id, ...fields, outPath });
    }

    fs.writeFileSync(
      path.join(OUT_DIR, '_fields.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    expect(report).toHaveLength(4);
  });
});

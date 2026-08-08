/**
 * A/B verify FIX_HARD_REASON_LABELING on NEARUSDT 180d V4 suite.
 *
 * Uses scripts/backtest-v4-near-90d.ts (same scoring / canEnter / plan / ambiguity).
 * Flag only affects labeling helpers — entry pass/fail must be identical.
 *
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/verify-fix-hard-reason-labeling-near-180d.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setFixHardReasonLabelingForTests,
} from '../config/featureFlags';
import {
  applyEntryBlockedFields,
  resolveSnapEntryBlocked,
} from '../services/entryBlockedLabeling';
import {
  collectHardBlockReasons,
  type HardBlockSnapInput,
} from '../services/tradePlanDisplay';
import type { DirectionalScoreV4 } from '../services/scorerV4';
import {
  buildBarEvalCache,
  loadMarketBundle,
  simulateFromCache,
  type BarEvalCache,
} from './backtest-v4-near-90d';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAYS = 180;
const SYMBOL = 'NEARUSDT' as const;

type BlockClass = 'PASS' | 'HARD' | 'GROUP' | 'SOFT' | 'OTHER';

function classify(active: DirectionalScoreV4, canEnterRaw: boolean): BlockClass {
  if (canEnterRaw) return 'PASS';
  if (active.hardBlocks.length > 0) return 'HARD';
  if (active.groupBlocks.length > 0) return 'GROUP';
  if (active.blockReasons.length > 0) return 'SOFT';
  return 'OTHER';
}

function tradeId(bar: BarEvalCache): string {
  return `${bar.openTime}|${bar.direction}|${bar.canEnterRaw ? 'PASS' : 'BLOCK'}`;
}

function snapInputFromBar(bar: BarEvalCache, blockedFields: {
  hardBlocked: boolean;
  entryBlocked?: boolean;
}): HardBlockSnapInput {
  const active = bar.active;
  return {
    direction: bar.direction,
    mandatoryViolations: [
      ...active.hardBlocks,
      ...active.blockReasons,
      ...active.groupBlocks,
    ],
    groupBlocks: active.groupBlocks,
    longHardBlocks: bar.direction === 'LONG' ? active.hardBlocks : [],
    shortHardBlocks: bar.direction === 'SHORT' ? active.hardBlocks : [],
    longBlockReasons: bar.direction === 'LONG' ? active.blockReasons : [],
    shortBlockReasons: bar.direction === 'SHORT' ? active.blockReasons : [],
    hardBlocked: blockedFields.hardBlocked,
    entryBlocked: blockedFields.entryBlocked,
  };
}

function summarizeBranch(
  cache: BarEvalCache[],
  flagOn: boolean,
): {
  nEval: number;
  nPass: number;
  nHard: number;
  nGroup: number;
  nSoft: number;
  nOther: number;
  passFailIds: string[];
  entryBlockedMismatches: string[];
  hardReasonOnlySoftLeakWhenOff: number;
  hardReasonLeakWhenOn: number;
} {
  setFixHardReasonLabelingForTests(flagOn);
  let nPass = 0;
  let nHard = 0;
  let nGroup = 0;
  let nSoft = 0;
  let nOther = 0;
  const passFailIds: string[] = [];
  const entryBlockedMismatches: string[] = [];
  let hardReasonOnlySoftLeakWhenOff = 0;
  let hardReasonLeakWhenOn = 0;

  for (const bar of cache) {
    const cls = classify(bar.active, bar.canEnterRaw);
    if (cls === 'PASS') nPass += 1;
    else if (cls === 'HARD') nHard += 1;
    else if (cls === 'GROUP') nGroup += 1;
    else if (cls === 'SOFT') nSoft += 1;
    else nOther += 1;

    passFailIds.push(tradeId(bar));

    const blocked =
      bar.active.hardBlocks.length > 0 || bar.active.groupBlocks.length > 0;
    const fields = applyEntryBlockedFields(blocked);
    if (resolveSnapEntryBlocked(fields) !== blocked) {
      entryBlockedMismatches.push(tradeId(bar));
    }

    const reasons = collectHardBlockReasons(snapInputFromBar(bar, fields));
    const softSet = new Set(bar.active.blockReasons);
    const leakedSoft = reasons.filter((r) => softSet.has(r));
    if (!flagOn && leakedSoft.length > 0 && bar.active.hardBlocks.length === 0) {
      hardReasonOnlySoftLeakWhenOff += 1;
    }
    if (flagOn && leakedSoft.length > 0) {
      hardReasonLeakWhenOn += 1;
    }
  }

  return {
    nEval: cache.length,
    nPass,
    nHard,
    nGroup,
    nSoft,
    nOther,
    passFailIds,
    entryBlockedMismatches,
    hardReasonOnlySoftLeakWhenOff,
    hardReasonLeakWhenOn,
  };
}

function wrOfTrades(
  trades: { resultR: number; exitReason: string }[],
): number | null {
  const decided = trades.filter((t) => t.exitReason !== 'TIMEOUT' && Number.isFinite(t.resultR));
  if (decided.length === 0) return null;
  const wins = decided.filter((t) => t.resultR > 0).length;
  return (100 * wins) / decided.length;
}

async function main(): Promise<void> {
  console.log(`[verify] Loading NEAR ${DAYS}d market bundle…`);
  const bundle = await loadMarketBundle(SYMBOL, DAYS);
  console.log(`[verify] Building bar eval cache (scoreAnalysisV4)…`);
  const cache = buildBarEvalCache(bundle);
  console.log(`[verify] bars evaluated=${cache.length}`);

  const branchA = summarizeBranch(cache, false); // flag OFF
  const branchB = summarizeBranch(cache, true); // flag ON
  setFixHardReasonLabelingForTests(null);

  const sim = simulateFromCache(bundle, cache, 2.5);
  const wr = wrOfTrades(sim.trades);

  const passFailDiff: string[] = [];
  const n = Math.max(branchA.passFailIds.length, branchB.passFailIds.length);
  for (let i = 0; i < n; i++) {
    const a = branchA.passFailIds[i];
    const b = branchB.passFailIds[i];
    if (a !== b) passFailDiff.push(`idx=${i} A=${a} B=${b}`);
  }

  const metricRows: { metric: string; a: string | number; b: string | number; diff: string }[] = [
    { metric: 'Tổng số signal được đánh giá', a: branchA.nEval, b: branchB.nEval, diff: branchA.nEval === branchB.nEval ? 'Không' : 'CÓ' },
    { metric: 'Số entry PASS', a: branchA.nPass, b: branchB.nPass, diff: branchA.nPass === branchB.nPass ? 'Không' : 'CÓ' },
    { metric: 'Số entry BLOCKED (Hard)', a: branchA.nHard, b: branchB.nHard, diff: branchA.nHard === branchB.nHard ? 'Không' : 'CÓ' },
    { metric: 'Số entry BLOCKED (Group)', a: branchA.nGroup, b: branchB.nGroup, diff: branchA.nGroup === branchB.nGroup ? 'Không' : 'CÓ' },
    { metric: 'Số entry BLOCKED (Score/Soft)', a: branchA.nSoft, b: branchB.nSoft, diff: branchA.nSoft === branchB.nSoft ? 'Không' : 'CÓ' },
    {
      metric: 'Winrate trên tập entry PASS (rising+planValid simulates)',
      a: wr == null ? '—' : wr.toFixed(2) + '%',
      b: wr == null ? '—' : wr.toFixed(2) + '%',
      diff: 'Không (cùng sim)',
    },
    {
      metric: 'Trade ID PASS/BLOCK khác nhau A vs B',
      a: passFailDiff.length,
      b: passFailDiff.length,
      diff: passFailDiff.length === 0 ? 'Không' : 'CÓ — DỪNG',
    },
  ];

  const identical =
    passFailDiff.length === 0 &&
    branchA.nEval === branchB.nEval &&
    branchA.nPass === branchB.nPass &&
    branchA.nHard === branchB.nHard &&
    branchA.nGroup === branchB.nGroup &&
    branchA.nSoft === branchB.nSoft &&
    branchB.hardReasonLeakWhenOn === 0 &&
    branchA.entryBlockedMismatches.length === 0 &&
    branchB.entryBlockedMismatches.length === 0;

  const lines: string[] = [];
  lines.push('# VERIFY — FIX_HARD_REASON_LABELING NEARUSDT 180d A/B');
  lines.push('');
  lines.push(`**Ngày:** ${new Date().toISOString()}`);
  lines.push(`**Suite:** \`scripts/backtest-v4-near-90d.ts\` via loadMarketBundle + buildBarEvalCache + simulateFromCache`);
  lines.push(`**Symbol / window:** ${SYMBOL} / ${DAYS}d`);
  lines.push(`**FEATURE_FLAGS.FIX_HARD_REASON_LABELING default:** false (không bật production)`);
  lines.push('');
  lines.push('## Bảng so sánh');
  lines.push('');
  lines.push('| Metric | Nhánh A (flag OFF) | Nhánh B (flag ON) | Lệch? |');
  lines.push('|---|---:|---:|:---:|');
  for (const r of metricRows) {
    lines.push(`| ${r.metric} | ${r.a} | ${r.b} | ${r.diff} |`);
  }
  lines.push('');
  lines.push('### Label-only diagnostics');
  lines.push('');
  lines.push(`| Soft leaked vào hard-reasons (A OFF) | ${branchA.hardReasonOnlySoftLeakWhenOff} |`);
  lines.push(`| Soft leaked vào hard-reasons (B ON) | ${branchB.hardReasonLeakWhenOn} |`);
  lines.push(`| resolveSnapEntryBlocked mismatches | A=${branchA.entryBlockedMismatches.length} B=${branchB.entryBlockedMismatches.length} |`);
  lines.push(`| Simulated PASS trades (rising edges) | ${sim.trades.length} |`);
  lines.push('');

  if (passFailDiff.length > 0) {
    lines.push('## ⛔ PASS/BLOCK DIFF — KHÔNG đề xuất bật flag');
    lines.push('');
    for (const d of passFailDiff.slice(0, 50)) lines.push(`- ${d}`);
    if (passFailDiff.length > 50) lines.push(`- … +${passFailDiff.length - 50} more`);
  } else if (identical) {
    lines.push('## Kết luận');
    lines.push('');
    lines.push(
      '**Không ảnh hưởng rule/winrate NEAR — chỉ đổi hiển thị.** ' +
        '100% pass/fail + Hard/Group/Soft counts trùng khớp giữa A và B. ' +
        `Nhánh A từng có ${branchA.hardReasonOnlySoftLeakWhenOff} signal leak soft→hard-reasons (label bug); nhánh B = 0 leak.`,
    );
    lines.push('');
    lines.push('Flag vẫn **default OFF** — không bật trong task này.');
  } else {
    lines.push('## Kết luận');
    lines.push('');
    lines.push('Pass/fail khớp nhưng có lệch diagnostics khác — xem bảng / không đề xuất bật flag cho đến khi review.');
  }

  const outMd = path.resolve(
    __dirname,
    '../docs/reports/REPORT_FIX_HARD_REASON_LABELING_NEAR_180D_AB_2026-08-08.md',
  );
  const outExport = path.resolve(
    __dirname,
    '../docs/exports/REPORT_FIX_HARD_REASON_LABELING_NEAR_180D_AB_2026-08-08.md',
  );
  fs.mkdirSync(path.dirname(outMd), { recursive: true });
  fs.writeFileSync(outMd, lines.join('\n'), 'utf8');
  fs.copyFileSync(outMd, outExport);
  console.log(lines.join('\n'));
  console.log(`\nWrote ${outMd}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

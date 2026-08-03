/**
 * V4.1 — RC3 checklist scoring alternatives (CVD Flip / Volume / BTC / Exhaustion)
 * trên cùng 179 nến 4H NEARUSDT 30d.
 *
 * KHÔNG sửa production. Chỉ gọi engine hiện có:
 *   evaluateTrendReversalWithContext + calculateTrendStrength
 * Checklist map giống buildRc3ViewModelFromRow.
 *
 * Usage:
 *   npx tsx scripts/investigate-v41-reversal-checklist-scoring-30d.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import {
  evaluateMarketContext,
  evaluateTrendReversalWithContext,
} from '../services/v41/marketContextFilter';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const DAYS = 30;
const WARMUP_4H = 220;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 200;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;

const CONF_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-market-confidence-30d-4h.csv',
);
const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-reversal-checklist-scoring-30d-4h.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-reversal-checklist-scoring-30d-4h-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_REVERSAL_SCORING_ALTERNATIVES_30D_2026-07-31.md',
);

type OutRow = {
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  cvd_flip: 0 | 1;
  volume_confirm: 0 | 1;
  /** BTC dim evaluated every bar (scoring experiment — semantic check). */
  btc_confirm: 0 | 1;
  btc_skipped: 0 | 1;
  /** RC3 wire: only true when TR ACTIVE so marketContext is attached. */
  btc_confirm_rc3_wire: 0 | 1;
  exhaustion: 0 | 1;
  structure_break: 0 | 1;
  score_0_4: number;
  tr_active_legacy_3of4: 0 | 1;
  tr_state: string;
  and4: 0 | 1;
  ge2: 0 | 1;
  ge3: 0 | 1;
  exh_must_plus_ge2of3: 0 | 1;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toKlineV41(raw: (string | number)[]): KlineV41 {
  return {
    openTime: Number(raw[0]),
    open: parseFloat(String(raw[1])),
    high: parseFloat(String(raw[2])),
    low: parseFloat(String(raw[3])),
    close: parseFloat(String(raw[4])),
    volume: parseFloat(String(raw[5])),
    takerBuyVolume: parseFloat(String(raw[9])),
    closeTime: Number(raw[6]),
  };
}

async function fetchKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`klines ${symbol} ${interval} HTTP ${res.status}`);
    const batch = (await res.json()) as (string | number)[][];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) out.push(toKlineV41(row));
    const lastOpen = Number(batch[batch.length - 1]![0]);
    const step = interval === '4h' ? MS_4H : MS_1H;
    const next = lastOpen + step;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < BINANCE_MAX_LIMIT) break;
  }
  const byTs = new Map<number, KlineV41>();
  for (const k of out) byTs.set(k.openTime, k);
  return [...byTs.values()].sort((a, b) => a.openTime - b.openTime);
}

function loadConfTimestamps(): number[] {
  const text = fs.readFileSync(CONF_CSV, 'utf8');
  const lines = text.trim().split(/\r?\n/).slice(1);
  const ts: number[] = [];
  for (const line of lines) {
    const t = Number(line.split(',')[0]);
    if (Number.isFinite(t)) ts.push(t);
  }
  return ts;
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function bit(v: boolean): 0 | 1 {
  return v ? 1 : 0;
}

function pct(n: number, d: number): string {
  if (d <= 0) return '0.0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const timestamps = loadConfTimestamps();
  if (timestamps.length === 0) throw new Error(`empty ${CONF_CSV}`);

  const endMs = timestamps[timestamps.length - 1]! + MS_4H;
  const start4h = timestamps[0]! - WARMUP_4H * MS_4H;
  const start1h = timestamps[0]! - WARMUP_1H * MS_1H;

  console.log(`[checklist-scoring] n=${timestamps.length} days≈${DAYS} fetching klines…`);
  const [near4h, near1h, btc4h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', start4h, endMs),
    fetchKlines(SYMBOL, '1h', start1h, endMs),
    fetchKlines('BTCUSDT', '4h', start4h, endMs),
  ]);
  console.log(
    `[checklist-scoring] near4h=${near4h.length} near1h=${near1h.length} btc4h=${btc4h.length}`,
  );

  const rows: OutRow[] = [];
  const dist = [0, 0, 0, 0, 0];

  for (const ts of timestamps) {
    const win4h = sliceUpTo(near4h, ts);
    const win1h = sliceUpTo(near1h, ts);
    const winBtc4h = sliceUpTo(btc4h, ts);

    const strength = calculateTrendStrength(win4h);
    const trendDirection: TrendDirection = strength.trendDirection;

    const withCtx = evaluateTrendReversalWithContext(
      { klines1H: win1h, trendDirection, symbol: SYMBOL },
      {
        klines4H: win4h.length > 0 ? win4h : undefined,
        btcKlines4H: winBtc4h.length > 0 ? winBtc4h : undefined,
      },
    );

    const cvd = bit(withCtx.signals.cvdFlip);
    const vol = bit(withCtx.signals.volumeConfirmation);
    const exh = bit(withCtx.signals.trendExhaustion);
    const structure = bit(withCtx.signals.structureBreak);

    // RC3 wire quirk: marketContext chỉ gắn khi TR state===ACTIVE.
    const btcRc3 = bit(withCtx.marketContext?.dimensions.btc.pass === true);

    // Scoring experiment: đánh giá BTC dim mỗi nến (giống investigate context).
    const ctxAlways = evaluateMarketContext({
      trendDirection,
      klines4H: win4h.length > 0 ? win4h : undefined,
      btcKlines4H: winBtc4h.length > 0 ? winBtc4h : undefined,
    });
    const btcDim = ctxAlways.dimensions.btc;
    const btc = bit(btcDim.pass === true);
    const btcSkipped = bit(btcDim.skipped === true);

    const score = cvd + vol + btc + exh;
    dist[score] = (dist[score] ?? 0) + 1;

    const and4 = bit(score === 4);
    const ge2 = bit(score >= 2);
    const ge3 = bit(score >= 3);
    const other3 = cvd + vol + btc;
    const exhMustGe2of3 = bit(exh === 1 && other3 >= 2);

    rows.push({
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      cvd_flip: cvd,
      volume_confirm: vol,
      btc_confirm: btc,
      btc_skipped: btcSkipped,
      btc_confirm_rc3_wire: btcRc3,
      exhaustion: exh,
      structure_break: structure,
      score_0_4: score,
      tr_active_legacy_3of4: bit(withCtx.detail.activeConditionCount >= 3),
      tr_state: withCtx.state,
      and4,
      ge2,
      ge3,
      exh_must_plus_ge2of3: exhMustGe2of3,
    });
  }

  const n = rows.length;
  const nAnd4 = rows.filter((r) => r.and4).length;
  const nGe2 = rows.filter((r) => r.ge2).length;
  const nGe3 = rows.filter((r) => r.ge3).length;
  const nExhMust = rows.filter((r) => r.exh_must_plus_ge2of3).length;
  const nCvd = rows.filter((r) => r.cvd_flip).length;
  const nVol = rows.filter((r) => r.volume_confirm).length;
  const nBtc = rows.filter((r) => r.btc_confirm).length;
  const nBtcRc3 = rows.filter((r) => r.btc_confirm_rc3_wire).length;
  const nExh = rows.filter((r) => r.exhaustion).length;
  const nStruct = rows.filter((r) => r.structure_break).length;
  const nTr3 = rows.filter((r) => r.tr_active_legacy_3of4).length;
  const nTrActive = rows.filter((r) => r.tr_state === 'ACTIVE').length;

  const header = [
    'timestamp',
    'timestamp_iso',
    'trendDirection',
    'cvd_flip',
    'volume_confirm',
    'btc_confirm',
    'btc_skipped',
    'btc_confirm_rc3_wire',
    'exhaustion',
    'structure_break',
    'score_0_4',
    'tr_active_legacy_3of4',
    'tr_state',
    'and4',
    'ge2',
    'ge3',
    'exh_must_plus_ge2of3',
  ].join(',');

  const body = rows
    .map((r) =>
      [
        r.timestamp,
        r.timestamp_iso,
        r.trendDirection,
        r.cvd_flip,
        r.volume_confirm,
        r.btc_confirm,
        r.btc_skipped,
        r.btc_confirm_rc3_wire,
        r.exhaustion,
        r.structure_break,
        r.score_0_4,
        r.tr_active_legacy_3of4,
        r.tr_state,
        r.and4,
        r.ge2,
        r.ge3,
        r.exh_must_plus_ge2of3,
      ].join(','),
    )
    .join('\n');

  fs.writeFileSync(OUT_CSV, `${header}\n${body}\n`, 'utf8');

  const summary = {
    symbol: SYMBOL,
    n,
    days: DAYS,
    timeframe: '4H evaluation clock; TR signals on 1H window; BTC dim on 4H',
    checklist_source: 'services/v41/rc3/buildRc3ViewModel.ts (same map as RC3 UI)',
    per_check_pass: {
      cvd_flip: nCvd,
      volume_confirm: nVol,
      btc_confirm_eval_every_bar: nBtc,
      btc_confirm_rc3_wire_only_when_tr_active: nBtcRc3,
      exhaustion: nExh,
      structure_break_not_in_ui: nStruct,
    },
    btc_scoring_note:
      'Score 0–4 uses btc_confirm from evaluateMarketContext every bar. RC3 UI only sets BTC when TR ACTIVE (applyMarketContextFilter early-return).',
    score_distribution: {
      '0': dist[0],
      '1': dist[1],
      '2': dist[2],
      '3': dist[3],
      '4': dist[4],
    },
    alternatives: {
      and4_current_hypothesis: { active: nAnd4, pct: (nAnd4 / n) * 100 },
      score_ge2: { active: nGe2, pct: (nGe2 / n) * 100 },
      score_ge3: { active: nGe3, pct: (nGe3 / n) * 100 },
      exhaustion_must_plus_ge2of3: { active: nExhMust, pct: (nExhMust / n) * 100 },
    },
    note_tr_engine: {
      tr_state_ACTIVE_count: nTrActive,
      tr_legacy_signal_count_ge3: nTr3,
      active_min_signals_in_code: 3,
      ui_checklist_does_not_gate_decision:
        'V41SignalCard allPassed only changes title; LONG/SHORT from decisionEngine',
    },
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md: string[] = [];
  md.push('# REPORT — V4.1 RC3 reversal checklist scoring alternatives (NEAR 30d)');
  md.push('');
  md.push('**Date:** 2026-07-31');
  md.push('**Scope:** V4.1 only — **không** sửa production; script `investigate-v41-reversal-checklist-scoring-30d.ts`');
  md.push(`**Sample:** ${n} nến 4H (timestamps từ \`v41-market-confidence-30d-4h.csv\`) · NEARUSDT`);
  md.push('');
  md.push('## 1. Code — panel 4-check ở đâu?');
  md.push('');
  md.push('| Layer | File | Vai trò |');
  md.push('|-------|------|---------|');
  md.push('| Labels shell | `components/v41/buildRc3Cards.ts` | Chỉ label; `passed: false` cứng — **không** tính thị trường |');
  md.push('| Wire thật | `services/v41/rc3/buildRc3ViewModel.ts` | Map 4 check từ `evaluateTrendReversalWithContext` |');
  md.push('| Render UI | `components/v41/V41SignalCard.tsx` | Hiển thị ✓/✗; `allPassed = checklist.every(c => c.passed)` chỉ đổi tiêu đề |');
  md.push('| Board | `components/v41/V41BoardRC3.tsx` | Dùng cards (shell hoặc wire) |');
  md.push('');
  md.push('### Map 1-1 (nguyên văn wiring)');
  md.push('');
  md.push('```typescript');
  md.push('// services/v41/rc3/buildRc3ViewModel.ts');
  md.push('passed: trendWithContext.signals.cvdFlip,           // CVD Flip');
  md.push('passed: trendWithContext.signals.volumeConfirmation, // Volume Confirm');
  md.push('passed: trendWithContext.marketContext?.dimensions.btc.pass === true, // BTC Confirm');
  md.push('passed: trendWithContext.signals.trendExhaustion,  // Exhaustion');
  md.push('```');
  md.push('');
  md.push('| UI label | Engine field | Nguồn tính |');
  md.push('|----------|--------------|------------|');
  md.push('| CVD Flip | `signals.cvdFlip` | `detectCvdFlip` trong `reversalDetector.ts` (1H, 3 nến CVD proxy) — **không** phải `computeMomentum1H` |');
  md.push('| Volume Confirm | `signals.volumeConfirmation` | `detectTrendReversalVolumeConfirmation` (vol > 1.2× MA20) — **không** phải volume spike Momentum1H 1.5× |');
  md.push('| BTC Confirm | `marketContext.dimensions.btc.pass` | `evaluateBtcMarketContext` (1/5 dim Market Context). **RC3 quirk:** `applyMarketContextFilter` chỉ gắn `marketContext` khi TR `state===ACTIVE` → UI thường ✗ BTC khi TR chưa ACTIVE. Bảng scoring dưới dùng BTC **đánh giá mỗi nến** (độc lập). |');
  md.push('| Exhaustion | `signals.trendExhaustion` | `calculateTrendExhaustion` ≥ 55 (`TREND_REVERSAL_EXHAUSTION_MIN`) trên **1H** |');
  md.push('');
  md.push('**Lưu ý:** TR engine còn signal thứ 4 `structureBreak` — **không** hiện trên checklist RC3 (thay bằng BTC Confirm).');
  md.push('');
  md.push('## 2. AND hay scoring?');
  md.push('');
  md.push('| Cơ chế | Thực tế trong code |');
  md.push('|--------|-------------------|');
  md.push('| Checklist UI 4 ✓ | Hiển thị độc lập; `every(passed)` chỉ đổi title “Checklist điều kiện” / “Thiếu gì” — **không** tự ACTIVE lệnh |');
  md.push('| Trend Reversal ACTIVE (legacy binary) | **≥ 3 / 4** signals TR (`cvdFlip`, `volumeConfirmation`, `trendExhaustion`, `structureBreak`) **và** confidence ≥ 70 — không phải AND-4 UI |');
  md.push('| Continuous TR (flag) | Score 0–1, ACTIVE nếu ≥ 0.6 (NEAR có thể bật theo flag) |');
  md.push('| Decision LONG/SHORT | `computeDecisionEngineResult` trên confidence/eligibility — tách khỏi 4 ✓ UI |');
  md.push('');
  md.push('Giả thuyết “AND-4 mới active lệnh” = **giả thuyết so sánh** trên đúng 4 ô checklist UI (score=4), không phải gate duy nhất trong production.');
  md.push('');
  md.push('## 3. Phân phối từng check (n=179)');
  md.push('');
  md.push('| Check | Pass | % |');
  md.push('|-------|------|---|');
  md.push(`| CVD Flip | ${nCvd} | ${pct(nCvd, n)} |`);
  md.push(`| Volume Confirm | ${nVol} | ${pct(nVol, n)} |`);
  md.push(`| BTC Confirm (eval mỗi nến) | ${nBtc} | ${pct(nBtc, n)} |`);
  md.push(`| BTC Confirm (RC3 wire, chỉ khi TR ACTIVE) | ${nBtcRc3} | ${pct(nBtcRc3, n)} |`);
  md.push(`| Exhaustion (≥55 trên 1H) | ${nExh} | ${pct(nExh, n)} |`);
  md.push(`| *(ref)* structureBreak (không trên UI) | ${nStruct} | ${pct(nStruct, n)} |`);
  md.push('');
  md.push('## 4. Phân phối tổng điểm 0–4');
  md.push('');
  md.push('Score = cvd + volume + **btc_eval** + exhaustion.');
  md.push('');
  md.push('| Score | Số nến | % |');
  md.push('|-------|--------|---|');
  for (let s = 0; s <= 4; s++) {
    md.push(`| ${s} | ${dist[s]} | ${pct(dist[s]!, n)} |`);
  }
  md.push('');
  md.push('## 5. Bảng so sánh phương án scoring (không khuyến nghị)');
  md.push('');
  md.push('| Phương án | Điều kiện | Active (nến) | Tỷ lệ |');
  md.push('|-----------|-----------|--------------|-------|');
  md.push(`| AND-4 (giả thuyết UI đủ 4 ✓) | score = 4 | ${nAnd4} | ${pct(nAnd4, n)} |`);
  md.push(`| Score ≥ 2 | score ≥ 2 | ${nGe2} | ${pct(nGe2, n)} |`);
  md.push(`| Score ≥ 3 | score ≥ 3 | ${nGe3} | ${pct(nGe3, n)} |`);
  md.push(
    `| Exhaustion must + ≥2/3 còn lại | exhaustion=1 **và** (cvd+vol+btc) ≥ 2 | ${nExhMust} | ${pct(nExhMust, n)} |`,
  );
  md.push('');
  md.push('### Tham chiếu engine TR (không phải checklist UI)');
  md.push('');
  md.push(`| Metric | Count | % |`);
  md.push(`|--------|-------|---|`);
  md.push(`| \`tr_state === 'ACTIVE'\` | ${nTrActive} | ${pct(nTrActive, n)} |`);
  md.push(`| legacy signal count ≥ 3 | ${nTr3} | ${pct(nTr3, n)} |`);
  md.push('');
  md.push('## 6. Artefacts');
  md.push('');
  md.push(`- CSV: \`docs/exports/v41-reversal-checklist-scoring-30d-4h.csv\``);
  md.push(`- JSON: \`docs/exports/v41-reversal-checklist-scoring-30d-4h-summary.json\``);
  md.push(`- Script: \`scripts/investigate-v41-reversal-checklist-scoring-30d.ts\``);
  md.push('');
  md.push('**Không sửa** scorer V3/V4, không sửa RC3/TR production trong task này.');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');

  console.log('[checklist-scoring] score dist', dist);
  console.log(
    `[checklist-scoring] and4=${nAnd4} ge2=${nGe2} ge3=${nGe3} exhMust=${nExhMust}`,
  );
  console.log(`[checklist-scoring] wrote ${OUT_CSV}`);
  console.log(`[checklist-scoring] wrote ${OUT_JSON}`);
  console.log(`[checklist-scoring] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

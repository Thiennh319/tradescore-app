/**
 * Investigate detectCvdFlip (TR) vs Momentum1H CVD — NEAR 30d, 179 4H clocks.
 * Report-only — no production changes.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/investigate-v41-cvd-flip-threshold-30d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import { detectCvdFlip } from '../services/v41/reversalDetector';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const WARMUP_4H = 220;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 200;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;

const CONF_CSV = path.resolve(__dirname, '../docs/exports/v41-market-confidence-30d-4h.csv');
const OUT_CSV = path.resolve(__dirname, '../docs/exports/v41-cvd-flip-threshold-investigation-30d.csv');
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-cvd-flip-threshold-investigation-30d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_CVD_FLIP_THRESHOLD_INVESTIGATION_2026-08-01.md',
);

/** Same formula as private cvdProxy in reversalDetector.ts */
function cvdProxy(kline: KlineV41): number {
  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);
}

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

function pct(n: number, d: number): string {
  if (d <= 0) return '0.0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - pos) + sorted[hi]! * (pos - lo);
}

function distStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n === 0 ? NaN : sorted.reduce((s, v) => s + v, 0) / n;
  return {
    n,
    min: sorted[0] ?? NaN,
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    mean,
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted[n - 1] ?? NaN,
  };
}

function fmtDist(d: ReturnType<typeof distStats>): string {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
  return `n=${d.n} min=${f(d.min)} p25=${f(d.p25)} med=${f(d.median)} mean=${f(d.mean)} p75=${f(d.p75)} p90=${f(d.p90)} max=${f(d.max)}`;
}

type FailReason =
  | 'PASS'
  | 'NEUTRAL'
  | 'SHORT_WINDOW'
  | 'NO_PRIOR_SAME_SIGN'
  | 'NO_FLIP_ON_LAST'
  | 'WRONG_FLIP_DIRECTION';

type Row = {
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  cvd0: number;
  cvd1: number;
  cvd2: number;
  priorAvg: number;
  flipMag: number;
  /** Signed distance of last CVD past 0 in the required flip direction (negative = wrong side). */
  last_signed_vs_required: number;
  cvd_flip: 0 | 1;
  fail_reason: FailReason;
  mom_rising: 0 | 1;
  mom_falling: 0 | 1;
  alt_priorAvg_vs_c: 0 | 1;
  alt_ab_or_flip: 0 | 1;
  alt_eps_p25: 0 | 1;
};

async function main(): Promise<void> {
  const timestamps = loadConfTimestamps();
  if (timestamps.length === 0) throw new Error(`empty ${CONF_CSV}`);

  const endMs = timestamps[timestamps.length - 1]! + MS_4H;
  const start4h = timestamps[0]! - WARMUP_4H * MS_4H;
  const start1h = timestamps[0]! - WARMUP_1H * MS_1H;

  console.log(`[cvd-flip] n=${timestamps.length} fetching…`);
  const [near4h, near1h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', start4h, endMs),
    fetchKlines(SYMBOL, '1h', start1h, endMs),
  ]);
  console.log(`[cvd-flip] near4h=${near4h.length} near1h=${near1h.length}`);

  const rows: Row[] = [];

  for (const ts of timestamps) {
    const win4h = sliceUpTo(near4h, ts);
    const win1h = sliceUpTo(near1h, ts);
    const trendDirection = calculateTrendStrength(win4h).trendDirection;

    let cvd0 = 0;
    let cvd1 = 0;
    let cvd2 = 0;
    let priorAvg = 0;
    let flipMag = 0;
    let last_signed_vs_required = NaN;
    let fail: FailReason = 'SHORT_WINDOW';
    let flip = false;

    if (win1h.length >= 3) {
      const last3 = win1h.slice(-3);
      cvd0 = cvdProxy(last3[0]!);
      cvd1 = cvdProxy(last3[1]!);
      cvd2 = cvdProxy(last3[2]!);
      priorAvg = (cvd0 + cvd1) / 2;
      flipMag = Math.abs(cvd2 - priorAvg);

      flip = detectCvdFlip(win1h, trendDirection);

      if (trendDirection === 'NEUTRAL') {
        fail = 'NEUTRAL';
        last_signed_vs_required = NaN;
      } else if (trendDirection === 'BULL') {
        // Required: a>0, b>0, c<0 — measure how far c is into the required half-plane
        last_signed_vs_required = -cvd2; // >0 means c is negative (good for BULL flip)
        if (flip) fail = 'PASS';
        else if (!(cvd0 > 0 && cvd1 > 0)) fail = 'NO_PRIOR_SAME_SIGN';
        else if (!(cvd2 < 0)) fail = 'NO_FLIP_ON_LAST';
        else fail = 'WRONG_FLIP_DIRECTION';
      } else {
        // BEAR: a<0, b<0, c>0
        last_signed_vs_required = cvd2; // >0 means c positive (good for BEAR flip)
        if (flip) fail = 'PASS';
        else if (!(cvd0 < 0 && cvd1 < 0)) fail = 'NO_PRIOR_SAME_SIGN';
        else if (!(cvd2 > 0)) fail = 'NO_FLIP_ON_LAST';
        else fail = 'WRONG_FLIP_DIRECTION';
      }
    }

    // Momentum1H-style (continuation, no trendDirection)
    const mom_rising = win1h.length >= 3 && cvd0 > 0 && cvd1 > 0 && cvd2 > 0 ? 1 : 0;
    const mom_falling = win1h.length >= 3 && cvd0 < 0 && cvd1 < 0 && cvd2 < 0 ? 1 : 0;

    // Alt patterns (data-driven relaxations — not production)
    let alt_priorAvg_vs_c = 0;
    let alt_ab_or_flip = 0;
    if (trendDirection === 'BULL') {
      alt_priorAvg_vs_c = priorAvg > 0 && cvd2 < 0 ? 1 : 0;
      alt_ab_or_flip = (cvd0 > 0 || cvd1 > 0) && cvd2 < 0 ? 1 : 0;
    } else if (trendDirection === 'BEAR') {
      alt_priorAvg_vs_c = priorAvg < 0 && cvd2 > 0 ? 1 : 0;
      alt_ab_or_flip = (cvd0 < 0 || cvd1 < 0) && cvd2 > 0 ? 1 : 0;
    }

    rows.push({
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      cvd0,
      cvd1,
      cvd2,
      priorAvg,
      flipMag,
      last_signed_vs_required,
      cvd_flip: flip ? 1 : 0,
      fail_reason: fail,
      mom_rising: mom_rising as 0 | 1,
      mom_falling: mom_falling as 0 | 1,
      alt_priorAvg_vs_c: alt_priorAvg_vs_c as 0 | 1,
      alt_ab_or_flip: alt_ab_or_flip as 0 | 1,
      alt_eps_p25: 0, // filled after we know |cvd| p25 on directed bars
    });
  }

  const n = rows.length;
  const directed = rows.filter((r) => r.trendDirection !== 'NEUTRAL');
  const passes = rows.filter((r) => r.cvd_flip === 1);

  // |cvd| on last bar among directed — for epsilon deadband sweep
  const absCvd2Directed = directed.map((r) => Math.abs(r.cvd2));
  const absCvd2Dist = distStats(absCvd2Directed);
  const epsCandidates = [
    0,
    absCvd2Dist.p25,
    absCvd2Dist.median,
    absCvd2Dist.p75,
  ].map((v) => (Number.isFinite(v) ? v : 0));

  // Fill alt_eps_p25 using p25 deadband on current pattern
  const epsP25 = absCvd2Dist.p25;
  for (const r of rows) {
    if (r.trendDirection === 'BULL') {
      r.alt_eps_p25 =
        r.cvd0 > epsP25 && r.cvd1 > epsP25 && r.cvd2 < -epsP25 ? 1 : 0;
    } else if (r.trendDirection === 'BEAR') {
      r.alt_eps_p25 =
        r.cvd0 < -epsP25 && r.cvd1 < -epsP25 && r.cvd2 > epsP25 ? 1 : 0;
    }
  }

  // Epsilon sweep: stricter deadband around 0 (same pattern, require |x| > eps)
  const epsSweep = epsCandidates.map((eps) => {
    let pass = 0;
    for (const r of directed) {
      if (r.trendDirection === 'BULL') {
        if (r.cvd0 > eps && r.cvd1 > eps && r.cvd2 < -eps) pass++;
      } else if (r.trendDirection === 'BEAR') {
        if (r.cvd0 < -eps && r.cvd1 < -eps && r.cvd2 > eps) pass++;
      }
    }
    return { eps, label: eps === 0 ? 'eps=0 (production)' : `eps≈${eps.toFixed(2)}`, pass, pct: (pass / n) * 100 };
  });

  // Pattern relaxation sweep (no magnitude invent)
  const patternSweep = [
    {
      id: 'production_flip',
      desc: 'BULL: a>0∧b>0∧c<0 · BEAR: a<0∧b<0∧c>0 (hiện tại)',
      pass: passes.length,
    },
    {
      id: 'priorAvg_vs_c',
      desc: 'BULL: priorAvg>0∧c<0 · BEAR: priorAvg<0∧c>0 (bỏ yêu cầu cả a và b cùng dấu)',
      pass: rows.filter((r) => r.alt_priorAvg_vs_c === 1).length,
    },
    {
      id: 'any_prior_vs_c',
      desc: 'BULL: (a>0∨b>0)∧c<0 · BEAR: (a<0∨b<0)∧c>0',
      pass: rows.filter((r) => r.alt_ab_or_flip === 1).length,
    },
    {
      id: 'deadband_p25',
      desc: `Production pattern + |cvd|>p25(|cvd2| directed)=${epsP25.toFixed(2)}`,
      pass: rows.filter((r) => r.alt_eps_p25 === 1).length,
    },
  ];

  const failCounts: Record<string, number> = {};
  for (const r of rows) {
    failCounts[r.fail_reason] = (failCounts[r.fail_reason] ?? 0) + 1;
  }
  const failCountsDirected: Record<string, number> = {};
  for (const r of directed) {
    failCountsDirected[r.fail_reason] = (failCountsDirected[r.fail_reason] ?? 0) + 1;
  }

  const cvd2All = distStats(rows.map((r) => r.cvd2));
  const cvd2Dir = distStats(directed.map((r) => r.cvd2));
  const flipMagAll = distStats(rows.map((r) => r.flipMag));
  const flipMagPass = distStats(passes.map((r) => r.flipMag));
  const lastSignedPass = distStats(
    passes.map((r) => r.last_signed_vs_required).filter((v) => Number.isFinite(v)),
  );
  const lastSignedDir = distStats(
    directed.map((r) => r.last_signed_vs_required).filter((v) => Number.isFinite(v)),
  );
  const absCvd2Pass = distStats(passes.map((r) => Math.abs(r.cvd2)));

  // How often CVD proxy crosses both sides of 0 (feasibility of threshold=0)
  const cvd2Pos = rows.filter((r) => r.cvd2 > 0).length;
  const cvd2Neg = rows.filter((r) => r.cvd2 < 0).length;
  const cvd2Zero = rows.filter((r) => r.cvd2 === 0).length;

  const nMomRise = rows.filter((r) => r.mom_rising).length;
  const nMomFall = rows.filter((r) => r.mom_falling).length;
  const nMomEither = rows.filter((r) => r.mom_rising || r.mom_falling).length;

  const header = [
    'timestamp',
    'timestamp_iso',
    'trendDirection',
    'cvd0',
    'cvd1',
    'cvd2',
    'priorAvg',
    'flipMag',
    'last_signed_vs_required',
    'cvd_flip',
    'fail_reason',
    'mom_rising',
    'mom_falling',
    'alt_priorAvg_vs_c',
    'alt_ab_or_flip',
    'alt_eps_p25',
  ].join(',');
  const body = rows
    .map((r) =>
      [
        r.timestamp,
        r.timestamp_iso,
        r.trendDirection,
        r.cvd0,
        r.cvd1,
        r.cvd2,
        r.priorAvg,
        r.flipMag,
        Number.isFinite(r.last_signed_vs_required) ? r.last_signed_vs_required : '',
        r.cvd_flip,
        r.fail_reason,
        r.mom_rising,
        r.mom_falling,
        r.alt_priorAvg_vs_c,
        r.alt_ab_or_flip,
        r.alt_eps_p25,
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(OUT_CSV, `${header}\n${body}\n`, 'utf8');

  const summary = {
    symbol: SYMBOL,
    n,
    n_nonNeutral: directed.length,
    n_cvd_flip_pass: passes.length,
    pct_pass: (passes.length / n) * 100,
    threshold_verdict: {
      type: 'sign_pattern_vs_zero',
      numeric_magnitude_threshold: null,
      comparison: 'cvdProxy(a,b,c) compared to 0 (strict >, <)',
      feasible: true,
      reason:
        'Unlike Exhaustion≥55, detectCvdFlip has no magnitude floor — only sign pattern. Threshold 0 is inside observed range (cvd2 takes both + and −).',
      rarity_drivers: [
        'trendDirection===NEUTRAL → always false',
        'Requires exact 3-candle flip (++- or --+), not continuation',
        'Direction-locked to trend (BULL only bearish flip, BEAR only bullish flip)',
      ],
    },
    fail_reason_all: failCounts,
    fail_reason_directed: failCountsDirected,
    dist_cvd2_all: cvd2All,
    dist_cvd2_directed: cvd2Dir,
    dist_abs_cvd2_directed: absCvd2Dist,
    dist_abs_cvd2_pass: absCvd2Pass,
    dist_flipMag_all: flipMagAll,
    dist_flipMag_pass: flipMagPass,
    dist_last_signed_vs_required_directed: lastSignedDir,
    dist_last_signed_vs_required_pass: lastSignedPass,
    cvd2_sign_counts: { pos: cvd2Pos, neg: cvd2Neg, zero: cvd2Zero },
    momentum1h_continuation: {
      rising_all_pos: nMomRise,
      falling_all_neg: nMomFall,
      either: nMomEither,
    },
    pattern_sweep: patternSweep,
    eps_deadband_sweep: epsSweep,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md: string[] = [];
  md.push('# REPORT — V4.1 CVD Flip threshold investigation (NEAR 30d)');
  md.push('');
  md.push('**Date:** 2026-08-01');
  md.push('**Scope:** V4.1 only — điều tra `detectCvdFlip` (TR); **không** sửa production / không chọn ngưỡng');
  md.push(`**n:** ${n} · non-neutral: ${directed.length} · cvdFlip pass: **${passes.length}** (${pct(passes.length, n)})`);
  md.push('');
  md.push('## Bước 1 — Trích dẫn nguyên văn');
  md.push('');
  md.push('### `detectCvdFlip` (`services/v41/reversalDetector.ts`)');
  md.push('');
  md.push('```ts');
  md.push('function cvdProxy(kline: KlineV41): number {');
  md.push('  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);');
  md.push('}');
  md.push('');
  md.push('/** CVD flip — đổi chiều rõ ràng trên 3 nến cuối.');
  md.push(' *  BULL (đảo bearish): dương → dương → âm.');
  md.push(' *  BEAR (đảo bullish): âm → âm → dương.');
  md.push(' */');
  md.push('export function detectCvdFlip(');
  md.push('  klines: KlineV41[],');
  md.push('  trendDirection: TrendDirection,');
  md.push('): boolean {');
  md.push("  if (klines.length < 3 || trendDirection === 'NEUTRAL') return false;");
  md.push('  const last3 = klines.slice(-3).map(cvdProxy);');
  md.push('  const [a, b, c] = last3;');
  md.push("  if (trendDirection === 'BULL') {");
  md.push('    return a > 0 && b > 0 && c < 0;');
  md.push('  }');
  md.push('  return a < 0 && b < 0 && c > 0;');
  md.push('}');
  md.push('```');
  md.push('');
  md.push('### Điều kiện confirmed');
  md.push('');
  md.push('| Yếu tố | Chi tiết |');
  md.push('|--------|----------|');
  md.push('| CVD proxy | `takerBuyVolume - (volume - takerBuyVolume)` = `2*takerBuy − volume` |');
  md.push('| Cửa sổ | **3 nến 1H cuối** `[a,b,c]` |');
  md.push('| Ngưỡng số magnitude | **Không có** — chỉ so sánh dấu với **0** (`>` / `<`) |');
  md.push('| `trendDirection` | **Có** — `NEUTRAL` → luôn `false`; BULL chỉ nhận flip bearish; BEAR chỉ nhận flip bullish |');
  md.push('');
  md.push(
    '**Khác Exhaustion:** không tồn tại floor kiểu `≥ 55`. “Ngưỡng” duy nhất là **0** (ranh giới dấu).',
  );
  md.push('');
  md.push('### So sánh Momentum1H (`momentumEngine1H.ts`)');
  md.push('');
  md.push('```ts');
  md.push('// Momentum — continuation, KHÔNG nhận trendDirection');
  md.push('function detectCvdRising(klines): boolean {');
  md.push('  return lastThree.every((k) => computeCvd(k) > 0); // +++');
  md.push('}');
  md.push('function detectCvdFalling(klines): boolean {');
  md.push('  return lastThree.every((k) => computeCvd(k) < 0); // ---');
  md.push('}');
  md.push('```');
  md.push('');
  md.push('| | TR `detectCvdFlip` | Momentum `detectCvdRising/Falling` |');
  md.push('|---|--------------------|-------------------------------------|');
  md.push('| Pattern | **Flip** `++-` hoặc `--+` | **Continuation** `+++` hoặc `---` |');
  md.push('| `trendDirection` | Bắt buộc (lock hướng) | Không dùng |');
  md.push('| Proxy | `cvdProxy` (cùng ý 2×buy−vol) | `computeCvd` (cùng dạng) |');
  md.push('| Lookback | 3 nến 1H | 3 nến 1H |');
  md.push(
    `| Pass trên mẫu này | ${passes.length}/${n} | rising ${nMomRise} + falling ${nMomFall} (either ${nMomEither}) |`,
  );
  md.push('');
  md.push('## Bước 2 — Phân phối giá trị thô (so sánh với ngưỡng 0)');
  md.push('');
  md.push('Biểu thức so sánh: `a ? 0`, `b ? 0`, `c ? 0`. Đo `cvd2` (=c), `|cvd2|`, `flipMag=|c−(a+b)/2|`, và `last_signed_vs_required` (độ sâu vào nửa mặt phẳng đúng hướng flip).');
  md.push('');
  md.push('### `cvd2` (CVD proxy nến cuối)');
  md.push('');
  md.push(`- All n=179: ${fmtDist(cvd2All)}`);
  md.push(`- Non-neutral: ${fmtDist(cvd2Dir)}`);
  md.push(`- Dấu cvd2: + ${cvd2Pos} · − ${cvd2Neg} · 0 ${cvd2Zero}`);
  md.push('');
  md.push('### `|cvd2|`');
  md.push('');
  md.push(`- Directed: ${fmtDist(absCvd2Dist)}`);
  md.push(`- Pass only: ${fmtDist(absCvd2Pass)}`);
  md.push('');
  md.push('### `flipMag = |c − (a+b)/2|` (cùng đại lượng dùng trong score CVD sau confirm)');
  md.push('');
  md.push(`- All: ${fmtDist(flipMagAll)}`);
  md.push(`- Pass: ${fmtDist(flipMagPass)}`);
  md.push('');
  md.push('### `last_signed_vs_required` (>0 = nến cuối đúng phía flip)');
  md.push('');
  md.push(`- Directed: ${fmtDist(lastSignedDir)}`);
  md.push(`- Pass: ${fmtDist(lastSignedPass)}`);
  md.push('');
  md.push('### Verdict khả thi của ngưỡng 0');
  md.push('');
  md.push(
    `- **Khả thi:** cvd2 quan sát được **cả hai phía** của 0 (min=${cvd2All.min.toFixed(2)}, max=${cvd2All.max.toFixed(2)}).`,
  );
  md.push(
    '- **Không** cùng lỗi Exhaustion cũ (ngưỡng > max quan sát). Max `|cvd2|` >> 0.',
  );
  md.push('- Tần suất thấp đến từ **pattern + direction lock**, không từ floor magnitude bất khả thi.');
  md.push('');
  md.push('### Failure taxonomy');
  md.push('');
  md.push('| Lý do | n=179 | non-neutral |');
  md.push('|-------|-------|-------------|');
  const reasons = [
    'PASS',
    'NEUTRAL',
    'NO_PRIOR_SAME_SIGN',
    'NO_FLIP_ON_LAST',
    'WRONG_FLIP_DIRECTION',
    'SHORT_WINDOW',
  ];
  for (const reason of reasons) {
    md.push(
      `| ${reason} | ${failCounts[reason] ?? 0} | ${failCountsDirected[reason] ?? 0} |`,
    );
  }
  md.push('');
  md.push('## Bước 3 — Sweep thay thế (không chọn / không sửa production)');
  md.push('');
  md.push(
    'Vì không có floor magnitude để “hạ”, sweep tập trung vào **nới pattern** (dựa trên phân phối thật) và **deadband** quanh 0.',
  );
  md.push('');
  md.push('### Pattern sweep');
  md.push('');
  md.push('| Phương án | Điều kiện | Pass (n=179) | % |');
  md.push('|-----------|-----------|--------------|---|');
  for (const p of patternSweep) {
    md.push(`| ${p.id} | ${p.desc} | ${p.pass} | ${pct(p.pass, n)} |`);
  }
  md.push('');
  md.push('### Deadband epsilon sweep (giữ pattern production, yêu cầu `|cvd| > eps`)');
  md.push('');
  md.push('| eps | Pass directed-pattern | % of n=179 |');
  md.push('|-----|----------------------|------------|');
  for (const e of epsSweep) {
    md.push(`| ${e.label} | ${e.pass} | ${e.pct.toFixed(1)}% |`);
  }
  md.push('');
  md.push(
    `eps ứng viên lấy từ phân phối \`|cvd2|\` directed: 0, p25=${absCvd2Dist.p25.toFixed(2)}, median=${absCvd2Dist.median.toFixed(2)}, p75=${absCvd2Dist.p75.toFixed(2)}.`,
  );
  md.push('');
  md.push('## Kết luận điều tra (không phải khuyến nghị production)');
  md.push('');
  md.push(
    '1. `detectCvdFlip` **không** có ngưỡng magnitude bất khả thi kiểu Exhaustion≥55.',
  );
  md.push(
    '2. Confirmed = pattern dấu 3 nến + khớp `trendDirection`; ngưỡng so sánh = **0**.',
  );
  md.push(
    `3. Pass ${passes.length}/${n} chủ yếu do pattern flip hiếm + ${failCounts['NEUTRAL'] ?? 0} nến NEUTRAL bị loại + ${(failCountsDirected['NO_PRIOR_SAME_SIGN'] ?? 0)} directed thiếu prior cùng dấu.`,
  );
  md.push('4. Không chọn mốc thay thế trong task này.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-cvd-flip-threshold-investigation-30d.csv`');
  md.push('- `docs/exports/v41-cvd-flip-threshold-investigation-30d-summary.json`');
  md.push('- `scripts/investigate-v41-cvd-flip-threshold-30d.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        pass: passes.length,
        failCounts,
        patternSweep,
        epsSweep,
        cvd2All,
        absCvd2Dist,
      },
      null,
      2,
    ),
  );
  console.log(`[cvd-flip] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

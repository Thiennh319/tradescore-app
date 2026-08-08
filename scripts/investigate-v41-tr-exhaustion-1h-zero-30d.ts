/**
 * V4.1 — vì sao TR Exhaustion check (1H ≥ 55) = 0/179 trên NEAR 30d?
 * So sánh calculateTrendExhaustion trên 1H vs 4H cùng timestamps.
 * Không sửa production / ngưỡng.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/investigate-v41-tr-exhaustion-1h-zero-30d.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
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
const TR_EXH_MIN = 55; // mirror TREND_REVERSAL_EXHAUSTION_MIN — do not import private const

const CONF_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-market-confidence-30d-4h.csv',
);
const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-tr-exhaustion-1h-vs-4h-30d.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-tr-exhaustion-1h-vs-4h-30d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_TR_EXHAUSTION_1H_ZERO_INVESTIGATION_2026-07-31.md',
);

type Row = {
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  exh_1h: number;
  rsi_1h: number;
  dist_1h: number;
  volDiv_1h: number;
  streak_1h: number;
  ge55_1h: 0 | 1;
  exh_4h: number;
  rsi_4h: number;
  dist_4h: number;
  volDiv_4h: number;
  streak_4h: number;
  ge55_4h: 0 | 1;
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
    if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
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

function loadTimestamps(): number[] {
  const lines = fs.readFileSync(CONF_CSV, 'utf8').trim().split(/\r?\n/).slice(1);
  return lines
    .map((l) => Number(l.split(',')[0]))
    .filter((t) => Number.isFinite(t));
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function distStats(vals: number[]): Record<string, number> {
  if (vals.length === 0) {
    return { n: 0, min: 0, p25: 0, median: 0, mean: 0, p75: 0, p90: 0, max: 0 };
  }
  const s = [...vals].sort((a, b) => a - b);
  const n = s.length;
  const q = (p: number) => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return s[lo]!;
    return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
  };
  const mean = s.reduce((a, b) => a + b, 0) / n;
  return {
    n,
    min: s[0]!,
    p25: q(0.25),
    median: q(0.5),
    mean,
    p75: q(0.75),
    p90: q(0.9),
    max: s[n - 1]!,
  };
}

function pct(n: number, d: number): string {
  return d <= 0 ? '0.0%' : `${((n / d) * 100).toFixed(1)}%`;
}

function countNonZero(vals: number[]): number {
  return vals.filter((v) => v > 0).length;
}

async function main(): Promise<void> {
  const timestamps = loadTimestamps();
  const endMs = timestamps[timestamps.length - 1]! + MS_4H;
  const start4h = timestamps[0]! - WARMUP_4H * MS_4H;
  const start1h = timestamps[0]! - WARMUP_1H * MS_1H;

  console.log(`[exh-1h] n=${timestamps.length} fetching…`);
  const [near4h, near1h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', start4h, endMs),
    fetchKlines(SYMBOL, '1h', start1h, endMs),
  ]);
  console.log(`[exh-1h] near4h=${near4h.length} near1h=${near1h.length}`);

  const rows: Row[] = [];
  let neutralDir = 0;

  for (const ts of timestamps) {
    const win4h = sliceUpTo(near4h, ts);
    const win1h = sliceUpTo(near1h, ts);
    const strength = calculateTrendStrength(win4h);
    const trendDirection: TrendDirection = strength.trendDirection;
    if (trendDirection === 'NEUTRAL') neutralDir += 1;

    const e1 = calculateTrendExhaustion(win1h, trendDirection);
    const e4 = calculateTrendExhaustion(win4h, trendDirection);

    rows.push({
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      exh_1h: e1.trendExhaustion,
      rsi_1h: e1.rsiExtremeScore,
      dist_1h: e1.distanceEMA20Score,
      volDiv_1h: e1.volumeDivergencePts,
      streak_1h: e1.candleStreakScore,
      ge55_1h: e1.trendExhaustion >= TR_EXH_MIN ? 1 : 0,
      exh_4h: e4.trendExhaustion,
      rsi_4h: e4.rsiExtremeScore,
      dist_4h: e4.distanceEMA20Score,
      volDiv_4h: e4.volumeDivergencePts,
      streak_4h: e4.candleStreakScore,
      ge55_4h: e4.trendExhaustion >= TR_EXH_MIN ? 1 : 0,
    });
  }

  const n = rows.length;
  const exh1 = rows.map((r) => r.exh_1h);
  const exh4 = rows.map((r) => r.exh_4h);
  const s1 = distStats(exh1);
  const s4 = distStats(exh4);
  const nGe55_1 = rows.filter((r) => r.ge55_1h).length;
  const nGe55_4 = rows.filter((r) => r.ge55_4h).length;

  // Among non-NEUTRAL only (TR signals require BULL/BEAR)
  const directed = rows.filter((r) => r.trendDirection !== 'NEUTRAL');
  const s1dir = distStats(directed.map((r) => r.exh_1h));
  const nGe55_1dir = directed.filter((r) => r.ge55_1h).length;

  const component1 = {
    rsi_nonzero: countNonZero(rows.map((r) => r.rsi_1h)),
    dist_nonzero: countNonZero(rows.map((r) => r.dist_1h)),
    volDiv_nonzero: countNonZero(rows.map((r) => r.volDiv_1h)),
    streak_nonzero: countNonZero(rows.map((r) => r.streak_1h)),
    rsi_max: Math.max(...rows.map((r) => r.rsi_1h), 0),
    dist_max: Math.max(...rows.map((r) => r.dist_1h), 0),
    volDiv_max: Math.max(...rows.map((r) => r.volDiv_1h), 0),
    streak_max: Math.max(...rows.map((r) => r.streak_1h), 0),
    rsi_dist: distStats(rows.map((r) => r.rsi_1h)),
    dist_dist: distStats(rows.map((r) => r.dist_1h)),
    volDiv_dist: distStats(rows.map((r) => r.volDiv_1h)),
    streak_dist: distStats(rows.map((r) => r.streak_1h)),
  };
  const component4 = {
    rsi_nonzero: countNonZero(rows.map((r) => r.rsi_4h)),
    dist_nonzero: countNonZero(rows.map((r) => r.dist_4h)),
    volDiv_nonzero: countNonZero(rows.map((r) => r.volDiv_4h)),
    streak_nonzero: countNonZero(rows.map((r) => r.streak_4h)),
    rsi_max: Math.max(...rows.map((r) => r.rsi_4h), 0),
    dist_max: Math.max(...rows.map((r) => r.dist_4h), 0),
    volDiv_max: Math.max(...rows.map((r) => r.volDiv_4h), 0),
    streak_max: Math.max(...rows.map((r) => r.streak_4h), 0),
  };

  const header = [
    'timestamp',
    'timestamp_iso',
    'trendDirection',
    'exh_1h',
    'rsi_1h',
    'dist_1h',
    'volDiv_1h',
    'streak_1h',
    'ge55_1h',
    'exh_4h',
    'rsi_4h',
    'dist_4h',
    'volDiv_4h',
    'streak_4h',
    'ge55_4h',
  ].join(',');
  const body = rows
    .map((r) =>
      [
        r.timestamp,
        r.timestamp_iso,
        r.trendDirection,
        r.exh_1h,
        r.rsi_1h,
        r.dist_1h,
        r.volDiv_1h,
        r.streak_1h,
        r.ge55_1h,
        r.exh_4h,
        r.rsi_4h,
        r.dist_4h,
        r.volDiv_4h,
        r.streak_4h,
        r.ge55_4h,
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(OUT_CSV, `${header}\n${body}\n`, 'utf8');

  const conclusion =
    nGe55_1 === 0 && s1.max < TR_EXH_MIN
      ? 'PHENOMENON'
      : nGe55_1 === 0 && s1.max >= TR_EXH_MIN
        ? 'LOGIC_BUG_UNEXPECTED'
        : 'MIXED';

  const summary = {
    symbol: SYMBOL,
    n,
    threshold: TR_EXH_MIN,
    code_path: {
      constant: 'TREND_REVERSAL_EXHAUSTION_MIN = 55 in services/v41/reversalDetector.ts',
      call: 'calculateTrendExhaustion(klines1H, trendDirection) — confirmed 1H param name',
      mi_contrast: 'marketIntelligenceLayer uses calculateTrendExhaustion(klines4H, …)',
      signal: 'signals.trendExhaustion = exhaustion.trendExhaustion >= 55',
    },
    dist_1h: s1,
    dist_4h: s4,
    dist_1h_nonNeutral: s1dir,
    ge55_1h: nGe55_1,
    ge55_4h: nGe55_4,
    ge55_1h_nonNeutral: nGe55_1dir,
    neutralDirectionBars: neutralDir,
    component_1h: component1,
    component_4h: component4,
    conclusion,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md: string[] = [];
  md.push('# REPORT — V4.1 TR Exhaustion 1H always-zero investigation (NEAR 30d)');
  md.push('');
  md.push('**Date:** 2026-07-31');
  md.push('**Scope:** V4.1 only — không sửa production / ngưỡng');
  md.push(`**Sample:** ${n} timestamps 4H (cùng CSV confidence) · NEARUSDT`);
  md.push('');
  md.push('## 1. Code — không phát hiện truyền sai khung');
  md.push('');
  md.push('### Constant');
  md.push('');
  md.push('```typescript');
  md.push('// services/v41/reversalDetector.ts (~L89)');
  md.push('const TREND_REVERSAL_EXHAUSTION_MIN = 55;');
  md.push('```');
  md.push('');
  md.push('Không có comment giải thích đơn vị ngoài ngữ cảnh điểm 0–100 của Engine 2.');
  md.push('');
  md.push('### Gọi hàm (TR)');
  md.push('');
  md.push('```typescript');
  md.push('// services/v41/reversalDetector.ts computeTrendReversal');
  md.push('const exhaustion = calculateTrendExhaustion(klines1H, trendDirection);');
  md.push('// ...');
  md.push('trendExhaustion: exhaustion.trendExhaustion >= TREND_REVERSAL_EXHAUSTION_MIN,');
  md.push('```');
  md.push('');
  md.push('Tham số đầu tiên là **`klines1H`** (đúng tên / đúng nguồn từ scan/RC3). **Không** thấy nhầm truyền 4H vào TR gate.');
  md.push('');
  md.push('### Đối chứng Market Intelligence (4H)');
  md.push('');
  md.push('```typescript');
  md.push('// services/v41/marketIntelligenceLayer.ts');
  md.push('const engine2 = calculateTrendExhaustion(klines4H, trendDirection);');
  md.push('```');
  md.push('');
  md.push('→ Phân phối exhaustion max≈70 trên báo cáo confidence 30d là **4H**, trong khi checklist TR dùng **1H**.');
  md.push('');
  md.push('### trendDirection');
  md.push('');
  md.push('TR nhận `trendDirection` từ caller (RC3: `row.snapshot.trendDirection` = Engine 1 trên **4H**). Script này tái hiện: `calculateTrendStrength(win4h).trendDirection` rồi truyền vào `calculateTrendExhaustion(win1h, trendDirection)`.');
  md.push('');
  md.push('`volumeDivergence` chỉ +20 khi BULL+newHigh hoặc BEAR+newLow; nếu NEUTRAL → luôn 0 (by design). NEUTRAL bars trong sample: **' +
    String(neutralDir) +
    '**.');
  md.push('');
  md.push('## 2. Phân phối đo được');
  md.push('');
  md.push('### TrendExhaustion tổng — 1H vs 4H (cùng 179 clock)');
  md.push('');
  md.push('| | 1H (TR gate) | 4H (MI) |');
  md.push('|--|-------------|---------|');
  md.push(`| n | ${s1.n} | ${s4.n} |`);
  md.push(`| min | ${s1.min} | ${s4.min} |`);
  md.push(`| p25 | ${s1.p25.toFixed(1)} | ${s4.p25.toFixed(1)} |`);
  md.push(`| median | ${s1.median.toFixed(1)} | ${s4.median.toFixed(1)} |`);
  md.push(`| mean | ${s1.mean.toFixed(2)} | ${s4.mean.toFixed(2)} |`);
  md.push(`| p75 | ${s1.p75.toFixed(1)} | ${s4.p75.toFixed(1)} |`);
  md.push(`| p90 | ${s1.p90.toFixed(1)} | ${s4.p90.toFixed(1)} |`);
  md.push(`| max | ${s1.max} | ${s4.max} |`);
  md.push(`| ≥55 | **${nGe55_1}** (${pct(nGe55_1, n)}) | **${nGe55_4}** (${pct(nGe55_4, n)}) |`);
  md.push('');
  md.push(`Chỉ nến non-NEUTRAL (n=${directed.length}): 1H max=${s1dir.max}, ≥55 = ${nGe55_1dir}.`);
  md.push('');
  md.push('### Sub-components 1H (điểm từng phần)');
  md.push('');
  md.push('| Component | max | #bars > 0 | median | p90 |');
  md.push('|-----------|-----|-----------|--------|-----|');
  md.push(
    `| RSI Extreme (0–30) | ${component1.rsi_max} | ${component1.rsi_nonzero} | ${component1.rsi_dist.median} | ${component1.rsi_dist.p90.toFixed(1)} |`,
  );
  md.push(
    `| Distance EMA20 (0–30) | ${component1.dist_max} | ${component1.dist_nonzero} | ${component1.dist_dist.median} | ${component1.dist_dist.p90.toFixed(1)} |`,
  );
  md.push(
    `| Volume Divergence (0/20) | ${component1.volDiv_max} | ${component1.volDiv_nonzero} | ${component1.volDiv_dist.median} | ${component1.volDiv_dist.p90.toFixed(1)} |`,
  );
  md.push(
    `| Candle Streak (0/20) | ${component1.streak_max} | ${component1.streak_nonzero} | ${component1.streak_dist.median} | ${component1.streak_dist.p90.toFixed(1)} |`,
  );
  md.push('');
  md.push('### Sub-components 4H (tham chiếu)');
  md.push('');
  md.push('| Component | max | #bars > 0 |');
  md.push('|-----------|-----|-----------|');
  md.push(`| RSI | ${component4.rsi_max} | ${component4.rsi_nonzero} |`);
  md.push(`| Dist EMA20 | ${component4.dist_max} | ${component4.dist_nonzero} |`);
  md.push(`| Vol Div | ${component4.volDiv_max} | ${component4.volDiv_nonzero} |`);
  md.push(`| Streak | ${component4.streak_max} | ${component4.streak_nonzero} |`);
  md.push('');
  md.push('## 3. Kết luận');
  md.push('');
  if (conclusion === 'PHENOMENON') {
    md.push(
      `**HIỆN TƯỢNG THẬT (không phải bug truyền sai khung):** cùng hàm \`calculateTrendExhaustion\`, trên **1H** max = **${s1.max}** < ngưỡng **55** → 0/179 pass; trên **4H** max = **${s4.max}**, ≥55 = **${nGe55_4}** nến. TR intentionally gate trên 1H; MI snapshot dùng 4H — hai phân phối khác nhau là đúng thiết kế khung, không phải nhầm tham số.`,
    );
    md.push('');
    md.push(
      'Nghẽn chính trên 1H: tổng điểm hiếm vượt ~30–40 (xem max + components). Nếu muốn checklist Exhaustion “nói chuyện” với MI 4H, đó là **lựa chọn thiết kế** (đổi khung / ngưỡng / nguồn field) — ngoài phạm vi task này.',
    );
  } else {
    md.push(`**Kết luận mã:** ${conclusion}`);
  }
  md.push('');
  md.push('**Không tự sửa code** trong task này.');
  md.push('');
  md.push('## 4. Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-tr-exhaustion-1h-vs-4h-30d.csv`');
  md.push('- `docs/exports/v41-tr-exhaustion-1h-vs-4h-30d-summary.json`');
  md.push('- `scripts/investigate-v41-tr-exhaustion-1h-zero-30d.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');

  console.log('[exh-1h] 1H dist', s1);
  console.log('[exh-1h] 4H dist', s4);
  console.log(`[exh-1h] ge55_1h=${nGe55_1} ge55_4h=${nGe55_4} conclusion=${conclusion}`);
  console.log(`[exh-1h] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

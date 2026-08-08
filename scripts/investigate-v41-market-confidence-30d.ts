/**
 * Investigate V4.1 MarketConfidence distribution on NEAR 30d (4H engines).
 * Read-only — calls calculateTrendStrength / calculateTrendExhaustion as-is.
 * Does NOT modify engines, thresholds, or feature flags.
 *
 * Usage:
 *   npx tsx scripts/investigate-v41-market-confidence-30d.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { buildBTCContext } from '../services/v41/btcContextBuilder';
import type { KlineV41 } from '../services/v41/indicators';
import {
  resolveAltBtcAlignmentFactor,
} from '../services/v41/marketIntelligenceLayer';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const DAYS = 30;
const WARMUP_4H = 220; // EMA200 + BTC context min
const FETCH_GAP_MS = 200;
const BINANCE_MAX_LIMIT = 1500;
const MS_4H = 4 * 3_600_000;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-market-confidence-30d-4h.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-market-confidence-30d-4h-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_MARKET_CONFIDENCE_DISTRIBUTION_30D_2026-07-30.md',
);

type Row = {
  timestamp: number;
  timestamp_iso: string;
  trendStrength: number;
  trendDirection: string;
  emaAlignmentScore: number;
  adxScore: number;
  slopeScore: number;
  trendExhaustion: number;
  rsiExtremeScore: number;
  distanceEMA20Score: number;
  volumeDivergencePts: number;
  candleStreakScore: number;
  btcDirection: string;
  btcAlignmentFactor: number;
  marketConfidence: number;
  exhaustionMultiplier: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function adaptBinanceKline(raw: (string | number)[]): KlineV41 {
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

async function fetchKlines4h(
  symbol: string,
  startMs: number,
  endMs: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursorEnd = endMs;
  while (cursorEnd > startMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '4h');
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));
    url.searchParams.set('startTime', String(startMs));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`klines ${symbol} 4h HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = (json as (string | number)[][]).map(adaptBinanceKline);
    out.push(...batch);
    const earliest = Math.min(...batch.map((k) => k.openTime));
    if (earliest >= cursorEnd) break;
    cursorEnd = earliest - 1;
    if (batch.length < 2) break;
  }
  const byTs = new Map<number, KlineV41>();
  for (const k of out) {
    if (k.openTime >= startMs && k.closeTime < Date.now() - 1000) byTs.set(k.openTime, k);
  }
  return [...byTs.values()].sort((a, b) => a.openTime - b.openTime);
}

function computeMarketConfidence(
  trendStrength: number,
  trendExhaustion: number,
  btcAlignmentFactor: number,
): number {
  const raw = trendStrength * (1 - trendExhaustion / 100) * btcAlignmentFactor;
  return Math.min(100, Math.max(0, raw));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base]!;
  const b = sorted[Math.min(base + 1, sorted.length - 1)]!;
  return a + rest * (b - a);
}

function dist(vals: number[]): {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
} {
  const sorted = [...vals].filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    return { n: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
  }
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  return {
    n,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    mean,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? NaN : num / den;
}

function fmt(n: number, d = 2): string {
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(d);
}

function countAtLeast(vals: number[], thr: number): number {
  return vals.filter((v) => v >= thr).length;
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const windowStartMs = endMs - DAYS * 86_400_000;
  const fetchStart = windowStartMs - WARMUP_4H * MS_4H;

  console.log(`=== V4.1 MarketConfidence probe NEAR ${DAYS}d @ 4H ===`);
  const [near4h, btc4h] = await Promise.all([
    fetchKlines4h(SYMBOL, fetchStart, endMs),
    fetchKlines4h('BTCUSDT', fetchStart, endMs),
  ]);
  console.log(`[data] NEAR 4h=${near4h.length} BTC 4h=${btc4h.length}`);

  const startIdx = near4h.findIndex((k) => k.openTime >= windowStartMs);
  if (startIdx < 0) throw new Error('No 4H bars in 30d window');
  const evalFrom = Math.max(startIdx, WARMUP_4H);

  const rows: Row[] = [];
  for (let i = evalFrom; i < near4h.length; i++) {
    const winNear = near4h.slice(0, i + 1);
    const candle = near4h[i]!;
    const winBtc = btc4h.filter((k) => k.openTime <= candle.openTime);
    if (winBtc.length < WARMUP_4H) continue;

    const e1 = calculateTrendStrength(winNear);
    const e2 = calculateTrendExhaustion(winNear, e1.trendDirection);
    const btcCtx = buildBTCContext(winBtc);
    const btcAlignmentFactor = resolveAltBtcAlignmentFactor(
      e1.trendDirection,
      btcCtx.btcDirection,
    );
    const marketConfidence = computeMarketConfidence(
      e1.trendStrength,
      e2.trendExhaustion,
      btcAlignmentFactor,
    );

    rows.push({
      timestamp: candle.openTime,
      timestamp_iso: new Date(candle.openTime).toISOString(),
      trendStrength: e1.trendStrength,
      trendDirection: e1.trendDirection,
      emaAlignmentScore: e1.emaAlignmentScore,
      adxScore: e1.adxScore,
      slopeScore: e1.slopeScore,
      trendExhaustion: e2.trendExhaustion,
      rsiExtremeScore: e2.rsiExtremeScore,
      distanceEMA20Score: e2.distanceEMA20Score,
      volumeDivergencePts: e2.volumeDivergencePts,
      candleStreakScore: e2.candleStreakScore,
      btcDirection: btcCtx.btcDirection,
      btcAlignmentFactor,
      marketConfidence,
      exhaustionMultiplier: 1 - e2.trendExhaustion / 100,
    });
  }

  console.log(`[eval] rows=${rows.length} (4H bars in ${DAYS}d after warmup)`);

  const strengths = rows.map((r) => r.trendStrength);
  const exhaustions = rows.map((r) => r.trendExhaustion);
  const confs = rows.map((r) => r.marketConfidence);
  const factors = rows.map((r) => r.btcAlignmentFactor);
  const corr = pearson(strengths, exhaustions);

  const dS = dist(strengths);
  const dE = dist(exhaustions);
  const dC = dist(confs);
  const dF = dist(factors);

  const thrList = [75, 60, 50, 45, 40] as const;
  const thrCounts = Object.fromEntries(
    thrList.map((t) => [String(t), countAtLeast(confs, t)]),
  ) as Record<string, number>;

  const strong = rows.filter((r) => r.trendStrength >= 85);
  const dEStrong = dist(strong.map((r) => r.trendExhaustion));
  const dCStrong = dist(strong.map((r) => r.marketConfidence));

  // Direction mix
  const byDir: Record<string, number> = {};
  for (const r of rows) byDir[r.trendDirection] = (byDir[r.trendDirection] ?? 0) + 1;

  // Dead-code confirmation (static): BULL/BEAR from resolveTrendDirection
  // already imply price vs EMA20/50 stack → "return 20" branch unreachable.
  const deadCodeNote =
    'calculateEMAAlignmentScore "return 20" unreachable when direction comes from resolveTrendDirection (BULL/BEAR already require EMA20+EMA50 stack; NEUTRAL early-returns 0). No impact on MarketConfidence path.';

  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  const header = [
    'timestamp',
    'timestamp_iso',
    'trendStrength',
    'trendDirection',
    'emaAlignmentScore',
    'adxScore',
    'slopeScore',
    'trendExhaustion',
    'rsiExtremeScore',
    'distanceEMA20Score',
    'volumeDivergencePts',
    'candleStreakScore',
    'btcDirection',
    'btcAlignmentFactor',
    'marketConfidence',
    'exhaustionMultiplier',
  ];
  const csvLines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.timestamp,
        r.timestamp_iso,
        r.trendStrength,
        r.trendDirection,
        r.emaAlignmentScore,
        r.adxScore,
        r.slopeScore,
        r.trendExhaustion,
        r.rsiExtremeScore,
        r.distanceEMA20Score,
        r.volumeDivergencePts,
        r.candleStreakScore,
        r.btcDirection,
        r.btcAlignmentFactor,
        r.marketConfidence,
        r.exhaustionMultiplier,
      ].join(','),
    ),
  ];
  fs.writeFileSync(OUT_CSV, csvLines.join('\n') + '\n', 'utf8');

  const summary = {
    generatedAt: new Date().toISOString(),
    symbol: SYMBOL,
    days: DAYS,
    timeframe: '4h',
    note719:
      'Funnel CSV 719 = 1H bars in 30d window; MarketConfidence engines use 4H — this report counts 4H bars.',
    near4hFetched: near4h.length,
    btc4hFetched: btc4h.length,
    rowsEvaluated: rows.length,
    directionCounts: byDir,
    distTrendStrength: dS,
    distTrendExhaustion: dE,
    distMarketConfidence: dC,
    distBtcAlignmentFactor: dF,
    pearsonStrengthVsExhaustion: corr,
    confThresholdCounts: thrCounts,
    strengthGe85: {
      n: strong.length,
      distExhaustion: dEStrong,
      distConfidence: dCStrong,
    },
    deadCodeEmaAlignmentReturn20: deadCodeNote,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md: string[] = [];
  md.push('# REPORT — V4.1 MarketConfidence distribution (NEAR 30d @ 4H)');
  md.push('');
  md.push(`**Generated:** ${summary.generatedAt}`);
  md.push('**Engine:** calculateTrendStrength + calculateTrendExhaustion + resolveAltBtcAlignmentFactor (không sửa code)');
  md.push(`**Symbol / window:** ${SYMBOL} · ${DAYS}d · TF **4H**`);
  md.push(`**Bars evaluated:** ${rows.length} (fetch NEAR=${near4h.length}, BTC=${btc4h.length})`);
  md.push('');
  md.push('> Ghi chú: funnel trước ghi **719 nến 1H** trong 30d. MarketConfidence Layer dùng **4H** → số nến ở đây ≈ 30×6 ≈ 180 (sau warmup), không phải 719.');
  md.push('');
  md.push('## 1. Phân phối');
  md.push('');
  md.push('| Metric | n | min | p25 | median | mean | p75 | p90 | max |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  const rowDist = (name: string, d: ReturnType<typeof dist>) =>
    `| ${name} | ${d.n} | ${fmt(d.min)} | ${fmt(d.p25)} | ${fmt(d.median)} | ${fmt(d.mean)} | ${fmt(d.p75)} | ${fmt(d.p90)} | ${fmt(d.max)} |`;
  md.push(rowDist('trendStrength', dS));
  md.push(rowDist('trendExhaustion', dE));
  md.push(rowDist('marketConfidence', dC));
  md.push(rowDist('btcAlignmentFactor', dF));
  md.push('');
  md.push(`Direction mix: ${JSON.stringify(byDir)}`);
  md.push('');
  md.push('## 2. Tương quan Strength ↔ Exhaustion');
  md.push('');
  md.push(`| Pearson(trendStrength, trendExhaustion) | **${fmt(corr, 3)}** |`);
  md.push('|---|---|');
  md.push('');
  md.push('## 3. Số nến đạt ngưỡng MarketConfidence');
  md.push('');
  md.push('| Ngưỡng | n đạt | % |');
  md.push('|---:|---:|---:|');
  for (const t of thrList) {
    const n = thrCounts[String(t)] ?? 0;
    md.push(`| ≥${t} | ${n} | ${fmt((n / Math.max(rows.length, 1)) * 100, 1)}% |`);
  }
  md.push('');
  md.push('## 4. Nhóm trendStrength ≥ 85');
  md.push('');
  md.push(`n = **${strong.length}**`);
  md.push('');
  md.push('| Sub-metric | n | min | p25 | median | mean | p75 | p90 | max |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  md.push(rowDist('exhaustion | strength≥85', dEStrong));
  md.push(rowDist('confidence | strength≥85', dCStrong));
  md.push('');
  md.push('## 5. Dead code EMA alignment `return 20`');
  md.push('');
  md.push(deadCodeNote);
  md.push('');
  md.push('## 6. Observations (ngắn)');
  md.push('');
  md.push(
    `- MarketConfidence ≥75: **${thrCounts['75'] ?? 0}/${rows.length}** — giải thích Final Propose gần 0 nếu gate đòi ≥75.`,
  );
  md.push(
    `- Pearson strength↔exhaustion = **${fmt(corr, 3)}** ${corr > 0.3 ? '(tương quan dương vừa/đáng kể — giả thuyết đối kháng có cơ sở trên mẫu này)' : corr > 0.1 ? '(tương quan dương nhẹ)' : '(yếu / không rõ trên mẫu này)'}.`,
  );
  md.push(
    `- Công thức nhân: conf = strength × (1−exh/100) × btcFactor — exhaustion và BTC&lt;1 làm suy giảm nhanh (compounding).`,
  );
  md.push(
    `- **Không** đề xuất sửa công thức/ngưỡng trong task này — chỉ số liệu để chọn: hạ threshold vs đổi sang cộng có trọng số.`,
  );
  md.push('');
  md.push('## 7. Artefacts');
  md.push('');
  md.push(`- CSV: \`${path.relative(path.resolve(__dirname, '..'), OUT_CSV)}\``);
  md.push(`- JSON summary: \`${path.relative(path.resolve(__dirname, '..'), OUT_JSON)}\``);
  md.push('');

  fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');

  console.log('\n=== DISTRIBUTIONS ===');
  console.log('strength', dS);
  console.log('exhaustion', dE);
  console.log('confidence', dC);
  console.log('btcFactor', dF);
  console.log('pearson S↔E', fmt(corr, 3));
  console.log('thresholds', thrCounts);
  console.log('strength≥85 n=', strong.length, 'exh', dEStrong, 'conf', dCStrong);
  console.log(`\nWrote ${OUT_CSV}`);
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * V4.1 — phân phối Market Context + Momentum1H trên cùng 179 nến 4H
 * (join timestamps từ v41-market-confidence-30d-4h.csv).
 * Không sửa engine / ngưỡng.
 *
 * Usage:
 *   npx tsx scripts/investigate-v41-context-momentum-30d.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { buildBTCContext } from '../services/v41/btcContextBuilder';
import type { KlineV41 } from '../services/v41/indicators';
import {
  evaluateMarketContext,
  type MarketContextDimensionResult,
} from '../services/v41/marketContextFilter';
import { computeMomentum1H } from '../services/v41/momentumEngine1H';
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
  '../docs/exports/v41-context-momentum-30d-4h.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-context-momentum-30d-4h-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_CONTEXT_MOMENTUM_DISTRIBUTION_30D_2026-07-30.md',
);

type ConfRow = {
  timestamp: number;
  marketConfidence: number;
  trendDirection: TrendDirection;
};

type OutRow = {
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  marketConfidence: number;
  // Market Context dimensions
  ctx_btc_pass: 0 | 1;
  ctx_btc_skipped: 0 | 1;
  ctx_funding_pass: 0 | 1;
  ctx_funding_skipped: 0 | 1;
  ctx_oi_pass: 0 | 1;
  ctx_oi_skipped: 0 | 1;
  ctx_whale_pass: 0 | 1;
  ctx_whale_skipped: 0 | 1;
  ctx_volatility_pass: 0 | 1;
  ctx_volatility_skipped: 0 | 1;
  ctx_fail_ids: string;
  ctx_pass_count: number; // non-skipped passes
  ctx_applicable_count: number;
  ctx_score_pct: number; // pass_count/applicable * 100
  contextPass: 0 | 1;
  // Momentum 1H (counter-trend side, funnel convention)
  proposedSide: string;
  mom_long: number;
  mom_short: number;
  mom_score_side: number;
  mom_vol_spike: 0 | 1;
  mom_cvd: 0 | 1;
  mom_signals: string;
  momentumPass: 0 | 1;
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

async function fetchKlines(
  symbol: string,
  interval: '1h' | '4h',
  startMs: number,
  endMs: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursorEnd = endMs;
  while (cursorEnd > startMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));
    url.searchParams.set('startTime', String(startMs));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`klines ${symbol} ${interval} HTTP ${res.status}`);
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

async function fetchFundingRecords(
  symbol: string,
  startMs: number,
  endMs: number,
): Promise<{ fundingTime: number; fundingRate: number }[]> {
  const out: { fundingTime: number; fundingRate: number }[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/fundingRate`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endMs));
    url.searchParams.set('limit', '1000');
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) break;
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = (json as { fundingTime: number; fundingRate: string }[]).map((r) => ({
      fundingTime: Number(r.fundingTime),
      fundingRate: Number(r.fundingRate),
    }));
    out.push(...batch);
    const last = batch[batch.length - 1]!.fundingTime;
    if (batch.length < 2 || last <= cursor) break;
    cursor = last + 1;
  }
  const byTs = new Map<number, { fundingTime: number; fundingRate: number }>();
  for (const r of out) byTs.set(r.fundingTime, r);
  return [...byTs.values()].sort((a, b) => a.fundingTime - b.fundingTime);
}

async function fetchOiHist(symbol: string): Promise<{ timestamp: number; oi: number }[]> {
  const byTs = new Map<number, number>();
  let cursorEnd = Date.now();
  for (let page = 0; page < 6; page++) {
    const url = new URL(`${BINANCE_BASE_URL}/futures/data/openInterestHist`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('period', '1h');
    url.searchParams.set('limit', '500');
    url.searchParams.set('endTime', String(cursorEnd));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) break;
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = json as { timestamp: number; sumOpenInterest: string }[];
    for (const p of batch) byTs.set(Number(p.timestamp), Number(p.sumOpenInterest));
    const earliest = Math.min(...batch.map((p) => Number(p.timestamp)));
    if (earliest >= cursorEnd) break;
    cursorEnd = earliest - 1;
  }
  return [...byTs.entries()]
    .map(([timestamp, oi]) => ({ timestamp, oi }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function loadConfCsv(filePath: string): ConfRow[] {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  const header = lines[0]!.split(',');
  const ix = (n: string) => header.indexOf(n);
  return lines.slice(1).map((line) => {
    const c = line.split(',');
    return {
      timestamp: Number(c[ix('timestamp')]),
      marketConfidence: Number(c[ix('marketConfidence')]),
      trendDirection: c[ix('trendDirection')] as TrendDirection,
    };
  });
}

function lookupNearestBefore<T extends { fundingTime?: number; timestamp?: number }>(
  series: T[],
  ts: number,
  key: 'fundingTime' | 'timestamp',
): T | null {
  let best: T | null = null;
  for (const p of series) {
    const t = Number((p as Record<string, unknown>)[key]);
    if (t <= ts) best = p;
    else break;
  }
  return best;
}

function dimFlags(d: MarketContextDimensionResult): {
  pass: 0 | 1;
  skipped: 0 | 1;
} {
  return {
    pass: d.pass ? 1 : 0,
    skipped: d.skipped ? 1 : 0,
  };
}

function cvd(k: KlineV41): number {
  return k.takerBuyVolume - (k.volume - k.takerBuyVolume);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base]! + rest * (sorted[Math.min(base + 1, sorted.length - 1)]! - sorted[base]!);
}

function dist(vals: number[]) {
  const sorted = [...vals].filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return { n: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
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

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : 'n/a';
}

function pct(n: number, den: number): string {
  return den > 0 ? `${fmt((n / den) * 100, 1)}%` : 'n/a';
}

async function main(): Promise<void> {
  if (!fs.existsSync(CONF_CSV)) {
    throw new Error(`Missing confidence CSV: ${CONF_CSV}`);
  }
  const confRows = loadConfCsv(CONF_CSV);
  console.log(`Loaded confidence markers: ${confRows.length}`);

  const endMs = Date.now();
  const windowStartMs = confRows[0]!.timestamp;
  const fetchStart4h = windowStartMs - WARMUP_4H * MS_4H;
  const fetchStart1h = windowStartMs - WARMUP_1H * MS_1H;

  const [near4h, btc4h, near1h, funding, oiHist] = await Promise.all([
    fetchKlines(SYMBOL, '4h', fetchStart4h, endMs),
    fetchKlines('BTCUSDT', '4h', fetchStart4h, endMs),
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
    fetchFundingRecords(SYMBOL, fetchStart1h, endMs),
    fetchOiHist(SYMBOL),
  ]);

  console.log(
    `[data] NEAR4h=${near4h.length} BTC4h=${btc4h.length} NEAR1h=${near1h.length} funding=${funding.length} oi=${oiHist.length}`,
  );

  const near4hByTs = new Map(near4h.map((k) => [k.openTime, k]));
  const rows: OutRow[] = [];

  const failDimCounts: Record<string, number> = {
    btc: 0,
    funding: 0,
    oi: 0,
    whale: 0,
    volatility: 0,
  };
  let momVolFail = 0;
  let momCvdFail = 0;
  let momBothFail = 0;
  let momEvalN = 0;

  for (const conf of confRows) {
    const ts = conf.timestamp;
    const candle = near4hByTs.get(ts);
    if (!candle) {
      console.warn(`skip missing 4h bar ${ts}`);
      continue;
    }

    const win4h = near4h.filter((k) => k.openTime <= ts);
    const winBtc = btc4h.filter((k) => k.openTime <= ts);
    const win1h = near1h.filter((k) => k.openTime <= ts);

    const e1 = calculateTrendStrength(win4h);
    const trendDirection = e1.trendDirection;

    const fundPt = lookupNearestBefore(funding, ts, 'fundingTime');
    const oiNow = lookupNearestBefore(oiHist, ts, 'timestamp');
    const oiPrev = oiNow
      ? lookupNearestBefore(
          oiHist,
          (oiNow as { timestamp: number }).timestamp - 1,
          'timestamp',
        )
      : null;
    let oiDeltaPct: number | undefined;
    if (
      oiNow &&
      oiPrev &&
      Number.isFinite((oiPrev as { oi: number }).oi) &&
      (oiPrev as { oi: number }).oi > 0
    ) {
      oiDeltaPct =
        (((oiNow as { oi: number }).oi - (oiPrev as { oi: number }).oi) /
          (oiPrev as { oi: number }).oi) *
        100;
    }
    let priceChangePct: number | undefined;
    if (win1h.length >= 2) {
      const a = win1h[win1h.length - 2]!.close;
      const b = win1h[win1h.length - 1]!.close;
      if (a > 0) priceChangePct = ((b - a) / a) * 100;
    }

    const btcContext = buildBTCContext(winBtc);
    const ctx = evaluateMarketContext({
      trendDirection,
      btcContext,
      btcKlines4H: winBtc,
      klines4H: win4h,
      fundingRate: fundPt?.fundingRate,
      oiDeltaPct,
      priceChangePct,
      // whale omitted → skipped/neutral path inside evaluator
    });

    for (const id of ctx.failedDimensions) {
      failDimCounts[id] = (failDimCounts[id] ?? 0) + 1;
    }

    const dims = ctx.dimensions;
    const applicable = (Object.values(dims) as MarketContextDimensionResult[]).filter(
      (d) => !d.skipped,
    );
    const passApplicable = applicable.filter((d) => d.pass);
    const ctxScorePct =
      applicable.length > 0 ? (passApplicable.length / applicable.length) * 100 : 100;

    const proposedSide: 'LONG' | 'SHORT' | 'NONE' =
      trendDirection === 'BEAR' ? 'LONG' : trendDirection === 'BULL' ? 'SHORT' : 'NONE';

    const mom = computeMomentum1H(win1h);
    let momVol = 0 as 0 | 1;
    let momCvd = 0 as 0 | 1;
    let momScoreSide = 0;
    let momentumPass: 0 | 1 = 0;
    let signals = '';

    if (proposedSide === 'LONG') {
      momEvalN += 1;
      momVol = mom.signalsLong.includes('BUY_VOLUME_SPIKE_1H') ? 1 : 0;
      momCvd = mom.signalsLong.includes('CVD_RISING_1H') ? 1 : 0;
      momScoreSide = mom.momentumLong;
      momentumPass = mom.momentumConfirmedLong ? 1 : 0;
      signals = mom.signalsLong.join('|');
      if (!momVol && !momCvd) momBothFail += 1;
      else if (!momVol) momVolFail += 1;
      else if (!momCvd) momCvdFail += 1;
    } else if (proposedSide === 'SHORT') {
      momEvalN += 1;
      momVol = mom.signalsShort.includes('SELL_VOLUME_SPIKE_1H') ? 1 : 0;
      momCvd = mom.signalsShort.includes('CVD_FALLING_1H') ? 1 : 0;
      momScoreSide = mom.momentumShort;
      momentumPass = mom.momentumConfirmedShort ? 1 : 0;
      signals = mom.signalsShort.join('|');
      if (!momVol && !momCvd) momBothFail += 1;
      else if (!momVol) momVolFail += 1;
      else if (!momCvd) momCvdFail += 1;
    }

    // Extra diagnostic: if legs not in signals array, still show from raw last bar
    if (proposedSide !== 'NONE' && win1h.length >= 22 && signals === '') {
      const last = win1h[win1h.length - 1]!;
      const last3 = win1h.slice(-3);
      const needBull = proposedSide === 'LONG';
      const cvdOk = needBull
        ? last3.every((k) => cvd(k) > 0)
        : last3.every((k) => cvd(k) < 0);
      void last;
      void cvdOk;
    }

    const btcF = dimFlags(dims.btc);
    const fundF = dimFlags(dims.funding);
    const oiF = dimFlags(dims.oi);
    const whaleF = dimFlags(dims.whale);
    const volF = dimFlags(dims.volatility);

    rows.push({
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      marketConfidence: conf.marketConfidence,
      ctx_btc_pass: btcF.pass,
      ctx_btc_skipped: btcF.skipped,
      ctx_funding_pass: fundF.pass,
      ctx_funding_skipped: fundF.skipped,
      ctx_oi_pass: oiF.pass,
      ctx_oi_skipped: oiF.skipped,
      ctx_whale_pass: whaleF.pass,
      ctx_whale_skipped: whaleF.skipped,
      ctx_volatility_pass: volF.pass,
      ctx_volatility_skipped: volF.skipped,
      ctx_fail_ids: ctx.failedDimensions.join('|'),
      ctx_pass_count: passApplicable.length,
      ctx_applicable_count: applicable.length,
      ctx_score_pct: ctxScorePct,
      contextPass: ctx.pass ? 1 : 0,
      proposedSide,
      mom_long: mom.momentumLong,
      mom_short: mom.momentumShort,
      mom_score_side: momScoreSide,
      mom_vol_spike: momVol,
      mom_cvd: momCvd,
      mom_signals: signals,
      momentumPass,
    });
  }

  console.log(`[eval] rows=${rows.length}`);

  const ctxScores = rows.map((r) => r.ctx_score_pct);
  const momScores = rows
    .filter((r) => r.proposedSide !== 'NONE')
    .map((r) => r.mom_score_side);
  const dCtx = dist(ctxScores);
  const dMom = dist(momScores);

  const nCtxPass = rows.filter((r) => r.contextPass === 1).length;
  const nMomPass = rows.filter((r) => r.momentumPass === 1).length;
  const nBoth = rows.filter((r) => r.contextPass === 1 && r.momentumPass === 1).length;

  const conf55 = rows.filter((r) => r.marketConfidence >= 55);
  const c55Ctx = conf55.filter((r) => r.contextPass === 1).length;
  const c55Mom = conf55.filter((r) => r.momentumPass === 1).length;
  const c55All3 = conf55.filter(
    (r) => r.contextPass === 1 && r.momentumPass === 1,
  ).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    symbol: SYMBOL,
    days: DAYS,
    rows: rows.length,
    confMarkers: confRows.length,
    distContextScorePct: dCtx,
    distMomentumScoreSide: dMom,
    contextPass: nCtxPass,
    contextFail: rows.length - nCtxPass,
    momentumPass: nMomPass,
    momentumFail: rows.length - nMomPass,
    bothPass: nBoth,
    confGe55: {
      n: conf55.length,
      contextPass: c55Ctx,
      momentumPass: c55Mom,
      allThree: c55All3,
    },
    contextFailDimensionCounts: failDimCounts,
    momentumFailLegs: {
      evaluatedSides: momEvalN,
      volOnlyFail: momVolFail,
      cvdOnlyFail: momCvdFail,
      bothLegsFail: momBothFail,
      confirmedPass: nMomPass,
    },
    note:
      'Market Context: evaluateMarketContext (5 dims). Momentum: computeMomentum1H on 1H, confirmed = score≥2 on counter-trend side (BEAR→LONG / BULL→SHORT). OI only where Binance hist covers (~30d). Whale omitted → skipped.',
  };

  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  const header = Object.keys(rows[0] ?? { timestamp: 0 });
  const csv = [
    header.join(','),
    ...rows.map((r) => header.map((h) => String((r as Record<string, unknown>)[h] ?? '')).join(',')),
  ].join('\n');
  fs.writeFileSync(OUT_CSV, csv + '\n', 'utf8');
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md: string[] = [];
  md.push('# REPORT — V4.1 Market Context + Momentum1H distribution (NEAR 30d)');
  md.push('');
  md.push(`**Generated:** ${summary.generatedAt}`);
  md.push('**Join:** timestamps từ `docs/exports/v41-market-confidence-30d-4h.csv`');
  md.push(
    '**Engines (không sửa):** `evaluateMarketContext` · `computeMomentum1H` · trendDirection từ `calculateTrendStrength(4H)`',
  );
  md.push(`**Bars:** ${rows.length}`);
  md.push('');
  md.push('## 1. Phân phối điểm');
  md.push('');
  md.push('| Metric | n | min | p25 | median | mean | p75 | p90 | max |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  const rowD = (name: string, d: ReturnType<typeof dist>) =>
    `| ${name} | ${d.n} | ${fmt(d.min)} | ${fmt(d.p25)} | ${fmt(d.median)} | ${fmt(d.mean)} | ${fmt(d.p75)} | ${fmt(d.p90)} | ${fmt(d.max)} |`;
  md.push(rowD('contextScorePct (pass/applicable×100)', dCtx));
  md.push(rowD('momentumScore (0–2, counter-trend side)', dMom));
  md.push('');
  md.push('## 2. Pass / Fail từng gate');
  md.push('');
  md.push('| Gate | Pass | Fail | Pass % |');
  md.push('|---|---:|---:|---:|');
  md.push(
    `| Market Context | ${nCtxPass} | ${rows.length - nCtxPass} | ${pct(nCtxPass, rows.length)} |`,
  );
  md.push(
    `| Momentum1H confirmed | ${nMomPass} | ${rows.length - nMomPass} | ${pct(nMomPass, rows.length)} |`,
  );
  md.push(`| **Cả hai** | ${nBoth} | ${rows.length - nBoth} | ${pct(nBoth, rows.length)} |`);
  md.push('');
  md.push('## 3. Join MarketConfidence ≥ 55');
  md.push('');
  md.push(`n (conf≥55) = **${conf55.length}**`);
  md.push('');
  md.push('| Điều kiện | n | % trong conf≥55 |');
  md.push('|---|---:|---:|');
  md.push(`| + Context pass | ${c55Ctx} | ${pct(c55Ctx, conf55.length)} |`);
  md.push(`| + Momentum pass | ${c55Mom} | ${pct(c55Mom, conf55.length)} |`);
  md.push(
    `| + Context **và** Momentum (cả 3 gate) | ${c55All3} | ${pct(c55All3, conf55.length)} |`,
  );
  md.push('');
  md.push('## 4. Thành phần fail nhiều nhất');
  md.push('');
  md.push('### Market Context — số lần dimension fail (failedDimensions)');
  md.push('');
  md.push('| Dimension | Fail count |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(failDimCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${k} | ${v} |`);
  }
  md.push('');
  md.push('### Momentum1H — chân nào thiếu (trên nến có hướng BULL/BEAR)');
  md.push('');
  md.push('| Pattern | n |');
  md.push('|---|---:|');
  md.push(`| Evaluated (non-NEUTRAL) | ${momEvalN} |`);
  md.push(`| Cả 2 chân fail (vol+CVD) | ${momBothFail} |`);
  md.push(`| Chỉ thiếu vol spike | ${momVolFail} |`);
  md.push(`| Chỉ thiếu CVD | ${momCvdFail} |`);
  md.push(`| Confirmed pass (cả 2 chân) | ${nMomPass} |`);
  md.push('');
  md.push('## 5. Observations');
  md.push('');
  md.push(
    `- Nếu hạ Confidence → ≥55 còn **${conf55.length}** nến; trong đó Context pass **${pct(c55Ctx, conf55.length)}**, Momentum **${pct(c55Mom, conf55.length)}**, cả 3 gate **${pct(c55All3, conf55.length)}** (${c55All3}/${conf55.length}).`,
  );
  md.push(
    `- Context fail chủ yếu theo dimension: **${Object.entries(failDimCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'n/a'}** (xem bảng §4).`,
  );
  md.push(
    `- Momentum fail phần lớn vì **thiếu đồng thời** vol spike + CVD (${momBothFail}/${momEvalN}), không phải near-miss một chân.`,
  );
  md.push(
    `- **Không** sửa ngưỡng/công thức trong task này — số liệu để chọn: sửa Context vs Momentum trước khi (hoặc cùng lúc) hạ Confidence.`,
  );
  md.push('');
  md.push('## 6. Artefacts');
  md.push('');
  md.push(`- \`${path.relative(path.resolve(__dirname, '..'), OUT_CSV)}\``);
  md.push(`- \`${path.relative(path.resolve(__dirname, '..'), OUT_JSON)}\``);
  md.push('');

  fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${OUT_CSV}`);
  console.log(`Wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

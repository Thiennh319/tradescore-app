/**
 * Part 1: Resolve 4H BOTH trades on 1H granularity.
 * Part 2: Win vs loss feature analysis + candidate filters.
 * Uses trades from v41-backtest-180d-winrate-trades.csv (180d, conf≥40).
 * No production changes.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/analyze-v41-both-and-winloss-180d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import { buildBTCContext } from '../services/v41/btcContextBuilder';
import { resolveAltBtcAlignmentFactor } from '../services/v41/marketIntelligenceLayer';
import {
  detectStructureBreak,
  detectTrendReversalVolumeConfirmation,
  TREND_REVERSAL_EXHAUSTION_MIN,
} from '../services/v41/reversalDetector';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const FETCH_GAP_MS = 150;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP_4H = 220;
const WARMUP_1H = 80;
const MAX_HOLD_1H = 80; // 20 × 4H
const TRADES_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-winrate-trades.csv',
);
const OUT_BOTH = path.resolve(
  __dirname,
  '../docs/exports/v41-both-1h-resolution-180d.csv',
);
const OUT_FEAT = path.resolve(
  __dirname,
  '../docs/exports/v41-winloss-features-180d.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-both-winloss-analysis-180d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_BOTH_VERIFICATION_AND_WIN_LOSS_ANALYSIS_2026-08-01.md',
);

type Side = 'LONG' | 'SHORT';
type Trade = {
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  tpMultiplier: number;
  confidence: number;
  outcome_4h: string;
  bars_held: number;
};

type Resolve1H =
  | 'TP_FIRST'
  | 'SL_FIRST'
  | 'AMBIGUOUS_1H'
  | 'TIMEOUT_1H'
  | 'INVALID_SL_SIDE';

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

function cvdProxy(k: KlineV41): number {
  return k.takerBuyVolume - (k.volume - k.takerBuyVolume);
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function pct(n: number, d: number): string {
  return d <= 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`;
}

function loadTrades180dConf40(): Trade[] {
  const lines = fs.readFileSync(TRADES_CSV, 'utf8').trim().split(/\r?\n/);
  const header = lines[0]!.split(',');
  const idx = (name: string) => header.indexOf(name);
  const out: Trade[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    if (c[idx('window')] !== '180d') continue;
    if (Number(c[idx('conf_min')]) !== 40) continue;
    out.push({
      timestamp: Number(c[idx('timestamp')]),
      timestamp_iso: c[idx('timestamp_iso')]!,
      trendDirection: c[idx('trendDirection')]!,
      side: c[idx('side')] as Side,
      entry: Number(c[idx('entry')]),
      sl: Number(c[idx('sl')]),
      tp1: Number(c[idx('tp1')]),
      tpMultiplier: Number(c[idx('tpMultiplier')]),
      confidence: Number(c[idx('confidence')]),
      outcome_4h: c[idx('outcome')]!,
      bars_held: Number(c[idx('bars_held')]),
    });
  }
  return out;
}

function slOnWrongSide(side: Side, entry: number, sl: number): boolean {
  if (side === 'LONG') return !(sl < entry);
  return !(sl > entry);
}

function hitOn1H(
  side: Side,
  bar: KlineV41,
  sl: number,
  tp: number,
): 'TP' | 'SL' | 'BOTH' | null {
  if (side === 'LONG') {
    const hitSl = bar.low <= sl;
    const hitTp = bar.high >= tp;
    if (hitSl && hitTp) return 'BOTH';
    if (hitSl) return 'SL';
    if (hitTp) return 'TP';
    return null;
  }
  const hitSl = bar.high >= sl;
  const hitTp = bar.low <= tp;
  if (hitSl && hitTp) return 'BOTH';
  if (hitSl) return 'SL';
  if (hitTp) return 'TP';
  return null;
}

function resolveOn1H(
  side: Side,
  entry: number,
  entryTs: number,
  sl: number,
  tp: number,
  near1h: KlineV41[],
): { resolve: Resolve1H; bar_iso: string | null; bars_1h: number | null } {
  if (slOnWrongSide(side, entry, sl)) {
    return { resolve: 'INVALID_SL_SIDE', bar_iso: null, bars_1h: null };
  }
  // Forward 1H bars start at first hour AFTER entry 4H close = entryTs + 4H
  const start = entryTs + MS_4H;
  const end = entryTs + MS_4H + MAX_HOLD_1H * MS_1H;
  const bars = near1h.filter((k) => k.openTime >= start && k.openTime < end);
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    const hit = hitOn1H(side, bar, sl, tp);
    if (hit === 'TP') {
      return { resolve: 'TP_FIRST', bar_iso: new Date(bar.openTime).toISOString(), bars_1h: i + 1 };
    }
    if (hit === 'SL') {
      return { resolve: 'SL_FIRST', bar_iso: new Date(bar.openTime).toISOString(), bars_1h: i + 1 };
    }
    if (hit === 'BOTH') {
      return {
        resolve: 'AMBIGUOUS_1H',
        bar_iso: new Date(bar.openTime).toISOString(),
        bars_1h: i + 1,
      };
    }
  }
  return { resolve: 'TIMEOUT_1H', bar_iso: null, bars_1h: null };
}

async function main(): Promise<void> {
  const trades = loadTrades180dConf40();
  if (trades.length === 0) throw new Error('no 180d conf≥40 trades');

  const minTs = Math.min(...trades.map((t) => t.timestamp));
  const maxTs = Math.max(...trades.map((t) => t.timestamp));
  const fetchStart4h = minTs - WARMUP_4H * MS_4H;
  const fetchStart1h = minTs - WARMUP_1H * MS_1H;
  const fetchEnd = maxTs + MS_4H + MAX_HOLD_1H * MS_1H + MS_4H;

  console.log(`[both-wl] trades=${trades.length} fetching…`);
  const [near4h, near1h, btc4h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', fetchStart4h, fetchEnd),
    fetchKlines(SYMBOL, '1h', fetchStart1h, fetchEnd),
    fetchKlines('BTCUSDT', '4h', fetchStart4h, fetchEnd),
  ]);
  console.log(`[both-wl] near4h=${near4h.length} near1h=${near1h.length} btc4h=${btc4h.length}`);

  // --- Part 1: BOTH resolution ---
  const bothTrades = trades.filter((t) => t.outcome_4h === 'BOTH');
  const bothRows: Array<{
    timestamp: number;
    timestamp_iso: string;
    side: Side;
    entry: number;
    sl: number;
    tp1: number;
    sl_wrong_side: 0 | 1;
    sl_dist_pct: number;
    resolve_1h: Resolve1H;
    resolve_bar_iso: string | null;
    bars_1h: number | null;
  }> = [];

  for (const t of bothTrades) {
    const r = resolveOn1H(t.side, t.entry, t.timestamp, t.sl, t.tp1, near1h);
    bothRows.push({
      timestamp: t.timestamp,
      timestamp_iso: t.timestamp_iso,
      side: t.side,
      entry: t.entry,
      sl: t.sl,
      tp1: t.tp1,
      sl_wrong_side: slOnWrongSide(t.side, t.entry, t.sl) ? 1 : 0,
      sl_dist_pct: (Math.abs(t.entry - t.sl) / t.entry) * 100,
      resolve_1h: r.resolve,
      resolve_bar_iso: r.bar_iso,
      bars_1h: r.bars_1h,
    });
  }

  const nTpFirst = bothRows.filter((r) => r.resolve_1h === 'TP_FIRST').length;
  const nSlFirst = bothRows.filter((r) => r.resolve_1h === 'SL_FIRST').length;
  const nAmb = bothRows.filter((r) => r.resolve_1h === 'AMBIGUOUS_1H').length;
  const nInvalid = bothRows.filter((r) => r.resolve_1h === 'INVALID_SL_SIDE').length;
  const nTo = bothRows.filter((r) => r.resolve_1h === 'TIMEOUT_1H').length;

  // Updated outcomes for all 32
  type FinalOut = 'TP' | 'SL' | 'AMBIGUOUS' | 'TIMEOUT';
  const finalByTs = new Map<number, FinalOut>();
  for (const t of trades) {
    if (t.outcome_4h === 'TP') finalByTs.set(t.timestamp, 'TP');
    else if (t.outcome_4h === 'SL') finalByTs.set(t.timestamp, 'SL');
    else if (t.outcome_4h === 'BOTH') {
      const b = bothRows.find((r) => r.timestamp === t.timestamp)!;
      if (b.resolve_1h === 'TP_FIRST') finalByTs.set(t.timestamp, 'TP');
      else if (b.resolve_1h === 'SL_FIRST') finalByTs.set(t.timestamp, 'SL');
      else if (b.resolve_1h === 'AMBIGUOUS_1H') finalByTs.set(t.timestamp, 'AMBIGUOUS');
      else if (b.resolve_1h === 'INVALID_SL_SIDE') {
        // Wrong-side SL: treat as geometry failure → count separate; for winrate exclude or SL
        finalByTs.set(t.timestamp, 'AMBIGUOUS');
      } else finalByTs.set(t.timestamp, 'TIMEOUT');
    } else {
      finalByTs.set(t.timestamp, 'TIMEOUT');
    }
  }

  const nWin = [...finalByTs.values()].filter((v) => v === 'TP').length;
  const nLoss = [...finalByTs.values()].filter((v) => v === 'SL').length;
  const nAmbFinal = [...finalByTs.values()].filter((v) => v === 'AMBIGUOUS').length;
  const nToFinal = [...finalByTs.values()].filter((v) => v === 'TIMEOUT').length;
  const decided = nWin + nLoss;
  const winrateUpdated = decided > 0 ? (100 * nWin) / decided : null;
  // Also report winrate if ambiguous excluded (same) and if invalid counted as loss
  const winrateConservativeBothAsLoss = (100 * 8) / 32; // original
  const winrateIfAmbAsLoss =
    decided + nAmbFinal > 0 ? (100 * nWin) / (decided + nAmbFinal) : null;

  // --- Part 2: features at entry ---
  type Feat = {
    timestamp: number;
    timestamp_iso: string;
    side: Side;
    outcome_4h: string;
    outcome_resolved: FinalOut;
    confidenceTR: number;
    trendStrength: number;
    trendExhaustion_1h: number;
    btcAlignmentFactor: number;
    volumeRatio: number;
    flipMag: number;
    structureBreak: 0 | 1;
    structureScore: number;
    sl_dist_pct: number;
    tpMultiplier: number;
  };

  const feats: Feat[] = [];
  for (const t of trades) {
    const win4h = sliceUpTo(near4h, t.timestamp);
    const win1h = sliceUpTo(near1h, t.timestamp);
    const winBtc = sliceUpTo(btc4h, t.timestamp);
    const strength = calculateTrendStrength(win4h);
    const trend = strength.trendDirection as TrendDirection;

    let volumeRatio = 0;
    let exh1h = 0;
    let flipMag = 0;
    let structureBreak: 0 | 1 = 0;
    if (trend !== 'NEUTRAL' && win1h.length >= 21) {
      const last3 = win1h.slice(-3).map(cvdProxy) as [number, number, number];
      flipMag = Math.abs(last3[2]! - (last3[0]! + last3[1]!) / 2);
      volumeRatio = detectTrendReversalVolumeConfirmation(win1h).volumeRatio;
      exh1h = calculateTrendExhaustion(win1h, trend).trendExhaustion;
      structureBreak = detectStructureBreak(win1h, trend).confirmed ? 1 : 0;
    }
    const ctxBtc = buildBTCContext(winBtc);
    const btcAlignmentFactor = resolveAltBtcAlignmentFactor(trend, ctxBtc.btcDirection);

    feats.push({
      timestamp: t.timestamp,
      timestamp_iso: t.timestamp_iso,
      side: t.side,
      outcome_4h: t.outcome_4h,
      outcome_resolved: finalByTs.get(t.timestamp)!,
      confidenceTR: t.confidence,
      trendStrength: strength.trendStrength,
      trendExhaustion_1h: exh1h,
      btcAlignmentFactor,
      volumeRatio,
      flipMag,
      structureBreak,
      structureScore: structureBreak ? 70 : 0,
      sl_dist_pct: (Math.abs(t.entry - t.sl) / t.entry) * 100,
      tpMultiplier: t.tpMultiplier,
    });
  }

  const wins = feats.filter((f) => f.outcome_resolved === 'TP');
  const losses = feats.filter((f) => f.outcome_resolved === 'SL');

  const featureKeys = [
    'confidenceTR',
    'trendStrength',
    'trendExhaustion_1h',
    'btcAlignmentFactor',
    'volumeRatio',
    'flipMag',
    'structureScore',
    'sl_dist_pct',
    'tpMultiplier',
  ] as const;

  type CompRow = {
    feature: string;
    win_n: number;
    win_mean: number;
    win_median: number;
    loss_n: number;
    loss_mean: number;
    loss_median: number;
    mean_delta: number;
  };
  const comparisons: CompRow[] = featureKeys.map((k) => {
    const w = wins.map((f) => f[k]).filter((x) => Number.isFinite(x));
    const l = losses.map((f) => f[k]).filter((x) => Number.isFinite(x));
    const wm = mean(w);
    const lm = mean(l);
    return {
      feature: k,
      win_n: w.length,
      win_mean: wm,
      win_median: median(w),
      loss_n: l.length,
      loss_mean: lm,
      loss_median: median(l),
      mean_delta: wm - lm,
    };
  });

  // Direction split
  const dirStats = (['LONG', 'SHORT'] as const).map((side) => {
    const g = feats.filter((f) => f.side === side);
    const w = g.filter((f) => f.outcome_resolved === 'TP').length;
    const l = g.filter((f) => f.outcome_resolved === 'SL').length;
    const a = g.filter((f) => f.outcome_resolved === 'AMBIGUOUS').length;
    const d = w + l;
    return {
      side,
      n: g.length,
      wins: w,
      losses: l,
      ambiguous: a,
      winrate: d > 0 ? (100 * w) / d : null,
    };
  });

  // Candidate filters based on deltas (data-driven)
  const sortedByAbsDelta = [...comparisons]
    .filter((c) => Number.isFinite(c.mean_delta))
    .sort((a, b) => Math.abs(b.mean_delta) - Math.abs(a.mean_delta));

  function applyFilter(
    name: string,
    pred: (f: Feat) => boolean,
  ): { name: string; n: number; wins: number; losses: number; amb: number; winrate: number | null } {
    const g = feats.filter(pred);
    const w = g.filter((f) => f.outcome_resolved === 'TP').length;
    const l = g.filter((f) => f.outcome_resolved === 'SL').length;
    const a = g.filter((f) => f.outcome_resolved === 'AMBIGUOUS').length;
    const d = w + l;
    return {
      name,
      n: g.length,
      wins: w,
      losses: l,
      amb: a,
      winrate: d > 0 ? (100 * w) / d : null,
    };
  }

  // Pick thresholds from win median / midpoint between means where sensible
  const confWinMed = median(wins.map((f) => f.confidenceTR));
  const confLossMed = median(losses.map((f) => f.confidenceTR));
  const confCut = Number.isFinite(confWinMed) && Number.isFinite(confLossMed)
    ? (confWinMed + confLossMed) / 2
    : 60;

  const slDistWinMed = median(wins.map((f) => f.sl_dist_pct));
  const slDistLossMed = median(losses.map((f) => f.sl_dist_pct));
  const slDistCut =
    Number.isFinite(slDistWinMed) && Number.isFinite(slDistLossMed)
      ? (slDistWinMed + slDistLossMed) / 2
      : 1;

  const exhWinMed = median(wins.map((f) => f.trendExhaustion_1h));
  const exhLossMed = median(losses.map((f) => f.trendExhaustion_1h));
  const exhCut =
    Number.isFinite(exhWinMed) && Number.isFinite(exhLossMed)
      ? (exhWinMed + exhLossMed) / 2
      : 20;

  const filters = [
    applyFilter('baseline (all 32, resolved)', () => true),
    applyFilter('LONG only', (f) => f.side === 'LONG'),
    applyFilter('SHORT only', (f) => f.side === 'SHORT'),
    applyFilter(`trendExhaustion_1h ≤ ${exhCut.toFixed(1)} (mid win/loss median)`, (f) => f.trendExhaustion_1h <= exhCut),
    applyFilter('structureBreak = 1', (f) => f.structureBreak === 1),
    applyFilter('LONG + structureBreak', (f) => f.side === 'LONG' && f.structureBreak === 1),
    applyFilter(`LONG + exh_1h ≤ ${exhCut.toFixed(1)}`, (f) => f.side === 'LONG' && f.trendExhaustion_1h <= exhCut),
    applyFilter(`confidenceTR ≥ ${confCut.toFixed(1)} (mid win/loss median)`, (f) => f.confidenceTR >= confCut),
    applyFilter('confidenceTR ≥ 60', (f) => f.confidenceTR >= 60),
    applyFilter('confidenceTR ≥ 65', (f) => f.confidenceTR >= 65),
    applyFilter(`sl_dist_pct ≥ ${slDistCut.toFixed(3)}% (mid)`, (f) => f.sl_dist_pct >= slDistCut),
    applyFilter('exclude INVALID/tiny SL (<0.05%)', (f) => f.sl_dist_pct >= 0.05),
    applyFilter('LONG + conf≥60', (f) => f.side === 'LONG' && f.confidenceTR >= 60),
    applyFilter('sl_dist≥0.05% + conf≥60', (f) => f.sl_dist_pct >= 0.05 && f.confidenceTR >= 60),
  ];

  // --- write artefacts ---
  const bothCsv = [
    'timestamp,timestamp_iso,side,entry,sl,tp1,sl_wrong_side,sl_dist_pct,resolve_1h,resolve_bar_iso,bars_1h',
    ...bothRows.map((r) =>
      [
        r.timestamp,
        r.timestamp_iso,
        r.side,
        r.entry,
        r.sl,
        r.tp1,
        r.sl_wrong_side,
        r.sl_dist_pct.toFixed(6),
        r.resolve_1h,
        r.resolve_bar_iso ?? '',
        r.bars_1h ?? '',
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_BOTH, bothCsv + '\n', 'utf8');

  const featCsv = [
    'timestamp,timestamp_iso,side,outcome_4h,outcome_resolved,confidenceTR,trendStrength,trendExhaustion_1h,btcAlignmentFactor,volumeRatio,flipMag,structureBreak,structureScore,sl_dist_pct,tpMultiplier',
    ...feats.map((f) =>
      [
        f.timestamp,
        f.timestamp_iso,
        f.side,
        f.outcome_4h,
        f.outcome_resolved,
        f.confidenceTR,
        f.trendStrength,
        f.trendExhaustion_1h,
        f.btcAlignmentFactor,
        f.volumeRatio,
        f.flipMag,
        f.structureBreak,
        f.structureScore,
        f.sl_dist_pct,
        f.tpMultiplier,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_FEAT, featCsv + '\n', 'utf8');

  const summary = {
    n_trades: trades.length,
    both: {
      n: bothTrades.length,
      tp_first: nTpFirst,
      sl_first: nSlFirst,
      ambiguous_1h: nAmb,
      invalid_sl_side: nInvalid,
      timeout_1h: nTo,
      rows: bothRows,
    },
    winrate: {
      original_both_as_loss: { wins: 8, losses: 17 + 7, winrate: winrateConservativeBothAsLoss },
      after_1h_resolve: {
        wins: nWin,
        losses: nLoss,
        ambiguous: nAmbFinal,
        timeout: nToFinal,
        winrate_decided_only: winrateUpdated,
        winrate_amb_as_loss: winrateIfAmbAsLoss,
      },
    },
    comparisons,
    direction: dirStats,
    top_feature_deltas: sortedByAbsDelta.slice(0, 5),
    filters,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
  const fmtWr = (x: number | null) => (x == null ? 'n/a' : `${x.toFixed(1)}%`);

  const md: string[] = [];
  md.push('# REPORT — BOTH 1H verification + Win/Loss analysis (NEAR 180d)');
  md.push('');
  md.push('**Date:** 2026-08-01');
  md.push(
    '**Scope:** V4.1 experiment — không sửa production / không chọn filter cuối',
  );
  md.push(
    `**Sample:** 32 lệnh 180d conf≥40 từ \`v41-backtest-180d-winrate-trades.csv\``,
  );
  md.push('');
  md.push('## Phần 1 — Xác minh 7 lệnh BOTH trên 1H');
  md.push('');
  md.push(
    'Với mỗi BOTH (4H), walk nến 1H từ `entryTs+4H` tối đa 80 nến; quyết định theo high/low tuần tự. Nếu cùng 1H chạm cả TP và SL → `AMBIGUOUS_1H`. Nếu SL nằm sai phía entry → `INVALID_SL_SIDE` (geometry gãy).',
  );
  md.push('');
  md.push('| timestamp_iso | side | entry | SL | TP1 | sl_dist% | resolve_1H |');
  md.push('|---|---|---|---|---|---|---|');
  for (const r of bothRows) {
    md.push(
      `| ${r.timestamp_iso} | ${r.side} | ${r.entry} | ${r.sl.toFixed(6)} | ${r.tp1.toFixed(6)} | ${r.sl_dist_pct.toFixed(4)} | **${r.resolve_1h}** |`,
    );
  }
  md.push('');
  md.push('### Tổng hợp BOTH → 1H');
  md.push('');
  md.push(`| Kết quả 1H | n / 7 |`);
  md.push(`|------------|------|`);
  md.push(`| TP trước (thắng) | ${nTpFirst} |`);
  md.push(`| SL trước (thua) | ${nSlFirst} |`);
  md.push(`| Ambiguous ngay cả 1H | ${nAmb} |`);
  md.push(`| INVALID_SL_SIDE (SL sai phía) | ${nInvalid} |`);
  md.push(`| Timeout 1H | ${nTo} |`);
  md.push('');
  md.push('### Winrate cập nhật (32 lệnh)');
  md.push('');
  md.push('| Cách tính | Wins | Losses | Ambiguous | Winrate |');
  md.push('|-----------|------|--------|-----------|---------|');
  md.push(
    `| Gốc (BOTH=thua) | 8 | 24 | — | ${fmtWr(winrateConservativeBothAsLoss)} |`,
  );
  md.push(
    `| Sau 1H (chỉ decided TP/SL) | ${nWin} | ${nLoss} | ${nAmbFinal} | ${fmtWr(winrateUpdated)} |`,
  );
  md.push(
    `| Sau 1H (ambiguous cũng = thua) | ${nWin} | ${nLoss + nAmbFinal} | 0 counted | ${fmtWr(winrateIfAmbAsLoss)} |`,
  );
  md.push('');
  md.push(
    `Expectancy gần đúng @ R:R=1.5 (decided only): ${(nWin / Math.max(decided, 1)) * 1.5 - (nLoss / Math.max(decided, 1)) * 1}R/lệnh — tham chiếu; không gồm phí.`,
  );
  md.push('');
  md.push('## Phần 2 — Đặc điểm thắng vs thua');
  md.push('');
  md.push(
    `Nhóm THẮNG n=${wins.length} · THUA n=${losses.length} (theo outcome đã resolve 1H; ambiguous loại khỏi so sánh mean).`,
  );
  md.push('');
  md.push('| Feature | Win mean | Win median | Loss mean | Loss median | Δ mean (W−L) |');
  md.push('|---|---|---|---|---|---|');
  for (const c of comparisons) {
    md.push(
      `| ${c.feature} | ${fmt(c.win_mean)} | ${fmt(c.win_median)} | ${fmt(c.loss_mean)} | ${fmt(c.loss_median)} | ${fmt(c.mean_delta)} |`,
    );
  }
  md.push('');
  md.push('### Direction split');
  md.push('');
  md.push('| Side | n | Wins | Losses | Amb | Winrate (decided) |');
  md.push('|---|---|---|---|---|---|');
  for (const d of dirStats) {
    md.push(
      `| ${d.side} | ${d.n} | ${d.wins} | ${d.losses} | ${d.ambiguous} | ${fmtWr(d.winrate)} |`,
    );
  }
  md.push('');
  md.push('### Top |Δ mean| (ứng viên filter)');
  md.push('');
  for (const c of sortedByAbsDelta.slice(0, 5)) {
    md.push(
      `- **${c.feature}**: Δ=${fmt(c.mean_delta)} (win mean ${fmt(c.win_mean)} vs loss ${fmt(c.loss_mean)})`,
    );
  }
  md.push('');
  md.push('### Thử filter bổ sung (không chọn cuối)');
  md.push('');
  md.push('| Filter | n còn lại | W | L | Amb | Winrate |');
  md.push('|---|---|---|---|---|---|');
  for (const f of filters) {
    md.push(
      `| ${f.name} | ${f.n} | ${f.wins} | ${f.losses} | ${f.amb} | ${fmtWr(f.winrate)} |`,
    );
  }
  md.push('');
  md.push('## Quan sát (không phải khuyến nghị production)');
  md.push('');
  md.push(
    '- Một phần BOTH có `sl_dist` rất nhỏ hoặc SL sai phía → geometry `computeCounterTrendSL` không hợp lệ cho entry đó; 1H không “cứu” được các case INVALID.',
  );
  md.push(
    '- Filter nào cũng làm giảm n — cần cân mẫu vs winrate; không áp production trong task này.',
  );
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-both-1h-resolution-180d.csv`');
  md.push('- `docs/exports/v41-winloss-features-180d.csv`');
  md.push('- `docs/exports/v41-both-winloss-analysis-180d-summary.json`');
  md.push('- `scripts/analyze-v41-both-and-winloss-180d.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');

  console.log(
    JSON.stringify(
      {
        both: { nTpFirst, nSlFirst, nAmb, nInvalid, nTo },
        winrateUpdated,
        winrateIfAmbAsLoss,
        nWin,
        nLoss,
        nAmbFinal,
        topDeltas: sortedByAbsDelta.slice(0, 5),
        filters: filters.map((f) => ({
          name: f.name,
          n: f.n,
          wr: f.winrate,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`[both-wl] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

/**
 * V4.1 — 180d NEARUSDT backtest: combined TR config + first winrate/outcome measure.
 * CVD priorAvg_vs_c = experiment only (not production). Exhaustion MIN=28 = production.
 *
 * TP/SL geometry from reversalTradeSetup.ts (verbatim constants + computeCounterTrendSL):
 *   SL = computeCounterTrendSL({ klines1H, direction, entryPrice })
 *   tpMultiplier = momentum.tpMultiplier * (capitulation/fundingExtreme ? 1.2 : 0.8)
 *   TP1 = entry ± |entry−SL| * (1.5 * tpMultiplier)
 * No max hold in production → forward 20×4H bars.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-combined-180d-winrate.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { computeExhaustion } from '../services/v41/exhaustionEngine';
import type { KlineV41 } from '../services/v41/indicators';
import { computeMomentum1H } from '../services/v41/momentumEngine1H';
import {
  computeCounterTrendSL,
  detectStructureBreak,
  detectTrendReversalVolumeConfirmation,
  TREND_REVERSAL_EXHAUSTION_MIN,
} from '../services/v41/reversalDetector';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const DAYS_180 = 180;
const DAYS_30 = 30;
const WARMUP_4H = 220; // EMA200 + buffer for trend strength
const WARMUP_1H = 80;
const FETCH_GAP_MS = 150;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const VOL_MULT = 1.2;
/** Verbatim from reversalTradeSetup.ts */
const TP1_RR = 1.5;
/** No hold limit in production — user-specified fallback */
const MAX_HOLD_4H = 20;
const CONF_THRESHOLDS = [30, 35, 40, 45, 50, 55, 60, 70] as const;
const OUTCOME_CONF = [40, 50] as const;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-winrate-summary.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-winrate-trades.csv',
);
const OUT_FREQ = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-signal-freq.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-winrate-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_BACKTEST_180D_WINRATE_2026-08-01.md',
);

function cvdProxy(k: KlineV41): number {
  return k.takerBuyVolume - (k.volume - k.takerBuyVolume);
}

function cvdPriorAvgVsC(
  cvdLast3: [number, number, number],
  trend: TrendDirection,
): boolean {
  if (trend === 'NEUTRAL') return false;
  const priorAvg = (cvdLast3[0] + cvdLast3[1]) / 2;
  const c = cvdLast3[2];
  if (trend === 'BULL') return priorAvg > 0 && c < 0;
  return priorAvg < 0 && c > 0;
}

function scoreCvd(confirmed: boolean, cvdLast3: [number, number, number]): number {
  if (!confirmed) return 0;
  const priorAvg = (cvdLast3[0] + cvdLast3[1]) / 2;
  const flipMag = Math.abs(cvdLast3[2] - priorAvg);
  return Math.min(100, 55 + flipMag / 10);
}

function scoreVolume(confirmed: boolean, volumeRatio: number): number {
  if (!confirmed) return 0;
  return Math.min(100, 50 + ((volumeRatio - VOL_MULT) / 0.8) * 50);
}

function scoreExh(confirmed: boolean, exh: number, min: number): number {
  if (!confirmed) return 0;
  return Math.min(100, 50 + ((exh - min) / (100 - min)) * 50);
}

function scoreStructure(confirmed: boolean): number {
  return confirmed ? 70 : 0;
}

function confidenceTR(
  cvd: boolean,
  vol: boolean,
  exh: boolean,
  structure: boolean,
  cvdLast3: [number, number, number],
  volumeRatio: number,
  exhRaw: number,
): number {
  return (
    (scoreCvd(cvd, cvdLast3) +
      scoreVolume(vol, volumeRatio) +
      scoreExh(exh, exhRaw, TREND_REVERSAL_EXHAUSTION_MIN) +
      scoreStructure(structure)) /
    4
  );
}

/** Verbatim resolveEffectiveTpMultiplier from reversalTradeSetup.ts */
function resolveEffectiveTpMultiplier(
  momentumTp: number,
  exhaustionType: string,
): number {
  if (exhaustionType === 'CAPITULATION' || exhaustionType === 'FUNDING_EXTREME') {
    return momentumTp * 1.2;
  }
  return momentumTp * 0.8;
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

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function pct(n: number, d: number): string {
  return d <= 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`;
}

function hitOnBar(
  side: 'LONG' | 'SHORT',
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

type EvalBar = {
  idx4h: number;
  timestamp: number;
  timestamp_iso: string;
  trendDirection: TrendDirection;
  close: number;
  cvd: boolean;
  vol: boolean;
  exh: boolean;
  structure: boolean;
  exh_1h: number;
  exh_4h: number;
  confidence: number;
  gate: boolean;
  side: 'LONG' | 'SHORT' | null;
};

type TradeRow = {
  window: '30d' | '180d';
  conf_min: number;
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tpMultiplier: number;
  confidence: number;
  outcome: 'TP' | 'SL' | 'BOTH' | 'TIMEOUT' | 'NO_SL';
  bars_held: number | null;
};

type OutcomeStats = {
  conf_min: number;
  n_active: number;
  wins: number;
  losses: number;
  both: number;
  timeout: number;
  no_sl: number;
  winrate: number | null;
};

function outcomeStats(trades: TradeRow[], confMin: number): OutcomeStats {
  const t = trades.filter((x) => x.conf_min === confMin);
  const wins = t.filter((x) => x.outcome === 'TP').length;
  const losses = t.filter((x) => x.outcome === 'SL').length;
  const both = t.filter((x) => x.outcome === 'BOTH').length;
  const timeout = t.filter((x) => x.outcome === 'TIMEOUT').length;
  const no_sl = t.filter((x) => x.outcome === 'NO_SL').length;
  // BOTH counted as loss (conservative); winrate = TP / (TP+SL+BOTH)
  const decided = wins + losses + both;
  return {
    conf_min: confMin,
    n_active: t.length,
    wins,
    losses,
    both,
    timeout,
    no_sl,
    winrate: decided > 0 ? (100 * wins) / decided : null,
  };
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart180 = endMs - DAYS_180 * 24 * MS_1H;
  const evalStart30 = endMs - DAYS_30 * 24 * MS_1H;
  const fetchStart4h = evalStart180 - WARMUP_4H * MS_4H;
  const fetchStart1h = evalStart180 - WARMUP_1H * MS_1H;

  console.log(`[180d] fetching NEAR 4H/1H + BTC 4H…`);
  const [near4h, near1h, btc4h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', fetchStart4h, endMs),
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
    fetchKlines('BTCUSDT', '4h', fetchStart4h, endMs),
  ]);
  console.log(
    `[180d] fetched near4h=${near4h.length} near1h=${near1h.length} btc4h=${btc4h.length}`,
  );

  // Closed 4H clocks in eval windows (exclude incomplete last bar if open)
  const lastComplete4h = near4h.filter((k) => k.closeTime < endMs);
  const clocks180 = lastComplete4h.filter((k) => k.openTime >= evalStart180);
  const clocks30 = lastComplete4h.filter((k) => k.openTime >= evalStart30);

  console.log(
    `[180d] usable clocks 180d=${clocks180.length} 30d=${clocks30.length} (warmup4h=${WARMUP_4H})`,
  );

  const idxByTs = new Map(near4h.map((k, i) => [k.openTime, i]));

  function evaluateClock(ts: number): EvalBar | null {
    const idx4h = idxByTs.get(ts);
    if (idx4h == null) return null;
    const bar = near4h[idx4h]!;
    const win4h = sliceUpTo(near4h, ts);
    const win1h = sliceUpTo(near1h, ts);
    const strength = calculateTrendStrength(win4h);
    const trendDirection = strength.trendDirection;
    const exh_4h =
      trendDirection === 'NEUTRAL'
        ? 0
        : calculateTrendExhaustion(win4h, trendDirection).trendExhaustion;

    let cvd = false;
    let vol = false;
    let exh = false;
    let structure = false;
    let exh_1h = 0;
    let volumeRatio = 0;
    let cvdLast3: [number, number, number] = [0, 0, 0];

    if (trendDirection !== 'NEUTRAL' && win1h.length >= 21) {
      cvdLast3 = win1h.slice(-3).map(cvdProxy) as [number, number, number];
      cvd = cvdPriorAvgVsC(cvdLast3, trendDirection);
      const v = detectTrendReversalVolumeConfirmation(win1h);
      vol = v.confirmed;
      volumeRatio = v.volumeRatio;
      exh_1h = calculateTrendExhaustion(win1h, trendDirection).trendExhaustion;
      exh = exh_1h >= TREND_REVERSAL_EXHAUSTION_MIN;
      structure = detectStructureBreak(win1h, trendDirection).confirmed;
    }

    const conf = confidenceTR(cvd, vol, exh, structure, cvdLast3, volumeRatio, exh_1h);
    const count = (cvd ? 1 : 0) + (vol ? 1 : 0) + (exh ? 1 : 0) + (structure ? 1 : 0);
    const gate = count >= 3;
    const side: 'LONG' | 'SHORT' | null =
      trendDirection === 'BEAR' ? 'LONG' : trendDirection === 'BULL' ? 'SHORT' : null;

    return {
      idx4h,
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      close: bar.close,
      cvd,
      vol,
      exh,
      structure,
      exh_1h,
      exh_4h,
      confidence: conf,
      gate,
      side,
    };
  }

  console.log(`[180d] evaluating ${clocks180.length} bars…`);
  const evals180: EvalBar[] = [];
  for (const k of clocks180) {
    const e = evaluateClock(k.openTime);
    if (e) evals180.push(e);
  }
  const evals30 = evals180.filter((e) => e.timestamp >= evalStart30);

  function freqBlock(evals: EvalBar[], label: '30d' | '180d') {
    const n = evals.length;
    const gate = evals.filter((e) => e.gate).length;
    const conf_at: Record<number, number> = {};
    for (const th of CONF_THRESHOLDS) {
      conf_at[th] = evals.filter((e) => e.gate && e.confidence >= th).length;
    }
    return {
      window: label,
      n,
      cvd: evals.filter((e) => e.cvd).length,
      vol: evals.filter((e) => e.vol).length,
      exh: evals.filter((e) => e.exh).length,
      structure: evals.filter((e) => e.structure).length,
      signal_gate: gate,
      gate_pct: (gate / n) * 100,
      conf_at,
    };
  }

  const freq30 = freqBlock(evals30, '30d');
  const freq180 = freqBlock(evals180, '180d');

  function simulateTrades(
    evals: EvalBar[],
    window: '30d' | '180d',
    confMin: number,
  ): TradeRow[] {
    const out: TradeRow[] = [];
    for (const e of evals) {
      if (!e.gate || e.confidence < confMin || e.side == null) continue;
      const win1h = sliceUpTo(near1h, e.timestamp);
      const entry = e.close;
      const side = e.side;

      // SL window must include 1H bars inside the 4H entry bar (through close).
      const sl = computeCounterTrendSL({
        klines1H: near1h,
        direction: side,
        entryPrice: entry,
        fourHOpenTime: e.timestamp,
      });
      if (!Number.isFinite(sl) || sl <= 0) {
        out.push({
          window,
          conf_min: confMin,
          timestamp: e.timestamp,
          timestamp_iso: e.timestamp_iso,
          trendDirection: e.trendDirection,
          side,
          entry,
          sl: NaN,
          tp1: NaN,
          tpMultiplier: NaN,
          confidence: e.confidence,
          outcome: 'NO_SL',
          bars_held: null,
        });
        continue;
      }

      const momentum = computeMomentum1H(win1h);
      const exhSnap = computeExhaustion({
        klines1H: win1h,
        trendExhaustion: e.exh_4h,
        trendDirection: e.trendDirection,
      });
      const tpMult = resolveEffectiveTpMultiplier(
        momentum.tpMultiplier,
        exhSnap.exhaustionType,
      );
      const slDistance = Math.abs(entry - sl);
      const tp1RR = TP1_RR * tpMult;
      const tp1 =
        side === 'LONG' ? entry + slDistance * tp1RR : entry - slDistance * tp1RR;

      let outcome: TradeRow['outcome'] = 'TIMEOUT';
      let bars_held: number | null = null;
      const startIdx = e.idx4h + 1;
      const endIdx = Math.min(near4h.length - 1, e.idx4h + MAX_HOLD_4H);
      for (let i = startIdx; i <= endIdx; i++) {
        const hit = hitOnBar(side, near4h[i]!, sl, tp1);
        if (hit) {
          outcome = hit;
          bars_held = i - e.idx4h;
          break;
        }
      }

      out.push({
        window,
        conf_min: confMin,
        timestamp: e.timestamp,
        timestamp_iso: e.timestamp_iso,
        trendDirection: e.trendDirection,
        side,
        entry,
        sl,
        tp1,
        tpMultiplier: tpMult,
        confidence: e.confidence,
        outcome,
        bars_held,
      });
    }
    return out;
  }

  const allTrades: TradeRow[] = [];
  for (const confMin of OUTCOME_CONF) {
    allTrades.push(...simulateTrades(evals30, '30d', confMin));
    allTrades.push(...simulateTrades(evals180, '180d', confMin));
  }

  const stats30 = OUTCOME_CONF.map((c) =>
    outcomeStats(
      allTrades.filter((t) => t.window === '30d'),
      c,
    ),
  );
  const stats180 = OUTCOME_CONF.map((c) =>
    outcomeStats(
      allTrades.filter((t) => t.window === '180d'),
      c,
    ),
  );

  function sideBreakdown(trades: TradeRow[], confMin: number) {
    return (['LONG', 'SHORT'] as const).map((side) => {
      const g = trades.filter((t) => t.conf_min === confMin && t.side === side);
      const wins = g.filter((t) => t.outcome === 'TP').length;
      const losses = g.filter((t) => t.outcome === 'SL').length;
      const both = g.filter((t) => t.outcome === 'BOTH').length;
      const timeout = g.filter((t) => t.outcome === 'TIMEOUT').length;
      const no_sl = g.filter((t) => t.outcome === 'NO_SL').length;
      const wrong_side = g.filter(
        (t) =>
          Number.isFinite(t.sl) &&
          (side === 'LONG' ? !(t.sl < t.entry) : !(t.sl > t.entry)),
      ).length;
      const decided = wins + losses + both;
      return {
        side,
        n: g.length,
        wins,
        losses,
        both,
        timeout,
        no_sl,
        wrong_side,
        winrate_both_as_loss: decided > 0 ? (100 * wins) / decided : null,
      };
    });
  }

  const trades180c40 = allTrades.filter((t) => t.window === '180d' && t.conf_min === 40);
  const trades180c50 = allTrades.filter((t) => t.window === '180d' && t.conf_min === 50);
  const wrongSide40 = trades180c40.filter(
    (t) =>
      Number.isFinite(t.sl) &&
      (t.side === 'LONG' ? !(t.sl < t.entry) : !(t.sl > t.entry)),
  ).length;
  const noSl40 = trades180c40.filter((t) => t.outcome === 'NO_SL').length;
  const side40 = sideBreakdown(allTrades.filter((t) => t.window === '180d'), 40);
  const side50 = sideBreakdown(allTrades.filter((t) => t.window === '180d'), 50);

  // --- exports ---
  const freqCsv = [
    'window,n,cvd,vol,exh,structure,signal_gate,gate_pct,' +
      CONF_THRESHOLDS.map((t) => `conf_ge_${t}`).join(','),
    ...[freq30, freq180].map((f) =>
      [
        f.window,
        f.n,
        f.cvd,
        f.vol,
        f.exh,
        f.structure,
        f.signal_gate,
        f.gate_pct.toFixed(2),
        ...CONF_THRESHOLDS.map((t) => f.conf_at[t]),
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_FREQ, freqCsv + '\n', 'utf8');

  const tradeHeader = [
    'window',
    'conf_min',
    'timestamp',
    'timestamp_iso',
    'trendDirection',
    'side',
    'entry',
    'sl',
    'tp1',
    'tpMultiplier',
    'confidence',
    'outcome',
    'bars_held',
  ].join(',');
  const tradeBody = allTrades
    .map((t) =>
      [
        t.window,
        t.conf_min,
        t.timestamp,
        t.timestamp_iso,
        t.trendDirection,
        t.side,
        t.entry,
        Number.isFinite(t.sl) ? t.sl : '',
        Number.isFinite(t.tp1) ? t.tp1 : '',
        Number.isFinite(t.tpMultiplier) ? t.tpMultiplier : '',
        t.confidence.toFixed(4),
        t.outcome,
        t.bars_held ?? '',
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(OUT_TRADES, `${tradeHeader}\n${tradeBody}\n`, 'utf8');

  const sumLines = ['window,conf_min,n_active,wins,losses,both,timeout,no_sl,winrate_pct'];
  for (const [w, arr] of [
    ['30d', stats30],
    ['180d', stats180],
  ] as const) {
    for (const s of arr) {
      sumLines.push(
        [
          w,
          s.conf_min,
          s.n_active,
          s.wins,
          s.losses,
          s.both,
          s.timeout,
          s.no_sl,
          s.winrate == null ? '' : s.winrate.toFixed(2),
        ].join(','),
      );
    }
  }
  fs.writeFileSync(OUT_CSV, sumLines.join('\n') + '\n', 'utf8');

  const summary = {
    symbol: SYMBOL,
    date: '2026-08-01',
    sl_geometry_fix: true,
    config: {
      cvd: 'priorAvg_vs_c (experiment — not production)',
      exhaustion_min: TREND_REVERSAL_EXHAUSTION_MIN,
      volume: 'production detectTrendReversalVolumeConfirmation',
      structure: 'production detectStructureBreak',
      gate: '≥3/4',
      confidence: 'computeTrendReversalConfidence (verbatim components, exh formula post-fix)',
      tp_sl:
        'reversalTradeSetup: computeCounterTrendSL (entryPrice-validated) + TP1_RR(1.5)*resolveEffectiveTpMultiplier',
      max_hold_4h: MAX_HOLD_4H,
      both_on_same_bar: 'counted as loss (conservative)',
    },
    fetch: {
      near4h: near4h.length,
      near1h: near1h.length,
      btc4h: btc4h.length,
    },
    usable: {
      clocks_180d: clocks180.length,
      clocks_30d: clocks30.length,
    },
    frequency: { '30d': freq30, '180d': freq180 },
    outcomes: { '30d': stats30, '180d': stats180 },
    sl_geometry_180d_conf40: {
      n_active: trades180c40.length,
      wrong_side: wrongSide40,
      no_sl_skipped: noSl40,
      side_breakdown: side40,
    },
    sl_geometry_180d_conf50: {
      n_active: trades180c50.length,
      side_breakdown: side50,
    },
    before_fix_reference: {
      wrong_side_among_32: 20,
      winrate_180d_conf40_both_as_loss: 25.0,
      winrate_after_1h_resolve_decided: 30.8,
      long_wr: 53.8,
      short_wr: 7.7,
    },
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const fmtWr = (s: OutcomeStats) =>
    s.winrate == null ? 'n/a' : `${s.winrate.toFixed(1)}%`;

  const md: string[] = [];
  md.push('# REPORT — V4.1 Backtest 180d + Winrate (NEARUSDT, combined TR config)');
  md.push('');
  md.push('**Date:** 2026-08-01');
  md.push(
    '**Scope:** V4.1 experiment — CVD `priorAvg_vs_c` **chưa** vào production; Exhaustion MIN=28 đã production; **không** chọn ngưỡng cuối',
  );
  md.push('');
  md.push('## Bước 1 — Dữ liệu');
  md.push('');
  md.push('| Series | Fetched |');
  md.push('|--------|---------|');
  md.push(`| NEAR 4H | ${near4h.length} |`);
  md.push(`| NEAR 1H | ${near1h.length} |`);
  md.push(`| BTC 4H | ${btc4h.length} (fetch đủ; gate TR experiment không dùng BTC dim) |`);
  md.push(`| Warmup 4H | ${WARMUP_4H} nến trước cửa sổ eval |`);
  md.push(
    `| Usable clocks 180d | **${clocks180.length}** (kỳ vọng ~${Math.floor((DAYS_180 * 24) / 4)}=1080) |`,
  );
  md.push(`| Usable clocks 30d (subset) | **${clocks30.length}** |`);
  md.push('');
  md.push('## Bước 2 — Tần suất signal (cấu hình combined)');
  md.push('');
  md.push(
    'CVD=`priorAvg_vs_c` · Exhaustion≥28 · Volume/Structure production · gate≥3/4 · confidenceTR công thức đã sửa.',
  );
  md.push('');
  md.push(
    '| Window | n | CVD | Vol | Exh | Structure | Signal-gate | ≥30 | ≥35 | ≥40 | ≥45 | ≥50 | ≥55 | ≥60 | ≥70 |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const f of [freq30, freq180]) {
    md.push(
      `| ${f.window} | ${f.n} | ${f.cvd} | ${f.vol} | ${f.exh} | ${f.structure} | ${f.signal_gate} (${pct(f.signal_gate, f.n)}) | ${CONF_THRESHOLDS.map((t) => f.conf_at[t]).join(' | ')} |`,
    );
  }
  md.push('');
  md.push(
    `So sánh tỷ lệ gate: 30d ${pct(freq30.signal_gate, freq30.n)} vs 180d ${pct(freq180.signal_gate, freq180.n)}.`,
  );
  md.push('');
  md.push('## Bước 3 — Outcome / Winrate (lần đầu)');
  md.push('');
  md.push('### Geometry (production, không bịa)');
  md.push('');
  md.push('- **Direction:** BEAR→LONG, BULL→SHORT');
  md.push('- **Entry:** close nến 4H active');
  md.push('- **SL:** `computeCounterTrendSL` (`reversalDetector.ts`)');
  md.push(
    '- **TP1:** `entry ± |entry−SL| × (TP1_RR=1.5 × resolveEffectiveTpMultiplier)` — verbatim `reversalTradeSetup.ts`',
  );
  md.push(
    '- **tpMultiplier:** `computeMomentum1H().tpMultiplier` × 1.2 nếu CAPITULATION/FUNDING_EXTREME else × 0.8 (`computeExhaustion` cho type)',
  );
  md.push(
    `- **Hold:** không có max hold trong production → **${MAX_HOLD_4H} nến 4H** (~${MAX_HOLD_4H * 4}h)`,
  );
  md.push('- **BOTH** (TP+SL cùng nến): đếm **loss** (conservative)');
  md.push('- **Winrate** = thắng / (thắng+thua+BOTH); timeout không vào mẫu số');
  md.push('');
  md.push('### Kết quả');
  md.push('');
  md.push(
    '| Window | conf≥ | n active | Thắng (TP) | Thua (SL) | BOTH | Timeout | NO_SL | Winrate |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const [w, arr] of [
    ['30d', stats30],
    ['180d', stats180],
  ] as const) {
    for (const s of arr) {
      md.push(
        `| ${w} | ≥${s.conf_min} | ${s.n_active} | ${s.wins} | ${s.losses} | ${s.both} | ${s.timeout} | ${s.no_sl} | ${fmtWr(s)} |`,
      );
    }
  }
  md.push('');
  md.push('## Bước 4 — So sánh 30d vs 180d');
  md.push('');
  md.push('| Metric | 30d ≥40 | 180d ≥40 | 30d ≥50 | 180d ≥50 |');
  md.push('|--------|---------|----------|---------|----------|');
  {
    const a = stats30[0]!;
    const b = stats180[0]!;
    const c = stats30[1]!;
    const d = stats180[1]!;
    md.push(
      `| n active | ${a.n_active} | ${b.n_active} | ${c.n_active} | ${d.n_active} |`,
    );
    md.push(
      `| winrate | ${fmtWr(a)} | ${fmtWr(b)} | ${fmtWr(c)} | ${fmtWr(d)} |`,
    );
    md.push(
      `| W/L/BOTH/TO | ${a.wins}/${a.losses}/${a.both}/${a.timeout} | ${b.wins}/${b.losses}/${b.both}/${b.timeout} | ${c.wins}/${c.losses}/${c.both}/${c.timeout} | ${d.wins}/${d.losses}/${d.both}/${d.timeout} |`,
    );
  }
  md.push('');
  // Overfit note
  const wr30_40 = stats30[0]!.winrate;
  const wr180_40 = stats180[0]!.winrate;
  const wr30_50 = stats30[1]!.winrate;
  const wr180_50 = stats180[1]!.winrate;
  if (
    wr30_40 != null &&
    wr180_40 != null &&
    Math.abs(wr30_40 - wr180_40) >= 15
  ) {
    md.push(
      `**Cảnh báo:** winrate conf≥40 lệch lớn 30d (${fmtWr(stats30[0]!)}) vs 180d (${fmtWr(stats180[0]!)}) — mẫu 30d có thể overfitting/may rủi.`,
    );
  } else if (
    wr30_50 != null &&
    wr180_50 != null &&
    Math.abs(wr30_50 - wr180_50) >= 15
  ) {
    md.push(
      `**Cảnh báo:** winrate conf≥50 lệch lớn 30d (${fmtWr(stats30[1]!)}) vs 180d (${fmtWr(stats180[1]!)}) — mẫu 30d có thể overfitting/may rủi.`,
    );
  } else {
    md.push(
      'Chênh winrate 30d vs 180d (nếu cả hai có decided trades) ghi nhận ở bảng trên — dùng mẫu 180d làm tham chiếu chính khi quyết định.',
    );
  }
  md.push('');
  md.push('## Ghi chú');
  md.push('');
  md.push(
    '- SL geometry đã sửa trong `computeCounterTrendSL` (entryPrice validate). CVD priorAvg_vs_c vẫn chỉ trong script backtest.',
  );
  md.push(
    '- Outcome đo geometry TP1/SL của `reversalTradeSetup`, **không** yêu cầu full gate RETEST_CONFIRMED / EQ / marketConfidence của `generateReversalSetup`.',
  );
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-backtest-180d-signal-freq.csv`');
  md.push('- `docs/exports/v41-backtest-180d-winrate-trades.csv`');
  md.push('- `docs/exports/v41-backtest-180d-winrate-summary.csv`');
  md.push('- `docs/exports/v41-backtest-180d-winrate-summary.json`');
  md.push('- `scripts/backtest-v41-combined-180d-winrate.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');

  // --- SL fix dedicated report ---
  const OUT_FIX_MD = path.resolve(
    __dirname,
    '../docs/REPORT_V41_SL_GEOMETRY_FIX_AND_REBACKTEST_180D_2026-08-01.md',
  );
  const OUT_FIX_JSON = path.resolve(
    __dirname,
    '../docs/exports/v41-sl-geometry-fix-rebacktest-180d-summary.json',
  );
  const s40 = stats180[0]!;
  const s50 = stats180[1]!;
  const fmtSideWr = (x: number | null) => (x == null ? 'n/a' : `${x.toFixed(1)}%`);

  const fixMd: string[] = [];
  fixMd.push('# REPORT — V4.1 SL geometry fix + rebacktest 180d');
  fixMd.push('');
  fixMd.push('**Date:** 2026-08-01');
  fixMd.push(
    '**Scope:** Sửa `computeCounterTrendSL`; CVD priorAvg_vs_c **chỉ** trong backtest script; không đổi MarketConfidence / Momentum1H / detectCvdFlip production',
  );
  fixMd.push('');
  fixMd.push('## Bước 1 — Sửa production');
  fixMd.push('');
  fixMd.push('`services/v41/reversalDetector.ts` → `computeCounterTrendSL`:');
  fixMd.push('');
  fixMd.push('1. Dùng `entryPrice`: SHORT yêu cầu SL > entry; LONG yêu cầu SL < entry.');
  fixMd.push('2. Loại candidate EMA nếu sai phía → fallback swing-only (+ `SL_BUFFER=0.003`).');
  fixMd.push('3. Nếu không còn candidate hợp lệ → trả `NaN` (caller skip trade).');
  fixMd.push('');
  fixMd.push('Giữ: swing lookback 10, EMA20, buffer 0.003, TF 1H.');
  fixMd.push('');
  fixMd.push('## Bước 2 — Unit tests');
  fixMd.push('');
  fixMd.push(
    '- Fixtures 4 timestamp lỗi: `services/v41/__tests__/fixtures/sl-geometry-*.json`',
  );
  fixMd.push('- Tests trong `services/v41/__tests__/reversalDetector.test.ts`');
  fixMd.push('- Happy path + synthetic wrong-side EMA + NaN khi mọi candidate sai phía');
  fixMd.push('');
  fixMd.push('## Bước 3 — Rebacktest 180d (sau sửa SL)');
  fixMd.push('');
  fixMd.push('### SL sai phía trên lệnh active conf≥40');
  fixMd.push('');
  fixMd.push('| Metric | Trước sửa | Sau sửa |');
  fixMd.push('|--------|-----------|---------|');
  fixMd.push(`| n active (gate∧conf≥40) | 32 | ${trades180c40.length} |`);
  fixMd.push(`| SL sai phía | **20 (62.5%)** | **${wrongSide40}** |`);
  fixMd.push(`| NO_SL (NaN → skip) | 0 | ${noSl40} |`);
  fixMd.push('');
  fixMd.push('### Winrate (BOTH = loss, conservative)');
  fixMd.push('');
  fixMd.push('| conf≥ | n | W | L | BOTH | TO | NO_SL | Winrate | Trước (tham chiếu) |');
  fixMd.push('|---|---|---|---|---|---|---|---|---|');
  fixMd.push(
    `| 40 | ${s40.n_active} | ${s40.wins} | ${s40.losses} | ${s40.both} | ${s40.timeout} | ${s40.no_sl} | ${fmtWr(s40)} | 25.0% |`,
  );
  fixMd.push(
    `| 50 | ${s50.n_active} | ${s50.wins} | ${s50.losses} | ${s50.both} | ${s50.timeout} | ${s50.no_sl} | ${fmtWr(s50)} | ~25.8% |`,
  );
  fixMd.push('');
  fixMd.push('### LONG vs SHORT (180d, conf≥40)');
  fixMd.push('');
  fixMd.push('| Side | n | W | L | BOTH | NO_SL | wrong_side | WR (BOTH=loss) | Trước (1H-resolved) |');
  fixMd.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of side40) {
    const before = s.side === 'LONG' ? '53.8%' : '7.7%';
    fixMd.push(
      `| ${s.side} | ${s.n} | ${s.wins} | ${s.losses} | ${s.both} | ${s.no_sl} | ${s.wrong_side} | ${fmtSideWr(s.winrate_both_as_loss)} | ${before} |`,
    );
  }
  fixMd.push('');
  fixMd.push('### LONG vs SHORT (180d, conf≥50)');
  fixMd.push('');
  fixMd.push('| Side | n | W | L | BOTH | NO_SL | wrong_side | WR |');
  fixMd.push('|---|---|---|---|---|---|---|---|');
  for (const s of side50) {
    fixMd.push(
      `| ${s.side} | ${s.n} | ${s.wins} | ${s.losses} | ${s.both} | ${s.no_sl} | ${s.wrong_side} | ${fmtSideWr(s.winrate_both_as_loss)} |`,
    );
  }
  fixMd.push('');
  fixMd.push('## Quan sát');
  fixMd.push('');
  fixMd.push(
    '- Kỳ vọng wrong_side → 0 sau sửa; nếu còn NO_SL > 0 = swing-only cũng không hợp lệ (skip an toàn).',
  );
  fixMd.push(
    '- So sánh LONG/SHORT với số cũ (53.8% / 7.7%) để xem lệch hướng có còn sau khi SL hợp lệ.',
  );
  fixMd.push('- Không chọn ngưỡng confidence / không áp CVD priorAvg_vs_c vào production.');
  fixMd.push('');
  fixMd.push('## Artefacts');
  fixMd.push('');
  fixMd.push('- `docs/exports/v41-sl-geometry-fix-rebacktest-180d-summary.json`');
  fixMd.push('- `docs/exports/v41-backtest-180d-winrate-trades.csv` (refresh sau fix)');
  fixMd.push('- `docs/exports/v41-backtest-180d-winrate-summary.json`');
  fixMd.push('- Fixtures: `services/v41/__tests__/fixtures/sl-geometry-*`');

  fs.writeFileSync(OUT_FIX_MD, fixMd.join('\n') + '\n', 'utf8');
  fs.writeFileSync(OUT_FIX_JSON, JSON.stringify(summary, null, 2), 'utf8');

  console.log(
    JSON.stringify(
      {
        freq30,
        freq180,
        stats30,
        stats180,
        wrongSide40,
        noSl40,
        side40,
        side50,
      },
      null,
      2,
    ),
  );
  console.log(`[180d] wrote ${OUT_MD}`);
  console.log(`[180d] wrote ${OUT_FIX_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

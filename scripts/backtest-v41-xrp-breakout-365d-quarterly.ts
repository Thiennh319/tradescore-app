/**
 * Task V41-XRP-1 — XRPUSDT Confirm-B breakout baseline: 365d IS + prior-year OOS.
 * NEAR default params + dedupeByBrokenLevel from first run (SOL-4 lessons).
 * Does NOT add XRP to breakout production allow-list.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-xrp-breakout-365d-quarterly.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import {
  BREAKOUT_RETEST_BAND_PCT,
  BREAKOUT_RETEST_MAX_BARS,
  BREAKOUT_TP1_RR,
  scanBreakoutSetups,
  type BreakoutSide,
  type BreakoutTradeLevels,
} from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-08';
const SYMBOL = 'XRPUSDT';
const DAYS = 365;
const WARMUP_1H = 120;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_6H = 6 * MS_1H;
const MAX_HOLD_1H = 80;
const QUARTER_DAYS = 91;
const N_QUARTERS = 4;

/** Pin end for reproducibility (same convention as SOL Task3). */
const EVAL_END_MS = Date.parse('2026-08-08T04:32:23.655Z');
const IS_START_MS = EVAL_END_MS - DAYS * 24 * MS_1H;
const OOS_END_MS = IS_START_MS;
const OOS_START_MS = OOS_END_MS - DAYS * 24 * MS_1H;

const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;
const COST_ROUND_TRIP_PCT = 0.18;

const OUT_CSV = path.resolve(__dirname, '../docs/exports/v41-xrp-1-breakout-365d-quarterly.csv');
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-xrp-1-breakout-365d-quarterly-trades.csv',
);
const OUT_OOS_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-xrp-1-breakout-365d-quarterly-oos-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-xrp-1-breakout-365d-quarterly-summary.json',
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  window: 'IS' | 'OOS';
  active_open_time: number;
  active_iso: string;
  breakout_open_time: number;
  side: BreakoutSide;
  entry: number;
  sl: number;
  tp1: number;
  outcome: Outcome;
  bars_held: number | null;
  sl_dist_pct: number;
  tp1_rr: number;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
  quarter: number;
  half: 'H1' | 'H2';
};

type SliceStats = {
  label: string;
  start_ms: number;
  end_ms: number;
  n_active: number;
  n_decided: number;
  wins: number;
  losses: number;
  both: number;
  timeout: number;
  wr: number;
  e_r_before: number;
  e_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
  long_n: number;
  short_n: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toKlineV41(row: (string | number)[]): KlineV41 {
  return {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6]),
    takerBuyVolume: Number(row[9]),
  };
}

async function fetchKlines(
  symbol: string,
  startTime: number,
  endTime: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1h');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${symbol} 1h HTTP ${res.status}`);
    const batch = (await res.json()) as (string | number)[][];
    if (!batch.length) break;
    for (const row of batch) out.push(toKlineV41(row));
    const next = Number(batch[batch.length - 1]![0]) + MS_1H;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < BINANCE_MAX_LIMIT) break;
  }
  const by = new Map<number, KlineV41>();
  for (const k of out) by.set(k.openTime, k);
  return [...by.values()].sort((a, b) => a.openTime - b.openTime);
}

function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : 'n/a';
}

function signOf(e: number): SliceStats['sign'] {
  if (!Number.isFinite(e)) return 'n/a';
  if (e > 1e-9) return 'positive';
  if (e < -1e-9) return 'negative';
  return 'flat';
}

function hitOnBar(side: BreakoutSide, bar: KlineV41, sl: number, tp1: number): Outcome | null {
  if (side === 'LONG') {
    const hitSl = bar.low <= sl;
    const hitTp = bar.high >= tp1;
    if (hitSl && hitTp) return 'BOTH';
    if (hitSl) return 'SL';
    if (hitTp) return 'TP';
    return null;
  }
  const hitSl = bar.high >= sl;
  const hitTp = bar.low <= tp1;
  if (hitSl && hitTp) return 'BOTH';
  if (hitSl) return 'SL';
  if (hitTp) return 'TP';
  return null;
}

function assignQuarter(ts: number, evalStart: number): number {
  const q = Math.floor((ts - evalStart) / (QUARTER_DAYS * 24 * MS_1H));
  if (q < 0) return 1;
  if (q >= N_QUARTERS) return N_QUARTERS;
  return q + 1;
}

function sliceStats(label: string, trades: TradeRow[], startMs: number, endMs: number): SliceStats {
  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const decided = wins + losses + both;
  const wr = decided > 0 ? (wins / decided) * 100 : NaN;
  const decidedTrades = trades.filter(
    (t) => t.gross_r != null && t.net_r != null && t.outcome !== 'TIMEOUT',
  );
  return {
    label,
    start_ms: startMs,
    end_ms: endMs,
    n_active: trades.length,
    n_decided: decided,
    wins,
    losses,
    both,
    timeout,
    wr,
    e_r_before: mean(decidedTrades.map((t) => t.gross_r!)),
    e_r_after: mean(decidedTrades.map((t) => t.net_r!)),
    sign: signOf(mean(decidedTrades.map((t) => t.net_r!))),
    long_n: trades.filter((t) => t.side === 'LONG').length,
    short_n: trades.filter((t) => t.side === 'SHORT').length,
  };
}

function simulate(
  setup: BreakoutTradeLevels,
  idxByOpen: Map<number, number>,
  klines1h: KlineV41[],
  evalStart: number,
  midMs: number,
  window: 'IS' | 'OOS',
): TradeRow {
  const activeIdx = idxByOpen.get(setup.activeOpenTime);
  let outcome: Outcome = 'TIMEOUT';
  let bars_held: number | null = null;
  if (activeIdx != null) {
    const endIdx = Math.min(klines1h.length - 1, activeIdx + MAX_HOLD_1H);
    for (let i = activeIdx + 1; i <= endIdx; i++) {
      const hit = hitOnBar(setup.side, klines1h[i]!, setup.sl, setup.tp1);
      if (hit) {
        outcome = hit;
        bars_held = i - activeIdx;
        break;
      }
    }
  }
  const fee_r = setup.slDistancePct > 0 ? COST_ROUND_TRIP_PCT / setup.slDistancePct : NaN;
  const gR =
    outcome === 'TP'
      ? setup.tp1RR
      : outcome === 'SL' || outcome === 'BOTH'
        ? -1
        : null;
  const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;
  return {
    window,
    active_open_time: setup.activeOpenTime,
    active_iso: new Date(setup.activeOpenTime).toISOString(),
    breakout_open_time: setup.breakoutOpenTime,
    side: setup.side,
    entry: setup.entry,
    sl: setup.sl,
    tp1: setup.tp1,
    outcome,
    bars_held,
    sl_dist_pct: setup.slDistancePct,
    tp1_rr: setup.tp1RR,
    gross_r: gR,
    fee_r: Number.isFinite(fee_r) ? fee_r : null,
    net_r,
    quarter: assignQuarter(setup.activeOpenTime, evalStart),
    half: setup.activeOpenTime < midMs ? 'H1' : 'H2',
  };
}

function runWindow(
  klines1h: KlineV41[],
  evalStart: number,
  evalEnd: number,
  window: 'IS' | 'OOS',
): { trades: TradeRow[]; slices: SliceStats[]; full: SliceStats } {
  const midMs = evalStart + (DAYS / 2) * 24 * MS_1H;
  const idxByOpen = new Map(klines1h.map((k, i) => [k.openTime, i]));
  const setups = scanBreakoutSetups({
    klines1H: klines1h,
    lookbackN: LOOKBACK_N,
    consolidationMode: 'width',
    maxWidthPct: MAX_WIDTH_PCT,
    confirmMode: 'retest',
    slMode: 'atr_break_level',
    atrMult: ATR_MULT,
    requireStrongBreakout: false,
    retestMaxBars: BREAKOUT_RETEST_MAX_BARS,
    retestBandPct: BREAKOUT_RETEST_BAND_PCT,
    tp1Rr: BREAKOUT_TP1_RR,
    evalStartOpenTime: evalStart,
    evalEndOpenTimeExclusive: evalEnd,
    dedupeByBrokenLevel: true,
    maxHoldBarsForLevelDedupe: MAX_HOLD_1H,
  });
  const trades = setups.map((s) => simulate(s, idxByOpen, klines1h, evalStart, midMs, window));
  const slices: SliceStats[] = [sliceStats(`${window}_FULL_365d`, trades, evalStart, evalEnd)];
  for (let q = 0; q < N_QUARTERS; q++) {
    const qStart = evalStart + q * QUARTER_DAYS * 24 * MS_1H;
    const qEnd =
      q === N_QUARTERS - 1 ? evalEnd : evalStart + (q + 1) * QUARTER_DAYS * 24 * MS_1H;
    const sub = trades.filter((t) => t.active_open_time >= qStart && t.active_open_time < qEnd);
    slices.push(sliceStats(`${window}_Q${q + 1}`, sub, qStart, qEnd));
  }
  for (const half of ['H1', 'H2'] as const) {
    const sub = trades.filter((t) => t.half === half);
    const start = half === 'H1' ? evalStart : midMs;
    const end = half === 'H1' ? midMs : evalEnd;
    slices.push(sliceStats(`${window}_${half}`, sub, start, end));
  }
  return { trades, slices, full: slices[0]! };
}

function clusterStats(trades: TradeRow[]): { cluster_n: number; cluster_trade_n: number } {
  const sorted = [...trades].sort((a, b) => a.active_open_time - b.active_open_time);
  const used = Array(sorted.length).fill(false);
  let cluster_n = 0;
  let cluster_trade_n = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    const c = [i];
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < sorted.length; j++) {
        if (used[j]) continue;
        for (const k of c) {
          if (
            sorted[j]!.side === sorted[k]!.side &&
            Math.abs(sorted[j]!.active_open_time - sorted[k]!.active_open_time) <= MS_6H
          ) {
            c.push(j);
            used[j] = true;
            changed = true;
            break;
          }
        }
      }
    }
    if (c.length >= 2) {
      cluster_n++;
      cluster_trade_n += c.length;
    }
  }
  return { cluster_n, cluster_trade_n };
}

/** Task3 method: max positive-quarter Σnet / Σ positive-quarter nets. */
function concentrationPos(trades: TradeRow[]): {
  pct: number;
  top_quarter: number;
  flag_gt_50: boolean;
  by_quarter: Record<string, number>;
} {
  const byQ: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of trades) {
    if (t.net_r == null) continue;
    byQ[t.quarter] = (byQ[t.quarter] ?? 0) + t.net_r;
  }
  const pos = [1, 2, 3, 4]
    .map((q) => ({ q, v: byQ[q]! }))
    .filter((x) => x.v > 0);
  const posSum = pos.reduce((s, x) => s + x.v, 0);
  let top = 0;
  let max = 0;
  for (const x of pos) {
    if (x.v > max) {
      max = x.v;
      top = x.q;
    }
  }
  const pct = posSum > 0 ? (max / posSum) * 100 : NaN;
  return {
    pct,
    top_quarter: top,
    flag_gt_50: Number.isFinite(pct) && pct > 50,
    by_quarter: {
      Q1: byQ[1]!,
      Q2: byQ[2]!,
      Q3: byQ[3]!,
      Q4: byQ[4]!,
    },
  };
}

function writeTrades(file: string, trades: TradeRow[]): void {
  const header =
    'window,active_open_time,active_iso,breakout_open_time,quarter,half,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r';
  const lines = trades.map((t) =>
    [
      t.window,
      t.active_open_time,
      t.active_iso,
      t.breakout_open_time,
      t.quarter,
      t.half,
      t.side,
      t.entry,
      t.sl,
      t.tp1,
      t.outcome,
      t.bars_held ?? '',
      t.sl_dist_pct,
      t.tp1_rr,
      t.gross_r ?? '',
      t.fee_r ?? '',
      t.net_r ?? '',
    ].join(','),
  );
  fs.writeFileSync(file, [header, ...lines].join('\n') + '\n', 'utf8');
}

async function main(): Promise<void> {
  const fetchStart = OOS_START_MS - WARMUP_1H * MS_1H;
  console.log(`[xrp1] fetch ${SYMBOL} 1H…`);
  console.log(`[xrp1] OOS ${new Date(OOS_START_MS).toISOString()} → ${new Date(OOS_END_MS).toISOString()}`);
  console.log(`[xrp1] IS  ${new Date(IS_START_MS).toISOString()} → ${new Date(EVAL_END_MS).toISOString()}`);

  const klines = await fetchKlines(SYMBOL, fetchStart, EVAL_END_MS);
  const first = klines[0]?.openTime ?? null;
  const last = klines[klines.length - 1]?.openTime ?? null;
  const spanDays =
    first != null && last != null ? (last - first) / (24 * MS_1H) : 0;
  console.log(`[xrp1] 1h=${klines.length} spanDays≈${spanDays.toFixed(1)} first=${first ? new Date(first).toISOString() : 'n/a'}`);

  const dataOkForOos = first != null && first <= OOS_START_MS + 7 * 24 * MS_1H;
  if (!dataOkForOos) {
    console.warn('[xrp1] WARNING: kline history may be short for full OOS window');
  }

  const is = runWindow(klines, IS_START_MS, EVAL_END_MS, 'IS');
  const oos = runWindow(klines, OOS_START_MS, OOS_END_MS, 'OOS');

  console.log(
    `[xrp1] IS n=${is.full.n_active} WR=${fmt(is.full.wr)}% ER=${fmt(is.full.e_r_after, 4)} (${is.full.sign})`,
  );
  console.log(
    `[xrp1] OOS n=${oos.full.n_active} WR=${fmt(oos.full.wr)}% ER=${fmt(oos.full.e_r_after, 4)} (${oos.full.sign})`,
  );

  const isConc = concentrationPos(is.trades);
  const oosConc = concentrationPos(oos.trades);
  const isCl = clusterStats(is.trades);
  const oosCl = clusterStats(oos.trades);
  console.log(
    `[xrp1] IS conc=${fmt(isConc.pct, 1)}% topQ=${isConc.top_quarter} flag>${isConc.flag_gt_50} clusters=${isCl.cluster_n}`,
  );
  console.log(
    `[xrp1] OOS conc=${fmt(oosConc.pct, 1)}% topQ=${oosConc.top_quarter} flag>${oosConc.flag_gt_50} clusters=${oosCl.cluster_n}`,
  );

  writeTrades(OUT_TRADES, is.trades);
  writeTrades(OUT_OOS_TRADES, oos.trades);

  const allSlices = [...is.slices, ...oos.slices];
  const csv = [
    'slice,start_iso,end_iso,n_active,n_decided,wins,losses,both,timeout,wr_pct,e_r_before,e_r_after,sign,long_n,short_n',
    ...allSlices.map((s) =>
      [
        s.label,
        new Date(s.start_ms).toISOString(),
        new Date(s.end_ms).toISOString(),
        s.n_active,
        s.n_decided,
        s.wins,
        s.losses,
        s.both,
        s.timeout,
        fmt(s.wr, 4),
        fmt(s.e_r_before, 6),
        fmt(s.e_r_after, 6),
        s.sign,
        s.long_n,
        s.short_n,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_CSV, csv + '\n', 'utf8');

  const summary = {
    task: 'V41-XRP-1',
    date: DATE,
    symbol: SYMBOL,
    strategy: 'breakout_confirm_b',
    breakout_allow_list: false,
    note: 'Research-only; XRP live routing remains trend_reversal until separate allow-list decision',
    config: {
      lookback_n: LOOKBACK_N,
      max_width_pct: MAX_WIDTH_PCT,
      atr_mult: ATR_MULT,
      confirm_mode: 'retest',
      retest_max_bars: BREAKOUT_RETEST_MAX_BARS,
      retest_band_pct: BREAKOUT_RETEST_BAND_PCT,
      tp1_rr: BREAKOUT_TP1_RR,
      sl_mode: 'atr_break_level',
      require_strong_breakout: false,
      max_hold_1h: MAX_HOLD_1H,
      cost_round_trip_pct: COST_ROUND_TRIP_PCT,
      dedupe_by_broken_level: true,
      btc_filter: false,
    },
    data: {
      klines_1h: klines.length,
      span_days: spanDays,
      first_iso: first ? new Date(first).toISOString() : null,
      last_iso: last ? new Date(last).toISOString() : null,
      oos_data_ok: dataOkForOos,
    },
    is: {
      start_iso: new Date(IS_START_MS).toISOString(),
      end_iso: new Date(EVAL_END_MS).toISOString(),
      full: is.full,
      slices: is.slices,
      concentration: isConc,
      clusters: isCl,
    },
    oos: {
      start_iso: new Date(OOS_START_MS).toISOString(),
      end_iso: new Date(OOS_END_MS).toISOString(),
      full: oos.full,
      slices: oos.slices,
      concentration: oosConc,
      clusters: oosCl,
    },
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`[xrp1] wrote ${OUT_CSV}`);
  console.log(`[xrp1] wrote ${OUT_TRADES}`);
  console.log(`[xrp1] wrote ${OUT_OOS_TRADES}`);
  console.log(`[xrp1] wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

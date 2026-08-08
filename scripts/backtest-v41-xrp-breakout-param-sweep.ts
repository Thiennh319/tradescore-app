/**
 * Task V41-XRP-2 — XRP Confirm-B param sweep with HARD IS+OOS gates on every combo.
 * Lesson from SOL-4: never pick on IS alone then discover OOS later.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-xrp-breakout-param-sweep.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import {
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
const QUARTER_DAYS = 91;
const N_QUARTERS = 4;
const COST_ROUND_TRIP_PCT = 0.18;

const EVAL_END_MS = Date.parse('2026-08-08T04:32:23.655Z');
const IS_START_MS = EVAL_END_MS - DAYS * 24 * MS_1H;
const OOS_END_MS = IS_START_MS;
const OOS_START_MS = OOS_END_MS - DAYS * 24 * MS_1H;

/** Exact XRP-1 baseline thresholds. */
const BASELINE_IS_ER = 0.1963475604462289;
const BASELINE_OOS_ER = 0.17519468291903595;
const BASELINE_IS_WR = 52.72727272727272;
const CONC_MAX = 50;
const SMALL_N_MAX = 4; // n < 5
const SMALL_N_POS_SHARE_MAX = 30;

const OUT_CSV = path.resolve(__dirname, '../docs/exports/v41-xrp-2-sweep-results.csv');
const OUT_JSON = path.resolve(__dirname, '../docs/exports/v41-xrp-2-sweep-results-summary.json');

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type SweepParams = {
  lookback_n: number;
  max_width_pct: number;
  atr_mult: number;
  retest_max_bars: number;
  retest_band_pct: number;
  tp1_rr: number;
  require_strong_breakout: boolean;
  max_hold_1h: number;
};

const DEFAULTS: SweepParams = {
  lookback_n: 20,
  max_width_pct: 5,
  atr_mult: 1,
  retest_max_bars: 10,
  retest_band_pct: 0.005,
  tp1_rr: 1.5,
  require_strong_breakout: false,
  max_hold_1h: 80,
};

const SPACE: Record<keyof SweepParams, Array<number | boolean>> = {
  lookback_n: [10, 15, 20, 30, 40],
  max_width_pct: [3, 4, 5, 7, 10],
  atr_mult: [0.75, 1, 1.25, 1.5, 2],
  retest_max_bars: [5, 8, 10, 15, 20],
  retest_band_pct: [0.003, 0.005, 0.008, 0.01],
  tp1_rr: [1.2, 1.5, 2.0, 2.5],
  require_strong_breakout: [true, false],
  max_hold_1h: [40, 60, 80, 120],
};

type TradeRow = {
  active_open_time: number;
  side: BreakoutSide;
  outcome: Outcome;
  gross_r: number | null;
  net_r: number | null;
  quarter: number;
};

type WindowMetrics = {
  n: number;
  n_decided: number;
  wr: number;
  e_r_before: number;
  e_r_after: number;
  q1_er: number;
  q2_er: number;
  q3_er: number;
  q4_er: number;
  q1_n: number;
  q2_n: number;
  q3_n: number;
  q4_n: number;
  concentration_pos_pct: number;
  top_quarter: number;
  small_n_pos_flag: boolean;
  small_n_pos_detail: string;
  cluster_n: number;
  cluster_trade_n: number;
};

type ComboResult = {
  phase: 'baseline' | 'ofat' | 'combo';
  params: SweepParams;
  is: WindowMetrics;
  oos: WindowMetrics;
  pass_is_er: boolean;
  pass_oos_er: boolean;
  pass_wr: boolean;
  pass_conc_is: boolean;
  pass_conc_oos: boolean;
  pass_small_n_is: boolean;
  pass_small_n_oos: boolean;
  pass_all: boolean;
  reject_reason: string;
  cluster_note: string;
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

async function fetchKlines(symbol: string, startTime: number, endTime: number): Promise<KlineV41[]> {
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

function fmt(n: number, d = 4): string {
  return Number.isFinite(n) ? n.toFixed(d) : '';
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

function simulate(
  setup: BreakoutTradeLevels,
  idxByOpen: Map<number, number>,
  klines1h: KlineV41[],
  evalStart: number,
  maxHold: number,
): TradeRow {
  const activeIdx = idxByOpen.get(setup.activeOpenTime);
  let outcome: Outcome = 'TIMEOUT';
  if (activeIdx != null) {
    const endIdx = Math.min(klines1h.length - 1, activeIdx + maxHold);
    for (let i = activeIdx + 1; i <= endIdx; i++) {
      const hit = hitOnBar(setup.side, klines1h[i]!, setup.sl, setup.tp1);
      if (hit) {
        outcome = hit;
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
    active_open_time: setup.activeOpenTime,
    side: setup.side,
    outcome,
    gross_r: gR,
    net_r,
    quarter: assignQuarter(setup.activeOpenTime, evalStart),
  };
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

function windowMetrics(trades: TradeRow[]): WindowMetrics {
  const decided = trades.filter(
    (t) => t.net_r != null && t.gross_r != null && t.outcome !== 'TIMEOUT',
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  const wr = decided.length ? (wins / decided.length) * 100 : NaN;
  const byQNet: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const byQN: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of trades) {
    byQN[t.quarter] = (byQN[t.quarter] ?? 0) + 1;
    if (t.net_r != null) byQNet[t.quarter] = (byQNet[t.quarter] ?? 0) + t.net_r;
  }
  const qEr = (q: number) => {
    const sub = decided.filter((t) => t.quarter === q);
    return mean(sub.map((t) => t.net_r!));
  };

  const pos = [1, 2, 3, 4]
    .map((q) => ({ q, v: byQNet[q]! }))
    .filter((x) => x.v > 0);
  const posSum = pos.reduce((s, x) => s + x.v, 0);
  let top = 0;
  let maxPos = 0;
  for (const x of pos) {
    if (x.v > maxPos) {
      maxPos = x.v;
      top = x.q;
    }
  }
  const concentration_pos_pct = posSum > 0 ? (maxPos / posSum) * 100 : NaN;

  const smallFlags: string[] = [];
  for (const q of [1, 2, 3, 4]) {
    const n = byQN[q]!;
    const v = byQNet[q]!;
    if (n < 5 && v > 0 && posSum > 0) {
      const share = (v / posSum) * 100;
      if (share > SMALL_N_POS_SHARE_MAX) {
        smallFlags.push(`Q${q}_n=${n}_share=${share.toFixed(1)}%`);
      }
    }
  }

  const clusters = clusterStats(trades);
  return {
    n: trades.length,
    n_decided: decided.length,
    wr,
    e_r_before: mean(decided.map((t) => t.gross_r!)),
    e_r_after: mean(decided.map((t) => t.net_r!)),
    q1_er: qEr(1),
    q2_er: qEr(2),
    q3_er: qEr(3),
    q4_er: qEr(4),
    q1_n: byQN[1]!,
    q2_n: byQN[2]!,
    q3_n: byQN[3]!,
    q4_n: byQN[4]!,
    concentration_pos_pct,
    top_quarter: top,
    small_n_pos_flag: smallFlags.length > 0,
    small_n_pos_detail: smallFlags.join(';'),
    cluster_n: clusters.cluster_n,
    cluster_trade_n: clusters.cluster_trade_n,
  };
}

function runWindow(
  klines: KlineV41[],
  evalStart: number,
  evalEnd: number,
  params: SweepParams,
): TradeRow[] {
  const idxByOpen = new Map(klines.map((k, i) => [k.openTime, i]));
  const setups = scanBreakoutSetups({
    klines1H: klines,
    lookbackN: params.lookback_n,
    consolidationMode: 'width',
    maxWidthPct: params.max_width_pct,
    confirmMode: 'retest',
    slMode: 'atr_break_level',
    atrMult: params.atr_mult,
    requireStrongBreakout: params.require_strong_breakout,
    retestMaxBars: params.retest_max_bars,
    retestBandPct: params.retest_band_pct,
    tp1Rr: params.tp1_rr,
    evalStartOpenTime: evalStart,
    evalEndOpenTimeExclusive: evalEnd,
    dedupeByBrokenLevel: true,
    maxHoldBarsForLevelDedupe: params.max_hold_1h,
  });
  return setups.map((s) => simulate(s, idxByOpen, klines, evalStart, params.max_hold_1h));
}

function paramKey(p: SweepParams): string {
  return [
    p.lookback_n,
    p.max_width_pct,
    p.atr_mult,
    p.retest_max_bars,
    p.retest_band_pct,
    p.tp1_rr,
    p.require_strong_breakout ? 1 : 0,
    p.max_hold_1h,
  ].join('|');
}

function evaluate(
  phase: ComboResult['phase'],
  params: SweepParams,
  klines: KlineV41[],
): ComboResult {
  const isTrades = runWindow(klines, IS_START_MS, EVAL_END_MS, params);
  const oosTrades = runWindow(klines, OOS_START_MS, OOS_END_MS, params);
  const is = windowMetrics(isTrades);
  const oos = windowMetrics(oosTrades);

  const pass_is_er = Number.isFinite(is.e_r_after) && is.e_r_after + 1e-12 >= BASELINE_IS_ER;
  const pass_oos_er = Number.isFinite(oos.e_r_after) && oos.e_r_after + 1e-12 >= BASELINE_OOS_ER;
  const pass_wr = Number.isFinite(is.wr) && is.wr > BASELINE_IS_WR + 1e-9;
  const pass_conc_is = Number.isFinite(is.concentration_pos_pct) && is.concentration_pos_pct <= CONC_MAX;
  const pass_conc_oos =
    Number.isFinite(oos.concentration_pos_pct) && oos.concentration_pos_pct <= CONC_MAX;
  const pass_small_n_is = !is.small_n_pos_flag;
  const pass_small_n_oos = !oos.small_n_pos_flag;

  // Cluster: note only, not auto-fail
  const cluster_note =
    is.cluster_n > 0 || oos.cluster_n > 0
      ? `IS_clusters=${is.cluster_n}(${is.cluster_trade_n});OOS_clusters=${oos.cluster_n}(${oos.cluster_trade_n});likely_reentry_after_exit_same_side_le6h`
      : '';

  const reasons: string[] = [];
  if (!pass_is_er) reasons.push('is_er_below_baseline');
  if (!pass_oos_er) reasons.push('oos_er_below_baseline');
  if (!pass_wr) reasons.push('is_wr_not_above_baseline');
  if (!pass_conc_is) reasons.push('is_concentration>50%');
  if (!pass_conc_oos) reasons.push('oos_concentration>50%');
  if (!pass_small_n_is) reasons.push(`is_small_n_pos>${SMALL_N_POS_SHARE_MAX}%:${is.small_n_pos_detail}`);
  if (!pass_small_n_oos) {
    reasons.push(`oos_small_n_pos>${SMALL_N_POS_SHARE_MAX}%:${oos.small_n_pos_detail}`);
  }

  const pass_all =
    pass_is_er &&
    pass_oos_er &&
    pass_wr &&
    pass_conc_is &&
    pass_conc_oos &&
    pass_small_n_is &&
    pass_small_n_oos;

  return {
    phase,
    params: { ...params },
    is,
    oos,
    pass_is_er,
    pass_oos_er,
    pass_wr,
    pass_conc_is,
    pass_conc_oos,
    pass_small_n_is,
    pass_small_n_oos,
    pass_all,
    reject_reason: pass_all ? '' : reasons.join('|'),
    cluster_note,
  };
}

function buildOfat(): SweepParams[] {
  const out: SweepParams[] = [{ ...DEFAULTS }];
  (Object.keys(SPACE) as (keyof SweepParams)[]).forEach((key) => {
    for (const v of SPACE[key]!) {
      if (v === DEFAULTS[key]) continue;
      out.push({ ...DEFAULTS, [key]: v });
    }
  });
  return out;
}

function pickPromising(rows: ComboResult[]): Partial<Record<keyof SweepParams, Array<number | boolean>>> {
  const picks: Partial<Record<keyof SweepParams, Array<number | boolean>>> = {};
  (Object.keys(SPACE) as (keyof SweepParams)[]).forEach((key) => {
    const related = rows.filter((r) =>
      (Object.keys(DEFAULTS) as (keyof SweepParams)[]).every(
        (k) => k === key || r.params[k] === DEFAULTS[k],
      ),
    );
    // Prefer values that pass both ER gates; then score by min(IS,OOS) ER + WR
    const scored = [...related]
      .map((r) => ({
        v: r.params[key] as number | boolean,
        passEr: r.pass_is_er && r.pass_oos_er,
        score:
          Math.min(r.is.e_r_after || -99, r.oos.e_r_after || -99) * 10 +
          (r.is.wr - BASELINE_IS_WR) * 0.01,
      }))
      .sort((a, b) => {
        if (a.passEr !== b.passEr) return a.passEr ? -1 : 1;
        return b.score - a.score;
      });

    const vals: Array<number | boolean> = [DEFAULTS[key]];
    for (const s of scored) {
      if (!vals.includes(s.v)) vals.push(s.v);
      if (vals.length >= 3) break;
    }
    picks[key] = vals;
  });
  return picks;
}

function cartesianTop2(
  picks: Partial<Record<keyof SweepParams, Array<number | boolean>>>,
): SweepParams[] {
  const keys = Object.keys(DEFAULTS) as (keyof SweepParams)[];
  const top2: Partial<Record<keyof SweepParams, Array<number | boolean>>> = {};
  for (const k of keys) {
    top2[k] = ((picks[k] as Array<number | boolean>) ?? [DEFAULTS[k]]).slice(0, 2);
  }
  let acc: SweepParams[] = [{ ...DEFAULTS }];
  for (const key of keys) {
    const next: SweepParams[] = [];
    for (const base of acc) {
      for (const v of top2[key]!) {
        next.push({ ...base, [key]: v });
      }
    }
    acc = next;
  }
  for (const key of keys) {
    const vals = (picks[key] as Array<number | boolean>) ?? [DEFAULTS[key]];
    for (const v of vals.slice(2)) acc.push({ ...DEFAULTS, [key]: v });
  }
  const seen = new Set<string>();
  const uniq: SweepParams[] = [];
  for (const p of acc) {
    const k = paramKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }
  return uniq;
}

async function main(): Promise<void> {
  console.log(`[xrp2] fetch ${SYMBOL}…`);
  const klines = await fetchKlines(SYMBOL, OOS_START_MS - WARMUP_1H * MS_1H, EVAL_END_MS);
  console.log(`[xrp2] 1h=${klines.length}`);
  console.log(
    `[xrp2] gates IS_ER≥${BASELINE_IS_ER.toFixed(4)} OOS_ER≥${BASELINE_OOS_ER.toFixed(4)} WR>${BASELINE_IS_WR.toFixed(2)}`,
  );

  const results: ComboResult[] = [];
  const seen = new Set<string>();

  const run = (phase: ComboResult['phase'], params: SweepParams) => {
    const k = paramKey(params);
    if (seen.has(k)) return;
    seen.add(k);
    const r = evaluate(phase, params, klines);
    results.push(r);
    console.log(
      `[xrp2] ${phase} IS_ER=${fmt(r.is.e_r_after)} OOS_ER=${fmt(r.oos.e_r_after)} WR=${fmt(r.is.wr, 2)} all=${r.pass_all} ${r.reject_reason || r.cluster_note}`,
    );
  };

  for (const p of buildOfat()) {
    run(paramKey(p) === paramKey(DEFAULTS) ? 'baseline' : 'ofat', p);
  }

  const picks = pickPromising(results);
  console.log('[xrp2] picks', JSON.stringify(picks));
  const combos = cartesianTop2(picks);
  console.log(`[xrp2] combo candidates=${combos.length}`);
  for (const p of combos) run('combo', p);

  results.sort((a, b) => {
    if (a.pass_all !== b.pass_all) return a.pass_all ? -1 : 1;
    if (a.pass_is_er && a.pass_oos_er && !(b.pass_is_er && b.pass_oos_er)) return -1;
    if (b.pass_is_er && b.pass_oos_er && !(a.pass_is_er && a.pass_oos_er)) return 1;
    const aMin = Math.min(a.is.e_r_after || -99, a.oos.e_r_after || -99);
    const bMin = Math.min(b.is.e_r_after || -99, b.oos.e_r_after || -99);
    if (bMin !== aMin) return bMin - aMin;
    return (b.is.wr || 0) - (a.is.wr || 0);
  });

  const header = [
    'phase',
    'lookback_n',
    'max_width_pct',
    'atr_mult',
    'retest_max_bars',
    'retest_band_pct',
    'tp1_rr',
    'require_strong_breakout',
    'max_hold_1h',
    'is_n',
    'is_wr',
    'is_e_r_before',
    'is_e_r_after',
    'is_conc_pct',
    'is_top_q',
    'is_q1_n',
    'is_q2_n',
    'is_q3_n',
    'is_q4_n',
    'is_q1_er',
    'is_q2_er',
    'is_q3_er',
    'is_q4_er',
    'is_cluster_n',
    'is_small_n_flag',
    'oos_n',
    'oos_wr',
    'oos_e_r_before',
    'oos_e_r_after',
    'oos_conc_pct',
    'oos_top_q',
    'oos_q1_n',
    'oos_q2_n',
    'oos_q3_n',
    'oos_q4_n',
    'oos_q1_er',
    'oos_q2_er',
    'oos_q3_er',
    'oos_q4_er',
    'oos_cluster_n',
    'oos_small_n_flag',
    'pass_is_er',
    'pass_oos_er',
    'pass_wr',
    'pass_conc_is',
    'pass_conc_oos',
    'pass_small_n_is',
    'pass_small_n_oos',
    'pass_all',
    'reject_reason',
    'cluster_note',
  ];

  const body = results.map((r) =>
    [
      r.phase,
      r.params.lookback_n,
      r.params.max_width_pct,
      r.params.atr_mult,
      r.params.retest_max_bars,
      r.params.retest_band_pct,
      r.params.tp1_rr,
      r.params.require_strong_breakout,
      r.params.max_hold_1h,
      r.is.n,
      fmt(r.is.wr, 4),
      fmt(r.is.e_r_before, 6),
      fmt(r.is.e_r_after, 6),
      fmt(r.is.concentration_pos_pct, 4),
      r.is.top_quarter,
      r.is.q1_n,
      r.is.q2_n,
      r.is.q3_n,
      r.is.q4_n,
      fmt(r.is.q1_er, 6),
      fmt(r.is.q2_er, 6),
      fmt(r.is.q3_er, 6),
      fmt(r.is.q4_er, 6),
      r.is.cluster_n,
      r.is.small_n_pos_flag,
      r.oos.n,
      fmt(r.oos.wr, 4),
      fmt(r.oos.e_r_before, 6),
      fmt(r.oos.e_r_after, 6),
      fmt(r.oos.concentration_pos_pct, 4),
      r.oos.top_quarter,
      r.oos.q1_n,
      r.oos.q2_n,
      r.oos.q3_n,
      r.oos.q4_n,
      fmt(r.oos.q1_er, 6),
      fmt(r.oos.q2_er, 6),
      fmt(r.oos.q3_er, 6),
      fmt(r.oos.q4_er, 6),
      r.oos.cluster_n,
      r.oos.small_n_pos_flag,
      r.pass_is_er,
      r.pass_oos_er,
      r.pass_wr,
      r.pass_conc_is,
      r.pass_conc_oos,
      r.pass_small_n_is,
      r.pass_small_n_oos,
      r.pass_all,
      `"${r.reject_reason}"`,
      `"${r.cluster_note}"`,
    ].join(','),
  );

  fs.writeFileSync(OUT_CSV, [header.join(','), ...body].join('\n') + '\n', 'utf8');

  const passAll = results.filter((r) => r.pass_all);
  const bothEr = results.filter((r) => r.pass_is_er && r.pass_oos_er);
  const near = results
    .filter((r) => !r.pass_all)
    .slice(0, 25);

  // Reject reason counts
  const reasonCounts: Record<string, number> = {};
  for (const r of results) {
    if (r.pass_all) continue;
    for (const part of r.reject_reason.split('|')) {
      const key = part.split(':')[0] || part;
      reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
    }
  }

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        task: 'V41-XRP-2',
        date: DATE,
        symbol: SYMBOL,
        baseline_is_er: BASELINE_IS_ER,
        baseline_oos_er: BASELINE_OOS_ER,
        baseline_is_wr: BASELINE_IS_WR,
        n_evaluated: results.length,
        n_pass_all: passAll.length,
        n_both_er_gates: bothEr.length,
        picks,
        reason_counts: reasonCounts,
        pass_all: passAll,
        near_miss: near,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(
    `[xrp2] evaluated=${results.length} pass_all=${passAll.length} both_er=${bothEr.length}`,
  );
  console.log(`[xrp2] reject_counts`, JSON.stringify(reasonCounts));
  console.log(`[xrp2] wrote ${OUT_CSV}`);
  console.log(`[xrp2] wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

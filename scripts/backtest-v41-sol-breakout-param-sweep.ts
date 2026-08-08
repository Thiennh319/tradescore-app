/**
 * Task V41-SOL-4 / Task4 — SOL Confirm-B param sweep (OFAT → small combo).
 * Uses Task1 level-occupancy dedupe. Profit-first: E[R] after ≥ baseline, then WR↑.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-sol-breakout-param-sweep.ts
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
const SYMBOL = 'SOLUSDT';
const DAYS = 365;
const WARMUP_1H = 120;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const QUARTER_DAYS = 91;
const N_QUARTERS = 4;
const EVAL_END_MS = Date.parse('2026-08-08T04:32:23.655Z');

/** Task3 clean baseline thresholds. */
const BASELINE_ER_AFTER = 0.08364635880431151;
const BASELINE_WR = 47.5;
/** Soft OOS floor ("không âm nặng"). */
const OOS_ER_FLOOR = -0.05;
const CONCENTRATION_MAX_PCT = 50;
const MS_6H = 6 * MS_1H;

const COST_ROUND_TRIP_PCT = 0.18;

const OUT_CSV = path.resolve(__dirname, '../docs/exports/v41-sol-4-sweep-results.csv');
const OUT_JSON = path.resolve(__dirname, '../docs/exports/v41-sol-4-sweep-results-summary.json');

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

const SPACE: Record<keyof SweepParams, SweepParams[keyof SweepParams][]> = {
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
  half: 'H1' | 'H2';
};

type ComboResult = {
  phase: 'ofat' | 'combo' | 'baseline';
  params: SweepParams;
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
  h1_er: number;
  h2_er: number;
  h1_wr: number;
  h2_wr: number;
  concentration_pos_pct: number;
  concentration_abs_pct: number;
  top_quarter: number;
  cluster_n: number;
  cluster_trade_n: number;
  pass_er: boolean;
  pass_wr_better: boolean;
  pass_wf: boolean;
  pass_concentration: boolean;
  pass_dedup: boolean;
  pass_all: boolean;
  reject_reason: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toKlineV41(row: (string | number)[]): KlineV41 {
  const openTime = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  const volume = Number(row[5]);
  const closeTime = Number(row[6]);
  const takerBuyVolume = Number(row[9]);
  return { openTime, open, high, low, close, volume, closeTime, takerBuyVolume };
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

function hitOnBar(
  side: BreakoutSide,
  bar: KlineV41,
  sl: number,
  tp1: number,
): Outcome | null {
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
  midMs: number,
  maxHold1H: number,
): TradeRow {
  const activeIdx = idxByOpen.get(setup.activeOpenTime);
  let outcome: Outcome = 'TIMEOUT';
  if (activeIdx != null) {
    const endIdx = Math.min(klines1h.length - 1, activeIdx + maxHold1H);
    for (let i = activeIdx + 1; i <= endIdx; i++) {
      const hit = hitOnBar(setup.side, klines1h[i]!, setup.sl, setup.tp1);
      if (hit) {
        outcome = hit;
        break;
      }
    }
  }
  const fee_r =
    setup.slDistancePct > 0 ? COST_ROUND_TRIP_PCT / setup.slDistancePct : NaN;
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
    half: setup.activeOpenTime < midMs ? 'H1' : 'H2',
  };
}

function sliceEr(trades: TradeRow[]): { wr: number; e_r_before: number; e_r_after: number; n: number } {
  const decided = trades.filter(
    (t) => t.gross_r != null && t.net_r != null && t.outcome !== 'TIMEOUT',
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  const wr = decided.length ? (wins / decided.length) * 100 : NaN;
  return {
    n: trades.length,
    wr,
    e_r_before: mean(decided.map((t) => t.gross_r!)),
    e_r_after: mean(decided.map((t) => t.net_r!)),
  };
}

/** Same-side ≤6h transitive clusters (Task1 algorithm). */
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

/**
 * Concentration (Task3 Q3 method): max positive-quarter Σnet / Σ positive-quarter nets.
 * Reject if >50%.
 */
function concentrationPos(trades: TradeRow[]): { pct: number; topQ: number; absPct: number } {
  const byQ = [0, 0, 0, 0, 0];
  for (const t of trades) {
    if (t.net_r == null) continue;
    byQ[t.quarter] = (byQ[t.quarter] ?? 0) + t.net_r;
  }
  const pos = [1, 2, 3, 4].map((q) => ({ q, v: byQ[q]! })).filter((x) => x.v > 0);
  const posSum = pos.reduce((s, x) => s + x.v, 0);
  let topQ = 0;
  let maxPos = 0;
  for (const x of pos) {
    if (x.v > maxPos) {
      maxPos = x.v;
      topQ = x.q;
    }
  }
  const pct = posSum > 0 ? (maxPos / posSum) * 100 : NaN;

  const absSum = [1, 2, 3, 4].reduce((s, q) => s + Math.abs(byQ[q]!), 0);
  let maxAbs = 0;
  for (const q of [1, 2, 3, 4]) {
    const a = Math.abs(byQ[q]!);
    if (a > maxAbs) maxAbs = a;
  }
  const absPct = absSum > 0 ? (maxAbs / absSum) * 100 : NaN;
  return { pct, topQ, absPct };
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

function evaluateCombo(
  phase: ComboResult['phase'],
  params: SweepParams,
  klines1h: KlineV41[],
  idxByOpen: Map<number, number>,
  evalStart: number,
  endMs: number,
  midMs: number,
): ComboResult {
  const setups = scanBreakoutSetups({
    klines1H: klines1h,
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
    evalEndOpenTimeExclusive: endMs,
    dedupeByBrokenLevel: true,
    maxHoldBarsForLevelDedupe: params.max_hold_1h,
  });

  const trades = setups.map((s) =>
    simulate(s, idxByOpen, klines1h, evalStart, midMs, params.max_hold_1h),
  );
  const full = sliceEr(trades);
  const q = (n: number) => sliceEr(trades.filter((t) => t.quarter === n));
  const h1 = sliceEr(trades.filter((t) => t.half === 'H1'));
  const h2 = sliceEr(trades.filter((t) => t.half === 'H2'));
  const conc = concentrationPos(trades);
  const clusters = clusterStats(trades);

  const pass_er =
    Number.isFinite(full.e_r_after) && full.e_r_after + 1e-12 >= BASELINE_ER_AFTER;
  const pass_wr_better = Number.isFinite(full.wr) && full.wr > BASELINE_WR + 1e-9;
  const pass_wf =
    Number.isFinite(h1.e_r_after) &&
    h1.e_r_after >= 0 &&
    Number.isFinite(h2.e_r_after) &&
    h2.e_r_after >= OOS_ER_FLOOR;
  const pass_concentration =
    Number.isFinite(conc.pct) && conc.pct <= CONCENTRATION_MAX_PCT;
  const pass_dedup = clusters.cluster_n === 0;

  const reasons: string[] = [];
  if (!pass_er) reasons.push('er_below_baseline');
  if (!pass_wr_better) reasons.push('wr_not_above_baseline');
  if (!pass_wf) reasons.push('walk_forward_fail');
  if (!pass_concentration) reasons.push('concentration>50%_posQ');
  if (!pass_dedup) reasons.push(`dedup_clusters=${clusters.cluster_n}`);

  const pass_all =
    pass_er && pass_wr_better && pass_wf && pass_concentration && pass_dedup;

  return {
    phase,
    params: { ...params },
    n: full.n,
    n_decided: trades.filter((t) => t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH')
      .length,
    wr: full.wr,
    e_r_before: full.e_r_before,
    e_r_after: full.e_r_after,
    q1_er: q(1).e_r_after,
    q2_er: q(2).e_r_after,
    q3_er: q(3).e_r_after,
    q4_er: q(4).e_r_after,
    q1_n: q(1).n,
    q2_n: q(2).n,
    q3_n: q(3).n,
    q4_n: q(4).n,
    h1_er: h1.e_r_after,
    h2_er: h2.e_r_after,
    h1_wr: h1.wr,
    h2_wr: h2.wr,
    concentration_pos_pct: conc.pct,
    concentration_abs_pct: conc.absPct,
    top_quarter: conc.topQ,
    cluster_n: clusters.cluster_n,
    cluster_trade_n: clusters.cluster_trade_n,
    pass_er,
    pass_wr_better,
    pass_wf,
    pass_concentration,
    pass_dedup,
    pass_all,
    reject_reason: pass_all ? '' : reasons.join('|'),
  };
}

function buildOfatParams(): SweepParams[] {
  const out: SweepParams[] = [{ ...DEFAULTS }];
  (Object.keys(SPACE) as (keyof SweepParams)[]).forEach((key) => {
    for (const v of SPACE[key]!) {
      if (v === DEFAULTS[key]) continue;
      out.push({ ...DEFAULTS, [key]: v });
    }
  });
  return out;
}

function pickPromising(ofat: ComboResult[]): Partial<Record<keyof SweepParams, number[] | boolean[]>> {
  /** Per-param values that kept E[R]≥baseline and (WR↑ or E[R]↑ vs baseline). */
  const picks: Partial<Record<keyof SweepParams, Array<number | boolean>>> = {};
  (Object.keys(SPACE) as (keyof SweepParams)[]).forEach((key) => {
    const related = ofat.filter((r) => {
      // only OFAT rows that differ solely on this key (or default)
      const p = r.params;
      return (Object.keys(DEFAULTS) as (keyof SweepParams)[]).every(
        (k) => k === key || p[k] === DEFAULTS[k],
      );
    });
    const scored = related
      .filter((r) => r.pass_er)
      .map((r) => ({
        v: r.params[key],
        wr: r.wr,
        er: r.e_r_after,
        score: (r.e_r_after - BASELINE_ER_AFTER) * 10 + (r.wr - BASELINE_WR) * 0.01,
      }))
      .sort((a, b) => b.score - a.score);

    const vals: Array<number | boolean> = [DEFAULTS[key]];
    for (const s of scored) {
      if (!vals.includes(s.v)) vals.push(s.v);
      if (vals.length >= 3) break;
    }
    // If nothing beat or matched ER, still keep default + best ER OFAT value
    if (vals.length === 1) {
      const best = [...related].sort((a, b) => b.e_r_after - a.e_r_after)[0];
      if (best && !vals.includes(best.params[key])) vals.push(best.params[key]);
    }
    picks[key] = vals as number[] & boolean[];
  });
  return picks as Partial<Record<keyof SweepParams, number[] | boolean[]>>;
}

function cartesianCombos(
  picks: Partial<Record<keyof SweepParams, Array<number | boolean>>>,
): SweepParams[] {
  const keys = Object.keys(DEFAULTS) as (keyof SweepParams)[];
  // Prefer pairwise / small product: start from default, expand one dim at a time
  // then add full product of top-2 per dim capped.
  const top2: Partial<Record<keyof SweepParams, Array<number | boolean>>> = {};
  for (const k of keys) {
    const vals = (picks[k] as Array<number | boolean> | undefined) ?? [DEFAULTS[k]];
    top2[k] = vals.slice(0, 2);
  }

  let acc: SweepParams[] = [{ ...DEFAULTS }];
  for (const key of keys) {
    const values = top2[key]!;
    const next: SweepParams[] = [];
    for (const base of acc) {
      for (const v of values) {
        next.push({ ...base, [key]: v });
      }
    }
    acc = next;
  }

  // Also add OFAT-style "best single dim + default neighbors" already covered;
  // add up to 3rd value × defaults for dims that had 3 picks
  for (const key of keys) {
    const vals = (picks[key] as Array<number | boolean> | undefined) ?? [DEFAULTS[key]];
    for (const v of vals.slice(2)) {
      acc.push({ ...DEFAULTS, [key]: v });
    }
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

function fmt(n: number, d = 4): string {
  return Number.isFinite(n) ? n.toFixed(d) : '';
}

async function main(): Promise<void> {
  const endMs = EVAL_END_MS;
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const midMs = evalStart + (DAYS / 2) * 24 * MS_1H;
  const fetchStart = evalStart - WARMUP_1H * MS_1H;

  console.log(`[sol4-t4] fetch ${SYMBOL} 1H…`);
  const klines1h = await fetchKlines(SYMBOL, fetchStart, endMs);
  const idxByOpen = new Map(klines1h.map((k, i) => [k.openTime, i]));
  console.log(`[sol4-t4] 1h=${klines1h.length} baseline_er=${BASELINE_ER_AFTER}`);

  const results: ComboResult[] = [];
  const seen = new Set<string>();

  const run = (phase: ComboResult['phase'], params: SweepParams) => {
    const k = paramKey(params);
    if (seen.has(k)) return;
    seen.add(k);
    const r = evaluateCombo(phase, params, klines1h, idxByOpen, evalStart, endMs, midMs);
    results.push(r);
    console.log(
      `[sol4-t4] ${phase} n=${r.n} WR=${fmt(r.wr, 2)} ER=${fmt(r.e_r_after, 4)} conc=${fmt(r.concentration_pos_pct, 1)}% wf=${r.pass_wf} all=${r.pass_all} ${r.reject_reason}`,
    );
  };

  // Phase A — OFAT
  for (const p of buildOfatParams()) {
    const isDefault = paramKey(p) === paramKey(DEFAULTS);
    run(isDefault ? 'baseline' : 'ofat', p);
  }

  const ofatRows = results.filter((r) => r.phase === 'ofat' || r.phase === 'baseline');
  const picks = pickPromising(ofatRows);
  console.log('[sol4-t4] promising picks', JSON.stringify(picks));

  // Phase B — combo of promising values
  const combos = cartesianCombos(picks);
  console.log(`[sol4-t4] combo candidates=${combos.length}`);
  for (const p of combos) {
    run('combo', p);
  }

  // Sort for report
  results.sort((a, b) => {
    if (a.pass_all !== b.pass_all) return a.pass_all ? -1 : 1;
    if (a.pass_er !== b.pass_er) return a.pass_er ? -1 : 1;
    if (b.wr !== a.wr) return b.wr - a.wr;
    return b.e_r_after - a.e_r_after;
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
    'n',
    'n_decided',
    'wr_pct',
    'e_r_before',
    'e_r_after',
    'h1_er',
    'h2_er',
    'h1_wr',
    'h2_wr',
    'q1_er',
    'q2_er',
    'q3_er',
    'q4_er',
    'q1_n',
    'q2_n',
    'q3_n',
    'q4_n',
    'concentration_pos_pct',
    'concentration_abs_pct',
    'top_quarter',
    'cluster_n',
    'cluster_trade_n',
    'pass_er',
    'pass_wr_better',
    'pass_wf',
    'pass_concentration',
    'pass_dedup',
    'pass_all',
    'reject_reason',
  ];

  const csvBody = results.map((r) =>
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
      r.n,
      r.n_decided,
      fmt(r.wr, 4),
      fmt(r.e_r_before, 6),
      fmt(r.e_r_after, 6),
      fmt(r.h1_er, 6),
      fmt(r.h2_er, 6),
      fmt(r.h1_wr, 4),
      fmt(r.h2_wr, 4),
      fmt(r.q1_er, 6),
      fmt(r.q2_er, 6),
      fmt(r.q3_er, 6),
      fmt(r.q4_er, 6),
      r.q1_n,
      r.q2_n,
      r.q3_n,
      r.q4_n,
      fmt(r.concentration_pos_pct, 4),
      fmt(r.concentration_abs_pct, 4),
      r.top_quarter,
      r.cluster_n,
      r.cluster_trade_n,
      r.pass_er,
      r.pass_wr_better,
      r.pass_wf,
      r.pass_concentration,
      r.pass_dedup,
      r.pass_all,
      `"${r.reject_reason}"`,
    ].join(','),
  );

  fs.writeFileSync(OUT_CSV, [header.join(','), ...csvBody].join('\n') + '\n', 'utf8');

  const passAll = results.filter((r) => r.pass_all);
  const nearMiss = results.filter((r) => r.pass_er && r.pass_dedup).slice(0, 20);

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        task: 'V41-SOL-4-Task4',
        date: DATE,
        baseline_er_after: BASELINE_ER_AFTER,
        baseline_wr: BASELINE_WR,
        n_evaluated: results.length,
        n_pass_all: passAll.length,
        picks,
        pass_all: passAll,
        near_miss: nearMiss,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`[sol4-t4] evaluated=${results.length} pass_all=${passAll.length}`);
  console.log(`[sol4-t4] wrote ${OUT_CSV}`);
  console.log(`[sol4-t4] wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

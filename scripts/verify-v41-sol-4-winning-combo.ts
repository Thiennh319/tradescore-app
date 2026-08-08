/**
 * Task V41-SOL-4 / Task4b — Verify winning combo trade-level + true prior-year OOS.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/verify-v41-sol-4-winning-combo.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import {
  BREAKOUT_RETEST_MAX_BARS,
  barTouchesLevel,
  detectBreakoutAtIndex,
  findRetestBarIndex,
  scanBreakoutSetups,
  type BreakoutSide,
  type BreakoutTradeLevels,
} from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'SOLUSDT';
const MS_1H = 3_600_000;
const MS_6H = 6 * MS_1H;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP_1H = 120;
const DAYS = 365;
const QUARTER_DAYS = 91;
const N_QUARTERS = 4;
const MAX_HOLD_1H = 80;
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;
const COST_ROUND_TRIP_PCT = 0.18;

/** Same pin as Task3/4. */
const EVAL_END_MS = Date.parse('2026-08-08T04:32:23.655Z');
const EVAL_START_MS = EVAL_END_MS - DAYS * 24 * MS_1H;
/** True OOS: 365d immediately before IS window. */
const OOS_END_MS = EVAL_START_MS;
const OOS_START_MS = OOS_END_MS - DAYS * 24 * MS_1H;

const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-winning-combo-trades.csv',
);
const OUT_OOS_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-winning-combo-oos-prior365d-trades.csv',
);
const OUT_OOS_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-winning-combo-oos-prior365d-summary.json',
);
const OUT_DIFF_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-task4b-dropped-trades.json',
);
const BASELINE_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-breakout-365d-quarterly-clean-trades.csv',
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
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
  net_pnl_pct: number | null;
  quarter: number;
  half: 'H1' | 'H2';
  range_high: number;
  range_low: number;
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

function netPnlPct(side: BreakoutSide, entry: number, exitPrice: number, costPct: number): number {
  const move =
    side === 'LONG'
      ? ((exitPrice - entry) / entry) * 100
      : ((entry - exitPrice) / entry) * 100;
  return move - costPct;
}

function simulate(
  setup: BreakoutTradeLevels,
  idxByOpen: Map<number, number>,
  klines1h: KlineV41[],
  evalStart: number,
  midMs: number,
  maxHold: number,
): TradeRow {
  const activeIdx = idxByOpen.get(setup.activeOpenTime);
  let outcome: Outcome = 'TIMEOUT';
  let bars_held: number | null = null;
  if (activeIdx != null) {
    const endIdx = Math.min(klines1h.length - 1, activeIdx + maxHold);
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
  let net_pnl_pct: number | null = null;
  if (outcome === 'TP') {
    net_pnl_pct = netPnlPct(setup.side, setup.entry, setup.tp1, COST_ROUND_TRIP_PCT);
  } else if (outcome === 'SL' || outcome === 'BOTH') {
    net_pnl_pct = netPnlPct(setup.side, setup.entry, setup.sl, COST_ROUND_TRIP_PCT);
  }
  return {
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
    net_pnl_pct,
    quarter: assignQuarter(setup.activeOpenTime, evalStart),
    half: setup.activeOpenTime < midMs ? 'H1' : 'H2',
    range_high: setup.rangeHigh,
    range_low: setup.rangeLow,
  };
}

function runWindow(
  klines1h: KlineV41[],
  evalStart: number,
  evalEnd: number,
  bandPct: number,
  tp1Rr: number,
): { setups: BreakoutTradeLevels[]; trades: TradeRow[] } {
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
    retestBandPct: bandPct,
    tp1Rr,
    evalStartOpenTime: evalStart,
    evalEndOpenTimeExclusive: evalEnd,
    dedupeByBrokenLevel: true,
    maxHoldBarsForLevelDedupe: MAX_HOLD_1H,
  });
  const trades = setups.map((s) => simulate(s, idxByOpen, klines1h, evalStart, midMs, MAX_HOLD_1H));
  return { setups, trades };
}

function writeTradesCsv(file: string, trades: TradeRow[]): void {
  const header =
    'active_open_time,active_iso,breakout_open_time,quarter,half,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r,net_pnl_pct,range_high,range_low';
  const lines = trades.map((t) =>
    [
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
      t.net_pnl_pct ?? '',
      t.range_high,
      t.range_low,
    ].join(','),
  );
  fs.writeFileSync(file, [header, ...lines].join('\n') + '\n', 'utf8');
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

function sliceEr(trades: TradeRow[]) {
  const decided = trades.filter(
    (t) => t.net_r != null && t.gross_r != null && t.outcome !== 'TIMEOUT',
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  return {
    n: trades.length,
    n_decided: decided.length,
    wr: decided.length ? (wins / decided.length) * 100 : NaN,
    e_r_before: mean(decided.map((t) => t.gross_r!)),
    e_r_after: mean(decided.map((t) => t.net_r!)),
  };
}

/** Closest approach of any bar in retest window to broken level (fraction of level). */
function closestApproachPct(
  klines: KlineV41[],
  breakoutIdx: number,
  level: number,
  maxBars: number,
): { minDistPct: number; barOpenTime: number | null; touched005: boolean; touched003: boolean } {
  const last = Math.min(klines.length - 1, breakoutIdx + maxBars);
  let minDist = Infinity;
  let barOpenTime: number | null = null;
  for (let i = breakoutIdx + 1; i <= last; i++) {
    const bar = klines[i]!;
    // Distance of nearest wick to level
    const above = bar.low - level;
    const below = level - bar.high;
    let d: number;
    if (bar.low <= level && bar.high >= level) d = 0;
    else if (bar.low > level) d = above;
    else d = below;
    const pct = Math.abs(d) / level;
    if (pct < minDist) {
      minDist = pct;
      barOpenTime = bar.openTime;
    }
  }
  return {
    minDistPct: Number.isFinite(minDist) ? minDist : NaN,
    barOpenTime,
    touched005: findRetestBarIndex(
      klines,
      {
        side: 'LONG',
        breakoutIndex: breakoutIdx,
        openTime: klines[breakoutIdx]!.openTime,
        close: klines[breakoutIdx]!.close,
        rangeHigh: level,
        rangeLow: level,
      } as never,
      maxBars,
      0.005,
    ) != null, // placeholder — caller uses proper event
    touched003: false,
  };
}

function analyzeDrop(
  dropped: BreakoutTradeLevels,
  klines: KlineV41[],
): {
  level: number;
  minDistPct: number;
  minDistBarIso: string | null;
  retestIdx005: number | null;
  retestIdx003: number | null;
  reason: string;
} {
  const breakoutIdx = klines.findIndex((k) => k.openTime === dropped.breakoutOpenTime);
  const level = dropped.side === 'LONG' ? dropped.rangeHigh : dropped.rangeLow;
  if (breakoutIdx < 0) {
    return {
      level,
      minDistPct: NaN,
      minDistBarIso: null,
      retestIdx005: null,
      retestIdx003: null,
      reason: 'breakout_bar_not_found_in_klines',
    };
  }
  const event = detectBreakoutAtIndex(klines, breakoutIdx, LOOKBACK_N);
  // Prefer stored level from setup (Donchian at break may match event)
  const synth = event ?? {
    side: dropped.side,
    breakoutIndex: breakoutIdx,
    openTime: dropped.breakoutOpenTime,
    close: klines[breakoutIdx]!.close,
    rangeHigh: dropped.rangeHigh,
    rangeLow: dropped.rangeLow,
  };

  const retestIdx005 = findRetestBarIndex(klines, synth as never, BREAKOUT_RETEST_MAX_BARS, 0.005);
  const retestIdx003 = findRetestBarIndex(klines, synth as never, BREAKOUT_RETEST_MAX_BARS, 0.003);

  let minDist = Infinity;
  let minIso: string | null = null;
  const last = Math.min(klines.length - 1, breakoutIdx + BREAKOUT_RETEST_MAX_BARS);
  for (let i = breakoutIdx + 1; i <= last; i++) {
    const bar = klines[i]!;
    let d: number;
    if (bar.low <= level && bar.high >= level) d = 0;
    else if (bar.low > level) d = bar.low - level;
    else d = level - bar.high;
    const pct = Math.abs(d) / level;
    if (pct < minDist) {
      minDist = pct;
      minIso = new Date(bar.openTime).toISOString();
    }
  }

  let reason: string;
  if (retestIdx005 != null && retestIdx003 == null) {
    reason = `retest_outside_band_0.003: closest_approach=${(minDist * 100).toFixed(3)}% of level (needs ≤0.3%; old band ≤0.5%)`;
  } else if (retestIdx005 == null) {
    reason = 'unexpected: no retest even at 0.005 — may be momentum/dedupe path difference';
  } else if (retestIdx003 != null && retestIdx003 !== retestIdx005) {
    reason = `retest_bar_shifted_under_tighter_band (005→bar ${retestIdx005}, 003→bar ${retestIdx003}) — may change entry/dedupe`;
  } else {
    reason =
      'setup removed indirectly (dedupe occupancy / different confirm cascade under tighter band), not a pure miss-touch';
  }

  return {
    level,
    minDistPct: minDist,
    minDistBarIso: minIso,
    retestIdx005,
    retestIdx003,
    reason,
  };
}

function loadBaselineCsv(): Map<number, { outcome: string; net_r: number; side: string; entry: number; iso: string; quarter: string }> {
  const text = fs.readFileSync(BASELINE_TRADES, 'utf8').trim().split(/\r?\n/);
  const hdr = text[0]!.split(',');
  const map = new Map<
    number,
    { outcome: string; net_r: number; side: string; entry: number; iso: string; quarter: string }
  >();
  for (const line of text.slice(1)) {
    const cols = line.split(',');
    const o: Record<string, string> = {};
    hdr.forEach((h, i) => (o[h] = cols[i]!));
    map.set(+o.active_open_time!, {
      outcome: o.outcome!,
      net_r: +o.net_r!,
      side: o.side!,
      entry: +o.entry!,
      iso: o.active_iso!,
      quarter: o.quarter!,
    });
  }
  return map;
}

async function main(): Promise<void> {
  console.log('[4b] fetch 1H covering OOS+IS…');
  const fetchStart = OOS_START_MS - WARMUP_1H * MS_1H;
  const klines = await fetchKlines(SYMBOL, fetchStart, EVAL_END_MS);
  console.log(
    `[4b] 1h=${klines.length} OOS ${new Date(OOS_START_MS).toISOString()}→${new Date(OOS_END_MS).toISOString()}`,
  );
  console.log(
    `[4b] IS  ${new Date(EVAL_START_MS).toISOString()}→${new Date(EVAL_END_MS).toISOString()}`,
  );

  const baseline = runWindow(klines, EVAL_START_MS, EVAL_END_MS, 0.005, 1.5);
  const winner = runWindow(klines, EVAL_START_MS, EVAL_END_MS, 0.003, 1.2);
  console.log(`[4b] baseline setups=${baseline.setups.length} winner=${winner.setups.length}`);

  writeTradesCsv(OUT_TRADES, winner.trades);
  console.log(`[4b] wrote ${OUT_TRADES}`);

  const baseKeys = new Set(baseline.trades.map((t) => t.active_open_time));
  const winKeys = new Set(winner.trades.map((t) => t.active_open_time));
  const droppedTimes = [...baseKeys].filter((t) => !winKeys.has(t)).sort((a, b) => a - b);
  const addedTimes = [...winKeys].filter((t) => !baseKeys.has(t)).sort((a, b) => a - b);

  const csvBase = loadBaselineCsv();
  const droppedAnalysis = droppedTimes.map((t) => {
    const setup = baseline.setups.find((s) => s.activeOpenTime === t)!;
    const trade = baseline.trades.find((x) => x.active_open_time === t)!;
    const csv = csvBase.get(t);
    const analysis = analyzeDrop(setup, klines);
    return {
      active_iso: trade.active_iso,
      active_open_time: t,
      breakout_iso: new Date(setup.breakoutOpenTime).toISOString(),
      side: trade.side,
      entry: trade.entry,
      outcome: csv?.outcome ?? trade.outcome,
      net_r: csv?.net_r ?? trade.net_r,
      quarter: trade.quarter,
      range_high: setup.rangeHigh,
      range_low: setup.rangeLow,
      level: analysis.level,
      min_dist_pct: analysis.minDistPct,
      min_dist_bar_iso: analysis.minDistBarIso,
      retest_idx_005: analysis.retestIdx005,
      retest_idx_003: analysis.retestIdx003,
      reason: analysis.reason,
    };
  });

  const clusters = clusterStats(winner.trades);
  console.log(`[4b] winner clusters=${clusters.cluster_n} dropped=${droppedTimes.length} added=${addedTimes.length}`);

  // True OOS
  const oos = runWindow(klines, OOS_START_MS, OOS_END_MS, 0.003, 1.2);
  const oosBaseline = runWindow(klines, OOS_START_MS, OOS_END_MS, 0.005, 1.5);
  writeTradesCsv(OUT_OOS_TRADES, oos.trades);
  const oosStats = sliceEr(oos.trades);
  const oosBaseStats = sliceEr(oosBaseline.trades);
  const oosClusters = clusterStats(oos.trades);

  const oosSummary = {
    window: {
      start: new Date(OOS_START_MS).toISOString(),
      end: new Date(OOS_END_MS).toISOString(),
    },
    winner_003_rr12: { ...oosStats, ...oosClusters },
    baseline_005_rr15: oosBaseStats,
  };
  fs.writeFileSync(OUT_OOS_JSON, JSON.stringify(oosSummary, null, 2), 'utf8');
  console.log(
    `[4b] OOS winner n=${oosStats.n} WR=${oosStats.wr?.toFixed(2)} ER=${oosStats.e_r_after?.toFixed(4)} clusters=${oosClusters.cluster_n}`,
  );
  console.log(
    `[4b] OOS baseline n=${oosBaseStats.n} WR=${oosBaseStats.wr?.toFixed(2)} ER=${oosBaseStats.e_r_after?.toFixed(4)}`,
  );

  const isStats = sliceEr(winner.trades);
  const payload = {
    is_window: {
      start: new Date(EVAL_START_MS).toISOString(),
      end: new Date(EVAL_END_MS).toISOString(),
    },
    winner_is: isStats,
    winner_clusters: clusters,
    dropped_count: droppedTimes.length,
    added_count: addedTimes.length,
    dropped: droppedAnalysis,
    added: addedTimes.map((t) => {
      const tr = winner.trades.find((x) => x.active_open_time === t)!;
      return {
        active_iso: tr.active_iso,
        side: tr.side,
        outcome: tr.outcome,
        net_r: tr.net_r,
        quarter: tr.quarter,
      };
    }),
    oos: oosSummary,
  };
  fs.writeFileSync(OUT_DIFF_JSON, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[4b] wrote ${OUT_DIFF_JSON}`);
  console.log(`[4b] wrote ${OUT_OOS_TRADES}`);
  console.log(`[4b] wrote ${OUT_OOS_JSON}`);

  // touch unused helper to avoid lint if tree-shaken — keep barTouchesLevel import used
  void barTouchesLevel;
  void closestApproachPct;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

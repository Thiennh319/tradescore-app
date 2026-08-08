/**
 * Task V41-SOL-3 — SOLUSDT Confirm B breakout baseline: 365d + quarterly.
 * Uses NEAR production params (buildRc3ViewModel / breakoutDetector defaults).
 * No BTC filter (production NEAR does not enable it). Does not change production.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-sol-breakout-365d-quarterly.ts
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
const SYMBOL = 'SOLUSDT';
const DAYS = 365;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
/** Align with BREAKOUT_SIGNAL_MAX_AGE_BARS_1H / research max-hold. */
const MAX_HOLD_1H = 80;
const QUARTER_DAYS = 91;
const N_QUARTERS = 4;

/**
 * Pin eval end to SOL-3 window so Task 3 clean baseline is comparable
 * (not rolling Date.now()).
 */
const EVAL_END_MS = Date.parse('2026-08-08T04:32:23.655Z');

/** Production NEAR Confirm B (buildBreakoutRc3Card). */
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

/** Task 3 clean artefacts (do not overwrite buggy SOL-3 baselines). */
const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-breakout-365d-quarterly-clean.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-breakout-365d-quarterly-clean-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-4-breakout-365d-quarterly-clean-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_SOL_4_TASK3_CLEAN_BASELINE_${DATE}.md`,
);
const TR_SUMMARY = path.resolve(
  __dirname,
  '../docs/exports/v41-sol-tr-365d-quarterly-summary.json',
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
  quarter: number | null;
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

function netPnlPct(
  side: BreakoutSide,
  entry: number,
  exitPrice: number,
  costPct: number,
): number {
  const move =
    side === 'LONG'
      ? ((exitPrice - entry) / entry) * 100
      : ((entry - exitPrice) / entry) * 100;
  return move - costPct;
}

function assignQuarter(ts: number, evalStart: number): number {
  const offset = ts - evalStart;
  const q = Math.floor(offset / (QUARTER_DAYS * 24 * MS_1H));
  if (q < 0) return 1;
  if (q >= N_QUARTERS) return N_QUARTERS;
  return q + 1;
}

function sliceStats(
  label: string,
  trades: TradeRow[],
  startMs: number,
  endMs: number,
): SliceStats {
  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const decided = wins + losses + both;
  const wr = decided > 0 ? (wins / decided) * 100 : NaN;
  const decidedTrades = trades.filter(
    (t) => t.gross_r != null && t.net_r != null && t.outcome !== 'TIMEOUT',
  );
  const e_r_before = mean(decidedTrades.map((t) => t.gross_r!));
  const e_r_after = mean(decidedTrades.map((t) => t.net_r!));
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
    e_r_before,
    e_r_after,
    sign: signOf(e_r_after),
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

  const fee_r =
    setup.slDistancePct > 0 ? COST_ROUND_TRIP_PCT / setup.slDistancePct : NaN;
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
  };
}

async function main(): Promise<void> {
  const endMs = EVAL_END_MS;
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const midMs = evalStart + (DAYS / 2) * 24 * MS_1H;
  const fetchStart1h = evalStart - WARMUP_1H * MS_1H;

  console.log(`[sol4-t3] fetching ${SYMBOL} 1H ${DAYS}d…`);
  console.log(`[sol4-t3] window ${new Date(evalStart).toISOString()} → ${new Date(endMs).toISOString()}`);
  const klines1h = await fetchKlines(SYMBOL, fetchStart1h, endMs);
  console.log(`[sol4-t3] 1h=${klines1h.length}`);

  const setups = scanBreakoutSetups({
    klines1H: klines1h,
    lookbackN: LOOKBACK_N,
    consolidationMode: 'width',
    maxWidthPct: MAX_WIDTH_PCT,
    confirmMode: 'retest',
    slMode: 'atr_break_level',
    atrMult: ATR_MULT,
    requireStrongBreakout: false,
    evalStartOpenTime: evalStart,
    evalEndOpenTimeExclusive: endMs,
    /** Task V41-SOL-4: collapse same broken-level multi-bar confirms. */
    dedupeByBrokenLevel: true,
    maxHoldBarsForLevelDedupe: MAX_HOLD_1H,
  });
  console.log(`[sol4-t3] Confirm B setups (deduped)=${setups.length}`);

  const idxByOpen = new Map(klines1h.map((k, i) => [k.openTime, i]));
  const trades = setups.map((s) => simulate(s, idxByOpen, klines1h, evalStart, midMs));

  const slices: SliceStats[] = [sliceStats('FULL_365d', trades, evalStart, endMs)];
  console.log(
    `[sol4-t3] FULL n=${slices[0]!.n_active} WR=${fmt(slices[0]!.wr)}% E[R]=${fmt(slices[0]!.e_r_before, 3)}→${fmt(slices[0]!.e_r_after, 3)} (${slices[0]!.sign})`,
  );

  for (let q = 0; q < N_QUARTERS; q++) {
    const qStart = evalStart + q * QUARTER_DAYS * 24 * MS_1H;
    const qEnd =
      q === N_QUARTERS - 1
        ? endMs
        : evalStart + (q + 1) * QUARTER_DAYS * 24 * MS_1H;
    const sub = trades.filter(
      (t) => t.active_open_time >= qStart && t.active_open_time < qEnd,
    );
    const st = sliceStats(`Q${q + 1}`, sub, qStart, qEnd);
    slices.push(st);
    console.log(
      `[sol4-t3] Q${q + 1} n=${st.n_active} decided=${st.n_decided} WR=${fmt(st.wr)}% E[R]=${fmt(st.e_r_after, 3)} (${st.sign})`,
    );
  }

  for (const half of ['H1', 'H2'] as const) {
    const sub = trades.filter((t) => t.half === half);
    const start = half === 'H1' ? evalStart : midMs;
    const end = half === 'H1' ? midMs : endMs;
    const st = sliceStats(half, sub, start, end);
    slices.push(st);
    console.log(
      `[sol4-t3] ${half} n=${st.n_active} WR=${fmt(st.wr)}% E[R]=${fmt(st.e_r_after, 3)} (${st.sign})`,
    );
  }

  const full = slices[0]!;
  let trCompare: unknown = null;
  if (fs.existsSync(TR_SUMMARY)) {
    trCompare = JSON.parse(fs.readFileSync(TR_SUMMARY, 'utf8'));
  }

  const summary = {
    task: 'V41-SOL-4-Task3',
    date: DATE,
    symbol: SYMBOL,
    days: DAYS,
    strategy: 'breakout_confirm_b',
    dedupe_by_broken_level: true,
    eval_start_iso: new Date(evalStart).toISOString(),
    eval_end_iso: new Date(endMs).toISOString(),
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
      btc_filter: false,
      max_hold_1h: MAX_HOLD_1H,
      quarter_days: QUARTER_DAYS,
      cost_round_trip_pct: COST_ROUND_TRIP_PCT,
      dedupe_by_broken_level: true,
      note: 'NEAR production params + Task1 level-occupancy dedupe (clean baseline for Task4)',
    },
    full,
    slices,
    tr_baseline_sol2: trCompare,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const csv = [
    'slice,start_iso,end_iso,n_active,n_decided,wins,losses,both,timeout,wr_pct,e_r_before,e_r_after,sign,long_n,short_n',
    ...slices.map((s) =>
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
        fmt(s.wr, 2),
        fmt(s.e_r_before, 4),
        fmt(s.e_r_after, 4),
        s.sign,
        s.long_n,
        s.short_n,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_CSV, csv + '\n', 'utf8');

  const tradesCsv = [
    'active_open_time,active_iso,breakout_open_time,quarter,half,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r,net_pnl_pct',
    ...trades.map((t) =>
      [
        t.active_open_time,
        t.active_iso,
        t.breakout_open_time,
        t.quarter ?? '',
        t.half,
        t.side,
        t.entry,
        t.sl,
        t.tp1,
        t.outcome,
        t.bars_held ?? '',
        t.sl_dist_pct.toFixed(4),
        t.tp1_rr.toFixed(4),
        t.gross_r != null ? t.gross_r.toFixed(4) : '',
        t.fee_r != null ? t.fee_r.toFixed(4) : '',
        t.net_r != null ? t.net_r.toFixed(4) : '',
        t.net_pnl_pct != null ? t.net_pnl_pct.toFixed(4) : '',
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_TRADES, tradesCsv + '\n', 'utf8');

  type TrJson = {
    full?: {
      n_active?: number;
      wr?: number;
      expectancy_r_before?: number;
      expectancy_r_after?: number;
      expectancy_sign_after?: string;
      wins?: number;
      losses?: number;
      both?: number;
      timeout?: number;
      long_n?: number;
      short_n?: number;
    };
    slices?: Array<{
      label: string;
      n_active: number;
      n_decided: number;
      wr: number;
      e_r_before: number;
      e_r_after: number;
      sign: string;
    }>;
  };
  const tr = (trCompare ?? {}) as TrJson;
  const trFull = tr.full ?? {};
  const trSlices = tr.slices ?? [];

  const md: string[] = [];
  md.push('# Task V41-SOL-4 / Task3 — Clean Breakout Baseline — SOL 365d');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    `**Symbol:** ${SYMBOL} · Confirm B retest · NEAR params + level-occupancy dedupe · ${DAYS}d`,
  );
  md.push(
    `**Window:** ${new Date(evalStart).toISOString()} → ${new Date(endMs).toISOString()}`,
  );
  md.push(
    `**Cost:** fee ${FEE_ROUND_TRIP_PCT}% + slip ${SLIP_ROUND_TRIP_PCT}% = **${COST_ROUND_TRIP_PCT}%** RT · **no BTC filter** · **dedupeByBrokenLevel=true**`,
  );
  md.push('');
  md.push('## Config (NEAR production defaults)');
  md.push('');
  md.push('| Param | Value |');
  md.push('|---|---|');
  md.push(`| LOOKBACK_N | ${LOOKBACK_N} |`);
  md.push(`| MAX_WIDTH_PCT | ${MAX_WIDTH_PCT} |`);
  md.push(`| ATR_MULT | ${ATR_MULT} |`);
  md.push(`| confirmMode | retest |`);
  md.push(`| RETEST_MAX_BARS | ${BREAKOUT_RETEST_MAX_BARS} |`);
  md.push(`| RETEST_BAND_PCT | ${BREAKOUT_RETEST_BAND_PCT} (±${BREAKOUT_RETEST_BAND_PCT * 100}%) |`);
  md.push(`| TP1_RR | ${BREAKOUT_TP1_RR} |`);
  md.push('| slMode | atr_break_level |');
  md.push('| requireStrongBreakout | false |');
  md.push(`| MAX_HOLD_1H | ${MAX_HOLD_1H} |`);
  md.push('| dedupeByBrokenLevel | true (occupancy-B) |');
  md.push('');
  md.push('## FULL 365d — Breakout (clean)');
  md.push('');
  md.push('| Metric | Value |');
  md.push('|---|---|');
  md.push(`| n_active | ${full.n_active} |`);
  md.push(
    `| wins / losses / both / timeout | ${full.wins} / ${full.losses} / ${full.both} / ${full.timeout} |`,
  );
  md.push(`| WR | ${fmt(full.wr)}% |`);
  md.push(`| E[R] before fees | ${fmt(full.e_r_before, 4)} |`);
  md.push(`| E[R] after fees | ${fmt(full.e_r_after, 4)} (${full.sign}) |`);
  md.push(`| LONG / SHORT n | ${full.long_n} / ${full.short_n} |`);
  md.push('');
  md.push('## Quarterly + halves — Breakout');
  md.push('');
  md.push('| Slice | n | decided | WR% | E[R] before | E[R] after | sign | L/S |');
  md.push('|---|---:|---:|---:|---:|---:|---|---|');
  for (const s of slices) {
    md.push(
      `| ${s.label} | ${s.n_active} | ${s.n_decided} | ${fmt(s.wr)} | ${fmt(s.e_r_before, 3)} | ${fmt(s.e_r_after, 3)} | ${s.sign} | ${s.long_n}/${s.short_n} |`,
    );
  }
  md.push('');
  md.push('## BẢNG SO SÁNH — TR (SOL-2) vs Breakout (SOL-3)');
  md.push('');
  md.push('| Metric | TR (SOL-2) | Breakout Confirm B (SOL-3) | Δ (BO − TR) |');
  md.push('|---|---:|---:|---:|');
  md.push(
    `| n_active | ${trFull.n_active ?? 'n/a'} | ${full.n_active} | ${trFull.n_active != null ? full.n_active - trFull.n_active : 'n/a'} |`,
  );
  md.push(
    `| WR% | ${trFull.wr != null ? fmt(trFull.wr) : 'n/a'} | ${fmt(full.wr)} | ${trFull.wr != null ? fmt(full.wr - trFull.wr) : 'n/a'} pp |`,
  );
  md.push(
    `| E[R] before | ${trFull.expectancy_r_before != null ? fmt(trFull.expectancy_r_before, 3) : 'n/a'} | ${fmt(full.e_r_before, 3)} | ${trFull.expectancy_r_before != null ? fmt(full.e_r_before - trFull.expectancy_r_before, 3) : 'n/a'} |`,
  );
  md.push(
    `| E[R] after fees | ${trFull.expectancy_r_after != null ? fmt(trFull.expectancy_r_after, 3) : 'n/a'} | ${fmt(full.e_r_after, 3)} | ${trFull.expectancy_r_after != null ? fmt(full.e_r_after - trFull.expectancy_r_after, 3) : 'n/a'} |`,
  );
  md.push(
    `| sign after fees | ${trFull.expectancy_sign_after ?? 'n/a'} | ${full.sign} | |`,
  );
  md.push('');
  md.push('### Theo quý (WR% · E[R] after)');
  md.push('');
  md.push('| Slice | TR WR · E[R] | Breakout WR · E[R] |');
  md.push('|---|---|---|');
  for (const label of ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FULL_365d']) {
    const t = trSlices.find((s) => s.label === label);
    const b = slices.find((s) => s.label === label);
    md.push(
      `| ${label} | ${t ? `${fmt(t.wr)}% · ${fmt(t.e_r_after, 3)} (${t.sign})` : 'n/a'} | ${b ? `${fmt(b.wr)}% · ${fmt(b.e_r_after, 3)} (${b.sign})` : 'n/a'} |`,
    );
  }
  md.push('');

  const boBetterWr = trFull.wr != null && full.wr > trFull.wr;
  const boBetterEr =
    trFull.expectancy_r_after != null && full.e_r_after > trFull.expectancy_r_after;
  md.push('## Kết luận sơ bộ');
  md.push('');
  md.push(
    `- Breakout mặc định (NEAR params) trên SOL 365d: WR **${fmt(full.wr)}%**, E[R] sau phí **${fmt(full.e_r_after, 3)}** (${full.sign}).`,
  );
  md.push(
    `- So TR baseline: WR ${boBetterWr ? '**cao hơn**' : '**không cao hơn**'} · E[R] sau phí ${boBetterEr ? '**tốt hơn**' : '**không tốt hơn**'}.`,
  );
  md.push(
    `- Đây là tham số mặc định NEAR — **chưa** tối ưu cho SOL; n và quý vẫn nhiễu.`,
  );
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-sol-4-breakout-365d-quarterly-clean.csv`');
  md.push('- `docs/exports/v41-sol-4-breakout-365d-quarterly-clean-trades.csv`');
  md.push('- `docs/exports/v41-sol-4-breakout-365d-quarterly-clean-summary.json`');
  md.push('- `scripts/backtest-v41-sol-breakout-365d-quarterly.ts`');
  md.push('');
  md.push('## Việc còn lại');
  md.push('');
  md.push('1. Task 4: sweep params — combo mới không được có E[R] sau phí thấp hơn baseline sạch này.');
  md.push('2. Nếu sweep thắng ổn định OOS → xét allow-list SOL breakout (production wire).');
  md.push('');
  md.push('## Task ID');
  md.push('');
  md.push('**V41-SOL-4-Task3**');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[sol4-t3] wrote ${OUT_MD}`);
  console.log(`[sol4-t3] wrote ${OUT_CSV}`);
  console.log(`[sol4-t3] wrote ${OUT_TRADES}`);
  console.log(`[sol4-t3] wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

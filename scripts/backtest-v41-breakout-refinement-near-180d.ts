/**
 * Breakout refinement — W_N20_X5 only, NEAR 180d.
 * Variants: ATR SL, strong-candle fake filter, both.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-refinement-near-180d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import {
  BREAKOUT_TP1_RR,
  scanBreakoutSetups,
  type BreakoutConfirmMode,
  type BreakoutSlMode,
  type BreakoutTradeLevels,
} from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const SYMBOL = 'NEARUSDT';
const DAYS = 180;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MAX_HOLD_1H = 80;
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

/** Fixed baseline from prior report (W_N20_X5) — do not re-sweep all old configs. */
const BASELINE = {
  A: { n: 35, wr: 29.17, er_after: -0.31, mean_sl: 4.88 },
  B: { n: 15, wr: 33.33, er_after: -0.202, mean_sl: 5.48 },
} as const;

type VariantId = 'V1_ATR_SL' | 'V2_FAKE_FILTER' | 'V3_BOTH' | 'V1_ATR_SL_075' | 'V1_ATR_SL_15';

const VARIANTS: Array<{
  id: VariantId;
  label: string;
  slMode: BreakoutSlMode;
  atrMult: number;
  requireStrongBreakout: boolean;
  /** Main comparison table vs appendix. */
  inMainTable: boolean;
}> = [
  {
    id: 'V1_ATR_SL',
    label: 'Biến thể 1 (SL ATR×1.0)',
    slMode: 'atr_break_level',
    atrMult: 1.0,
    requireStrongBreakout: false,
    inMainTable: true,
  },
  {
    id: 'V2_FAKE_FILTER',
    label: 'Biến thể 2 (filter fake + SL đối diện)',
    slMode: 'opposite_range',
    atrMult: 1.0,
    requireStrongBreakout: true,
    inMainTable: true,
  },
  {
    id: 'V3_BOTH',
    label: 'Biến thể 3 (ATR SL×1.0 + filter)',
    slMode: 'atr_break_level',
    atrMult: 1.0,
    requireStrongBreakout: true,
    inMainTable: true,
  },
  {
    id: 'V1_ATR_SL_075',
    label: 'Biến thể 1 appendix (SL ATR×0.75)',
    slMode: 'atr_break_level',
    atrMult: 0.75,
    requireStrongBreakout: false,
    inMainTable: false,
  },
  {
    id: 'V1_ATR_SL_15',
    label: 'Biến thể 1 appendix (SL ATR×1.5)',
    slMode: 'atr_break_level',
    atrMult: 1.5,
    requireStrongBreakout: false,
    inMainTable: false,
  },
];

const CONFIRM_MODES: BreakoutConfirmMode[] = ['immediate', 'retest'];

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-refinement-near-180d.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-refinement-near-180d-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-refinement-near-180d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_REFINEMENT_SL_FAKEFILTER_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';
type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  variant_id: string;
  confirm_mode: BreakoutConfirmMode;
  sl_mode: BreakoutSlMode;
  atr_mult: number;
  strong_filter: boolean;
  symbol: string;
  days: number;
  breakout_open_time: number;
  active_open_time: number;
  active_iso: string;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  range_high: number;
  range_low: number;
  outcome: Outcome;
  bars_held: number | null;
  sl_dist_pct: number;
  tp1_rr: number;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
  net_pnl_pct: number | null;
};

type RunResult = {
  variant_id: VariantId;
  label: string;
  confirm_mode: BreakoutConfirmMode;
  sl_mode: BreakoutSlMode;
  atr_mult: number;
  strong_filter: boolean;
  in_main_table: boolean;
  n_active: number;
  wins: number;
  losses: number;
  both: number;
  timeout: number;
  wr: number;
  wr_after_fees: number;
  mean_sl_dist_pct: number;
  expectancy_r_before: number;
  expectancy_r_after: number;
  mean_fee_r: number;
  expectancy_sign_after: 'positive' | 'negative' | 'flat' | 'n/a';
  trades: TradeRow[];
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
    if (!res.ok) throw new Error(`${symbol} ${interval} HTTP ${res.status}`);
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

function hitOnBar(side: Side, bar: KlineV41, sl: number, tp1: number): Outcome | null {
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

function grossR(outcome: Outcome, tp1Rr: number): number | null {
  if (outcome === 'TP') return tp1Rr;
  if (outcome === 'SL' || outcome === 'BOTH') return -1;
  return null;
}

function netPnlPct(side: Side, entry: number, exitPrice: number, costPct: number): number {
  const move =
    side === 'LONG'
      ? ((exitPrice - entry) / entry) * 100
      : ((entry - exitPrice) / entry) * 100;
  return move - costPct;
}

function simulateTrade(
  klines1h: KlineV41[],
  setup: BreakoutTradeLevels,
  idxByOpen: Map<number, number>,
  meta: {
    variant_id: string;
    confirm_mode: BreakoutConfirmMode;
    sl_mode: BreakoutSlMode;
    atr_mult: number;
    strong_filter: boolean;
  },
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
  const gR = grossR(outcome, setup.tp1RR);
  const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;

  let net_pnl_pct: number | null = null;
  if (outcome === 'TP') {
    net_pnl_pct = netPnlPct(setup.side, setup.entry, setup.tp1, COST_ROUND_TRIP_PCT);
  } else if (outcome === 'SL' || outcome === 'BOTH') {
    net_pnl_pct = netPnlPct(setup.side, setup.entry, setup.sl, COST_ROUND_TRIP_PCT);
  }

  return {
    ...meta,
    symbol: SYMBOL,
    days: DAYS,
    breakout_open_time: setup.breakoutOpenTime,
    active_open_time: setup.activeOpenTime,
    active_iso: new Date(setup.activeOpenTime).toISOString(),
    side: setup.side,
    entry: setup.entry,
    sl: setup.sl,
    tp1: setup.tp1,
    range_high: setup.rangeHigh,
    range_low: setup.rangeLow,
    outcome,
    bars_held,
    sl_dist_pct: setup.slDistancePct,
    tp1_rr: setup.tp1RR,
    gross_r: gR,
    fee_r: Number.isFinite(fee_r) ? fee_r : null,
    net_r,
    net_pnl_pct,
  };
}

function summarize(partial: Omit<RunResult, 'trades'> & { trades: TradeRow[] }): RunResult {
  const trades = partial.trades;
  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const decided = wins + losses + both;
  const wr = decided > 0 ? (wins / decided) * 100 : NaN;

  const decidedTrades = trades.filter(
    (t) => t.gross_r != null && t.net_r != null && t.outcome !== 'TIMEOUT',
  );
  const expectancy_r_before = mean(decidedTrades.map((t) => t.gross_r!));
  const expectancy_r_after = mean(decidedTrades.map((t) => t.net_r!));
  const mean_fee_r = mean(
    decidedTrades.map((t) => t.fee_r!).filter((x) => Number.isFinite(x)),
  );
  const mean_sl = mean(trades.map((t) => t.sl_dist_pct).filter((x) => Number.isFinite(x)));
  const winsAfter = decidedTrades.filter(
    (t) => t.net_pnl_pct != null && t.net_pnl_pct > 0,
  ).length;
  const wr_after_fees =
    decidedTrades.length > 0 ? (winsAfter / decidedTrades.length) * 100 : NaN;

  let expectancy_sign_after: RunResult['expectancy_sign_after'] = 'n/a';
  if (Number.isFinite(expectancy_r_after)) {
    if (expectancy_r_after > 1e-9) expectancy_sign_after = 'positive';
    else if (expectancy_r_after < -1e-9) expectancy_sign_after = 'negative';
    else expectancy_sign_after = 'flat';
  }

  return {
    ...partial,
    n_active: trades.length,
    wins,
    losses,
    both,
    timeout,
    wr,
    wr_after_fees,
    mean_sl_dist_pct: mean_sl,
    expectancy_r_before,
    expectancy_r_after,
    mean_fee_r,
    expectancy_sign_after,
  };
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : '';
}

function deltaVsBaseline(
  confirm: BreakoutConfirmMode,
  r: RunResult,
): string {
  const b = confirm === 'immediate' ? BASELINE.A : BASELINE.B;
  const dn = r.n_active - b.n;
  const dWr = Number.isFinite(r.wr) ? r.wr - b.wr : NaN;
  const dEr = Number.isFinite(r.expectancy_r_after) ? r.expectancy_r_after - b.er_after : NaN;
  const dSl = Number.isFinite(r.mean_sl_dist_pct)
    ? r.mean_sl_dist_pct - b.mean_sl
    : NaN;
  return `n${dn >= 0 ? '+' : ''}${dn}; WR${Number.isFinite(dWr) ? (dWr >= 0 ? '+' : '') + dWr.toFixed(1) : '?'}pp; E[R]${Number.isFinite(dEr) ? (dEr >= 0 ? '+' : '') + dEr.toFixed(3) : '?'}; SL%${Number.isFinite(dSl) ? (dSl >= 0 ? '+' : '') + dSl.toFixed(2) : '?'}`;
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const fetchStart = evalStart - WARMUP_1H * MS_1H;

  console.log(`[refine] fetching ${SYMBOL} 1H ${DAYS}d…`);
  const klines1h = await fetchKlines(SYMBOL, '1h', fetchStart, endMs);
  const idxByOpen = new Map(klines1h.map((k, i) => [k.openTime, i]));
  console.log(`[refine] 1h=${klines1h.length}`);

  const results: RunResult[] = [];

  for (const v of VARIANTS) {
    for (const confirm of CONFIRM_MODES) {
      const tag = `${v.id}_${confirm === 'immediate' ? 'A' : 'B'}`;
      console.log(`[refine] scanning ${tag}…`);
      const setups = scanBreakoutSetups({
        klines1H: klines1h,
        lookbackN: LOOKBACK_N,
        consolidationMode: 'width',
        maxWidthPct: MAX_WIDTH_PCT,
        confirmMode: confirm,
        slMode: v.slMode,
        atrMult: v.atrMult,
        requireStrongBreakout: v.requireStrongBreakout,
        evalStartOpenTime: evalStart,
        evalEndOpenTimeExclusive: endMs,
      });

      const trades = setups.map((s) =>
        simulateTrade(klines1h, s, idxByOpen, {
          variant_id: v.id,
          confirm_mode: confirm,
          sl_mode: v.slMode,
          atr_mult: v.atrMult,
          strong_filter: v.requireStrongBreakout,
        }),
      );

      const result = summarize({
        variant_id: v.id,
        label: v.label,
        confirm_mode: confirm,
        sl_mode: v.slMode,
        atr_mult: v.atrMult,
        strong_filter: v.requireStrongBreakout,
        in_main_table: v.inMainTable,
        n_active: 0,
        wins: 0,
        losses: 0,
        both: 0,
        timeout: 0,
        wr: NaN,
        wr_after_fees: NaN,
        mean_sl_dist_pct: NaN,
        expectancy_r_before: NaN,
        expectancy_r_after: NaN,
        mean_fee_r: NaN,
        expectancy_sign_after: 'n/a',
        trades,
      });
      results.push(result);
      console.log(
        `[refine] ${tag} n=${result.n_active} WR=${fmt(result.wr)}% E[R]=${fmt(result.expectancy_r_after, 3)} meanSL=${fmt(result.mean_sl_dist_pct)}%`,
      );
    }
  }

  const summaryHeader =
    'variant_id,label,confirm_mode,sl_mode,atr_mult,strong_filter,n_active,wins,losses,both,timeout,wr_pct,wr_after_fees_pct,mean_sl_dist_pct,expectancy_r_before,expectancy_r_after,mean_fee_r,expectancy_sign_after';
  const summaryLines = results.map((r) =>
    [
      r.variant_id,
      JSON.stringify(r.label),
      r.confirm_mode,
      r.sl_mode,
      r.atr_mult,
      r.strong_filter,
      r.n_active,
      r.wins,
      r.losses,
      r.both,
      r.timeout,
      fmt(r.wr, 2),
      fmt(r.wr_after_fees, 2),
      fmt(r.mean_sl_dist_pct, 3),
      fmt(r.expectancy_r_before, 4),
      fmt(r.expectancy_r_after, 4),
      fmt(r.mean_fee_r, 4),
      r.expectancy_sign_after,
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [summaryHeader, ...summaryLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'variant_id,confirm_mode,sl_mode,atr_mult,strong_filter,symbol,days,breakout_open_time,active_open_time,active_iso,side,entry,sl,tp1,range_high,range_low,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r,net_pnl_pct';
  const tradeLines: string[] = [];
  for (const r of results) {
    for (const t of r.trades) {
      tradeLines.push(
        [
          t.variant_id,
          t.confirm_mode,
          t.sl_mode,
          t.atr_mult,
          t.strong_filter,
          t.symbol,
          t.days,
          t.breakout_open_time,
          t.active_open_time,
          t.active_iso,
          t.side,
          t.entry,
          t.sl,
          t.tp1,
          t.range_high,
          t.range_low,
          t.outcome,
          t.bars_held ?? '',
          fmt(t.sl_dist_pct, 4),
          fmt(t.tp1_rr, 2),
          t.gross_r != null ? fmt(t.gross_r, 4) : '',
          t.fee_r != null ? fmt(t.fee_r, 4) : '',
          t.net_r != null ? fmt(t.net_r, 4) : '',
          t.net_pnl_pct != null ? fmt(t.net_pnl_pct, 4) : '',
        ].join(','),
      );
    }
  }
  fs.writeFileSync(OUT_TRADES, [tradeHeader, ...tradeLines].join('\n') + '\n', 'utf8');

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        symbol: SYMBOL,
        days: DAYS,
        config: 'W_N20_X5',
        cost_round_trip_pct: COST_ROUND_TRIP_PCT,
        tp1_rr: BREAKOUT_TP1_RR,
        baseline: BASELINE,
        results: results.map(({ trades: _t, ...rest }) => rest),
      },
      null,
      2,
    ),
    'utf8',
  );

  const mainRows = results.filter((r) => r.in_main_table);
  const appendixRows = results.filter((r) => !r.in_main_table);

  const md: string[] = [];
  md.push('# REPORT — V4.1 Breakout Refinement (ATR SL + Fake Filter)');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(`**Symbol:** ${SYMBOL} · **Window:** ${DAYS}d · **TF:** 1H · **Config:** W_N20_X5 only`);
  md.push(`**Cost:** ${COST_ROUND_TRIP_PCT}% RT · **TP1 R:R:** ${BREAKOUT_TP1_RR}`);
  md.push('**Scope:** Refine breakoutDetector only — TR untouched. No multi-symbol.');
  md.push('');
  md.push('## Variants');
  md.push('');
  md.push('1. **V1** — SL = breakout level ∓ ATR(14)×mult (default ×1.0); no strong-candle filter');
  md.push('2. **V2** — Strong-candle filter (range > 1.5× meanATR20 prior + vol > 1.5× volMA20) + **original opposite-range SL**');
  md.push('3. **V3** — V1 ATR×1.0 SL + V2 filter together');
  md.push('');
  md.push('## Comparison table');
  md.push('');
  md.push(
    '| Biến thể | Confirm | n | WR% | E[R] sau phí | mean SL% | So với baseline gốc |',
  );
  md.push('|---|---|---|---|---|---|---|');
  md.push(
    `| Baseline gốc (SL đối diện range) | A | ${BASELINE.A.n} | ${BASELINE.A.wr} | ${BASELINE.A.er_after} | ${BASELINE.A.mean_sl} | — |`,
  );
  md.push(
    `| Baseline gốc | B | ${BASELINE.B.n} | ${BASELINE.B.wr} | ${BASELINE.B.er_after} | ${BASELINE.B.mean_sl} | — |`,
  );
  for (const r of mainRows) {
    const conf = r.confirm_mode === 'immediate' ? 'A' : 'B';
    const note = r.n_active < 10 ? ' ⚠️ n<10' : '';
    md.push(
      `| ${r.label}${note} | ${conf} | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.expectancy_r_after, 3)} | ${fmt(r.mean_sl_dist_pct)} | ${deltaVsBaseline(r.confirm_mode, r)} |`,
    );
  }
  md.push('');
  md.push('## ATR× mult appendix (V1 only)');
  md.push('');
  md.push('| Mult | Confirm | n | WR% | E[R] sau phí | mean SL% |');
  md.push('|---|---|---|---|---|---|');
  for (const r of results.filter(
    (x) =>
      x.variant_id === 'V1_ATR_SL' ||
      x.variant_id === 'V1_ATR_SL_075' ||
      x.variant_id === 'V1_ATR_SL_15',
  )) {
    md.push(
      `| ×${r.atr_mult} | ${r.confirm_mode === 'immediate' ? 'A' : 'B'} | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.expectancy_r_after, 3)} | ${fmt(r.mean_sl_dist_pct)} |`,
    );
  }
  md.push('');
  md.push('## Observations');
  md.push('');

  const v1a = results.find((r) => r.variant_id === 'V1_ATR_SL' && r.confirm_mode === 'immediate')!;
  const v1b = results.find((r) => r.variant_id === 'V1_ATR_SL' && r.confirm_mode === 'retest')!;
  const v2a = results.find((r) => r.variant_id === 'V2_FAKE_FILTER' && r.confirm_mode === 'immediate')!;
  const v2b = results.find((r) => r.variant_id === 'V2_FAKE_FILTER' && r.confirm_mode === 'retest')!;
  const v3a = results.find((r) => r.variant_id === 'V3_BOTH' && r.confirm_mode === 'immediate')!;
  const v3b = results.find((r) => r.variant_id === 'V3_BOTH' && r.confirm_mode === 'retest')!;

  md.push(
    `- **SL tightness (V1):** mean SL% A ${fmt(BASELINE.A.mean_sl)} → ${fmt(v1a.mean_sl_dist_pct)}; B ${fmt(BASELINE.B.mean_sl)} → ${fmt(v1b.mean_sl_dist_pct)}.`,
  );
  md.push(
    `- **Fake filter (V2):** n A ${BASELINE.A.n} → ${v2a.n_active}; B ${BASELINE.B.n} → ${v2b.n_active}.${v2a.n_active < 10 || v2b.n_active < 10 ? ' **n&lt;10 on at least one side — statistical limit, do not over-conclude.**' : ''}`,
  );
  md.push(
    `- **Combo (V3):** n A=${v3a.n_active}, B=${v3b.n_active}; E[R] after fee A=${fmt(v3a.expectancy_r_after, 3)}, B=${fmt(v3b.expectancy_r_after, 3)}.`,
  );

  const ranked = [...mainRows]
    .filter((r) => r.n_active >= 10 && Number.isFinite(r.expectancy_r_after))
    .sort((a, b) => b.expectancy_r_after - a.expectancy_r_after);
  if (ranked.length) {
    const best = ranked[0]!;
    md.push(
      `- Best main-table run with n≥10: **${best.label} / ${best.confirm_mode}** (n=${best.n_active}, E[R]=${fmt(best.expectancy_r_after, 3)}, WR=${fmt(best.wr)}%).`,
    );
  } else {
    md.push('- No main-table run with n≥10 and finite E[R] after fee — treat rankings as provisional.');
  }

  const anyPositive = mainRows.some(
    (r) => r.n_active >= 10 && r.expectancy_sign_after === 'positive',
  );
  md.push(
    anyPositive
      ? '- At least one refined variant with n≥10 shows **positive** E[R] after fee on NEAR-180d.'
      : '- No refined variant with n≥10 flipped E[R] after fee to positive on NEAR-180d alone.',
  );
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `services/v41/breakoutDetector.ts` (ATR SL + strong candle filter)');
  md.push('- `scripts/backtest-v41-breakout-refinement-near-180d.ts`');
  md.push('- `docs/exports/v41-breakout-refinement-near-180d.csv`');
  md.push('- `docs/exports/v41-breakout-refinement-near-180d-trades.csv`');
  md.push('- `docs/exports/v41-breakout-refinement-near-180d-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[refine] wrote ${OUT_CSV}`);
  console.log(`[refine] wrote ${OUT_TRADES}`);
  console.log(`[refine] wrote ${OUT_JSON}`);
  console.log(`[refine] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

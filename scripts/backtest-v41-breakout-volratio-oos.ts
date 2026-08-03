/**
 * OOS validation — Confirm B + vol_retest/vol_breakout ≥ 1.22
 * Independent symbols only: NEAR-365d (not 180d), SOL/ETH/BNB/DOGE-180d,
 * plus NEW XRP/ADA-180d (never tested before).
 *
 * Accept: ≥5/7 symbols with E[R] after fee positive.
 * Report-only — no production changes.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-volratio-oos.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import {
  BREAKOUT_TP1_RR,
  scanBreakoutSetups,
  type BreakoutTradeLevels,
} from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MAX_HOLD_1H = 80;
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;
/** Fixed threshold from prior in-sample p50 — do not re-fit. */
const VOL_RATIO_MIN = 1.22;
const MIN_POS_SYMBOLS = 5;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

/** 7 independent symbols — NEAR represented once via 365d. */
const SCENARIOS = [
  { id: 'NEAR-365d', symbol: 'NEARUSDT', days: 365, is_oos: false },
  { id: 'SOL-180d', symbol: 'SOLUSDT', days: 180, is_oos: false },
  { id: 'ETH-180d', symbol: 'ETHUSDT', days: 180, is_oos: false },
  { id: 'BNB-180d', symbol: 'BNBUSDT', days: 180, is_oos: false },
  { id: 'DOGE-180d', symbol: 'DOGEUSDT', days: 180, is_oos: false },
  { id: 'XRP-180d', symbol: 'XRPUSDT', days: 180, is_oos: true },
  { id: 'ADA-180d', symbol: 'ADAUSDT', days: 180, is_oos: true },
] as const;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-volratio-oos-validation.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-volratio-oos-validation-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-volratio-oos-validation-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_VOLRATIO_FILTER_OOS_VALIDATION_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';
type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  scenario: string;
  symbol: string;
  days: number;
  is_oos: boolean;
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
  vol_breakout: number | null;
  vol_retest: number | null;
  vol_ratio: number | null;
  pass_vol_filter: boolean;
};

type SymbolResult = {
  scenario: string;
  symbol: string;
  days: number;
  is_oos: boolean;
  n_active_raw: number;
  n_active_filtered: number;
  n_decided_raw: number;
  n_decided_filtered: number;
  wr_raw: number;
  wr_filtered: number;
  e_r_raw: number;
  e_r_filtered: number;
  sign_raw: 'positive' | 'negative' | 'flat' | 'n/a';
  sign_filtered: 'positive' | 'negative' | 'flat' | 'n/a';
  mean_sl_filtered: number;
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

function signOf(e: number): SymbolResult['sign_raw'] {
  if (!Number.isFinite(e)) return 'n/a';
  if (e > 1e-9) return 'positive';
  if (e < -1e-9) return 'negative';
  return 'flat';
}

function metrics(trades: TradeRow[]): {
  n: number;
  n_decided: number;
  wr: number;
  e_r: number;
  mean_sl: number;
} {
  const decided = trades.filter(
    (t) => t.net_r != null && (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  return {
    n: trades.length,
    n_decided: decided.length,
    wr: decided.length ? (wins / decided.length) * 100 : NaN,
    e_r: mean(decided.map((t) => t.net_r!)),
    mean_sl: mean(trades.map((t) => t.sl_dist_pct).filter((x) => Number.isFinite(x))),
  };
}

function simulate(
  klines1h: KlineV41[],
  setup: BreakoutTradeLevels,
  idxByOpen: Map<number, number>,
  meta: { scenario: string; symbol: string; days: number; is_oos: boolean },
): TradeRow {
  const bi = idxByOpen.get(setup.breakoutOpenTime);
  const ri = idxByOpen.get(setup.activeOpenTime);
  const vol_breakout = bi != null ? klines1h[bi]!.volume : null;
  const vol_retest = ri != null ? klines1h[ri]!.volume : null;
  const vol_ratio =
    vol_breakout != null && vol_breakout > 0 && vol_retest != null
      ? vol_retest / vol_breakout
      : null;
  const pass_vol_filter = vol_ratio != null && vol_ratio >= VOL_RATIO_MIN;

  let outcome: Outcome = 'TIMEOUT';
  let bars_held: number | null = null;
  if (ri != null) {
    const endIdx = Math.min(klines1h.length - 1, ri + MAX_HOLD_1H);
    for (let i = ri + 1; i <= endIdx; i++) {
      const hit = hitOnBar(setup.side, klines1h[i]!, setup.sl, setup.tp1);
      if (hit) {
        outcome = hit;
        bars_held = i - ri;
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
    vol_breakout,
    vol_retest,
    vol_ratio,
    pass_vol_filter,
  };
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const allTrades: TradeRow[] = [];
  const results: SymbolResult[] = [];

  for (const s of SCENARIOS) {
    const evalStart = endMs - s.days * 24 * MS_1H;
    const fetchStart = evalStart - WARMUP_1H * MS_1H;
    console.log(`[oos] fetching ${s.symbol} ${s.days}d${s.is_oos ? ' (NEW OOS)' : ''}…`);
    const klines1h = await fetchKlines(s.symbol, fetchStart, endMs);
    const idxByOpen = new Map(klines1h.map((k, i) => [k.openTime, i]));
    console.log(`[oos] ${s.id} 1h=${klines1h.length}`);

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
    });

    const trades = setups.map((setup) =>
      simulate(klines1h, setup, idxByOpen, {
        scenario: s.id,
        symbol: s.symbol,
        days: s.days,
        is_oos: s.is_oos,
      }),
    );
    allTrades.push(...trades);

    const raw = metrics(trades);
    const filtered = metrics(trades.filter((t) => t.pass_vol_filter));
    const row: SymbolResult = {
      scenario: s.id,
      symbol: s.symbol,
      days: s.days,
      is_oos: s.is_oos,
      n_active_raw: raw.n,
      n_active_filtered: filtered.n,
      n_decided_raw: raw.n_decided,
      n_decided_filtered: filtered.n_decided,
      wr_raw: raw.wr,
      wr_filtered: filtered.wr,
      e_r_raw: raw.e_r,
      e_r_filtered: filtered.e_r,
      sign_raw: signOf(raw.e_r),
      sign_filtered: signOf(filtered.e_r),
      mean_sl_filtered: filtered.mean_sl,
    };
    results.push(row);
    console.log(
      `[oos] ${s.id} raw n=${raw.n_decided} E=${fmt(raw.e_r, 3)} | filt n=${filtered.n_decided} E=${fmt(filtered.e_r, 3)} (${row.sign_filtered})`,
    );
  }

  const nPosFilt = results.filter((r) => r.sign_filtered === 'positive').length;
  const nPosRaw = results.filter((r) => r.sign_raw === 'positive').length;
  const oos = results.filter((r) => r.is_oos);
  const oosPos = oos.filter((r) => r.sign_filtered === 'positive').length;
  const accepted = nPosFilt >= MIN_POS_SYMBOLS;

  // CSV summary
  const sumHeader =
    'scenario,symbol,days,is_oos,n_active_raw,n_decided_raw,wr_raw,e_r_raw,sign_raw,n_active_filtered,n_decided_filtered,wr_filtered,e_r_filtered,sign_filtered,mean_sl_filtered';
  const sumLines = results.map((r) =>
    [
      r.scenario,
      r.symbol,
      r.days,
      r.is_oos ? 1 : 0,
      r.n_active_raw,
      r.n_decided_raw,
      fmt(r.wr_raw),
      fmt(r.e_r_raw, 4),
      r.sign_raw,
      r.n_active_filtered,
      r.n_decided_filtered,
      fmt(r.wr_filtered),
      fmt(r.e_r_filtered, 4),
      r.sign_filtered,
      fmt(r.mean_sl_filtered, 3),
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [sumHeader, ...sumLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'scenario,symbol,days,is_oos,breakout_open_time,active_open_time,active_iso,side,entry,sl,tp1,range_high,range_low,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r,net_pnl_pct,vol_breakout,vol_retest,vol_ratio,pass_vol_filter';
  const tradeLines = allTrades.map((t) =>
    [
      t.scenario,
      t.symbol,
      t.days,
      t.is_oos ? 1 : 0,
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
      t.sl_dist_pct.toFixed(4),
      t.tp1_rr.toFixed(2),
      t.gross_r != null ? t.gross_r.toFixed(4) : '',
      t.fee_r != null ? t.fee_r.toFixed(4) : '',
      t.net_r != null ? t.net_r.toFixed(4) : '',
      t.net_pnl_pct != null ? t.net_pnl_pct.toFixed(4) : '',
      t.vol_breakout != null ? t.vol_breakout.toFixed(4) : '',
      t.vol_retest != null ? t.vol_retest.toFixed(4) : '',
      t.vol_ratio != null ? t.vol_ratio.toFixed(4) : '',
      t.pass_vol_filter ? 1 : 0,
    ].join(','),
  );
  fs.writeFileSync(OUT_TRADES, [tradeHeader, ...tradeLines].join('\n') + '\n', 'utf8');

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        filter: { id: 'vol_ratio_ge_1.22', threshold: VOL_RATIO_MIN, fixed_from: 'prior in-sample p50' },
        config: {
          confirm: 'retest',
          lookbackN: LOOKBACK_N,
          maxWidthPct: MAX_WIDTH_PCT,
          slMode: 'atr_break_level',
          atrMult: ATR_MULT,
          tp1Rr: BREAKOUT_TP1_RR,
          costRoundTripPct: COST_ROUND_TRIP_PCT,
        },
        independence_rule:
          'NEAR counted once via NEAR-365d only; NEAR-180d excluded to avoid subset double-count',
        accept_criterion: `≥${MIN_POS_SYMBOLS}/7 independent symbols E[R] after fee positive`,
        n_pos_raw: nPosRaw,
        n_pos_filtered: nPosFilt,
        oos_new_symbols_pos: `${oosPos}/${oos.length}`,
        accepted,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  const md: string[] = [];
  md.push('# REPORT — Breakout Confirm B Vol-Ratio Filter OOS Validation');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Scope:** Report-only — kiểm định đúng 1 filter (`vol_retest/vol_breakout ≥ 1.22`); không sửa production; không sweep filter khác',
  );
  md.push('');
  md.push('## Setup');
  md.push('');
  md.push('- Confirm **B (retest)** · V1 ATR SL×1.0 · W_N20_X5 · cost 0.18% RT');
  md.push(`- Filter cố định: **vol_ratio ≥ ${VOL_RATIO_MIN}** (p50 in-sample trước — **không** re-fit)`);
  md.push(
    '- **7 symbol độc lập:** NEAR-365d (đại diện NEAR duy nhất), SOL/ETH/BNB/DOGE-180d, **XRP/ADA-180d (NEW OOS)**',
  );
  md.push('- **Không** tính NEAR-180d riêng (tập con của 365d → tránh đếm trùng)');
  md.push(`- Tiêu chí chấp nhận: **≥${MIN_POS_SYMBOLS}/7** symbol E[R] sau phí dương`);
  md.push('');
  md.push('## Per-symbol results');
  md.push('');
  md.push(
    '| Symbol | Window | OOS? | n_dec raw | E[R] raw | Sign raw | n_dec filt | WR filt | E[R] filt | Sign filt |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.symbol} | ${r.scenario} | ${r.is_oos ? 'YES' : 'no'} | ${r.n_decided_raw} | ${fmt(r.e_r_raw, 3)} | ${r.sign_raw} | ${r.n_decided_filtered} | ${fmt(r.wr_filtered)} | ${fmt(r.e_r_filtered, 3)} | ${r.sign_filtered} |`,
    );
  }
  md.push('');
  md.push('## Counts');
  md.push('');
  md.push(`- Unfiltered Confirm B: **${nPosRaw}/7** positive`);
  md.push(`- After vol_ratio ≥ ${VOL_RATIO_MIN}: **${nPosFilt}/7** positive`);
  md.push(
    `- New OOS only (XRP, ADA): **${oosPos}/${oos.length}** positive after filter`,
  );
  md.push('');
  md.push('### New OOS detail');
  md.push('');
  for (const r of oos) {
    md.push(
      `- **${r.symbol}**: raw E[R]=${fmt(r.e_r_raw, 3)} (${r.sign_raw}, n=${r.n_decided_raw}) → filtered E[R]=${fmt(r.e_r_filtered, 3)} (${r.sign_filtered}, n=${r.n_decided_filtered})`,
    );
  }
  md.push('');
  md.push('## Kết luận');
  md.push('');
  if (accepted) {
    md.push(
      `**ĐẠT** tiêu chí ≥${MIN_POS_SYMBOLS}/7: filter vol_ratio≥${VOL_RATIO_MIN} có **${nPosFilt}/7** symbol độc lập E[R] sau phí dương.`,
    );
    md.push('Không tự wire production trong task này — chỉ báo cáo số liệu.');
  } else {
    md.push(
      `**KHÔNG ĐẠT** tiêu chí ≥${MIN_POS_SYMBOLS}/7: filter vol_ratio≥${VOL_RATIO_MIN} chỉ **${nPosFilt}/7** symbol độc lập dương.`,
    );
    md.push(
      'Đây là bằng chứng đủ (trong mẫu đã test, đã sửa đếm NEAR trùng + thêm 2 symbol OOS) để kết luận **breakout Confirm B — kể cả với filter tốt nhất tìm được — cũng không có edge nhất quán qua symbol**, tương tự kết luận đã có với reversal.',
    );
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/backtest-v41-breakout-volratio-oos.ts`');
  md.push('- `docs/exports/v41-breakout-volratio-oos-validation.csv`');
  md.push('- `docs/exports/v41-breakout-volratio-oos-validation-trades.csv`');
  md.push('- `docs/exports/v41-breakout-volratio-oos-validation-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[oos] wrote ${OUT_CSV}`);
  console.log(`[oos] wrote ${OUT_TRADES}`);
  console.log(`[oos] wrote ${OUT_JSON}`);
  console.log(`[oos] wrote ${OUT_MD}`);
  console.log(`[oos] filtered positive ${nPosFilt}/7 — accepted=${accepted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

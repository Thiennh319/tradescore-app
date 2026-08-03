/**
 * Multi-symbol + OOS validation — Confirm B + BTC 4H same-direction filter.
 * 7 independent symbols: NEAR-365d, SOL/ETH/BNB/DOGE/XRP/ADA-180d.
 * Accept: ≥5/7 E[R] after fee positive AFTER filter.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-btc-filter-multi.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import {
  BREAKOUT_TP1_RR,
  scanBreakoutSetups,
  type BreakoutSide,
  type BreakoutTradeLevels,
} from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const WARMUP_1H = 80;
const WARMUP_4H = 220;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const MAX_HOLD_1H = 80;
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;
const MIN_POS = 5;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

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
  '../docs/exports/v41-breakout-btc-filter-multi-symbol.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-btc-filter-multi-symbol-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-btc-filter-multi-symbol-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_BTC_FILTER_MULTI_SYMBOL_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  scenario: string;
  symbol: string;
  days: number;
  is_oos: boolean;
  breakout_open_time: number;
  active_open_time: number;
  active_iso: string;
  side: BreakoutSide;
  entry: number;
  sl: number;
  tp1: number;
  outcome: Outcome;
  bars_held: number | null;
  sl_dist_pct: number;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
  net_pnl_pct: number | null;
  btc_direction_4h: TrendDirection;
  btc_trend_strength_4h: number;
  pass_btc_filter: boolean;
};

type SymbolResult = {
  scenario: string;
  symbol: string;
  days: number;
  is_oos: boolean;
  n_active_raw: number;
  n_decided_raw: number;
  wr_raw: number;
  e_r_raw: number;
  sign_raw: 'positive' | 'negative' | 'flat' | 'n/a';
  n_active_filtered: number;
  n_decided_filtered: number;
  wr_filtered: number;
  e_r_filtered: number;
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
  interval: string,
  startTime: number,
  endTime: number,
): Promise<KlineV41[]> {
  const step = interval === '4h' ? MS_4H : MS_1H;
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
    const next = Number(batch[batch.length - 1]![0]) + step;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < BINANCE_MAX_LIMIT) break;
  }
  const by = new Map<number, KlineV41>();
  for (const k of out) by.set(k.openTime, k);
  return [...by.values()].sort((a, b) => a.openTime - b.openTime);
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : 'n/a';
}

function signOf(e: number): SymbolResult['sign_raw'] {
  if (!Number.isFinite(e)) return 'n/a';
  if (e > 1e-9) return 'positive';
  if (e < -1e-9) return 'negative';
  return 'flat';
}

function btcMatches(side: BreakoutSide, btcDir: TrendDirection): boolean {
  if (side === 'LONG') return btcDir === 'BULL';
  return btcDir === 'BEAR';
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

function metrics(trades: TradeRow[]) {
  const decided = trades.filter(
    (t) =>
      t.net_r != null &&
      (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
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
  btc4h: KlineV41[],
  meta: { scenario: string; symbol: string; days: number; is_oos: boolean },
): TradeRow {
  const winBtc = sliceUpTo(btc4h, setup.breakoutOpenTime);
  const btc = calculateTrendStrength(winBtc);
  const pass_btc_filter = btcMatches(setup.side, btc.trendDirection);

  const ri = idxByOpen.get(setup.activeOpenTime);
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
  const gR =
    outcome === 'TP'
      ? setup.tp1RR
      : outcome === 'SL' || outcome === 'BOTH'
        ? -1
        : null;
  const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;

  let net_pnl_pct: number | null = null;
  if (outcome === 'TP') {
    const move =
      setup.side === 'LONG'
        ? ((setup.tp1 - setup.entry) / setup.entry) * 100
        : ((setup.entry - setup.tp1) / setup.entry) * 100;
    net_pnl_pct = move - COST_ROUND_TRIP_PCT;
  } else if (outcome === 'SL' || outcome === 'BOTH') {
    const move =
      setup.side === 'LONG'
        ? ((setup.sl - setup.entry) / setup.entry) * 100
        : ((setup.entry - setup.sl) / setup.entry) * 100;
    net_pnl_pct = move - COST_ROUND_TRIP_PCT;
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
    outcome,
    bars_held,
    sl_dist_pct: setup.slDistancePct,
    gross_r: gR,
    fee_r: Number.isFinite(fee_r) ? fee_r : null,
    net_r,
    net_pnl_pct,
    btc_direction_4h: btc.trendDirection,
    btc_trend_strength_4h: btc.trendStrength,
    pass_btc_filter,
  };
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const maxDays = Math.max(...SCENARIOS.map((s) => s.days));
  const btcFetchStart = endMs - maxDays * 24 * MS_1H - WARMUP_4H * MS_4H;

  console.log(`[btc-ms] fetching BTCUSDT 4H (shared)…`);
  const btc4h = await fetchKlines('BTCUSDT', '4h', btcFetchStart, endMs);
  console.log(`[btc-ms] btc4h=${btc4h.length}`);

  const allTrades: TradeRow[] = [];
  const results: SymbolResult[] = [];

  for (const s of SCENARIOS) {
    const evalStart = endMs - s.days * 24 * MS_1H;
    const fetchStart1h = evalStart - WARMUP_1H * MS_1H;
    console.log(`[btc-ms] fetching ${s.symbol} 1H ${s.days}d${s.is_oos ? ' (OOS)' : ''}…`);
    const klines1h = await fetchKlines(s.symbol, '1h', fetchStart1h, endMs);
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
      evalStartOpenTime: evalStart,
      evalEndOpenTimeExclusive: endMs,
    });

    const trades = setups.map((setup) =>
      simulate(klines1h, setup, idxByOpen, btc4h, {
        scenario: s.id,
        symbol: s.symbol,
        days: s.days,
        is_oos: s.is_oos,
      }),
    );
    allTrades.push(...trades);

    const raw = metrics(trades);
    const filtered = metrics(trades.filter((t) => t.pass_btc_filter));
    const row: SymbolResult = {
      scenario: s.id,
      symbol: s.symbol,
      days: s.days,
      is_oos: s.is_oos,
      n_active_raw: raw.n,
      n_decided_raw: raw.n_decided,
      wr_raw: raw.wr,
      e_r_raw: raw.e_r,
      sign_raw: signOf(raw.e_r),
      n_active_filtered: filtered.n,
      n_decided_filtered: filtered.n_decided,
      wr_filtered: filtered.wr,
      e_r_filtered: filtered.e_r,
      sign_filtered: signOf(filtered.e_r),
      mean_sl_filtered: filtered.mean_sl,
    };
    results.push(row);
    console.log(
      `[btc-ms] ${s.id} raw n=${raw.n_decided} E=${fmt(raw.e_r, 3)} | btcFilt n=${filtered.n_decided} E=${fmt(filtered.e_r, 3)} (${row.sign_filtered})`,
    );
  }

  const nPosRaw = results.filter((r) => r.sign_raw === 'positive').length;
  const nPosFilt = results.filter((r) => r.sign_filtered === 'positive').length;
  const oos = results.filter((r) => r.is_oos);
  const oosPos = oos.filter((r) => r.sign_filtered === 'positive').length;
  const accepted = nPosFilt >= MIN_POS;

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
    'scenario,symbol,days,is_oos,breakout_open_time,active_open_time,active_iso,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,gross_r,fee_r,net_r,net_pnl_pct,btc_direction_4h,btc_trend_strength_4h,pass_btc_filter';
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
      t.outcome,
      t.bars_held ?? '',
      t.sl_dist_pct.toFixed(4),
      t.gross_r != null ? t.gross_r.toFixed(4) : '',
      t.fee_r != null ? t.fee_r.toFixed(4) : '',
      t.net_r != null ? t.net_r.toFixed(4) : '',
      t.net_pnl_pct != null ? t.net_pnl_pct.toFixed(4) : '',
      t.btc_direction_4h,
      t.btc_trend_strength_4h.toFixed(2),
      t.pass_btc_filter ? 1 : 0,
    ].join(','),
  );
  fs.writeFileSync(OUT_TRADES, [tradeHeader, ...tradeLines].join('\n') + '\n', 'utf8');

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        filter: 'btc_4h_same_direction_as_breakout',
        config: {
          confirm: 'retest',
          lookbackN: LOOKBACK_N,
          maxWidthPct: MAX_WIDTH_PCT,
          slMode: 'atr_break_level',
          atrMult: ATR_MULT,
          tp1Rr: BREAKOUT_TP1_RR,
          costRoundTripPct: COST_ROUND_TRIP_PCT,
        },
        independence_rule: 'NEAR once via 365d; XRP/ADA are OOS',
        accept_criterion: `≥${MIN_POS}/7 independent symbols E[R] after fee positive AFTER filter`,
        n_pos_raw: nPosRaw,
        n_pos_filtered: nPosFilt,
        oos_pos: `${oosPos}/${oos.length}`,
        accepted,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  const md: string[] = [];
  md.push('# REPORT — Breakout Confirm B BTC Same-Direction Filter Multi-Symbol');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Scope:** Report-only — kiểm định đúng filter BTC 4H cùng hướng; không sửa production; không sweep filter khác',
  );
  md.push('');
  md.push('## Setup');
  md.push('');
  md.push('- Confirm **B (retest)** · V1 ATR SL×1.0 · W_N20_X5 · cost 0.18% RT');
  md.push(
    '- Filter: BTC `calculateTrendStrength` 4H direction khớp breakout (LONG→BULL, SHORT→BEAR) tại **breakout time**',
  );
  md.push(
    '- **7 symbol độc lập:** NEAR-365d, SOL/ETH/BNB/DOGE-180d, **XRP/ADA-180d (OOS)**',
  );
  md.push(`- Tiêu chí chấp nhận: **≥${MIN_POS}/7** symbol E[R] sau phí dương **sau filter**`);
  md.push('');
  md.push('## Per-symbol (before vs after BTC filter)');
  md.push('');
  md.push(
    '| Symbol | Window | OOS? | n_dec raw | WR raw | E[R] raw | Sign raw | n_dec filt | WR filt | E[R] filt | Sign filt |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.symbol} | ${r.scenario} | ${r.is_oos ? 'YES' : 'no'} | ${r.n_decided_raw} | ${fmt(r.wr_raw)} | ${fmt(r.e_r_raw, 3)} | ${r.sign_raw} | ${r.n_decided_filtered} | ${fmt(r.wr_filtered)} | ${fmt(r.e_r_filtered, 3)} | ${r.sign_filtered} |`,
    );
  }
  md.push('');
  md.push('## Counts');
  md.push('');
  md.push(`- Unfiltered Confirm B: **${nPosRaw}/7** positive`);
  md.push(`- After BTC same-direction: **${nPosFilt}/7** positive`);
  md.push(`- New OOS (XRP, ADA): **${oosPos}/${oos.length}** positive after filter`);
  md.push('');
  md.push('### OOS detail');
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
      `**ĐẠT** ≥${MIN_POS}/7: BTC same-direction có **${nPosFilt}/7** symbol độc lập E[R] sau phí dương.`,
    );
    md.push('Không tự wire production trong task này.');
  } else {
    md.push(
      `**KHÔNG ĐẠT** ≥${MIN_POS}/7: BTC same-direction chỉ **${nPosFilt}/7** symbol độc lập dương.`,
    );
    md.push(
      'Đây là bằng chứng đủ (trong mẫu đã test) để kết luận **Lựa chọn B (breakout + BTC/TrendStrength filter) cũng không có edge nhất quán qua symbol** — giống kết luận đã có với reversal và breakout vol_ratio filter.',
    );
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/backtest-v41-breakout-btc-filter-multi.ts`');
  md.push('- `docs/exports/v41-breakout-btc-filter-multi-symbol.csv`');
  md.push('- `docs/exports/v41-breakout-btc-filter-multi-symbol-trades.csv`');
  md.push('- `docs/exports/v41-breakout-btc-filter-multi-symbol-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[btc-ms] wrote ${OUT_CSV}`);
  console.log(`[btc-ms] wrote ${OUT_TRADES}`);
  console.log(`[btc-ms] wrote ${OUT_JSON}`);
  console.log(`[btc-ms] wrote ${OUT_MD}`);
  console.log(`[btc-ms] filtered positive ${nPosFilt}/7 — accepted=${accepted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

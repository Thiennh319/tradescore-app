/**
 * NEAR-only time stability — Confirm B breakout ± BTC same-direction filter.
 * Quarters (~91d) + half/half walk-forward on 365d window.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-near-time-stability.ts
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
const SYMBOL = 'NEARUSDT';
const DAYS = 365;
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
const QUARTER_DAYS = 91;
const N_QUARTERS = 4;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-near-time-stability.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-near-time-stability-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-near-time-stability-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_NEAR_TIME_STABILITY_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';
type Variant = 'no_btc_filter' | 'btc_same_dir';

type TradeRow = {
  variant: Variant;
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
  btc_direction_4h: TrendDirection;
  pass_btc_filter: boolean;
  quarter: number | null;
  half: 'H1' | 'H2' | null;
};

type SliceStats = {
  label: string;
  variant: Variant;
  start_ms: number;
  end_ms: number;
  n_active: number;
  n_decided: number;
  wr: number;
  e_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
  mean_sl: number;
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

function btcMatches(side: BreakoutSide, dir: TrendDirection): boolean {
  if (side === 'LONG') return dir === 'BULL';
  return dir === 'BEAR';
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

function stats(label: string, variant: Variant, trades: TradeRow[], start: number, end: number): SliceStats {
  const decided = trades.filter(
    (t) =>
      t.net_r != null &&
      (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  const e = mean(decided.map((t) => t.net_r!));
  return {
    label,
    variant,
    start_ms: start,
    end_ms: end,
    n_active: trades.length,
    n_decided: decided.length,
    wr: decided.length ? (wins / decided.length) * 100 : NaN,
    e_r_after: e,
    sign: signOf(e),
    mean_sl: mean(trades.map((t) => t.sl_dist_pct)),
  };
}

function assignQuarter(ts: number, evalStart: number): number | null {
  const dayMs = 24 * MS_1H;
  const offset = ts - evalStart;
  if (offset < 0) return null;
  const q = Math.floor(offset / (QUARTER_DAYS * dayMs));
  if (q < 0 || q >= N_QUARTERS) {
    // remaining days after 4*91=364 → fold into Q4
    return N_QUARTERS - 1;
  }
  return q;
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const midMs = evalStart + (DAYS / 2) * 24 * MS_1H;
  const fetchStart1h = evalStart - WARMUP_1H * MS_1H;
  const fetchStart4h = evalStart - WARMUP_4H * MS_4H;

  console.log(`[stab] fetching NEAR 1H + BTC 4H ${DAYS}d…`);
  const [near1h, btc4h] = await Promise.all([
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
    fetchKlines('BTCUSDT', '4h', fetchStart4h, endMs),
  ]);
  console.log(`[stab] near1h=${near1h.length} btc4h=${btc4h.length}`);

  const setups = scanBreakoutSetups({
    klines1H: near1h,
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
  console.log(`[stab] Confirm B setups=${setups.length}`);

  const idxByOpen = new Map(near1h.map((k, i) => [k.openTime, i]));

  function simulate(setup: BreakoutTradeLevels): Omit<TradeRow, 'variant'> {
    const winBtc = btc4h.filter((k) => k.openTime <= setup.breakoutOpenTime);
    const btc = calculateTrendStrength(winBtc);
    const pass_btc_filter = btcMatches(setup.side, btc.trendDirection);

    const ri = idxByOpen.get(setup.activeOpenTime);
    let outcome: Outcome = 'TIMEOUT';
    let bars_held: number | null = null;
    if (ri != null) {
      const endIdx = Math.min(near1h.length - 1, ri + MAX_HOLD_1H);
      for (let i = ri + 1; i <= endIdx; i++) {
        const hit = hitOnBar(setup.side, near1h[i]!, setup.sl, setup.tp1);
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

    const q = assignQuarter(setup.activeOpenTime, evalStart);
    const half: 'H1' | 'H2' =
      setup.activeOpenTime < midMs ? 'H1' : 'H2';

    return {
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
      btc_direction_4h: btc.trendDirection,
      pass_btc_filter,
      quarter: q,
      half,
    };
  }

  const baseRows = setups.map(simulate);
  const tradesNoBtc: TradeRow[] = baseRows.map((t) => ({
    ...t,
    variant: 'no_btc_filter' as const,
  }));
  const tradesBtc: TradeRow[] = baseRows
    .filter((t) => t.pass_btc_filter)
    .map((t) => ({ ...t, variant: 'btc_same_dir' as const }));

  const allTrades = [...tradesNoBtc, ...tradesBtc];
  const sliceRows: SliceStats[] = [];

  // Full window
  for (const [variant, list] of [
    ['no_btc_filter', tradesNoBtc],
    ['btc_same_dir', tradesBtc],
  ] as const) {
    sliceRows.push(stats(`FULL_365d`, variant, list, evalStart, endMs));
  }

  // Quarters
  for (let q = 0; q < N_QUARTERS; q++) {
    const qStart = evalStart + q * QUARTER_DAYS * 24 * MS_1H;
    const qEnd =
      q === N_QUARTERS - 1
        ? endMs
        : evalStart + (q + 1) * QUARTER_DAYS * 24 * MS_1H;
    for (const [variant, list] of [
      ['no_btc_filter', tradesNoBtc],
      ['btc_same_dir', tradesBtc],
    ] as const) {
      const sub = list.filter(
        (t) => t.active_open_time >= qStart && t.active_open_time < qEnd,
      );
      sliceRows.push(stats(`Q${q + 1}`, variant, sub, qStart, qEnd));
    }
  }

  // Walk-forward halves
  for (const [variant, list] of [
    ['no_btc_filter', tradesNoBtc],
    ['btc_same_dir', tradesBtc],
  ] as const) {
    const h1 = list.filter((t) => t.half === 'H1');
    const h2 = list.filter((t) => t.half === 'H2');
    sliceRows.push(stats('H1_select', variant, h1, evalStart, midMs));
    sliceRows.push(stats('H2_oos', variant, h2, midMs, endMs));
  }

  for (const s of sliceRows) {
    console.log(
      `[stab] ${s.variant} ${s.label} n=${s.n_active} WR=${fmt(s.wr)}% E[R]=${fmt(s.e_r_after, 3)} (${s.sign})`,
    );
  }

  // CSV
  const sumHeader =
    'variant,label,start_iso,end_iso,n_active,n_decided,wr_pct,e_r_after,sign,mean_sl_pct';
  const sumLines = sliceRows.map((s) =>
    [
      s.variant,
      s.label,
      new Date(s.start_ms).toISOString(),
      new Date(s.end_ms).toISOString(),
      s.n_active,
      s.n_decided,
      fmt(s.wr),
      fmt(s.e_r_after, 4),
      s.sign,
      fmt(s.mean_sl, 3),
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [sumHeader, ...sumLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'variant,breakout_open_time,active_open_time,active_iso,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,gross_r,fee_r,net_r,btc_direction_4h,pass_btc_filter,quarter,half';
  const tradeLines = allTrades.map((t) =>
    [
      t.variant,
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
      t.btc_direction_4h,
      t.pass_btc_filter ? 1 : 0,
      t.quarter ?? '',
      t.half ?? '',
    ].join(','),
  );
  fs.writeFileSync(OUT_TRADES, [tradeHeader, ...tradeLines].join('\n') + '\n', 'utf8');

  const get = (variant: Variant, label: string) =>
    sliceRows.find((s) => s.variant === variant && s.label === label)!;

  function quarterVerdict(variant: Variant): {
    n_pos: number;
    n_wr_ge_50: number;
    thin: number;
  } {
    let n_pos = 0;
    let n_wr_ge_50 = 0;
    let thin = 0;
    for (let q = 1; q <= N_QUARTERS; q++) {
      const s = get(variant, `Q${q}`);
      if (s.n_decided < 5) thin++;
      if (s.sign === 'positive') n_pos++;
      if (Number.isFinite(s.wr) && s.wr >= 50) n_wr_ge_50++;
    }
    return { n_pos, n_wr_ge_50, thin };
  }

  function walkForwardOk(variant: Variant): boolean {
    const h2 = get(variant, 'H2_oos');
    return (
      h2.n_decided >= 5 &&
      Number.isFinite(h2.wr) &&
      h2.wr >= 50 &&
      h2.sign === 'positive'
    );
  }

  const qNo = quarterVerdict('no_btc_filter');
  const qBtc = quarterVerdict('btc_same_dir');
  const wfNo = walkForwardOk('no_btc_filter');
  const wfBtc = walkForwardOk('btc_same_dir');

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        symbol: SYMBOL,
        days: DAYS,
        cost_round_trip_pct: COST_ROUND_TRIP_PCT,
        quarter_days: QUARTER_DAYS,
        eval_start: new Date(evalStart).toISOString(),
        eval_mid: new Date(midMs).toISOString(),
        eval_end: new Date(endMs).toISOString(),
        slices: sliceRows,
        quarter_summary: { no_btc_filter: qNo, btc_same_dir: qBtc },
        walk_forward_h2_ok: { no_btc_filter: wfNo, btc_same_dir: wfBtc },
      },
      null,
      2,
    ),
    'utf8',
  );

  const md: string[] = [];
  md.push('# REPORT — Breakout Confirm B NEAR Time Stability');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    `**Symbol:** ${SYMBOL} only · Confirm B · W_N20_X5 · ATR SL×1.0 · TP ${BREAKOUT_TP1_RR}R · cost ${COST_ROUND_TRIP_PCT}% RT`,
  );
  md.push(
    `**Window:** ${new Date(evalStart).toISOString().slice(0, 10)} → ${new Date(endMs).toISOString().slice(0, 10)} (${DAYS}d)`,
  );
  md.push('**Scope:** Time stability only — no multi-symbol, no production changes.');
  md.push('');
  md.push('## Full 365d (reference)');
  md.push('');
  md.push('| Variant | n | WR% | E[R] sau phí | Sign |');
  md.push('|---|---|---|---|---|');
  for (const v of ['no_btc_filter', 'btc_same_dir'] as const) {
    const s = get(v, 'FULL_365d');
    md.push(
      `| ${v} | ${s.n_active} | ${fmt(s.wr)} | ${fmt(s.e_r_after, 3)} | ${s.sign} |`,
    );
  }
  md.push('');
  md.push('## Quarters (~91d each)');
  md.push('');
  md.push(
    '| Variant | Q1 n/WR/E[R] | Q2 n/WR/E[R] | Q3 n/WR/E[R] | Q4 n/WR/E[R] | #Q WR≥50% | #Q E[R]>0 |',
  );
  md.push('|---|---|---|---|---|---|---|');
  for (const v of ['no_btc_filter', 'btc_same_dir'] as const) {
    const cells: string[] = [];
    for (let q = 1; q <= N_QUARTERS; q++) {
      const s = get(v, `Q${q}`);
      cells.push(`${s.n_active}/${fmt(s.wr)}/${fmt(s.e_r_after, 3)}`);
    }
    const sum = v === 'no_btc_filter' ? qNo : qBtc;
    md.push(
      `| ${v} | ${cells.join(' | ')} | ${sum.n_wr_ge_50}/4 | ${sum.n_pos}/4 |`,
    );
  }
  md.push('');
  md.push('### Quarter detail');
  md.push('');
  md.push('| Variant | Quarter | Start | End | n | WR% | E[R] | Sign |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const v of ['no_btc_filter', 'btc_same_dir'] as const) {
    for (let q = 1; q <= N_QUARTERS; q++) {
      const s = get(v, `Q${q}`);
      md.push(
        `| ${v} | Q${q} | ${new Date(s.start_ms).toISOString().slice(0, 10)} | ${new Date(s.end_ms).toISOString().slice(0, 10)} | ${s.n_active} | ${fmt(s.wr)} | ${fmt(s.e_r_after, 3)} | ${s.sign} |`,
      );
    }
  }
  md.push('');
  md.push('## Walk-forward (H1 select → H2 OOS)');
  md.push('');
  md.push(
    'Giả lập: nửa đầu dùng để “chọn” chiến lược; nửa sau chưa nhìn khi chọn.',
  );
  md.push('');
  md.push('| Variant | Half | n | WR% | E[R] sau phí | Sign | Role |');
  md.push('|---|---|---|---|---|---|---|');
  for (const v of ['no_btc_filter', 'btc_same_dir'] as const) {
    const h1 = get(v, 'H1_select');
    const h2 = get(v, 'H2_oos');
    md.push(
      `| ${v} | H1 | ${h1.n_active} | ${fmt(h1.wr)} | ${fmt(h1.e_r_after, 3)} | ${h1.sign} | select |`,
    );
    md.push(
      `| ${v} | H2 | ${h2.n_active} | ${fmt(h2.wr)} | ${fmt(h2.e_r_after, 3)} | ${h2.sign} | **OOS** |`,
    );
  }
  md.push('');
  md.push(
    `Walk-forward pass (H2: n_dec≥5, WR≥50%, E[R]>0): no_btc=${wfNo ? 'YES' : 'NO'}; btc_filter=${wfBtc ? 'YES' : 'NO'}`,
  );
  md.push('');
  md.push('## Kết luận');
  md.push('');

  const noFull = get('no_btc_filter', 'FULL_365d');
  const btcFull = get('btc_same_dir', 'FULL_365d');
  const noH2 = get('no_btc_filter', 'H2_oos');
  const btcH2 = get('btc_same_dir', 'H2_oos');

  md.push(
    `- Full 365d: no-filter E[R]=${fmt(noFull.e_r_after, 3)} (WR ${fmt(noFull.wr)}%); BTC-filter E[R]=${fmt(btcFull.e_r_after, 3)} (WR ${fmt(btcFull.wr)}%).`,
  );
  md.push(
    `- Quarters WR≥50%: no-filter **${qNo.n_wr_ge_50}/4**; BTC-filter **${qBtc.n_wr_ge_50}/4**. E[R]>0: ${qNo.n_pos}/4 vs ${qBtc.n_pos}/4.`,
  );

  if (wfNo || wfBtc) {
    const ok: string[] = [];
    if (wfNo) ok.push('no_btc_filter');
    if (wfBtc) ok.push('btc_same_dir');
    md.push(
      `- **Walk-forward H2 ổn:** ${ok.join(', ')} — WR≥50% và E[R] dương trên nửa sau → bằng chứng đáng tin hơn để coi là khả dụng cho NEAR từ giờ (vẫn mẫu nhỏ từng quý).`,
    );
  } else {
    md.push(
      `- **Walk-forward H2 không đạt** tiêu chí (WR≥50% + E[R]>0, n đủ): no-filter H2 WR=${fmt(noH2.wr)}% E[R]=${fmt(noH2.e_r_after, 3)}; BTC H2 WR=${fmt(btcH2.wr)}% E[R]=${fmt(btcH2.e_r_after, 3)}.`,
    );
    md.push(
      '- Kết quả full-365d có thể bị kéo bởi 1–2 quý / nửa đầu — **không đủ** để khẳng định ổn định out-of-time cho NEAR.',
    );
  }

  // Concentration note
  const erByQ = (v: Variant) =>
    [1, 2, 3, 4].map((q) => get(v, `Q${q}`).e_r_after);
  const maxEr = (xs: number[]) =>
    Math.max(...xs.filter((x) => Number.isFinite(x)));
  const sumPosEr = (xs: number[]) =>
    xs.filter((x) => Number.isFinite(x) && x > 0).reduce((a, b) => a + b, 0);
  for (const v of ['no_btc_filter', 'btc_same_dir'] as const) {
    const ers = erByQ(v);
    const mx = maxEr(ers);
    const spos = sumPosEr(ers);
    if (spos > 0 && mx / spos > 0.7) {
      md.push(
        `- ${v}: quý tốt nhất đóng góp >70% tổng E[R] dương các quý → **tập trung theo thời gian**, không đều.`,
      );
    }
  }

  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/backtest-v41-breakout-near-time-stability.ts`');
  md.push('- `docs/exports/v41-breakout-near-time-stability.csv`');
  md.push('- `docs/exports/v41-breakout-near-time-stability-trades.csv`');
  md.push('- `docs/exports/v41-breakout-near-time-stability-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[stab] wrote ${OUT_CSV}`);
  console.log(`[stab] wrote ${OUT_TRADES}`);
  console.log(`[stab] wrote ${OUT_JSON}`);
  console.log(`[stab] wrote ${OUT_MD}`);
  console.log(`[stab] WF H2 ok: no_btc=${wfNo} btc=${wfBtc}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Trend-follow variant C multi-symbol + OOS validation.
 * C: strength≥70, cooldownBars=0, no same-side overlap, mom≥1.
 * 7 independent symbols; accept ≥5/7 E[R] after fee positive.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-trendfollow-c-multi.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import {
  TREND_FOLLOW_MAX_HOLD_4H,
  TREND_FOLLOW_TP1_RR,
  scanTrendFollowSetups,
  type TrendFollowSetup,
  type TrendFollowSide,
} from '../services/v41/trendFollowDetector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const WARMUP_1H = 80;
const WARMUP_4H = 220;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const MIN_POS = 5;
const STRENGTH_MIN = 70;
const MOM_MIN = 1 as const;

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
  '../docs/exports/v41-trendfollow-c-multi-symbol.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-c-multi-symbol-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-c-multi-symbol-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_TRENDFOLLOW_C_MULTI_SYMBOL_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  scenario: string;
  symbol: string;
  days: number;
  is_oos: boolean;
  four_h_open_time: number;
  four_h_iso: string;
  side: TrendFollowSide;
  entry: number;
  sl: number;
  tp1: number;
  outcome: Outcome;
  bars_held: number | null;
  sl_dist_pct: number;
  trend_strength: number;
  momentum_score: number;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
};

type SymbolResult = {
  scenario: string;
  symbol: string;
  days: number;
  is_oos: boolean;
  n_active: number;
  n_decided: number;
  wr: number;
  e_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
  mean_sl: number;
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

function signOf(e: number): SymbolResult['sign'] {
  if (!Number.isFinite(e)) return 'n/a';
  if (e > 1e-9) return 'positive';
  if (e < -1e-9) return 'negative';
  return 'flat';
}

function hitOnBar(
  side: TrendFollowSide,
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

function resolveExit(
  klines4h: KlineV41[],
  setup: TrendFollowSetup,
  entryIdx: number,
): { outcome: Outcome; bars_held: number | null } {
  const endIdx = Math.min(klines4h.length - 1, entryIdx + TREND_FOLLOW_MAX_HOLD_4H);
  for (let i = entryIdx + 1; i <= endIdx; i++) {
    const hit = hitOnBar(setup.side, klines4h[i]!, setup.sl, setup.tp1);
    if (hit) return { outcome: hit, bars_held: i - entryIdx };
  }
  return { outcome: 'TIMEOUT', bars_held: null };
}

function applyNoOverlapSameSide(
  setups: TrendFollowSetup[],
  klines4h: KlineV41[],
  idxByOpen: Map<number, number>,
): TrendFollowSetup[] {
  const kept: TrendFollowSetup[] = [];
  let longBusyUntil = -1;
  let shortBusyUntil = -1;
  const sorted = [...setups].sort((a, b) => a.fourHOpenTime - b.fourHOpenTime);
  for (const s of sorted) {
    const idx = idxByOpen.get(s.fourHOpenTime);
    if (idx == null) continue;
    const busyUntil = s.side === 'LONG' ? longBusyUntil : shortBusyUntil;
    if (idx <= busyUntil) continue;
    const exit = resolveExit(klines4h, s, idx);
    const exitIdx =
      exit.bars_held != null
        ? idx + exit.bars_held
        : Math.min(klines4h.length - 1, idx + TREND_FOLLOW_MAX_HOLD_4H);
    if (s.side === 'LONG') longBusyUntil = exitIdx;
    else shortBusyUntil = exitIdx;
    kept.push(s);
  }
  return kept;
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const allTrades: TradeRow[] = [];
  const results: SymbolResult[] = [];

  for (const s of SCENARIOS) {
    const evalStart = endMs - s.days * 24 * MS_1H;
    const fetchStart1h = evalStart - WARMUP_1H * MS_1H;
    const fetchStart4h = evalStart - WARMUP_4H * MS_4H;
    console.log(
      `[tf-c] fetching ${s.symbol} ${s.days}d${s.is_oos ? ' (OOS)' : ''}…`,
    );
    const [klines1h, klines4h] = await Promise.all([
      fetchKlines(s.symbol, '1h', fetchStart1h, endMs),
      fetchKlines(s.symbol, '4h', fetchStart4h, endMs),
    ]);
    const idxByOpen = new Map(klines4h.map((k, i) => [k.openTime, i]));

    let setups = scanTrendFollowSetups({
      klines4H: klines4h,
      klines1H: klines1h,
      momentumMin: MOM_MIN,
      strengthMin: STRENGTH_MIN,
      cooldownBars: 0,
      evalStartOpenTime: evalStart,
      evalEndOpenTimeExclusive: endMs,
    });
    setups = applyNoOverlapSameSide(setups, klines4h, idxByOpen);

    const trades: TradeRow[] = setups.map((setup) => {
      const idx = idxByOpen.get(setup.fourHOpenTime)!;
      const exit = resolveExit(klines4h, setup, idx);
      const fee_r =
        setup.slDistancePct > 0
          ? COST_ROUND_TRIP_PCT / setup.slDistancePct
          : NaN;
      const gR =
        exit.outcome === 'TP'
          ? setup.tp1RR
          : exit.outcome === 'SL' || exit.outcome === 'BOTH'
            ? -1
            : null;
      const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;
      return {
        scenario: s.id,
        symbol: s.symbol,
        days: s.days,
        is_oos: s.is_oos,
        four_h_open_time: setup.fourHOpenTime,
        four_h_iso: new Date(setup.fourHOpenTime).toISOString(),
        side: setup.side,
        entry: setup.entry,
        sl: setup.sl,
        tp1: setup.tp1,
        outcome: exit.outcome,
        bars_held: exit.bars_held,
        sl_dist_pct: setup.slDistancePct,
        trend_strength: setup.trendStrength,
        momentum_score: setup.momentumScore,
        gross_r: gR,
        fee_r: Number.isFinite(fee_r) ? fee_r : null,
        net_r,
      };
    });
    allTrades.push(...trades);

    const decided = trades.filter(
      (t) =>
        t.net_r != null &&
        (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
    );
    const wins = decided.filter((t) => t.outcome === 'TP').length;
    const e = mean(decided.map((t) => t.net_r!));
    const row: SymbolResult = {
      scenario: s.id,
      symbol: s.symbol,
      days: s.days,
      is_oos: s.is_oos,
      n_active: trades.length,
      n_decided: decided.length,
      wr: decided.length ? (wins / decided.length) * 100 : NaN,
      e_r_after: e,
      sign: signOf(e),
      mean_sl: mean(trades.map((t) => t.sl_dist_pct)),
      long_n: trades.filter((t) => t.side === 'LONG').length,
      short_n: trades.filter((t) => t.side === 'SHORT').length,
    };
    results.push(row);
    console.log(
      `[tf-c] ${s.id} n=${row.n_active} WR=${fmt(row.wr)}% E[R]=${fmt(row.e_r_after, 3)} (${row.sign})`,
    );
  }

  const nPos = results.filter((r) => r.sign === 'positive').length;
  const oos = results.filter((r) => r.is_oos);
  const oosPos = oos.filter((r) => r.sign === 'positive').length;
  const accepted = nPos >= MIN_POS;

  const sumHeader =
    'scenario,symbol,days,is_oos,n_active,n_decided,wr_pct,e_r_after,sign,mean_sl_pct,long_n,short_n';
  const sumLines = results.map((r) =>
    [
      r.scenario,
      r.symbol,
      r.days,
      r.is_oos ? 1 : 0,
      r.n_active,
      r.n_decided,
      fmt(r.wr),
      fmt(r.e_r_after, 4),
      r.sign,
      fmt(r.mean_sl, 3),
      r.long_n,
      r.short_n,
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [sumHeader, ...sumLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'scenario,symbol,days,is_oos,four_h_open_time,four_h_iso,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,trend_strength,momentum_score,gross_r,fee_r,net_r';
  const tradeLines = allTrades.map((t) =>
    [
      t.scenario,
      t.symbol,
      t.days,
      t.is_oos ? 1 : 0,
      t.four_h_open_time,
      t.four_h_iso,
      t.side,
      t.entry,
      t.sl,
      t.tp1,
      t.outcome,
      t.bars_held ?? '',
      t.sl_dist_pct.toFixed(4),
      t.trend_strength.toFixed(2),
      t.momentum_score,
      t.gross_r != null ? t.gross_r.toFixed(4) : '',
      t.fee_r != null ? t.fee_r.toFixed(4) : '',
      t.net_r != null ? t.net_r.toFixed(4) : '',
    ].join(','),
  );
  fs.writeFileSync(OUT_TRADES, [tradeHeader, ...tradeLines].join('\n') + '\n', 'utf8');

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        variant: 'C_str70_no_cd_no_overlap',
        config: {
          strengthMin: STRENGTH_MIN,
          cooldownBars: 0,
          noOverlapSameSide: true,
          momentumMin: MOM_MIN,
          tp1Rr: TREND_FOLLOW_TP1_RR,
          maxHold4H: TREND_FOLLOW_MAX_HOLD_4H,
          costRoundTripPct: COST_ROUND_TRIP_PCT,
        },
        accept_criterion: `≥${MIN_POS}/7 independent symbols E[R] after fee positive`,
        n_pos: nPos,
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
  md.push('# REPORT — Trend-Follow Variant C Multi-Symbol Validation');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Variant C:** Strength≥70 + direction + mom≥1 continuation; **no** first-gate cooldown; skip if same-side trade still active',
  );
  md.push(
    `**Cost:** ${COST_ROUND_TRIP_PCT}% RT · TP ${TREND_FOLLOW_TP1_RR}R · Hold ≤${TREND_FOLLOW_MAX_HOLD_4H}×4H · SL = entry ∓ ATR(14,4H)×1.0`,
  );
  md.push(
    '**Scope:** Report-only — reversal/breakout untouched. No other variants.',
  );
  md.push('');
  md.push('## Setup');
  md.push('');
  md.push(
    '- **7 symbol độc lập:** NEAR-365d (NEAR once), SOL/ETH/BNB/DOGE-180d, **XRP/ADA-180d (OOS)**',
  );
  md.push(`- Tiêu chí: **≥${MIN_POS}/7** E[R] sau phí dương`);
  md.push(
    '- NEAR prior reference: 180d n=68 E[R]=+0.147; 365d n=114 E[R]=+0.038',
  );
  md.push('');
  md.push('## Per-symbol results');
  md.push('');
  md.push(
    '| Symbol | Window | OOS? | n | WR% | E[R] sau phí | Sign | LONG n | SHORT n | mean SL% |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.symbol} | ${r.scenario} | ${r.is_oos ? 'YES' : 'no'} | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.e_r_after, 3)} | ${r.sign} | ${r.long_n} | ${r.short_n} | ${fmt(r.mean_sl)} |`,
    );
  }
  md.push('');
  md.push('## Counts');
  md.push('');
  md.push(`- Positive after fees: **${nPos}/7**`);
  md.push(`- OOS (XRP, ADA): **${oosPos}/${oos.length}** positive`);
  md.push('');
  md.push('### OOS detail');
  md.push('');
  for (const r of oos) {
    md.push(
      `- **${r.symbol}**: n=${r.n_active}, WR=${fmt(r.wr)}%, E[R]=${fmt(r.e_r_after, 3)} (${r.sign})`,
    );
  }
  md.push('');
  md.push('## Kết luận');
  md.push('');
  if (accepted) {
    md.push(
      `**ĐẠT** ≥${MIN_POS}/7: variant C có **${nPos}/7** symbol độc lập E[R] sau phí dương.`,
    );
    md.push('Không tự wire production trong task này.');
  } else {
    md.push(
      `**KHÔNG ĐẠT** ≥${MIN_POS}/7: variant C chỉ **${nPos}/7** symbol độc lập dương.`,
    );
    md.push(
      'Đây là bằng chứng đủ (trong mẫu đã test) để kết luận **trend-follow variant C cũng không có edge nhất quán qua symbol** — cùng pattern đã thấy với reversal / breakout (+ filters).',
    );
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/backtest-v41-trendfollow-c-multi.ts`');
  md.push('- `docs/exports/v41-trendfollow-c-multi-symbol.csv`');
  md.push('- `docs/exports/v41-trendfollow-c-multi-symbol-trades.csv`');
  md.push('- `docs/exports/v41-trendfollow-c-multi-symbol-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[tf-c] wrote ${OUT_CSV}`);
  console.log(`[tf-c] wrote ${OUT_TRADES}`);
  console.log(`[tf-c] wrote ${OUT_JSON}`);
  console.log(`[tf-c] wrote ${OUT_MD}`);
  console.log(`[tf-c] positive ${nPos}/7 — accepted=${accepted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

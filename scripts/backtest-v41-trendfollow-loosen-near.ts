/**
 * Loosen trend-follow triggers — NEAR 180d (auto 365d if n≥15 & E[R]>0).
 * Variants: strength≥55 / cooldown5 / no-cooldown+no-overlap.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-trendfollow-loosen-near.ts
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
const SYMBOL = 'NEARUSDT';
const WARMUP_1H = 80;
const WARMUP_4H = 220;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const CONTINUE_N = 15;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-loosen-near.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-loosen-near-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-loosen-near-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_TRENDFOLLOW_LOOSEN_TRIGGER_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type Variant = {
  id: string;
  label: string;
  strengthMin: number;
  cooldownBars: number;
  /** If true: cooldownBars=0 and skip new entry while same-side trade still open. */
  noOverlapSameSide: boolean;
};

const VARIANTS: Variant[] = [
  {
    id: 'A_str55_cd10',
    label: 'Strength≥55, cooldown 10 (mom≥1)',
    strengthMin: 55,
    cooldownBars: 10,
    noOverlapSameSide: false,
  },
  {
    id: 'B_str70_cd5',
    label: 'Strength≥70, cooldown 5 (mom≥1)',
    strengthMin: 70,
    cooldownBars: 5,
    noOverlapSameSide: false,
  },
  {
    id: 'C_str70_no_cd_no_overlap',
    label: 'Strength≥70, no first-gate cooldown, no same-side overlap (mom≥1)',
    strengthMin: 70,
    cooldownBars: 0,
    noOverlapSameSide: true,
  },
];

type TradeRow = {
  scenario: string;
  days: number;
  variant_id: string;
  four_h_open_time: number;
  four_h_iso: string;
  side: TrendFollowSide;
  entry: number;
  sl: number;
  tp1: number;
  outcome: Outcome;
  bars_held: number | null;
  exit_open_time: number | null;
  sl_dist_pct: number;
  trend_strength: number;
  momentum_score: number;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
};

type RunResult = {
  scenario: string;
  days: number;
  variant_id: string;
  label: string;
  n_active: number;
  n_decided: number;
  wr: number;
  e_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
  mean_sl: number;
  long_n: number;
  short_n: number;
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
): { outcome: Outcome; bars_held: number | null; exit_open_time: number | null } {
  const endIdx = Math.min(klines4h.length - 1, entryIdx + TREND_FOLLOW_MAX_HOLD_4H);
  for (let i = entryIdx + 1; i <= endIdx; i++) {
    const hit = hitOnBar(setup.side, klines4h[i]!, setup.sl, setup.tp1);
    if (hit) {
      return {
        outcome: hit,
        bars_held: i - entryIdx,
        exit_open_time: klines4h[i]!.openTime,
      };
    }
  }
  return {
    outcome: 'TIMEOUT',
    bars_held: null,
    exit_open_time: klines4h[endIdx]?.openTime ?? null,
  };
}

function toTradeRow(
  setup: TrendFollowSetup,
  exit: ReturnType<typeof resolveExit>,
  meta: { scenario: string; days: number; variant_id: string },
): TradeRow {
  const fee_r =
    setup.slDistancePct > 0 ? COST_ROUND_TRIP_PCT / setup.slDistancePct : NaN;
  const gR =
    exit.outcome === 'TP'
      ? setup.tp1RR
      : exit.outcome === 'SL' || exit.outcome === 'BOTH'
        ? -1
        : null;
  const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;

  return {
    ...meta,
    four_h_open_time: setup.fourHOpenTime,
    four_h_iso: new Date(setup.fourHOpenTime).toISOString(),
    side: setup.side,
    entry: setup.entry,
    sl: setup.sl,
    tp1: setup.tp1,
    outcome: exit.outcome,
    bars_held: exit.bars_held,
    exit_open_time: exit.exit_open_time,
    sl_dist_pct: setup.slDistancePct,
    trend_strength: setup.trendStrength,
    momentum_score: setup.momentumScore,
    gross_r: gR,
    fee_r: Number.isFinite(fee_r) ? fee_r : null,
    net_r,
  };
}

/**
 * Variant C: take setups in time order; skip if same-side position still open.
 */
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

function summarize(
  scenario: string,
  days: number,
  variant: Variant,
  trades: TradeRow[],
): RunResult {
  const decided = trades.filter(
    (t) =>
      t.net_r != null &&
      (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  const wr = decided.length ? (wins / decided.length) * 100 : NaN;
  const e = mean(decided.map((t) => t.net_r!));
  let sign: RunResult['sign'] = 'n/a';
  if (Number.isFinite(e)) {
    if (e > 1e-9) sign = 'positive';
    else if (e < -1e-9) sign = 'negative';
    else sign = 'flat';
  }
  return {
    scenario,
    days,
    variant_id: variant.id,
    label: variant.label,
    n_active: trades.length,
    n_decided: decided.length,
    wr,
    e_r_after: e,
    sign,
    mean_sl: mean(trades.map((t) => t.sl_dist_pct)),
    long_n: trades.filter((t) => t.side === 'LONG').length,
    short_n: trades.filter((t) => t.side === 'SHORT').length,
    trades,
  };
}

function runVariant(
  days: number,
  endMs: number,
  near1h: KlineV41[],
  near4h: KlineV41[],
  variant: Variant,
): RunResult {
  const evalStart = endMs - days * 24 * MS_1H;
  const scenario = `NEAR-${days}d_${variant.id}`;
  let setups = scanTrendFollowSetups({
    klines4H: near4h,
    klines1H: near1h,
    momentumMin: 1,
    strengthMin: variant.strengthMin,
    cooldownBars: variant.cooldownBars,
    evalStartOpenTime: evalStart,
    evalEndOpenTimeExclusive: endMs,
  });

  const idxByOpen = new Map(near4h.map((k, i) => [k.openTime, i]));
  if (variant.noOverlapSameSide) {
    setups = applyNoOverlapSameSide(setups, near4h, idxByOpen);
  }

  const trades = setups.map((s) => {
    const idx = idxByOpen.get(s.fourHOpenTime)!;
    const exit = resolveExit(near4h, s, idx);
    return toTradeRow(s, exit, {
      scenario,
      days,
      variant_id: variant.id,
    });
  });

  return summarize(scenario, days, variant, trades);
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const fetchStart1h = endMs - 365 * 24 * MS_1H - WARMUP_1H * MS_1H;
  const fetchStart4h = endMs - 365 * 24 * MS_1H - WARMUP_4H * MS_4H;

  console.log(`[loosen] fetching NEAR 1H/4H…`);
  const [near1h, near4h] = await Promise.all([
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
    fetchKlines(SYMBOL, '4h', fetchStart4h, endMs),
  ]);
  console.log(`[loosen] 1h=${near1h.length} 4h=${near4h.length}`);

  const results: RunResult[] = [];

  for (const v of VARIANTS) {
    console.log(`[loosen] NEAR-180d ${v.id}…`);
    const r = runVariant(180, endMs, near1h, near4h, v);
    results.push(r);
    console.log(
      `[loosen] ${r.scenario} n=${r.n_active} WR=${fmt(r.wr)}% E[R]=${fmt(r.e_r_after, 3)} (${r.sign})`,
    );
  }

  const qualify = results.filter(
    (r) =>
      r.days === 180 &&
      r.n_active >= CONTINUE_N &&
      Number.isFinite(r.e_r_after) &&
      r.e_r_after > 0,
  );
  const ran365 = qualify.length > 0;

  if (ran365) {
    console.log(
      `[loosen] qualify → 365d: ${qualify.map((q) => q.variant_id).join(', ')}`,
    );
    for (const v of VARIANTS) {
      // Run all 3 on 365 for full comparison once gate opens
      console.log(`[loosen] NEAR-365d ${v.id}…`);
      const r = runVariant(365, endMs, near1h, near4h, v);
      results.push(r);
      console.log(
        `[loosen] ${r.scenario} n=${r.n_active} WR=${fmt(r.wr)}% E[R]=${fmt(r.e_r_after, 3)}`,
      );
    }
  } else {
    console.log(`[loosen] no variant n≥${CONTINUE_N} & E[R]>0 — skip 365d`);
  }

  const sumHeader =
    'scenario,days,variant_id,label,n_active,n_decided,wr_pct,e_r_after,sign,mean_sl_pct,long_n,short_n';
  const sumLines = results.map((r) =>
    [
      r.scenario,
      r.days,
      r.variant_id,
      JSON.stringify(r.label),
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
    'scenario,days,variant_id,four_h_open_time,four_h_iso,side,entry,sl,tp1,outcome,bars_held,exit_open_time,sl_dist_pct,trend_strength,momentum_score,gross_r,fee_r,net_r';
  const tradeLines: string[] = [];
  for (const r of results) {
    for (const t of r.trades) {
      tradeLines.push(
        [
          t.scenario,
          t.days,
          t.variant_id,
          t.four_h_open_time,
          t.four_h_iso,
          t.side,
          t.entry,
          t.sl,
          t.tp1,
          t.outcome,
          t.bars_held ?? '',
          t.exit_open_time ?? '',
          t.sl_dist_pct.toFixed(4),
          t.trend_strength.toFixed(2),
          t.momentum_score,
          t.gross_r != null ? t.gross_r.toFixed(4) : '',
          t.fee_r != null ? t.fee_r.toFixed(4) : '',
          t.net_r != null ? t.net_r.toFixed(4) : '',
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
        baseline_reference: { id: 'original', n_180: 6, note: 'str≥70 cd10 mom≥1' },
        cost_round_trip_pct: COST_ROUND_TRIP_PCT,
        tp1_rr: TREND_FOLLOW_TP1_RR,
        continue_rule: `n≥${CONTINUE_N} AND E[R]>0 on any 180d variant`,
        ran_365: ran365,
        results: results.map(({ trades: _t, ...rest }) => rest),
      },
      null,
      2,
    ),
    'utf8',
  );

  const md: string[] = [];
  md.push('# REPORT — Trend-Follow Loosen Trigger (NEAR)');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    `**Symbol:** ${SYMBOL} · mom≥1 fixed · cost ${COST_ROUND_TRIP_PCT}% RT · TP ${TREND_FOLLOW_TP1_RR}R`,
  );
  md.push(
    '**Scope:** Loosen triggers only — reversal/breakout untouched. No multi-symbol.',
  );
  md.push('');
  md.push('## Variants');
  md.push('');
  md.push('| id | Change vs original (str≥70, cd10) |');
  md.push('|---|---|');
  md.push('| A_str55_cd10 | Strength **≥55**, cooldown 10 |');
  md.push('| B_str70_cd5 | Strength ≥70, cooldown **5** |');
  md.push(
    '| C_str70_no_cd_no_overlap | Strength ≥70, **no** first-gate cooldown; skip if same-side trade still active |',
  );
  md.push('');
  md.push('## NEAR-180d results');
  md.push('');
  md.push(
    '| Variant | n | WR% | E[R] sau phí | Sign | LONG n | SHORT n | mean SL% |',
  );
  md.push('|---|---|---|---|---|---|---|---|');
  md.push('| Original (prior) | 6 | 50.00 | +0.186 | positive | 2 | 4 | — |');
  for (const r of results.filter((x) => x.days === 180)) {
    md.push(
      `| ${r.label} | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.e_r_after, 3)} | ${r.sign} | ${r.long_n} | ${r.short_n} | ${fmt(r.mean_sl)} |`,
    );
  }
  md.push('');
  if (ran365) {
    md.push('## NEAR-365d results (auto-continued)');
    md.push('');
    md.push('| Variant | n | WR% | E[R] sau phí | Sign | ΔE vs 180d |');
    md.push('|---|---|---|---|---|---|');
    for (const v of VARIANTS) {
      const a = results.find((x) => x.days === 180 && x.variant_id === v.id)!;
      const b = results.find((x) => x.days === 365 && x.variant_id === v.id)!;
      md.push(
        `| ${v.label} | ${b.n_active} | ${fmt(b.wr)} | ${fmt(b.e_r_after, 3)} | ${b.sign} | ${fmt(b.e_r_after - a.e_r_after, 3)} |`,
      );
    }
    md.push('');
  } else {
    md.push('## NEAR-365d');
    md.push('');
    md.push(
      `Skipped — no 180d variant with n≥${CONTINUE_N} and E[R]>0.`,
    );
    md.push('');
  }
  md.push('## Kết luận');
  md.push('');
  const r180 = results.filter((x) => x.days === 180);
  const anyEnough = r180.some((r) => r.n_active >= CONTINUE_N);
  if (!anyEnough) {
    md.push(
      `Cả 3 biến thể vẫn **n&lt;${CONTINUE_N}** trên NEAR-180d → bằng chứng đủ để **tạm dừng** hướng trend-following: trong 180 ngày này NEAR hiếm khi tạo đủ điều kiện (không chỉ do cooldown 10 quá dài).`,
    );
  } else if (!ran365) {
    md.push(
      `Có biến thể n≥${CONTINUE_N} nhưng **E[R] không dương** → không tiếp 365d; edge không đủ trên mẫu đã nới.`,
    );
  } else {
    const pos365 = results.filter(
      (r) => r.days === 365 && r.sign === 'positive' && r.n_active >= CONTINUE_N,
    );
    if (pos365.length) {
      md.push(
        `Có biến thể đạt n≥${CONTINUE_N} + E[R]>0 trên 180d và **vẫn dương** trên 365d: ${pos365.map((p) => p.variant_id).join(', ')} — có thể cân nhắc multi-symbol ở bước sau.`,
      );
    } else {
      md.push(
        'Đã nới đủ mẫu trên 180d nhưng **không giữ edge** trên 365d (hoặc không đủ n) — không mở rộng đa symbol dựa trên 180d.',
      );
    }
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/backtest-v41-trendfollow-loosen-near.ts`');
  md.push('- `docs/exports/v41-trendfollow-loosen-near.csv`');
  md.push('- `docs/exports/v41-trendfollow-loosen-near-trades.csv`');
  md.push('- `docs/exports/v41-trendfollow-loosen-near-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[loosen] wrote ${OUT_CSV}`);
  console.log(`[loosen] wrote ${OUT_TRADES}`);
  console.log(`[loosen] wrote ${OUT_JSON}`);
  console.log(`[loosen] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

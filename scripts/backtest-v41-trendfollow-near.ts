/**
 * Trend-follow detector — NEAR validation (180d then auto 365d if criteria met).
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-trendfollow-near.ts
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

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

const CONTINUE_TO_365_N = 15;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-near-validation.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-near-validation-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-trendfollow-near-validation-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_TRENDFOLLOW_DETECTOR_NEAR_VALIDATION_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  scenario: string;
  days: number;
  momentum_min: number;
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
  trend_direction: string;
  momentum_score: number;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
  net_pnl_pct: number | null;
};

type RunResult = {
  scenario: string;
  days: number;
  momentum_min: 1 | 2;
  n_active: number;
  n_decided: number;
  wins: number;
  losses: number;
  both: number;
  timeout: number;
  wr: number;
  e_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
  mean_sl: number;
  long_n: number;
  long_wr: number;
  long_e_r: number;
  short_n: number;
  short_wr: number;
  short_e_r: number;
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

function simulateTrade(
  klines4h: KlineV41[],
  setup: TrendFollowSetup,
  idxByOpen: Map<number, number>,
  meta: { scenario: string; days: number; momentum_min: number },
): TradeRow {
  const idx = idxByOpen.get(setup.fourHOpenTime);
  let outcome: Outcome = 'TIMEOUT';
  let bars_held: number | null = null;
  if (idx != null) {
    const endIdx = Math.min(klines4h.length - 1, idx + TREND_FOLLOW_MAX_HOLD_4H);
    for (let i = idx + 1; i <= endIdx; i++) {
      const hit = hitOnBar(setup.side, klines4h[i]!, setup.sl, setup.tp1);
      if (hit) {
        outcome = hit;
        bars_held = i - idx;
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
    four_h_open_time: setup.fourHOpenTime,
    four_h_iso: new Date(setup.fourHOpenTime).toISOString(),
    side: setup.side,
    entry: setup.entry,
    sl: setup.sl,
    tp1: setup.tp1,
    outcome,
    bars_held,
    sl_dist_pct: setup.slDistancePct,
    trend_strength: setup.trendStrength,
    trend_direction: setup.trendDirection,
    momentum_score: setup.momentumScore,
    gross_r: gR,
    fee_r: Number.isFinite(fee_r) ? fee_r : null,
    net_r,
    net_pnl_pct,
  };
}

function sideStats(trades: TradeRow[], side: TrendFollowSide) {
  const g = trades.filter((t) => t.side === side);
  const decided = g.filter(
    (t) =>
      t.net_r != null &&
      (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  return {
    n: g.length,
    wr: decided.length ? (wins / decided.length) * 100 : NaN,
    e_r: mean(decided.map((t) => t.net_r!)),
  };
}

function summarize(
  scenario: string,
  days: number,
  momentum_min: 1 | 2,
  trades: TradeRow[],
): RunResult {
  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const decided = trades.filter(
    (t) =>
      t.net_r != null &&
      (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  const wr = decided.length ? (wins / decided.length) * 100 : NaN;
  const e = mean(decided.map((t) => t.net_r!));
  let sign: RunResult['sign'] = 'n/a';
  if (Number.isFinite(e)) {
    if (e > 1e-9) sign = 'positive';
    else if (e < -1e-9) sign = 'negative';
    else sign = 'flat';
  }
  const L = sideStats(trades, 'LONG');
  const S = sideStats(trades, 'SHORT');
  return {
    scenario,
    days,
    momentum_min,
    n_active: trades.length,
    n_decided: decided.length,
    wins,
    losses,
    both,
    timeout,
    wr,
    e_r_after: e,
    sign,
    mean_sl: mean(trades.map((t) => t.sl_dist_pct)),
    long_n: L.n,
    long_wr: L.wr,
    long_e_r: L.e_r,
    short_n: S.n,
    short_wr: S.wr,
    short_e_r: S.e_r,
    trades,
  };
}

async function runWindow(
  days: number,
  endMs: number,
  near1h: KlineV41[],
  near4h: KlineV41[],
  momentumMin: 1 | 2,
): Promise<RunResult> {
  const evalStart = endMs - days * 24 * MS_1H;
  const scenario = `NEAR-${days}d_mom≥${momentumMin}`;
  const setups = scanTrendFollowSetups({
    klines4H: near4h,
    klines1H: near1h,
    momentumMin,
    evalStartOpenTime: evalStart,
    evalEndOpenTimeExclusive: endMs,
  });
  const idxByOpen = new Map(near4h.map((k, i) => [k.openTime, i]));
  const trades = setups.map((s) =>
    simulateTrade(near4h, s, idxByOpen, {
      scenario,
      days,
      momentum_min: momentumMin,
    }),
  );
  return summarize(scenario, days, momentumMin, trades);
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const fetchStart1h = endMs - 365 * 24 * MS_1H - WARMUP_1H * MS_1H;
  const fetchStart4h = endMs - 365 * 24 * MS_1H - WARMUP_4H * MS_4H;

  console.log(`[tf] fetching NEAR 1H/4H (up to 365d window)…`);
  const [near1h, near4h] = await Promise.all([
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
    fetchKlines(SYMBOL, '4h', fetchStart4h, endMs),
  ]);
  console.log(`[tf] 1h=${near1h.length} 4h=${near4h.length}`);

  const results: RunResult[] = [];
  const momThresholds: Array<1 | 2> = [1, 2];

  // Step 2: NEAR 180d
  for (const m of momThresholds) {
    console.log(`[tf] scanning NEAR-180d mom≥${m}…`);
    const r = await runWindow(180, endMs, near1h, near4h, m);
    results.push(r);
    console.log(
      `[tf] ${r.scenario} n=${r.n_active} WR=${fmt(r.wr)}% E[R]=${fmt(r.e_r_after, 3)} L=${r.long_n}/${fmt(r.long_wr)} S=${r.short_n}/${fmt(r.short_wr)}`,
    );
  }

  const qualify180 = results.filter(
    (r) =>
      r.days === 180 &&
      r.n_active >= CONTINUE_TO_365_N &&
      Number.isFinite(r.e_r_after) &&
      r.e_r_after > 0,
  );
  const ran365 = qualify180.length > 0;

  // Step 3: auto NEAR-365d if any 180d variant qualifies
  if (ran365) {
    console.log(
      `[tf] NEAR-180d qualifies (${qualify180.map((q) => q.scenario).join(', ')}) → running 365d…`,
    );
    for (const m of momThresholds) {
      console.log(`[tf] scanning NEAR-365d mom≥${m}…`);
      const r = await runWindow(365, endMs, near1h, near4h, m);
      results.push(r);
      console.log(
        `[tf] ${r.scenario} n=${r.n_active} WR=${fmt(r.wr)}% E[R]=${fmt(r.e_r_after, 3)}`,
      );
    }
  } else {
    console.log(
      `[tf] no 180d variant with n≥${CONTINUE_TO_365_N} and E[R]>0 — skip 365d`,
    );
  }

  // Artefacts
  const sumHeader =
    'scenario,days,momentum_min,n_active,n_decided,wins,losses,both,timeout,wr_pct,e_r_after,sign,mean_sl_pct,long_n,long_wr,long_e_r,short_n,short_wr,short_e_r';
  const sumLines = results.map((r) =>
    [
      r.scenario,
      r.days,
      r.momentum_min,
      r.n_active,
      r.n_decided,
      r.wins,
      r.losses,
      r.both,
      r.timeout,
      fmt(r.wr),
      fmt(r.e_r_after, 4),
      r.sign,
      fmt(r.mean_sl, 3),
      r.long_n,
      fmt(r.long_wr),
      fmt(r.long_e_r, 4),
      r.short_n,
      fmt(r.short_wr),
      fmt(r.short_e_r, 4),
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [sumHeader, ...sumLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'scenario,days,momentum_min,four_h_open_time,four_h_iso,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,trend_strength,trend_direction,momentum_score,gross_r,fee_r,net_r,net_pnl_pct';
  const tradeLines: string[] = [];
  for (const r of results) {
    for (const t of r.trades) {
      tradeLines.push(
        [
          t.scenario,
          t.days,
          t.momentum_min,
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
          t.trend_direction,
          t.momentum_score,
          t.gross_r != null ? t.gross_r.toFixed(4) : '',
          t.fee_r != null ? t.fee_r.toFixed(4) : '',
          t.net_r != null ? t.net_r.toFixed(4) : '',
          t.net_pnl_pct != null ? t.net_pnl_pct.toFixed(4) : '',
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
        cost_round_trip_pct: COST_ROUND_TRIP_PCT,
        tp1_rr: TREND_FOLLOW_TP1_RR,
        max_hold_4h: TREND_FOLLOW_MAX_HOLD_4H,
        continue_to_365_rule: `n≥${CONTINUE_TO_365_N} AND E[R]>0 on any 180d variant`,
        ran_365: ran365,
        results: results.map(({ trades: _t, ...rest }) => rest),
      },
      null,
      2,
    ),
    'utf8',
  );

  const md: string[] = [];
  md.push('# REPORT — V4.1 Trend-Follow Detector NEAR Validation');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    `**Symbol:** ${SYMBOL} · Confirm: pure trend-follow (4H gate + 1H continuation momentum)`,
  );
  md.push(
    `**Cost:** ${COST_ROUND_TRIP_PCT}% RT · TP 1.5R · Hold ≤${TREND_FOLLOW_MAX_HOLD_4H}×4H · SL = entry ∓ ATR(14,4H)×1.0`,
  );
  md.push(
    '**Scope:** New `trendFollowDetector.ts` only — reversal/breakout untouched. No multi-symbol.',
  );
  md.push('');
  md.push('## Design');
  md.push('');
  md.push(
    '- Trigger 4H: first bar with TrendStrength≥70 + matching direction after ≥10 bars without same-side gate (cooldown / first-of-wave)',
  );
  md.push(
    '- Momentum 1H **continuation** (`computeMomentum1H` score ≥1 or ≥2) — NOT CVD flip',
  );
  md.push('- Entry = 4H close; features at trigger bar');
  md.push('');
  md.push('## Results');
  md.push('');
  md.push(
    '| Scenario | mom≥ | n | WR% | E[R] sau phí | Sign | LONG n/WR/E[R] | SHORT n/WR/E[R] | mean SL% |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.scenario} | ${r.momentum_min} | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.e_r_after, 3)} | ${r.sign} | ${r.long_n}/${fmt(r.long_wr)}/${fmt(r.long_e_r, 3)} | ${r.short_n}/${fmt(r.short_wr)}/${fmt(r.short_e_r, 3)} | ${fmt(r.mean_sl)} |`,
    );
  }
  md.push('');
  md.push('## NEAR-180 → 365 gate');
  md.push('');
  if (ran365) {
    md.push(
      `At least one 180d variant met n≥${CONTINUE_TO_365_N} and E[R]>0 → **365d was run**.`,
    );
    const r180 = results.filter((r) => r.days === 180);
    const r365 = results.filter((r) => r.days === 365);
    md.push('');
    md.push('| mom≥ | E[R] 180d | E[R] 365d | Δ E[R] | WR 180d | WR 365d | Δ WR |');
    md.push('|---|---|---|---|---|---|---|');
    for (const m of momThresholds) {
      const a = r180.find((x) => x.momentum_min === m)!;
      const b = r365.find((x) => x.momentum_min === m)!;
      md.push(
        `| ${m} | ${fmt(a.e_r_after, 3)} | ${fmt(b.e_r_after, 3)} | ${fmt(b.e_r_after - a.e_r_after, 3)} | ${fmt(a.wr)} | ${fmt(b.wr)} | ${fmt(b.wr - a.wr, 1)} pp |`,
      );
    }
  } else {
    md.push(
      `No 180d variant with n≥${CONTINUE_TO_365_N} and E[R]>0 → **365d skipped** per protocol.`,
    );
  }
  md.push('');
  md.push('## Kết luận (NEAR only)');
  md.push('');
  const best180 = [...results.filter((r) => r.days === 180)].sort(
    (a, b) => (b.e_r_after || -999) - (a.e_r_after || -999),
  )[0];
  if (best180) {
    md.push(
      `- Best 180d: **mom≥${best180.momentum_min}** n=${best180.n_active}, WR=${fmt(best180.wr)}%, E[R]=${fmt(best180.e_r_after, 3)} (${best180.sign})`,
    );
  }
  if (ran365) {
    const stillPos = results.some(
      (r) => r.days === 365 && r.sign === 'positive' && r.n_active >= CONTINUE_TO_365_N,
    );
    md.push(
      stillPos
        ? '- Edge **vẫn dương** trên NEAR-365d (ít nhất 1 biến thể) — ứng viên có thể cân nhắc multi-symbol ở bước sau.'
        : '- Edge **không giữ** rõ trên NEAR-365d — không mở rộng đa symbol dựa trên 180d đẹp.',
    );
  } else {
    md.push(
      '- Giả thuyết trend-follow continuation **không đủ** trên NEAR-180d (n hoặc E[R]) để bước 365d / đa symbol.',
    );
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `services/v41/trendFollowDetector.ts`');
  md.push('- `services/v41/__tests__/trendFollowDetector.test.ts`');
  md.push('- `scripts/backtest-v41-trendfollow-near.ts`');
  md.push('- `docs/exports/v41-trendfollow-near-validation.csv`');
  md.push('- `docs/exports/v41-trendfollow-near-validation-trades.csv`');
  md.push('- `docs/exports/v41-trendfollow-near-validation-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[tf] wrote ${OUT_CSV}`);
  console.log(`[tf] wrote ${OUT_TRADES}`);
  console.log(`[tf] wrote ${OUT_JSON}`);
  console.log(`[tf] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

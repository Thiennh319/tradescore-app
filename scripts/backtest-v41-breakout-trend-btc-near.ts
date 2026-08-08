/**
 * NEAR-365d Confirm B — TrendStrength(4H) + BTC same-direction filters.
 * Report-only. Reuses breakoutDetector + calculateTrendStrength.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-trend-btc-near.ts
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
const TREND_STRENGTH_MIN = 70;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

/** Prior report baseline (reference); this run also recomputes live baseline. */
const PRIOR_BASELINE = { n: 31, wr: 53.33, er_after: 0.254 };

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-trend-btc-filter-near.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-trend-btc-filter-near-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-trend-btc-filter-near-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_TRENDSTRENGTH_BTC_FILTER_NEAR_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type EnrichedTrade = {
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
  /** At breakout time (not retest). */
  trend_strength_4h: number;
  trend_direction_4h: TrendDirection;
  btc_direction_4h: TrendDirection;
  btc_trend_strength_4h: number;
  alt_aligned_strong: boolean;
  btc_same_direction: boolean;
  both_filters: boolean;
};

type FilterId = 'baseline' | 'trend_strong_aligned' | 'btc_same_dir' | 'both';

type FilterResult = {
  filter_id: FilterId;
  label: string;
  n_active: number;
  n_decided: number;
  wr: number;
  e_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
  mean_sl: number;
  delta_er_vs_baseline: number;
  delta_wr_vs_baseline: number;
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

function directionMatchesBreakout(
  side: BreakoutSide,
  dir: TrendDirection,
): boolean {
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

function simulate(
  klines1h: KlineV41[],
  setup: BreakoutTradeLevels,
  idxByOpen: Map<number, number>,
  near4h: KlineV41[],
  btc4h: KlineV41[],
): EnrichedTrade {
  const winNear = sliceUpTo(near4h, setup.breakoutOpenTime);
  const winBtc = sliceUpTo(btc4h, setup.breakoutOpenTime);
  const alt = calculateTrendStrength(winNear);
  const btc = calculateTrendStrength(winBtc);

  const alt_aligned_strong =
    alt.trendStrength >= TREND_STRENGTH_MIN &&
    directionMatchesBreakout(setup.side, alt.trendDirection);
  const btc_same_direction = directionMatchesBreakout(
    setup.side,
    btc.trendDirection,
  );

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
    trend_strength_4h: alt.trendStrength,
    trend_direction_4h: alt.trendDirection,
    btc_direction_4h: btc.trendDirection,
    btc_trend_strength_4h: btc.trendStrength,
    alt_aligned_strong,
    btc_same_direction,
    both_filters: alt_aligned_strong && btc_same_direction,
  };
}

function summarize(
  filter_id: FilterId,
  label: string,
  trades: EnrichedTrade[],
  baselineEr: number,
  baselineWr: number,
): FilterResult {
  const decided = trades.filter(
    (t) =>
      t.net_r != null &&
      (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  const wr = decided.length ? (wins / decided.length) * 100 : NaN;
  const e = mean(decided.map((t) => t.net_r!));
  let sign: FilterResult['sign'] = 'n/a';
  if (Number.isFinite(e)) {
    if (e > 1e-9) sign = 'positive';
    else if (e < -1e-9) sign = 'negative';
    else sign = 'flat';
  }
  return {
    filter_id,
    label,
    n_active: trades.length,
    n_decided: decided.length,
    wr,
    e_r_after: e,
    sign,
    mean_sl: mean(trades.map((t) => t.sl_dist_pct)),
    delta_er_vs_baseline: Number.isFinite(e) ? e - baselineEr : NaN,
    delta_wr_vs_baseline: Number.isFinite(wr) ? wr - baselineWr : NaN,
  };
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const fetchStart1h = evalStart - WARMUP_1H * MS_1H;
  const fetchStart4h = evalStart - WARMUP_4H * MS_4H;

  console.log(`[ts-btc] fetching NEAR 1H/4H + BTC 4H ${DAYS}d…`);
  const [near1h, near4h, btc4h] = await Promise.all([
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
    fetchKlines(SYMBOL, '4h', fetchStart4h, endMs),
    fetchKlines('BTCUSDT', '4h', fetchStart4h, endMs),
  ]);
  console.log(
    `[ts-btc] near1h=${near1h.length} near4h=${near4h.length} btc4h=${btc4h.length}`,
  );

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
  console.log(`[ts-btc] Confirm B setups=${setups.length}`);

  const idxByOpen = new Map(near1h.map((k, i) => [k.openTime, i]));
  const trades = setups.map((s) => simulate(near1h, s, idxByOpen, near4h, btc4h));

  const baseline = summarize(
    'baseline',
    'Baseline (no filter)',
    trades,
    PRIOR_BASELINE.er_after,
    PRIOR_BASELINE.wr,
  );
  // Deltas vs THIS run's baseline (fair), not only prior
  const liveBaselineEr = baseline.e_r_after;
  const liveBaselineWr = baseline.wr;

  const filters: Array<{ id: FilterId; label: string; pred: (t: EnrichedTrade) => boolean }> =
    [
      { id: 'baseline', label: 'Baseline (no filter)', pred: () => true },
      {
        id: 'trend_strong_aligned',
        label: `TrendStrength≥${TREND_STRENGTH_MIN} + same dir (4H)`,
        pred: (t) => t.alt_aligned_strong,
      },
      {
        id: 'btc_same_dir',
        label: 'BTC 4H same direction as breakout',
        pred: (t) => t.btc_same_direction,
      },
      {
        id: 'both',
        label: 'TrendStrength≥70 aligned + BTC same dir',
        pred: (t) => t.both_filters,
      },
    ];

  const results: FilterResult[] = filters.map((f) => {
    const kept = trades.filter(f.pred);
    return summarize(f.id, f.label, kept, liveBaselineEr, liveBaselineWr);
  });

  for (const r of results) {
    console.log(
      `[ts-btc] ${r.filter_id} n=${r.n_active} (dec=${r.n_decided}) WR=${fmt(r.wr)}% E[R]=${fmt(r.e_r_after, 3)} ΔE=${fmt(r.delta_er_vs_baseline, 3)}`,
    );
  }

  // Candidate rule: n≥15 AND clear E[R] improvement vs live baseline
  const IMPROVE_MIN = 0.05; // clear = ≥ +0.05 R after fee
  const candidates = results.filter(
    (r) =>
      r.filter_id !== 'baseline' &&
      r.n_active >= 15 &&
      Number.isFinite(r.e_r_after) &&
      r.e_r_after > liveBaselineEr + IMPROVE_MIN,
  );

  // CSV
  const sumHeader =
    'filter_id,label,n_active,n_decided,wr_pct,e_r_after,sign,mean_sl_pct,delta_er_vs_baseline,delta_wr_vs_baseline';
  const sumLines = results.map((r) =>
    [
      r.filter_id,
      JSON.stringify(r.label),
      r.n_active,
      r.n_decided,
      fmt(r.wr),
      fmt(r.e_r_after, 4),
      r.sign,
      fmt(r.mean_sl, 3),
      fmt(r.delta_er_vs_baseline, 4),
      fmt(r.delta_wr_vs_baseline, 2),
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [sumHeader, ...sumLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'breakout_open_time,active_open_time,active_iso,side,entry,sl,tp1,outcome,bars_held,sl_dist_pct,gross_r,fee_r,net_r,trend_strength_4h,trend_direction_4h,btc_direction_4h,btc_trend_strength_4h,alt_aligned_strong,btc_same_direction,both_filters';
  const tradeLines = trades.map((t) =>
    [
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
      t.trend_strength_4h.toFixed(2),
      t.trend_direction_4h,
      t.btc_direction_4h,
      t.btc_trend_strength_4h.toFixed(2),
      t.alt_aligned_strong ? 1 : 0,
      t.btc_same_direction ? 1 : 0,
      t.both_filters ? 1 : 0,
    ].join(','),
  );
  fs.writeFileSync(OUT_TRADES, [tradeHeader, ...tradeLines].join('\n') + '\n', 'utf8');

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        symbol: SYMBOL,
        days: DAYS,
        confirm: 'retest',
        config: {
          lookbackN: LOOKBACK_N,
          maxWidthPct: MAX_WIDTH_PCT,
          slMode: 'atr_break_level',
          atrMult: ATR_MULT,
          tp1Rr: BREAKOUT_TP1_RR,
          costRoundTripPct: COST_ROUND_TRIP_PCT,
          trendStrengthMin: TREND_STRENGTH_MIN,
        },
        feature_timing: 'trendStrength / BTC direction evaluated at breakout openTime (not retest)',
        prior_baseline_reference: PRIOR_BASELINE,
        live_baseline: {
          n: baseline.n_active,
          wr: baseline.wr,
          e_r_after: baseline.e_r_after,
        },
        candidate_rule: `n_active≥15 AND E[R]_after > baseline + ${IMPROVE_MIN}`,
        candidates: candidates.map((c) => c.filter_id),
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  const md: string[] = [];
  md.push('# REPORT — Breakout Confirm B TrendStrength + BTC Filter (NEAR-365d)');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    `**Symbol:** ${SYMBOL} · **Window:** ${DAYS}d · Confirm **B (retest)** · V1 ATR SL×1.0 · W_N20_X5 · cost ${COST_ROUND_TRIP_PCT}% RT`,
  );
  md.push(
    '**Scope:** Report-only — features tại **thời điểm breakout** (không phải retest). Không multi-symbol. Không sửa production.',
  );
  md.push('');
  md.push('## Filters');
  md.push('');
  md.push(
    `1. **TrendStrength≥${TREND_STRENGTH_MIN} cùng hướng:** \`calculateTrendStrength\`(NEAR 4H) → strength≥${TREND_STRENGTH_MIN} và direction khớp breakout (LONG→BULL / SHORT→BEAR)`,
  );
  md.push(
    '2. **BTC cùng hướng:** \`calculateTrendStrength\`(BTCUSDT 4H) → direction khớp breakout (đơn giản, không dùng full alignment matrix)',
  );
  md.push('3. **Cả 2** điều kiện trên');
  md.push('');
  md.push('## Results');
  md.push('');
  md.push(
    '| Filter | n active | n decided | WR% | E[R] sau phí | Sign | ΔE vs baseline | ΔWR vs baseline |',
  );
  md.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.label} | ${r.n_active} | ${r.n_decided} | ${fmt(r.wr)} | ${fmt(r.e_r_after, 3)} | ${r.sign} | ${fmt(r.delta_er_vs_baseline, 3)} | ${fmt(r.delta_wr_vs_baseline, 1)} pp |`,
    );
  }
  md.push('');
  md.push(
    `Prior report baseline reference: n=${PRIOR_BASELINE.n}, WR=${PRIOR_BASELINE.wr}%, E[R]=+${PRIOR_BASELINE.er_after}. Live recompute baseline used for Δ above.`,
  );
  md.push('');
  md.push('## Kết luận');
  md.push('');
  if (candidates.length === 0) {
    md.push(
      `**Không** có filter nào đạt n≥15 **và** E[R] sau phí cải thiện rõ (≥ +${IMPROVE_MIN} R) so với baseline live.`,
    );
    const thinImprove = results.filter(
      (r) =>
        r.filter_id !== 'baseline' &&
        Number.isFinite(r.e_r_after) &&
        r.e_r_after > liveBaselineEr + IMPROVE_MIN &&
        r.n_active < 15,
    );
    if (thinImprove.length) {
      md.push(
        `Có cải thiện E[R] nhưng **n quá mỏng** (&lt;15): ${thinImprove.map((r) => `${r.filter_id} (n=${r.n_active}, E=${fmt(r.e_r_after, 3)})`).join('; ')}.`,
      );
    }
    md.push(
      'Giả thuyết “breakout cùng chiều trend 4H mạnh / BTC cùng hướng có edge tốt hơn” **không được ủng hộ trên NEAR-365d** ở mức mẫu đủ để mở rộng đa symbol.',
    );
  } else {
    md.push('Ứng viên đáng mở rộng đa symbol (n≥15 + E[R] cải thiện rõ):');
    for (const c of candidates) {
      md.push(
        `- **${c.label}**: n=${c.n_active}, WR=${fmt(c.wr)}%, E[R]=${fmt(c.e_r_after, 3)} (ΔE=${fmt(c.delta_er_vs_baseline, 3)})`,
      );
    }
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/backtest-v41-breakout-trend-btc-near.ts`');
  md.push('- `docs/exports/v41-breakout-trend-btc-filter-near.csv`');
  md.push('- `docs/exports/v41-breakout-trend-btc-filter-near-trades.csv`');
  md.push('- `docs/exports/v41-breakout-trend-btc-filter-near-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[ts-btc] wrote ${OUT_CSV}`);
  console.log(`[ts-btc] wrote ${OUT_TRADES}`);
  console.log(`[ts-btc] wrote ${OUT_JSON}`);
  console.log(`[ts-btc] wrote ${OUT_MD}`);
  console.log(`[ts-btc] candidates=${candidates.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

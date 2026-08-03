/**
 * Task 5 — Verify NEAR Confirm B stats via PRODUCTION RC3 pipeline
 * (buildRc3ViewModelFromRow → resolveSymbolStrategy → scanBreakoutSetups →
 *  pickCurrentBreakoutSetup → adaptBreakoutToRc3Card).
 *
 * Does NOT reuse research-only entry loop; entries are taken when production
 * card first surfaces a setup at its activeOpenTime bar.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-near-production-pipeline.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { BreakoutTradeLevels } from '../services/v41/breakoutDetector';
import { createNeutralSnapshot } from '../services/v41/marketIntelligenceLayer';
import type { KlineV41 } from '../services/v41/indicators';
import {
  buildRc3ViewModelFromRow,
  pickCurrentBreakoutSetup,
} from '../services/v41/rc3/buildRc3ViewModel';
import { scanBreakoutSetups } from '../services/v41/breakoutDetector';
import type { SignalRowV41 } from '../services/v41/scanV41';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const SYMBOL = 'NEARUSDT';
const DAYS = 365;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MAX_HOLD_1H = 80;
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;
const COST_ROUND_TRIP_PCT = 0.18;

/** Research reference (Task time-stability / walk-forward). */
const REF = {
  full: { n: 31, wr: 53.33, e_r: 0.254 },
  h2: { wr: 71.43, e_r: 0.715 },
};

const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-near-production-pipeline-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_NEAR_TASK5_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type Trade = {
  active_open_time: number;
  half: 'H1' | 'H2';
  side: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp1RR: number;
  sl_dist_pct: number;
  outcome: Outcome;
  net_r: number | null;
  card_decision: string;
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
  const step = MS_1H;
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

function hitOnBar(
  side: 'LONG' | 'SHORT',
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

function rowAt(klines1H: KlineV41[], fetchedAt: number): SignalRowV41 {
  return {
    symbol: SYMBOL,
    snapshot: {
      ...createNeutralSnapshot(),
      trendDirection: 'NEUTRAL',
    },
    visibilityMode: 'WATCH_MODE',
    markPrice: klines1H.at(-1)?.close,
    klines1H,
    klines4H: [],
    btcKlines4H: [],
    fundingRate: 0,
    fetchedAt,
  };
}

function statsOf(trades: Trade[]): { n: number; n_dec: number; wr: number; e_r: number } {
  const decided = trades.filter((t) => t.net_r != null);
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  const e =
    decided.length > 0
      ? decided.reduce((a, t) => a + (t.net_r as number), 0) / decided.length
      : NaN;
  return {
    n: trades.length,
    n_dec: decided.length,
    wr: decided.length ? (wins / decided.length) * 100 : NaN,
    e_r: e,
  };
}

function near(a: number, b: number, absTol: number, relTol = 0.02): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a - b) <= absTol) return true;
  return Math.abs(a - b) <= Math.abs(b) * relTol;
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const midMs = evalStart + (DAYS / 2) * 24 * MS_1H;
  const fetchStart1h = evalStart - WARMUP_1H * MS_1H;

  console.log(`[prod-pipe] fetching NEAR 1H ${DAYS}d…`);
  const near1h = await fetchKlines(SYMBOL, '1h', fetchStart1h, endMs);
  console.log(`[prod-pipe] near1h=${near1h.length}`);

  const idxByOpen = new Map(near1h.map((k, i) => [k.openTime, i]));
  const startIdx = near1h.findIndex((k) => k.openTime >= evalStart);
  if (startIdx < 0) throw new Error('no bars in eval window');

  const trades: Trade[] = [];
  const entered = new Set<number>();

  for (let i = Math.max(startIdx, LOOKBACK_N); i < near1h.length; i++) {
    const slice = near1h.slice(0, i + 1);
    const bar = near1h[i]!;
    if (bar.openTime < evalStart) continue;

    // Production scan (same helpers as buildBreakoutRc3Card; no eval window filter).
    const setups = scanBreakoutSetups({
      klines1H: slice,
      lookbackN: LOOKBACK_N,
      consolidationMode: 'width',
      maxWidthPct: MAX_WIDTH_PCT,
      confirmMode: 'retest',
      slMode: 'atr_break_level',
      atrMult: ATR_MULT,
      requireStrongBreakout: false,
    });
    const current = pickCurrentBreakoutSetup(setups, slice);
    if (current == null) continue;
    // Enter only on the confirm bar (first time production surfaces this setup).
    if (current.activeOpenTime !== bar.openTime) continue;
    if (entered.has(current.activeOpenTime)) continue;

    const card = buildRc3ViewModelFromRow(rowAt(slice, bar.openTime));
    if (card.decision !== 'LONG' && card.decision !== 'SHORT') {
      console.warn(
        `[prod-pipe] skip activeOpenTime=${current.activeOpenTime}: card.decision=${card.decision}`,
      );
      continue;
    }
    if (card.levels == null) {
      console.warn(`[prod-pipe] skip: card.levels null at ${current.activeOpenTime}`);
      continue;
    }
    // Levels must match detector setup (adapter mirror).
    if (
      Math.abs(card.levels.entry - current.entry) > 1e-9 ||
      Math.abs(card.levels.stop - current.sl) > 1e-9 ||
      Math.abs(card.levels.tp1 - current.tp1) > 1e-9
    ) {
      console.warn('[prod-pipe] levels mismatch card vs setup', {
        card: card.levels,
        setup: current,
      });
    }

    entered.add(current.activeOpenTime);

    let outcome: Outcome = 'TIMEOUT';
    const ri = idxByOpen.get(current.activeOpenTime)!;
    const endIdx = Math.min(near1h.length - 1, ri + MAX_HOLD_1H);
    for (let j = ri + 1; j <= endIdx; j++) {
      const hit = hitOnBar(current.side, near1h[j]!, current.sl, current.tp1);
      if (hit) {
        outcome = hit;
        break;
      }
    }
    const fee_r =
      current.slDistancePct > 0 ? COST_ROUND_TRIP_PCT / current.slDistancePct : NaN;
    const gR =
      outcome === 'TP'
        ? current.tp1RR
        : outcome === 'SL' || outcome === 'BOTH'
          ? -1
          : null;
    const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;

    trades.push({
      active_open_time: current.activeOpenTime,
      half: current.activeOpenTime < midMs ? 'H1' : 'H2',
      side: current.side,
      entry: current.entry,
      sl: current.sl,
      tp1: current.tp1,
      tp1RR: current.tp1RR,
      sl_dist_pct: current.slDistancePct,
      outcome,
      net_r,
      card_decision: card.decision,
    });
  }

  // Research-style one-shot setups in eval window (for delta diagnosis).
  const researchSetups = scanBreakoutSetups({
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

  const full = statsOf(trades);
  const h2 = statsOf(trades.filter((t) => t.half === 'H2'));

  const fullPass =
    full.n === REF.full.n &&
    near(full.wr, REF.full.wr, 0.05) &&
    near(full.e_r, REF.full.e_r, 0.005);
  const h2Pass =
    near(h2.wr, REF.h2.wr, 0.05) && near(h2.e_r, REF.h2.e_r, 0.01);

  const severe =
    full.n < REF.full.n * 0.7 ||
    full.n > REF.full.n * 1.3 ||
    (Number.isFinite(full.e_r) &&
      Number.isFinite(REF.full.e_r) &&
      Math.sign(full.e_r) !== Math.sign(REF.full.e_r) &&
      Math.abs(full.e_r) > 0.05) ||
    (Number.isFinite(h2.e_r) &&
      Number.isFinite(REF.h2.e_r) &&
      Math.sign(h2.e_r) !== Math.sign(REF.h2.e_r) &&
      Math.abs(h2.e_r) > 0.05);

  const summary = {
    date: DATE,
    symbol: SYMBOL,
    days: DAYS,
    cost_rt_pct: COST_ROUND_TRIP_PCT,
    pipeline: 'buildRc3ViewModelFromRow / pickCurrentBreakoutSetup',
    research_setups_in_window: researchSetups.length,
    production_entries: full.n,
    full,
    h2,
    ref: REF,
    fullPass,
    h2Pass,
    severe,
    verdict: severe ? 'STOP_SEVERE_DELTA' : fullPass && h2Pass ? 'PASS' : 'PASS_WITH_EXPLAINABLE_DELTA',
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log('[prod-pipe] summary', JSON.stringify(summary, null, 2));
  console.log(`[prod-pipe] wrote ${OUT_JSON}`);
  console.log(`[prod-pipe] note: full markdown report merged by Task 5 agent → ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

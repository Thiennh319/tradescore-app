/**
 * Final multi-symbol backtest + fee/slippage expectancy.
 * Report-only — does not change production.
 *
 * Scenarios: NEAR 180/365, SOL 180, ETH 180/365, BNB 180, DOGE 180
 * Fees: round-trip 0.08% taker + 0.05%×2 slippage ≈ 0.18% of entry
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-final-multi-symbol-fees.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { computeExhaustion } from '../services/v41/exhaustionEngine';
import type { KlineV41 } from '../services/v41/indicators';
import { computeMomentum1H } from '../services/v41/momentumEngine1H';
import {
  computeCounterTrendSL,
  detectCvdFlip,
  detectStructureBreak,
  detectTrendReversalVolumeConfirmation,
  TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
  TREND_REVERSAL_CONFIDENCE_MIN,
  TREND_REVERSAL_EXHAUSTION_MIN,
} from '../services/v41/reversalDetector';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const WARMUP_4H = 220;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const VOL_MULT = 1.2;
const TP1_RR = 1.5;
const MAX_HOLD_4H = 20;

/** 0.04%×2 taker + 0.05%×2 slippage = 0.18% round-trip of notional. */
const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1; // 0.05 × 2
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT; // 0.18

const SCENARIOS = [
  { id: 'NEAR-180d', symbol: 'NEARUSDT', days: 180 },
  { id: 'NEAR-365d', symbol: 'NEARUSDT', days: 365 },
  { id: 'SOL-180d', symbol: 'SOLUSDT', days: 180 },
  { id: 'ETH-180d', symbol: 'ETHUSDT', days: 180 },
  { id: 'ETH-365d', symbol: 'ETHUSDT', days: 365 },
  { id: 'BNB-180d', symbol: 'BNBUSDT', days: 180 },
  { id: 'DOGE-180d', symbol: 'DOGEUSDT', days: 180 },
] as const;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-final-multi-symbol-fees.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-final-multi-symbol-fees-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-final-multi-symbol-fees-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_FINAL_MULTI_SYMBOL_FEES_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';
type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT' | 'NO_SL';

function cvdProxy(k: KlineV41): number {
  return k.takerBuyVolume - (k.volume - k.takerBuyVolume);
}

function scoreCvd(confirmed: boolean, cvdLast3: [number, number, number]): number {
  if (!confirmed) return 0;
  const priorAvg = (cvdLast3[0] + cvdLast3[1]) / 2;
  const flipMag = Math.abs(cvdLast3[2] - priorAvg);
  return Math.min(100, 55 + flipMag / 10);
}

function scoreVolume(confirmed: boolean, volumeRatio: number): number {
  if (!confirmed) return 0;
  return Math.min(100, 50 + ((volumeRatio - VOL_MULT) / 0.8) * 50);
}

function scoreExh(confirmed: boolean, exh: number): number {
  if (!confirmed) return 0;
  return Math.min(
    100,
    50 +
      ((exh - TREND_REVERSAL_EXHAUSTION_MIN) /
        (100 - TREND_REVERSAL_EXHAUSTION_MIN)) *
        50,
  );
}

function scoreStructure(confirmed: boolean): number {
  return confirmed ? 70 : 0;
}

function confidenceTR(
  cvd: boolean,
  vol: boolean,
  exh: boolean,
  structure: boolean,
  cvdLast3: [number, number, number],
  volumeRatio: number,
  exhRaw: number,
): number {
  return (
    (scoreCvd(cvd, cvdLast3) +
      scoreVolume(vol, volumeRatio) +
      scoreExh(exh, exhRaw) +
      scoreStructure(structure)) /
    4
  );
}

function resolveEffectiveTpMultiplier(
  momentumTpMult: number,
  exhaustionType: string,
): number {
  const base = momentumTpMult;
  if (exhaustionType === 'CAPITULATION' || exhaustionType === 'FUNDING_EXTREME') {
    return base * 1.2;
  }
  return base * 0.8;
}

function hitOnBar(
  side: Side,
  bar: KlineV41,
  sl: number,
  tp1: number,
): 'TP' | 'SL' | 'BOTH' | null {
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

type Trade = {
  scenario: string;
  symbol: string;
  days: number;
  timestamp: number;
  timestamp_iso: string;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  confidence: number;
  outcome: Outcome;
  bars_held: number | null;
  sl_dist_pct: number | null;
  tp1_rr: number | null;
  /** Gross R: TP=+tp1_rr, SL/BOTH=-1; null if NO_SL/TIMEOUT */
  gross_r: number | null;
  /** Cost in R = COST_ROUND_TRIP_PCT / sl_dist_pct */
  fee_r: number | null;
  net_r: number | null;
  /** Net P&L % of entry after cost (decided exits only) */
  net_pnl_pct: number | null;
};

type ScenarioResult = {
  id: string;
  symbol: string;
  days: number;
  n_clocks: number;
  n_cvd: number;
  n_gate: number;
  n_active: number;
  wins: number;
  losses: number;
  both: number;
  timeout: number;
  no_sl: number;
  wr: number;
  long_n: number;
  long_wr: number;
  short_n: number;
  short_wr: number;
  mean_sl_dist_pct: number;
  expectancy_r_before: number;
  expectancy_r_after: number;
  wr_after_fees: number;
  expectancy_sign_after: 'positive' | 'negative' | 'flat' | 'n/a';
  mean_fee_r: number;
  trades: Trade[];
};

function grossR(outcome: Outcome, tp1Rr: number): number | null {
  if (outcome === 'TP') return tp1Rr;
  if (outcome === 'SL' || outcome === 'BOTH') return -1;
  return null; // TIMEOUT / NO_SL
}

function netPnlPct(
  side: Side,
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

async function runScenario(
  id: string,
  symbol: string,
  days: number,
  endMs: number,
): Promise<ScenarioResult> {
  const evalStart = endMs - days * 24 * MS_1H;
  const fetchStart4h = evalStart - WARMUP_4H * MS_4H;
  const fetchStart1h = evalStart - WARMUP_1H * MS_1H;

  console.log(`[fees] ${id} fetching ${symbol} ${days}d…`);
  const [klines4h, klines1h] = await Promise.all([
    fetchKlines(symbol, '4h', fetchStart4h, endMs),
    fetchKlines(symbol, '1h', fetchStart1h, endMs),
  ]);
  const clocks = klines4h.filter((k) => k.closeTime < endMs && k.openTime >= evalStart);
  const idxByTs = new Map(klines4h.map((k, i) => [k.openTime, i]));
  console.log(
    `[fees] ${id} 4h=${klines4h.length} 1h=${klines1h.length} clocks=${clocks.length}`,
  );

  type Bar = {
    idx4h: number;
    timestamp: number;
    timestamp_iso: string;
    trendDirection: TrendDirection;
    close: number;
    exh_4h: number;
    confidence: number;
    gate: boolean;
    side: Side | null;
  };

  const bars: Bar[] = [];
  let nCvd = 0;
  let nGate = 0;

  for (const k of clocks) {
    const ts = k.openTime;
    const idx4h = idxByTs.get(ts)!;
    const win4h = sliceUpTo(klines4h, ts);
    const win1h = sliceUpTo(klines1h, ts);
    const strength = calculateTrendStrength(win4h);
    const trendDirection = strength.trendDirection;
    const exh_4h =
      trendDirection === 'NEUTRAL'
        ? 0
        : calculateTrendExhaustion(win4h, trendDirection).trendExhaustion;

    let vol = false;
    let exh = false;
    let structure = false;
    let exh_1h = 0;
    let volumeRatio = 0;
    let cvdLast3: [number, number, number] = [0, 0, 0];
    let cvd = false;

    if (trendDirection !== 'NEUTRAL' && win1h.length >= 21) {
      cvdLast3 = win1h.slice(-3).map(cvdProxy) as [number, number, number];
      cvd = detectCvdFlip(win1h, trendDirection);
      const v = detectTrendReversalVolumeConfirmation(win1h);
      vol = v.confirmed;
      volumeRatio = v.volumeRatio;
      exh_1h = calculateTrendExhaustion(win1h, trendDirection).trendExhaustion;
      exh = exh_1h >= TREND_REVERSAL_EXHAUSTION_MIN;
      structure = detectStructureBreak(win1h, trendDirection).confirmed;
    }

    if (cvd) nCvd++;
    const conf = confidenceTR(cvd, vol, exh, structure, cvdLast3, volumeRatio, exh_1h);
    const count =
      (cvd ? 1 : 0) + (vol ? 1 : 0) + (exh ? 1 : 0) + (structure ? 1 : 0);
    const gate = count >= TREND_REVERSAL_ACTIVE_MIN_SIGNALS;
    if (gate) nGate++;

    const side: Side | null =
      trendDirection === 'BEAR' ? 'LONG' : trendDirection === 'BULL' ? 'SHORT' : null;

    bars.push({
      idx4h,
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      close: k.close,
      exh_4h,
      confidence: conf,
      gate,
      side,
    });
  }

  const confMin = TREND_REVERSAL_CONFIDENCE_MIN;
  const trades: Trade[] = [];

  for (const e of bars) {
    if (!e.gate || e.confidence < confMin || e.side == null) continue;
    const win1h = sliceUpTo(klines1h, e.timestamp);
    const entry = e.close;
    const side = e.side;
    const sl = computeCounterTrendSL({
      klines1H: klines1h,
      direction: side,
      entryPrice: entry,
      fourHOpenTime: e.timestamp,
    });

    if (!Number.isFinite(sl) || sl <= 0) {
      trades.push({
        scenario: id,
        symbol,
        days,
        timestamp: e.timestamp,
        timestamp_iso: e.timestamp_iso,
        side,
        entry,
        sl: NaN,
        tp1: NaN,
        confidence: e.confidence,
        outcome: 'NO_SL',
        bars_held: null,
        sl_dist_pct: null,
        tp1_rr: null,
        gross_r: null,
        fee_r: null,
        net_r: null,
        net_pnl_pct: null,
      });
      continue;
    }

    const momentum = computeMomentum1H(win1h);
    const exhSnap = computeExhaustion({
      klines1H: win1h,
      trendExhaustion: e.exh_4h,
      trendDirection: e.trendDirection,
    });
    const tpMult = resolveEffectiveTpMultiplier(
      momentum.tpMultiplier,
      exhSnap.exhaustionType,
    );
    const slDistance = Math.abs(entry - sl);
    const sl_dist_pct = (slDistance / entry) * 100;
    const tp1_rr = TP1_RR * tpMult;
    const tp1 =
      side === 'LONG' ? entry + slDistance * tp1_rr : entry - slDistance * tp1_rr;

    let outcome: Outcome = 'TIMEOUT';
    let bars_held: number | null = null;
    const startIdx = e.idx4h + 1;
    const endIdx = Math.min(klines4h.length - 1, e.idx4h + MAX_HOLD_4H);
    for (let i = startIdx; i <= endIdx; i++) {
      const hit = hitOnBar(side, klines4h[i]!, sl, tp1);
      if (hit) {
        outcome = hit;
        bars_held = i - e.idx4h;
        break;
      }
    }

    const fee_r = sl_dist_pct > 0 ? COST_ROUND_TRIP_PCT / sl_dist_pct : NaN;
    const gR = grossR(outcome, tp1_rr);
    const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;

    let net_pnl_pct: number | null = null;
    if (outcome === 'TP') {
      net_pnl_pct = netPnlPct(side, entry, tp1, COST_ROUND_TRIP_PCT);
    } else if (outcome === 'SL' || outcome === 'BOTH') {
      net_pnl_pct = netPnlPct(side, entry, sl, COST_ROUND_TRIP_PCT);
    }

    trades.push({
      scenario: id,
      symbol,
      days,
      timestamp: e.timestamp,
      timestamp_iso: e.timestamp_iso,
      side,
      entry,
      sl,
      tp1,
      confidence: e.confidence,
      outcome,
      bars_held,
      sl_dist_pct,
      tp1_rr,
      gross_r: gR,
      fee_r: Number.isFinite(fee_r) ? fee_r : null,
      net_r,
      net_pnl_pct,
    });
  }

  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const no_sl = trades.filter((t) => t.outcome === 'NO_SL').length;
  const decided = wins + losses + both;
  const wr = decided > 0 ? (wins / decided) * 100 : NaN;

  const bySide = (side: Side) => {
    const g = trades.filter((t) => t.side === side && t.outcome !== 'NO_SL');
    const w = g.filter((t) => t.outcome === 'TP').length;
    const l = g.filter((t) => t.outcome === 'SL').length;
    const b = g.filter((t) => t.outcome === 'BOTH').length;
    const d = w + l + b;
    return { n: g.length, wr: d > 0 ? (w / d) * 100 : NaN };
  };
  const L = bySide('LONG');
  const S = bySide('SHORT');

  const decidedTrades = trades.filter(
    (t) => t.gross_r != null && t.net_r != null && t.outcome !== 'TIMEOUT',
  );
  const expectancy_r_before = mean(decidedTrades.map((t) => t.gross_r!));
  const expectancy_r_after = mean(decidedTrades.map((t) => t.net_r!));
  const mean_fee_r = mean(
    decidedTrades.map((t) => t.fee_r!).filter((x) => Number.isFinite(x)),
  );
  const mean_sl = mean(
    trades
      .map((t) => t.sl_dist_pct)
      .filter((x): x is number => x != null && Number.isFinite(x)),
  );

  const winsAfter = decidedTrades.filter(
    (t) => t.net_pnl_pct != null && t.net_pnl_pct > 0,
  ).length;
  const wr_after_fees =
    decidedTrades.length > 0 ? (winsAfter / decidedTrades.length) * 100 : NaN;

  let expectancy_sign_after: ScenarioResult['expectancy_sign_after'] = 'n/a';
  if (Number.isFinite(expectancy_r_after)) {
    if (expectancy_r_after > 1e-9) expectancy_sign_after = 'positive';
    else if (expectancy_r_after < -1e-9) expectancy_sign_after = 'negative';
    else expectancy_sign_after = 'flat';
  }

  return {
    id,
    symbol,
    days,
    n_clocks: clocks.length,
    n_cvd: nCvd,
    n_gate: nGate,
    n_active: trades.length,
    wins,
    losses,
    both,
    timeout,
    no_sl,
    wr,
    long_n: L.n,
    long_wr: L.wr,
    short_n: S.n,
    short_wr: S.wr,
    mean_sl_dist_pct: mean_sl,
    expectancy_r_before,
    expectancy_r_after,
    wr_after_fees,
    expectancy_sign_after,
    mean_fee_r,
    trades,
  };
}

function fmt(x: number, d = 1): string {
  return Number.isFinite(x) ? x.toFixed(d) : 'n/a';
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const results: ScenarioResult[] = [];

  for (const s of SCENARIOS) {
    try {
      const r = await runScenario(s.id, s.symbol, s.days, endMs);
      results.push(r);
      console.log(
        `[fees] ${r.id} n=${r.n_active} WR=${fmt(r.wr)}% E[R]=${fmt(r.expectancy_r_before, 3)}→${fmt(r.expectancy_r_after, 3)} (${r.expectancy_sign_after})`,
      );
    } catch (e) {
      console.error(`[fees] ${s.id} FAILED`, e);
    }
  }

  const summary = {
    date: DATE,
    config: {
      exhaustion_min: TREND_REVERSAL_EXHAUSTION_MIN,
      active_min_signals: TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
      confidence_min: TREND_REVERSAL_CONFIDENCE_MIN,
      cvd: 'production detectCvdFlip',
      sl: 'computeCounterTrendSL + fourHOpenTime',
      hold_4h: MAX_HOLD_4H,
      both_counts_as: 'loss',
      cost_model: {
        fee_round_trip_pct: FEE_ROUND_TRIP_PCT,
        slip_round_trip_pct: SLIP_ROUND_TRIP_PCT,
        total_round_trip_pct: COST_ROUND_TRIP_PCT,
        note: 'fee_R = cost_pct / sl_dist_pct; net_R = gross_R - fee_R; expectancy on TP/SL/BOTH only',
      },
    },
    scenarios: results.map(({ trades: _t, ...rest }) => rest),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const csv = [
    'scenario,symbol,days,n_clocks,n_active,wins,losses,both,timeout,no_sl,wr_pct,wr_after_fees_pct,long_n,long_wr,short_n,short_wr,mean_sl_dist_pct,expectancy_r_before,expectancy_r_after,mean_fee_r,expectancy_sign_after',
    ...results.map((r) =>
      [
        r.id,
        r.symbol,
        r.days,
        r.n_clocks,
        r.n_active,
        r.wins,
        r.losses,
        r.both,
        r.timeout,
        r.no_sl,
        fmt(r.wr, 2),
        fmt(r.wr_after_fees, 2),
        r.long_n,
        fmt(r.long_wr, 2),
        r.short_n,
        fmt(r.short_wr, 2),
        fmt(r.mean_sl_dist_pct, 4),
        fmt(r.expectancy_r_before, 4),
        fmt(r.expectancy_r_after, 4),
        fmt(r.mean_fee_r, 4),
        r.expectancy_sign_after,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_CSV, csv + '\n', 'utf8');

  const tradesCsv = [
    'scenario,symbol,days,timestamp,timestamp_iso,side,entry,sl,tp1,confidence,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r,net_pnl_pct',
    ...results.flatMap((r) =>
      r.trades.map((t) =>
        [
          t.scenario,
          t.symbol,
          t.days,
          t.timestamp,
          t.timestamp_iso,
          t.side,
          t.entry,
          Number.isFinite(t.sl) ? t.sl : '',
          Number.isFinite(t.tp1) ? t.tp1 : '',
          t.confidence.toFixed(4),
          t.outcome,
          t.bars_held ?? '',
          t.sl_dist_pct != null ? t.sl_dist_pct.toFixed(4) : '',
          t.tp1_rr != null ? t.tp1_rr.toFixed(4) : '',
          t.gross_r != null ? t.gross_r.toFixed(4) : '',
          t.fee_r != null ? t.fee_r.toFixed(4) : '',
          t.net_r != null ? t.net_r.toFixed(4) : '',
          t.net_pnl_pct != null ? t.net_pnl_pct.toFixed(4) : '',
        ].join(','),
      ),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_TRADES, tradesCsv + '\n', 'utf8');

  const eth180 = results.find((r) => r.id === 'ETH-180d');
  const eth365 = results.find((r) => r.id === 'ETH-365d');
  const near180 = results.find((r) => r.id === 'NEAR-180d');
  const near365 = results.find((r) => r.id === 'NEAR-365d');

  const md: string[] = [];
  md.push('# REPORT — Final multi-symbol backtest + fees');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Scope:** Report-only — production constants; **không** đổi Exhaustion/CVD/SL/confidence',
  );
  md.push('');
  md.push('## Cấu hình');
  md.push('');
  md.push(`| Param | Value |`);
  md.push(`|---|---|`);
  md.push(`| EXHAUSTION_MIN | ${TREND_REVERSAL_EXHAUSTION_MIN} |`);
  md.push(`| ACTIVE_MIN_SIGNALS | ${TREND_REVERSAL_ACTIVE_MIN_SIGNALS} |`);
  md.push(`| CONFIDENCE_MIN | ${TREND_REVERSAL_CONFIDENCE_MIN} |`);
  md.push(`| CVD | production detectCvdFlip |`);
  md.push(`| SL | fourHOpenTime through 4H close |`);
  md.push(`| Hold / BOTH | ${MAX_HOLD_4H}×4H / loss |`);
  md.push(
    `| Cost model | fee ${FEE_ROUND_TRIP_PCT}% + slip ${SLIP_ROUND_TRIP_PCT}% = **${COST_ROUND_TRIP_PCT}%** RT |`,
  );
  md.push(
    `| Expectancy | mean(R) trên TP/SL/BOTH; gross_R: TP=+tp1_rr, SL/BOTH=−1; fee_R=cost%/sl_dist% |`,
  );
  md.push('');

  md.push('## Phần A — ETH 365d vs 180d');
  md.push('');
  if (eth180 && eth365) {
    md.push('| | ETH-180d | ETH-365d | Δ |');
    md.push('|---|---|---|---|');
    md.push(
      `| n active | ${eth180.n_active} | ${eth365.n_active} | ${eth365.n_active - eth180.n_active} |`,
    );
    md.push(
      `| WR | ${fmt(eth180.wr)}% | ${fmt(eth365.wr)}% | ${fmt(eth365.wr - eth180.wr)} pp |`,
    );
    md.push(
      `| E[R] trước phí | ${fmt(eth180.expectancy_r_before, 3)} | ${fmt(eth365.expectancy_r_before, 3)} | |`,
    );
    md.push(
      `| E[R] sau phí | ${fmt(eth180.expectancy_r_after, 3)} (${eth180.expectancy_sign_after}) | ${fmt(eth365.expectancy_r_after, 3)} (${eth365.expectancy_sign_after}) | |`,
    );
    const nearDrop =
      near180 && near365 ? near365.wr - near180.wr : NaN;
    const ethDrop = eth365.wr - eth180.wr;
    md.push('');
    md.push(
      `So với pattern NEAR (180→365: ${fmt(nearDrop)} pp): ETH 180→365 = **${fmt(ethDrop)} pp** — ${ethDrop < -3 ? 'có lặp lại kiểu WR giảm khi mẫu dài hơn' : ethDrop > 3 ? 'không giảm (WR tăng hoặc ổn)' : 'thay đổi nhỏ'}`.trim(),
    );
  } else {
    md.push('_Thiếu dữ liệu ETH — xem log lỗi fetch._');
  }
  md.push('');

  md.push('## Phần B — BNB / DOGE 180d');
  md.push('');
  for (const id of ['BNB-180d', 'DOGE-180d'] as const) {
    const r = results.find((x) => x.id === id);
    if (!r) {
      md.push(`- **${id}:** FAILED / thiếu dữ liệu`);
      continue;
    }
    md.push(
      `- **${r.id}:** n=${r.n_active}, WR=${fmt(r.wr)}%, LONG ${r.long_n}/${fmt(r.long_wr)}%, SHORT ${r.short_n}/${fmt(r.short_wr)}%, E[R] ${fmt(r.expectancy_r_before, 3)} → ${fmt(r.expectancy_r_after, 3)} (${r.expectancy_sign_after})`,
    );
  }
  md.push('');

  md.push('## Phần C — Expectancy trước / sau phí');
  md.push('');
  md.push(
    '| Scenario | WR trước phí | WR sau phí* | E[R] trước | E[R] sau | mean fee_R | Sau phí |',
  );
  md.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.id} | ${fmt(r.wr)}% | ${fmt(r.wr_after_fees)}% | ${fmt(r.expectancy_r_before, 3)} | ${fmt(r.expectancy_r_after, 3)} | ${fmt(r.mean_fee_r, 3)} | **${r.expectancy_sign_after}** |`,
    );
  }
  md.push('');
  md.push(
    '\\* WR sau phí = tỷ lệ lệnh decided có `net_pnl_pct > 0` (sau trừ 0.18% RT).',
  );
  md.push('');

  md.push('## Phần D — Tổng hợp toàn cảnh');
  md.push('');
  md.push(
    '| Scenario | n | WR | LONG n/WR | SHORT n/WR | E[R] trước | E[R] sau | Sign |',
  );
  md.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.id} | ${r.n_active} | ${fmt(r.wr)}% | ${r.long_n}/${fmt(r.long_wr)}% | ${r.short_n}/${fmt(r.short_wr)}% | ${fmt(r.expectancy_r_before, 3)} | ${fmt(r.expectancy_r_after, 3)} | ${r.expectancy_sign_after} |`,
    );
  }
  md.push('');
  const pos = results.filter((r) => r.expectancy_sign_after === 'positive').length;
  const neg = results.filter((r) => r.expectancy_sign_after === 'negative').length;
  md.push('### Nhận xét số liệu (không khuyến nghị)');
  md.push('');
  md.push(
    `- Sau phí 0.18% RT: **${pos}** scenario E[R]>0, **${neg}** E[R]<0 (trên ${results.length} scenario chạy được).`,
  );
  md.push(
    `- mean fee_R ≈ cost%/mean_sl_dist — SL càng hẹp thì phí (tính theo R) càng nặng.`,
  );
  md.push(
    `- n vẫn nhỏ trên nhiều coin 180d → nhiễu thống kê cao; không suy diễn chắc chắn.`,
  );
  md.push('- Không đưa khuyến nghị production trong báo cáo này.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-final-multi-symbol-fees.csv`');
  md.push('- `docs/exports/v41-final-multi-symbol-fees-trades.csv`');
  md.push('- `docs/exports/v41-final-multi-symbol-fees-summary.json`');
  md.push('- `scripts/backtest-v41-final-multi-symbol-fees.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify(summary.scenarios, null, 2));
  console.log(`[fees] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

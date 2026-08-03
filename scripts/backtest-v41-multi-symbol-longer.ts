/**
 * Multi-symbol + longer-window robustness backtest (production TR config).
 * Report-only — does not change production.
 *
 * Scenarios:
 *   NEARUSDT 180d / 365d
 *   SOLUSDT  180d
 *   ETHUSDT  180d
 *
 * Config (imported SSOT):
 *   EXHAUSTION_MIN, ACTIVE_MIN_SIGNALS=3, CONFIDENCE_MIN,
 *   detectCvdFlip production, SL with fourHOpenTime (through 4H close)
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-multi-symbol-longer.ts
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

const SCENARIOS = [
  { id: 'NEAR-180d', symbol: 'NEARUSDT', days: 180 },
  { id: 'NEAR-365d', symbol: 'NEARUSDT', days: 365 },
  { id: 'SOL-180d', symbol: 'SOLUSDT', days: 180 },
  { id: 'ETH-180d', symbol: 'ETHUSDT', days: 180 },
] as const;

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-multi-symbol-longer-backtest.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-multi-symbol-longer-backtest-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-multi-symbol-longer-backtest-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_MULTI_SYMBOL_LONGER_BACKTEST_${DATE}.md`,
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
  wrong_side: number;
  wr: number;
  long_n: number;
  long_wr: number;
  short_n: number;
  short_wr: number;
  mean_sl_dist_pct: number;
  trades: Trade[];
};

async function runScenario(
  id: string,
  symbol: string,
  days: number,
  endMs: number,
): Promise<ScenarioResult> {
  const evalStart = endMs - days * 24 * MS_1H;
  const fetchStart4h = evalStart - WARMUP_4H * MS_4H;
  const fetchStart1h = evalStart - WARMUP_1H * MS_1H;

  console.log(`[multi] ${id} fetching ${symbol} ${days}d…`);
  const [klines4h, klines1h] = await Promise.all([
    fetchKlines(symbol, '4h', fetchStart4h, endMs),
    fetchKlines(symbol, '1h', fetchStart1h, endMs),
  ]);
  const clocks = klines4h.filter((k) => k.closeTime < endMs && k.openTime >= evalStart);
  const idxByTs = new Map(klines4h.map((k, i) => [k.openTime, i]));
  console.log(
    `[multi] ${id} 4h=${klines4h.length} 1h=${klines1h.length} clocks=${clocks.length}`,
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
  const slDists: number[] = [];

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
    slDists.push((slDistance / entry) * 100);
    const tp1RR = TP1_RR * tpMult;
    const tp1 =
      side === 'LONG' ? entry + slDistance * tp1RR : entry - slDistance * tp1RR;

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
    });
  }

  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const no_sl = trades.filter((t) => t.outcome === 'NO_SL').length;
  const wrong_side = trades.filter(
    (t) =>
      Number.isFinite(t.sl) &&
      (t.side === 'LONG' ? !(t.sl < t.entry) : !(t.sl > t.entry)),
  ).length;
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
  const meanSl =
    slDists.length > 0 ? slDists.reduce((a, b) => a + b, 0) / slDists.length : NaN;

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
    wrong_side,
    wr,
    long_n: L.n,
    long_wr: L.wr,
    short_n: S.n,
    short_wr: S.wr,
    mean_sl_dist_pct: meanSl,
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
    const r = await runScenario(s.id, s.symbol, s.days, endMs);
    results.push(r);
    console.log(
      `[multi] ${r.id} n=${r.n_active} WR=${fmt(r.wr)}% L=${r.long_n}/${fmt(r.long_wr)}% S=${r.short_n}/${fmt(r.short_wr)}% NO_SL=${r.no_sl}`,
    );
  }

  const summary = {
    date: DATE,
    config: {
      exhaustion_min: TREND_REVERSAL_EXHAUSTION_MIN,
      active_min_signals: TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
      confidence_min: TREND_REVERSAL_CONFIDENCE_MIN,
      cvd: 'production detectCvdFlip',
      sl: 'computeCounterTrendSL + fourHOpenTime (through 4H close)',
      hold_4h: MAX_HOLD_4H,
      both_counts_as: 'loss',
    },
    reference_near_180d_prior_report: {
      conf50: { n: 19, wr: 42.1 },
      note: 'From SL-window-fix rebacktest; this run re-measures all scenarios fresh',
    },
    scenarios: results.map(({ trades: _t, ...rest }) => rest),
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const csv = [
    'scenario,symbol,days,n_clocks,n_cvd,n_gate,n_active,wins,losses,both,timeout,no_sl,wrong_side,wr_pct,long_n,long_wr,short_n,short_wr,mean_sl_dist_pct',
    ...results.map((r) =>
      [
        r.id,
        r.symbol,
        r.days,
        r.n_clocks,
        r.n_cvd,
        r.n_gate,
        r.n_active,
        r.wins,
        r.losses,
        r.both,
        r.timeout,
        r.no_sl,
        r.wrong_side,
        fmt(r.wr, 2),
        r.long_n,
        fmt(r.long_wr, 2),
        r.short_n,
        fmt(r.short_wr, 2),
        fmt(r.mean_sl_dist_pct, 4),
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_CSV, csv + '\n', 'utf8');

  const tradesCsv = [
    'scenario,symbol,days,timestamp,timestamp_iso,side,entry,sl,tp1,confidence,outcome,bars_held',
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
        ].join(','),
      ),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_TRADES, tradesCsv + '\n', 'utf8');

  const near180 = results.find((r) => r.id === 'NEAR-180d')!;
  const near365 = results.find((r) => r.id === 'NEAR-365d')!;
  const sol180 = results.find((r) => r.id === 'SOL-180d')!;
  const eth180 = results.find((r) => r.id === 'ETH-180d')!;

  const wrs = results.map((r) => r.wr).filter((x) => Number.isFinite(x));
  const wrMin = wrs.length ? Math.min(...wrs) : NaN;
  const wrMax = wrs.length ? Math.max(...wrs) : NaN;
  const wrSpread = Number.isFinite(wrMin) && Number.isFinite(wrMax) ? wrMax - wrMin : NaN;

  const md: string[] = [];
  md.push('# REPORT — V41 multi-symbol / longer-window backtest');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Scope:** Report-only — production constants as-is; **không** đổi Exhaustion/CVD/SL/confidence',
  );
  md.push('');
  md.push('## Cấu hình (SSOT từ code)');
  md.push('');
  md.push(`| Param | Value |`);
  md.push(`|---|---|`);
  md.push(`| TREND_REVERSAL_EXHAUSTION_MIN | ${TREND_REVERSAL_EXHAUSTION_MIN} |`);
  md.push(`| TREND_REVERSAL_ACTIVE_MIN_SIGNALS | ${TREND_REVERSAL_ACTIVE_MIN_SIGNALS} |`);
  md.push(`| TREND_REVERSAL_CONFIDENCE_MIN | ${TREND_REVERSAL_CONFIDENCE_MIN} |`);
  md.push(`| CVD | production \`detectCvdFlip\` |`);
  md.push(`| SL | \`computeCounterTrendSL\` + \`fourHOpenTime\` (1H through 4H close) |`);
  md.push(`| Hold | ${MAX_HOLD_4H}×4H · BOTH = loss |`);
  md.push('');
  md.push('## Bảng so sánh chính (conf ≥ TREND_REVERSAL_CONFIDENCE_MIN)');
  md.push('');
  md.push('| Scenario | n clocks | n active | WR | LONG n/WR | SHORT n/WR | NO_SL | wrong_side |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.id} | ${r.n_clocks} | ${r.n_active} | ${fmt(r.wr)}% | ${r.long_n}/${fmt(r.long_wr)}% | ${r.short_n}/${fmt(r.short_wr)}% | ${r.no_sl} | ${r.wrong_side} |`,
    );
  }
  md.push('');
  md.push('### Chi tiết outcome');
  md.push('');
  md.push('| Scenario | W | L | BOTH | TIMEOUT | NO_SL | mean sl_dist% |');
  md.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    md.push(
      `| ${r.id} | ${r.wins} | ${r.losses} | ${r.both} | ${r.timeout} | ${r.no_sl} | ${fmt(r.mean_sl_dist_pct, 3)}% |`,
    );
  }
  md.push('');
  md.push('## Phần A — NEAR dài hơn (180d vs 365d)');
  md.push('');
  md.push(
    `| | NEAR-180d | NEAR-365d | Δ |`,
  );
  md.push(`|---|---|---|---|`);
  md.push(
    `| n active | ${near180.n_active} | ${near365.n_active} | ${near365.n_active - near180.n_active} |`,
  );
  md.push(
    `| WR | ${fmt(near180.wr)}% | ${fmt(near365.wr)}% | ${fmt(near365.wr - near180.wr)} pp |`,
  );
  md.push(
    `| LONG WR | ${fmt(near180.long_wr)}% (n=${near180.long_n}) | ${fmt(near365.long_wr)}% (n=${near365.long_n}) | |`,
  );
  md.push(
    `| SHORT WR | ${fmt(near180.short_wr)}% (n=${near180.short_n}) | ${fmt(near365.short_wr)}% (n=${near365.short_n}) | |`,
  );
  md.push('');
  md.push('## Phần B — SOL / ETH (180d, cùng pipeline)');
  md.push('');
  md.push(
    `- **SOL-180d:** n=${sol180.n_active}, WR=${fmt(sol180.wr)}%, LONG ${sol180.long_n}/${fmt(sol180.long_wr)}%, SHORT ${sol180.short_n}/${fmt(sol180.short_wr)}%`,
  );
  md.push(
    `- **ETH-180d:** n=${eth180.n_active}, WR=${fmt(eth180.wr)}%, LONG ${eth180.long_n}/${fmt(eth180.long_wr)}%, SHORT ${eth180.short_n}/${fmt(eth180.short_wr)}%`,
  );
  md.push('');
  md.push('## Phần C — Nhận xét số liệu (không khuyến nghị production)');
  md.push('');
  md.push(
    `- Spread WR across 4 scenarios: **${fmt(wrMin)}% … ${fmt(wrMax)}%** (range ${fmt(wrSpread)} pp).`,
  );
  if (Number.isFinite(wrSpread)) {
    if (wrSpread <= 10) {
      md.push(
        `- Range ≤10 pp → WR tương đối **ổn định** giữa symbol/cửa sổ đã thử (không chứng minh edge, chỉ mô tả ổn định mẫu).`,
      );
    } else if (wrSpread <= 20) {
      md.push(
        `- Range 10–20 pp → WR **dao động vừa**; NEAR 180d không đơn độc nhưng chưa đồng nhất chặt.`,
      );
    } else {
      md.push(
        `- Range >20 pp → WR **dao động mạnh** giữa symbol/cửa sổ — dấu hiệu kết quả NEAR-180d **có thể** không đại diện tốt cho các mẫu khác.`,
      );
    }
  }
  md.push(
    `- So NEAR-180d (${fmt(near180.wr)}%) vs NEAR-365d (${fmt(near365.wr)}%): ${Math.abs(near365.wr - near180.wr) <= 5 ? 'chênh lệch nhỏ (≤5 pp) trên cùng symbol khi kéo dài cửa sổ.' : 'chênh lệch đáng kể khi kéo dài cửa sổ trên cùng symbol.'}`,
  );
  md.push(
    `- So NEAR-180d vs SOL/ETH 180d: xem bảng — nếu SOL/ETH WR lệch xa ~40–42% thì mẫu NEAR không đủ để suy ra hành vi chung.`,
  );
  md.push(
    `- Lưu ý n nhỏ (đặc biệt nếu n<30): WR nhiễu thống kê cao; không suy diễn chắc chắn từ một cửa sổ.`,
  );
  md.push('- Không đưa khuyến nghị “nên/không nên production” trong báo cáo này.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-multi-symbol-longer-backtest.csv`');
  md.push('- `docs/exports/v41-multi-symbol-longer-backtest-trades.csv`');
  md.push('- `docs/exports/v41-multi-symbol-longer-backtest-summary.json`');
  md.push('- `scripts/backtest-v41-multi-symbol-longer.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify(summary.scenarios, null, 2));
  console.log(`[multi] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

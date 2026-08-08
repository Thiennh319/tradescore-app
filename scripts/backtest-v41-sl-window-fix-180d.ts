/**
 * Rebacktest 180d after SL 1H-window fix (through 4H close).
 * CVD = production detectCvdFlip only (NOT priorAvg_vs_c).
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-sl-window-fix-180d.ts
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
  TREND_REVERSAL_EXHAUSTION_MIN,
} from '../services/v41/reversalDetector';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const DAYS_180 = 180;
const WARMUP_4H = 220;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 150;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const VOL_MULT = 1.2;
const TP1_RR = 1.5;
const MAX_HOLD_4H = 20;
const CONF_SWEEP = [30, 35, 40, 45, 50] as const;
const OUTCOME_CONF = [40, 50] as const;
const DATE = '2026-08-01';

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-sl-window-fix-180d.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-sl-window-fix-180d-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-sl-window-fix-180d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/REPORT_V41_SL_WINDOW_FIX_AND_REBACKTEST_180D_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';

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
      ((exh - TREND_REVERSAL_EXHAUSTION_MIN) / (100 - TREND_REVERSAL_EXHAUSTION_MIN)) * 50,
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

type BarSignals = {
  idx4h: number;
  timestamp: number;
  timestamp_iso: string;
  trendDirection: TrendDirection;
  close: number;
  exh_4h: number;
  cvd: boolean;
  vol: boolean;
  exh: boolean;
  structure: boolean;
  exh_1h: number;
  volumeRatio: number;
  cvdLast3: [number, number, number];
  side: Side | null;
  confidence: number;
  gate: boolean;
};

type Trade = {
  conf_min: number;
  timestamp: number;
  timestamp_iso: string;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  confidence: number;
  outcome: 'TP' | 'SL' | 'BOTH' | 'TIMEOUT' | 'NO_SL';
  bars_held: number | null;
  sl_dist_pct: number | null;
};

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart180 = endMs - DAYS_180 * 24 * MS_1H;
  const fetchStart4h = evalStart180 - WARMUP_4H * MS_4H;
  const fetchStart1h = evalStart180 - WARMUP_1H * MS_1H;

  console.log(`[sl-win] fetching…`);
  const [near4h, near1h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', fetchStart4h, endMs),
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
  ]);
  const clocks = near4h.filter((k) => k.closeTime < endMs && k.openTime >= evalStart180);
  const idxByTs = new Map(near4h.map((k, i) => [k.openTime, i]));
  console.log(`[sl-win] near4h=${near4h.length} near1h=${near1h.length} clocks=${clocks.length}`);

  const bars: BarSignals[] = [];
  for (const k of clocks) {
    const ts = k.openTime;
    const idx4h = idxByTs.get(ts)!;
    const win4h = sliceUpTo(near4h, ts);
    const win1h = sliceUpTo(near1h, ts);
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

    const side: Side | null =
      trendDirection === 'BEAR' ? 'LONG' : trendDirection === 'BULL' ? 'SHORT' : null;
    const conf = confidenceTR(cvd, vol, exh, structure, cvdLast3, volumeRatio, exh_1h);
    const count = (cvd ? 1 : 0) + (vol ? 1 : 0) + (exh ? 1 : 0) + (structure ? 1 : 0);
    const gate = count >= 3;

    bars.push({
      idx4h,
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      close: k.close,
      exh_4h,
      cvd,
      vol,
      exh,
      structure,
      exh_1h,
      volumeRatio,
      cvdLast3,
      side,
      confidence: conf,
      gate,
    });
  }

  const nCvd = bars.filter((b) => b.cvd).length;
  const nGate = bars.filter((b) => b.gate).length;
  const conf_at: Record<number, number> = {};
  for (const th of CONF_SWEEP) {
    conf_at[th] = bars.filter((b) => b.gate && b.confidence >= th).length;
  }

  const trades: Trade[] = [];
  for (const confMin of OUTCOME_CONF) {
    for (const e of bars) {
      if (!e.gate || e.confidence < confMin || e.side == null) continue;
      const win1h = sliceUpTo(near1h, e.timestamp);
      const entry = e.close;
      const side = e.side;
      const sl = computeCounterTrendSL({
        klines1H: near1h,
        direction: side,
        entryPrice: entry,
        fourHOpenTime: e.timestamp,
      });
      if (!Number.isFinite(sl) || sl <= 0) {
        trades.push({
          conf_min: confMin,
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
      const tp1RR = TP1_RR * tpMult;
      const tp1 =
        side === 'LONG' ? entry + slDistance * tp1RR : entry - slDistance * tp1RR;

      let outcome: Trade['outcome'] = 'TIMEOUT';
      let bars_held: number | null = null;
      const startIdx = e.idx4h + 1;
      const endIdx = Math.min(near4h.length - 1, e.idx4h + MAX_HOLD_4H);
      for (let i = startIdx; i <= endIdx; i++) {
        const hit = hitOnBar(side, near4h[i]!, sl, tp1);
        if (hit) {
          outcome = hit;
          bars_held = i - e.idx4h;
          break;
        }
      }
      trades.push({
        conf_min: confMin,
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
      });
    }
  }

  function outcomeAt(confMin: number) {
    const t = trades.filter((x) => x.conf_min === confMin);
    const wins = t.filter((x) => x.outcome === 'TP').length;
    const losses = t.filter((x) => x.outcome === 'SL').length;
    const both = t.filter((x) => x.outcome === 'BOTH').length;
    const timeout = t.filter((x) => x.outcome === 'TIMEOUT').length;
    const no_sl = t.filter((x) => x.outcome === 'NO_SL').length;
    const wrong_side = t.filter(
      (x) =>
        Number.isFinite(x.sl) &&
        (x.side === 'LONG' ? !(x.sl < x.entry) : !(x.sl > x.entry)),
    ).length;
    const decided = wins + losses + both;
    const wr = decided > 0 ? (wins / decided) * 100 : NaN;
    const meanSlDist = (() => {
      const xs = t
        .map((x) => x.sl_dist_pct)
        .filter((x): x is number => x != null && Number.isFinite(x));
      if (!xs.length) return NaN;
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    })();
    const bySide = (['LONG', 'SHORT'] as const).map((side) => {
      const g = t.filter((x) => x.side === side && x.outcome !== 'NO_SL');
      const w = g.filter((x) => x.outcome === 'TP').length;
      const l = g.filter((x) => x.outcome === 'SL').length;
      const b = g.filter((x) => x.outcome === 'BOTH').length;
      const d = w + l + b;
      return {
        side,
        n: g.length,
        wins: w,
        wr: d > 0 ? (w / d) * 100 : NaN,
      };
    });
    return {
      conf_min: confMin,
      n: t.length,
      wins,
      losses,
      both,
      timeout,
      no_sl,
      wrong_side,
      wr,
      mean_sl_dist_pct: meanSlDist,
      bySide,
    };
  }

  const outcomes = OUTCOME_CONF.map(outcomeAt);
  const o40 = outcomes.find((o) => o.conf_min === 40)!;
  const o50 = outcomes.find((o) => o.conf_min === 50)!;

  const summary = {
    date: DATE,
    symbol: SYMBOL,
    n_clocks: clocks.length,
    config: {
      exhaustion_min: TREND_REVERSAL_EXHAUSTION_MIN,
      cvd: 'production detectCvdFlip',
      gate: '>=3/4',
      sl: 'computeCounterTrendSL + fourHOpenTime (1H through 4H close)',
      swing_lookback: 10,
      hold_4h: MAX_HOLD_4H,
      both_counts_as: 'loss',
    },
    baseline_pre_window_fix: {
      conf40: { n: 20, wr: 43.8, no_sl: 4, long: '8/71.4%', short: '12/22.2%' },
      conf50: { n: 19, wr: 46.7, no_sl: 4 },
    },
    freq: { nCvd, nGate, conf_at },
    outcomes,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const csv = [
    'conf_min,n,wins,losses,both,timeout,no_sl,wrong_side,wr_pct,mean_sl_dist_pct,long_n,long_wr,short_n,short_wr',
    ...outcomes.map((o) => {
      const L = o.bySide.find((s) => s.side === 'LONG')!;
      const S = o.bySide.find((s) => s.side === 'SHORT')!;
      return [
        o.conf_min,
        o.n,
        o.wins,
        o.losses,
        o.both,
        o.timeout,
        o.no_sl,
        o.wrong_side,
        Number.isFinite(o.wr) ? o.wr.toFixed(2) : '',
        Number.isFinite(o.mean_sl_dist_pct) ? o.mean_sl_dist_pct.toFixed(4) : '',
        L.n,
        Number.isFinite(L.wr) ? L.wr.toFixed(2) : '',
        S.n,
        Number.isFinite(S.wr) ? S.wr.toFixed(2) : '',
      ].join(',');
    }),
  ].join('\n');
  fs.writeFileSync(OUT_CSV, csv + '\n', 'utf8');

  const tradesCsv = [
    'conf_min,timestamp,timestamp_iso,side,entry,sl,tp1,confidence,outcome,bars_held,sl_dist_pct',
    ...trades.map((t) =>
      [
        t.conf_min,
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
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_TRADES, tradesCsv + '\n', 'utf8');

  const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
  const md: string[] = [];
  md.push('# REPORT — SL 1H-window fix + rebacktest 180d (CVD production)');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Scope:** Sửa cửa sổ 1H cho `computeCounterTrendSL` (through 4H close); CVD production gốc; **không** đổi SWING_LOOKBACK / detectCvdFlip / priorAvg',
  );
  md.push(`**n clocks:** ${clocks.length}`);
  md.push('');
  md.push('## 1. Fix');
  md.push('');
  md.push(
    '- Bug: entry = close 4H nhưng `klines1H` cắt tại open 4H → bỏ 4 giờ biến động tạo tín hiệu → NO_SL oan.',
  );
  md.push(
    '- Fix: `sliceKlines1HForFourHEntry` + `fourHOpenTime` trên `computeCounterTrendSL` — cửa sổ 1H gồm opens ≤ `4H_open + 3h`.',
  );
  md.push('- Giữ `SWING_LOOKBACK=10`, EMA20, `SL_BUFFER=0.003`, validate entryPrice.');
  md.push('');
  md.push('## 2. Cấu hình rebacktest');
  md.push('');
  md.push('- Exhaustion ≥28 · CVD **production** `detectCvdFlip` · Volume/Structure production · gate ≥3/4');
  md.push('- confidenceTR công thức đã sửa · SL cửa sổ mới · Hold 20×4H · BOTH = loss');
  md.push('');
  md.push('## 3. Tần suất signal (không đổi so với baseline CVD production)');
  md.push('');
  md.push(`| Metric | Count |`);
  md.push(`|---|---|`);
  md.push(`| CVD pass | ${nCvd} (${fmt((nCvd / clocks.length) * 100)}%) |`);
  md.push(`| Gate ≥3/4 | ${nGate} (${fmt((nGate / clocks.length) * 100)}%) |`);
  for (const th of CONF_SWEEP) {
    md.push(`| conf≥${th} | ${conf_at[th]} |`);
  }
  md.push('');
  md.push('## 4. Outcomes vs baseline (pre window-fix)');
  md.push('');
  md.push('| conf≥ | n (trước→sau) | NO_SL (trước→sau) | WR (trước→sau) | mean sl_dist% |');
  md.push('|---|---|---|---|---|');
  md.push(
    `| ≥40 | 20 → ${o40.n} | 4 → ${o40.no_sl} | 43.8% → ${fmt(o40.wr)}% | ${fmt(o40.mean_sl_dist_pct, 3)}% |`,
  );
  md.push(
    `| ≥50 | 19 → ${o50.n} | 4 → ${o50.no_sl} | 46.7% → ${fmt(o50.wr)}% | ${fmt(o50.mean_sl_dist_pct, 3)}% |`,
  );
  md.push('');
  md.push('### Chi tiết outcome');
  md.push('');
  md.push('| conf≥ | n | W | L | BOTH | TIMEOUT | NO_SL | wrong_side | WR |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const o of outcomes) {
    md.push(
      `| ≥${o.conf_min} | ${o.n} | ${o.wins} | ${o.losses} | ${o.both} | ${o.timeout} | ${o.no_sl} | ${o.wrong_side} | ${fmt(o.wr)}% |`,
    );
  }
  md.push('');
  md.push('### LONG vs SHORT (conf≥40)');
  md.push('');
  md.push('| Side | n (excl NO_SL) | WR |');
  md.push('|---|---|---|');
  for (const s of o40.bySide) {
    md.push(`| ${s.side} | ${s.n} | ${fmt(s.wr)}% |`);
  }
  md.push('');
  md.push('## 5. Kết luận');
  md.push('');
  md.push(
    `- NO_SL: ${o40.no_sl} @ conf≥40 (baseline 4) — cửa sổ mới ${o40.no_sl === 0 ? 'loại hết' : 'giảm'} NO_SL oan.`,
  );
  md.push(
    `- n active conf≥40: ${o40.n} (baseline 20) — WR ${fmt(o40.wr)}% (baseline 43.8%).`,
  );
  md.push('- Không đổi production CVD / lookback / không chọn ngưỡng confidence cuối.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-sl-window-fix-180d.csv`');
  md.push('- `docs/exports/v41-sl-window-fix-180d-trades.csv`');
  md.push('- `docs/exports/v41-sl-window-fix-180d-summary.json`');
  md.push('- `scripts/backtest-v41-sl-window-fix-180d.ts`');
  md.push('- `services/v41/__tests__/fixtures/sl-window-*.json`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({ freq: summary.freq, outcomes }, null, 2));
  console.log(`[sl-win] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

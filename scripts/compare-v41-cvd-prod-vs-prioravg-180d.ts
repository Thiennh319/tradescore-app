/**
 * Compare CVD Flip: production detectCvdFlip vs priorAvg_vs_c experiment.
 * Same 180d window, Exhaustion≥28, SL entryPrice-validated (post-fix).
 * Does NOT change detectCvdFlip production.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/compare-v41-cvd-prod-vs-prioravg-180d.ts
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

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_CVD_PRODUCTION_VS_PRIORAVG_POSTFIX_180D_2026-08-01.md',
);

type CvdMode = 'production' | 'priorAvg_vs_c';
type Side = 'LONG' | 'SHORT';

function cvdProxy(k: KlineV41): number {
  return k.takerBuyVolume - (k.volume - k.takerBuyVolume);
}

function cvdPriorAvgVsC(
  cvdLast3: [number, number, number],
  trend: TrendDirection,
): boolean {
  if (trend === 'NEUTRAL') return false;
  const priorAvg = (cvdLast3[0] + cvdLast3[1]) / 2;
  const c = cvdLast3[2];
  if (trend === 'BULL') return priorAvg > 0 && c < 0;
  return priorAvg < 0 && c > 0;
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

function resolveEffectiveTpMultiplier(momentumTp: number, exhaustionType: string): number {
  if (exhaustionType === 'CAPITULATION' || exhaustionType === 'FUNDING_EXTREME') {
    return momentumTp * 1.2;
  }
  return momentumTp * 0.8;
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
    if (!res.ok) throw new Error(`klines ${symbol} ${interval} HTTP ${res.status}`);
    const batch = (await res.json()) as (string | number)[][];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) out.push(toKlineV41(row));
    const lastOpen = Number(batch[batch.length - 1]![0]);
    const step = interval === '4h' ? MS_4H : MS_1H;
    const next = lastOpen + step;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < BINANCE_MAX_LIMIT) break;
  }
  const byTs = new Map<number, KlineV41>();
  for (const k of out) byTs.set(k.openTime, k);
  return [...byTs.values()].sort((a, b) => a.openTime - b.openTime);
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function pct(n: number, d: number): string {
  return d <= 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`;
}

function hitOnBar(
  side: Side,
  bar: KlineV41,
  sl: number,
  tp: number,
): 'TP' | 'SL' | 'BOTH' | null {
  if (side === 'LONG') {
    const hitSl = bar.low <= sl;
    const hitTp = bar.high >= tp;
    if (hitSl && hitTp) return 'BOTH';
    if (hitSl) return 'SL';
    if (hitTp) return 'TP';
    return null;
  }
  const hitSl = bar.high >= sl;
  const hitTp = bar.low <= tp;
  if (hitSl && hitTp) return 'BOTH';
  if (hitSl) return 'SL';
  if (hitTp) return 'TP';
  return null;
}

type BarSignals = {
  idx4h: number;
  timestamp: number;
  timestamp_iso: string;
  trendDirection: TrendDirection;
  close: number;
  exh_4h: number;
  vol: boolean;
  exh: boolean;
  structure: boolean;
  exh_1h: number;
  volumeRatio: number;
  cvdLast3: [number, number, number];
  cvd_prod: boolean;
  cvd_prior: boolean;
  side: Side | null;
};

type Trade = {
  cvd_mode: CvdMode;
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
};

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart180 = endMs - DAYS_180 * 24 * MS_1H;
  const fetchStart4h = evalStart180 - WARMUP_4H * MS_4H;
  const fetchStart1h = evalStart180 - WARMUP_1H * MS_1H;

  console.log(`[cvd-cmp] fetching…`);
  const [near4h, near1h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', fetchStart4h, endMs),
    fetchKlines(SYMBOL, '1h', fetchStart1h, endMs),
  ]);
  const clocks = near4h.filter((k) => k.closeTime < endMs && k.openTime >= evalStart180);
  const idxByTs = new Map(near4h.map((k, i) => [k.openTime, i]));
  console.log(`[cvd-cmp] near4h=${near4h.length} near1h=${near1h.length} clocks=${clocks.length}`);

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
    let cvd_prod = false;
    let cvd_prior = false;

    if (trendDirection !== 'NEUTRAL' && win1h.length >= 21) {
      cvdLast3 = win1h.slice(-3).map(cvdProxy) as [number, number, number];
      cvd_prod = detectCvdFlip(win1h, trendDirection);
      cvd_prior = cvdPriorAvgVsC(cvdLast3, trendDirection);
      const v = detectTrendReversalVolumeConfirmation(win1h);
      vol = v.confirmed;
      volumeRatio = v.volumeRatio;
      exh_1h = calculateTrendExhaustion(win1h, trendDirection).trendExhaustion;
      exh = exh_1h >= TREND_REVERSAL_EXHAUSTION_MIN;
      structure = detectStructureBreak(win1h, trendDirection).confirmed;
    }

    const side: Side | null =
      trendDirection === 'BEAR' ? 'LONG' : trendDirection === 'BULL' ? 'SHORT' : null;

    bars.push({
      idx4h,
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      close: k.close,
      exh_4h,
      vol,
      exh,
      structure,
      exh_1h,
      volumeRatio,
      cvdLast3,
      cvd_prod,
      cvd_prior,
      side,
    });
  }

  function evalMode(mode: CvdMode) {
    const cvdOf = (b: BarSignals) => (mode === 'production' ? b.cvd_prod : b.cvd_prior);

    let nCvd = 0;
    let nGate = 0;
    const conf_at: Record<number, number> = {};
    for (const th of CONF_SWEEP) conf_at[th] = 0;

    type Active = BarSignals & { cvd: boolean; confidence: number; gate: boolean };
    const actives: Active[] = [];

    for (const b of bars) {
      const cvd = cvdOf(b);
      if (cvd) nCvd++;
      const conf = confidenceTR(
        cvd,
        b.vol,
        b.exh,
        b.structure,
        b.cvdLast3,
        b.volumeRatio,
        b.exh_1h,
      );
      const count =
        (cvd ? 1 : 0) + (b.vol ? 1 : 0) + (b.exh ? 1 : 0) + (b.structure ? 1 : 0);
      const gate = count >= 3;
      if (gate) {
        nGate++;
        for (const th of CONF_SWEEP) {
          if (conf >= th) conf_at[th]!++;
        }
      }
      actives.push({ ...b, cvd, confidence: conf, gate });
    }

    const trades: Trade[] = [];
    for (const confMin of OUTCOME_CONF) {
      for (const e of actives) {
        if (!e.gate || e.confidence < confMin || e.side == null) continue;
        const win1h = sliceUpTo(near1h, e.timestamp);
        const entry = e.close;
        const side = e.side;
        // SL window must include 1H bars inside the 4H entry bar (through close).
        const sl = computeCounterTrendSL({
          klines1H: near1h,
          direction: side,
          entryPrice: entry,
          fourHOpenTime: e.timestamp,
        });
        if (!Number.isFinite(sl) || sl <= 0) {
          trades.push({
            cvd_mode: mode,
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
          cvd_mode: mode,
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
      const bySide = (['LONG', 'SHORT'] as const).map((side) => {
        const g = t.filter((x) => x.side === side && x.outcome !== 'NO_SL');
        const w = g.filter((x) => x.outcome === 'TP').length;
        const l = g.filter((x) => x.outcome === 'SL').length;
        const b = g.filter((x) => x.outcome === 'BOTH').length;
        const d = w + l + b;
        return {
          side,
          n: t.filter((x) => x.side === side).length,
          wins: w,
          losses: l,
          both: b,
          winrate: d > 0 ? (100 * w) / d : null,
        };
      });
      return {
        conf_min: confMin,
        n_active: t.length,
        wins,
        losses,
        both,
        timeout,
        no_sl,
        wrong_side,
        winrate: decided > 0 ? (100 * wins) / decided : null,
        bySide,
      };
    }

    return {
      mode,
      n_bars: bars.length,
      n_cvd: nCvd,
      n_gate: nGate,
      gate_pct: (nGate / bars.length) * 100,
      conf_at,
      outcomes: OUTCOME_CONF.map(outcomeAt),
      trades,
    };
  }

  const prod = evalMode('production');
  const prior = evalMode('priorAvg_vs_c');

  const allTrades = [...prod.trades, ...prior.trades];
  const tradeHeader =
    'cvd_mode,conf_min,timestamp,timestamp_iso,side,entry,sl,tp1,confidence,outcome,bars_held';
  const tradeBody = allTrades
    .map((t) =>
      [
        t.cvd_mode,
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
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(OUT_TRADES, `${tradeHeader}\n${tradeBody}\n`, 'utf8');

  const cmpHeader =
    'cvd_mode,n_cvd,n_gate,gate_pct,' +
    CONF_SWEEP.map((t) => `conf_ge_${t}`).join(',') +
    ',n_active_40,wr_40,long_n_40,long_wr_40,short_n_40,short_wr_40,no_sl_40,wrong_side_40,n_active_50,wr_50';
  const rowOf = (r: ReturnType<typeof evalMode>) => {
    const o40 = r.outcomes[0]!;
    const o50 = r.outcomes[1]!;
    const long = o40.bySide.find((s) => s.side === 'LONG')!;
    const short = o40.bySide.find((s) => s.side === 'SHORT')!;
    return [
      r.mode,
      r.n_cvd,
      r.n_gate,
      r.gate_pct.toFixed(2),
      ...CONF_SWEEP.map((t) => r.conf_at[t]),
      o40.n_active,
      o40.winrate == null ? '' : o40.winrate.toFixed(2),
      long.n,
      long.winrate == null ? '' : long.winrate.toFixed(2),
      short.n,
      short.winrate == null ? '' : short.winrate.toFixed(2),
      o40.no_sl,
      o40.wrong_side,
      o50.n_active,
      o50.winrate == null ? '' : o50.winrate.toFixed(2),
    ].join(',');
  };
  fs.writeFileSync(OUT_CSV, `${cmpHeader}\n${rowOf(prior)}\n${rowOf(prod)}\n`, 'utf8');

  const summary = {
    date: '2026-08-01',
    symbol: SYMBOL,
    n_clocks_180d: bars.length,
    shared: {
      exhaustion_min: TREND_REVERSAL_EXHAUSTION_MIN,
      volume: 'production',
      structure: 'production',
      gate: '≥3/4',
      sl: 'computeCounterTrendSL entryPrice-validated (post-fix)',
      note: 'detectCvdFlip production NOT modified',
    },
    priorAvg_vs_c: prior,
    production: prod,
  };
  // strip trades from JSON summary to keep size down
  const summaryLite = {
    ...summary,
    priorAvg_vs_c: { ...prior, trades: undefined },
    production: { ...prod, trades: undefined },
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summaryLite, null, 2), 'utf8');

  const fmtWr = (x: number | null) => (x == null ? 'n/a' : `${x.toFixed(1)}%`);
  const o40p = prior.outcomes[0]!;
  const o40d = prod.outcomes[0]!;
  const longP = o40p.bySide.find((s) => s.side === 'LONG')!;
  const shortP = o40p.bySide.find((s) => s.side === 'SHORT')!;
  const longD = o40d.bySide.find((s) => s.side === 'LONG')!;
  const shortD = o40d.bySide.find((s) => s.side === 'SHORT')!;

  const md: string[] = [];
  md.push('# REPORT — CVD production vs priorAvg_vs_c (post SL-fix, NEAR 180d)');
  md.push('');
  md.push('**Date:** 2026-08-01');
  md.push(
    '**Scope:** So sánh CVD only — SL đã sửa; Exhaustion≥28; **không** sửa `detectCvdFlip` production; **không** chọn cấu hình cuối',
  );
  md.push(`**n clocks:** ${bars.length}`);
  md.push('');
  md.push('## Cấu hình chung');
  md.push('');
  md.push('- Exhaustion ≥28 · Volume/Structure production · gate ≥3/4');
  md.push('- confidenceTR công thức đã sửa · SL `entryPrice`-validated');
  md.push('- Hold 20×4H · BOTH = loss (conservative)');
  md.push('');
  md.push('## Tần suất signal');
  md.push('');
  md.push(
    '| CVD mode | CVD pass | Signal-gate ≥3/4 | ≥30 | ≥35 | ≥40 | ≥45 | ≥50 |',
  );
  md.push('|---|---|---|---|---|---|---|---|');
  for (const r of [prior, prod]) {
    md.push(
      `| ${r.mode} | ${r.n_cvd} (${pct(r.n_cvd, bars.length)}) | ${r.n_gate} (${pct(r.n_gate, bars.length)}) | ${CONF_SWEEP.map((t) => r.conf_at[t]).join(' | ')} |`,
    );
  }
  md.push('');
  md.push('## Bảng so sánh chính (conf≥40)');
  md.push('');
  md.push('| Cấu hình CVD | n active (conf≥40) | Winrate | LONG n/WR | SHORT n/WR |');
  md.push('|---|---|---|---|---|');
  md.push(
    `| priorAvg_vs_c (thử nghiệm) | ${o40p.n_active} | ${fmtWr(o40p.winrate)} | ${longP.n}/${fmtWr(longP.winrate)} | ${shortP.n}/${fmtWr(shortP.winrate)} |`,
  );
  md.push(
    `| production gốc (detectCvdFlip) | ${o40d.n_active} | ${fmtWr(o40d.winrate)} | ${longD.n}/${fmtWr(longD.winrate)} | ${shortD.n}/${fmtWr(shortD.winrate)} |`,
  );
  md.push('');
  md.push('### Chi tiết outcome');
  md.push('');
  md.push('| CVD mode | conf≥ | n | W | L | BOTH | NO_SL | wrong_side | WR |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of [prior, prod]) {
    for (const o of r.outcomes) {
      md.push(
        `| ${r.mode} | ≥${o.conf_min} | ${o.n_active} | ${o.wins} | ${o.losses} | ${o.both} | ${o.no_sl} | ${o.wrong_side} | ${fmtWr(o.winrate)} |`,
      );
    }
  }
  md.push('');
  if (o40d.n_active < 10) {
    md.push(
      `**Giới hạn mẫu:** production gốc chỉ **${o40d.n_active}** lệnh active @ conf≥40 (n<10) — winrate **không** đáng tin để quyết định; chỉ dùng như tín hiệu tần suất thấp.`,
    );
    md.push('');
  }
  md.push('## Quan sát (không chọn cấu hình)');
  md.push('');
  md.push(
    `- CVD pass riêng: priorAvg ${prior.n_cvd} vs production ${prod.n_cvd} trên ${bars.length} nến.`,
  );
  md.push(
    `- Gate ≥3/4: priorAvg ${prior.n_gate} vs production ${prod.n_gate}.`,
  );
  md.push('- Không sửa `detectCvdFlip` production trong task này.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d.csv`');
  md.push('- `docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d-trades.csv`');
  md.push('- `docs/exports/v41-cvd-prod-vs-prioravg-postfix-180d-summary.json`');
  md.push('- `scripts/compare-v41-cvd-prod-vs-prioravg-180d.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        clocks: bars.length,
        prior: {
          cvd: prior.n_cvd,
          gate: prior.n_gate,
          o40: o40p,
        },
        production: {
          cvd: prod.n_cvd,
          gate: prod.n_gate,
          o40: o40d,
        },
      },
      null,
      2,
    ),
  );
  console.log(`[cvd-cmp] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

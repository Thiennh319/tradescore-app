/**
 * Recalc TR confidence using real computeTrendReversalConfidence formula
 * (NOT marketConfidence proxy). After 2026-08-01 exhaustion formula fix:
 *   TREND_REVERSAL_EXHAUSTION_MIN = 28 (was 55)
 *   scoreExhaustion divisor = (100 - MIN) (was hard-coded 45)
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/recalc-v41-tr-confidence-real-30d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import {
  computeTrendReversal,
  detectCvdFlip,
  detectStructureBreak,
  detectTrendReversalVolumeConfirmation,
  TREND_REVERSAL_EXHAUSTION_MIN,
  type TrendReversalSignals,
} from '../services/v41/reversalDetector';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const WARMUP_4H = 220;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 200;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;

/** Verbatim from reversalDetector.ts */
const TREND_REVERSAL_VOLUME_MULTIPLIER = 1.2;

/** Snapshot BEFORE fix (REPORT_V41_TR_CONFIDENCE_REAL_RECALC_2026-08-01 / per-bar CSV). */
const BEFORE = {
  exh_min: 55,
  formula: 'min(100, 50 + ((exh - 55) / 45) * 50)',
  dist: {
    n: 179,
    min: 0,
    p25: 0,
    median: 0,
    mean: 12.162895690671885,
    p75: 17.5,
    p90: 38.66155334860652,
    max: 67.5,
  },
  pass_at: { 50: 3, 55: 3, 60: 3, 65: 2, 70: 0 } as Record<number, number>,
};

const CONF_CSV = path.resolve(__dirname, '../docs/exports/v41-market-confidence-30d-4h.csv');
const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-tr-confidence-real-recalc-30d.csv',
);
const OUT_PER_BAR = path.resolve(
  __dirname,
  '../docs/exports/v41-tr-confidence-real-per-bar-30d.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-tr-confidence-real-recalc-30d-summary.json',
);
const OUT_FIX_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-exhaustion-formula-fix-recalc-30d.csv',
);
const OUT_FIX_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-exhaustion-formula-fix-recalc-30d-summary.json',
);
const OUT_FIX_MD = path.resolve(
  __dirname,
  '../docs/exports/REPORT_V41_EXHAUSTION_FORMULA_FIX_RECALC_2026-08-01.md',
);

// ---------------------------------------------------------------------------
// Verbatim copies from services/v41/reversalDetector.ts (private helpers)
// ---------------------------------------------------------------------------

function scoreCvdFlipComponent(
  confirmed: boolean,
  cvdLast3: [number, number, number],
): number {
  if (!confirmed) return 0;
  const priorAvg = (cvdLast3[0] + cvdLast3[1]) / 2;
  const flipMag = Math.abs(cvdLast3[2] - priorAvg);
  const normalized = Math.min(100, 55 + flipMag / 10);
  return normalized;
}

function scoreVolumeComponent(confirmed: boolean, volumeRatio: number): number {
  if (!confirmed) return 0;
  return Math.min(100, 50 + ((volumeRatio - TREND_REVERSAL_VOLUME_MULTIPLIER) / 0.8) * 50);
}

function scoreExhaustionComponent(confirmed: boolean, trendExhaustion: number): number {
  if (!confirmed) return 0;
  return Math.min(
    100,
    50 +
      ((trendExhaustion - TREND_REVERSAL_EXHAUSTION_MIN) /
        (100 - TREND_REVERSAL_EXHAUSTION_MIN)) *
        50,
  );
}

function scoreStructureComponent(confirmed: boolean): number {
  return confirmed ? 70 : 0;
}

/** Verbatim computeTrendReversalConfidence (private in production). */
function computeTrendReversalConfidence(
  signals: TrendReversalSignals,
  detail: {
    cvdLast3: [number, number, number];
    volumeRatio: number;
    trendExhaustion: number;
  },
): number {
  const scores = [
    scoreCvdFlipComponent(signals.cvdFlip, detail.cvdLast3),
    scoreVolumeComponent(signals.volumeConfirmation, detail.volumeRatio),
    scoreExhaustionComponent(signals.trendExhaustion, detail.trendExhaustion),
    scoreStructureComponent(signals.structureBreak),
  ];
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function cvdProxy(kline: KlineV41): number {
  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);
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

function loadConfTimestamps(): number[] {
  const text = fs.readFileSync(CONF_CSV, 'utf8');
  const lines = text.trim().split(/\r?\n/).slice(1);
  const ts: number[] = [];
  for (const line of lines) {
    const t = Number(line.split(',')[0]);
    if (Number.isFinite(t)) ts.push(t);
  }
  return ts;
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function pct(n: number, d: number): string {
  if (d <= 0) return '0.0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - pos) + sorted[hi]! * (pos - lo);
}

function distStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n === 0 ? NaN : sorted.reduce((s, v) => s + v, 0) / n;
  return {
    n,
    min: sorted[0] ?? NaN,
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    mean,
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    max: sorted[n - 1] ?? NaN,
    ge70: values.filter((v) => v >= 70).length,
  };
}

type Bar = {
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  cvdFlip: boolean;
  volumeConfirmation: boolean;
  structureBreak: boolean;
  exh_1h: number;
  volumeRatio: number;
  cvdLast3: [number, number, number];
  /** Production computeTrendReversal detail.confidence (exh gate @55). */
  confidence_production: number;
  /** Local verbatim formula with same production signals — must match. */
  confidence_verify: number;
};

type PlanRow = {
  plan: string;
  signal_condition: string;
  pass_signal_n179: number;
  pass_signal_and_conf70: number;
  conf_series_note: string;
};

async function main(): Promise<void> {
  const timestamps = loadConfTimestamps();
  if (timestamps.length === 0) throw new Error(`empty ${CONF_CSV}`);

  const endMs = timestamps[timestamps.length - 1]! + MS_4H;
  const start4h = timestamps[0]! - WARMUP_4H * MS_4H;
  const start1h = timestamps[0]! - WARMUP_1H * MS_1H;

  console.log(`[tr-conf-real] n=${timestamps.length} fetching klines…`);
  const [near4h, near1h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', start4h, endMs),
    fetchKlines(SYMBOL, '1h', start1h, endMs),
  ]);
  console.log(`[tr-conf-real] near4h=${near4h.length} near1h=${near1h.length}`);

  const bars: Bar[] = [];
  let verifyMismatch = 0;

  for (const ts of timestamps) {
    const win4h = sliceUpTo(near4h, ts);
    const win1h = sliceUpTo(near1h, ts);
    const strength = calculateTrendStrength(win4h);
    const trendDirection: TrendDirection = strength.trendDirection;

    const tr = computeTrendReversal({
      klines1H: win1h,
      trendDirection,
      symbol: SYMBOL,
    });

    // Rebuild detail fields independently (same as computeTrendReversal body)
    // so we can re-score under alternate exhaustion booleans.
    let cvdFlip = false;
    let volumeConfirmation = false;
    let volumeRatio = 0;
    let structureBreak = false;
    let exh_1h = 0;
    let cvdLast3: [number, number, number] = [0, 0, 0];

    if (trendDirection !== 'NEUTRAL' && win1h.length >= 21) {
      cvdFlip = detectCvdFlip(win1h, trendDirection);
      const vol = detectTrendReversalVolumeConfirmation(win1h);
      volumeConfirmation = vol.confirmed;
      volumeRatio = vol.volumeRatio;
      const exh = calculateTrendExhaustion(win1h, trendDirection);
      exh_1h = exh.trendExhaustion;
      structureBreak = detectStructureBreak(win1h, trendDirection).confirmed;
      cvdLast3 = win1h.slice(-3).map(cvdProxy) as [number, number, number];
    }

    const productionSignals: TrendReversalSignals = {
      cvdFlip,
      volumeConfirmation,
      trendExhaustion: exh_1h >= TREND_REVERSAL_EXHAUSTION_MIN,
      structureBreak,
    };
    const confidence_verify = computeTrendReversalConfidence(productionSignals, {
      cvdLast3,
      volumeRatio,
      trendExhaustion: exh_1h,
    });

    if (Math.abs(confidence_verify - tr.detail.confidence) > 1e-9) {
      verifyMismatch++;
    }

    bars.push({
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      cvdFlip,
      volumeConfirmation,
      structureBreak,
      exh_1h,
      volumeRatio,
      cvdLast3,
      confidence_production: tr.detail.confidence,
      confidence_verify,
    });
  }

  const n = bars.length;
  const directed = bars.filter((b) => b.trendDirection !== 'NEUTRAL');

  // Production confidence distribution (exh boolean @55)
  const prodConfStats = distStats(bars.map((b) => b.confidence_production));
  const verifyConfStats = distStats(bars.map((b) => b.confidence_verify));
  const directedConfStats = distStats(directed.map((b) => b.confidence_production));

  function confFor(bar: Bar, exhConfirmed: boolean): number {
    return computeTrendReversalConfidence(
      {
        cvdFlip: bar.cvdFlip,
        volumeConfirmation: bar.volumeConfirmation,
        trendExhaustion: exhConfirmed,
        structureBreak: bar.structureBreak,
      },
      {
        cvdLast3: bar.cvdLast3,
        volumeRatio: bar.volumeRatio,
        trendExhaustion: bar.exh_1h,
      },
    );
  }

  function planA(
    label: string,
    minOf3: number,
  ): PlanRow {
    let passSignal = 0;
    let passFull = 0;
    for (const b of bars) {
      const s3 = (b.cvdFlip ? 1 : 0) + (b.volumeConfirmation ? 1 : 0) + (b.structureBreak ? 1 : 0);
      const gate = s3 >= minOf3;
      // Bỏ Exhaustion khỏi tổ hợp → boolean exhaustion = false trong confidence.
      const conf = confFor(b, false);
      if (gate) passSignal++;
      if (gate && conf >= 70) passFull++;
    }
    return {
      plan: 'A',
      signal_condition: label,
      pass_signal_n179: passSignal,
      pass_signal_and_conf70: passFull,
      conf_series_note: 'computeTrendReversalConfidence with trendExhaustion=false (dropped)',
    };
  }

  function planB(exhMin: number, isBaseline = false): PlanRow {
    let passSignal = 0;
    let passFull = 0;
    for (const b of bars) {
      const exhOk = b.exh_1h >= exhMin;
      const count =
        (b.cvdFlip ? 1 : 0) +
        (b.volumeConfirmation ? 1 : 0) +
        (exhOk ? 1 : 0) +
        (b.structureBreak ? 1 : 0);
      const gate = count >= 3;
      const conf = confFor(b, exhOk);
      if (gate) passSignal++;
      if (gate && conf >= 70) passFull++;
    }
    return {
      plan: isBaseline ? 'Baseline' : 'B',
      signal_condition: isBaseline
        ? `≥3/4, exhaustion≥${exhMin} (production hiện tại)`
        : `≥3/4, exhaustion≥${exhMin}`,
      pass_signal_n179: passSignal,
      pass_signal_and_conf70: passFull,
      conf_series_note: `computeTrendReversalConfidence with trendExhaustion=(exh_1h≥${exhMin}); scoreExhaustion uses MIN=${TREND_REVERSAL_EXHAUSTION_MIN}`,
    };
  }

  const plans: PlanRow[] = [
    planA('≥2/3 (bỏ Exhaustion)', 2),
    planA('≥3/3 (bỏ Exhaustion)', 3),
    planB(10),
    planB(15),
    planB(20),
    planB(TREND_REVERSAL_EXHAUSTION_MIN, true),
  ];

  // Step 4: confidence threshold sweep for A≥2/3
  const confSweepThresholds = [50, 55, 60, 65, 70];
  const confSweep = confSweepThresholds.map((th) => {
    let pass = 0;
    for (const b of bars) {
      const s3 = (b.cvdFlip ? 1 : 0) + (b.volumeConfirmation ? 1 : 0) + (b.structureBreak ? 1 : 0);
      if (s3 < 2) continue;
      const conf = confFor(b, false);
      if (conf >= th) pass++;
    }
    return { confidence_min: th, pass_A_ge2of3_and_conf: pass, pct: (pass / n) * 100 };
  });

  // Theoretical max confidence when exhaustion not confirmed
  const theoreticalMaxNoExh = (100 + 100 + 0 + 70) / 4; // 67.5

  // Per-bar export (production confidence + components)
  const perBarHeader = [
    'timestamp',
    'timestamp_iso',
    'trendDirection',
    'cvd_flip',
    'volume_confirm',
    'structure_break',
    'exh_1h',
    'volumeRatio',
    'cvd0',
    'cvd1',
    'cvd2',
    'exh_ge55',
    'confidence_production',
    'confidence_verify',
    'confidence_A_exhFalse',
    'confidence_B10',
    'confidence_B15',
    'confidence_B20',
  ].join(',');
  const perBarBody = bars
    .map((b) => {
      const exh55 = b.exh_1h >= 55;
      return [
        b.timestamp,
        b.timestamp_iso,
        b.trendDirection,
        b.cvdFlip ? 1 : 0,
        b.volumeConfirmation ? 1 : 0,
        b.structureBreak ? 1 : 0,
        b.exh_1h,
        b.volumeRatio.toFixed(6),
        b.cvdLast3[0],
        b.cvdLast3[1],
        b.cvdLast3[2],
        exh55 ? 1 : 0,
        b.confidence_production.toFixed(6),
        b.confidence_verify.toFixed(6),
        confFor(b, false).toFixed(6),
        confFor(b, b.exh_1h >= 10).toFixed(6),
        confFor(b, b.exh_1h >= 15).toFixed(6),
        confFor(b, b.exh_1h >= 20).toFixed(6),
      ].join(',');
    })
    .join('\n');
  fs.writeFileSync(OUT_PER_BAR, `${perBarHeader}\n${perBarBody}\n`, 'utf8');

  const planCsvHeader =
    'plan,signal_condition,pass_signal_n179,pass_signal_and_conf70,conf_series_note';
  const planCsvBody = plans
    .map((p) =>
      [p.plan, `"${p.signal_condition}"`, p.pass_signal_n179, p.pass_signal_and_conf70, `"${p.conf_series_note}"`].join(
        ',',
      ),
    )
    .join('\n');
  fs.writeFileSync(OUT_CSV, `${planCsvHeader}\n${planCsvBody}\n`, 'utf8');

  const confThresholds = [50, 55, 60, 65, 70];
  const passAtAfter: Record<number, number> = {};
  for (const th of confThresholds) {
    passAtAfter[th] = bars.filter((b) => b.confidence_production >= th).length;
  }

  const nExhPass = bars.filter((b) => b.exh_1h >= TREND_REVERSAL_EXHAUSTION_MIN).length;

  const summary = {
    symbol: SYMBOL,
    n,
    n_nonNeutral: directed.length,
    TREND_REVERSAL_EXHAUSTION_MIN,
    verify_mismatch_vs_computeTrendReversal: verifyMismatch,
    formula_source: 'services/v41/reversalDetector.ts computeTrendReversalConfidence (verbatim copy)',
    exhaustion_pass_ge_min: nExhPass,
    theoretical_max_confidence_when_exhaustion_not_confirmed: theoreticalMaxNoExh,
    confidence_production_dist_n179: prodConfStats,
    confidence_verify_dist_n179: verifyConfStats,
    confidence_production_dist_nonNeutral: directedConfStats,
    pass_confidence_at: passAtAfter,
    before_fix: BEFORE,
    plans,
    conf_sweep_A_ge2of3: confSweep,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  // --- Fix comparison report (primary output for this task) ---
  const fixCsv = [
    'metric,before,after',
    `exh_min,${BEFORE.exh_min},${TREND_REVERSAL_EXHAUSTION_MIN}`,
    `conf_min,${BEFORE.dist.min},${prodConfStats.min}`,
    `conf_p25,${BEFORE.dist.p25},${prodConfStats.p25}`,
    `conf_median,${BEFORE.dist.median},${prodConfStats.median}`,
    `conf_mean,${BEFORE.dist.mean},${prodConfStats.mean}`,
    `conf_p75,${BEFORE.dist.p75},${prodConfStats.p75}`,
    `conf_p90,${BEFORE.dist.p90},${prodConfStats.p90}`,
    `conf_max,${BEFORE.dist.max},${prodConfStats.max}`,
    ...confThresholds.map(
      (th) => `pass_conf_ge_${th},${BEFORE.pass_at[th]},${passAtAfter[th]}`,
    ),
    `exhaustion_signal_pass_ge_min,0,${nExhPass}`,
  ].join('\n');
  fs.writeFileSync(OUT_FIX_CSV, fixCsv + '\n', 'utf8');

  const fixSummary = {
    date: '2026-08-01',
    n,
    changes: {
      TREND_REVERSAL_EXHAUSTION_MIN: { before: 55, after: TREND_REVERSAL_EXHAUSTION_MIN },
      scoreExhaustionComponent: {
        before: 'min(100, 50 + ((exh - MIN) / 45) * 50)  // 45 = 100-55 hard-coded',
        after: 'min(100, 50 + ((exh - MIN) / (100 - MIN)) * 50)',
      },
    },
    not_changed: ['MarketConfidence formula', 'Momentum1H', 'TREND_REVERSAL_CONFIDENCE_MIN (=70)'],
    verify_mismatch: verifyMismatch,
    before: BEFORE,
    after: {
      exh_min: TREND_REVERSAL_EXHAUSTION_MIN,
      dist: prodConfStats,
      pass_at: passAtAfter,
      exhaustion_signal_pass_ge_min: nExhPass,
    },
  };
  fs.writeFileSync(OUT_FIX_JSON, JSON.stringify(fixSummary, null, 2), 'utf8');

  const fmd: string[] = [];
  fmd.push('# REPORT — V4.1 Exhaustion formula fix + confidenceTR recalc (NEAR 30d)');
  fmd.push('');
  fmd.push('**Date:** 2026-08-01');
  fmd.push('**Scope:** V4.1 — sửa 2 điểm Exhaustion; **không** đổi MarketConfidence / Momentum1H / ngưỡng confidence');
  fmd.push(`**n:** ${n} (cùng timestamps) · verify mismatch vs \`computeTrendReversal\`: ${verifyMismatch}`);
  fmd.push('');
  fmd.push('## Thay đổi production');
  fmd.push('');
  fmd.push('| # | File | Trước | Sau |');
  fmd.push('|---|------|-------|-----|');
  fmd.push(
    `| 1 | \`TREND_REVERSAL_EXHAUSTION_MIN\` | 55 | **${TREND_REVERSAL_EXHAUSTION_MIN}** |`,
  );
  fmd.push(
    '| 2 | `scoreExhaustionComponent` divisor | hard-code `/ 45` (=100−55) | `/(100 - TREND_REVERSAL_EXHAUSTION_MIN)` |',
  );
  fmd.push('');
  fmd.push('```ts');
  fmd.push('// sau sửa');
  fmd.push('return Math.min(');
  fmd.push('  100,');
  fmd.push('  50 + ((trendExhaustion - TREND_REVERSAL_EXHAUSTION_MIN) /');
  fmd.push('        (100 - TREND_REVERSAL_EXHAUSTION_MIN)) * 50,');
  fmd.push(');');
  fmd.push('```');
  fmd.push('');
  fmd.push(`Exhaustion signal pass (\`exh_1h ≥ ${TREND_REVERSAL_EXHAUSTION_MIN}\`): **${nExhPass}/${n}** (trước @55: 0/${n}).`);
  fmd.push('');
  fmd.push('## Phân phối confidenceTR (production signals)');
  fmd.push('');
  fmd.push('| Stat | Trước (MIN=55, /45) | Sau (MIN=28, /(100−MIN)) |');
  fmd.push('|------|---------------------|--------------------------|');
  fmd.push(`| min | ${BEFORE.dist.min.toFixed(2)} | ${prodConfStats.min.toFixed(2)} |`);
  fmd.push(`| p25 | ${BEFORE.dist.p25.toFixed(2)} | ${prodConfStats.p25.toFixed(2)} |`);
  fmd.push(`| median | ${BEFORE.dist.median.toFixed(2)} | ${prodConfStats.median.toFixed(2)} |`);
  fmd.push(`| mean | ${BEFORE.dist.mean.toFixed(2)} | ${prodConfStats.mean.toFixed(2)} |`);
  fmd.push(`| p75 | ${BEFORE.dist.p75.toFixed(2)} | ${prodConfStats.p75.toFixed(2)} |`);
  fmd.push(`| p90 | ${BEFORE.dist.p90.toFixed(2)} | ${prodConfStats.p90.toFixed(2)} |`);
  fmd.push(`| max | ${BEFORE.dist.max.toFixed(2)} | ${prodConfStats.max.toFixed(2)} |`);
  fmd.push('');
  fmd.push('## Số nến pass confidenceTR theo mốc (n=179)');
  fmd.push('');
  fmd.push('| confidenceTR ≥ | Trước | Sau | Δ |');
  fmd.push('|----------------|-------|-----|---|');
  for (const th of confThresholds) {
    const b = BEFORE.pass_at[th]!;
    const a = passAtAfter[th]!;
    fmd.push(`| ${th} | ${b} | ${a} | ${a - b >= 0 ? '+' : ''}${a - b} |`);
  }
  fmd.push('');
  fmd.push('## Ghi chú');
  fmd.push('');
  fmd.push('- Before = snapshot `REPORT_V41_TR_CONFIDENCE_REAL_RECALC_2026-08-01` / per-bar CSV trước sửa.');
  fmd.push('- After = `computeTrendReversal().detail.confidence` sau 2 thay đổi trên.');
  fmd.push('- Không chọn ngưỡng confidence cuối trong task này.');
  fmd.push('- MarketConfidence formula không đổi.');
  fmd.push('');
  fmd.push('## Artefacts');
  fmd.push('');
  fmd.push('- `docs/exports/REPORT_V41_EXHAUSTION_FORMULA_FIX_RECALC_2026-08-01.md`');
  fmd.push('- `docs/exports/v41-exhaustion-formula-fix-recalc-30d.csv`');
  fmd.push('- `docs/exports/v41-exhaustion-formula-fix-recalc-30d-summary.json`');
  fmd.push('- Per-bar refresh: `docs/exports/v41-tr-confidence-real-per-bar-30d.csv`');

  fs.writeFileSync(OUT_FIX_MD, fmd.join('\n') + '\n', 'utf8');

  console.log(
    JSON.stringify(
      {
        verifyMismatch,
        exhMin: TREND_REVERSAL_EXHAUSTION_MIN,
        nExhPass,
        prodConfStats,
        passAtAfter,
        beforePassAt: BEFORE.pass_at,
        plans,
      },
      null,
      2,
    ),
  );
  console.log(`[tr-conf-real] wrote ${OUT_FIX_MD}`);
  console.log(`[tr-conf-real] wrote ${OUT_FIX_CSV}`);
  console.log(`[tr-conf-real] wrote ${OUT_FIX_JSON}`);
  console.log(`[tr-conf-real] wrote ${OUT_CSV}`);
  console.log(`[tr-conf-real] wrote ${OUT_PER_BAR}`);
  console.log(`[tr-conf-real] wrote ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

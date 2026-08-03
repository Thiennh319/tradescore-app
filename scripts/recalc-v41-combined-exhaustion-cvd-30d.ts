/**
 * Combined TR recalc: Exhaustion MIN=28 (already in prod) + CVD priorAvg_vs_c (experiment only).
 * Compares baseline-original / exhaustion-only / combined. No production CVD change.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/recalc-v41-combined-exhaustion-cvd-30d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import {
  detectCvdFlip,
  detectStructureBreak,
  detectTrendReversalVolumeConfirmation,
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
const VOL_MULT = 1.2;
const CONF_THRESHOLDS = [30, 35, 40, 45, 50, 55, 60, 70] as const;

const CONF_CSV = path.resolve(__dirname, '../docs/exports/v41-market-confidence-30d-4h.csv');
const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-combined-exhaustion-cvd-recalc-30d.csv',
);
const OUT_PER_BAR = path.resolve(
  __dirname,
  '../docs/exports/v41-combined-exhaustion-cvd-per-bar-30d.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-combined-exhaustion-cvd-recalc-30d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_COMBINED_EXHAUSTION_CVD_RECALC_2026-08-01.md',
);

function cvdProxy(kline: KlineV41): number {
  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);
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

/** Pre-fix: MIN=55, divisor hard-coded 45 */
function scoreExhOld(confirmed: boolean, exh: number): number {
  if (!confirmed) return 0;
  return Math.min(100, 50 + ((exh - 55) / 45) * 50);
}

/** Post-fix: MIN dynamic, divisor (100-MIN) */
function scoreExhNew(confirmed: boolean, exh: number, min: number): number {
  if (!confirmed) return 0;
  return Math.min(100, 50 + ((exh - min) / (100 - min)) * 50);
}

function scoreStructure(confirmed: boolean): number {
  return confirmed ? 70 : 0;
}

function confidence(
  cvd: boolean,
  vol: boolean,
  exh: boolean,
  structure: boolean,
  cvdLast3: [number, number, number],
  volumeRatio: number,
  exhRaw: number,
  exhMode: 'old55' | 'new28',
): number {
  const exhScore =
    exhMode === 'old55'
      ? scoreExhOld(exh, exhRaw)
      : scoreExhNew(exh, exhRaw, 28);
  return (
    (scoreCvd(cvd, cvdLast3) +
      scoreVolume(vol, volumeRatio) +
      exhScore +
      scoreStructure(structure)) /
    4
  );
}

/** Experimental CVD: priorAvg vs last candle (from CVD flip investigation). */
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
  return text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => Number(l.split(',')[0]))
    .filter((t) => Number.isFinite(t));
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function pct(n: number, d: number): string {
  return d <= 0 ? '0.0%' : `${((n / d) * 100).toFixed(1)}%`;
}

type Bar = {
  timestamp: number;
  timestamp_iso: string;
  trendDirection: string;
  cvd_prod: boolean;
  cvd_priorAvg: boolean;
  volume: boolean;
  structure: boolean;
  exh_1h: number;
  volumeRatio: number;
  cvdLast3: [number, number, number];
};

type ConfigResult = {
  id: string;
  label: string;
  signal_gate: number;
  per_signal: { cvd: number; vol: number; exh: number; structure: number };
  conf_at: Record<number, number>;
};

async function main(): Promise<void> {
  const timestamps = loadConfTimestamps();
  const endMs = timestamps[timestamps.length - 1]! + MS_4H;
  const start4h = timestamps[0]! - WARMUP_4H * MS_4H;
  const start1h = timestamps[0]! - WARMUP_1H * MS_1H;

  console.log(`[combined] n=${timestamps.length} fetching…`);
  const [near4h, near1h] = await Promise.all([
    fetchKlines(SYMBOL, '4h', start4h, endMs),
    fetchKlines(SYMBOL, '1h', start1h, endMs),
  ]);
  console.log(`[combined] near4h=${near4h.length} near1h=${near1h.length}`);

  const bars: Bar[] = [];
  for (const ts of timestamps) {
    const win4h = sliceUpTo(near4h, ts);
    const win1h = sliceUpTo(near1h, ts);
    const trendDirection = calculateTrendStrength(win4h).trendDirection;

    let cvd_prod = false;
    let cvd_priorAvg = false;
    let volume = false;
    let structure = false;
    let exh_1h = 0;
    let volumeRatio = 0;
    let cvdLast3: [number, number, number] = [0, 0, 0];

    if (trendDirection !== 'NEUTRAL' && win1h.length >= 3) {
      cvdLast3 = win1h.slice(-3).map(cvdProxy) as [number, number, number];
      cvd_prod = detectCvdFlip(win1h, trendDirection);
      cvd_priorAvg = cvdPriorAvgVsC(cvdLast3, trendDirection);
      if (win1h.length >= 21) {
        const vol = detectTrendReversalVolumeConfirmation(win1h);
        volume = vol.confirmed;
        volumeRatio = vol.volumeRatio;
        exh_1h = calculateTrendExhaustion(win1h, trendDirection).trendExhaustion;
        structure = detectStructureBreak(win1h, trendDirection).confirmed;
      }
    }

    bars.push({
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      trendDirection,
      cvd_prod,
      cvd_priorAvg,
      volume,
      structure,
      exh_1h,
      volumeRatio,
      cvdLast3,
    });
  }

  const n = bars.length;
  const directed = bars.filter((b) => b.trendDirection !== 'NEUTRAL');

  function evalConfig(
    id: string,
    label: string,
    cvdFn: (b: Bar) => boolean,
    exhMin: number,
    exhMode: 'old55' | 'new28',
  ): ConfigResult {
    let signal_gate = 0;
    const per = { cvd: 0, vol: 0, exh: 0, structure: 0 };
    const conf_at: Record<number, number> = {};
    for (const th of CONF_THRESHOLDS) conf_at[th] = 0;

    const perBarConf: number[] = [];

    for (const b of bars) {
      const cvd = cvdFn(b);
      const exh = b.exh_1h >= exhMin;
      const vol = b.volume;
      const structure = b.structure;
      if (cvd) per.cvd++;
      if (vol) per.vol++;
      if (exh) per.exh++;
      if (structure) per.structure++;

      const count = (cvd ? 1 : 0) + (vol ? 1 : 0) + (exh ? 1 : 0) + (structure ? 1 : 0);
      const gate = count >= 3;
      if (gate) signal_gate++;

      const conf = confidence(
        cvd,
        vol,
        exh,
        structure,
        b.cvdLast3,
        b.volumeRatio,
        b.exh_1h,
        exhMode,
      );
      perBarConf.push(conf);
      if (gate) {
        for (const th of CONF_THRESHOLDS) {
          if (conf >= th) conf_at[th]!++;
        }
      }
    }

    return { id, label, signal_gate, per_signal: per, conf_at };
  }

  const configs: ConfigResult[] = [
    evalConfig(
      'baseline_original',
      'Baseline gốc (CVD prod + Exhaustion≥55 + score /45)',
      (b) => b.cvd_prod,
      55,
      'old55',
    ),
    evalConfig(
      'exhaustion_only',
      'Chỉ sửa Exhaustion (CVD prod + Exhaustion≥28 + score /(100−MIN))',
      (b) => b.cvd_prod,
      28,
      'new28',
    ),
    evalConfig(
      'combined',
      'Sửa Exhaustion + CVD priorAvg_vs_c (MỚI)',
      (b) => b.cvd_priorAvg,
      28,
      'new28',
    ),
  ];

  // Per-bar export for combined config
  const perHeader = [
    'timestamp',
    'timestamp_iso',
    'trendDirection',
    'cvd_prod',
    'cvd_priorAvg',
    'volume',
    'exh_1h',
    'exh_ge28',
    'exh_ge55',
    'structure',
    'gate_baseline',
    'gate_exh_only',
    'gate_combined',
    'conf_baseline',
    'conf_exh_only',
    'conf_combined',
  ].join(',');

  const perBody = bars
    .map((b) => {
      const exh28 = b.exh_1h >= 28;
      const exh55 = b.exh_1h >= 55;
      const gate = (cvd: boolean, exh: boolean) =>
        (cvd ? 1 : 0) + (b.volume ? 1 : 0) + (exh ? 1 : 0) + (b.structure ? 1 : 0) >= 3;
      const confB = confidence(
        b.cvd_prod,
        b.volume,
        exh55,
        b.structure,
        b.cvdLast3,
        b.volumeRatio,
        b.exh_1h,
        'old55',
      );
      const confE = confidence(
        b.cvd_prod,
        b.volume,
        exh28,
        b.structure,
        b.cvdLast3,
        b.volumeRatio,
        b.exh_1h,
        'new28',
      );
      const confC = confidence(
        b.cvd_priorAvg,
        b.volume,
        exh28,
        b.structure,
        b.cvdLast3,
        b.volumeRatio,
        b.exh_1h,
        'new28',
      );
      return [
        b.timestamp,
        b.timestamp_iso,
        b.trendDirection,
        b.cvd_prod ? 1 : 0,
        b.cvd_priorAvg ? 1 : 0,
        b.volume ? 1 : 0,
        b.exh_1h,
        exh28 ? 1 : 0,
        exh55 ? 1 : 0,
        b.structure ? 1 : 0,
        gate(b.cvd_prod, exh55) ? 1 : 0,
        gate(b.cvd_prod, exh28) ? 1 : 0,
        gate(b.cvd_priorAvg, exh28) ? 1 : 0,
        confB.toFixed(4),
        confE.toFixed(4),
        confC.toFixed(4),
      ].join(',');
    })
    .join('\n');
  fs.writeFileSync(OUT_PER_BAR, `${perHeader}\n${perBody}\n`, 'utf8');

  const csvHeader = [
    'config',
    'signal_gate',
    ...CONF_THRESHOLDS.map((t) => `conf_ge_${t}`),
    'cvd_pass',
    'vol_pass',
    'exh_pass',
    'structure_pass',
  ].join(',');
  const csvBody = configs
    .map((c) =>
      [
        c.id,
        c.signal_gate,
        ...CONF_THRESHOLDS.map((t) => c.conf_at[t]),
        c.per_signal.cvd,
        c.per_signal.vol,
        c.per_signal.exh,
        c.per_signal.structure,
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(OUT_CSV, `${csvHeader}\n${csvBody}\n`, 'utf8');

  const summary = {
    symbol: SYMBOL,
    n,
    n_nonNeutral: directed.length,
    note: 'CVD priorAvg_vs_c is experiment-only — NOT applied to production. Exhaustion MIN=28 already in production.',
    configs,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md: string[] = [];
  md.push('# REPORT — V4.1 Combined Exhaustion + CVD priorAvg_vs_c recalc (NEAR 30d)');
  md.push('');
  md.push('**Date:** 2026-08-01');
  md.push(
    '**Scope:** V4.1 — tính số liệu thử nghiệm; **không** áp CVD priorAvg_vs_c vào production; **không** chọn ngưỡng confidence',
  );
  md.push(`**n:** ${n} · non-neutral: ${directed.length}`);
  md.push('');
  md.push('## Cấu hình');
  md.push('');
  md.push('| Config | CVD Flip | Exhaustion | scoreExhaustion |');
  md.push('|--------|----------|------------|-----------------|');
  md.push('| Baseline gốc | production `++-`/`--+` | ≥55 | `(exh−55)/45` |');
  md.push('| Chỉ sửa Exhaustion | production | ≥28 | `(exh−28)/(100−28)` |');
  md.push('| **Combined (MỚI)** | **priorAvg_vs_c** | ≥28 | `(exh−28)/(100−28)` |');
  md.push('');
  md.push('Volume + Structure: giữ nguyên detector production.');
  md.push('');
  md.push('## Per-signal pass (n=179)');
  md.push('');
  md.push('| Config | CVD | Volume | Exhaustion | Structure |');
  md.push('|--------|-----|--------|------------|-----------|');
  for (const c of configs) {
    md.push(
      `| ${c.label} | ${c.per_signal.cvd} | ${c.per_signal.vol} | ${c.per_signal.exh} | ${c.per_signal.structure} |`,
    );
  }
  md.push('');
  md.push('## Bảng tổng hợp: signal-gate ≥3/4 ∩ confidenceTR');
  md.push('');
  md.push(
    '| Cấu hình | Signal-gate pass (n=179) | + confidenceTR≥30 | ≥35 | ≥40 | ≥45 | ≥50 | ≥55 | ≥60 | ≥70 |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const c of configs) {
    const short =
      c.id === 'baseline_original'
        ? 'Baseline gốc (chưa sửa gì)'
        : c.id === 'exhaustion_only'
          ? 'Chỉ sửa Exhaustion'
          : 'Sửa Exhaustion + CVD priorAvg_vs_c (MỚI)';
    md.push(
      `| ${short} | ${c.signal_gate} (${pct(c.signal_gate, n)}) | ${CONF_THRESHOLDS.map((t) => c.conf_at[t]).join(' | ')} |`,
    );
  }
  md.push('');
  md.push('## Quan sát (không phải khuyến nghị)');
  md.push('');
  md.push(
    '- Cột “+ confidenceTR≥X” = số nến đạt **cả** ≥3/4 signal-gate **và** confidenceTR≥X (công thức thật theo config).',
  );
  md.push(
    '- CVD priorAvg_vs_c chỉ trong script — production vẫn dùng `detectCvdFlip` pattern chặt.',
  );
  md.push('- Không chọn ngưỡng confidence cuối trong task này.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-combined-exhaustion-cvd-recalc-30d.csv`');
  md.push('- `docs/exports/v41-combined-exhaustion-cvd-per-bar-30d.csv`');
  md.push('- `docs/exports/v41-combined-exhaustion-cvd-recalc-30d-summary.json`');
  md.push('- `scripts/recalc-v41-combined-exhaustion-cvd-30d.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify(configs, null, 2));
  console.log(`[combined] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

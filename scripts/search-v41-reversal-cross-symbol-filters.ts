/**
 * Cross-symbol filter search on existing final-fees trades.
 * Re-enriches features at each trade timestamp (CSV lacked them), then sweeps
 * single/combo filters. Report-only — no production changes.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/search-v41-reversal-cross-symbol-filters.ts
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
  TREND_REVERSAL_EXHAUSTION_MIN,
} from '../services/v41/reversalDetector';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const COST_RT_PCT = 0.18;
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP_1H = 80;
const WARMUP_4H = 220;

const TRADES_IN = path.resolve(
  __dirname,
  '../docs/exports/v41-final-multi-symbol-fees-trades.csv',
);
const OUT_ENRICHED = path.resolve(
  __dirname,
  '../docs/exports/v41-reversal-cross-symbol-filter-trades-enriched.csv',
);
const OUT_FILTERS = path.resolve(
  __dirname,
  '../docs/exports/v41-reversal-cross-symbol-filter-results.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-reversal-cross-symbol-filter-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_REVERSAL_CROSS_SYMBOL_FILTER_SEARCH_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';
type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT' | 'NO_SL';

type RawTrade = {
  scenario: string;
  symbol: string;
  days: number;
  timestamp: number;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  confidence: number;
  outcome: Outcome;
  sl_dist_pct: number | null;
  tp1_rr: number | null;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
};

type Enriched = RawTrade & {
  trendDirection: TrendDirection;
  trendStrength: number;
  trendExhaustion_1h: number;
  volumeRatio: number;
  flipMag: number;
  structureBreak: boolean;
  structureScore: number;
  cvdFlip: boolean;
};

type FilterDef = {
  id: string;
  label: string;
  kind: 'single' | 'combo';
  pred: (t: Enriched) => boolean;
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

function cvdProxy(k: KlineV41): number {
  return k.takerBuyVolume - (k.volume - k.takerBuyVolume);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function parseTrades(csv: string): RawTrade[] {
  const lines = csv.trim().split(/\r?\n/);
  const h = lines[0]!.split(',');
  const i = (n: string) => h.indexOf(n);
  const out: RawTrade[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(',');
    const outcome = c[i('outcome')] as Outcome;
    const num = (n: string) => {
      const v = c[i(n)];
      if (v == null || v === '') return null;
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    out.push({
      scenario: c[i('scenario')]!,
      symbol: c[i('symbol')]!,
      days: Number(c[i('days')]),
      timestamp: Number(c[i('timestamp')]),
      side: c[i('side')] as Side,
      entry: Number(c[i('entry')]),
      sl: Number(c[i('sl')]),
      tp1: Number(c[i('tp1')]),
      confidence: Number(c[i('confidence')]),
      outcome,
      sl_dist_pct: num('sl_dist_pct'),
      tp1_rr: num('tp1_rr'),
      gross_r: num('gross_r'),
      fee_r: num('fee_r'),
      net_r: num('net_r'),
    });
  }
  return out;
}

async function enrich(trades: RawTrade[]): Promise<Enriched[]> {
  const bySymbol = new Map<string, RawTrade[]>();
  for (const t of trades) {
    const arr = bySymbol.get(t.symbol) ?? [];
    arr.push(t);
    bySymbol.set(t.symbol, arr);
  }

  const endMs = Date.now();
  const enriched: Enriched[] = [];

  for (const [symbol, list] of bySymbol) {
    const minTs = Math.min(...list.map((t) => t.timestamp));
    const maxTs = Math.max(...list.map((t) => t.timestamp));
    const maxDays = Math.max(...list.map((t) => t.days));
    const evalStart = endMs - maxDays * 24 * MS_1H;
    const fetchStart1h = Math.min(minTs, evalStart) - WARMUP_1H * MS_1H;
    const fetchStart4h = Math.min(minTs, evalStart) - WARMUP_4H * MS_4H;

    console.log(`[filt] enrich ${symbol} n=${list.length}…`);
    const [k1h, k4h] = await Promise.all([
      fetchKlines(symbol, '1h', fetchStart1h, maxTs + MS_4H),
      fetchKlines(symbol, '4h', fetchStart4h, maxTs + MS_4H),
    ]);

    for (const t of list) {
      const win1h = sliceUpTo(k1h, t.timestamp);
      const win4h = sliceUpTo(k4h, t.timestamp);
      const strength = calculateTrendStrength(win4h);
      const trendDirection = strength.trendDirection;
      let trendExhaustion_1h = 0;
      let volumeRatio = 0;
      let flipMag = 0;
      let structureBreak = false;
      let cvdFlip = false;

      if (trendDirection !== 'NEUTRAL' && win1h.length >= 21) {
        const cvdLast3 = win1h.slice(-3).map(cvdProxy) as [number, number, number];
        flipMag = Math.abs(cvdLast3[2]! - (cvdLast3[0]! + cvdLast3[1]!) / 2);
        cvdFlip = detectCvdFlip(win1h, trendDirection);
        volumeRatio = detectTrendReversalVolumeConfirmation(win1h).volumeRatio;
        trendExhaustion_1h = calculateTrendExhaustion(
          win1h,
          trendDirection,
        ).trendExhaustion;
        structureBreak = detectStructureBreak(win1h, trendDirection).confirmed;
      }

      enriched.push({
        ...t,
        trendDirection,
        trendStrength: strength.trendStrength,
        trendExhaustion_1h,
        volumeRatio,
        flipMag,
        structureBreak,
        structureScore: structureBreak ? 70 : 0,
        cvdFlip,
      });
    }
  }
  return enriched;
}

type ScenarioStats = {
  scenario: string;
  symbol: string;
  n: number;
  n_decided: number;
  wr: number;
  expectancy_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
};

function statsFor(trades: Enriched[]): ScenarioStats[] {
  const bySc = new Map<string, Enriched[]>();
  for (const t of trades) {
    const arr = bySc.get(t.scenario) ?? [];
    arr.push(t);
    bySc.set(t.scenario, arr);
  }
  const out: ScenarioStats[] = [];
  for (const [scenario, list] of [...bySc.entries()].sort()) {
    const decided = list.filter(
      (t) => t.net_r != null && (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
    );
    const wins = decided.filter((t) => t.outcome === 'TP').length;
    const wr = decided.length ? (wins / decided.length) * 100 : NaN;
    const e = mean(decided.map((t) => t.net_r!));
    let sign: ScenarioStats['sign'] = 'n/a';
    if (Number.isFinite(e)) {
      if (e > 1e-9) sign = 'positive';
      else if (e < -1e-9) sign = 'negative';
      else sign = 'flat';
    }
    out.push({
      scenario,
      symbol: list[0]!.symbol,
      n: list.length,
      n_decided: decided.length,
      wr,
      expectancy_r_after: e,
      sign,
    });
  }
  return out;
}

function pooledExpectancy(trades: Enriched[]): number {
  const decided = trades.filter(
    (t) => t.net_r != null && (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  return mean(decided.map((t) => t.net_r!));
}

function fmt(x: number, d = 3): string {
  return Number.isFinite(x) ? x.toFixed(d) : 'n/a';
}

async function main(): Promise<void> {
  const raw = parseTrades(fs.readFileSync(TRADES_IN, 'utf8'));
  console.log(`[filt] loaded ${raw.length} trades from fees CSV`);
  const enriched = await enrich(raw);
  console.log(`[filt] enriched ${enriched.length}`);

  // Persist enriched
  const enrichCsv = [
    'scenario,symbol,days,timestamp,side,outcome,confidence,sl_dist_pct,net_r,trendStrength,trendExhaustion_1h,volumeRatio,flipMag,structureBreak,structureScore,cvdFlip',
    ...enriched.map((t) =>
      [
        t.scenario,
        t.symbol,
        t.days,
        t.timestamp,
        t.side,
        t.outcome,
        t.confidence.toFixed(4),
        t.sl_dist_pct != null ? t.sl_dist_pct.toFixed(4) : '',
        t.net_r != null ? t.net_r.toFixed(4) : '',
        t.trendStrength.toFixed(2),
        t.trendExhaustion_1h.toFixed(2),
        t.volumeRatio.toFixed(4),
        t.flipMag.toFixed(4),
        t.structureBreak ? 1 : 0,
        t.structureScore,
        t.cvdFlip ? 1 : 0,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_ENRICHED, enrichCsv + '\n', 'utf8');

  // Percentiles on decided trades with finite features
  const decided = enriched.filter(
    (t) => t.net_r != null && (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
  const exh = decided.map((t) => t.trendExhaustion_1h).sort((a, b) => a - b);
  const flip = decided.map((t) => t.flipMag).sort((a, b) => a - b);
  const sl = decided
    .map((t) => t.sl_dist_pct)
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);
  const conf = decided.map((t) => t.confidence).sort((a, b) => a - b);
  const ts = decided.map((t) => t.trendStrength).sort((a, b) => a - b);

  const p = {
    exh_p25: percentile(exh, 0.25),
    exh_p50: percentile(exh, 0.5),
    exh_p75: percentile(exh, 0.75),
    flip_p50: percentile(flip, 0.5),
    flip_p75: percentile(flip, 0.75),
    sl_p25: percentile(sl, 0.25),
    sl_p50: percentile(sl, 0.5),
    sl_p75: percentile(sl, 0.75),
    conf_p50: percentile(conf, 0.5),
    conf_p75: percentile(conf, 0.75),
    ts_p50: percentile(ts, 0.5),
  };

  const filters: FilterDef[] = [
    { id: 'baseline', label: 'Baseline (no filter)', kind: 'single', pred: () => true },
    { id: 'long_only', label: 'side=LONG', kind: 'single', pred: (t) => t.side === 'LONG' },
    { id: 'short_only', label: 'side=SHORT', kind: 'single', pred: (t) => t.side === 'SHORT' },
    {
      id: 'exh_lt_p25',
      label: `exh_1h < p25 (${fmt(p.exh_p25, 1)})`,
      kind: 'single',
      pred: (t) => t.trendExhaustion_1h < p.exh_p25,
    },
    {
      id: 'exh_lt_p50',
      label: `exh_1h < p50 (${fmt(p.exh_p50, 1)})`,
      kind: 'single',
      pred: (t) => t.trendExhaustion_1h < p.exh_p50,
    },
    {
      id: 'exh_ge_p75',
      label: `exh_1h ≥ p75 (${fmt(p.exh_p75, 1)})`,
      kind: 'single',
      pred: (t) => t.trendExhaustion_1h >= p.exh_p75,
    },
    {
      id: 'struct_yes',
      label: 'structureBreak=true',
      kind: 'single',
      pred: (t) => t.structureBreak,
    },
    {
      id: 'struct_no',
      label: 'structureBreak=false',
      kind: 'single',
      pred: (t) => !t.structureBreak,
    },
    {
      id: 'flip_ge_p50',
      label: `flipMag ≥ p50 (${fmt(p.flip_p50, 2)})`,
      kind: 'single',
      pred: (t) => t.flipMag >= p.flip_p50,
    },
    {
      id: 'flip_ge_p75',
      label: `flipMag ≥ p75 (${fmt(p.flip_p75, 2)})`,
      kind: 'single',
      pred: (t) => t.flipMag >= p.flip_p75,
    },
    {
      id: 'sl_lt_p50',
      label: `sl_dist% < p50 (${fmt(p.sl_p50, 2)})`,
      kind: 'single',
      pred: (t) => t.sl_dist_pct != null && t.sl_dist_pct < p.sl_p50,
    },
    {
      id: 'sl_ge_p50',
      label: `sl_dist% ≥ p50 (${fmt(p.sl_p50, 2)})`,
      kind: 'single',
      pred: (t) => t.sl_dist_pct != null && t.sl_dist_pct >= p.sl_p50,
    },
    {
      id: 'sl_ge_p75',
      label: `sl_dist% ≥ p75 (${fmt(p.sl_p75, 2)})`,
      kind: 'single',
      pred: (t) => t.sl_dist_pct != null && t.sl_dist_pct >= p.sl_p75,
    },
    {
      id: 'conf_ge_p75',
      label: `confidence ≥ p75 (${fmt(p.conf_p75, 1)})`,
      kind: 'single',
      pred: (t) => t.confidence >= p.conf_p75,
    },
    {
      id: 'ts_lt_p50',
      label: `trendStrength < p50 (${fmt(p.ts_p50, 1)})`,
      kind: 'single',
      pred: (t) => t.trendStrength < p.ts_p50,
    },
    // Combos inspired by prior NEAR hint: LONG + low exhaustion
    {
      id: 'long_exh_lt_p50',
      label: `LONG + exh < p50 (${fmt(p.exh_p50, 1)})`,
      kind: 'combo',
      pred: (t) => t.side === 'LONG' && t.trendExhaustion_1h < p.exh_p50,
    },
    {
      id: 'long_exh_lt_p25',
      label: `LONG + exh < p25 (${fmt(p.exh_p25, 1)})`,
      kind: 'combo',
      pred: (t) => t.side === 'LONG' && t.trendExhaustion_1h < p.exh_p25,
    },
    {
      id: 'long_struct',
      label: 'LONG + structureBreak',
      kind: 'combo',
      pred: (t) => t.side === 'LONG' && t.structureBreak,
    },
    {
      id: 'long_sl_ge_p50',
      label: `LONG + sl_dist% ≥ p50 (${fmt(p.sl_p50, 2)})`,
      kind: 'combo',
      pred: (t) =>
        t.side === 'LONG' && t.sl_dist_pct != null && t.sl_dist_pct >= p.sl_p50,
    },
  ];

  const SCENARIO_ORDER = [
    'NEAR-180d',
    'NEAR-365d',
    'SOL-180d',
    'ETH-180d',
    'ETH-365d',
    'BNB-180d',
    'DOGE-180d',
  ];

  type FilterRow = {
    filter_id: string;
    label: string;
    kind: string;
    n_pooled: number;
    n_decided_pooled: number;
    e_r_pooled: number;
    n_pos_scenarios: number;
    n_neg_scenarios: number;
    n_thin_scenarios: number; // n_decided < 10
    consistent_candidate: boolean; // ≥5/7 positive OR flat, and not too thin overall
    per_scenario: ScenarioStats[];
  };

  const rows: FilterRow[] = [];
  for (const f of filters) {
    const subset = enriched.filter(f.pred);
    const per = statsFor(subset);
    // ensure all scenarios appear (even empty)
    const perFull = SCENARIO_ORDER.map((sc) => {
      const found = per.find((x) => x.scenario === sc);
      if (found) return found;
      return {
        scenario: sc,
        symbol: sc.split('-')[0] + 'USDT',
        n: 0,
        n_decided: 0,
        wr: NaN,
        expectancy_r_after: NaN,
        sign: 'n/a' as const,
      };
    });
    const n_pos = perFull.filter((x) => x.sign === 'positive').length;
    const n_neg = perFull.filter((x) => x.sign === 'negative').length;
    const n_thin = perFull.filter((x) => x.n_decided < 10).length;
    const e_pooled = pooledExpectancy(subset);
    // Candidate: ≥5/7 scenarios with positive E[R] after fees, and pooled n_decided decent
    const n_decided_pooled = subset.filter(
      (t) => t.net_r != null && (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
    ).length;
    const consistent_candidate =
      n_pos >= 5 && n_decided_pooled >= 30 && n_thin <= 3;

    rows.push({
      filter_id: f.id,
      label: f.label,
      kind: f.kind,
      n_pooled: subset.length,
      n_decided_pooled,
      e_r_pooled: e_pooled,
      n_pos_scenarios: n_pos,
      n_neg_scenarios: n_neg,
      n_thin_scenarios: n_thin,
      consistent_candidate,
      per_scenario: perFull,
    });
  }

  // CSV wide
  const filterCsvHeader = [
    'filter_id',
    'label',
    'kind',
    'n_pooled',
    'n_decided_pooled',
    'e_r_pooled',
    'n_pos_scenarios',
    'n_neg_scenarios',
    'n_thin_lt10',
    'consistent_candidate',
    ...SCENARIO_ORDER.flatMap((sc) => [
      `${sc}_n`,
      `${sc}_e_r`,
      `${sc}_sign`,
    ]),
  ].join(',');
  const filterCsvBody = rows
    .map((r) => {
      const cells = [
        r.filter_id,
        `"${r.label}"`,
        r.kind,
        r.n_pooled,
        r.n_decided_pooled,
        fmt(r.e_r_pooled, 4),
        r.n_pos_scenarios,
        r.n_neg_scenarios,
        r.n_thin_scenarios,
        r.consistent_candidate ? 1 : 0,
      ];
      for (const sc of SCENARIO_ORDER) {
        const s = r.per_scenario.find((x) => x.scenario === sc)!;
        cells.push(s.n_decided, fmt(s.expectancy_r_after, 4), s.sign);
      }
      return cells.join(',');
    })
    .join('\n');
  fs.writeFileSync(OUT_FILTERS, filterCsvHeader + '\n' + filterCsvBody + '\n', 'utf8');

  const candidates = rows.filter((r) => r.consistent_candidate);
  const summary = {
    date: DATE,
    cost_rt_pct: COST_RT_PCT,
    n_trades: enriched.length,
    percentiles: p,
    candidate_rule:
      'consistent_candidate = n_pos_scenarios≥5 AND n_decided_pooled≥30 AND n_thin(n_decided<10)≤3',
    n_candidates: candidates.length,
    candidates: candidates.map((c) => ({
      id: c.filter_id,
      label: c.label,
      e_r_pooled: c.e_r_pooled,
      n_pos: c.n_pos_scenarios,
      n_neg: c.n_neg_scenarios,
    })),
    filters: rows.map(({ per_scenario, ...rest }) => ({
      ...rest,
      per_scenario,
    })),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  // Markdown
  const md: string[] = [];
  md.push('# REPORT — Cross-symbol reversal filter search');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Scope:** Report-only — enrich features trên trades đã có; **không** đổi production / không chọn filter áp dụng',
  );
  md.push('');
  md.push('## Setup');
  md.push('');
  md.push(`- Input: \`v41-final-multi-symbol-fees-trades.csv\` (${raw.length} trades, 7 scenarios)`);
  md.push(
    '- Enrich tại timestamp: trendStrength, trendExhaustion_1h, volumeRatio, flipMag, structureBreak/Score, cvdFlip',
  );
  md.push(`- Cost: net_r đã trừ ${COST_RT_PCT}% RT (từ backtest fees trước)`);
  md.push(
    '- Ngưỡng filter từ **percentile dataset gộp** (decided trades), không đoán số cứng',
  );
  md.push(
    '- Ứng viên thật: **≥5/7** scenario có E[R] sau phí **positive**, n_decided pooled ≥30, ≤3 scenario quá mỏng (n&lt;10)',
  );
  md.push('');
  md.push('### Percentiles (pooled decided)');
  md.push('');
  md.push('| Feature | p25 | p50 | p75 |');
  md.push('|---|---|---|---|');
  md.push(
    `| exh_1h | ${fmt(p.exh_p25, 1)} | ${fmt(p.exh_p50, 1)} | ${fmt(p.exh_p75, 1)} |`,
  );
  md.push(
    `| flipMag | — | ${fmt(p.flip_p50, 2)} | ${fmt(p.flip_p75, 2)} |`,
  );
  md.push(
    `| sl_dist% | ${fmt(p.sl_p25, 2)} | ${fmt(p.sl_p50, 2)} | ${fmt(p.sl_p75, 2)} |`,
  );
  md.push(
    `| confidence | — | ${fmt(p.conf_p50, 1)} | ${fmt(p.conf_p75, 1)} |`,
  );
  md.push(`| trendStrength | — | ${fmt(p.ts_p50, 1)} | — |`);
  md.push('');

  md.push('## Bảng filter — E[R] sau phí theo scenario');
  md.push('');
  md.push(
    '| Filter | n_dec | E pooled | +/−/thin | ' +
      SCENARIO_ORDER.map((s) => s.replace('-', ' ')).join(' | ') +
      ' | Candidate? |',
  );
  md.push(
    '|---|---|---|---|' + SCENARIO_ORDER.map(() => '---').join('|') + '|---|',
  );
  for (const r of rows) {
    const cells = r.per_scenario.map(
      (s) => `${fmt(s.expectancy_r_after, 2)} (n=${s.n_decided})`,
    );
    md.push(
      `| ${r.label} | ${r.n_decided_pooled} | ${fmt(r.e_r_pooled, 3)} | ${r.n_pos_scenarios}/${r.n_neg_scenarios}/${r.n_thin_scenarios} | ${cells.join(' | ')} | ${r.consistent_candidate ? 'YES' : 'no'} |`,
    );
  }
  md.push('');

  md.push('## Overfit check — filter dương khi gộp nhưng lệch symbol');
  md.push('');
  const pooledPosButSkewed = rows.filter(
    (r) =>
      r.filter_id !== 'baseline' &&
      Number.isFinite(r.e_r_pooled) &&
      r.e_r_pooled > 0 &&
      r.n_pos_scenarios < 5,
  );
  if (!pooledPosButSkewed.length) {
    md.push(
      '- Không có filter nào E[R] pooled > 0 mà đồng thời <5/7 symbol dương (ngoài baseline nếu có).',
    );
  } else {
    for (const r of pooledPosButSkewed) {
      const posList = r.per_scenario
        .filter((s) => s.sign === 'positive')
        .map((s) => s.scenario)
        .join(', ');
      md.push(
        `- **${r.label}**: E pooled=${fmt(r.e_r_pooled, 3)} nhưng chỉ **${r.n_pos_scenarios}/7** dương (${posList || '—'}) → **overfit / kéo điểm bởi ít symbol**.`,
      );
    }
  }
  md.push('');

  md.push('## Kết luận');
  md.push('');
  if (candidates.length === 0) {
    md.push(
      '**Không tìm được filter nào** thỏa “E[R] sau phí dương nhất quán ≥5/7 scenario + n đủ lớn”.',
    );
    md.push(
      'Đây là bằng chứng bổ sung củng cố việc **không dựa vào filter hẹp tìm trên 1 coin** để cứu chiến lược reversal trong mẫu đã test — edge sau phí không hiện nhất quán qua symbol.',
    );
  } else {
    md.push(`Tìm được **${candidates.length}** ứng viên nhất quán:`);
    for (const c of candidates) {
      md.push(
        `- ${c.label}: E pooled=${fmt(c.e_r_pooled, 3)}, ${c.n_pos_scenarios}/7 dương`,
      );
    }
    md.push('(Chỉ báo cáo — **không** tự áp vào production.)');
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-reversal-cross-symbol-filter-trades-enriched.csv`');
  md.push('- `docs/exports/v41-reversal-cross-symbol-filter-results.csv`');
  md.push('- `docs/exports/v41-reversal-cross-symbol-filter-summary.json`');
  md.push('- `scripts/search-v41-reversal-cross-symbol-filters.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        n: enriched.length,
        percentiles: p,
        n_candidates: candidates.length,
        top: rows
          .slice()
          .sort((a, b) => b.n_pos_scenarios - a.n_pos_scenarios || b.e_r_pooled - a.e_r_pooled)
          .slice(0, 8)
          .map((r) => ({
            id: r.filter_id,
            pos: r.n_pos_scenarios,
            neg: r.n_neg_scenarios,
            e: r.e_r_pooled,
            cand: r.consistent_candidate,
          })),
      },
      null,
      2,
    ),
  );
  console.log(`[filt] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

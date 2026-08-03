/**
 * Confirm B (retest) cross-symbol filter search.
 * Pool trades from v41-breakout-v1-multi-symbol-longer-trades.csv (confirm=retest),
 * enrich features, sweep percentile filters. Report-only.
 *
 * Candidate: ≥4/6 scenarios E[R] after fee positive, n_decided pooled ≥20, ≤2 scenarios n<8.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/search-v41-breakout-b-cross-symbol-filters.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { atrAtIndex } from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const MS_1H = 3_600_000;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP_1H = 80;

const MIN_POS_SCENARIOS = 4;
const MIN_POOLED_DECIDED = 20;
const MAX_THIN_SCENARIOS = 2;
const THIN_N = 8;

const SCENARIO_ORDER = [
  'NEAR-180d',
  'NEAR-365d',
  'SOL-180d',
  'ETH-180d',
  'BNB-180d',
  'DOGE-180d',
] as const;

const TRADES_IN = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-v1-multi-symbol-longer-trades.csv',
);
const OUT_ENRICHED = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-b-cross-symbol-filter-trades-enriched.csv',
);
const OUT_FILTERS = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-b-cross-symbol-filter-results.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-b-cross-symbol-filter-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_B_CROSS_SYMBOL_FILTER_SEARCH_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';
type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type RawTrade = {
  scenario: string;
  symbol: string;
  days: number;
  confirm_mode: string;
  breakout_open_time: number;
  active_open_time: number;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  range_high: number;
  range_low: number;
  outcome: Outcome;
  bars_held: number | null;
  sl_dist_pct: number | null;
  tp1_rr: number | null;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
};

type Enriched = RawTrade & {
  breakout_level: number;
  /** |entry − breakout_level| / level × 100 */
  retest_dist_pct: number;
  /** Hours between breakout and retest (1H bars). */
  bars_to_retest: number;
  atr_at_breakout: number | null;
  atr_pct_of_price: number | null;
  range_width_pct: number;
  vol_breakout: number | null;
  vol_retest: number | null;
  /** retest vol / breakout vol */
  vol_retest_vs_breakout: number | null;
};

type FilterDef = {
  id: string;
  label: string;
  kind: 'single' | 'combo';
  pred: (t: Enriched) => boolean;
};

type ScenarioStats = {
  scenario: string;
  n: number;
  n_decided: number;
  wr: number;
  expectancy_r_after: number;
  sign: 'positive' | 'negative' | 'flat' | 'n/a';
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
  startTime: number,
  endTime: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1h');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${symbol} 1h HTTP ${res.status}`);
    const batch = (await res.json()) as (string | number)[][];
    if (!batch.length) break;
    for (const row of batch) out.push(toKlineV41(row));
    const next = Number(batch[batch.length - 1]![0]) + MS_1H;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < BINANCE_MAX_LIMIT) break;
  }
  const by = new Map<number, KlineV41>();
  for (const k of out) by.set(k.openTime, k);
  return [...by.values()].sort((a, b) => a.openTime - b.openTime);
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
  const ix = (n: string) => h.indexOf(n);
  const out: RawTrade[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(',');
    if (c[ix('confirm_mode')] !== 'retest') continue;
    const num = (n: string) => {
      const v = c[ix(n)];
      if (v == null || v === '') return null;
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    out.push({
      scenario: c[ix('scenario')]!,
      symbol: c[ix('symbol')]!,
      days: Number(c[ix('days')]),
      confirm_mode: 'retest',
      breakout_open_time: Number(c[ix('breakout_open_time')]),
      active_open_time: Number(c[ix('active_open_time')]),
      side: c[ix('side')] as Side,
      entry: Number(c[ix('entry')]),
      sl: Number(c[ix('sl')]),
      tp1: Number(c[ix('tp1')]),
      range_high: Number(c[ix('range_high')]),
      range_low: Number(c[ix('range_low')]),
      outcome: c[ix('outcome')] as Outcome,
      bars_held: num('bars_held'),
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

  const enriched: Enriched[] = [];
  for (const [symbol, list] of bySymbol) {
    const minTs = Math.min(...list.map((t) => t.breakout_open_time));
    const maxTs = Math.max(...list.map((t) => t.active_open_time));
    const fetchStart = minTs - WARMUP_1H * MS_1H;
    console.log(`[b-filt] enrich ${symbol} n=${list.length}…`);
    const k1h = await fetchKlines(symbol, fetchStart, maxTs + MS_1H);
    const idxByOpen = new Map(k1h.map((k, i) => [k.openTime, i]));

    for (const t of list) {
      const level = t.side === 'LONG' ? t.range_high : t.range_low;
      const retest_dist_pct =
        level > 0 ? (Math.abs(t.entry - level) / level) * 100 : NaN;
      const bars_to_retest = Math.max(
        0,
        Math.round((t.active_open_time - t.breakout_open_time) / MS_1H),
      );
      const range_width_pct =
        t.range_low > 0
          ? ((t.range_high - t.range_low) / t.range_low) * 100
          : NaN;

      const bi = idxByOpen.get(t.breakout_open_time);
      const ri = idxByOpen.get(t.active_open_time);
      let atr_at_breakout: number | null = null;
      let atr_pct_of_price: number | null = null;
      let vol_breakout: number | null = null;
      let vol_retest: number | null = null;
      let vol_retest_vs_breakout: number | null = null;

      if (bi != null) {
        atr_at_breakout = atrAtIndex(k1h, bi);
        const px = k1h[bi]!.close;
        if (atr_at_breakout != null && px > 0) {
          atr_pct_of_price = (atr_at_breakout / px) * 100;
        }
        vol_breakout = k1h[bi]!.volume;
      }
      if (ri != null) {
        vol_retest = k1h[ri]!.volume;
      }
      if (
        vol_breakout != null &&
        vol_retest != null &&
        vol_breakout > 0 &&
        Number.isFinite(vol_retest)
      ) {
        vol_retest_vs_breakout = vol_retest / vol_breakout;
      }

      enriched.push({
        ...t,
        breakout_level: level,
        retest_dist_pct,
        bars_to_retest,
        atr_at_breakout,
        atr_pct_of_price,
        range_width_pct,
        vol_breakout,
        vol_retest,
        vol_retest_vs_breakout,
      });
    }
  }
  return enriched;
}

function decidedOf(trades: Enriched[]): Enriched[] {
  return trades.filter(
    (t) =>
      t.net_r != null &&
      (t.outcome === 'TP' || t.outcome === 'SL' || t.outcome === 'BOTH'),
  );
}

function statsFor(trades: Enriched[]): ScenarioStats[] {
  const bySc = new Map<string, Enriched[]>();
  for (const t of trades) {
    const arr = bySc.get(t.scenario) ?? [];
    arr.push(t);
    bySc.set(t.scenario, arr);
  }
  const out: ScenarioStats[] = [];
  for (const scenario of SCENARIO_ORDER) {
    const list = bySc.get(scenario) ?? [];
    const decided = decidedOf(list);
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
      n: list.length,
      n_decided: decided.length,
      wr,
      expectancy_r_after: e,
      sign,
    });
  }
  return out;
}

function fmt(x: number, d = 3): string {
  return Number.isFinite(x) ? x.toFixed(d) : 'n/a';
}

function cell(s: ScenarioStats): string {
  if (s.n_decided === 0) return `n/a (n=0)`;
  return `${fmt(s.expectancy_r_after, 2)} (n=${s.n_decided})`;
}

async function main(): Promise<void> {
  const raw = parseTrades(fs.readFileSync(TRADES_IN, 'utf8'));
  console.log(`[b-filt] loaded ${raw.length} Confirm-B trades`);
  const bySc0 = new Map<string, number>();
  for (const t of raw) bySc0.set(t.scenario, (bySc0.get(t.scenario) ?? 0) + 1);
  console.log('[b-filt] per scenario:', Object.fromEntries(bySc0));

  const enriched = await enrich(raw);
  console.log(`[b-filt] enriched ${enriched.length}`);

  const decidedAll = decidedOf(enriched);
  const feat = (getter: (t: Enriched) => number | null | undefined) => {
    const xs = decidedAll
      .map(getter)
      .filter((x): x is number => x != null && Number.isFinite(x))
      .sort((a, b) => a - b);
    return {
      p25: percentile(xs, 0.25),
      p50: percentile(xs, 0.5),
      p75: percentile(xs, 0.75),
      n: xs.length,
    };
  };

  const p_sl = feat((t) => t.sl_dist_pct);
  const p_retestDist = feat((t) => t.retest_dist_pct);
  const p_bars = feat((t) => t.bars_to_retest);
  const p_atrPct = feat((t) => t.atr_pct_of_price);
  const p_width = feat((t) => t.range_width_pct);
  const p_volRatio = feat((t) => t.vol_retest_vs_breakout);

  const filters: FilterDef[] = [
    { id: 'baseline', label: 'Baseline (no filter)', kind: 'single', pred: () => true },
    { id: 'side_LONG', label: 'side=LONG', kind: 'single', pred: (t) => t.side === 'LONG' },
    { id: 'side_SHORT', label: 'side=SHORT', kind: 'single', pred: (t) => t.side === 'SHORT' },
    {
      id: 'sl_lt_p50',
      label: `sl_dist% < p50 (${fmt(p_sl.p50, 2)})`,
      kind: 'single',
      pred: (t) => t.sl_dist_pct != null && t.sl_dist_pct < p_sl.p50,
    },
    {
      id: 'sl_ge_p50',
      label: `sl_dist% ≥ p50 (${fmt(p_sl.p50, 2)})`,
      kind: 'single',
      pred: (t) => t.sl_dist_pct != null && t.sl_dist_pct >= p_sl.p50,
    },
    {
      id: 'sl_ge_p75',
      label: `sl_dist% ≥ p75 (${fmt(p_sl.p75, 2)})`,
      kind: 'single',
      pred: (t) => t.sl_dist_pct != null && t.sl_dist_pct >= p_sl.p75,
    },
    {
      id: 'retest_dist_lt_p50',
      label: `retest_dist% < p50 (${fmt(p_retestDist.p50, 2)})`,
      kind: 'single',
      pred: (t) => Number.isFinite(t.retest_dist_pct) && t.retest_dist_pct < p_retestDist.p50,
    },
    {
      id: 'retest_dist_lt_p25',
      label: `retest_dist% < p25 (${fmt(p_retestDist.p25, 2)})`,
      kind: 'single',
      pred: (t) => Number.isFinite(t.retest_dist_pct) && t.retest_dist_pct < p_retestDist.p25,
    },
    {
      id: 'bars_le_p50',
      label: `bars_to_retest ≤ p50 (${fmt(p_bars.p50, 0)})`,
      kind: 'single',
      pred: (t) => t.bars_to_retest <= p_bars.p50,
    },
    {
      id: 'bars_le_p25',
      label: `bars_to_retest ≤ p25 (${fmt(p_bars.p25, 0)})`,
      kind: 'single',
      pred: (t) => t.bars_to_retest <= p_bars.p25,
    },
    {
      id: 'bars_ge_p75',
      label: `bars_to_retest ≥ p75 (${fmt(p_bars.p75, 0)})`,
      kind: 'single',
      pred: (t) => t.bars_to_retest >= p_bars.p75,
    },
    {
      id: 'atr_pct_lt_p50',
      label: `atr% < p50 (${fmt(p_atrPct.p50, 2)})`,
      kind: 'single',
      pred: (t) => t.atr_pct_of_price != null && t.atr_pct_of_price < p_atrPct.p50,
    },
    {
      id: 'atr_pct_ge_p50',
      label: `atr% ≥ p50 (${fmt(p_atrPct.p50, 2)})`,
      kind: 'single',
      pred: (t) => t.atr_pct_of_price != null && t.atr_pct_of_price >= p_atrPct.p50,
    },
    {
      id: 'width_lt_p50',
      label: `range_width% < p50 (${fmt(p_width.p50, 2)})`,
      kind: 'single',
      pred: (t) => Number.isFinite(t.range_width_pct) && t.range_width_pct < p_width.p50,
    },
    {
      id: 'width_ge_p50',
      label: `range_width% ≥ p50 (${fmt(p_width.p50, 2)})`,
      kind: 'single',
      pred: (t) => Number.isFinite(t.range_width_pct) && t.range_width_pct >= p_width.p50,
    },
    {
      id: 'vol_ratio_ge_p50',
      label: `vol_retest/break ≥ p50 (${fmt(p_volRatio.p50, 2)})`,
      kind: 'single',
      pred: (t) =>
        t.vol_retest_vs_breakout != null && t.vol_retest_vs_breakout >= p_volRatio.p50,
    },
    {
      id: 'vol_ratio_ge_p75',
      label: `vol_retest/break ≥ p75 (${fmt(p_volRatio.p75, 2)})`,
      kind: 'single',
      pred: (t) =>
        t.vol_retest_vs_breakout != null && t.vol_retest_vs_breakout >= p_volRatio.p75,
    },
    {
      id: 'vol_ratio_lt_p50',
      label: `vol_retest/break < p50 (${fmt(p_volRatio.p50, 2)})`,
      kind: 'single',
      pred: (t) =>
        t.vol_retest_vs_breakout != null && t.vol_retest_vs_breakout < p_volRatio.p50,
    },
    // Combos
    {
      id: 'LONG_sl_ge_p50',
      label: `LONG + sl_dist% ≥ p50 (${fmt(p_sl.p50, 2)})`,
      kind: 'combo',
      pred: (t) =>
        t.side === 'LONG' && t.sl_dist_pct != null && t.sl_dist_pct >= p_sl.p50,
    },
    {
      id: 'LONG_retest_dist_lt_p50',
      label: `LONG + retest_dist% < p50 (${fmt(p_retestDist.p50, 2)})`,
      kind: 'combo',
      pred: (t) =>
        t.side === 'LONG' &&
        Number.isFinite(t.retest_dist_pct) &&
        t.retest_dist_pct < p_retestDist.p50,
    },
    {
      id: 'bars_le_p50_sl_ge_p50',
      label: `bars≤p50 + sl%≥p50`,
      kind: 'combo',
      pred: (t) =>
        t.bars_to_retest <= p_bars.p50 &&
        t.sl_dist_pct != null &&
        t.sl_dist_pct >= p_sl.p50,
    },
    {
      id: 'retest_dist_lt_p50_vol_ge_p50',
      label: `retest_dist<p50 + vol_ratio≥p50`,
      kind: 'combo',
      pred: (t) =>
        Number.isFinite(t.retest_dist_pct) &&
        t.retest_dist_pct < p_retestDist.p50 &&
        t.vol_retest_vs_breakout != null &&
        t.vol_retest_vs_breakout >= p_volRatio.p50,
    },
    {
      id: 'width_lt_p50_bars_le_p50',
      label: `width%<p50 + bars≤p50`,
      kind: 'combo',
      pred: (t) =>
        Number.isFinite(t.range_width_pct) &&
        t.range_width_pct < p_width.p50 &&
        t.bars_to_retest <= p_bars.p50,
    },
    {
      id: 'SHORT_bars_le_p50',
      label: `SHORT + bars≤p50 (${fmt(p_bars.p50, 0)})`,
      kind: 'combo',
      pred: (t) => t.side === 'SHORT' && t.bars_to_retest <= p_bars.p50,
    },
    {
      id: 'atr_lt_p50_retest_dist_lt_p50',
      label: `atr%<p50 + retest_dist%<p50`,
      kind: 'combo',
      pred: (t) =>
        t.atr_pct_of_price != null &&
        t.atr_pct_of_price < p_atrPct.p50 &&
        Number.isFinite(t.retest_dist_pct) &&
        t.retest_dist_pct < p_retestDist.p50,
    },
  ];

  type FilterResult = {
    filter_id: string;
    label: string;
    kind: string;
    n_pooled: number;
    n_decided_pooled: number;
    e_r_pooled: number;
    n_pos_scenarios: number;
    n_neg_scenarios: number;
    n_thin_lt8: number;
    consistent_candidate: boolean;
    per_scenario: ScenarioStats[];
  };

  const results: FilterResult[] = [];
  for (const f of filters) {
    const kept = enriched.filter(f.pred);
    const decided = decidedOf(kept);
    const per = statsFor(kept);
    // Ensure all 6 scenarios present even if empty
    const perFull = SCENARIO_ORDER.map((sc) => {
      const found = per.find((s) => s.scenario === sc);
      return (
        found ?? {
          scenario: sc,
          n: 0,
          n_decided: 0,
          wr: NaN,
          expectancy_r_after: NaN,
          sign: 'n/a' as const,
        }
      );
    });
    const n_pos = perFull.filter((s) => s.sign === 'positive').length;
    const n_neg = perFull.filter((s) => s.sign === 'negative').length;
    const n_thin = perFull.filter((s) => s.n_decided < THIN_N).length;
    const e_pooled = mean(decided.map((t) => t.net_r!));
    const candidate =
      n_pos >= MIN_POS_SCENARIOS &&
      decided.length >= MIN_POOLED_DECIDED &&
      n_thin <= MAX_THIN_SCENARIOS;

    results.push({
      filter_id: f.id,
      label: f.label,
      kind: f.kind,
      n_pooled: kept.length,
      n_decided_pooled: decided.length,
      e_r_pooled: e_pooled,
      n_pos_scenarios: n_pos,
      n_neg_scenarios: n_neg,
      n_thin_lt8: n_thin,
      consistent_candidate: candidate,
      per_scenario: perFull,
    });
    console.log(
      `[b-filt] ${f.id} n_dec=${decided.length} E=${fmt(e_pooled)} +/−/thin=${n_pos}/${n_neg}/${n_thin} cand=${candidate}`,
    );
  }

  // Enriched CSV
  const enrichHeader =
    'scenario,symbol,days,breakout_open_time,active_open_time,side,outcome,entry,sl,tp1,range_high,range_low,sl_dist_pct,net_r,breakout_level,retest_dist_pct,bars_to_retest,atr_at_breakout,atr_pct_of_price,range_width_pct,vol_breakout,vol_retest,vol_retest_vs_breakout';
  const enrichLines = enriched.map((t) =>
    [
      t.scenario,
      t.symbol,
      t.days,
      t.breakout_open_time,
      t.active_open_time,
      t.side,
      t.outcome,
      t.entry,
      t.sl,
      t.tp1,
      t.range_high,
      t.range_low,
      t.sl_dist_pct != null ? t.sl_dist_pct.toFixed(4) : '',
      t.net_r != null ? t.net_r.toFixed(4) : '',
      t.breakout_level.toFixed(6),
      t.retest_dist_pct.toFixed(4),
      t.bars_to_retest,
      t.atr_at_breakout != null ? t.atr_at_breakout.toFixed(6) : '',
      t.atr_pct_of_price != null ? t.atr_pct_of_price.toFixed(4) : '',
      t.range_width_pct.toFixed(4),
      t.vol_breakout != null ? t.vol_breakout.toFixed(4) : '',
      t.vol_retest != null ? t.vol_retest.toFixed(4) : '',
      t.vol_retest_vs_breakout != null ? t.vol_retest_vs_breakout.toFixed(4) : '',
    ].join(','),
  );
  fs.writeFileSync(OUT_ENRICHED, [enrichHeader, ...enrichLines].join('\n') + '\n', 'utf8');

  // Filter results CSV
  const filtHeader = [
    'filter_id',
    'label',
    'kind',
    'n_pooled',
    'n_decided_pooled',
    'e_r_pooled',
    'n_pos_scenarios',
    'n_neg_scenarios',
    'n_thin_lt8',
    'consistent_candidate',
    ...SCENARIO_ORDER.flatMap((sc) => [`${sc}_n`, `${sc}_e_r`, `${sc}_sign`]),
  ].join(',');
  const filtLines = results.map((r) => {
    const cells = SCENARIO_ORDER.flatMap((sc) => {
      const s = r.per_scenario.find((x) => x.scenario === sc)!;
      return [
        String(s.n_decided),
        Number.isFinite(s.expectancy_r_after) ? s.expectancy_r_after.toFixed(4) : '',
        s.sign,
      ];
    });
    return [
      r.filter_id,
      JSON.stringify(r.label),
      r.kind,
      r.n_pooled,
      r.n_decided_pooled,
      Number.isFinite(r.e_r_pooled) ? r.e_r_pooled.toFixed(4) : '',
      r.n_pos_scenarios,
      r.n_neg_scenarios,
      r.n_thin_lt8,
      r.consistent_candidate ? 1 : 0,
      ...cells,
    ].join(',');
  });
  fs.writeFileSync(OUT_FILTERS, [filtHeader, ...filtLines].join('\n') + '\n', 'utf8');

  const candidates = results.filter((r) => r.consistent_candidate);
  const pooledPositiveButWeak = results.filter(
    (r) =>
      r.filter_id !== 'baseline' &&
      Number.isFinite(r.e_r_pooled) &&
      r.e_r_pooled > 0 &&
      r.n_pos_scenarios < MIN_POS_SCENARIOS &&
      r.n_decided_pooled >= 10,
  );

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        input: 'v41-breakout-v1-multi-symbol-longer-trades.csv (confirm=retest)',
        n_trades_b: enriched.length,
        n_decided_b: decidedAll.length,
        criteria: {
          min_pos_scenarios: MIN_POS_SCENARIOS,
          min_pooled_decided: MIN_POOLED_DECIDED,
          max_thin_scenarios: MAX_THIN_SCENARIOS,
          thin_n: THIN_N,
        },
        percentiles: {
          sl_dist_pct: p_sl,
          retest_dist_pct: p_retestDist,
          bars_to_retest: p_bars,
          atr_pct_of_price: p_atrPct,
          range_width_pct: p_width,
          vol_retest_vs_breakout: p_volRatio,
        },
        n_candidates: candidates.length,
        candidates: candidates.map((c) => c.filter_id),
        results: results.map(({ per_scenario, ...rest }) => ({
          ...rest,
          per_scenario,
        })),
      },
      null,
      2,
    ),
    'utf8',
  );

  // Markdown
  const md: string[] = [];
  md.push('# REPORT — Breakout Confirm B Cross-Symbol Filter Search');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Scope:** Report-only — Confirm B (retest) only; **không** đổi production / không chọn filter áp dụng',
  );
  md.push('');
  md.push('## Setup');
  md.push('');
  md.push(
    `- Input: \`v41-breakout-v1-multi-symbol-longer-trades.csv\` — **Confirm B only** (${enriched.length} trades, ${decidedAll.length} decided, 6 scenarios)`,
  );
  md.push(
    '- Enrich: retest_dist% (|entry−level|/level), bars_to_retest, ATR@breakout (+ atr%), range_width%, vol_retest/vol_breakout; plus existing sl_dist%, side',
  );
  md.push('- Cost: `net_r` đã trừ 0.18% RT từ backtest V1 trước');
  md.push('- Ngưỡng filter từ **percentile dataset gộp** (decided B trades)');
  md.push(
    `- Ứng viên thật: **≥${MIN_POS_SCENARIOS}/6** scenario E[R] sau phí **positive**, n_decided pooled ≥${MIN_POOLED_DECIDED}, ≤${MAX_THIN_SCENARIOS} scenario quá mỏng (n&lt;${THIN_N})`,
  );
  md.push('');
  md.push('### Percentiles (pooled decided B)');
  md.push('');
  md.push('| Feature | p25 | p50 | p75 |');
  md.push('|---|---|---|---|');
  md.push(`| sl_dist% | ${fmt(p_sl.p25, 2)} | ${fmt(p_sl.p50, 2)} | ${fmt(p_sl.p75, 2)} |`);
  md.push(
    `| retest_dist% | ${fmt(p_retestDist.p25, 2)} | ${fmt(p_retestDist.p50, 2)} | ${fmt(p_retestDist.p75, 2)} |`,
  );
  md.push(`| bars_to_retest | ${fmt(p_bars.p25, 0)} | ${fmt(p_bars.p50, 0)} | ${fmt(p_bars.p75, 0)} |`);
  md.push(
    `| atr% of price | ${fmt(p_atrPct.p25, 2)} | ${fmt(p_atrPct.p50, 2)} | ${fmt(p_atrPct.p75, 2)} |`,
  );
  md.push(
    `| range_width% | ${fmt(p_width.p25, 2)} | ${fmt(p_width.p50, 2)} | ${fmt(p_width.p75, 2)} |`,
  );
  md.push(
    `| vol_retest/break | ${fmt(p_volRatio.p25, 2)} | ${fmt(p_volRatio.p50, 2)} | ${fmt(p_volRatio.p75, 2)} |`,
  );
  md.push('');
  md.push('## Bảng filter — E[R] sau phí theo scenario');
  md.push('');
  md.push(
    '| Filter | n_dec | E pooled | +/−/thin | NEAR 180d | NEAR 365d | SOL 180d | ETH 180d | BNB 180d | DOGE 180d | Candidate? |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const cells = SCENARIO_ORDER.map((sc) => {
      const s = r.per_scenario.find((x) => x.scenario === sc)!;
      return cell(s);
    });
    md.push(
      `| ${r.label} | ${r.n_decided_pooled} | ${fmt(r.e_r_pooled, 3)} | ${r.n_pos_scenarios}/${r.n_neg_scenarios}/${r.n_thin_lt8} | ${cells.join(' | ')} | ${r.consistent_candidate ? '**YES**' : 'no'} |`,
    );
  }
  md.push('');
  md.push('## Overfit check — dương khi gộp nhưng lệch symbol');
  md.push('');
  if (!pooledPositiveButWeak.length) {
    md.push('- Không có filter nào (ngoài baseline) vừa E pooled > 0 vừa rõ ràng lệch symbol trong sweep này, hoặc không đạt n≥10.');
  } else {
    for (const r of pooledPositiveButWeak) {
      md.push(
        `- **${r.label}**: E pooled=${fmt(r.e_r_pooled, 3)} nhưng chỉ **${r.n_pos_scenarios}/6** dương → **overfit / kéo điểm bởi ít symbol**.`,
      );
    }
  }
  md.push('');
  md.push('## Kết luận');
  md.push('');
  if (candidates.length === 0) {
    md.push(
      `**Không tìm được filter nào** thỏa “E[R] sau phí dương nhất quán ≥${MIN_POS_SCENARIOS}/6 scenario + n đủ lớn”.`,
    );
    md.push(
      'Đây là bằng chứng đủ (trong mẫu đã test) để kết luận **breakout Confirm B cũng không có edge nhất quán qua symbol** — giống pattern đã thấy với reversal filter search.',
    );
  } else {
    md.push(`Tìm được **${candidates.length}** ứng viên đạt tiêu chí (liệt kê id, không tự chọn production):`);
    for (const c of candidates) {
      md.push(`- \`${c.filter_id}\`: ${c.label} — ${c.n_pos_scenarios}/6 dương, n_dec=${c.n_decided_pooled}`);
    }
    md.push('Không tự chọn filter cuối / không wire production trong task này.');
  }
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/search-v41-breakout-b-cross-symbol-filters.ts`');
  md.push('- `docs/exports/v41-breakout-b-cross-symbol-filter-trades-enriched.csv`');
  md.push('- `docs/exports/v41-breakout-b-cross-symbol-filter-results.csv`');
  md.push('- `docs/exports/v41-breakout-b-cross-symbol-filter-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[b-filt] wrote ${OUT_ENRICHED}`);
  console.log(`[b-filt] wrote ${OUT_FILTERS}`);
  console.log(`[b-filt] wrote ${OUT_JSON}`);
  console.log(`[b-filt] wrote ${OUT_MD}`);
  console.log(`[b-filt] candidates=${candidates.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

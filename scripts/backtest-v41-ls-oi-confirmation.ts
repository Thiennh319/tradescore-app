/**
 * Offline backtest — L/S ratio extreme + OI divergence làm lớp xác nhận TR
 * trên cửa sổ ~30 ngày (trần lookback Binance futures/data).
 *
 * Continuous scoring: dual-load USE_CONTINUOUS_SCORING_TR in-memory (giống
 * backtest-v41-continuous-scoring.ts). Không sửa reversalDetector / flag disk.
 *
 * L/S + OI: cùng endpoint với fetchLongShortRatio / fetchOIEngine
 * (binanceApi.ts) — gọi REST trực tiếp + paginate (tránh AsyncStorage/RN).
 *
 * Usage:
 *   npx tsx scripts/backtest-v41-ls-oi-confirmation.ts
 *   npx tsx scripts/backtest-v41-ls-oi-confirmation.ts --csv docs/exports/backtest-v41-ls-oi-confirmation.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FEATURE_FLAGS } from '../config/featureFlags';
import { BINANCE_BASE_URL, type AppTradeSymbol } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import type { TrendReversalResult } from '../services/v41/reversalDetector';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DAYS = 30;
const HORIZON = 12;
const PASS_MOVE_PCT = 0.5;
const WARMUP_BARS = 220;
const FETCH_GAP_MS = 250;
const BINANCE_MAX_LIMIT = 1500;
const STATS_LIMIT = 500;
const STATS_MAX_POINTS = 720; // ~30d × 24h
const MS_1H = 3_600_000;
const LS_LOOKBACK = 20;
const OI_N = 10;
const NEAR_EXTREME_FRAC = 0.2; // "gần" đáy/đỉnh = trong 20% range N nến

type DetectorApi = {
  computeTrendReversal: (params: {
    klines1H: KlineV41[];
    trendDirection: TrendDirection;
  }) => TrendReversalResult;
};

type LsPoint = {
  symbol: string;
  longAccount: number;
  shortAccount: number;
  longShortRatio: number;
  timestamp: number;
};

type OiPoint = {
  symbol: string;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
  timestamp: number;
};

type TradeRow = {
  symbol: string;
  openTime: number;
  entry: number;
  side: 'LONG' | 'SHORT';
  trendDirection: TrendDirection;
  reversalScore: number | null;
  pass_h12: boolean | null;
  pct_h12: number | null;
  lsRatio: number | null;
  lsPercentile: number | null;
  lsExtreme: 0 | 1 | null;
  oiCurrent: number | null;
  oiAvgPrev10: number | null;
  priceNearExtreme: 0 | 1 | null;
  oiDivergence: 0 | 1 | null;
};

function adaptBinanceKline(raw: (string | number)[]): KlineV41 {
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

function filterClosedKlinesV41(klines: KlineV41[]): KlineV41[] {
  const cutoff = Date.now() - 1000;
  return klines.filter((k) => k.closeTime < cutoff);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function setContinuousFlag(value: boolean): void {
  (FEATURE_FLAGS as { USE_CONTINUOUS_SCORING_TR: boolean }).USE_CONTINUOUS_SCORING_TR =
    value;
}

async function loadDetector(continuous: boolean): Promise<DetectorApi> {
  setContinuousFlag(continuous);
  const base = pathToFileURL(
    path.resolve(__dirname, '../services/v41/reversalDetector.ts'),
  );
  base.searchParams.set('mode', continuous ? 'continuous' : 'legacy');
  base.searchParams.set('t', String(Date.now()));
  const mod = (await import(base.href)) as DetectorApi;
  return { computeTrendReversal: mod.computeTrendReversal };
}

function sideFromTrend(trend: TrendDirection): 'LONG' | 'SHORT' | null {
  if (trend === 'BULL') return 'SHORT';
  if (trend === 'BEAR') return 'LONG';
  return null;
}

function forwardPct(entry: number, exit: number, side: 'LONG' | 'SHORT'): number {
  if (side === 'LONG') return ((exit - entry) / entry) * 100;
  return ((entry - exit) / entry) * 100;
}

async function fetchBinanceKlines1H(
  symbol: string,
  startMs: number,
  endMs: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursorEnd = endMs;
  while (cursorEnd > startMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1h');
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));
    url.searchParams.set('startTime', String(startMs));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`klines HTTP ${res.status} ${symbol}`);
    }
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const batch = filterClosedKlinesV41(
      (json as (string | number)[][]).map((row) => adaptBinanceKline(row)),
    );
    if (batch.length === 0) break;
    out.push(...batch);
    const earliest = Math.min(...batch.map((k) => k.openTime));
    if (earliest <= startMs) break;
    cursorEnd = earliest - 1;
    if (batch.length < 2) break;
  }
  const byOpen = new Map<number, KlineV41>();
  for (const k of out) byOpen.set(k.openTime, k);
  return [...byOpen.values()].sort((a, b) => a.openTime - b.openTime);
}

/** Mirror parseLongShortRatio (binanceApi) — không export. */
function parseLongShortRatio(json: unknown): LsPoint[] {
  if (!Array.isArray(json)) return [];
  return json.map((item) => {
    const o = item as Record<string, string | number>;
    return {
      symbol: String(o.symbol ?? ''),
      longAccount: Number(o.longAccount ?? 0),
      shortAccount: Number(o.shortAccount ?? 0),
      longShortRatio: Number(o.longShortRatio ?? 1),
      timestamp: Number(o.timestamp ?? 0),
    };
  });
}

/** Mirror parseOpenInterestHist (binanceApi). */
function parseOpenInterestHist(json: unknown): OiPoint[] {
  if (!Array.isArray(json)) return [];
  return json.map((item) => {
    const o = item as Record<string, string | number>;
    return {
      symbol: String(o.symbol),
      sumOpenInterest: Number(o.sumOpenInterest),
      sumOpenInterestValue: Number(o.sumOpenInterestValue),
      timestamp: Number(o.timestamp),
    };
  });
}

/**
 * Paginate /futures/data/* tới trần ~STATS_MAX_POINTS (~30d @ 1h).
 * Cùng path với fetchLongShortRatio / fetchOIEngine history.
 */
async function fetchFuturesDataPaginated<T extends { timestamp: number }>(
  pathName: string,
  symbol: string,
  parse: (json: unknown) => T[],
): Promise<T[]> {
  const byTs = new Map<number, T>();
  let cursorEnd = Date.now();
  let pages = 0;

  while (pages < 10 && byTs.size < STATS_MAX_POINTS) {
    const url = new URL(`${BINANCE_BASE_URL}${pathName}`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('period', '1h');
    url.searchParams.set('limit', String(STATS_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));

    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${pathName} HTTP ${res.status}: ${body}`);
    }
    const batch = parse(await res.json());
    if (batch.length === 0) break;
    pages += 1;
    for (const p of batch) byTs.set(p.timestamp, p);
    const earliest = Math.min(...batch.map((p) => p.timestamp));
    if (earliest >= cursorEnd) break;
    cursorEnd = earliest - 1;
    if (batch.length < 2) break;
  }

  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchLsHistory(symbol: string): Promise<LsPoint[]> {
  return fetchFuturesDataPaginated(
    '/futures/data/topLongShortAccountRatio',
    symbol,
    parseLongShortRatio,
  );
}

async function fetchOiHistory(symbol: string): Promise<OiPoint[]> {
  return fetchFuturesDataPaginated(
    '/futures/data/openInterestHist',
    symbol,
    parseOpenInterestHist,
  );
}

function pointAtOrBefore<T extends { timestamp: number }>(
  series: T[],
  t: number,
): { idx: number; point: T } | null {
  let lo = 0;
  let hi = series.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].timestamp <= t) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  return { idx: best, point: series[best] };
}

/** Percentile rank of value within array (0–100). Ties: average rank style via count ≤. */
function percentileRank(value: number, sample: number[]): number | null {
  if (sample.length === 0 || !Number.isFinite(value)) return null;
  const atOrBelow = sample.filter((x) => x <= value).length;
  return (100 * atOrBelow) / sample.length;
}

function evalLsExtreme(
  ls: LsPoint[],
  openTime: number,
  trendDirection: TrendDirection,
): { lsRatio: number | null; lsPercentile: number | null; lsExtreme: 0 | 1 | null } {
  const hit = pointAtOrBefore(ls, openTime);
  if (!hit || hit.idx < LS_LOOKBACK) {
    return { lsRatio: null, lsPercentile: null, lsExtreme: null };
  }
  // 20 giá trị gần nhất (bao gồm điểm hiện tại) để tính percentile
  const window = ls.slice(hit.idx - LS_LOOKBACK + 1, hit.idx + 1);
  const ratios = window.map((p) => p.longShortRatio);
  const current = hit.point.longShortRatio;
  const pct = percentileRank(current, ratios);
  if (pct == null) {
    return { lsRatio: current, lsPercentile: null, lsExtreme: null };
  }
  let extreme: 0 | 1 = 0;
  if (trendDirection === 'BEAR' && pct >= 80) extreme = 1;
  if (trendDirection === 'BULL' && pct <= 20) extreme = 1;
  return { lsRatio: current, lsPercentile: pct, lsExtreme: extreme };
}

function evalOiDivergence(
  klines: KlineV41[],
  entryIdx: number,
  oi: OiPoint[],
  openTime: number,
  trendDirection: TrendDirection,
): {
  oiCurrent: number | null;
  oiAvgPrev10: number | null;
  priceNearExtreme: 0 | 1 | null;
  oiDivergence: 0 | 1 | null;
} {
  if (entryIdx < OI_N - 1) {
    return {
      oiCurrent: null,
      oiAvgPrev10: null,
      priceNearExtreme: null,
      oiDivergence: null,
    };
  }

  const window = klines.slice(entryIdx - OI_N + 1, entryIdx + 1);
  const close = window[window.length - 1].close;
  const lo = Math.min(...window.map((k) => k.low));
  const hi = Math.max(...window.map((k) => k.high));
  const range = hi - lo;
  let priceNearExtreme: 0 | 1 = 0;
  if (range > 0) {
    if (trendDirection === 'BEAR') {
      // gần đáy
      if ((close - lo) / range <= NEAR_EXTREME_FRAC) priceNearExtreme = 1;
    } else if (trendDirection === 'BULL') {
      // gần đỉnh
      if ((hi - close) / range <= NEAR_EXTREME_FRAC) priceNearExtreme = 1;
    }
  }

  const oiHit = pointAtOrBefore(oi, openTime);
  if (!oiHit || oiHit.idx < OI_N) {
    return {
      oiCurrent: oiHit?.point.sumOpenInterest ?? null,
      oiAvgPrev10: null,
      priceNearExtreme,
      oiDivergence: null,
    };
  }
  const prev10 = oi.slice(oiHit.idx - OI_N, oiHit.idx); // 10 nến trước (không gồm hiện tại)
  const oiCurrent = oiHit.point.sumOpenInterest;
  const oiAvgPrev10 =
    prev10.reduce((s, p) => s + p.sumOpenInterest, 0) / prev10.length;
  const oiWeak = oiCurrent < oiAvgPrev10;
  const oiDivergence: 0 | 1 =
    priceNearExtreme === 1 && oiWeak ? 1 : 0;

  return { oiCurrent, oiAvgPrev10, priceNearExtreme, oiDivergence };
}

type GroupStats = {
  label: string;
  n: number;
  evaluated: number;
  wins: number;
  winrate: number | null;
  warn: boolean;
};

function stats(label: string, rows: TradeRow[]): GroupStats {
  const evaluated = rows.filter((r) => r.pass_h12 != null);
  const wins = evaluated.filter((r) => r.pass_h12 === true).length;
  const n = evaluated.length;
  return {
    label,
    n,
    evaluated: n,
    wins,
    winrate: n > 0 ? (100 * wins) / n : null,
    warn: n > 0 && n < 15,
  };
}

function fmtPct(n: number | null): string {
  return n == null ? 'n/a' : `${n.toFixed(2)}%`;
}

function printTable(
  title: string,
  rows: Array<Record<string, string | number>>,
): void {
  console.log(`\n=== ${title} ===`);
  if (rows.length === 0) {
    console.log('(empty)');
    return;
  }
  const keys = Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k]).length)),
  );
  const line = (cols: string[]) =>
    cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(keys));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(keys.map((k) => String(r[k]))));
}

function toRow(g: GroupStats): Record<string, string | number> {
  return {
    group: g.label,
    n: g.n,
    wins: g.wins,
    winrate_H12: fmtPct(g.winrate),
    fraction: g.n ? `${g.wins}/${g.n}` : '0/0',
    warn_n_lt_15: g.warn ? 'YES' : '',
  };
}

function writeCsv(
  outPath: string,
  trades: TradeRow[],
  summary: Array<Record<string, string | number>>,
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = [
    'symbol',
    'openTime',
    'iso',
    'entry',
    'side',
    'trendDirection',
    'reversalScore',
    'pct_h12',
    'pass_h12',
    'lsRatio',
    'lsPercentile',
    'lsExtreme',
    'oiCurrent',
    'oiAvgPrev10',
    'priceNearExtreme',
    'oiDivergence',
  ];
  const lines = trades.map((t) =>
    [
      t.symbol,
      t.openTime,
      new Date(t.openTime).toISOString(),
      t.entry,
      t.side,
      t.trendDirection,
      t.reversalScore ?? '',
      t.pct_h12 ?? '',
      t.pass_h12 == null ? '' : t.pass_h12 ? 1 : 0,
      t.lsRatio ?? '',
      t.lsPercentile ?? '',
      t.lsExtreme ?? '',
      t.oiCurrent ?? '',
      t.oiAvgPrev10 ?? '',
      t.priceNearExtreme ?? '',
      t.oiDivergence ?? '',
    ].join(','),
  );
  const sumHeader = Object.keys(summary[0] ?? { note: '' });
  const sumLines = summary.map((r) =>
    sumHeader.map((k) => String(r[k])).join(','),
  );
  const body = [
    '# trades',
    header.join(','),
    ...lines,
    '',
    '# summary',
    sumHeader.join(','),
    ...sumLines,
    '',
  ].join('\n');
  fs.writeFileSync(outPath, body, 'utf8');
  console.log(`\nWrote CSV: ${outPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let csvOut = path.resolve(
    __dirname,
    '../docs/exports/backtest-v41-ls-oi-confirmation.csv',
  );
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv') csvOut = path.resolve(args[++i] ?? csvOut);
  }

  const symbols: AppTradeSymbol[] = [
    'NEARUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'BTCUSDT',
  ];
  const endMs = Date.now();
  const windowStartMs = endMs - DAYS * 86_400_000;

  console.log(
    `LS/OI confirmation | days=${DAYS} symbols=${symbols.join(',')} | H${HORIZON} PASS≥${PASS_MOVE_PCT}%`,
  );
  console.log(
    `Continuous dual-load in-memory; L/S=/futures/data/topLongShortAccountRatio; OI=/futures/data/openInterestHist period=1h paginate≤${STATS_MAX_POINTS}`,
  );

  const flagBefore = FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR;
  let continuous: DetectorApi;
  try {
    continuous = await loadDetector(true);
  } finally {
    setContinuousFlag(Boolean(flagBefore));
  }
  setContinuousFlag(Boolean(flagBefore));

  const allTrades: TradeRow[] = [];

  for (const symbol of symbols) {
    const fetchStart = windowStartMs - WARMUP_BARS * MS_1H;
    const klines = await fetchBinanceKlines1H(
      symbol,
      fetchStart,
      endMs + HORIZON * MS_1H,
    );
    console.log(`[data] ${symbol} 1h klines: ${klines.length}`);

    const ls = await fetchLsHistory(symbol);
    console.log(
      `[data] ${symbol} L/S 1h: ${ls.length} pts (${ls.length ? new Date(ls[0].timestamp).toISOString() : '—'} → ${ls.length ? new Date(ls[ls.length - 1].timestamp).toISOString() : '—'})`,
    );

    const oi = await fetchOiHistory(symbol);
    console.log(
      `[data] ${symbol} OI 1h: ${oi.length} pts (${oi.length ? new Date(oi[0].timestamp).toISOString() : '—'} → ${oi.length ? new Date(oi[oi.length - 1].timestamp).toISOString() : '—'})`,
    );

    const startIdx = klines.findIndex((k) => k.openTime >= windowStartMs);
    if (startIdx < 0) {
      console.warn(`[warn] ${symbol}: no bars in window`);
      continue;
    }

    for (let i = Math.max(startIdx, WARMUP_BARS); i < klines.length; i++) {
      const candle = klines[i];
      if (candle.openTime > endMs) break;

      const window = klines.slice(0, i + 1);
      const { trendDirection } = calculateTrendStrength(window);
      if (trendDirection === 'NEUTRAL') continue;
      const side = sideFromTrend(trendDirection);
      if (side == null) continue;

      const cont = continuous.computeTrendReversal({
        klines1H: window,
        trendDirection,
      });
      const contActive =
        cont.state === 'ACTIVE' && cont.isEffectivelyInactive !== true;
      if (!contActive) continue;

      const j = i + HORIZON;
      let pass_h12: boolean | null = null;
      let pct_h12: number | null = null;
      if (j < klines.length) {
        pct_h12 = forwardPct(candle.close, klines[j].close, side);
        pass_h12 = pct_h12 >= PASS_MOVE_PCT;
      }

      const lsEval = evalLsExtreme(ls, candle.openTime, trendDirection);
      const oiEval = evalOiDivergence(
        klines,
        i,
        oi,
        candle.openTime,
        trendDirection,
      );

      allTrades.push({
        symbol,
        openTime: candle.openTime,
        entry: candle.close,
        side,
        trendDirection,
        reversalScore: cont.reversalScore ?? null,
        pass_h12,
        pct_h12,
        ...lsEval,
        ...oiEval,
      });
    }
  }

  const evaluated = allTrades.filter((t) => t.pass_h12 != null);
  const withLs = evaluated.filter((t) => t.lsExtreme != null);
  const withOi = evaluated.filter((t) => t.oiDivergence != null);
  const withBoth = evaluated.filter(
    (t) => t.lsExtreme != null && t.oiDivergence != null,
  );

  const groups: GroupStats[] = [
    stats('Baseline (30d continuous ACTIVE)', evaluated),
    stats('lsExtreme=1', withLs.filter((t) => t.lsExtreme === 1)),
    stats('lsExtreme=0', withLs.filter((t) => t.lsExtreme === 0)),
    stats('oiDivergence=1', withOi.filter((t) => t.oiDivergence === 1)),
    stats('oiDivergence=0', withOi.filter((t) => t.oiDivergence === 0)),
    stats(
      'Cả 2 (lsExtreme=1 AND oiDivergence=1)',
      withBoth.filter((t) => t.lsExtreme === 1 && t.oiDivergence === 1),
    ),
    stats(
      'Không đạt gì (lsExtreme=0 AND oiDivergence=0)',
      withBoth.filter((t) => t.lsExtreme === 0 && t.oiDivergence === 0),
    ),
  ];

  printTable(
    'Winrate H12 — L/S + OI confirmation (30d)',
    groups.map(toRow),
  );

  const warned = groups.filter((g) => g.warn);
  if (warned.length > 0) {
    console.log('\n[warn] n<15 (đọc % kém tin cậy):');
    for (const g of warned) {
      console.log(`  - ${g.label}: n=${g.n}`);
    }
  }

  const summary = groups.map((g) => ({ section: 'H12', ...toRow(g) }));
  writeCsv(csvOut, allTrades, summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

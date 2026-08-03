/**
 * NEARUSDT-only — OI Divergence filter + EV ATR (SL/TP R:R).
 *
 * Cửa sổ 30d (trần OI). Continuous scoring in-memory.
 * oiDivergence: cùng logic backtest-v41-ls-oi-confirmation.ts
 * RR/ATR: cùng logic backtest-v41-rr-atr.ts (worst-case same-bar → SL)
 *
 * Usage:
 *   npx tsx scripts/backtest-v41-near-oi-rr-ev.ts
 *   npx tsx scripts/backtest-v41-near-oi-rr-ev.ts --csv docs/exports/backtest-v41-near-oi-rr-ev.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FEATURE_FLAGS } from '../config/featureFlags';
import { BINANCE_BASE_URL } from '../constants/scoring';
import { calculateATR, type KlineV41 } from '../services/v41/indicators';
import type { TrendReversalResult } from '../services/v41/reversalDetector';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYMBOL = 'NEARUSDT';
const DAYS = 30;
const HALF_DAYS = 15;
const WARMUP_BARS = 220;
const FETCH_GAP_MS = 250;
const BINANCE_MAX_LIMIT = 1500;
const STATS_LIMIT = 500;
const STATS_MAX_POINTS = 720;
const MS_1H = 3_600_000;
const MS_DAY = 86_400_000;

const OI_N = 10;
const NEAR_EXTREME_FRAC = 0.2;
const ATR_PERIOD = 14;
const SL_ATR_MULT = 1.5;
const MAX_BARS = 24;
const RR_LEVELS = [1.5, 2, 2.5, 3] as const;

type RrLevel = (typeof RR_LEVELS)[number];
type Side = 'LONG' | 'SHORT';
type HitKind = 'TP' | 'SL' | 'TIMEOUT' | 'NO_DATA';

type DetectorApi = {
  computeTrendReversal: (params: {
    klines1H: KlineV41[];
    trendDirection: TrendDirection;
  }) => TrendReversalResult;
};

type OiPoint = {
  symbol: string;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
  timestamp: number;
};

type RrOutcome = {
  rr: RrLevel;
  sl: number;
  tp: number;
  slDistance: number;
  hit: HitKind;
  barsHeld: number | null;
  exitPrice: number | null;
  resultR: number | null;
};

type TradeRow = {
  openTime: number;
  entry: number;
  side: Side;
  trendDirection: TrendDirection;
  reversalScore: number | null;
  oiDivergence: 0 | 1 | null;
  oiCurrent: number | null;
  oiAvgPrev10: number | null;
  priceNearExtreme: 0 | 1 | null;
  atr: number | null;
  half: 'H1' | 'H2'; // 15d đầu vs 15d sau trong cửa sổ 30d
  outcomes: RrOutcome[];
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

function sideFromTrend(trend: TrendDirection): Side | null {
  if (trend === 'BULL') return 'SHORT';
  if (trend === 'BEAR') return 'LONG';
  return null;
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
    if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
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

async function fetchOiHistory(symbol: string): Promise<OiPoint[]> {
  const byTs = new Map<number, OiPoint>();
  let cursorEnd = Date.now();
  let pages = 0;
  while (pages < 10 && byTs.size < STATS_MAX_POINTS) {
    const url = new URL(`${BINANCE_BASE_URL}/futures/data/openInterestHist`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('period', '1h');
    url.searchParams.set('limit', String(STATS_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`OI hist HTTP ${res.status}: ${await res.text()}`);
    const batch = parseOpenInterestHist(await res.json());
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

function pointAtOrBefore(
  series: OiPoint[],
  t: number,
): { idx: number; point: OiPoint } | null {
  let lo = 0;
  let hi = series.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].timestamp <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best < 0) return null;
  return { idx: best, point: series[best] };
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
      if ((close - lo) / range <= NEAR_EXTREME_FRAC) priceNearExtreme = 1;
    } else if (trendDirection === 'BULL') {
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
  const prev10 = oi.slice(oiHit.idx - OI_N, oiHit.idx);
  const oiCurrent = oiHit.point.sumOpenInterest;
  const oiAvgPrev10 =
    prev10.reduce((s, p) => s + p.sumOpenInterest, 0) / prev10.length;
  const oiDivergence: 0 | 1 =
    priceNearExtreme === 1 && oiCurrent < oiAvgPrev10 ? 1 : 0;
  return { oiCurrent, oiAvgPrev10, priceNearExtreme, oiDivergence };
}

function atrAtIndex(klines: KlineV41[], idx: number): number | null {
  if (idx < ATR_PERIOD) return null;
  const series = calculateATR(klines.slice(0, idx + 1), ATR_PERIOD);
  const atr = series[series.length - 1];
  if (!Number.isFinite(atr) || atr <= 0) return null;
  return atr;
}

function levelsFor(entry: number, side: Side, atr: number, rr: RrLevel) {
  const slDistance = atr * SL_ATR_MULT;
  if (side === 'LONG') {
    return {
      sl: entry - slDistance,
      tp: entry + slDistance * rr,
      slDistance,
    };
  }
  return {
    sl: entry + slDistance,
    tp: entry - slDistance * rr,
    slDistance,
  };
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

function pnlR(
  entry: number,
  exit: number,
  side: Side,
  slDistance: number,
): number {
  if (!(slDistance > 0)) return 0;
  const raw = side === 'LONG' ? exit - entry : entry - exit;
  return raw / slDistance;
}

function simulateRr(
  klines: KlineV41[],
  entryIdx: number,
  entry: number,
  side: Side,
  atr: number,
  rr: RrLevel,
): RrOutcome {
  const { sl, tp, slDistance } = levelsFor(entry, side, atr, rr);
  const last = Math.min(entryIdx + MAX_BARS, klines.length - 1);
  if (last <= entryIdx) {
    return {
      rr,
      sl,
      tp,
      slDistance,
      hit: 'NO_DATA',
      barsHeld: null,
      exitPrice: null,
      resultR: null,
    };
  }
  for (let j = entryIdx + 1; j <= last; j++) {
    const hit = hitOnBar(side, klines[j], sl, tp);
    if (hit == null) continue;
    if (hit === 'SL' || hit === 'BOTH') {
      return {
        rr,
        sl,
        tp,
        slDistance,
        hit: 'SL',
        barsHeld: j - entryIdx,
        exitPrice: sl,
        resultR: -1,
      };
    }
    return {
      rr,
      sl,
      tp,
      slDistance,
      hit: 'TP',
      barsHeld: j - entryIdx,
      exitPrice: tp,
      resultR: rr,
    };
  }
  const exitPrice = klines[last].close;
  return {
    rr,
    sl,
    tp,
    slDistance,
    hit: 'TIMEOUT',
    barsHeld: last - entryIdx,
    exitPrice,
    resultR: pnlR(entry, exitPrice, side, slDistance),
  };
}

type EvStats = {
  scope: string;
  rr: RrLevel;
  n: number;
  evaluated: number;
  wins_tp: number;
  losses_sl: number;
  timeouts: number;
  winrate_tp: number | null;
  ev_R: number | null;
  sum_R: number | null;
};

function summarizeEv(
  scope: string,
  trades: TradeRow[],
  rr: RrLevel,
): EvStats {
  let evaluated = 0;
  let wins = 0;
  let losses = 0;
  let timeouts = 0;
  let sumR = 0;
  for (const t of trades) {
    const o = t.outcomes.find((x) => x.rr === rr);
    if (!o || o.resultR == null || o.hit === 'NO_DATA') continue;
    evaluated += 1;
    sumR += o.resultR;
    if (o.hit === 'TP') wins += 1;
    else if (o.hit === 'SL') losses += 1;
    else if (o.hit === 'TIMEOUT') timeouts += 1;
  }
  return {
    scope,
    rr,
    n: trades.length,
    evaluated,
    wins_tp: wins,
    losses_sl: losses,
    timeouts,
    winrate_tp: evaluated > 0 ? (100 * wins) / evaluated : null,
    ev_R: evaluated > 0 ? sumR / evaluated : null,
    sum_R: evaluated > 0 ? sumR : null,
  };
}

function fmtPct(n: number | null): string {
  return n == null ? 'n/a' : `${n.toFixed(2)}%`;
}
function fmtR(n: number | null): string {
  return n == null ? 'n/a' : n.toFixed(4);
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

function toRow(s: EvStats): Record<string, string | number> {
  return {
    scope: s.scope,
    rr: s.rr,
    n: s.n,
    evaluated: s.evaluated,
    wins_tp: s.wins_tp,
    losses_sl: s.losses_sl,
    timeouts: s.timeouts,
    winrate_tp: fmtPct(s.winrate_tp),
    EV_R: fmtR(s.ev_R),
    sum_R: fmtR(s.sum_R),
    warn_n_lt_15: s.n > 0 && s.n < 15 ? 'YES' : '',
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
    'half',
    'entry',
    'side',
    'trendDirection',
    'reversalScore',
    'oiDivergence',
    'oiCurrent',
    'oiAvgPrev10',
    'priceNearExtreme',
    'atr14',
    ...RR_LEVELS.flatMap((rr) => [
      `hit_rr${rr}`,
      `bars_rr${rr}`,
      `exit_rr${rr}`,
      `resultR_rr${rr}`,
    ]),
  ];
  const lines = trades.map((t) =>
    [
      SYMBOL,
      t.openTime,
      new Date(t.openTime).toISOString(),
      t.half,
      t.entry,
      t.side,
      t.trendDirection,
      t.reversalScore ?? '',
      t.oiDivergence ?? '',
      t.oiCurrent ?? '',
      t.oiAvgPrev10 ?? '',
      t.priceNearExtreme ?? '',
      t.atr ?? '',
      ...RR_LEVELS.flatMap((rr) => {
        const o = t.outcomes.find((x) => x.rr === rr)!;
        return [o.hit, o.barsHeld ?? '', o.exitPrice ?? '', o.resultR ?? ''];
      }),
    ].join(','),
  );
  const sumHeader = Object.keys(summary[0] ?? { note: '' });
  const sumLines = summary.map((r) =>
    sumHeader.map((k) => String(r[k])).join(','),
  );
  fs.writeFileSync(
    outPath,
    ['# trades', header.join(','), ...lines, '', '# summary', sumHeader.join(','), ...sumLines, ''].join(
      '\n',
    ),
    'utf8',
  );
  console.log(`\nWrote CSV: ${outPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let csvOut = path.resolve(
    __dirname,
    '../docs/exports/backtest-v41-near-oi-rr-ev.csv',
  );
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv') csvOut = path.resolve(args[++i] ?? csvOut);
  }

  const endMs = Date.now();
  const windowStartMs = endMs - DAYS * MS_DAY;
  const midMs = windowStartMs + HALF_DAYS * MS_DAY;

  console.log(
    `NEAR OI+RR/EV | ${SYMBOL} days=${DAYS} | SL=${SL_ATR_MULT}×ATR${ATR_PERIOD} RR=${RR_LEVELS.join('/')} maxBars=${MAX_BARS}`,
  );
  console.log(
    `Continuous in-memory | oiDivergence (N=${OI_N}) | halves split @ ${new Date(midMs).toISOString()}`,
  );

  const flagBefore = FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR;
  let continuous: DetectorApi;
  try {
    continuous = await loadDetector(true);
  } finally {
    setContinuousFlag(Boolean(flagBefore));
  }
  setContinuousFlag(Boolean(flagBefore));

  const klines = await fetchBinanceKlines1H(
    SYMBOL,
    windowStartMs - WARMUP_BARS * MS_1H,
    endMs + MAX_BARS * MS_1H,
  );
  console.log(`[data] ${SYMBOL} 1h: ${klines.length} bars`);

  const oi = await fetchOiHistory(SYMBOL);
  console.log(
    `[data] ${SYMBOL} OI 1h: ${oi.length} pts (${oi.length ? new Date(oi[0].timestamp).toISOString() : '—'} → ${oi.length ? new Date(oi[oi.length - 1].timestamp).toISOString() : '—'})`,
  );

  const trades: TradeRow[] = [];
  const startIdx = klines.findIndex((k) => k.openTime >= windowStartMs);
  if (startIdx < 0) {
    console.error('No bars in window');
    process.exit(2);
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
    if (!(cont.state === 'ACTIVE' && cont.isEffectivelyInactive !== true)) {
      continue;
    }

    const oiEval = evalOiDivergence(
      klines,
      i,
      oi,
      candle.openTime,
      trendDirection,
    );
    const atr = atrAtIndex(klines, i);
    const outcomes: RrOutcome[] =
      atr == null
        ? RR_LEVELS.map((rr) => ({
            rr,
            sl: NaN,
            tp: NaN,
            slDistance: NaN,
            hit: 'NO_DATA' as const,
            barsHeld: null,
            exitPrice: null,
            resultR: null,
          }))
        : RR_LEVELS.map((rr) =>
            simulateRr(klines, i, candle.close, side, atr, rr),
          );

    trades.push({
      openTime: candle.openTime,
      entry: candle.close,
      side,
      trendDirection,
      reversalScore: cont.reversalScore ?? null,
      ...oiEval,
      atr,
      half: candle.openTime < midMs ? 'H1' : 'H2',
      outcomes,
    });
  }

  const withOi = trades.filter((t) => t.oiDivergence != null);
  const oi1 = withOi.filter((t) => t.oiDivergence === 1);
  const oi0 = withOi.filter((t) => t.oiDivergence === 0);
  const oi1h1 = oi1.filter((t) => t.half === 'H1');
  const oi1h2 = oi1.filter((t) => t.half === 'H2');

  console.log(
    `\nSignals: baseline=${trades.length} | oiDiv=1 n=${oi1.length} | oiDiv=0 n=${oi0.length} | oi1 H1=${oi1h1.length} H2=${oi1h2.length}`,
  );

  const summary: Array<Record<string, string | number>> = [];
  const scopes: Array<[string, TradeRow[]]> = [
    ['NEAR baseline (no filter)', trades],
    ['NEAR oiDivergence=1', oi1],
    ['NEAR oiDivergence=0', oi0],
    ['NEAR oiDiv=1 · half1 (first 15d)', oi1h1],
    ['NEAR oiDiv=1 · half2 (last 15d)', oi1h2],
  ];

  for (const [scope, subset] of scopes) {
    for (const rr of RR_LEVELS) {
      summary.push(toRow(summarizeEv(scope, subset, rr)));
    }
  }

  printTable(
    'EV by R:R — baseline vs oiDiv=1 vs oiDiv=0',
    summary.filter(
      (r) =>
        String(r.scope).includes('baseline') ||
        String(r.scope) === 'NEAR oiDivergence=1' ||
        String(r.scope) === 'NEAR oiDivergence=0',
    ),
  );

  printTable(
    'oiDivergence=1 — half1 vs half2 (15d each)',
    summary.filter((r) => String(r.scope).includes('half')),
  );

  writeCsv(csvOut, trades, summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

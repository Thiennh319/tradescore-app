/**
 * Offline A/B backtest — Trend Reversal continuous scoring vs binary legacy.
 *
 * ƯỚC LƯỢNG THÔ: không SL/TP broker, không funding, không slippage.
 * Không thay thế kiểm định paper trading / broker thật.
 * Không đặt lệnh thật. Không đổi FEATURE_FLAGS mặc định trên disk.
 *
 * Dual-load: mutate FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR in-memory rồi
 * dynamic-import reversalDetector với cache-bust để lấy đúng 2 bản computeTrendReversal
 * (khớp 100% code gốc — không copy công thức).
 *
 * Usage:
 *   npx tsx scripts/backtest-v41-continuous-scoring.ts --days 90 --symbols NEAR,SOL,BNB
 *   npx tsx scripts/backtest-v41-continuous-scoring.ts --days 60 --klines-dir path/to/json --csv out.csv
 *
 * Local klines (ưu tiên, không cần mạng): files
 *   {SYMBOL}_1h.json  hoặc  {SYMBOL}-1h.json
 * JSON = Binance raw kline rows [[openTime,o,h,l,c,vol,...,takerBuy,...], ...]
 *   hoặc { "klines": [ { openTime, open, high, low, close, volume, takerBuyVolume, closeTime }, ... ] }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BINANCE_BASE_URL, type AppTradeSymbol } from '../constants/scoring';
import { FEATURE_FLAGS } from '../config/featureFlags';
import type { KlineV41 } from '../services/v41/indicators';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';
import type { TrendReversalResult } from '../services/v41/reversalDetector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Same mapping as services/v41/rawMarketFetcher.adaptBinanceKline —
 * inlined so this Node script does not pull binanceApi → AsyncStorage → react-native.
 */
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
const HORIZONS = [6, 12, 24] as const;
const PASS_MOVE_PCT = 0.5;
const WARMUP_BARS = 220; // EMA200 + buffer for trendStrength / TR detectors
const FETCH_GAP_MS = 250;
const BINANCE_MAX_LIMIT = 1500;

type Horizon = (typeof HORIZONS)[number];

type CliOptions = {
  days: number;
  symbols: AppTradeSymbol[];
  csv: string | null;
  klinesDir: string | null;
  help: boolean;
};

type DetectorApi = {
  computeTrendReversal: (params: {
    klines1H: KlineV41[];
    trendDirection: TrendDirection;
  }) => TrendReversalResult;
};

type SignalKind = 'legacy' | 'continuous' | 'new_only' | 'lost_only';

type TradeSample = {
  symbol: string;
  kind: SignalKind;
  openTime: number;
  entry: number;
  side: 'LONG' | 'SHORT';
  trendDirection: TrendDirection;
  legacyState: string;
  continuousState: string;
  reversalScore: number | null;
  structureScore: number | null;
  cvdScore: number | null;
  exhaustionScore: number | null;
  volumeScore: number | null;
  isEffectivelyInactive: boolean | null;
  results: Record<Horizon, { pct: number | null; pass: boolean | null }>;
};

function printHelp(): void {
  console.log(`backtest-v41-continuous-scoring.ts

  npx tsx scripts/backtest-v41-continuous-scoring.ts [options]

Options:
  --days <n>           Lookback calendar days (default 90)
  --symbols <list>     Comma list NEAR,SOL,BNB,BTC (default NEAR,SOL,BNB)
  --klines-dir <path>  Prefer local JSON klines (see file header)
  --csv <path>         Write trade-level + summary CSV
  --help

Data:
  1) Local JSON in --klines-dir if provided / exists
  2) Else public Binance Futures REST /fapi/v1/klines (free, throttled ${FETCH_GAP_MS}ms)
     — same endpoint + adaptBinanceKline as app Raw Market layer
`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    days: 90,
    symbols: ['NEARUSDT', 'SOLUSDT', 'BNBUSDT'],
    csv: null,
    klinesDir: null,
    help: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
      continue;
    }
    if (a === '--days') {
      opts.days = Number(args[++i]);
      continue;
    }
    if (a === '--csv') {
      opts.csv = args[++i] ?? null;
      continue;
    }
    if (a === '--klines-dir') {
      opts.klinesDir = args[++i] ?? null;
      continue;
    }
    if (a === '--symbols') {
      const raw = args[++i] ?? '';
      opts.symbols = raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .map((s) => (s.endsWith('USDT') ? s : `${s}USDT`)) as AppTradeSymbol[];
      continue;
    }
    throw new Error(`Unknown arg: ${a}`);
  }
  return opts;
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
  return {
    computeTrendReversal: mod.computeTrendReversal,
  };
}

function sideFromTrend(trend: TrendDirection): 'LONG' | 'SHORT' | null {
  // Trend Reversal ACTIVE = đảo khỏi trend hiện tại (counter-trend), không phải tiếp diễn.
  // BULL + ACTIVE → cược bearish reversal → SHORT
  // BEAR + ACTIVE → cược bullish reversal → LONG
  if (trend === 'BULL') return 'SHORT';
  if (trend === 'BEAR') return 'LONG';
  return null;
}

function forwardPct(
  entry: number,
  exit: number,
  side: 'LONG' | 'SHORT',
): number {
  if (side === 'LONG') return ((exit - entry) / entry) * 100;
  return ((entry - exit) / entry) * 100;
}

function findLocalKlinesFile(dir: string, symbol: string): string | null {
  const candidates = [
    `${symbol}_1h.json`,
    `${symbol}-1h.json`,
    `${symbol}_1H.json`,
    `${symbol}.json`,
  ];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseLocalKlinesJson(raw: string): KlineV41[] {
  const data = JSON.parse(raw) as unknown;
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (Array.isArray(data[0])) {
      return filterClosedKlinesV41(
        (data as (string | number)[][]).map((row) => adaptBinanceKline(row)),
      );
    }
    return filterClosedKlinesV41(data as KlineV41[]);
  }
  if (data && typeof data === 'object' && Array.isArray((data as { klines?: unknown }).klines)) {
    const klines = (data as { klines: unknown[] }).klines;
    if (klines.length > 0 && Array.isArray(klines[0])) {
      return filterClosedKlinesV41(
        (klines as (string | number)[][]).map((row) => adaptBinanceKline(row)),
      );
    }
    return filterClosedKlinesV41(klines as KlineV41[]);
  }
  throw new Error('Unsupported klines JSON shape');
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
      throw new Error(`Binance klines HTTP ${res.status} for ${symbol}: ${res.statusText}`);
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

async function loadSymbolKlines1H(
  symbol: AppTradeSymbol,
  startMs: number,
  endMs: number,
  klinesDir: string | null,
): Promise<{ klines: KlineV41[]; source: string }> {
  if (klinesDir) {
    const file = findLocalKlinesFile(klinesDir, symbol);
    if (file) {
      const klines = parseLocalKlinesJson(fs.readFileSync(file, 'utf8')).filter(
        (k) => k.openTime >= startMs - WARMUP_BARS * 3_600_000 && k.openTime <= endMs,
      );
      return { klines, source: `local:${file}` };
    }
    console.warn(
      `[warn] No local file for ${symbol} in ${klinesDir} — falling back to Binance public REST`,
    );
  }

  const fetchStart = startMs - WARMUP_BARS * 3_600_000;
  const klines = await fetchBinanceKlines1H(symbol, fetchStart, endMs);
  return { klines, source: 'binance:/fapi/v1/klines' };
}

function printDataHelp(): void {
  console.log(`
=== Hướng dẫn cung cấp klines local (khuyến nghị) ===
Thư mục ví dụ: docs/exports/klines-1h/

Mỗi symbol một file JSON (một trong các tên):
  NEARUSDT_1h.json | NEARUSDT-1h.json | NEARUSDT.json

Nội dung: mảng kline thô Binance Futures (đúng format adaptBinanceKline), ví dụ:
  [[openTime,"o","h","l","c","volume",closeTime,...,"takerBuyBase",...], ...]

Hoặc: { "klines": [ { openTime, open, high, low, close, volume, takerBuyVolume, closeTime }, ... ] }

Cách lấy (public REST, tự throttle):
  https://fapi.binance.com/fapi/v1/klines?symbol=NEARUSDT&interval=1h&limit=1500

Script này cũng tự fetch public REST nếu không có local (gap ${FETCH_GAP_MS}ms/request).
Không dùng endpoint trả phí. Nếu gặp HTTP 418/429 — dừng, đợi, hoặc chuyển sang file local.
`);
}

function evalHorizons(
  klines: KlineV41[],
  idx: number,
  entry: number,
  side: 'LONG' | 'SHORT',
): TradeSample['results'] {
  const results = {} as TradeSample['results'];
  for (const n of HORIZONS) {
    const j = idx + n;
    if (j >= klines.length) {
      results[n] = { pct: null, pass: null };
      continue;
    }
    const pct = forwardPct(entry, klines[j].close, side);
    results[n] = { pct, pass: pct >= PASS_MOVE_PCT };
  }
  return results;
}

type WinStats = {
  signals: number;
  evaluated: number;
  wins: number;
  winrate: number | null;
};

function summarize(
  samples: TradeSample[],
  kind: SignalKind,
  horizon: Horizon,
): WinStats {
  const subset = samples.filter((s) => s.kind === kind);
  let evaluated = 0;
  let wins = 0;
  for (const s of subset) {
    const r = s.results[horizon];
    if (r.pass == null) continue;
    evaluated += 1;
    if (r.pass) wins += 1;
  }
  return {
    signals: subset.length,
    evaluated,
    wins,
    winrate: evaluated > 0 ? (100 * wins) / evaluated : null,
  };
}

function fmtPct(n: number | null): string {
  return n == null ? 'n/a' : `${n.toFixed(1)}%`;
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

function writeCsv(
  outPath: string,
  samples: TradeSample[],
  summaryRows: Array<Record<string, string | number>>,
): void {
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });

  const tradeHeader = [
    'symbol',
    'kind',
    'openTime',
    'iso',
    'entry',
    'side',
    'trendDirection',
    'legacyState',
    'continuousState',
    'reversalScore',
    'structureScore',
    'cvdScore',
    'exhaustionScore',
    'volumeScore',
    'isEffectivelyInactive',
    ...HORIZONS.flatMap((n) => [`pct_h${n}`, `pass_h${n}`]),
  ];
  const tradeLines = samples.map((s) =>
    [
      s.symbol,
      s.kind,
      s.openTime,
      new Date(s.openTime).toISOString(),
      s.entry,
      s.side,
      s.trendDirection,
      s.legacyState,
      s.continuousState,
      s.reversalScore ?? '',
      s.structureScore ?? '',
      s.cvdScore ?? '',
      s.exhaustionScore ?? '',
      s.volumeScore ?? '',
      s.isEffectivelyInactive ?? '',
      ...HORIZONS.flatMap((n) => [
        s.results[n].pct ?? '',
        s.results[n].pass == null ? '' : s.results[n].pass ? 1 : 0,
      ]),
    ].join(','),
  );

  const sumHeader = Object.keys(summaryRows[0] ?? { note: '' });
  const sumLines = summaryRows.map((r) =>
    sumHeader.map((k) => String(r[k])).join(','),
  );

  const body = [
    '# trades',
    tradeHeader.join(','),
    ...tradeLines,
    '',
    '# summary',
    sumHeader.join(','),
    ...sumLines,
    '',
  ].join('\n');

  fs.writeFileSync(outPath, body, 'utf8');
  console.log(`\nWrote CSV: ${outPath}`);
}

async function runSymbol(
  symbol: AppTradeSymbol,
  klines: KlineV41[],
  windowStartMs: number,
  windowEndMs: number,
  legacy: DetectorApi,
  continuous: DetectorApi,
): Promise<TradeSample[]> {
  const samples: TradeSample[] = [];
  const startIdx = klines.findIndex((k) => k.openTime >= windowStartMs);
  if (startIdx < 0) return samples;

  for (let i = Math.max(startIdx, WARMUP_BARS); i < klines.length; i++) {
    const candle = klines[i];
    if (candle.openTime > windowEndMs) break;

    const window = klines.slice(0, i + 1);
    const { trendDirection } = calculateTrendStrength(window);
    if (trendDirection === 'NEUTRAL') continue;

    const side = sideFromTrend(trendDirection);
    if (side == null) continue;

    const leg = legacy.computeTrendReversal({
      klines1H: window,
      trendDirection,
    });
    const cont = continuous.computeTrendReversal({
      klines1H: window,
      trendDirection,
    });

    const legacyActive = leg.state === 'ACTIVE';
    const contActive =
      cont.state === 'ACTIVE' && cont.isEffectivelyInactive !== true;

    const base = {
      symbol,
      openTime: candle.openTime,
      entry: candle.close,
      side,
      trendDirection,
      legacyState: leg.state,
      continuousState: cont.state,
      reversalScore: cont.reversalScore ?? null,
      structureScore: cont.componentScores?.structureScore ?? null,
      cvdScore: cont.componentScores?.cvdScore ?? null,
      exhaustionScore: cont.componentScores?.exhaustionScore ?? null,
      volumeScore: cont.componentScores?.volumeScore ?? null,
      isEffectivelyInactive: cont.isEffectivelyInactive ?? null,
      results: evalHorizons(klines, i, candle.close, side),
    };

    if (legacyActive) {
      samples.push({ ...base, kind: 'legacy' });
    }
    if (contActive) {
      samples.push({ ...base, kind: 'continuous' });
    }
    if (contActive && !legacyActive) {
      samples.push({ ...base, kind: 'new_only' });
    }
    if (legacyActive && !contActive) {
      samples.push({ ...base, kind: 'lost_only' });
    }
  }

  return samples;
}

async function main(): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    console.error(String(e));
    printHelp();
    process.exit(1);
    return;
  }
  if (opts.help) {
    printHelp();
    printDataHelp();
    process.exit(0);
    return;
  }

  const endMs = Date.now();
  const windowStartMs = endMs - opts.days * 86_400_000;

  console.log(
    `Backtest continuous TR | days=${opts.days} symbols=${opts.symbols.join(',')} | PASS≥${PASS_MOVE_PCT}% | horizons=${HORIZONS.join('/')}`,
  );
  console.log(
    `Flag on disk stays false; in-memory dual-load only. Rough estimate — not live trading.`,
  );

  // Capture default, restore at end
  const flagBefore = FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR;
  let legacyDet: DetectorApi;
  let contDet: DetectorApi;
  try {
    legacyDet = await loadDetector(false);
    contDet = await loadDetector(true);
  } finally {
    setContinuousFlag(Boolean(flagBefore));
  }

  // Keep modules bound; flag value already baked into each module's const at load.
  setContinuousFlag(Boolean(flagBefore));

  const allSamples: TradeSample[] = [];
  const sourceNotes: string[] = [];

  for (const symbol of opts.symbols) {
    try {
      const { klines, source } = await loadSymbolKlines1H(
        symbol,
        windowStartMs,
        endMs,
        opts.klinesDir,
      );
      sourceNotes.push(`${symbol}: ${source} (n=${klines.length})`);
      console.log(`[data] ${symbol}: ${klines.length} bars from ${source}`);

      if (klines.length < WARMUP_BARS + 50) {
        console.warn(
          `[warn] ${symbol}: too few bars (${klines.length}) — skip. Cần ≥${WARMUP_BARS + 50}.`,
        );
        printDataHelp();
        continue;
      }

      const samples = await runSymbol(
        symbol,
        klines,
        windowStartMs,
        endMs,
        legacyDet,
        contDet,
      );
      allSamples.push(...samples);
    } catch (e) {
      console.error(`[error] ${symbol}: ${String(e)}`);
      printDataHelp();
    }
  }

  if (allSamples.length === 0) {
    console.error('No samples produced.');
    printDataHelp();
    process.exit(2);
    return;
  }

  const summaryRows: Array<Record<string, string | number>> = [];
  const symbols = [...new Set(allSamples.map((s) => s.symbol))];

  for (const symbol of ['ALL', ...symbols]) {
    const pool =
      symbol === 'ALL'
        ? allSamples
        : allSamples.filter((s) => s.symbol === symbol);
    for (const kind of [
      'legacy',
      'continuous',
      'new_only',
      'lost_only',
    ] as SignalKind[]) {
      for (const h of HORIZONS) {
        const st = summarize(pool, kind, h);
        summaryRows.push({
          symbol,
          kind,
          horizon: `H${h}`,
          signals: st.signals,
          evaluated: st.evaluated,
          wins: st.wins,
          winrate: fmtPct(st.winrate),
        });
      }
    }
  }

  printTable('Summary by symbol × kind × horizon', summaryRows);

  // Highlight key rows
  const keyRows = summaryRows.filter(
    (r) =>
      r.symbol === 'ALL' &&
      (r.kind === 'new_only' || r.kind === 'lost_only' || r.kind === 'legacy' || r.kind === 'continuous'),
  );
  printTable('ALL — focus (new_only = quan trọng nhất)', keyRows);

  console.log('\nData sources:');
  for (const n of sourceNotes) console.log(`  - ${n}`);

  if (opts.csv) {
    writeCsv(path.resolve(opts.csv), allSamples, summaryRows);
  }
}

main().catch((err) => {
  console.error(err);
  printDataHelp();
  process.exit(1);
});

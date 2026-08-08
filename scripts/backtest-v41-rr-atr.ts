/**
 * Offline RR/ATR backtest trên tín hiệu ACTIVE đã có (CSV continuous).
 *
 * SL = entry ± 1.5×ATR14(1H); TP = SL_distance × R:R (1.5 / 2 / 2.5 / 3).
 * Duyệt tối đa 24 nến 1H sau entry; cùng nến chạm cả SL+TP → worst-case SL trước.
 * Timeout → đóng ở close nến 24, ghi PnL thực theo đơn vị R.
 *
 * KHÔNG sửa reversalDetector / flag / script backtest cũ.
 *
 * Usage:
 *   npx tsx scripts/backtest-v41-rr-atr.ts
 *   npx tsx scripts/backtest-v41-rr-atr.ts --trades-csv docs/exports/backtest-v41-continuous-90d.csv --csv docs/exports/backtest-v41-rr-atr.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { calculateATR, type KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ATR_PERIOD = 14;
const SL_ATR_MULT = 1.5;
const MAX_BARS = 24;
const RR_LEVELS = [1.5, 2, 2.5, 3] as const;
const FETCH_GAP_MS = 250;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP_BARS = 220;
const MS_1H = 3_600_000;

type RrLevel = (typeof RR_LEVELS)[number];
type Side = 'LONG' | 'SHORT';

type CliOptions = {
  tradesCsv: string;
  kind: string;
  csv: string | null;
  klinesDir: string | null;
  help: boolean;
};

type TradeInput = {
  symbol: string;
  openTime: number;
  entry: number;
  side: Side;
  trendDirection: string;
};

type HitKind = 'TP' | 'SL' | 'TIMEOUT' | 'NO_DATA';

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

type TradeResult = TradeInput & {
  atr: number | null;
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

function printHelp(): void {
  console.log(`backtest-v41-rr-atr.ts

  ATR-based SL/TP RR backtest on existing ACTIVE trades CSV.

Options:
  --trades-csv <path>  default docs/exports/backtest-v41-continuous-90d.csv
  --kind <name>        default continuous
  --csv <path>         output CSV
  --klines-dir <path>  local {SYMBOL}_1h.json preferred
  --help

SL = entry ± ${SL_ATR_MULT}×ATR${ATR_PERIOD}(1H)  |  TP = SL_dist × RR (${RR_LEVELS.join('/')})
Max hold ${MAX_BARS} bars  |  same-bar SL+TP → worst-case SL
`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    tradesCsv: path.resolve(
      __dirname,
      '../docs/exports/backtest-v41-continuous-90d.csv',
    ),
    kind: 'continuous',
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
    if (a === '--trades-csv') {
      opts.tradesCsv = path.resolve(args[++i] ?? opts.tradesCsv);
      continue;
    }
    if (a === '--kind') {
      opts.kind = args[++i] ?? 'continuous';
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
    throw new Error(`Unknown arg: ${a}`);
  }
  return opts;
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
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { klines?: unknown }).klines)
  ) {
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
      throw new Error(
        `Binance klines HTTP ${res.status} for ${symbol}: ${res.statusText}`,
      );
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
  symbol: string,
  startMs: number,
  endMs: number,
  klinesDir: string | null,
): Promise<{ klines: KlineV41[]; source: string }> {
  const fetchStart = startMs - WARMUP_BARS * MS_1H;
  if (klinesDir) {
    const file = findLocalKlinesFile(klinesDir, symbol);
    if (file) {
      const klines = parseLocalKlinesJson(fs.readFileSync(file, 'utf8')).filter(
        (k) => k.openTime >= fetchStart && k.openTime <= endMs,
      );
      return { klines, source: `local:${file}` };
    }
  }
  const klines = await fetchBinanceKlines1H(symbol, fetchStart, endMs);
  return { klines, source: 'binance:/fapi/v1/klines' };
}

function loadTradesFromCsv(filePath: string, kind: string): TradeInput[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith('symbol,kind,'));
  if (headerIdx < 0) throw new Error(`No trades header in ${filePath}`);
  const header = lines[headerIdx].split(',');
  const idx = (name: string) => header.indexOf(name);
  const iSymbol = idx('symbol');
  const iKind = idx('kind');
  const iOpen = idx('openTime');
  const iEntry = idx('entry');
  const iSide = idx('side');
  const iTrend = idx('trendDirection');

  const rows: TradeInput[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#') || line.startsWith('symbol,')) break;
    const cols = line.split(',');
    if (cols.length < header.length) break;
    if (cols[iKind] !== kind) continue;
    const side = cols[iSide];
    if (side !== 'LONG' && side !== 'SHORT') continue;
    rows.push({
      symbol: cols[iSymbol],
      openTime: Number(cols[iOpen]),
      entry: Number(cols[iEntry]),
      side,
      trendDirection: cols[iTrend],
    });
  }
  return rows;
}

/** ATR14 tại nến entry — dùng calculateATR (Wilder) từ services/v41/indicators. */
function atrAtIndex(klines: KlineV41[], idx: number): number | null {
  if (idx < ATR_PERIOD) return null;
  const window = klines.slice(0, idx + 1);
  const series = calculateATR(window, ATR_PERIOD);
  const atr = series[series.length - 1];
  if (!Number.isFinite(atr) || atr <= 0) return null;
  return atr;
}

function levelsFor(
  entry: number,
  side: Side,
  atr: number,
  rr: RrLevel,
): { sl: number; tp: number; slDistance: number } {
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
    const bar = klines[j];
    const hit = hitOnBar(side, bar, sl, tp);
    if (hit == null) continue;
    // Worst-case: same bar both → SL first
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

type SummaryStats = {
  scope: string;
  rr: RrLevel;
  n: number;
  evaluated: number;
  wins_tp: number;
  losses_sl: number;
  timeouts: number;
  no_data: number;
  winrate_tp: number | null;
  ev_R: number | null;
  sum_R: number | null;
};

function summarize(
  scope: string,
  trades: TradeResult[],
  rr: RrLevel,
): SummaryStats {
  let evaluated = 0;
  let wins = 0;
  let losses = 0;
  let timeouts = 0;
  let noData = 0;
  let sumR = 0;
  for (const t of trades) {
    const o = t.outcomes.find((x) => x.rr === rr);
    if (!o || o.resultR == null || o.hit === 'NO_DATA') {
      noData += 1;
      continue;
    }
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
    no_data: noData,
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

function summaryToRow(s: SummaryStats): Record<string, string | number> {
  return {
    scope: s.scope,
    rr: s.rr,
    n: s.n,
    evaluated: s.evaluated,
    wins_tp: s.wins_tp,
    losses_sl: s.losses_sl,
    timeouts: s.timeouts,
    no_data: s.no_data,
    winrate_tp: fmtPct(s.winrate_tp),
    EV_R: fmtR(s.ev_R),
    sum_R: fmtR(s.sum_R),
  };
}

function writeCsv(
  outPath: string,
  trades: TradeResult[],
  summaryRows: Array<Record<string, string | number>>,
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = [
    'symbol',
    'openTime',
    'iso',
    'entry',
    'side',
    'trendDirection',
    'atr14',
    'sl_distance',
    ...RR_LEVELS.flatMap((rr) => [
      `sl_rr${rr}`,
      `tp_rr${rr}`,
      `hit_rr${rr}`,
      `bars_rr${rr}`,
      `exit_rr${rr}`,
      `resultR_rr${rr}`,
    ]),
  ];
  const lines = trades.map((t) => {
    const baseSl = t.outcomes[0]?.slDistance ?? '';
    return [
      t.symbol,
      t.openTime,
      new Date(t.openTime).toISOString(),
      t.entry,
      t.side,
      t.trendDirection,
      t.atr ?? '',
      baseSl,
      ...RR_LEVELS.flatMap((rr) => {
        const o = t.outcomes.find((x) => x.rr === rr)!;
        return [
          o.sl,
          o.tp,
          o.hit,
          o.barsHeld ?? '',
          o.exitPrice ?? '',
          o.resultR ?? '',
        ];
      }),
    ].join(',');
  });

  const sumHeader = Object.keys(summaryRows[0] ?? { note: '' });
  const sumLines = summaryRows.map((r) =>
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
    process.exit(0);
    return;
  }

  if (!fs.existsSync(opts.tradesCsv)) {
    console.error(`Trades CSV not found: ${opts.tradesCsv}`);
    process.exit(1);
    return;
  }

  const tradesIn = loadTradesFromCsv(opts.tradesCsv, opts.kind);
  if (tradesIn.length === 0) {
    console.error(`No trades kind=${opts.kind} in ${opts.tradesCsv}`);
    process.exit(2);
    return;
  }

  const symbols = [...new Set(tradesIn.map((t) => t.symbol))];
  const minOpen = Math.min(...tradesIn.map((t) => t.openTime));
  const maxOpen = Math.max(...tradesIn.map((t) => t.openTime));

  console.log(
    `RR/ATR backtest | kind=${opts.kind} n=${tradesIn.length} symbols=${symbols.join(',')}`,
  );
  console.log(
    `SL=${SL_ATR_MULT}×ATR${ATR_PERIOD} | RR=${RR_LEVELS.join('/')} | maxBars=${MAX_BARS} | same-bar→SL`,
  );
  console.log(`Source trades: ${opts.tradesCsv}`);

  const klinesBySymbol = new Map<string, KlineV41[]>();
  for (const symbol of symbols) {
    const { klines, source } = await loadSymbolKlines1H(
      symbol,
      minOpen,
      maxOpen + MAX_BARS * MS_1H,
      opts.klinesDir,
    );
    klinesBySymbol.set(symbol, klines);
    console.log(`[data] ${symbol} 1h: ${klines.length} bars from ${source}`);
  }

  const results: TradeResult[] = [];
  let skippedNoBar = 0;
  let skippedNoAtr = 0;

  for (const t of tradesIn) {
    const klines = klinesBySymbol.get(t.symbol) ?? [];
    const entryIdx = klines.findIndex((k) => k.openTime === t.openTime);
    if (entryIdx < 0) {
      skippedNoBar += 1;
      results.push({
        ...t,
        atr: null,
        outcomes: RR_LEVELS.map((rr) => ({
          rr,
          sl: NaN,
          tp: NaN,
          slDistance: NaN,
          hit: 'NO_DATA' as const,
          barsHeld: null,
          exitPrice: null,
          resultR: null,
        })),
      });
      continue;
    }

    const atr = atrAtIndex(klines, entryIdx);
    if (atr == null) {
      skippedNoAtr += 1;
      results.push({
        ...t,
        atr: null,
        outcomes: RR_LEVELS.map((rr) => ({
          rr,
          sl: NaN,
          tp: NaN,
          slDistance: NaN,
          hit: 'NO_DATA' as const,
          barsHeld: null,
          exitPrice: null,
          resultR: null,
        })),
      });
      continue;
    }

    results.push({
      ...t,
      atr,
      outcomes: RR_LEVELS.map((rr) =>
        simulateRr(klines, entryIdx, t.entry, t.side, atr, rr),
      ),
    });
  }

  console.log(
    `Matched: ${results.length - skippedNoBar - skippedNoAtr} | noBar=${skippedNoBar} | noAtr=${skippedNoAtr}`,
  );

  const summaryRows: Array<Record<string, string | number>> = [];
  const allRows: SummaryStats[] = [];

  for (const rr of RR_LEVELS) {
    const s = summarize('ALL', results, rr);
    allRows.push(s);
    summaryRows.push(summaryToRow(s));
  }
  for (const symbol of symbols) {
    const subset = results.filter((r) => r.symbol === symbol);
    for (const rr of RR_LEVELS) {
      const s = summarize(symbol, subset, rr);
      allRows.push(s);
      summaryRows.push(summaryToRow(s));
    }
  }

  printTable(
    'ALL — EV by R:R',
    summaryRows.filter((r) => r.scope === 'ALL'),
  );
  printTable(
    'By symbol × R:R',
    summaryRows.filter((r) => r.scope !== 'ALL'),
  );

  const outPath =
    opts.csv ??
    path.resolve(__dirname, '../docs/exports/backtest-v41-rr-atr.csv');
  writeCsv(outPath, results, summaryRows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

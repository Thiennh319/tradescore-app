/**
 * Offline analysis — 2 lớp xác nhận độc lập trên tín hiệu Trend Reversal ACTIVE
 * đã có (từ CSV backtest trước).
 *
 * Lớp 1: TrendStrength 4H < 70 vs ≥ 70
 * Lớp 2: BTC lead (legacy activeConditionCount ≥ 2 trong 4h trước) — chỉ altcoin
 * Kết hợp: 4H yếu + BTC lead vs không thoả gì
 *
 * KHÔNG sửa reversalDetector.ts / feature flag / hằng production.
 *
 * Usage:
 *   npx tsx scripts/backtest-v41-tr-confirmation-layers.ts
 *   npx tsx scripts/backtest-v41-tr-confirmation-layers.ts --trades-csv docs/exports/backtest-v41-continuous-90d.csv --kind continuous
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEATURE_FLAGS } from '../config/featureFlags';
import { BINANCE_BASE_URL, type AppTradeSymbol } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import { computeTrendReversal } from '../services/v41/reversalDetector';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const FETCH_GAP_MS = 250;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP_BARS_4H = 220;
const WARMUP_BARS_1H = 220;
const TS_4H_WEAK_LT = 70;
const BTC_LEAD_LOOKBACK_H = 4;
const BTC_LEAD_MIN_SIGNALS = 2;
const ALT_SYMBOLS = new Set(['NEARUSDT', 'SOLUSDT', 'BNBUSDT']);

type CliOptions = {
  tradesCsv: string;
  kind: string;
  csv: string | null;
  klinesDir: string | null;
  help: boolean;
};

type TradeRow = {
  symbol: string;
  kind: string;
  openTime: number;
  entry: number;
  side: string;
  trendDirection: string;
  pass_h12: boolean | null;
  pct_h12: number | null;
};

type Enriched = TradeRow & {
  ts4h: number | null;
  ts4hWeak: boolean | null;
  btcLead: boolean | null; // null = BTC symbol (skipped) or missing data
  btcMaxActiveCount: number | null;
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
  console.log(`backtest-v41-tr-confirmation-layers.ts

  Enrich ACTIVE trades from a prior CSV with:
    (1) 4H TrendStrength weak (<${TS_4H_WEAK_LT}) vs strong
    (2) BTC lead (legacy ≥${BTC_LEAD_MIN_SIGNALS}/4 in ${BTC_LEAD_LOOKBACK_H}h before) — alts only
    (3) Combined both-good vs neither

Options:
  --trades-csv <path>  Input trades CSV (default docs/exports/backtest-v41-continuous-90d.csv)
  --kind <name>        Filter kind column (default continuous)
  --csv <path>         Write enriched + summary CSV
  --klines-dir <path>  Prefer local JSON ({SYMBOL}_1h.json / {SYMBOL}_4h.json)
  --help
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

function findLocalKlinesFile(
  dir: string,
  symbol: string,
  interval: '1h' | '4h',
): string | null {
  const candidates = [
    `${symbol}_${interval}.json`,
    `${symbol}-${interval}.json`,
    `${symbol}_${interval.toUpperCase()}.json`,
    interval === '1h' ? `${symbol}.json` : null,
  ].filter(Boolean) as string[];
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

async function fetchBinanceKlines(
  symbol: string,
  interval: '1h' | '4h',
  startMs: number,
  endMs: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursorEnd = endMs;

  while (cursorEnd > startMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));
    url.searchParams.set('startTime', String(startMs));

    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(
        `Binance klines HTTP ${res.status} for ${symbol} ${interval}: ${res.statusText}`,
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

async function loadKlines(
  symbol: string,
  interval: '1h' | '4h',
  startMs: number,
  endMs: number,
  klinesDir: string | null,
): Promise<{ klines: KlineV41[]; source: string }> {
  const warmupMs =
    (interval === '4h' ? WARMUP_BARS_4H : WARMUP_BARS_1H) *
    (interval === '4h' ? MS_4H : MS_1H);
  const fetchStart = startMs - warmupMs;

  if (klinesDir) {
    const file = findLocalKlinesFile(klinesDir, symbol, interval);
    if (file) {
      const klines = parseLocalKlinesJson(fs.readFileSync(file, 'utf8')).filter(
        (k) => k.openTime >= fetchStart && k.openTime <= endMs,
      );
      return { klines, source: `local:${file}` };
    }
  }

  const klines = await fetchBinanceKlines(symbol, interval, fetchStart, endMs);
  return { klines, source: `binance:/fapi/v1/klines?interval=${interval}` };
}

function loadTradesFromCsv(filePath: string, kind: string): TradeRow[] {
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
  const iPass = idx('pass_h12');
  const iPct = idx('pct_h12');

  const rows: TradeRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#') || line.startsWith('symbol,')) break;
    const cols = line.split(',');
    if (cols.length < header.length) break;
    if (cols[iKind] !== kind) continue;
    const passRaw = cols[iPass];
    rows.push({
      symbol: cols[iSymbol],
      kind: cols[iKind],
      openTime: Number(cols[iOpen]),
      entry: Number(cols[iEntry]),
      side: cols[iSide],
      trendDirection: cols[iTrend],
      pass_h12: passRaw === '' ? null : passRaw === '1',
      pct_h12: cols[iPct] === '' ? null : Number(cols[iPct]),
    });
  }
  return rows;
}

/** Nến 4H bao trùm openTime signal; window = mọi nến 4H đến hết nến đó. */
function trendStrength4HAt(
  klines4h: KlineV41[],
  openTime: number,
): number | null {
  const covering = [...klines4h]
    .reverse()
    .find(
      (k) =>
        k.openTime <= openTime && openTime < k.openTime + MS_4H,
    );
  if (!covering) return null;
  const window = klines4h.filter((k) => k.openTime <= covering.openTime);
  if (window.length < WARMUP_BARS_4H) return null;
  return calculateTrendStrength(window).trendStrength;
}

/**
 * BTC lead: trong [openTime-4h, openTime), bất kỳ nến 1H nào có
 * computeTrendReversal(legacy).detail.activeConditionCount >= 2.
 */
function btcLeadBefore(
  btc1h: KlineV41[],
  signalOpenTime: number,
): { lead: boolean; maxActiveCount: number } {
  const windowStart = signalOpenTime - BTC_LEAD_LOOKBACK_H * MS_1H;
  const bars = btc1h.filter(
    (k) => k.openTime >= windowStart && k.openTime < signalOpenTime,
  );
  let maxActiveCount = 0;
  for (const bar of bars) {
    const idx = btc1h.findIndex((k) => k.openTime === bar.openTime);
    if (idx < WARMUP_BARS_1H) continue;
    const window = btc1h.slice(0, idx + 1);
    const { trendDirection } = calculateTrendStrength(window);
    if (trendDirection === 'NEUTRAL') continue;
    const tr = computeTrendReversal({
      klines1H: window,
      trendDirection,
    });
    const n = tr.detail.activeConditionCount;
    if (n > maxActiveCount) maxActiveCount = n;
  }
  return {
    lead: maxActiveCount >= BTC_LEAD_MIN_SIGNALS,
    maxActiveCount,
  };
}

type GroupStats = {
  label: string;
  n: number;
  evaluated: number;
  wins: number;
  winrate: number | null;
};

function statsFor(
  label: string,
  rows: Enriched[],
): GroupStats {
  let evaluated = 0;
  let wins = 0;
  for (const r of rows) {
    if (r.pass_h12 == null) continue;
    evaluated += 1;
    if (r.pass_h12) wins += 1;
  }
  return {
    label,
    n: rows.length,
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

function toRow(g: GroupStats): Record<string, string | number> {
  return {
    group: g.label,
    n: g.n,
    evaluated: g.evaluated,
    wins: g.wins,
    winrate_H12: fmtPct(g.winrate),
  };
}

function writeCsv(
  outPath: string,
  enriched: Enriched[],
  summaryRows: Array<Record<string, string | number>>,
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = [
    'symbol',
    'kind',
    'openTime',
    'iso',
    'entry',
    'side',
    'trendDirection',
    'pct_h12',
    'pass_h12',
    'ts4h',
    'ts4hWeak',
    'btcLead',
    'btcMaxActiveCount',
  ];
  const lines = enriched.map((r) =>
    [
      r.symbol,
      r.kind,
      r.openTime,
      new Date(r.openTime).toISOString(),
      r.entry,
      r.side,
      r.trendDirection,
      r.pct_h12 ?? '',
      r.pass_h12 == null ? '' : r.pass_h12 ? 1 : 0,
      r.ts4h ?? '',
      r.ts4hWeak == null ? '' : r.ts4hWeak ? 1 : 0,
      r.btcLead == null ? '' : r.btcLead ? 1 : 0,
      r.btcMaxActiveCount ?? '',
    ].join(','),
  );
  const sumHeader = Object.keys(summaryRows[0] ?? { note: '' });
  const sumLines = summaryRows.map((r) =>
    sumHeader.map((k) => String(r[k])).join(','),
  );
  const body = [
    '# enriched trades',
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

  if (FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR !== false) {
    console.warn(
      '[warn] USE_CONTINUOUS_SCORING_TR is not false — BTC lead still imports computeTrendReversal; ensure flag reads false for legacy signal counts.',
    );
  }

  if (!fs.existsSync(opts.tradesCsv)) {
    console.error(`Trades CSV not found: ${opts.tradesCsv}`);
    process.exit(1);
    return;
  }

  const trades = loadTradesFromCsv(opts.tradesCsv, opts.kind);
  if (trades.length === 0) {
    console.error(`No trades with kind=${opts.kind} in ${opts.tradesCsv}`);
    process.exit(2);
    return;
  }

  const openTimes = trades.map((t) => t.openTime);
  const minOpen = Math.min(...openTimes);
  const maxOpen = Math.max(...openTimes);
  const symbols = [...new Set(trades.map((t) => t.symbol))];

  console.log(
    `Confirmation layers | kind=${opts.kind} n=${trades.length} symbols=${symbols.join(',')}`,
  );
  console.log(
    `Source: ${opts.tradesCsv} | flag continuous=${FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR}`,
  );
  console.log(
    `L1: TS4H weak < ${TS_4H_WEAK_LT} | L2: BTC lead ≥${BTC_LEAD_MIN_SIGNALS}/4 in ${BTC_LEAD_LOOKBACK_H}h before (alts only)`,
  );

  const klines4hBySymbol = new Map<string, KlineV41[]>();
  for (const symbol of symbols) {
    const { klines, source } = await loadKlines(
      symbol,
      '4h',
      minOpen,
      maxOpen + MS_4H,
      opts.klinesDir,
    );
    klines4hBySymbol.set(symbol, klines);
    console.log(`[data] ${symbol} 4h: ${klines.length} bars from ${source}`);
  }

  const { klines: btc1h, source: btcSrc } = await loadKlines(
    'BTCUSDT',
    '1h',
    minOpen - BTC_LEAD_LOOKBACK_H * MS_1H,
    maxOpen,
    opts.klinesDir,
  );
  console.log(`[data] BTCUSDT 1h: ${btc1h.length} bars from ${btcSrc}`);

  const enriched: Enriched[] = trades.map((t) => {
    const k4 = klines4hBySymbol.get(t.symbol) ?? [];
    const ts4h = trendStrength4HAt(k4, t.openTime);
    const ts4hWeak = ts4h == null ? null : ts4h < TS_4H_WEAK_LT;

    let btcLead: boolean | null = null;
    let btcMaxActiveCount: number | null = null;
    if (ALT_SYMBOLS.has(t.symbol)) {
      const lead = btcLeadBefore(btc1h, t.openTime);
      btcLead = lead.lead;
      btcMaxActiveCount = lead.maxActiveCount;
    }

    return {
      ...t,
      ts4h,
      ts4hWeak,
      btcLead,
      btcMaxActiveCount,
    };
  });

  const withH12 = enriched.filter((r) => r.pass_h12 != null);
  const baseline = statsFor('ALL (baseline)', withH12);

  const l1Weak = statsFor(
    '4H yếu (TS<70)',
    withH12.filter((r) => r.ts4hWeak === true),
  );
  const l1Strong = statsFor(
    '4H mạnh (TS≥70)',
    withH12.filter((r) => r.ts4hWeak === false),
  );
  const l1Missing = statsFor(
    '4H missing TS',
    withH12.filter((r) => r.ts4hWeak == null),
  );

  const alts = withH12.filter((r) => ALT_SYMBOLS.has(r.symbol));
  const l2Lead = statsFor(
    'Có BTC lead',
    alts.filter((r) => r.btcLead === true),
  );
  const l2NoLead = statsFor(
    'Không BTC lead',
    alts.filter((r) => r.btcLead === false),
  );

  const bothGood = statsFor(
    'Cả 2 tốt (4H yếu + BTC lead)',
    alts.filter((r) => r.ts4hWeak === true && r.btcLead === true),
  );
  const neither = statsFor(
    'Không thoả gì (4H mạnh + không lead)',
    alts.filter((r) => r.ts4hWeak === false && r.btcLead === false),
  );
  const only4h = statsFor(
    'Chỉ 4H yếu',
    alts.filter((r) => r.ts4hWeak === true && r.btcLead === false),
  );
  const onlyBtc = statsFor(
    'Chỉ BTC lead',
    alts.filter((r) => r.ts4hWeak === false && r.btcLead === true),
  );

  printTable('Baseline H12', [toRow(baseline)]);
  printTable('Lớp 1 — 4H TrendStrength filter (all symbols)', [
    toRow(l1Weak),
    toRow(l1Strong),
    toRow(l1Missing),
  ]);
  printTable('Lớp 2 — BTC lead (NEAR/SOL/BNB only)', [
    toRow(statsFor('Alts baseline', alts)),
    toRow(l2Lead),
    toRow(l2NoLead),
  ]);
  printTable('Kết hợp — alts only', [
    toRow(bothGood),
    toRow(neither),
    toRow(only4h),
    toRow(onlyBtc),
  ]);

  const summaryRows = [
    { section: 'baseline', ...toRow(baseline) },
    { section: 'L1', ...toRow(l1Weak) },
    { section: 'L1', ...toRow(l1Strong) },
    { section: 'L1', ...toRow(l1Missing) },
    { section: 'L2', ...toRow(statsFor('Alts baseline', alts)) },
    { section: 'L2', ...toRow(l2Lead) },
    { section: 'L2', ...toRow(l2NoLead) },
    { section: 'combo', ...toRow(bothGood) },
    { section: 'combo', ...toRow(neither) },
    { section: 'combo', ...toRow(only4h) },
    { section: 'combo', ...toRow(onlyBtc) },
  ];

  const outPath =
    opts.csv ??
    path.resolve(
      __dirname,
      '../docs/exports/backtest-v41-tr-confirmation-layers.csv',
    );
  writeCsv(outPath, enriched, summaryRows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

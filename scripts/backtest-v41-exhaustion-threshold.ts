/**
 * Offline backtest — hạ ngưỡng trend_exhaustion_gate trên BINARY LEGACY.
 *
 * KHÔNG liên quan continuous scoring / USE_CONTINUOUS_SCORING_TR (giữ false).
 * KHÔNG sửa reversalDetector.ts / hằng số production.
 * Override gate CHỈ trong script: signals.trendExhaustion =
 *   trendExhaustion >= threshold (threshold ∈ {40,45,50,55}).
 *
 * Confidence scoring vẫn khớp binary cũ (baseline exhaustion score dùng 55
 * trong công thức điểm — chỉ boolean gate đổi theo threshold thử nghiệm).
 *
 * Usage:
 *   npx tsx scripts/backtest-v41-exhaustion-threshold.ts --days 90 --symbols NEAR,SOL,BNB,BTC
 *   npx tsx scripts/backtest-v41-exhaustion-threshold.ts --csv docs/exports/backtest-v41-exhaustion-threshold.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEATURE_FLAGS } from '../config/featureFlags';
import { BINANCE_BASE_URL, type AppTradeSymbol } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import {
  detectCvdFlip,
  detectStructureBreak,
  detectTrendReversalVolumeConfirmation,
  resolveTrendReversalState,
  TREND_REVERSAL_CONFIDENCE_MIN,
  TREND_REVERSAL_ACTIVE_MIN_SIGNALS,
  type TrendReversalSignals,
} from '../services/v41/reversalDetector';
import { calculateTrendExhaustion } from '../services/v41/trendExhaustionEngine';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Same mapping as services/v41/rawMarketFetcher.adaptBinanceKline — inlined for Node. */
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
const WARMUP_BARS = 220;
const FETCH_GAP_MS = 250;
const BINANCE_MAX_LIMIT = 1500;
const VOLUME_MA_PERIOD = 20;

/** Production scoring baseline (không đổi) — chỉ gate boolean dùng THRESHOLDS. */
const EXHAUSTION_SCORE_BASELINE = 55;
const TREND_REVERSAL_VOLUME_MULTIPLIER = 1.2;

/** Ngưỡng thử nghiệm; 55 = baseline production. */
const EXHAUSTION_GATE_THRESHOLDS = [40, 45, 50, 55] as const;

type Horizon = (typeof HORIZONS)[number];
type ExhaustionGate = (typeof EXHAUSTION_GATE_THRESHOLDS)[number];

type CliOptions = {
  days: number;
  symbols: AppTradeSymbol[];
  csv: string | null;
  klinesDir: string | null;
  help: boolean;
};

type TradeSample = {
  symbol: string;
  exhaustionGate: ExhaustionGate;
  openTime: number;
  entry: number;
  side: 'LONG' | 'SHORT';
  trendDirection: TrendDirection;
  state: 'ACTIVE' | 'WATCH';
  activeConditionCount: number;
  confidence: number;
  trendExhaustionRaw: number;
  exhaustionGatePass: boolean;
  signals: TrendReversalSignals;
  results: Record<Horizon, { pct: number | null; pass: boolean | null }>;
};

function printHelp(): void {
  console.log(`backtest-v41-exhaustion-threshold.ts

  npx tsx scripts/backtest-v41-exhaustion-threshold.ts [options]

Options:
  --days <n>           Lookback calendar days (default 90)
  --symbols <list>     Comma list NEAR,SOL,BNB,BTC (default NEAR,SOL,BNB,BTC)
  --klines-dir <path>  Prefer local JSON klines
  --csv <path>         Write trade-level + summary CSV
  --help

Binary legacy only (resolveTrendReversalState ≥${TREND_REVERSAL_ACTIVE_MIN_SIGNALS}/4 + confidence ≥${TREND_REVERSAL_CONFIDENCE_MIN}).
Exhaustion gates tested: ${EXHAUSTION_GATE_THRESHOLDS.join(', ')} (55 = production baseline).
Does NOT touch USE_CONTINUOUS_SCORING_TR or reversalDetector.ts constants.
`);
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    days: 90,
    symbols: ['NEARUSDT', 'SOLUSDT', 'BNBUSDT', 'BTCUSDT'],
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

function sideFromTrend(trend: TrendDirection): 'LONG' | 'SHORT' | null {
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

function cvdProxy(kline: KlineV41): number {
  return kline.takerBuyVolume - (kline.volume - kline.takerBuyVolume);
}

/** Mirror private score* helpers in reversalDetector (production baselines). */
function scoreCvdFlipComponent(
  confirmed: boolean,
  cvdLast3: [number, number, number],
): number {
  if (!confirmed) return 0;
  const priorAvg = (cvdLast3[0] + cvdLast3[1]) / 2;
  const flipMag = Math.abs(cvdLast3[2] - priorAvg);
  return Math.min(100, 55 + flipMag / 10);
}

function scoreVolumeComponent(confirmed: boolean, volumeRatio: number): number {
  if (!confirmed) return 0;
  return Math.min(
    100,
    50 + ((volumeRatio - TREND_REVERSAL_VOLUME_MULTIPLIER) / 0.8) * 50,
  );
}

function scoreExhaustionComponent(
  confirmed: boolean,
  trendExhaustion: number,
): number {
  if (!confirmed) return 0;
  return Math.min(
    100,
    50 + ((trendExhaustion - EXHAUSTION_SCORE_BASELINE) / 45) * 50,
  );
}

function scoreStructureComponent(confirmed: boolean): number {
  return confirmed ? 70 : 0;
}

function computeBinaryConfidence(
  signals: TrendReversalSignals,
  cvdLast3: [number, number, number],
  volumeRatio: number,
  trendExhaustion: number,
): number {
  const scores = [
    scoreCvdFlipComponent(signals.cvdFlip, cvdLast3),
    scoreVolumeComponent(signals.volumeConfirmation, volumeRatio),
    scoreExhaustionComponent(signals.trendExhaustion, trendExhaustion),
    scoreStructureComponent(signals.structureBreak),
  ];
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

/**
 * Binary legacy ACTIVE/WATCH với exhaustion gate override (in-script only).
 * Khớp computeTrendReversal nhánh USE_CONTINUOUS_SCORING_TR=false, trừ
 * `trendExhaustion >= gate` thay vì cố định 55.
 */
function computeBinaryLegacyWithGate(
  klines1H: KlineV41[],
  trendDirection: TrendDirection,
  exhaustionGate: ExhaustionGate,
): {
  state: 'ACTIVE' | 'WATCH';
  signals: TrendReversalSignals;
  confidence: number;
  activeConditionCount: number;
  trendExhaustionRaw: number;
} {
  if (trendDirection === 'NEUTRAL' || klines1H.length < VOLUME_MA_PERIOD + 1) {
    return {
      state: 'WATCH',
      signals: {
        cvdFlip: false,
        volumeConfirmation: false,
        trendExhaustion: false,
        structureBreak: false,
      },
      confidence: 0,
      activeConditionCount: 0,
      trendExhaustionRaw: 0,
    };
  }

  const cvdFlip = detectCvdFlip(klines1H, trendDirection);
  const volume = detectTrendReversalVolumeConfirmation(klines1H);
  const exhaustion = calculateTrendExhaustion(klines1H, trendDirection);
  const structure = detectStructureBreak(klines1H, trendDirection);
  const cvdLast3 = klines1H.slice(-3).map(cvdProxy) as [number, number, number];

  const signals: TrendReversalSignals = {
    cvdFlip,
    volumeConfirmation: volume.confirmed,
    trendExhaustion: exhaustion.trendExhaustion >= exhaustionGate,
    structureBreak: structure.confirmed,
  };

  const confidence = computeBinaryConfidence(
    signals,
    cvdLast3,
    volume.volumeRatio,
    exhaustion.trendExhaustion,
  );
  const activeConditionCount = [
    signals.cvdFlip,
    signals.volumeConfirmation,
    signals.trendExhaustion,
    signals.structureBreak,
  ].filter(Boolean).length;

  return {
    state: resolveTrendReversalState(signals, confidence),
    signals,
    confidence,
    activeConditionCount,
    trendExhaustionRaw: exhaustion.trendExhaustion,
  };
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
  symbol: AppTradeSymbol,
  startMs: number,
  endMs: number,
  klinesDir: string | null,
): Promise<{ klines: KlineV41[]; source: string }> {
  if (klinesDir) {
    const file = findLocalKlinesFile(klinesDir, symbol);
    if (file) {
      const klines = parseLocalKlinesJson(fs.readFileSync(file, 'utf8')).filter(
        (k) =>
          k.openTime >= startMs - WARMUP_BARS * 3_600_000 && k.openTime <= endMs,
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
=== Hướng dẫn klines local ===
  {SYMBOL}_1h.json | {SYMBOL}-1h.json | {SYMBOL}.json
Public REST: ${BINANCE_BASE_URL}/fapi/v1/klines?symbol=NEARUSDT&interval=1h&limit=1500
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

function summarizeActive(
  samples: TradeSample[],
  gate: ExhaustionGate,
  horizon: Horizon,
): WinStats {
  const subset = samples.filter(
    (s) => s.exhaustionGate === gate && s.state === 'ACTIVE',
  );
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

  const activeOnly = samples.filter((s) => s.state === 'ACTIVE');
  const tradeHeader = [
    'symbol',
    'exhaustionGate',
    'openTime',
    'iso',
    'entry',
    'side',
    'trendDirection',
    'state',
    'activeConditionCount',
    'confidence',
    'trendExhaustionRaw',
    'exhaustionGatePass',
    'cvdFlip',
    'volumeConfirmation',
    'structureBreak',
    ...HORIZONS.flatMap((n) => [`pct_h${n}`, `pass_h${n}`]),
  ];
  const tradeLines = activeOnly.map((s) =>
    [
      s.symbol,
      s.exhaustionGate,
      s.openTime,
      new Date(s.openTime).toISOString(),
      s.entry,
      s.side,
      s.trendDirection,
      s.state,
      s.activeConditionCount,
      s.confidence,
      s.trendExhaustionRaw,
      s.exhaustionGatePass ? 1 : 0,
      s.signals.cvdFlip ? 1 : 0,
      s.signals.volumeConfirmation ? 1 : 0,
      s.signals.structureBreak ? 1 : 0,
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
    '# trades (ACTIVE only)',
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

function runSymbol(
  symbol: AppTradeSymbol,
  klines: KlineV41[],
  windowStartMs: number,
  windowEndMs: number,
): TradeSample[] {
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

    const results = evalHorizons(klines, i, candle.close, side);

    for (const gate of EXHAUSTION_GATE_THRESHOLDS) {
      const tr = computeBinaryLegacyWithGate(window, trendDirection, gate);
      if (tr.state !== 'ACTIVE') continue;

      samples.push({
        symbol,
        exhaustionGate: gate,
        openTime: candle.openTime,
        entry: candle.close,
        side,
        trendDirection,
        state: tr.state,
        activeConditionCount: tr.activeConditionCount,
        confidence: tr.confidence,
        trendExhaustionRaw: tr.trendExhaustionRaw,
        exhaustionGatePass: tr.signals.trendExhaustion,
        signals: tr.signals,
        results,
      });
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

  if (FEATURE_FLAGS.USE_CONTINUOUS_SCORING_TR !== false) {
    console.warn(
      '[warn] USE_CONTINUOUS_SCORING_TR is not false on disk — this script still uses binary detectors only (no continuous path).',
    );
  }

  const endMs = Date.now();
  const windowStartMs = endMs - opts.days * 86_400_000;

  console.log(
    `Backtest exhaustion-gate (binary legacy) | days=${opts.days} symbols=${opts.symbols.join(',')} | PASS≥${PASS_MOVE_PCT}% | horizons=${HORIZONS.join('/')}`,
  );
  console.log(
    `Gates=${EXHAUSTION_GATE_THRESHOLDS.join('/')} | ACTIVE ≥${TREND_REVERSAL_ACTIVE_MIN_SIGNALS}/4 + conf≥${TREND_REVERSAL_CONFIDENCE_MIN} | continuous flag untouched`,
  );

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

      allSamples.push(
        ...runSymbol(symbol, klines, windowStartMs, endMs),
      );
    } catch (e) {
      console.error(`[error] ${symbol}: ${String(e)}`);
      printDataHelp();
    }
  }

  const summaryRows: Array<Record<string, string | number>> = [];
  for (const gate of EXHAUSTION_GATE_THRESHOLDS) {
    for (const h of HORIZONS) {
      const st = summarizeActive(allSamples, gate, h);
      summaryRows.push({
        scope: 'ALL',
        exhaustionGate: gate,
        baseline: gate === 55 ? 'yes' : 'no',
        horizon: `H${h}`,
        active_signals: st.signals,
        evaluated: st.evaluated,
        wins: st.wins,
        winrate: fmtPct(st.winrate),
      });
    }
  }

  for (const symbol of opts.symbols) {
    const symSamples = allSamples.filter((s) => s.symbol === symbol);
    for (const gate of EXHAUSTION_GATE_THRESHOLDS) {
      for (const h of HORIZONS) {
        const st = summarizeActive(symSamples, gate, h);
        summaryRows.push({
          scope: symbol,
          exhaustionGate: gate,
          baseline: gate === 55 ? 'yes' : 'no',
          horizon: `H${h}`,
          active_signals: st.signals,
          evaluated: st.evaluated,
          wins: st.wins,
          winrate: fmtPct(st.winrate),
        });
      }
    }
  }

  printTable(
    'ALL — exhaustionGate × horizon (ACTIVE only)',
    summaryRows.filter((r) => r.scope === 'ALL'),
  );

  printTable(
    'Pivot — ACTIVE count + WR by gate',
    EXHAUSTION_GATE_THRESHOLDS.map((gate) => {
      const h6 = summarizeActive(allSamples, gate, 6);
      const h12 = summarizeActive(allSamples, gate, 12);
      const h24 = summarizeActive(allSamples, gate, 24);
      return {
        exhaustionGate: gate,
        baseline: gate === 55 ? 'yes' : 'no',
        ACTIVE: h12.signals,
        WR_H6: fmtPct(h6.winrate),
        WR_H12: fmtPct(h12.winrate),
        WR_H24: fmtPct(h24.winrate),
        n_H6: `${h6.wins}/${h6.evaluated}`,
        n_H12: `${h12.wins}/${h12.evaluated}`,
        n_H24: `${h24.wins}/${h24.evaluated}`,
      };
    }),
  );

  console.log('\nData sources:');
  for (const n of sourceNotes) console.log(`  - ${n}`);

  const outPath =
    opts.csv ??
    path.resolve(
      __dirname,
      '../docs/exports/backtest-v41-exhaustion-threshold.csv',
    );
  writeCsv(outPath, allSamples, summaryRows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

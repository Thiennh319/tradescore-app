/**
 * V4.1 Decision Confidence funnel — bar-level dump qua full Confidence → Decision path.
 *
 * Tooling cho sweep threshold Decision (Task 1). KHÔNG sửa decisionConfig / engine.
 *
 * Path khớp RC3 ViewModel:
 *   evaluateTrendReversalWithContext → computeConfidenceEngineResult
 *   → computeDecisionEngineResult (+ EW / Momentum / eligibility đọc kèm)
 *
 * Dump mỗi 1H bar trong cửa sổ (sau warmup): finalConfidence (Decision),
 * confTR, decision, TR confirmed, Market Context dims, EW, Momentum, hardBlocks.
 *
 * Usage:
 *   npx tsx scripts/backtest-v41-near-pipeline-funnel.ts --symbol BNB --days 14
 *   npx tsx scripts/backtest-v41-near-pipeline-funnel.ts --symbol NEAR --days 180 --csv docs/exports/v41-funnel-NEAR-180d.csv
 *   npx tsx scripts/backtest-v41-near-pipeline-funnel.ts --symbol BTC --days 7 --csv docs/exports/v41-funnel-smoke.csv
 *
 * Alias giữ tên file cũ; hỗ trợ BTC|SOL|BNB|NEAR (và *USDT).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { computeConfidenceEngineResult } from '../services/v41/confidenceEngine';
import { readConfidenceDecisionContext } from '../services/v41/confidence/decisionContext';
import { V41_DECISION_CONFIG } from '../services/v41/decision/decisionConfig';
import {
  computeDecisionEngineResult,
  isEligibleForDirection,
} from '../services/v41/decisionEngine';
import { computeRawEarlyWarning } from '../services/v41/earlyWarningEngine';
import type { KlineV41 } from '../services/v41/indicators';
import { evaluateTrendReversalWithContext } from '../services/v41/marketContextFilter';
import { computeMomentum1H } from '../services/v41/momentumEngine1H';
import { calculateTrendStrength } from '../services/v41/trendStrengthEngine';
import type { TrendDirection } from '../services/v41/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type AppTradeSymbol = 'BTCUSDT' | 'SOLUSDT' | 'BNBUSDT' | 'NEARUSDT';

const SYMBOL_ALIASES: Record<string, AppTradeSymbol> = {
  BTC: 'BTCUSDT',
  BTCUSDT: 'BTCUSDT',
  SOL: 'SOLUSDT',
  SOLUSDT: 'SOLUSDT',
  BNB: 'BNBUSDT',
  BNBUSDT: 'BNBUSDT',
  NEAR: 'NEARUSDT',
  NEARUSDT: 'NEARUSDT',
};

const DEFAULT_SYMBOL: AppTradeSymbol = 'NEARUSDT';
const DEFAULT_DAYS = 14;
const WARMUP_BARS = 220;
const FETCH_GAP_MS = 250;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MS_30M = 1_800_000;
const MS_4H = 4 * MS_1H;

type FunnelRow = {
  symbol: string;
  openTime: number;
  iso: string;
  trendDirection: TrendDirection;
  proposedSide: 'LONG' | 'SHORT' | 'NONE';
  confTR: number | null;
  finalConfidence: number | null;
  decision: string;
  trendReversalConfirmed: 0 | 1;
  trState: string;
  preContextState: string;
  trActive: 0 | 1;
  contextApplied: 0 | 1;
  contextPass: 0 | 1;
  ctxBtc: string;
  ctxFunding: string;
  ctxOi: string;
  ctxWhale: string;
  ctxVolatility: string;
  ewSeverity: string;
  ewPass: 0 | 1;
  momentumLong: 0 | 1;
  momentumShort: 0 | 1;
  momentumPass: 0 | 1;
  eligible: 0 | 1;
  hardBlocks: string;
  activeConditionCount: number | null;
  completenessMultiplier: number | null;
  proposedDirection: string;
  bandLt45: 0 | 1;
  band45to75: 0 | 1;
  bandGe75: 0 | 1;
  finalPropose: 0 | 1;
};

function parseSymbol(raw: string): AppTradeSymbol {
  const key = raw.trim().toUpperCase();
  const sym = SYMBOL_ALIASES[key];
  if (!sym) {
    throw new Error(`Unknown --symbol ${raw}. Use BTC|SOL|BNB|NEAR (or *USDT).`);
  }
  return sym;
}

function parseArgs(argv: string[]): {
  symbol: AppTradeSymbol;
  days: number;
  csvOut: string;
} {
  let symbol = DEFAULT_SYMBOL;
  let days = DEFAULT_DAYS;
  let csvOut = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol') symbol = parseSymbol(argv[++i] ?? '');
    else if (a === '--days') days = Math.max(1, Number(argv[++i] ?? days));
    else if (a === '--csv') csvOut = path.resolve(argv[++i] ?? '');
  }
  if (!csvOut) {
    const short = symbol.replace('USDT', '');
    csvOut = path.resolve(
      __dirname,
      `../docs/exports/v41-decision-funnel-${short}-${days}d.csv`,
    );
  }
  return { symbol, days, csvOut };
}

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

async function fetchKlines(
  symbol: string,
  interval: '30m' | '1h' | '4h',
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
    if (!res.ok) throw new Error(`klines ${symbol} ${interval} HTTP ${res.status}`);
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

async function fetchFundingRate(symbol: string): Promise<number | undefined> {
  try {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/premiumIndex`);
    url.searchParams.set('symbol', symbol);
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { lastFundingRate?: string };
    const v = Number(json.lastFundingRate);
    return Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function dimTag(
  dim: { pass: boolean; skipped?: boolean } | undefined,
): string {
  if (!dim) return 'NA';
  if (dim.skipped) return 'SKIP';
  return dim.pass ? 'PASS' : 'FAIL';
}

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
    cols.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  console.log(line(keys));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(keys.map((k) => String(r[k]))));
}

function writeCsv(
  outPath: string,
  rows: FunnelRow[],
  summary: Array<Record<string, string | number>>,
  meta: { symbol: string; days: number },
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const header = [
    'symbol',
    'openTime',
    'iso',
    'trendDirection',
    'proposedSide',
    'confTR',
    'finalConfidence',
    'decision',
    'trendReversalConfirmed',
    'trState',
    'preContextState',
    'trActive',
    'contextApplied',
    'contextPass',
    'ctxBtc',
    'ctxFunding',
    'ctxOi',
    'ctxWhale',
    'ctxVolatility',
    'ewSeverity',
    'ewPass',
    'momentumLong',
    'momentumShort',
    'momentumPass',
    'eligible',
    'hardBlocks',
    'activeConditionCount',
    'completenessMultiplier',
    'proposedDirection',
    'bandLt45',
    'band45to75',
    'bandGe75',
    'finalPropose',
  ] as const;

  const lines = rows.map((r) =>
    header.map((k) => csvEscape(r[k] as string | number | null)).join(','),
  );
  const sumHeader = Object.keys(summary[0] ?? { note: '' });
  const sumLines = summary.map((r) =>
    sumHeader.map((k) => csvEscape(r[k])).join(','),
  );

  fs.writeFileSync(
    outPath,
    [
      `# v41 decision funnel | ${meta.symbol} | days=${meta.days} | path=RC3 binary TR→Confidence→Decision`,
      `# finalConfidence = Confidence Engine (Decision threshold SSOT); confTR = detail.confidence`,
      `# bands vs decisionConfig thresholds: ignore/watch floor 45, long/short 75`,
      header.join(','),
      ...lines,
      '',
      '# summary',
      sumHeader.join(','),
      ...sumLines,
      '',
    ].join('\n'),
    'utf8',
  );
  console.log(`\nWrote CSV: ${outPath} (${rows.length} bars)`);
}

async function main(): Promise<void> {
  const { symbol, days, csvOut } = parseArgs(process.argv.slice(2));
  const endMs = Date.now();
  const windowStartMs = endMs - days * 86_400_000;
  const shortName = symbol.replace('USDT', '');

  console.log(
    `V4.1 Decision funnel | ${symbol} days=${days} | binary TR path (RC3 parity)`,
  );
  console.log(`CSV → ${csvOut}`);
  console.log(
    `Decision thresholds (read-only): long/short=${V41_DECISION_CONFIG.thresholds.long} watch=${V41_DECISION_CONFIG.thresholds.watch}`,
  );

  const fetchStart1h = windowStartMs - WARMUP_BARS * MS_1H;
  const fetchStart30m = windowStartMs - WARMUP_BARS * MS_30M;
  const fetchStart4h = windowStartMs - 80 * MS_4H;

  const [sym1h, sym30m, sym4h, btc1h, btc4h, fundingRate] = await Promise.all([
    fetchKlines(symbol, '1h', fetchStart1h, endMs),
    fetchKlines(symbol, '30m', fetchStart30m, endMs),
    fetchKlines(symbol, '4h', fetchStart4h, endMs),
    fetchKlines('BTCUSDT', '1h', fetchStart1h, endMs),
    fetchKlines('BTCUSDT', '4h', fetchStart4h, endMs),
    fetchFundingRate(symbol),
  ]);

  console.log(
    `[data] ${shortName} 1h=${sym1h.length} 30m=${sym30m.length} 4h=${sym4h.length} | BTC 1h=${btc1h.length} 4h=${btc4h.length} | funding=${fundingRate ?? 'n/a'}`,
  );

  const startIdx = sym1h.findIndex((k) => k.openTime >= windowStartMs);
  if (startIdx < 0) {
    console.error(`No ${symbol} 1H bars in window`);
    process.exit(2);
  }

  const rows: FunnelRow[] = [];
  let nBars = 0;
  let nNonNeutral = 0;

  for (let i = Math.max(startIdx, WARMUP_BARS); i < sym1h.length; i++) {
    const candle = sym1h[i]!;
    if (candle.openTime > endMs) break;
    nBars += 1;

    const win1h = sym1h.slice(0, i + 1);
    const { trendDirection } = calculateTrendStrength(win1h);
    if (trendDirection !== 'NEUTRAL') nNonNeutral += 1;

    const proposedSide: 'LONG' | 'SHORT' | 'NONE' =
      trendDirection === 'BEAR'
        ? 'LONG'
        : trendDirection === 'BULL'
          ? 'SHORT'
          : 'NONE';

    const k4 = sliceUpTo(sym4h, candle.openTime);
    const btc4 = sliceUpTo(btc4h, candle.openTime);
    const withCtx = evaluateTrendReversalWithContext(
      { klines1H: win1h, trendDirection, symbol },
      {
        fundingRate,
        klines4H: k4.length > 0 ? k4 : undefined,
        btcKlines4H: btc4.length > 0 ? btc4 : undefined,
      },
    );

    const trActive =
      withCtx.preContextState === 'ACTIVE' || withCtx.state === 'ACTIVE' ? 1 : 0;
    const contextApplied = withCtx.marketContext?.applied === true ? 1 : 0;
    const contextPass =
      contextApplied === 1 && withCtx.marketContext?.pass === true
        ? 1
        : contextApplied === 1
          ? 0
          : withCtx.state === 'ACTIVE'
            ? 1
            : 0;

    const dims = withCtx.marketContext?.dimensions;

    const ew = computeRawEarlyWarning({
      klines30M: sliceUpTo(sym30m, candle.openTime),
      klines1H: win1h,
      btcKlines1H: sliceUpTo(btc1h, candle.openTime),
      trendDirection,
    });
    const ewSeverity = ew.rawSeverity;
    const ewPass = ew.rawSeverity !== 'BLOCK' ? 1 : 0;

    const mom = computeMomentum1H(win1h);
    const momentumLong = mom.momentumConfirmedLong ? 1 : 0;
    const momentumShort = mom.momentumConfirmedShort ? 1 : 0;
    const momentumPass =
      proposedSide === 'LONG'
        ? momentumLong
        : proposedSide === 'SHORT'
          ? momentumShort
          : 0;

    const conf = computeConfidenceEngineResult(withCtx);
    const finalConfidence = conf.confidence;
    const ctx = readConfidenceDecisionContext(conf);
    const eligible = ctx
      ? isEligibleForDirection(ctx, V41_DECISION_CONFIG)
        ? 1
        : 0
      : 0;
    const dec = computeDecisionEngineResult(conf);
    const decision = String(dec.state);

    const confTR = Number.isFinite(withCtx.detail.confidence)
      ? withCtx.detail.confidence
      : null;

    const bandGe75 = finalConfidence >= 75 ? 1 : 0;
    const band45to75 =
      finalConfidence >= 45 && finalConfidence < 75 ? 1 : 0;
    const bandLt45 = finalConfidence < 45 ? 1 : 0;

    const finalPropose =
      eligible === 1 && (decision === 'LONG' || decision === 'SHORT') ? 1 : 0;

    rows.push({
      symbol,
      openTime: candle.openTime,
      iso: new Date(candle.openTime).toISOString(),
      trendDirection,
      proposedSide,
      confTR,
      finalConfidence,
      decision,
      trendReversalConfirmed: ctx?.trendReversalConfirmed ? 1 : 0,
      trState: withCtx.state,
      preContextState: withCtx.preContextState ?? '',
      trActive,
      contextApplied,
      contextPass:
        contextApplied === 1
          ? contextPass
          : withCtx.state === 'ACTIVE'
            ? 1
            : 0,
      ctxBtc: dimTag(dims?.btc),
      ctxFunding: dimTag(dims?.funding),
      ctxOi: dimTag(dims?.oi),
      ctxWhale: dimTag(dims?.whale),
      ctxVolatility: dimTag(dims?.volatility),
      ewSeverity,
      ewPass,
      momentumLong,
      momentumShort,
      momentumPass,
      eligible,
      hardBlocks: ctx?.hardBlocks?.length ? ctx.hardBlocks.join('|') : '',
      activeConditionCount: withCtx.detail.activeConditionCount,
      completenessMultiplier: ctx?.completenessMultiplier ?? null,
      proposedDirection: ctx?.proposedDirection ?? 'NONE',
      bandLt45,
      band45to75,
      bandGe75,
      finalPropose,
    });
  }

  const n = rows.length || 1;
  const count = (pred: (r: FunnelRow) => boolean) =>
    rows.filter(pred).length;
  const pct = (c: number) => `${((100 * c) / n).toFixed(2)}%`;

  const nLt45 = count((r) => r.bandLt45 === 1);
  const n45575 = count((r) => r.band45to75 === 1);
  const nGe75 = count((r) => r.bandGe75 === 1);
  const nLongShort = count(
    (r) => r.decision === 'LONG' || r.decision === 'SHORT',
  );
  const nGe75AndLs = count(
    (r) =>
      r.bandGe75 === 1 && (r.decision === 'LONG' || r.decision === 'SHORT'),
  );

  const summary = [
    { stage: '0_bars_dumped', n: rows.length, note: `1H bars in ${days}d after warmup` },
    { stage: '0b_non_neutral_trend', n: nNonNeutral, note: 'BULL|BEAR count during loop' },
    {
      stage: 'band_lt45',
      n: nLt45,
      note: `finalConfidence < 45 | ${pct(nLt45)}`,
    },
    {
      stage: 'band_45_to_75',
      n: n45575,
      note: `45 ≤ finalConfidence < 75 | ${pct(n45575)}`,
    },
    {
      stage: 'band_ge75',
      n: nGe75,
      note: `finalConfidence ≥ 75 | ${pct(nGe75)}`,
    },
    {
      stage: 'decision_LONG_or_SHORT',
      n: nLongShort,
      note: `engine decision LONG|SHORT | ${pct(nLongShort)}`,
    },
    {
      stage: 'ge75_and_LONG_SHORT',
      n: nGe75AndLs,
      note: `≥75 AND decision LONG|SHORT | ${pct(nGe75AndLs)} of bars; of ≥75: ${nGe75 ? ((100 * nGe75AndLs) / nGe75).toFixed(1) : 'n/a'}%`,
    },
    {
      stage: 'trActive',
      n: count((r) => r.trActive === 1),
      note: 'preContext or state ACTIVE',
    },
    {
      stage: 'trendReversalConfirmed',
      n: count((r) => r.trendReversalConfirmed === 1),
      note: 'decisionContext.trendReversalConfirmed',
    },
    {
      stage: 'eligible',
      n: count((r) => r.eligible === 1),
      note: 'isEligibleForDirection',
    },
  ];

  printTable(
    `Funnel bands — ${symbol} ${days}d (Decision finalConfidence)`,
    summary.map((s) => ({ stage: s.stage, n: s.n, note: s.note })),
  );

  writeCsv(csvOut, rows, summary, { symbol, days });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

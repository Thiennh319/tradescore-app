/**
 * Breakout detector validation — NEARUSDT 180d (1H), immediate vs retest.
 * Report-only script — does not wire into production scan / TR.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-near-180d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import {
  BREAKOUT_TP1_RR,
  scanBreakoutSetups,
  type BreakoutConfirmMode,
  type BreakoutTradeLevels,
  type ConsolidationMode,
} from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const SYMBOL = 'NEARUSDT';
const DAYS = 180;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
/** Align with ~20×4H hold used in TR fees backtest. */
const MAX_HOLD_1H = 80;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT; // 0.18

/**
 * 4 consolidation configs × 2 confirm modes (not full N×X×M factorial).
 * Width path + one BB contracting path — báo cáo độc lập.
 */
const CONFIGS: Array<{
  id: string;
  lookbackN: number;
  consolidationMode: ConsolidationMode;
  maxWidthPct?: number;
  contractingBarsM?: number;
}> = [
  { id: 'W_N20_X5', lookbackN: 20, consolidationMode: 'width', maxWidthPct: 5 },
  { id: 'W_N30_X5', lookbackN: 30, consolidationMode: 'width', maxWidthPct: 5 },
  { id: 'W_N40_X8', lookbackN: 40, consolidationMode: 'width', maxWidthPct: 8 },
  { id: 'BB_N30_M5', lookbackN: 30, consolidationMode: 'bb_contracting', contractingBarsM: 5 },
];

const CONFIRM_MODES: BreakoutConfirmMode[] = ['immediate', 'retest'];

const OUT_CSV = path.resolve(__dirname, '../docs/exports/v41-breakout-near-180d.csv');
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-near-180d-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-near-180d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_DETECTOR_BUILD_AND_NEAR_VALIDATION_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';
type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  config_id: string;
  confirm_mode: BreakoutConfirmMode;
  consolidation_mode: ConsolidationMode;
  lookback_n: number;
  max_width_pct: number | null;
  contracting_m: number | null;
  symbol: string;
  days: number;
  breakout_open_time: number;
  active_open_time: number;
  active_iso: string;
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  range_high: number;
  range_low: number;
  outcome: Outcome;
  bars_held: number | null;
  sl_dist_pct: number;
  tp1_rr: number;
  gross_r: number | null;
  fee_r: number | null;
  net_r: number | null;
  net_pnl_pct: number | null;
};

type RunResult = {
  config_id: string;
  confirm_mode: BreakoutConfirmMode;
  consolidation_mode: ConsolidationMode;
  lookback_n: number;
  max_width_pct: number | null;
  contracting_m: number | null;
  n_active: number;
  wins: number;
  losses: number;
  both: number;
  timeout: number;
  wr: number;
  wr_after_fees: number;
  long_n: number;
  long_wr: number;
  short_n: number;
  short_wr: number;
  mean_sl_dist_pct: number;
  expectancy_r_before: number;
  expectancy_r_after: number;
  mean_fee_r: number;
  expectancy_sign_after: 'positive' | 'negative' | 'flat' | 'n/a';
  trades: TradeRow[];
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
  const step = MS_1H;
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

function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function hitOnBar(side: Side, bar: KlineV41, sl: number, tp1: number): Outcome | null {
  if (side === 'LONG') {
    const hitSl = bar.low <= sl;
    const hitTp = bar.high >= tp1;
    if (hitSl && hitTp) return 'BOTH';
    if (hitSl) return 'SL';
    if (hitTp) return 'TP';
    return null;
  }
  const hitSl = bar.high >= sl;
  const hitTp = bar.low <= tp1;
  if (hitSl && hitTp) return 'BOTH';
  if (hitSl) return 'SL';
  if (hitTp) return 'TP';
  return null;
}

function grossR(outcome: Outcome, tp1Rr: number): number | null {
  if (outcome === 'TP') return tp1Rr;
  if (outcome === 'SL' || outcome === 'BOTH') return -1;
  return null;
}

function netPnlPct(side: Side, entry: number, exitPrice: number, costPct: number): number {
  const move =
    side === 'LONG'
      ? ((exitPrice - entry) / entry) * 100
      : ((entry - exitPrice) / entry) * 100;
  return move - costPct;
}

function simulateTrade(
  klines1h: KlineV41[],
  setup: BreakoutTradeLevels,
  idxByOpen: Map<number, number>,
  meta: {
    config_id: string;
    confirm_mode: BreakoutConfirmMode;
    consolidation_mode: ConsolidationMode;
    lookback_n: number;
    max_width_pct: number | null;
    contracting_m: number | null;
  },
): TradeRow {
  const activeIdx = idxByOpen.get(setup.activeOpenTime);
  let outcome: Outcome = 'TIMEOUT';
  let bars_held: number | null = null;

  if (activeIdx != null) {
    const endIdx = Math.min(klines1h.length - 1, activeIdx + MAX_HOLD_1H);
    for (let i = activeIdx + 1; i <= endIdx; i++) {
      const hit = hitOnBar(setup.side, klines1h[i]!, setup.sl, setup.tp1);
      if (hit) {
        outcome = hit;
        bars_held = i - activeIdx;
        break;
      }
    }
  }

  const fee_r =
    setup.slDistancePct > 0 ? COST_ROUND_TRIP_PCT / setup.slDistancePct : NaN;
  const gR = grossR(outcome, setup.tp1RR);
  const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;

  let net_pnl_pct: number | null = null;
  if (outcome === 'TP') {
    net_pnl_pct = netPnlPct(setup.side, setup.entry, setup.tp1, COST_ROUND_TRIP_PCT);
  } else if (outcome === 'SL' || outcome === 'BOTH') {
    net_pnl_pct = netPnlPct(setup.side, setup.entry, setup.sl, COST_ROUND_TRIP_PCT);
  }

  return {
    ...meta,
    symbol: SYMBOL,
    days: DAYS,
    breakout_open_time: setup.breakoutOpenTime,
    active_open_time: setup.activeOpenTime,
    active_iso: new Date(setup.activeOpenTime).toISOString(),
    side: setup.side,
    entry: setup.entry,
    sl: setup.sl,
    tp1: setup.tp1,
    range_high: setup.rangeHigh,
    range_low: setup.rangeLow,
    outcome,
    bars_held,
    sl_dist_pct: setup.slDistancePct,
    tp1_rr: setup.tp1RR,
    gross_r: gR,
    fee_r: Number.isFinite(fee_r) ? fee_r : null,
    net_r,
    net_pnl_pct,
  };
}

function summarize(
  meta: RunResult,
  trades: TradeRow[],
): RunResult {
  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const decided = wins + losses + both;
  const wr = decided > 0 ? (wins / decided) * 100 : NaN;

  const bySide = (side: Side) => {
    const g = trades.filter((t) => t.side === side);
    const w = g.filter((t) => t.outcome === 'TP').length;
    const l = g.filter((t) => t.outcome === 'SL').length;
    const b = g.filter((t) => t.outcome === 'BOTH').length;
    const d = w + l + b;
    return { n: g.length, wr: d > 0 ? (w / d) * 100 : NaN };
  };
  const L = bySide('LONG');
  const S = bySide('SHORT');

  const decidedTrades = trades.filter(
    (t) => t.gross_r != null && t.net_r != null && t.outcome !== 'TIMEOUT',
  );
  const expectancy_r_before = mean(decidedTrades.map((t) => t.gross_r!));
  const expectancy_r_after = mean(decidedTrades.map((t) => t.net_r!));
  const mean_fee_r = mean(
    decidedTrades.map((t) => t.fee_r!).filter((x) => Number.isFinite(x)),
  );
  const mean_sl = mean(trades.map((t) => t.sl_dist_pct).filter((x) => Number.isFinite(x)));

  const winsAfter = decidedTrades.filter(
    (t) => t.net_pnl_pct != null && t.net_pnl_pct > 0,
  ).length;
  const wr_after_fees =
    decidedTrades.length > 0 ? (winsAfter / decidedTrades.length) * 100 : NaN;

  let expectancy_sign_after: RunResult['expectancy_sign_after'] = 'n/a';
  if (Number.isFinite(expectancy_r_after)) {
    if (expectancy_r_after > 1e-9) expectancy_sign_after = 'positive';
    else if (expectancy_r_after < -1e-9) expectancy_sign_after = 'negative';
    else expectancy_sign_after = 'flat';
  }

  return {
    ...meta,
    n_active: trades.length,
    wins,
    losses,
    both,
    timeout,
    wr,
    wr_after_fees,
    long_n: L.n,
    long_wr: L.wr,
    short_n: S.n,
    short_wr: S.wr,
    mean_sl_dist_pct: mean_sl,
    expectancy_r_before,
    expectancy_r_after,
    mean_fee_r,
    expectancy_sign_after,
    trades,
  };
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : '';
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const fetchStart = evalStart - WARMUP_1H * MS_1H;

  console.log(`[breakout] fetching ${SYMBOL} 1H ${DAYS}d…`);
  const klines1h = await fetchKlines(SYMBOL, '1h', fetchStart, endMs);
  const idxByOpen = new Map(klines1h.map((k, i) => [k.openTime, i]));
  console.log(`[breakout] 1h=${klines1h.length}`);

  const results: RunResult[] = [];

  for (const cfg of CONFIGS) {
    for (const confirm of CONFIRM_MODES) {
      const runId = `${cfg.id}_${confirm === 'immediate' ? 'A' : 'B'}`;
      console.log(`[breakout] scanning ${runId}…`);
      const setups = scanBreakoutSetups({
        klines1H: klines1h,
        lookbackN: cfg.lookbackN,
        consolidationMode: cfg.consolidationMode,
        maxWidthPct: cfg.maxWidthPct,
        contractingBarsM: cfg.contractingBarsM,
        confirmMode: confirm,
        evalStartOpenTime: evalStart,
        evalEndOpenTimeExclusive: endMs,
      });

      const trades = setups.map((s) =>
        simulateTrade(klines1h, s, idxByOpen, {
          config_id: cfg.id,
          confirm_mode: confirm,
          consolidation_mode: cfg.consolidationMode,
          lookback_n: cfg.lookbackN,
          max_width_pct: cfg.maxWidthPct ?? null,
          contracting_m: cfg.contractingBarsM ?? null,
        }),
      );

      const result = summarize(
        {
          config_id: cfg.id,
          confirm_mode: confirm,
          consolidation_mode: cfg.consolidationMode,
          lookback_n: cfg.lookbackN,
          max_width_pct: cfg.maxWidthPct ?? null,
          contracting_m: cfg.contractingBarsM ?? null,
          n_active: 0,
          wins: 0,
          losses: 0,
          both: 0,
          timeout: 0,
          wr: NaN,
          wr_after_fees: NaN,
          long_n: 0,
          long_wr: NaN,
          short_n: 0,
          short_wr: NaN,
          mean_sl_dist_pct: NaN,
          expectancy_r_before: NaN,
          expectancy_r_after: NaN,
          mean_fee_r: NaN,
          expectancy_sign_after: 'n/a',
          trades: [],
        },
        trades,
      );
      results.push(result);
      console.log(
        `[breakout] ${runId} n=${result.n_active} WR=${fmt(result.wr)}% E[R]=${fmt(result.expectancy_r_before, 3)}→${fmt(result.expectancy_r_after, 3)} (${result.expectancy_sign_after})`,
      );
    }
  }

  // CSV summary
  const summaryHeader =
    'config_id,confirm_mode,consolidation_mode,lookback_n,max_width_pct,contracting_m,n_active,wins,losses,both,timeout,wr_pct,wr_after_fees_pct,long_n,long_wr,short_n,short_wr,mean_sl_dist_pct,expectancy_r_before,expectancy_r_after,mean_fee_r,expectancy_sign_after';
  const summaryLines = results.map((r) =>
    [
      r.config_id,
      r.confirm_mode,
      r.consolidation_mode,
      r.lookback_n,
      r.max_width_pct ?? '',
      r.contracting_m ?? '',
      r.n_active,
      r.wins,
      r.losses,
      r.both,
      r.timeout,
      fmt(r.wr, 2),
      fmt(r.wr_after_fees, 2),
      r.long_n,
      fmt(r.long_wr, 2),
      r.short_n,
      fmt(r.short_wr, 2),
      fmt(r.mean_sl_dist_pct, 3),
      fmt(r.expectancy_r_before, 4),
      fmt(r.expectancy_r_after, 4),
      fmt(r.mean_fee_r, 4),
      r.expectancy_sign_after,
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [summaryHeader, ...summaryLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'config_id,confirm_mode,consolidation_mode,lookback_n,max_width_pct,contracting_m,symbol,days,breakout_open_time,active_open_time,active_iso,side,entry,sl,tp1,range_high,range_low,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r,net_pnl_pct';
  const tradeLines: string[] = [];
  for (const r of results) {
    for (const t of r.trades) {
      tradeLines.push(
        [
          t.config_id,
          t.confirm_mode,
          t.consolidation_mode,
          t.lookback_n,
          t.max_width_pct ?? '',
          t.contracting_m ?? '',
          t.symbol,
          t.days,
          t.breakout_open_time,
          t.active_open_time,
          t.active_iso,
          t.side,
          t.entry,
          t.sl,
          t.tp1,
          t.range_high,
          t.range_low,
          t.outcome,
          t.bars_held ?? '',
          fmt(t.sl_dist_pct, 4),
          fmt(t.tp1_rr, 2),
          t.gross_r != null ? fmt(t.gross_r, 4) : '',
          t.fee_r != null ? fmt(t.fee_r, 4) : '',
          t.net_r != null ? fmt(t.net_r, 4) : '',
          t.net_pnl_pct != null ? fmt(t.net_pnl_pct, 4) : '',
        ].join(','),
      );
    }
  }
  fs.writeFileSync(OUT_TRADES, [tradeHeader, ...tradeLines].join('\n') + '\n', 'utf8');

  const jsonPayload = {
    date: DATE,
    symbol: SYMBOL,
    days: DAYS,
    timeframe: '1h',
    cost_round_trip_pct: COST_ROUND_TRIP_PCT,
    tp1_rr: BREAKOUT_TP1_RR,
    max_hold_1h: MAX_HOLD_1H,
    note: 'Independent signals (no position deconflict). Consolidation width vs BB reported separately. Market State Acc/Dist NOT used.',
    configs: CONFIGS,
    results: results.map(({ trades: _t, ...rest }) => rest),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonPayload, null, 2), 'utf8');

  // Markdown report
  const md: string[] = [];
  md.push(`# REPORT — V4.1 Breakout Detector Build & NEAR Validation`);
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(`**Symbol:** ${SYMBOL} · **Window:** ${DAYS}d · **TF:** 1H`);
  md.push(`**Cost:** ${COST_ROUND_TRIP_PCT}% RT (fee 0.08% + slip 0.10%)`);
  md.push(`**TP1 R:R:** ${BREAKOUT_TP1_RR} · **Max hold:** ${MAX_HOLD_1H}×1H`);
  md.push(`**Scope:** New detector only — TR/reversal untouched. No multi-symbol.`);
  md.push('');
  md.push('## 1. Detector (new)');
  md.push('');
  md.push('- Code: `services/v41/breakoutDetector.ts` (+ unit tests).');
  md.push('- Range: Donchian N bars **before** breakout candle (N∈{20,30,40} in sweep configs).');
  md.push('- Consolidation (independent paths):');
  md.push('  - **Width:** `(rangeHigh−rangeLow)/rangeLow < X%`');
  md.push('  - **BB:** `getBollingerAnalysisV3` → `bandwidthSlope === CONTRACTING` for M consecutive bars before breakout');
  md.push('- Breakout: 1H **close** > rangeHigh (LONG) or < rangeLow (SHORT).');
  md.push('- Confirm A **immediate:** `computeMomentum1H` confirmed same side at breakout bar.');
  md.push('- Confirm B **retest:** touch broken level ±0.5% within 10×1H, then momentum at retest bar.');
  md.push('- Entry = active close; SL = opposite range ±0.3% buffer; TP = 1.5R.');
  md.push('- **Not used:** Market State Accumulation/Distribution.');
  md.push('');
  md.push('## 2. Parameter configs (3–4 combos, not full factorial)');
  md.push('');
  md.push('| Config | Mode | N | X% / M |');
  md.push('|--------|------|---|--------|');
  for (const c of CONFIGS) {
    const param =
      c.consolidationMode === 'width'
        ? `X=${c.maxWidthPct}%`
        : `M=${c.contractingBarsM}`;
    md.push(`| ${c.id} | ${c.consolidationMode} | ${c.lookbackN} | ${param} |`);
  }
  md.push('');
  md.push('Each config × **A immediate** / **B retest**.');
  md.push('');
  md.push('## 3. Results — NEAR 180d');
  md.push('');
  md.push(
    '| Config | Confirm | n | WR% | WR@fee% | E[R] gross | E[R] after fee | Sign | mean SL% |',
  );
  md.push('|--------|---------|---|-----|---------|------------|----------------|------|----------|');
  for (const r of results) {
    md.push(
      `| ${r.config_id} | ${r.confirm_mode} | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.wr_after_fees)} | ${fmt(r.expectancy_r_before, 3)} | ${fmt(r.expectancy_r_after, 3)} | ${r.expectancy_sign_after} | ${fmt(r.mean_sl_dist_pct, 2)} |`,
    );
  }
  md.push('');
  md.push('### A vs B (paired)');
  md.push('');
  md.push('| Config | n_A | WR_A | E[R]_A fee | n_B | WR_B | E[R]_B fee |');
  md.push('|--------|-----|------|------------|-----|------|------------|');
  for (const c of CONFIGS) {
    const a = results.find((r) => r.config_id === c.id && r.confirm_mode === 'immediate')!;
    const b = results.find((r) => r.config_id === c.id && r.confirm_mode === 'retest')!;
    md.push(
      `| ${c.id} | ${a.n_active} | ${fmt(a.wr)} | ${fmt(a.expectancy_r_after, 3)} | ${b.n_active} | ${fmt(b.wr)} | ${fmt(b.expectancy_r_after, 3)} |`,
    );
  }
  md.push('');

  const allA = results.filter((r) => r.confirm_mode === 'immediate');
  const allB = results.filter((r) => r.confirm_mode === 'retest');
  const sumN = (xs: RunResult[]) => xs.reduce((s, r) => s + r.n_active, 0);
  md.push('## 4. Preliminary observations');
  md.push('');
  md.push(`- Total actives across width/BB configs: **A=${sumN(allA)}**, **B=${sumN(allB)}** (sum over ${CONFIGS.length} configs; not unique events).`);
  const rareA = allA.every((r) => r.n_active < 5);
  const rareB = allB.every((r) => r.n_active < 5);
  if (rareA && rareB) {
    md.push('- Frequency: **very sparse** on NEAR-180d under these gates — similar rarity risk as early CVD-flip TR; loosen width/M or momentum gate before multi-symbol.');
  } else if (sumN(allA) + sumN(allB) < 20) {
    md.push('- Frequency: **low** but non-zero — usable for logic validation; still thin for stable WR.');
  } else {
    md.push('- Frequency: **usable** for preliminary comparison (not as rare as zero-signal CVD-flip starts).');
  }

  const bestAfter = [...results]
    .filter((r) => r.n_active >= 5 && Number.isFinite(r.expectancy_r_after))
    .sort((a, b) => b.expectancy_r_after - a.expectancy_r_after)[0];
  if (bestAfter) {
    md.push(
      `- Best E[R] after fee among runs with n≥5: **${bestAfter.config_id} / ${bestAfter.confirm_mode}** (n=${bestAfter.n_active}, E[R]=${fmt(bestAfter.expectancy_r_after, 3)}).`,
    );
  } else {
    md.push('- No run reached n≥5 with finite E[R] after fee — treat WR/E[R] as directional only.');
  }

  const preferA =
    mean(allA.filter((r) => r.n_active > 0).map((r) => r.expectancy_r_after)) >
    mean(allB.filter((r) => r.n_active > 0).map((r) => r.expectancy_r_after));
  md.push(
    `- Confirm path to follow next (NEAR only, provisional): **${preferA ? 'A immediate' : 'B retest'}** by mean E[R] after fee across non-empty runs — re-check after more samples / multi-symbol.`,
  );
  md.push('- Width vs BB: reported independently above; do not merge into one gate yet.');
  md.push('');
  md.push('## 5. Artefacts');
  md.push('');
  md.push('- `services/v41/breakoutDetector.ts`');
  md.push('- `services/v41/__tests__/breakoutDetector.test.ts`');
  md.push('- `scripts/backtest-v41-breakout-near-180d.ts`');
  md.push('- `docs/exports/v41-breakout-near-180d.csv`');
  md.push('- `docs/exports/v41-breakout-near-180d-trades.csv`');
  md.push('- `docs/exports/v41-breakout-near-180d-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[breakout] wrote ${OUT_CSV}`);
  console.log(`[breakout] wrote ${OUT_TRADES}`);
  console.log(`[breakout] wrote ${OUT_JSON}`);
  console.log(`[breakout] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Breakout V1 multi-symbol + longer window validation.
 * Config: W_N20_X5, ATR SL ×1.0, no strong-candle filter.
 * Confirm A (immediate) + B (retest). Cost 0.18% RT.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-v1-multi-symbol-longer.ts
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
} from '../services/v41/breakoutDetector';
import type { KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-01';
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MAX_HOLD_1H = 80;
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;

const FEE_ROUND_TRIP_PCT = 0.08;
const SLIP_ROUND_TRIP_PCT = 0.1;
const COST_ROUND_TRIP_PCT = FEE_ROUND_TRIP_PCT + SLIP_ROUND_TRIP_PCT;

const SCENARIOS = [
  { id: 'NEAR-180d', symbol: 'NEARUSDT', days: 180 },
  { id: 'NEAR-365d', symbol: 'NEARUSDT', days: 365 },
  { id: 'SOL-180d', symbol: 'SOLUSDT', days: 180 },
  { id: 'ETH-180d', symbol: 'ETHUSDT', days: 180 },
  { id: 'BNB-180d', symbol: 'BNBUSDT', days: 180 },
  { id: 'DOGE-180d', symbol: 'DOGEUSDT', days: 180 },
] as const;

const CONFIRM_MODES: BreakoutConfirmMode[] = ['immediate', 'retest'];

const OUT_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-v1-multi-symbol-longer.csv',
);
const OUT_TRADES = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-v1-multi-symbol-longer-trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-v1-multi-symbol-longer-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_BREAKOUT_V1_MULTI_SYMBOL_LONGER_${DATE}.md`,
);

type Side = 'LONG' | 'SHORT';
type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type TradeRow = {
  scenario: string;
  symbol: string;
  days: number;
  confirm_mode: BreakoutConfirmMode;
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
  scenario: string;
  symbol: string;
  days: number;
  confirm_mode: BreakoutConfirmMode;
  confirm_label: 'A' | 'B';
  n_active: number;
  wins: number;
  losses: number;
  both: number;
  timeout: number;
  wr: number;
  wr_after_fees: number;
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
    const next = Number(batch[batch.length - 1]![0]) + MS_1H;
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
    scenario: string;
    symbol: string;
    days: number;
    confirm_mode: BreakoutConfirmMode;
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
  partial: Omit<RunResult, keyof ReturnType<typeof metricsFromTrades>> & {
    trades: TradeRow[];
  },
): RunResult {
  return { ...partial, ...metricsFromTrades(partial.trades) };
}

function metricsFromTrades(trades: TradeRow[]) {
  const wins = trades.filter((t) => t.outcome === 'TP').length;
  const losses = trades.filter((t) => t.outcome === 'SL').length;
  const both = trades.filter((t) => t.outcome === 'BOTH').length;
  const timeout = trades.filter((t) => t.outcome === 'TIMEOUT').length;
  const decided = wins + losses + both;
  const wr = decided > 0 ? (wins / decided) * 100 : NaN;

  const decidedTrades = trades.filter(
    (t) => t.gross_r != null && t.net_r != null && t.outcome !== 'TIMEOUT',
  );
  const expectancy_r_before = mean(decidedTrades.map((t) => t.gross_r!));
  const expectancy_r_after = mean(decidedTrades.map((t) => t.net_r!));
  const mean_fee_r = mean(
    decidedTrades.map((t) => t.fee_r!).filter((x) => Number.isFinite(x)),
  );
  const mean_sl_dist_pct = mean(
    trades.map((t) => t.sl_dist_pct).filter((x) => Number.isFinite(x)),
  );
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
    n_active: trades.length,
    wins,
    losses,
    both,
    timeout,
    wr,
    wr_after_fees,
    mean_sl_dist_pct,
    expectancy_r_before,
    expectancy_r_after,
    mean_fee_r,
    expectancy_sign_after,
  };
}

function fmt(n: number, d = 2): string {
  return Number.isFinite(n) ? n.toFixed(d) : '';
}

function fmtPp(n: number): string {
  if (!Number.isFinite(n)) return '';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)} pp`;
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const results: RunResult[] = [];

  // Cache klines per symbol+days to avoid double-fetch for A/B
  const klineCache = new Map<string, KlineV41[]>();

  async function getKlines(symbol: string, days: number): Promise<{
    klines1h: KlineV41[];
    evalStart: number;
  }> {
    const key = `${symbol}:${days}`;
    const evalStart = endMs - days * 24 * MS_1H;
    if (klineCache.has(key)) {
      return { klines1h: klineCache.get(key)!, evalStart };
    }
    const fetchStart = evalStart - WARMUP_1H * MS_1H;
    console.log(`[v1-ms] fetching ${symbol} 1H ${days}d…`);
    const klines1h = await fetchKlines(symbol, '1h', fetchStart, endMs);
    klineCache.set(key, klines1h);
    console.log(`[v1-ms] ${symbol} ${days}d 1h=${klines1h.length}`);
    return { klines1h, evalStart };
  }

  for (const s of SCENARIOS) {
    const { klines1h, evalStart } = await getKlines(s.symbol, s.days);
    const idxByOpen = new Map(klines1h.map((k, i) => [k.openTime, i]));

    for (const confirm of CONFIRM_MODES) {
      const tag = `${s.id}_${confirm === 'immediate' ? 'A' : 'B'}`;
      console.log(`[v1-ms] scanning ${tag}…`);
      const setups = scanBreakoutSetups({
        klines1H: klines1h,
        lookbackN: LOOKBACK_N,
        consolidationMode: 'width',
        maxWidthPct: MAX_WIDTH_PCT,
        confirmMode: confirm,
        slMode: 'atr_break_level',
        atrMult: ATR_MULT,
        requireStrongBreakout: false,
        evalStartOpenTime: evalStart,
        evalEndOpenTimeExclusive: endMs,
      });
      const trades = setups.map((setup) =>
        simulateTrade(klines1h, setup, idxByOpen, {
          scenario: s.id,
          symbol: s.symbol,
          days: s.days,
          confirm_mode: confirm,
        }),
      );
      const result = summarize({
        scenario: s.id,
        symbol: s.symbol,
        days: s.days,
        confirm_mode: confirm,
        confirm_label: confirm === 'immediate' ? 'A' : 'B',
        trades,
      });
      results.push(result);
      console.log(
        `[v1-ms] ${tag} n=${result.n_active} WR=${fmt(result.wr)}% E[R]=${fmt(result.expectancy_r_after, 3)} (${result.expectancy_sign_after})`,
      );
    }
  }

  const summaryHeader =
    'scenario,symbol,days,confirm_mode,confirm_label,n_active,wins,losses,both,timeout,wr_pct,wr_after_fees_pct,mean_sl_dist_pct,expectancy_r_before,expectancy_r_after,mean_fee_r,expectancy_sign_after';
  const summaryLines = results.map((r) =>
    [
      r.scenario,
      r.symbol,
      r.days,
      r.confirm_mode,
      r.confirm_label,
      r.n_active,
      r.wins,
      r.losses,
      r.both,
      r.timeout,
      fmt(r.wr, 2),
      fmt(r.wr_after_fees, 2),
      fmt(r.mean_sl_dist_pct, 3),
      fmt(r.expectancy_r_before, 4),
      fmt(r.expectancy_r_after, 4),
      fmt(r.mean_fee_r, 4),
      r.expectancy_sign_after,
    ].join(','),
  );
  fs.writeFileSync(OUT_CSV, [summaryHeader, ...summaryLines].join('\n') + '\n', 'utf8');

  const tradeHeader =
    'scenario,symbol,days,confirm_mode,breakout_open_time,active_open_time,active_iso,side,entry,sl,tp1,range_high,range_low,outcome,bars_held,sl_dist_pct,tp1_rr,gross_r,fee_r,net_r,net_pnl_pct';
  const tradeLines: string[] = [];
  for (const r of results) {
    for (const t of r.trades) {
      tradeLines.push(
        [
          t.scenario,
          t.symbol,
          t.days,
          t.confirm_mode,
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

  const near180A = results.find(
    (r) => r.scenario === 'NEAR-180d' && r.confirm_label === 'A',
  )!;
  const near365A = results.find(
    (r) => r.scenario === 'NEAR-365d' && r.confirm_label === 'A',
  )!;
  const near180B = results.find(
    (r) => r.scenario === 'NEAR-180d' && r.confirm_label === 'B',
  )!;
  const near365B = results.find(
    (r) => r.scenario === 'NEAR-365d' && r.confirm_label === 'B',
  )!;

  const posA = results.filter(
    (r) => r.confirm_label === 'A' && r.expectancy_sign_after === 'positive',
  ).length;
  const posB = results.filter(
    (r) => r.confirm_label === 'B' && r.expectancy_sign_after === 'positive',
  ).length;
  const posAll = results.filter((r) => r.expectancy_sign_after === 'positive').length;
  const nScenarios = SCENARIOS.length;
  const nCells = results.length;

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        date: DATE,
        config: {
          name: 'V1_W_N20_X5_ATR_SL_1.0',
          lookbackN: LOOKBACK_N,
          maxWidthPct: MAX_WIDTH_PCT,
          slMode: 'atr_break_level',
          atrMult: ATR_MULT,
          requireStrongBreakout: false,
          tp1Rr: BREAKOUT_TP1_RR,
          costRoundTripPct: COST_ROUND_TRIP_PCT,
          maxHold1H: MAX_HOLD_1H,
        },
        scenarios: SCENARIOS,
        near_180_to_365: {
          A: {
            wr_delta_pp: near365A.wr - near180A.wr,
            er_after_180: near180A.expectancy_r_after,
            er_after_365: near365A.expectancy_r_after,
          },
          B: {
            wr_delta_pp: near365B.wr - near180B.wr,
            er_after_180: near180B.expectancy_r_after,
            er_after_365: near365B.expectancy_r_after,
          },
        },
        positive_count: {
          confirm_A: `${posA}/${nScenarios}`,
          confirm_B: `${posB}/${nScenarios}`,
          cells_A_and_B: `${posAll}/${nCells}`,
        },
        results: results.map(({ trades: _t, ...rest }) => rest),
      },
      null,
      2,
    ),
    'utf8',
  );

  const md: string[] = [];
  md.push('# REPORT — V4.1 Breakout V1 Multi-Symbol + Longer Window');
  md.push('');
  md.push(`**Date:** ${DATE}`);
  md.push(
    '**Config:** W_N20_X5 · SL = breakout level ∓ ATR(14)×1.0 · TP 1.5R · **no** strong-candle filter',
  );
  md.push(`**Cost:** ${COST_ROUND_TRIP_PCT}% RT · **Hold:** ${MAX_HOLD_1H}×1H`);
  md.push('**Scope:** Validation only — TR/reversal untouched. No production recommendation.');
  md.push('');
  md.push('## Phần A — NEAR 180d → 365d');
  md.push('');
  md.push('| | NEAR-180d A | NEAR-365d A | Δ A | NEAR-180d B | NEAR-365d B | Δ B |');
  md.push('|---|---|---|---|---|---|---|');
  md.push(
    `| n | ${near180A.n_active} | ${near365A.n_active} | ${near365A.n_active - near180A.n_active} | ${near180B.n_active} | ${near365B.n_active} | ${near365B.n_active - near180B.n_active} |`,
  );
  md.push(
    `| WR% | ${fmt(near180A.wr)} | ${fmt(near365A.wr)} | ${fmtPp(near365A.wr - near180A.wr)} | ${fmt(near180B.wr)} | ${fmt(near365B.wr)} | ${fmtPp(near365B.wr - near180B.wr)} |`,
  );
  md.push(
    `| E[R] sau phí | ${fmt(near180A.expectancy_r_after, 3)} | ${fmt(near365A.expectancy_r_after, 3)} | ${fmt(near365A.expectancy_r_after - near180A.expectancy_r_after, 3)} | ${fmt(near180B.expectancy_r_after, 3)} | ${fmt(near365B.expectancy_r_after, 3)} | ${fmt(near365B.expectancy_r_after - near180B.expectancy_r_after, 3)} |`,
  );
  md.push(
    `| Sign | ${near180A.expectancy_sign_after} | ${near365A.expectancy_sign_after} | | ${near180B.expectancy_sign_after} | ${near365B.expectancy_sign_after} | |`,
  );
  md.push('');
  md.push(
    `Reversal reference (prior fees report): NEAR WR 180→365 ≈ **−6.4 pp**; ETH ≈ **−13.5 pp**.`,
  );
  md.push('');
  md.push('## Phần B — Multi-symbol 180d (SOL / ETH / BNB / DOGE)');
  md.push('');
  md.push('| Scenario | Confirm | n | WR% | E[R] sau phí | mean SL% | Sign |');
  md.push('|---|---|---|---|---|---|---|');
  for (const id of ['SOL-180d', 'ETH-180d', 'BNB-180d', 'DOGE-180d'] as const) {
    for (const label of ['A', 'B'] as const) {
      const r = results.find((x) => x.scenario === id && x.confirm_label === label)!;
      md.push(
        `| ${id} | ${label} (${r.confirm_mode}) | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.expectancy_r_after, 3)} | ${fmt(r.mean_sl_dist_pct)} | ${r.expectancy_sign_after} |`,
      );
    }
  }
  md.push('');
  md.push('## Phần C — Full table');
  md.push('');
  md.push('| Scenario | Confirm | n | WR% | E[R] sau phí | mean SL% | Sign |');
  md.push('|---|---|---|---|---|---|---|');
  for (const s of SCENARIOS) {
    for (const label of ['A', 'B'] as const) {
      const r = results.find((x) => x.scenario === s.id && x.confirm_label === label)!;
      md.push(
        `| ${s.id} | ${label} | ${r.n_active} | ${fmt(r.wr)} | ${fmt(r.expectancy_r_after, 3)} | ${fmt(r.mean_sl_dist_pct)} | ${r.expectancy_sign_after} |`,
      );
    }
  }
  md.push('');
  md.push('### Positive E[R] after fee counts');
  md.push('');
  md.push(`- Confirm **A** (immediate): **${posA}/${nScenarios}** scenarios positive`);
  md.push(`- Confirm **B** (retest): **${posB}/${nScenarios}** scenarios positive`);
  md.push(
    `- Combined cells (scenario × confirm): **${posAll}/${nCells}** positive (reversal fees reference was **1/7** scenario-level)`,
  );
  md.push('');
  md.push('### Data notes (no recommendation)');
  md.push('');
  md.push('- Same cost model / R:R / ATR SL as NEAR refinement V1 — fair cross-check.');
  md.push('- Independent signals (no position deconflict); TIMEOUT excluded from E[R].');
  md.push('- Small n on some symbols → high sampling noise; numbers only.');
  md.push('- No production recommendation in this report.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `scripts/backtest-v41-breakout-v1-multi-symbol-longer.ts`');
  md.push('- `docs/exports/v41-breakout-v1-multi-symbol-longer.csv`');
  md.push('- `docs/exports/v41-breakout-v1-multi-symbol-longer-trades.csv`');
  md.push('- `docs/exports/v41-breakout-v1-multi-symbol-longer-summary.json`');
  md.push('');
  md.push('*End of report.*');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(`[v1-ms] wrote ${OUT_CSV}`);
  console.log(`[v1-ms] wrote ${OUT_TRADES}`);
  console.log(`[v1-ms] wrote ${OUT_JSON}`);
  console.log(`[v1-ms] wrote ${OUT_MD}`);
  console.log(
    `[v1-ms] positive A=${posA}/${nScenarios} B=${posB}/${nScenarios} cells=${posAll}/${nCells}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

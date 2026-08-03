/**
 * Descriptive backtest — NEAR Confirm B via PRODUCTION pipeline, 180d window.
 * Same flow as Task 5: scanBreakoutSetups → pickCurrentBreakoutSetup →
 * buildRc3ViewModelFromRow → adaptBreakoutToRc3Card.
 *
 * No threshold changes — stats only (Long/Short + monthly frequency).
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/backtest-v41-breakout-near-production-180d.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { BreakoutTradeLevels } from '../services/v41/breakoutDetector';
import { createNeutralSnapshot } from '../services/v41/marketIntelligenceLayer';
import type { KlineV41 } from '../services/v41/indicators';
import {
  buildRc3ViewModelFromRow,
  pickCurrentBreakoutSetup,
} from '../services/v41/rc3/buildRc3ViewModel';
import { scanBreakoutSetups } from '../services/v41/breakoutDetector';
import type { SignalRowV41 } from '../services/v41/scanV41';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-08-02';
const SYMBOL = 'NEARUSDT';
const DAYS = 180;
const MONTHS = 6;
const WARMUP_1H = 80;
const FETCH_GAP_MS = 120;
const BINANCE_MAX_LIMIT = 1500;
const MS_1H = 3_600_000;
const MAX_HOLD_1H = 80;
const LOOKBACK_N = 20;
const MAX_WIDTH_PCT = 5;
const ATR_MULT = 1.0;
const COST_ROUND_TRIP_PCT = 0.18;
const SMALL_SAMPLE_N = 10;

/** Reference from Task 5 / research 365d production pipeline. */
const REF_365 = { n: 31, wr: 53.33, e_r: 0.254, h2_wr: 71.43, h2_e_r: 0.715 };

const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-breakout-near-production-180d-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  `../docs/exports/REPORT_V41_NEAR_BREAKOUT_180D_STATS_${DATE}.md`,
);

type Outcome = 'TP' | 'SL' | 'BOTH' | 'TIMEOUT';

type Trade = {
  active_open_time: number;
  side: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  tp1RR: number;
  sl_dist_pct: number;
  outcome: Outcome;
  net_r: number | null;
  card_decision: string;
  month_key: string;
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

function hitOnBar(
  side: 'LONG' | 'SHORT',
  bar: KlineV41,
  sl: number,
  tp1: number,
): Outcome | null {
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

function rowAt(klines1H: KlineV41[], fetchedAt: number): SignalRowV41 {
  return {
    symbol: SYMBOL,
    snapshot: {
      ...createNeutralSnapshot(),
      trendDirection: 'NEUTRAL',
    },
    visibilityMode: 'WATCH_MODE',
    markPrice: klines1H.at(-1)?.close,
    klines1H,
    klines4H: [],
    btcKlines4H: [],
    fundingRate: 0,
    fetchedAt,
  };
}

function monthKeyUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function statsOf(trades: Trade[]): {
  n: number;
  n_dec: number;
  wr: number | null;
  e_r: number | null;
  small_sample: boolean;
} {
  const decided = trades.filter((t) => t.net_r != null);
  const wins = decided.filter((t) => t.outcome === 'TP').length;
  const e =
    decided.length > 0
      ? decided.reduce((a, t) => a + (t.net_r as number), 0) / decided.length
      : null;
  return {
    n: trades.length,
    n_dec: decided.length,
    wr: decided.length ? (wins / decided.length) * 100 : null,
    e_r: e,
    small_sample: trades.length < SMALL_SAMPLE_N,
  };
}

function fmtPct(v: number | null, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  return `${v.toFixed(digits)}%`;
}

function fmtEr(v: number | null, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}`;
}

async function main(): Promise<void> {
  const endMs = Date.now();
  const evalStart = endMs - DAYS * 24 * MS_1H;
  const fetchStart1h = evalStart - WARMUP_1H * MS_1H;

  console.log(`[180d] fetching NEAR 1H ${DAYS}d…`);
  const near1h = await fetchKlines(SYMBOL, '1h', fetchStart1h, endMs);
  console.log(`[180d] near1h=${near1h.length}`);

  const idxByOpen = new Map(near1h.map((k, i) => [k.openTime, i]));
  const startIdx = near1h.findIndex((k) => k.openTime >= evalStart);
  if (startIdx < 0) throw new Error('no bars in eval window');

  const trades: Trade[] = [];
  const entered = new Set<number>();

  for (let i = Math.max(startIdx, LOOKBACK_N); i < near1h.length; i++) {
    const slice = near1h.slice(0, i + 1);
    const bar = near1h[i]!;
    if (bar.openTime < evalStart) continue;

    const setups = scanBreakoutSetups({
      klines1H: slice,
      lookbackN: LOOKBACK_N,
      consolidationMode: 'width',
      maxWidthPct: MAX_WIDTH_PCT,
      confirmMode: 'retest',
      slMode: 'atr_break_level',
      atrMult: ATR_MULT,
      requireStrongBreakout: false,
    });
    const current = pickCurrentBreakoutSetup(setups, slice);
    if (current == null) continue;
    if (current.activeOpenTime !== bar.openTime) continue;
    if (entered.has(current.activeOpenTime)) continue;

    const card = buildRc3ViewModelFromRow(rowAt(slice, bar.openTime));
    if (card.decision !== 'LONG' && card.decision !== 'SHORT') continue;
    if (card.levels == null) continue;

    entered.add(current.activeOpenTime);

    let outcome: Outcome = 'TIMEOUT';
    const ri = idxByOpen.get(current.activeOpenTime)!;
    const endIdx = Math.min(near1h.length - 1, ri + MAX_HOLD_1H);
    for (let j = ri + 1; j <= endIdx; j++) {
      const hit = hitOnBar(current.side, near1h[j]!, current.sl, current.tp1);
      if (hit) {
        outcome = hit;
        break;
      }
    }
    const fee_r =
      current.slDistancePct > 0 ? COST_ROUND_TRIP_PCT / current.slDistancePct : NaN;
    const gR =
      outcome === 'TP'
        ? current.tp1RR
        : outcome === 'SL' || outcome === 'BOTH'
          ? -1
          : null;
    const net_r = gR != null && Number.isFinite(fee_r) ? gR - fee_r : null;

    trades.push({
      active_open_time: current.activeOpenTime,
      side: current.side,
      entry: current.entry,
      sl: current.sl,
      tp1: current.tp1,
      tp1RR: current.tp1RR,
      sl_dist_pct: current.slDistancePct,
      outcome,
      net_r,
      card_decision: card.decision,
      month_key: monthKeyUtc(current.activeOpenTime),
    });
  }

  const overall = statsOf(trades);
  const longs = statsOf(trades.filter((t) => t.side === 'LONG'));
  const shorts = statsOf(trades.filter((t) => t.side === 'SHORT'));
  const tradesPerMonthAvg = overall.n / MONTHS;

  // Fixed 6 calendar months covering the eval window (UTC).
  const monthKeys: string[] = [];
  {
    const cursor = new Date(evalStart);
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(endMs);
    while (cursor.getTime() <= end.getTime() && monthKeys.length < 12) {
      monthKeys.push(monthKeyUtc(cursor.getTime()));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  // Keep last 6 months that intersect window
  const last6 = monthKeys.slice(-MONTHS);
  const byMonth = last6.map((key) => {
    const mt = trades.filter((t) => t.month_key === key);
    return { month: key, n: mt.length, long: mt.filter((t) => t.side === 'LONG').length, short: mt.filter((t) => t.side === 'SHORT').length };
  });

  const warnings: string[] = [];
  if (longs.small_sample) {
    warnings.push(
      `LONG n=${longs.n} < ${SMALL_SAMPLE_N} — mẫu nhỏ, không kết luận chắc chắn cho side LONG.`,
    );
  }
  if (shorts.small_sample) {
    warnings.push(
      `SHORT n=${shorts.n} < ${SMALL_SAMPLE_N} — mẫu nhỏ, không kết luận chắc chắn cho side SHORT.`,
    );
  }
  if (overall.small_sample) {
    warnings.push(
      `Tổng n=${overall.n} < ${SMALL_SAMPLE_N} — mẫu tổng thể nhỏ trên 180d.`,
    );
  }

  const summary = {
    date: DATE,
    symbol: SYMBOL,
    days: DAYS,
    cost_rt_pct: COST_ROUND_TRIP_PCT,
    config: {
      lookbackN: LOOKBACK_N,
      maxWidthPct: MAX_WIDTH_PCT,
      confirmMode: 'retest',
      slMode: 'atr_break_level',
      atrMult: ATR_MULT,
      tp1RR: 1.5,
      maxHold1H: MAX_HOLD_1H,
      btcFilter: false,
    },
    pipeline: 'scanBreakoutSetups → pickCurrentBreakoutSetup → buildRc3ViewModelFromRow',
    window: {
      evalStartIso: new Date(evalStart).toISOString(),
      evalEndIso: new Date(endMs).toISOString(),
    },
    overall,
    long: longs,
    short: shorts,
    frequency: {
      months: MONTHS,
      trades_per_month_avg: tradesPerMonthAvg,
      by_month: byMonth,
    },
    ref_365d: REF_365,
    warnings,
    trades: trades.map((t) => ({
      active_open_time: t.active_open_time,
      active_iso: new Date(t.active_open_time).toISOString(),
      side: t.side,
      outcome: t.outcome,
      net_r: t.net_r,
      month_key: t.month_key,
    })),
  };

  const md = `# REPORT — NEAR Breakout Confirm B · Production pipeline · 180d

**Date:** ${DATE}  
**Symbol:** ${SYMBOL}  
**Window:** ${DAYS}d (${summary.window.evalStartIso} → ${summary.window.evalEndIso})  
**Pipeline:** scanBreakoutSetups → pickCurrentBreakoutSetup → buildRc3ViewModelFromRow (Task 5 flow)  
**Config:** N=${LOOKBACK_N}, X=${MAX_WIDTH_PCT}%, retest, ATR×${ATR_MULT}, TP 1.5R, max-hold ${MAX_HOLD_1H}×1H, cost ${COST_ROUND_TRIP_PCT}% RT, **no BTC filter**  
**Nature:** descriptive only — no parameter changes

---

## 1. Tổng thể / Long / Short

| Nhóm | n | WR% | E[R] (sau phí) | Cảnh báo |
|---|---:|---:|---:|---|
| **Tổng** | ${overall.n} | ${fmtPct(overall.wr)} | ${fmtEr(overall.e_r)} | ${overall.small_sample ? 'mẫu nhỏ' : '—'} |
| **LONG** | ${longs.n} | ${fmtPct(longs.wr)} | ${fmtEr(longs.e_r)} | ${longs.small_sample ? 'mẫu nhỏ (<10)' : '—'} |
| **SHORT** | ${shorts.n} | ${fmtPct(shorts.wr)} | ${fmtEr(shorts.e_r)} | ${shorts.small_sample ? 'mẫu nhỏ (<10)' : '—'} |

${warnings.length ? `### Cảnh báo mẫu nhỏ\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n` : ''}
---

## 2. Tần suất

- **Trung bình:** ${overall.n} lệnh / ${MONTHS} tháng = **${tradesPerMonthAvg.toFixed(2)} lệnh/tháng**

| Tháng (UTC) | n | LONG | SHORT |
|---|---:|---:|---:|
${byMonth.map((r) => `| ${r.month} | ${r.n} | ${r.long} | ${r.short} |`).join('\n')}

---

## 3. So sánh nhanh vs 365d (tham khảo)

| | 365d (Task 5 / research) | 180d (bản này) |
|---|---:|---:|
| n | ${REF_365.n} | ${overall.n} |
| WR% | ${REF_365.wr}% | ${fmtPct(overall.wr)} |
| E[R] | +${REF_365.e_r} | ${fmtEr(overall.e_r)} |
| H2 OOS (365d nửa sau) | WR ${REF_365.h2_wr}% · E[R] +${REF_365.h2_e_r} | — (180d ≈ nửa sau lịch sử 365d) |

> Chỉ để tham khảo xu hướng gần đây vs full sample / H2 — **không** tối ưu lại tham số.

---

## 4. Artefacts

- JSON: \`docs/exports/v41-breakout-near-production-180d-summary.json\`
- Script: \`scripts/backtest-v41-breakout-near-production-180d.ts\`
`;

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log('[180d] summary overall', overall);
  console.log('[180d] long', longs);
  console.log('[180d] short', shorts);
  console.log('[180d] trades/mo avg', tradesPerMonthAvg.toFixed(2));
  console.log('[180d] by month', byMonth);
  if (warnings.length) console.log('[180d] WARNINGS', warnings);
  console.log(`[180d] wrote ${OUT_JSON}`);
  console.log(`[180d] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

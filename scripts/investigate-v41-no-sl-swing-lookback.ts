/**
 * Investigate NO_SL after computeCounterTrendSL fix — is SWING_LOOKBACK=10 the cause?
 * Report-only — does not change production.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/investigate-v41-no-sl-swing-lookback.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { calculateEMA, type KlineV41 } from '../services/v41/indicators';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const FETCH_GAP_MS = 150;
const BINANCE_MAX_LIMIT = 1500;
const EMA_PERIOD = 20;
const SL_BUFFER = 0.003;
const LOOKBACKS = [10, 15, 20, 25] as const;

const TRADES_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-winrate-trades.csv',
);
const OUT_CASES = path.resolve(
  __dirname,
  '../docs/exports/v41-no-sl-cases-detail-180d.csv',
);
const OUT_SWEEP = path.resolve(
  __dirname,
  '../docs/exports/v41-no-sl-swing-lookback-sweep-180d.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-no-sl-swing-lookback-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_NO_SL_SWING_LOOKBACK_INVESTIGATION_2026-08-01.md',
);

type Side = 'LONG' | 'SHORT';
type Trade = {
  timestamp: number;
  timestamp_iso: string;
  side: Side;
  entry: number;
  outcome: string;
  was_no_sl: boolean;
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
  startTime: number,
  endTime: number,
): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', SYMBOL);
    url.searchParams.set('interval', '1h');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Mirror of fixed computeCounterTrendSL with configurable lookback. */
function computeSLWithLookback(
  klines1H: KlineV41[],
  direction: Side,
  entryPrice: number,
  lookback: number,
): {
  sl: number;
  lastEma: number;
  swingExtreme: number;
  swingCand: number;
  emaCand: number;
  swing_ok: boolean;
  ema_ok: boolean;
  no_sl: boolean;
  sl_dist_pct: number;
} {
  const closes = klines1H.map((k) => k.close);
  const ema20 = calculateEMA(closes, EMA_PERIOD);
  const lastEma = ema20[klines1H.length - 1]!;
  const recent = klines1H.slice(-lookback);

  if (direction === 'SHORT') {
    const swingHigh = Math.max(...recent.map((k) => k.high));
    const swingCand = swingHigh * 1.003;
    const emaCand = lastEma * 1.005;
    const swing_ok = swingCand > entryPrice;
    const ema_ok = emaCand > entryPrice;
    const candidates: number[] = [];
    if (swing_ok) candidates.push(swingCand);
    if (ema_ok) candidates.push(emaCand);
    if (!candidates.length || !Number.isFinite(lastEma)) {
      return {
        sl: NaN,
        lastEma,
        swingExtreme: swingHigh,
        swingCand,
        emaCand,
        swing_ok,
        ema_ok,
        no_sl: true,
        sl_dist_pct: NaN,
      };
    }
    const chosen = Math.min(...candidates);
    const sl = chosen * (1 + SL_BUFFER);
    const ok = sl > entryPrice;
    return {
      sl: ok ? sl : NaN,
      lastEma,
      swingExtreme: swingHigh,
      swingCand,
      emaCand,
      swing_ok,
      ema_ok,
      no_sl: !ok,
      sl_dist_pct: ok ? ((sl - entryPrice) / entryPrice) * 100 : NaN,
    };
  }

  const swingLow = Math.min(...recent.map((k) => k.low));
  const swingCand = swingLow * 0.997;
  const emaCand = lastEma * 0.995;
  const swing_ok = swingCand < entryPrice;
  const ema_ok = emaCand < entryPrice;
  const candidates: number[] = [];
  if (swing_ok) candidates.push(swingCand);
  if (ema_ok) candidates.push(emaCand);
  if (!candidates.length || !Number.isFinite(lastEma)) {
    return {
      sl: NaN,
      lastEma,
      swingExtreme: swingLow,
      swingCand,
      emaCand,
      swing_ok,
      ema_ok,
      no_sl: true,
      sl_dist_pct: NaN,
    };
  }
  const chosen = Math.max(...candidates);
  const sl = chosen * (1 - SL_BUFFER);
  const ok = sl < entryPrice;
  return {
    sl: ok ? sl : NaN,
    lastEma,
    swingExtreme: swingLow,
    swingCand,
    emaCand,
    swing_ok,
    ema_ok,
    no_sl: !ok,
    sl_dist_pct: ok ? ((entryPrice - sl) / entryPrice) * 100 : NaN,
  };
}

function loadTrades32(): Trade[] {
  const lines = fs.readFileSync(TRADES_CSV, 'utf8').trim().split(/\r?\n/);
  const h = lines[0]!.split(',');
  const i = (n: string) => h.indexOf(n);
  const out: Trade[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    if (c[i('window')] !== '180d' || Number(c[i('conf_min')]) !== 40) continue;
    out.push({
      timestamp: Number(c[i('timestamp')]),
      timestamp_iso: c[i('timestamp_iso')]!,
      side: c[i('side')] as Side,
      entry: Number(c[i('entry')]),
      outcome: c[i('outcome')]!,
      was_no_sl: c[i('outcome')] === 'NO_SL',
    });
  }
  return out;
}

async function main(): Promise<void> {
  const trades = loadTrades32();
  const noSlTrades = trades.filter((t) => t.was_no_sl);
  if (noSlTrades.length !== 5) {
    console.warn(`[no-sl] expected 5 NO_SL, got ${noSlTrades.length}`);
  }

  const minTs = Math.min(...trades.map((t) => t.timestamp));
  const maxTs = Math.max(...trades.map((t) => t.timestamp));
  console.log(`[no-sl] fetching 1H for ${trades.length} trades…`);
  const near1h = await fetchKlines(minTs - 80 * MS_1H, maxTs + MS_4H);
  console.log(`[no-sl] near1h=${near1h.length}`);

  // Detail for 5 NO_SL at lookback=10
  const caseDetails = noSlTrades.map((t) => {
    const win = sliceUpTo(near1h, t.timestamp);
    const r = computeSLWithLookback(win, t.side, t.entry, 10);
    const entryVsSwing =
      t.side === 'LONG'
        ? t.entry <= r.swingExtreme
          ? 'entry_at_or_below_swingLow (new low / outside prior range)'
          : 'entry_above_swingLow'
        : t.entry >= r.swingExtreme
          ? 'entry_at_or_above_swingHigh (new high / outside prior range)'
          : 'entry_below_swingHigh';
    return {
      timestamp: t.timestamp,
      timestamp_iso: t.timestamp_iso,
      side: t.side,
      entry: t.entry,
      lastEma20: r.lastEma,
      swingExtreme_10: r.swingExtreme,
      swingCand: r.swingCand,
      emaCand: r.emaCand,
      swing_ok: r.swing_ok,
      ema_ok: r.ema_ok,
      entry_vs_swing: entryVsSwing,
      ema_vs_entry: r.lastEma > t.entry ? 'above' : r.lastEma < t.entry ? 'below' : 'equal',
    };
  });

  // Sweep lookbacks on all 32 + track the original 5
  const noSlTs = new Set(noSlTrades.map((t) => t.timestamp));
  const sweep = LOOKBACKS.map((lb) => {
    let noSlCount = 0;
    let noSlAmongOriginal5 = 0;
    const distsAll: number[] = [];
    const distsOrig5WhenOk: number[] = [];
    const perTrade: Array<{
      timestamp: number;
      was_orig_no_sl: boolean;
      no_sl: boolean;
      sl_dist_pct: number;
    }> = [];

    for (const t of trades) {
      const win = sliceUpTo(near1h, t.timestamp);
      const r = computeSLWithLookback(win, t.side, t.entry, lb);
      if (r.no_sl) {
        noSlCount++;
        if (noSlTs.has(t.timestamp)) noSlAmongOriginal5++;
      } else {
        distsAll.push(r.sl_dist_pct);
        if (noSlTs.has(t.timestamp)) distsOrig5WhenOk.push(r.sl_dist_pct);
      }
      perTrade.push({
        timestamp: t.timestamp,
        was_orig_no_sl: noSlTs.has(t.timestamp),
        no_sl: r.no_sl,
        sl_dist_pct: r.sl_dist_pct,
      });
    }

    // For original 5: mean dist if recovered, else n/a
    return {
      lookback: lb,
      no_sl_count: noSlCount,
      no_sl_among_original_5: noSlAmongOriginal5,
      recovered_of_5: 5 - noSlAmongOriginal5,
      mean_sl_dist_pct_all_valid: mean(distsAll),
      mean_sl_dist_pct_orig5_if_valid: mean(distsOrig5WhenOk),
      n_valid: distsAll.length,
      perTrade,
    };
  });

  // CSV cases
  const caseCsv = [
    'timestamp,timestamp_iso,side,entry,lastEma20,swingExtreme_10,swingCand,emaCand,swing_ok,ema_ok,ema_vs_entry,entry_vs_swing',
    ...caseDetails.map((c) =>
      [
        c.timestamp,
        c.timestamp_iso,
        c.side,
        c.entry,
        c.lastEma20,
        c.swingExtreme_10,
        c.swingCand,
        c.emaCand,
        c.swing_ok ? 1 : 0,
        c.ema_ok ? 1 : 0,
        c.ema_vs_entry,
        `"${c.entry_vs_swing}"`,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_CASES, caseCsv + '\n', 'utf8');

  const sweepCsv = [
    'lookback,no_sl_count,no_sl_among_original_5,recovered_of_5,mean_sl_dist_pct_all_valid,mean_sl_dist_pct_orig5_if_valid,n_valid',
    ...sweep.map((s) =>
      [
        s.lookback,
        s.no_sl_count,
        s.no_sl_among_original_5,
        s.recovered_of_5,
        Number.isFinite(s.mean_sl_dist_pct_all_valid)
          ? s.mean_sl_dist_pct_all_valid.toFixed(4)
          : '',
        Number.isFinite(s.mean_sl_dist_pct_orig5_if_valid)
          ? s.mean_sl_dist_pct_orig5_if_valid.toFixed(4)
          : '',
        s.n_valid,
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_SWEEP, sweepCsv + '\n', 'utf8');

  const summary = {
    date: '2026-08-01',
    n_trades_32: trades.length,
    n_no_sl: noSlTrades.length,
    no_sl_cases: caseDetails,
    lookback_sweep: sweep.map(({ perTrade: _p, ...rest }) => rest),
    note: 'Production SWING_LOOKBACK unchanged (=10). Sweep is experiment-only.',
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');

  const md: string[] = [];
  md.push('# REPORT — NO_SL / SWING_LOOKBACK investigation (NEAR 180d)');
  md.push('');
  md.push('**Date:** 2026-08-01');
  md.push(
    '**Scope:** Điều tra only — **không** đổi `SWING_LOOKBACK` production / không chọn lookback mới',
  );
  md.push('');
  md.push('## 1. Năm lệnh NO_SL (180d, conf≥40)');
  md.push('');
  md.push('| timestamp_iso | side | entry |');
  md.push('|---|---|---|');
  for (const t of noSlTrades) {
    md.push(`| ${t.timestamp_iso} | ${t.side} | ${t.entry} |`);
  }
  md.push('');
  md.push('## 2. Vì sao cả EMA + swing (lookback=10) đều sai phía');
  md.push('');
  md.push(
    '| iso | side | entry | EMA20 | swing(10) | swingCand | emaCand | swing_ok | ema_ok | Giải thích |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const c of caseDetails) {
    md.push(
      `| ${c.timestamp_iso} | ${c.side} | ${c.entry} | ${c.lastEma20.toFixed(4)} | ${c.swingExtreme_10.toFixed(4)} | ${c.swingCand.toFixed(4)} | ${c.emaCand.toFixed(4)} | ${c.swing_ok} | ${c.ema_ok} | ${c.entry_vs_swing} |`,
    );
  }
  md.push('');
  md.push(
    '**Pattern chung:** entry nằm **ngoài** (hoặc sát mép ngoài) range 10 nến 1H gần nhất theo hướng bất lợi cho việc đặt SL — breakout/spike mới so với cửa sổ swing ngắn. EMA20 cũng nằm cùng phía “sai” → cả hai candidate bị loại → `NaN` / NO_SL.',
  );
  md.push('');
  md.push('## 3–4. Sweep SWING_LOOKBACK');
  md.push('');
  md.push(
    '| Lookback | NO_SL count (32 lệnh) | Trung bình sl_dist_pct (toàn bộ hợp lệ) | Trung bình sl_dist_pct (5 case cũ, nếu recover) |',
  );
  md.push('|---|---|---|---|');
  for (const s of sweep) {
    md.push(
      `| ${s.lookback}${s.lookback === 10 ? ' (hiện tại)' : ''} | ${s.no_sl_count} | ${fmt(s.mean_sl_dist_pct_all_valid)}% | ${fmt(s.mean_sl_dist_pct_orig5_if_valid)}% (recovered ${s.recovered_of_5}/5) |`,
    );
  }
  md.push('');
  md.push('## 5. Kết luận điều tra (không chọn lookback)');
  md.push('');
  const s10 = sweep.find((s) => s.lookback === 10)!;
  const s25 = sweep.find((s) => s.lookback === 25)!;
  md.push(
    `- Lookback=10: NO_SL=${s10.no_sl_count}/32; mean sl_dist≈${fmt(s10.mean_sl_dist_pct_all_valid)}%.`,
  );
  md.push(
    `- Lookback=25: NO_SL=${s25.no_sl_count}/32 (Δ ${s25.no_sl_count - s10.no_sl_count}); mean sl_dist≈${fmt(s25.mean_sl_dist_pct_all_valid)}% (so với ${fmt(s10.mean_sl_dist_pct_all_valid)}% @10).`,
  );
  md.push(
    '- Tăng lookback **có thể** giảm NO_SL nếu swing xa hơn nằm đúng phía, nhưng thường **làm SL xa hơn** (sl_dist↑) → R:R xấu hơn / rủi ro lớn hơn mỗi lệnh.',
  );
  md.push('- Không đổi production trong task này.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-no-sl-cases-detail-180d.csv`');
  md.push('- `docs/exports/v41-no-sl-swing-lookback-sweep-180d.csv`');
  md.push('- `docs/exports/v41-no-sl-swing-lookback-summary.json`');
  md.push('- `scripts/investigate-v41-no-sl-swing-lookback.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({ caseDetails, sweep: sweep.map((s) => ({ ...s, perTrade: undefined })) }, null, 2));
  console.log(`[no-sl] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

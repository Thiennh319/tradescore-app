/**
 * Extend NO_SL investigation: 4H-close vs 1H-window-at-4H-open mismatch,
 * and min lookback to recover under current windowing.
 * Updates report + exports. Does not change production.
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

const TRADES_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-winrate-trades.csv',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_NO_SL_SWING_LOOKBACK_INVESTIGATION_2026-08-01.md',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-no-sl-swing-lookback-summary.json',
);
const OUT_CASES = path.resolve(
  __dirname,
  '../docs/exports/v41-no-sl-cases-detail-180d.csv',
);
const OUT_SWEEP = path.resolve(
  __dirname,
  '../docs/exports/v41-no-sl-swing-lookback-sweep-180d.csv',
);
const OUT_MISMATCH = path.resolve(
  __dirname,
  '../docs/exports/v41-no-sl-4h-1h-window-mismatch-180d.csv',
);

type Side = 'LONG' | 'SHORT';

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

async function fetchKlines(startTime: number, endTime: number): Promise<KlineV41[]> {
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

async function fetch4h(startTime: number, endTime: number): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', SYMBOL);
    url.searchParams.set('interval', '4h');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const batch = (await res.json()) as (string | number)[][];
    if (!batch.length) break;
    for (const row of batch) out.push(toKlineV41(row));
    const next = Number(batch[batch.length - 1]![0]) + MS_4H;
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

function loadNoSlAndAll(): {
  all: Array<{ timestamp: number; timestamp_iso: string; side: Side; entry: number; was_no_sl: boolean }>;
  noSl: Array<{ timestamp: number; timestamp_iso: string; side: Side; entry: number }>;
} {
  const lines = fs.readFileSync(TRADES_CSV, 'utf8').trim().split(/\r?\n/);
  const h = lines[0]!.split(',');
  const i = (n: string) => h.indexOf(n);
  const all: Array<{
    timestamp: number;
    timestamp_iso: string;
    side: Side;
    entry: number;
    was_no_sl: boolean;
  }> = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    if (c[i('window')] !== '180d' || Number(c[i('conf_min')]) !== 40) continue;
    all.push({
      timestamp: Number(c[i('timestamp')]),
      timestamp_iso: c[i('timestamp_iso')]!,
      side: c[i('side')] as Side,
      entry: Number(c[i('entry')]),
      was_no_sl: c[i('outcome')] === 'NO_SL',
    });
  }
  return { all, noSl: all.filter((t) => t.was_no_sl) };
}

async function main(): Promise<void> {
  const { all: trades, noSl: noSlTrades } = loadNoSlAndAll();
  const minTs = Math.min(...trades.map((t) => t.timestamp));
  const maxTs = Math.max(...trades.map((t) => t.timestamp));

  console.log(`[ext] fetch 1H+4H… n_trades=${trades.length} no_sl=${noSlTrades.length}`);
  const [near1h, near4h] = await Promise.all([
    fetchKlines(minTs - 250 * MS_1H, maxTs + MS_4H),
    fetch4h(minTs - 10 * MS_4H, maxTs + MS_4H),
  ]);
  console.log(`[ext] near1h=${near1h.length} near4h=${near4h.length}`);

  // --- Per-case geometry + 4H/1H mismatch ---
  const mismatchRows: Array<Record<string, string | number | boolean>> = [];
  const caseDetails: Array<Record<string, unknown>> = [];

  for (const t of noSlTrades) {
    const bar4 = near4h.find((k) => k.openTime === t.timestamp);
    const winAtOpen = sliceUpTo(near1h, t.timestamp);
    // Include 1H bars that complete within the 4H candle (openTime <= open+3h)
    const winThru4h = sliceUpTo(near1h, t.timestamp + 3 * MS_1H);
    const r10 = computeSLWithLookback(winAtOpen, t.side, t.entry, 10);
    const r10Thru = computeSLWithLookback(winThru4h, t.side, t.entry, 10);

    // Min lookback under CURRENT window (at 4H open)
    let minLbOpen: number | null = null;
    let minLbOpenDist: number | null = null;
    for (let lb = 10; lb <= 200; lb++) {
      const r = computeSLWithLookback(winAtOpen, t.side, t.entry, lb);
      if (!r.no_sl) {
        minLbOpen = lb;
        minLbOpenDist = r.sl_dist_pct;
        break;
      }
    }

    // Min lookback if window includes full 4H 1H bars
    let minLbThru: number | null = null;
    let minLbThruDist: number | null = null;
    for (let lb = 10; lb <= 50; lb++) {
      const r = computeSLWithLookback(winThru4h, t.side, t.entry, lb);
      if (!r.no_sl) {
        minLbThru = lb;
        minLbThruDist = r.sl_dist_pct;
        break;
      }
    }

    const entryVsSwing =
      t.side === 'LONG'
        ? t.entry <= r10.swingExtreme
          ? 'entry_at_or_below_swingLow (new low / outside prior range)'
          : 'entry_above_swingLow'
        : t.entry >= r10.swingExtreme
          ? 'entry_at_or_above_swingHigh (new high / outside prior range)'
          : 'entry_below_swingHigh';

    caseDetails.push({
      timestamp: t.timestamp,
      timestamp_iso: t.timestamp_iso,
      side: t.side,
      entry: t.entry,
      lastEma20: r10.lastEma,
      swingExtreme_10: r10.swingExtreme,
      swingCand: r10.swingCand,
      emaCand: r10.emaCand,
      swing_ok: r10.swing_ok,
      ema_ok: r10.ema_ok,
      entry_vs_swing: entryVsSwing,
      ema_vs_entry: r10.lastEma > t.entry ? 'above' : r10.lastEma < t.entry ? 'below' : 'equal',
      bar4h_open: bar4?.open ?? null,
      bar4h_high: bar4?.high ?? null,
      bar4h_low: bar4?.low ?? null,
      bar4h_close: bar4?.close ?? null,
      no_sl_at_open_lb10: r10.no_sl,
      no_sl_thru4h_lb10: r10Thru.no_sl,
      sl_dist_thru4h_lb10: r10Thru.no_sl ? null : r10Thru.sl_dist_pct,
      min_lookback_at_4h_open: minLbOpen,
      min_lookback_at_4h_open_sl_dist_pct: minLbOpenDist,
      min_lookback_thru_4h: minLbThru,
      min_lookback_thru_4h_sl_dist_pct: minLbThruDist,
    });

    mismatchRows.push({
      timestamp_iso: t.timestamp_iso,
      side: t.side,
      entry_4h_close: t.entry,
      bar4h_high: bar4?.high ?? '',
      bar4h_low: bar4?.low ?? '',
      swing10_at_4h_open: r10.swingExtreme,
      swing10_thru_4h: computeSLWithLookback(winThru4h, t.side, t.entry, 10).swingExtreme,
      no_sl_window_at_4h_open_lb10: r10.no_sl,
      no_sl_window_thru_4h_lb10: r10Thru.no_sl,
      min_lookback_at_4h_open: minLbOpen ?? '',
      min_lookback_thru_4h: minLbThru ?? '',
    });
  }

  // --- Sweep 10/15/20/25 under CURRENT windowing (same as original script) ---
  const LOOKBACKS = [10, 15, 20, 25] as const;
  const noSlTs = new Set(noSlTrades.map((t) => t.timestamp));
  const sweep = LOOKBACKS.map((lb) => {
    let noSlCount = 0;
    let noSlAmongOriginal5 = 0;
    const distsAll: number[] = [];
    const distsOrig5WhenOk: number[] = [];
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
    }
    return {
      lookback: lb,
      no_sl_count: noSlCount,
      no_sl_among_original_5: noSlAmongOriginal5,
      recovered_of_5: 5 - noSlAmongOriginal5,
      mean_sl_dist_pct_all_valid: mean(distsAll),
      mean_sl_dist_pct_orig5_if_valid: mean(distsOrig5WhenOk),
      n_valid: distsAll.length,
    };
  });

  // Counterfactual: same lookbacks but 1H window through 4H close
  const sweepThru = LOOKBACKS.map((lb) => {
    let noSlCount = 0;
    const distsAll: number[] = [];
    for (const t of trades) {
      const win = sliceUpTo(near1h, t.timestamp + 3 * MS_1H);
      const r = computeSLWithLookback(win, t.side, t.entry, lb);
      if (r.no_sl) noSlCount++;
      else distsAll.push(r.sl_dist_pct);
    }
    return {
      lookback: lb,
      no_sl_count: noSlCount,
      mean_sl_dist_pct_all_valid: mean(distsAll),
      n_valid: distsAll.length,
    };
  });

  // Write CSVs
  const caseCsv = [
    'timestamp,timestamp_iso,side,entry,lastEma20,swingExtreme_10,swingCand,emaCand,swing_ok,ema_ok,ema_vs_entry,entry_vs_swing,bar4h_high,bar4h_low,bar4h_close,no_sl_thru4h_lb10,min_lookback_at_4h_open,min_lookback_thru_4h',
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
        c.bar4h_high,
        c.bar4h_low,
        c.bar4h_close,
        c.no_sl_thru4h_lb10 ? 1 : 0,
        c.min_lookback_at_4h_open ?? '',
        c.min_lookback_thru_4h ?? '',
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(OUT_CASES, caseCsv + '\n', 'utf8');

  const sweepCsv = [
    'lookback,no_sl_count,no_sl_among_original_5,recovered_of_5,mean_sl_dist_pct_all_valid,mean_sl_dist_pct_orig5_if_valid,n_valid,counterfactual_thru4h_no_sl,counterfactual_thru4h_mean_sl_dist',
    ...sweep.map((s, idx) => {
      const th = sweepThru[idx]!;
      return [
        s.lookback,
        s.no_sl_count,
        s.no_sl_among_original_5,
        s.recovered_of_5,
        Number.isFinite(s.mean_sl_dist_pct_all_valid) ? s.mean_sl_dist_pct_all_valid.toFixed(4) : '',
        Number.isFinite(s.mean_sl_dist_pct_orig5_if_valid)
          ? s.mean_sl_dist_pct_orig5_if_valid.toFixed(4)
          : '',
        s.n_valid,
        th.no_sl_count,
        Number.isFinite(th.mean_sl_dist_pct_all_valid)
          ? th.mean_sl_dist_pct_all_valid.toFixed(4)
          : '',
      ].join(',');
    }),
  ].join('\n');
  fs.writeFileSync(OUT_SWEEP, sweepCsv + '\n', 'utf8');

  const mmCsv = [
    Object.keys(mismatchRows[0]!).join(','),
    ...mismatchRows.map((r) => Object.values(r).join(',')),
  ].join('\n');
  fs.writeFileSync(OUT_MISMATCH, mmCsv + '\n', 'utf8');

  const summary = {
    date: '2026-08-01',
    n_trades_32: trades.length,
    n_no_sl: noSlTrades.length,
    no_sl_cases: caseDetails,
    lookback_sweep_at_4h_open: sweep,
    lookback_sweep_thru_4h_counterfactual: sweepThru,
    verdict:
      'SWING_LOOKBACK 10→25 does not reduce NO_SL (still 5/32). Primary driver appears to be entry=4H close while SL window uses 1H bars only up to 4H open — entry can sit outside recent 1H range; EMA20 also on wrong side.',
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
  md.push('## Verdict');
  md.push('');
  md.push(
    '**`SWING_LOOKBACK=10` không phải nguyên nhân chính của 5 lệnh NO_SL.** Tăng lookback lên 15/20/25 **không giảm** NO_SL (vẫn 5/32, recovered 0/5). Nguyên nhân chính: **entry = close nến 4H** trong khi cửa sổ 1H cho SL cắt tại **openTime 4H** → giá entry có thể nằm ngoài toàn bộ range 1H gần nhất; EMA20 cũng sai phía → cả hai candidate bị loại.',
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
      `| ${c.timestamp_iso} | ${c.side} | ${c.entry} | ${(c.lastEma20 as number).toFixed(4)} | ${(c.swingExtreme_10 as number).toFixed(4)} | ${(c.swingCand as number).toFixed(4)} | ${(c.emaCand as number).toFixed(4)} | ${c.swing_ok} | ${c.ema_ok} | ${c.entry_vs_swing} |`,
    );
  }
  md.push('');
  md.push(
    '**Pattern:** entry (4H close) nằm **ngoài** swing extreme của 10 nến 1H tính tới 4H **open**. EMA20 cũng sai phía → `NaN` / NO_SL.',
  );
  md.push('');
  md.push('### 2b. Mismatch cửa sổ 4H-close vs 1H-at-open');
  md.push('');
  md.push(
    '| iso | side | entry | 4H high | 4H low | swing10@open | no_sl@open lb10 | no_sl nếu 1H thru 4H lb10 | min lookback@open | min lookback thru4H |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const c of caseDetails) {
    md.push(
      `| ${c.timestamp_iso} | ${c.side} | ${c.entry} | ${c.bar4h_high} | ${c.bar4h_low} | ${(c.swingExtreme_10 as number).toFixed(4)} | ${c.no_sl_at_open_lb10} | ${c.no_sl_thru4h_lb10} | ${c.min_lookback_at_4h_open ?? 'none≤200'} | ${c.min_lookback_thru_4h ?? 'none≤50'} |`,
    );
  }
  md.push('');
  md.push(
    'Counterfactual (không đề xuất đổi production): nếu SL dùng 1H bars **trong** nến 4H (`openTime ≤ 4H open + 3h`), nhiều case NO_SL biến mất ngay ở lookback=10 vì swing extreme khi đó bao được high/low đã tạo entry.',
  );
  md.push('');
  md.push('## 3–4. Sweep SWING_LOOKBACK (cửa sổ hiện tại = 1H ≤ 4H open)');
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
  md.push('### Ảnh hưởng sl_dist khi tăng lookback');
  md.push('');
  const s10 = sweep.find((s) => s.lookback === 10)!;
  const s25 = sweep.find((s) => s.lookback === 25)!;
  md.push(
    `- Mean sl_dist_pct (27 lệnh hợp lệ): **${fmt(s10.mean_sl_dist_pct_all_valid)}%** @10 → **${fmt(s25.mean_sl_dist_pct_all_valid)}%** @25 (Δ +${fmt(s25.mean_sl_dist_pct_all_valid - s10.mean_sl_dist_pct_all_valid)} pp).`,
  );
  md.push(
    '- Tăng lookback **không cứu** 5 NO_SL nhưng **làm SL hơi xa hơn** trên các lệnh còn lại.',
  );
  md.push('');
  md.push('### Counterfactual sweep (1H thru 4H) — chỉ để so sánh');
  md.push('');
  md.push('| Lookback | NO_SL (thru 4H window) | mean sl_dist_pct |');
  md.push('|---|---|---|');
  for (const s of sweepThru) {
    md.push(
      `| ${s.lookback} | ${s.no_sl_count} | ${fmt(s.mean_sl_dist_pct_all_valid)}% |`,
    );
  }
  md.push('');
  md.push('## 5. Kết luận điều tra (không chọn lookback)');
  md.push('');
  md.push(
    `- Lookback 10→25: NO_SL **không đổi** (5/32); recovered **0/5**.`,
  );
  md.push(
    `- Mean sl_dist tăng nhẹ (~${fmt(s10.mean_sl_dist_pct_all_valid)}% → ~${fmt(s25.mean_sl_dist_pct_all_valid)}%) trên lệnh đã có SL.`,
  );
  md.push(
    '- **Kết luận:** NO_SL chủ yếu do **lệch thời điểm entry (4H close) vs cửa sổ SL (1H tới 4H open)** + EMA sai phía; **không** phải vì `SWING_LOOKBACK=10` quá ngắn trong khoảng đã thử.',
  );
  md.push('- Không đổi production trong task này.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-no-sl-cases-detail-180d.csv`');
  md.push('- `docs/exports/v41-no-sl-swing-lookback-sweep-180d.csv`');
  md.push('- `docs/exports/v41-no-sl-4h-1h-window-mismatch-180d.csv`');
  md.push('- `docs/exports/v41-no-sl-swing-lookback-summary.json`');
  md.push('- `scripts/investigate-v41-no-sl-swing-lookback.ts`');
  md.push('- `scripts/investigate-v41-no-sl-swing-lookback-ext.ts` (bổ sung mismatch 4H/1H)');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify({ sweep, sweepThru, cases: mismatchRows }, null, 2));
  console.log(`[ext] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

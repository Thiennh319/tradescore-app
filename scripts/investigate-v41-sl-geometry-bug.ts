/**
 * Investigate computeCounterTrendSL wrong-side geometry bug.
 * Report-only — no production fix.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/investigate-v41-sl-geometry-bug.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import { calculateEMA, type KlineV41 } from '../services/v41/indicators';
import { computeCounterTrendSL } from '../services/v41/reversalDetector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const MS_1H = 3_600_000;
const MS_4H = 4 * MS_1H;
const FETCH_GAP_MS = 150;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP_1H = 80;
const EMA_PERIOD = 20;
const SWING_LOOKBACK = 10;
const SL_BUFFER = 0.003;

/** 4 known INVALID cases from BOTH verification */
const FOCUS_CASES: Array<{
  iso: string;
  timestamp: number;
  side: 'LONG' | 'SHORT';
  entry: number;
}> = [
  { iso: '2026-02-03T20:00:00.000Z', timestamp: 1770148800000, side: 'LONG', entry: 1.176 },
  { iso: '2026-03-12T08:00:00.000Z', timestamp: 1773302400000, side: 'SHORT', entry: 1.322 },
  { iso: '2026-07-15T12:00:00.000Z', timestamp: 1784116800000, side: 'SHORT', entry: 2.076 },
  { iso: '2026-07-18T08:00:00.000Z', timestamp: 1784361600000, side: 'LONG', entry: 1.904 },
];

const TRADES_CSV = path.resolve(
  __dirname,
  '../docs/exports/v41-backtest-180d-winrate-trades.csv',
);
const OUT_STEPS = path.resolve(
  __dirname,
  '../docs/exports/v41-sl-geometry-bug-steps-4cases.csv',
);
const OUT_32 = path.resolve(
  __dirname,
  '../docs/exports/v41-sl-geometry-bug-32trades.csv',
);
const OUT_JSON = path.resolve(
  __dirname,
  '../docs/exports/v41-sl-geometry-bug-summary.json',
);
const OUT_MD = path.resolve(
  __dirname,
  '../docs/REPORT_V41_SL_GEOMETRY_BUG_INVESTIGATION_2026-08-01.md',
);

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
    if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
    const batch = (await res.json()) as (string | number)[][];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) out.push(toKlineV41(row));
    const lastOpen = Number(batch[batch.length - 1]![0]);
    const step = interval === '4h' ? MS_4H : MS_1H;
    const next = lastOpen + step;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < BINANCE_MAX_LIMIT) break;
  }
  const byTs = new Map<number, KlineV41>();
  for (const k of out) byTs.set(k.openTime, k);
  return [...byTs.values()].sort((a, b) => a.openTime - b.openTime);
}

function sliceUpTo(klines: KlineV41[], openTime: number): KlineV41[] {
  return klines.filter((k) => k.openTime <= openTime);
}

function lastFiniteEma(emaValues: number[], index: number): number | null {
  const value = emaValues[index];
  return Number.isFinite(value) ? value : null;
}

type StepTrace = {
  timestamp: number;
  timestamp_iso: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  n_klines1h: number;
  last_close_1h: number;
  lastEma20: number;
  swingExtreme: number; // high for SHORT, low for LONG
  cand1_swing: number;
  cand2_ema: number;
  chosen_before_buffer: number;
  sl_final: number;
  sl_engine: number;
  entryPrice_used_in_fn: false;
  ema_vs_entry: 'above' | 'below' | 'equal';
  swing_vs_entry: 'above' | 'below' | 'equal';
  cand2_wrong_side_of_entry: boolean;
  chosen_is_ema: boolean;
  wrong_side: boolean;
  sl_dist_pct: number;
  root_cause: string;
};

/** Instrument computeCounterTrendSL with intermediate values (mirrors production). */
function traceSL(
  klines1H: KlineV41[],
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  timestamp: number,
): StepTrace {
  const closes = klines1H.map((k) => k.close);
  const ema20Series = calculateEMA(closes, EMA_PERIOD);
  const lastEma = lastFiniteEma(ema20Series, klines1H.length - 1)!;
  const recent = klines1H.slice(-SWING_LOOKBACK);
  const lastClose = klines1H[klines1H.length - 1]!.close;

  let swingExtreme: number;
  let cand1: number;
  let cand2: number;
  let chosen: number;
  let sl_final: number;

  if (direction === 'SHORT') {
    swingExtreme = Math.max(...recent.map((k) => k.high));
    cand1 = swingExtreme * 1.003;
    cand2 = lastEma * 1.005;
    chosen = Math.min(cand1, cand2);
    sl_final = chosen * (1 + SL_BUFFER);
  } else {
    swingExtreme = Math.min(...recent.map((k) => k.low));
    cand1 = swingExtreme * 0.997;
    cand2 = lastEma * 0.995;
    chosen = Math.max(cand1, cand2);
    sl_final = chosen * (1 - SL_BUFFER);
  }

  const sl_engine = computeCounterTrendSL({
    klines1H,
    direction,
    entryPrice,
  });

  const ema_vs_entry =
    lastEma > entryPrice ? 'above' : lastEma < entryPrice ? 'below' : 'equal';
  const swing_vs_entry =
    swingExtreme > entryPrice ? 'above' : swingExtreme < entryPrice ? 'below' : 'equal';

  const cand2_wrong =
    direction === 'SHORT' ? cand2 <= entryPrice : cand2 >= entryPrice;
  const chosen_is_ema = Math.abs(chosen - cand2) < Math.abs(chosen - cand1) + 1e-12
    ? Math.abs(chosen - cand2) <= Math.abs(chosen - cand1)
    : false;
  // clearer: which candidate equals chosen
  const pickedEma = Math.abs(chosen - cand2) <= Math.abs(chosen - cand1);

  const wrong =
    direction === 'LONG' ? !(sl_final < entryPrice) : !(sl_final > entryPrice);

  let root_cause = 'ok';
  if (wrong) {
    if (cand2_wrong && pickedEma) {
      root_cause =
        direction === 'SHORT'
          ? 'EMA*1.005 ≤ entry → Math.min picks EMA candidate → SL below entry for SHORT'
          : 'EMA*0.995 ≥ entry → Math.max picks EMA candidate → SL above entry for LONG';
    } else if (cand2_wrong && !pickedEma) {
      root_cause = 'swing candidate also wrong-side (unexpected)';
    } else {
      root_cause = 'buffer/rounding pushed SL across entry (rare)';
    }
  }

  return {
    timestamp,
    timestamp_iso: new Date(timestamp).toISOString(),
    side: direction,
    entry: entryPrice,
    n_klines1h: klines1H.length,
    last_close_1h: lastClose,
    lastEma20: lastEma,
    swingExtreme,
    cand1_swing: cand1,
    cand2_ema: cand2,
    chosen_before_buffer: chosen,
    sl_final,
    sl_engine,
    entryPrice_used_in_fn: false,
    ema_vs_entry,
    swing_vs_entry,
    cand2_wrong_side_of_entry: cand2_wrong,
    chosen_is_ema: pickedEma,
    wrong_side: wrong,
    sl_dist_pct: (Math.abs(entryPrice - sl_final) / entryPrice) * 100,
    root_cause,
  };
}

function loadTrades32(): Array<{
  timestamp: number;
  timestamp_iso: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  sl_csv: number;
  outcome: string;
}> {
  const lines = fs.readFileSync(TRADES_CSV, 'utf8').trim().split(/\r?\n/);
  const h = lines[0]!.split(',');
  const i = (n: string) => h.indexOf(n);
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    if (c[i('window')] !== '180d' || Number(c[i('conf_min')]) !== 40) continue;
    out.push({
      timestamp: Number(c[i('timestamp')]),
      timestamp_iso: c[i('timestamp_iso')]!,
      side: c[i('side')] as 'LONG' | 'SHORT',
      entry: Number(c[i('entry')]),
      sl_csv: Number(c[i('sl')]),
      outcome: c[i('outcome')]!,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const trades = loadTrades32();
  const allTs = [
    ...FOCUS_CASES.map((c) => c.timestamp),
    ...trades.map((t) => t.timestamp),
  ];
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const fetchStart = minTs - WARMUP_1H * MS_1H;
  const fetchEnd = maxTs + MS_4H;

  console.log(`[sl-bug] fetching 1H…`);
  const near1h = await fetchKlines(SYMBOL, '1h', fetchStart, fetchEnd);
  console.log(`[sl-bug] near1h=${near1h.length}`);

  // Part: 4 focus cases step-by-step
  const focusTraces: StepTrace[] = [];
  for (const c of FOCUS_CASES) {
    const win1h = sliceUpTo(near1h, c.timestamp);
    const tr = traceSL(win1h, c.side, c.entry, c.timestamp);
    focusTraces.push(tr);
    console.log(
      JSON.stringify(
        {
          iso: c.iso,
          side: c.side,
          entry: c.entry,
          lastEma: tr.lastEma20,
          swing: tr.swingExtreme,
          cand1: tr.cand1_swing,
          cand2: tr.cand2_ema,
          chosen: tr.chosen_before_buffer,
          sl: tr.sl_final,
          wrong: tr.wrong_side,
          cause: tr.root_cause,
        },
        null,
        2,
      ),
    );
  }

  // All 32 trades
  const tradeTraces: Array<StepTrace & { outcome_4h: string; sl_csv: number }> = [];
  for (const t of trades) {
    const win1h = sliceUpTo(near1h, t.timestamp);
    const tr = traceSL(win1h, t.side, t.entry, t.timestamp);
    tradeTraces.push({ ...tr, outcome_4h: t.outcome, sl_csv: t.sl_csv });
  }

  const n32 = tradeTraces.length;
  const nWrong = tradeTraces.filter((t) => t.wrong_side).length;
  const nWrongEmaPick = tradeTraces.filter(
    (t) => t.wrong_side && t.cand2_wrong_side_of_entry && t.chosen_is_ema,
  ).length;
  const nWrongLong = tradeTraces.filter((t) => t.wrong_side && t.side === 'LONG').length;
  const nWrongShort = tradeTraces.filter((t) => t.wrong_side && t.side === 'SHORT').length;
  const nTiny = tradeTraces.filter((t) => t.sl_dist_pct < 0.05).length;
  const nWrongTiny = tradeTraces.filter(
    (t) => t.wrong_side && t.sl_dist_pct < 0.05,
  ).length;

  // Verify entryPrice unused: mutate entry, SL unchanged
  const sample = trades[0]!;
  const win0 = sliceUpTo(near1h, sample.timestamp);
  const slA = computeCounterTrendSL({
    klines1H: win0,
    direction: sample.side,
    entryPrice: sample.entry,
  });
  const slB = computeCounterTrendSL({
    klines1H: win0,
    direction: sample.side,
    entryPrice: sample.entry * 10,
  });
  const entryPriceIgnored = Math.abs(slA - slB) < 1e-12;

  // CSV exports
  const stepHeader = [
    'timestamp',
    'timestamp_iso',
    'side',
    'entry',
    'last_close_1h',
    'lastEma20',
    'swingExtreme',
    'cand1_swing',
    'cand2_ema',
    'chosen_before_buffer',
    'sl_final',
    'sl_engine',
    'ema_vs_entry',
    'swing_vs_entry',
    'cand2_wrong_side',
    'chosen_is_ema',
    'wrong_side',
    'sl_dist_pct',
    'root_cause',
  ].join(',');
  const stepBody = focusTraces
    .map((t) =>
      [
        t.timestamp,
        t.timestamp_iso,
        t.side,
        t.entry,
        t.last_close_1h,
        t.lastEma20,
        t.swingExtreme,
        t.cand1_swing,
        t.cand2_ema,
        t.chosen_before_buffer,
        t.sl_final,
        t.sl_engine,
        t.ema_vs_entry,
        t.swing_vs_entry,
        t.cand2_wrong_side_of_entry ? 1 : 0,
        t.chosen_is_ema ? 1 : 0,
        t.wrong_side ? 1 : 0,
        t.sl_dist_pct,
        `"${t.root_cause}"`,
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(OUT_STEPS, `${stepHeader}\n${stepBody}\n`, 'utf8');

  const t32Header = stepHeader + ',outcome_4h,sl_csv';
  const t32Body = tradeTraces
    .map((t) =>
      [
        t.timestamp,
        t.timestamp_iso,
        t.side,
        t.entry,
        t.last_close_1h,
        t.lastEma20,
        t.swingExtreme,
        t.cand1_swing,
        t.cand2_ema,
        t.chosen_before_buffer,
        t.sl_final,
        t.sl_engine,
        t.ema_vs_entry,
        t.swing_vs_entry,
        t.cand2_wrong_side_of_entry ? 1 : 0,
        t.chosen_is_ema ? 1 : 0,
        t.wrong_side ? 1 : 0,
        t.sl_dist_pct,
        `"${t.root_cause}"`,
        t.outcome_4h,
        t.sl_csv,
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(OUT_32, `${t32Header}\n${t32Body}\n`, 'utf8');

  const summary = {
    date: '2026-08-01',
    entryPrice_parameter_ignored: entryPriceIgnored,
    focus_4_cases: focusTraces,
    among_32_active_trades: {
      n: n32,
      wrong_side: nWrong,
      wrong_pct: (nWrong / n32) * 100,
      wrong_long: nWrongLong,
      wrong_short: nWrongShort,
      wrong_via_ema_pick: nWrongEmaPick,
      sl_dist_lt_0_05pct: nTiny,
      wrong_and_tiny: nWrongTiny,
    },
    root_cause_summary:
      'computeCounterTrendSL ignores entryPrice. EMA candidate (cand2) can lie on the wrong side of entry when price has moved away from EMA20; Math.min(SHORT)/Math.max(LONG) then selects that EMA candidate as the "tighter" SL, placing SL on the profit side of entry.',
    proposed_fix_direction: [
      'Clamp SL relative to entry: SHORT require sl > entry; LONG require sl < entry',
      'If EMA candidate is wrong-side, discard it and use swing-only (or ATR fallback)',
      'Optionally: if both candidates wrong-side / too tight, return NaN and skip trade',
      'Add unit tests with entry above/below EMA covering the failing timestamps',
    ],
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2), 'utf8');

  const md: string[] = [];
  md.push('# REPORT — V4.1 SL geometry bug investigation (`computeCounterTrendSL`)');
  md.push('');
  md.push('**Date:** 2026-08-01');
  md.push('**Priority:** cao — SL sai phía = không bảo vệ vị thế');
  md.push('**Scope:** điều tra only — **không** sửa production trong task này');
  md.push('');
  md.push('## 1. Nguyên văn hàm');
  md.push('');
  md.push('`services/v41/reversalDetector.ts` (~L319–344):');
  md.push('');
  md.push('```ts');
  md.push('export function computeCounterTrendSL(params: ComputeCounterTrendSLParams): number {');
  md.push('  const { klines1H, direction } = params; // ⚠️ entryPrice KHÔNG được destructure/dùng');
  md.push('');
  md.push('  // ... EMA20 trên closes 1H, recent = last SWING_LOOKBACK(10) nến 1H');
  md.push('');
  md.push("  if (direction === 'SHORT') {");
  md.push('    const swingHigh = Math.max(...recent.map(k => k.high));');
  md.push('    const slCandidate1 = swingHigh * 1.003;');
  md.push('    const slCandidate2 = lastEma * 1.005;');
  md.push('    return Math.min(slCandidate1, slCandidate2) * (1 + SL_BUFFER); // SL_BUFFER=0.003');
  md.push('  }');
  md.push('');
  md.push('  const swingLow = Math.min(...recent.map(k => k.low));');
  md.push('  const slCandidate1 = swingLow * 0.997;');
  md.push('  const slCandidate2 = lastEma * 0.995;');
  md.push('  return Math.max(slCandidate1, slCandidate2) * (1 - SL_BUFFER);');
  md.push('}');
  md.push('```');
  md.push('');
  md.push('| Input | Thực tế |');
  md.push('|-------|---------|');
  md.push('| Timeframe | **1H** klines |');
  md.push('| ATR | **Không dùng** |');
  md.push('| Swing | SHORT→swing **high** · LONG→swing **low** (lookback 10) — hướng swing **đúng** |');
  md.push('| EMA | EMA20 close 1H |');
  md.push('| `entryPrice` | Có trong type params nhưng **bị bỏ qua hoàn toàn** |');
  md.push('');
  md.push(`Xác minh runtime: đổi \`entryPrice\` ×10 → SL không đổi = **${entryPriceIgnored}**.`);
  md.push('');
  md.push('## 2. Nguyên nhân gốc');
  md.push('');
  md.push('**Không** phải if/else LONG/SHORT bị đảo (swing high/low đúng hướng).');
  md.push('**Không** phải ATR NaN (không có ATR).');
  md.push('');
  md.push('Cơ chế lỗi:');
  md.push('');
  md.push('1. Candidate EMA (`lastEma×1.005` SHORT / `lastEma×0.995` LONG) **không** được ràng buộc so với `entry`.');
  md.push(
    '2. Khi giá đã chạy **xa khỏi EMA** theo hướng có lợi cho lệnh (vd. LONG khi giá dưới EMA; SHORT khi giá trên EMA), candidate EMA nằm **sai phía** so với entry.',
  );
  md.push(
    '3. `Math.min` (SHORT) / `Math.max` (LONG) chọn candidate “chặt” hơn → **ưu tiên đúng cái EMA sai phía**.',
  );
  md.push('4. Buffer ±0.3% không cứu được khi candidate đã sai phía.');
  md.push('');
  md.push(
    'Hệ quả: SL nằm về phía **lãi** (hoặc sát/vượt entry) → không bảo vệ; TP/SL geometry trong backtest trở nên vô nghĩa (nhiều BOTH / INVALID).',
  );
  md.push('');
  md.push('## 3. Trace 4 timestamp lỗi (từng bước)');
  md.push('');
  md.push(
    '| iso | side | entry | EMA20 | swing | cand_swing | cand_ema | chosen | SL | EMA vs entry | wrong? |',
  );
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of focusTraces) {
    md.push(
      `| ${t.timestamp_iso} | ${t.side} | ${t.entry} | ${t.lastEma20.toFixed(6)} | ${t.swingExtreme.toFixed(6)} | ${t.cand1_swing.toFixed(6)} | ${t.cand2_ema.toFixed(6)} | ${t.chosen_before_buffer.toFixed(6)} | ${t.sl_final.toFixed(6)} | ${t.ema_vs_entry} | **${t.wrong_side}** |`,
    );
  }
  md.push('');
  md.push('### Root cause từng case');
  md.push('');
  for (const t of focusTraces) {
    md.push(`- **${t.timestamp_iso}** (${t.side}): ${t.root_cause}`);
  }
  md.push('');
  md.push('## 4. Tần suất trên 32 lệnh active (180d, conf≥40)');
  md.push('');
  md.push('| Metric | Giá trị |');
  md.push('|--------|---------|');
  md.push(`| n lệnh | ${n32} |`);
  md.push(`| SL sai phía | **${nWrong}** (${((nWrong / n32) * 100).toFixed(1)}%) |`);
  md.push(`| · LONG sai phía | ${nWrongLong} |`);
  md.push(`| · SHORT sai phía | ${nWrongShort} |`);
  md.push(`| Sai phía do chọn EMA candidate | **${nWrongEmaPick}** / ${nWrong} |`);
  md.push(`| sl_dist < 0.05% | ${nTiny} (trong đó wrong=${nWrongTiny}) |`);
  md.push('');
  md.push(
    '→ Lỗi **không** chỉ ở 4/7 BOTH: ảnh hưởng đa số lệnh active trong mẫu 32. Không giới hạn ở `sl_dist` cực nhỏ (nhiều case wrong với dist vài %).',
  );
  md.push('');
  md.push('## 5. Kết luận & hướng sửa (chưa áp dụng)');
  md.push('');
  md.push('| Hạng mục | Nội dung |');
  md.push('|----------|----------|');
  md.push('| Bug ở đâu | `computeCounterTrendSL` L319–344: bỏ `entryPrice`; `Math.min`/`Math.max` với EMA candidate không clamp |');
  md.push('| Điều kiện gây lỗi | EMA20 nằm sai phía so với entry (giá đã chạy khỏi EMA) + hàm chọn EMA candidate |');
  md.push(
    `| Ảnh hưởng mẫu 32 | ${nWrong}/${n32} = ${((nWrong / n32) * 100).toFixed(1)}% lệnh SL sai phía |`,
  );
  md.push('| ATR? | Không liên quan |');
  md.push('| Swing nhầm high/low? | Không — swing đúng hướng |');
  md.push('');
  md.push('**Đề xuất sửa (không làm trong task này):**');
  md.push('');
  md.push('1. Dùng `entryPrice`: SHORT bắt buộc `sl > entry`; LONG bắt buộc `sl < entry`.');
  md.push('2. Loại candidate EMA nếu sai phía; fallback swing-only (hoặc ATR nếu muốn).');
  md.push('3. Nếu không còn candidate hợp lệ → `NaN` / skip trade (an toàn hơn SL sai phía).');
  md.push('4. Unit test tái hiện 4 timestamp trên + case entry xa EMA.');
  md.push('');
  md.push('## Artefacts');
  md.push('');
  md.push('- `docs/exports/v41-sl-geometry-bug-steps-4cases.csv`');
  md.push('- `docs/exports/v41-sl-geometry-bug-32trades.csv`');
  md.push('- `docs/exports/v41-sl-geometry-bug-summary.json`');
  md.push('- `scripts/investigate-v41-sl-geometry-bug.ts`');

  fs.writeFileSync(OUT_MD, md.join('\n') + '\n', 'utf8');
  console.log(
    JSON.stringify(
      {
        entryPriceIgnored,
        nWrong,
        n32,
        nWrongEmaPick,
        focusWrong: focusTraces.map((t) => t.wrong_side),
      },
      null,
      2,
    ),
  );
  console.log(`[sl-bug] wrote ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

/**
 * INVESTIGATION ONLY — chi tiết Momentum 1H cho 15 EW-pass NEAR funnel.
 * Không sửa momentumEngine1H.ts / không đổi threshold / không bật flag.
 *
 * npx tsx scripts/investigate-v41-near-momentum-ew15.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import { computeMomentum1H } from '../services/v41/momentumEngine1H';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL = 'NEARUSDT';
const CSV_IN = path.resolve(
  __dirname,
  '../docs/exports/backtest-v41-near-pipeline-funnel-post-eligibility-patch.csv',
);
const CSV_OUT = path.resolve(
  __dirname,
  '../docs/exports/investigate-v41-near-momentum-ew15.csv',
);
const MD_OUT = path.resolve(
  __dirname,
  '../docs/REPORT_V41_NEAR_MOMENTUM_EW15_INVESTIGATION_2026-07-28.md',
);

const VOLUME_MA_PERIOD = 20;
const VOLUME_SPIKE_MULTIPLIER = 1.5;
const CVD_LOOKBACK = 3;
const FETCH_GAP_MS = 200;
const BINANCE_MAX_LIMIT = 1500;
const WARMUP = 220;

type EwRow = {
  openTime: number;
  iso: string;
  trendDirection: string;
  proposedSide: 'LONG' | 'SHORT';
  momentumPass: number;
  reversalScore: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function adapt(raw: (string | number)[]): KlineV41 {
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

async function fetchKlines1h(endMs: number, startMs: number): Promise<KlineV41[]> {
  const out: KlineV41[] = [];
  let cursorEnd = endMs;
  while (cursorEnd > startMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', SYMBOL);
    url.searchParams.set('interval', '1h');
    url.searchParams.set('limit', String(BINANCE_MAX_LIMIT));
    url.searchParams.set('endTime', String(cursorEnd));
    await sleep(FETCH_GAP_MS);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length === 0) break;
    const rawBatch = (json as (string | number)[][])
      .map(adapt)
      .filter((k) => k.closeTime < Date.now() - 1000);
    if (rawBatch.length === 0) break;
    const earliest = Math.min(...rawBatch.map((k) => k.openTime));
    out.push(...rawBatch.filter((k) => k.openTime >= startMs));
    if (earliest <= startMs) break;
    cursorEnd = earliest - 1;
    if (rawBatch.length < 2) break;
  }
  const map = new Map(out.map((k) => [k.openTime, k]));
  return [...map.values()].sort((a, b) => a.openTime - b.openTime);
}

function cvd(k: KlineV41): number {
  return k.takerBuyVolume - (k.volume - k.takerBuyVolume);
}

function volMa20(klines: KlineV41[]): number | null {
  if (klines.length < VOLUME_MA_PERIOD + 1) return null;
  const lastIdx = klines.length - 1;
  const vols = klines.slice(lastIdx - VOLUME_MA_PERIOD, lastIdx).map((k) => k.volume);
  const ma = vols.reduce((a, b) => a + b, 0) / vols.length;
  return Number.isFinite(ma) && ma > 0 ? ma : null;
}

type Detail = {
  openTime: number;
  iso: string;
  proposedSide: 'LONG' | 'SHORT';
  csvMomentumPass: number;
  engineConfirmed: boolean;
  score: number;
  // volume leg
  lastVolume: number;
  volMa20: number | null;
  volRatio: number | null; // lastVol / ma
  spikeThreshold: number;
  candleDirection: 'BULL' | 'BEAR' | 'DOJI';
  needBearishCandle: boolean; // SHORT needs close<open
  needBullishCandle: boolean;
  volumeSpikePass: boolean;
  volumeGapToSpike: number | null; // volRatio - 1.5 (negative = short of threshold)
  candleColorOk: boolean;
  // CVD leg
  cvd0: number;
  cvd1: number;
  cvd2: number;
  cvdAllCorrectSign: boolean;
  cvdNeededSign: 'positive' | 'negative';
  cvdPass: boolean;
  cvdFailCount: number; // how many of 3 bars wrong sign
  // aggregate
  legsPass: number; // 0..2
  missLegs: string;
  nearMiss: boolean; // exactly 1 leg fail AND close on volume
  farMiss: boolean;
};

function analyze(win: KlineV41[], row: EwRow): Detail {
  const last = win[win.length - 1];
  const ma = volMa20(win);
  const volRatio = ma != null && ma > 0 ? last.volume / ma : null;
  const candleDirection =
    last.close > last.open ? 'BULL' : last.close < last.open ? 'BEAR' : 'DOJI';

  const side = row.proposedSide;
  const needBearish = side === 'SHORT';
  const needBullish = side === 'LONG';
  const candleColorOk = needBearish
    ? last.close < last.open
    : last.close > last.open;

  const volAbove = volRatio != null && volRatio > VOLUME_SPIKE_MULTIPLIER;
  const volumeSpikePass = volAbove && candleColorOk;

  const last3 = win.slice(-CVD_LOOKBACK);
  const cvds = last3.map(cvd);
  while (cvds.length < 3) cvds.unshift(NaN);
  const needPos = side === 'LONG';
  const cvdPass = needPos
    ? cvds.every((v) => v > 0)
    : cvds.every((v) => v < 0);
  const cvdFailCount = needPos
    ? cvds.filter((v) => !(v > 0)).length
    : cvds.filter((v) => !(v < 0)).length;

  const mom = computeMomentum1H(win);
  const engineConfirmed =
    side === 'LONG' ? mom.momentumConfirmedLong : mom.momentumConfirmedShort;
  const score = side === 'LONG' ? mom.momentumLong : mom.momentumShort;

  const legsPass = (volumeSpikePass ? 1 : 0) + (cvdPass ? 1 : 0);
  const miss: string[] = [];
  if (!volumeSpikePass) {
    if (!volAbove) miss.push('VOL_RATIO');
    if (!candleColorOk) miss.push('CANDLE_COLOR');
  }
  if (!cvdPass) miss.push('CVD_SIGN');

  const volumeGap =
    volRatio != null ? volRatio - VOLUME_SPIKE_MULTIPLIER : null;

  // Near-miss heuristic: exactly one logical leg missing, and if volume is the miss,
  // ratio within 0.3 of threshold OR only candle color wrong with ratio ok;
  // if CVD miss, at most 1 of 3 bars wrong sign.
  let nearMiss = false;
  let farMiss = false;
  if (legsPass === 1) {
    if (!volumeSpikePass && cvdPass) {
      if (candleColorOk && volumeGap != null && volumeGap > -0.3 && volumeGap <= 0) {
        nearMiss = true;
      } else if (volAbove && !candleColorOk) {
        nearMiss = true; // only color wrong
      } else if (volumeGap != null && volumeGap > -0.3) {
        nearMiss = true;
      } else {
        farMiss = true;
      }
    } else if (volumeSpikePass && !cvdPass) {
      if (cvdFailCount <= 1) nearMiss = true;
      else farMiss = true;
    }
  } else if (legsPass === 0) {
    farMiss = true;
  }

  return {
    openTime: row.openTime,
    iso: row.iso,
    proposedSide: side,
    csvMomentumPass: row.momentumPass,
    engineConfirmed,
    score,
    lastVolume: last.volume,
    volMa20: ma,
    volRatio,
    spikeThreshold: VOLUME_SPIKE_MULTIPLIER,
    candleDirection,
    needBearishCandle: needBearish,
    needBullishCandle: needBullish,
    volumeSpikePass,
    volumeGapToSpike: volumeGap,
    candleColorOk,
    cvd0: cvds[0],
    cvd1: cvds[1],
    cvd2: cvds[2],
    cvdAllCorrectSign: cvdPass,
    cvdNeededSign: needPos ? 'positive' : 'negative',
    cvdPass,
    cvdFailCount,
    legsPass,
    missLegs: miss.join('|') || '(none)',
    nearMiss,
    farMiss,
  };
}

function loadEwRows(): EwRow[] {
  const text = fs.readFileSync(CSV_IN, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const header = lines[0].split(',');
  const idx = (name: string) => header.indexOf(name);
  const rows: EwRow[] = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith('stage,')) break;
    const cols = line.split(',');
    if (cols.length < 10) continue;
    const contextPass = cols[idx('contextPass')];
    const ewPass = cols[idx('ewPass')];
    if (contextPass !== '1' || ewPass !== '1') continue;
    rows.push({
      openTime: Number(cols[idx('openTime')]),
      iso: cols[idx('iso')],
      trendDirection: cols[idx('trendDirection')],
      proposedSide: cols[idx('proposedSide')] as 'LONG' | 'SHORT',
      momentumPass: Number(cols[idx('momentumPass')]),
      reversalScore: cols[idx('reversalScore')],
    });
  }
  return rows;
}

function fmt(n: number | null | undefined, d = 3): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(d);
}

async function main(): Promise<void> {
  const ewRows = loadEwRows();
  console.log(`Loaded EW-pass rows: ${ewRows.length}`);
  if (ewRows.length === 0) {
    console.error('No EW-pass rows');
    process.exit(2);
  }

  const minOt = Math.min(...ewRows.map((r) => r.openTime));
  const maxOt = Math.max(...ewRows.map((r) => r.openTime));
  const klines = await fetchKlines1h(
    maxOt + 3_600_000,
    minOt - WARMUP * 3_600_000,
  );
  console.log(`Fetched NEAR 1h klines: ${klines.length}`);

  const details: Detail[] = [];
  for (const row of ewRows) {
    const idx = klines.findIndex((k) => k.openTime === row.openTime);
    if (idx < 0) {
      console.warn(`Missing kline for ${row.iso}`);
      continue;
    }
    const win = klines.slice(0, idx + 1);
    details.push(analyze(win, row));
  }

  // Console table
  console.log('\n=== Momentum detail (counter-trend side) ===\n');
  for (const d of details) {
    console.log(
      `${d.iso} ${d.proposedSide} | conf=${d.engineConfirmed} score=${d.score} legs=${d.legsPass}/2 miss=${d.missLegs}`,
    );
    console.log(
      `  VOL: ratio=${fmt(d.volRatio)} (need>${d.spikeThreshold}) gap=${fmt(d.volumeGapToSpike)} candle=${d.candleDirection} colorOk=${d.candleColorOk} spikePass=${d.volumeSpikePass}`,
    );
    console.log(
      `  CVD: [${fmt(d.cvd0, 1)}, ${fmt(d.cvd1, 1)}, ${fmt(d.cvd2, 1)}] need=${d.cvdNeededSign} failBars=${d.cvdFailCount}/3 pass=${d.cvdPass}`,
    );
    console.log(
      `  class: nearMiss=${d.nearMiss} farMiss=${d.farMiss}`,
    );
  }

  const fails = details.filter((d) => !d.engineConfirmed);
  const passes = details.filter((d) => d.engineConfirmed);
  const fail1leg = fails.filter((d) => d.legsPass === 1);
  const fail0leg = fails.filter((d) => d.legsPass === 0);
  const near = fails.filter((d) => d.nearMiss);
  const far = fails.filter((d) => d.farMiss);
  const missVolOnly = fails.filter(
    (d) => d.missLegs === 'VOL_RATIO' || d.missLegs === 'CANDLE_COLOR' || d.missLegs === 'VOL_RATIO|CANDLE_COLOR',
  );
  const missCvdOnly = fails.filter((d) => d.missLegs === 'CVD_SIGN');
  const missBoth = fails.filter(
    (d) => d.missLegs.includes('CVD') && (d.missLegs.includes('VOL') || d.missLegs.includes('CANDLE')),
  );

  const summary = {
    n: details.length,
    pass: passes.length,
    fail: fails.length,
    fail_0_legs: fail0leg.length,
    fail_1_leg: fail1leg.length,
    near_miss: near.length,
    far_miss: far.length,
    miss_vol_only: missVolOnly.length,
    miss_cvd_only: missCvdOnly.length,
    miss_both_legs: missBoth.length,
  };
  console.log('\n=== Summary ===');
  console.log(summary);

  // CSV
  const header = [
    'iso',
    'proposedSide',
    'engineConfirmed',
    'score',
    'legsPass',
    'missLegs',
    'volRatio',
    'spikeThreshold',
    'volumeGapToSpike',
    'candleDirection',
    'candleColorOk',
    'volumeSpikePass',
    'cvd0',
    'cvd1',
    'cvd2',
    'cvdNeededSign',
    'cvdFailCount',
    'cvdPass',
    'nearMiss',
    'farMiss',
  ];
  const lines = details.map((d) =>
    [
      d.iso,
      d.proposedSide,
      d.engineConfirmed ? 1 : 0,
      d.score,
      d.legsPass,
      d.missLegs,
      fmt(d.volRatio),
      d.spikeThreshold,
      fmt(d.volumeGapToSpike),
      d.candleDirection,
      d.candleColorOk ? 1 : 0,
      d.volumeSpikePass ? 1 : 0,
      fmt(d.cvd0, 2),
      fmt(d.cvd1, 2),
      fmt(d.cvd2, 2),
      d.cvdNeededSign,
      d.cvdFailCount,
      d.cvdPass ? 1 : 0,
      d.nearMiss ? 1 : 0,
      d.farMiss ? 1 : 0,
    ].join(','),
  );
  fs.mkdirSync(path.dirname(CSV_OUT), { recursive: true });
  fs.writeFileSync(CSV_OUT, [header.join(','), ...lines, ''].join('\n'), 'utf8');

  // Report MD
  const md: string[] = [];
  md.push('# REPORT — Điều tra Momentum 1H trên 15 EW-pass NEAR (funnel continuous)');
  md.push('');
  md.push('**Date:** 2026-07-28 (+07)');
  md.push('**Phạm vi:** V4.1 only — **không sửa** `momentumEngine1H.ts`, không đổi threshold, không bật flag');
  md.push(`**Nguồn signal:** \`docs/exports/backtest-v41-near-pipeline-funnel-post-eligibility-patch.csv\` (contextPass=1 & ewPass=1 → n=${details.length})`);
  md.push(`**Chi tiết số:** \`${path.relative(path.resolve(__dirname, '..'), CSV_OUT)}\``);
  md.push('');
  md.push('## 1. Điều kiện confirmed (đọc từ code)');
  md.push('');
  md.push('File: `services/v41/momentumEngine1H.ts`');
  md.push('');
  md.push('| Hằng số | Giá trị |');
  md.push('|---|---|');
  md.push('| `VOLUME_SPIKE_MULTIPLIER` | **1.5** (volume > 1.5 × MA20) |');
  md.push('| `VOLUME_MA_PERIOD` | 20 (MA trên 20 nến **trước** nến cuối) |');
  md.push('| `CVD_LOOKBACK` | **3** nến cuối |');
  md.push('| Confirmed | score **≥ 2** (= đủ **cả 2** tín hiệu cùng phía) |');
  md.push('');
  md.push('**LONG confirmed** cần đồng thời:');
  md.push('1. `BUY_VOLUME_SPIKE_1H`: `volume > 1.5×MA20` **và** `close > open`');
  md.push('2. `CVD_RISING_1H`: CVD proxy trên **cả 3** nến cuối đều **> 0**');
  md.push('');
  md.push('**SHORT confirmed** cần đồng thời:');
  md.push('1. `SELL_VOLUME_SPIKE_1H`: `volume > 1.5×MA20` **và** `close < open`');
  md.push('2. `CVD_FALLING_1H`: CVD trên cả 3 nến cuối đều **< 0**');
  md.push('');
  md.push('CVD proxy = `takerBuyVolume - (volume - takerBuyVolume)`.');
  md.push('');
  md.push('## 2. Bảng 15 signal × thành phần Momentum (counter-trend side)');
  md.push('');
  md.push('| # | iso | side | conf | legs | volRatio (need>1.5) | gap | candle | colorOk | CVD×3 | cvdFail | miss | near/far |');
  md.push('|---:|---|---|:-:|:-:|---:|---:|---|:-:|---|:-:|---|---|');
  details.forEach((d, i) => {
    const nf = d.engineConfirmed
      ? 'PASS'
      : d.nearMiss
        ? 'NEAR'
        : d.farMiss
          ? 'FAR'
          : '?';
    md.push(
      `| ${i + 1} | ${d.iso} | ${d.proposedSide} | ${d.engineConfirmed ? 'Y' : 'N'} | ${d.legsPass}/2 | ${fmt(d.volRatio)} | ${fmt(d.volumeGapToSpike)} | ${d.candleDirection} | ${d.candleColorOk ? 'Y' : 'N'} | ${fmt(d.cvd0, 0)} / ${fmt(d.cvd1, 0)} / ${fmt(d.cvd2, 0)} | ${d.cvdFailCount}/3 | ${d.missLegs} | ${nf} |`,
    );
  });
  md.push('');
  md.push('## 3. Pattern trên 14 FAIL');
  md.push('');
  md.push('| Nhóm | n |');
  md.push('|---|---:|');
  md.push(`| FAIL tổng | ${fails.length} |`);
  md.push(`| Đủ 0/2 leg | ${fail0leg.length} |`);
  md.push(`| Đủ đúng 1/2 leg | ${fail1leg.length} |`);
  md.push(`| Near-miss (heuristic) | ${near.length} |`);
  md.push(`| Far-miss | ${far.length} |`);
  md.push(`| Chỉ miss volume leg (ratio và/hoặc candle color) | ${missVolOnly.length} |`);
  md.push(`| Chỉ miss CVD sign | ${missCvdOnly.length} |`);
  md.push(`| Miss cả volume + CVD | ${missBoth.length} |`);
  md.push('');
  md.push('### Nhận xét pattern (không kết luận sửa)');
  md.push('');
  if (fail0leg.length >= fails.length * 0.5) {
    md.push(
      `- **Đa số FAIL ở 0/2 leg** (${fail0leg.length}/${fails.length}) — không phải “chỉ thiếu một chút một điều kiện”; cả volume-spike và CVD cùng phía đều không đạt.`,
    );
  } else if (fail1leg.length >= fails.length * 0.5) {
    md.push(
      `- **Đa số FAIL ở đúng 1/2 leg** (${fail1leg.length}/${fails.length}) — thường chỉ thiếu một nhánh (volume **hoặc** CVD).`,
    );
  } else {
    md.push(
      `- FAIL phân tán: 0-leg=${fail0leg.length}, 1-leg=${fail1leg.length} trên ${fails.length} fail.`,
    );
  }
  if (near.length >= fails.length * 0.5) {
    md.push(
      `- Near-miss heuristic chiếm ${near.length}/${fails.length} fail → nhiều trường hợp **gần** ngưỡng (ví dụ volRatio sát 1.5, hoặc CVD chỉ 1/3 nến sai dấu).`,
    );
  } else {
    md.push(
      `- Near-miss chỉ ${near.length}/${fails.length} fail; far-miss ${far.length}/${fails.length} → phần lớn **không** nằm trong vùng “sát ngưỡng một điều kiện”.`,
    );
  }
  md.push(
    `- Confirmed đòi **AND cứng 2/2** (không có confirmed ở score=1) → một nhánh fail là đủ loại toàn bộ signal dù nhánh kia đã pass.`,
  );
  md.push(
    `- Không đưa khuyến nghị đổi threshold trong báo cáo này — chỉ mô tả phân bố khoảng cách tới ngưỡng.`,
  );
  md.push('');
  md.push('## 4. PASS duy nhất');
  md.push('');
  if (passes.length === 0) {
    md.push('(không có)');
  } else {
    for (const d of passes) {
      md.push(
        `- ${d.iso} ${d.proposedSide}: volRatio=${fmt(d.volRatio)}, candle=${d.candleDirection}, CVD=[${fmt(d.cvd0, 0)}, ${fmt(d.cvd1, 0)}, ${fmt(d.cvd2, 0)}]`,
      );
    }
  }
  md.push('');

  fs.writeFileSync(MD_OUT, md.join('\n'), 'utf8');
  console.log(`\nWrote ${CSV_OUT}`);
  console.log(`Wrote ${MD_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

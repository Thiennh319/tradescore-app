/**
 * Task 2 analyzer — Decision Confidence threshold sweep from funnel CSVs.
 * Read-only vs decisionConfig. Simulates would-activate at thr T + simple H12 R proxy.
 *
 * Usage:
 *   npx tsx --require ./scripts/node-async-storage-shim.cjs scripts/analyze-v41-decision-conf-sweep.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BINANCE_BASE_URL } from '../constants/scoring';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '../docs/exports/v41-decision-funnel-180d');
const THRS = [50, 55, 60, 65, 70, 75] as const;
const HORIZON_H = 12;
const COOLDOWN_H = 12;
const ATR_N = 14;
const SL_ATR = 1.5;
const TP_ATR = 2.5;

type Row = Record<string, string>;

function parseCsv(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const summaryIdx = lines.findIndex((l) => l.startsWith('stage,'));
  const dataLines = summaryIdx >= 0 ? lines.slice(0, summaryIdx) : lines;
  if (dataLines.length < 2) return [];
  const header = dataLines[0].split(',');
  const rows: Row[] = [];
  for (let i = 1; i < dataLines.length; i++) {
    const cols = dataLines[i].split(',');
    if (cols.length < header.length) continue;
    // hardBlocks may contain | but not commas in our dumps; if overflow, join middle
    const row: Row = {};
    if (cols.length === header.length) {
      header.forEach((h, j) => {
        row[h] = cols[j];
      });
    } else {
      const excess = cols.length - header.length;
      for (let j = 0; j < header.length; j++) {
        if (j < 25) row[header[j]] = cols[j];
        else if (j === 25) row[header[j]] = cols.slice(j, j + 1 + excess).join(',');
        else row[header[j]] = cols[j + excess];
      }
    }
    rows.push(row);
  }
  return rows;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetch1h(symbol: string, startMs: number, endMs: number) {
  const out: { openTime: number; high: number; low: number; close: number }[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const url = new URL(`${BINANCE_BASE_URL}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1h');
    url.searchParams.set('limit', '1500');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endMs));
    await sleep(200);
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`klines ${symbol} ${res.status}`);
    const json = (await res.json()) as (string | number)[][];
    if (!Array.isArray(json) || json.length === 0) break;
    for (const r of json) {
      out.push({
        openTime: Number(r[0]),
        high: parseFloat(String(r[2])),
        low: parseFloat(String(r[3])),
        close: parseFloat(String(r[4])),
      });
    }
    const latest = Number(json[json.length - 1][0]);
    if (latest <= cursor) break;
    cursor = latest + 1;
    if (json.length < 1500) break;
  }
  const map = new Map(out.map((k) => [k.openTime, k]));
  return [...map.values()].sort((a, b) => a.openTime - b.openTime);
}

function atr(klines: { high: number; low: number; close: number }[], i: number): number {
  if (i < 1) return 0;
  const start = Math.max(1, i - ATR_N + 1);
  let sum = 0;
  let n = 0;
  for (let j = start; j <= i; j++) {
    const tr = Math.max(
      klines[j].high - klines[j].low,
      Math.abs(klines[j].high - klines[j - 1].close),
      Math.abs(klines[j].low - klines[j - 1].close),
    );
    sum += tr;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

type Trade = { side: 'LONG' | 'SHORT'; openTime: number; r: number | null; win: boolean | null };

function simulateTrade(
  klines: { openTime: number; high: number; low: number; close: number }[],
  idx: number,
  side: 'LONG' | 'SHORT',
): { r: number | null; win: boolean | null } {
  if (idx < 0 || idx >= klines.length - 1) return { r: null, win: null };
  const entry = klines[idx].close;
  const a = atr(klines, idx);
  if (!(a > 0) || !(entry > 0)) return { r: null, win: null };
  const slDist = SL_ATR * a;
  const tpDist = TP_ATR * a;
  const sl = side === 'LONG' ? entry - slDist : entry + slDist;
  const tp = side === 'LONG' ? entry + tpDist : entry - tpDist;
  const end = Math.min(klines.length - 1, idx + HORIZON_H);
  for (let j = idx + 1; j <= end; j++) {
    const k = klines[j];
    if (side === 'LONG') {
      if (k.low <= sl) return { r: -1, win: false };
      if (k.high >= tp) return { r: tpDist / slDist, win: true };
    } else {
      if (k.high >= sl) return { r: -1, win: false };
      if (k.low <= tp) return { r: tpDist / slDist, win: true };
    }
  }
  const exit = klines[end].close;
  const pnl = side === 'LONG' ? exit - entry : entry - exit;
  const r = pnl / slDist;
  return { r, win: r > 0 };
}

function wouldActivate(row: Row, thr: number): 'LONG' | 'SHORT' | null {
  if (row.eligible !== '1') return null;
  const fc = Number(row.finalConfidence);
  if (!Number.isFinite(fc) || fc < thr) return null;
  const side = (row.proposedDirection || row.proposedSide || '').toUpperCase();
  if (side !== 'LONG' && side !== 'SHORT') return null;
  // Match engine: activation only needs eligible + proposedDirection + conf≥thr
  // (EW/momentum already folded into confidence / context in RC3 path)
  return side;
}

function analyzeCoin(sym: string, rows: Row[], klines: { openTime: number; high: number; low: number; close: number }[]) {
  const byTime = new Map(klines.map((k, i) => [k.openTime, i]));
  const n = rows.length || 1;
  const confs = rows.map((r) => Number(r.finalConfidence)).filter(Number.isFinite);
  const nLt45 = rows.filter((r) => r.bandLt45 === '1').length;
  const n45 = rows.filter((r) => r.band45to75 === '1').length;
  const nGe75 = rows.filter((r) => r.bandGe75 === '1').length;
  const elig = rows.filter((r) => r.eligible === '1').length;
  const ctxSkip = {
    fundingNA: rows.filter((r) => r.ctxFunding === 'NA' || r.ctxFunding === 'SKIP').length,
    oiNA: rows.filter((r) => r.ctxOi === 'NA' || r.ctxOi === 'SKIP').length,
    whaleNA: rows.filter((r) => r.ctxWhale === 'NA' || r.ctxWhale === 'SKIP').length,
  };
  const t0 = Math.min(...rows.map((r) => Number(r.openTime)));
  const t1 = Math.max(...rows.map((r) => Number(r.openTime)));
  const daysEff = (t1 - t0) / 86_400_000 + 1 / 24;

  const sweeps = THRS.map((thr) => {
    const signals: Trade[] = [];
    let lastSigBar = -COOLDOWN_H;
    let barHits = 0;
    let longN = 0;
    let shortN = 0;
    for (let i = 0; i < rows.length; i++) {
      const side = wouldActivate(rows[i], thr);
      if (!side) continue;
      barHits++;
      const ot = Number(rows[i].openTime);
      const ki = byTime.get(ot);
      if (ki == null) continue;
      if (ki - lastSigBar < COOLDOWN_H) continue;
      lastSigBar = ki;
      const sim = simulateTrade(klines, ki, side);
      signals.push({ side, openTime: ot, r: sim.r, win: sim.win });
      if (side === 'LONG') longN++;
      else shortN++;
    }
    const evaluated = signals.filter((s) => s.win != null);
    const wins = evaluated.filter((s) => s.win).length;
    const rs = evaluated.map((s) => s.r!).filter((x) => Number.isFinite(x));
    const ev = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    const wr = evaluated.length ? (100 * wins) / evaluated.length : null;
    const perMonth = daysEff > 0 ? (signals.length / daysEff) * 30 : 0;
    return {
      thr,
      pctBarsGeThr: (100 * rows.filter((r) => Number(r.finalConfidence) >= thr).length) / n,
      barHitsEligibleGeThr: barHits,
      nTrades: signals.length,
      nLong: longN,
      nShort: shortN,
      nPerMonth: perMonth,
      nEval: evaluated.length,
      wr,
      ev,
    };
  });

  // IS/OOS on best thr by EV among thr with nEval>=5, else by nPerMonth among n>=1
  const ranked = [...sweeps].sort((a, b) => {
    const ae = a.ev ?? -999;
    const be = b.ev ?? -999;
    if (a.nEval >= 5 && b.nEval >= 5) return be - ae;
    return b.nTrades - a.nTrades;
  });
  const best = ranked[0];
  const mid = t0 + (t1 - t0) * (120 / 180); // approximate IS 120 / OOS 60 of requested window
  // Use actual span split 2/3 — 1/3
  const split = t0 + (t1 - t0) * (2 / 3);

  function sliceStats(thr: number, from: number, to: number) {
    const signals: Trade[] = [];
    let lastSigBar = -COOLDOWN_H;
    for (const row of rows) {
      const ot = Number(row.openTime);
      if (ot < from || ot > to) continue;
      const side = wouldActivate(row, thr);
      if (!side) continue;
      const ki = byTime.get(ot);
      if (ki == null) continue;
      if (ki - lastSigBar < COOLDOWN_H) continue;
      lastSigBar = ki;
      const sim = simulateTrade(klines, ki, side);
      signals.push({ side, openTime: ot, r: sim.r, win: sim.win });
    }
    const evaluated = signals.filter((s) => s.win != null);
    const wins = evaluated.filter((s) => s.win).length;
    const rs = evaluated.map((s) => s.r!).filter(Number.isFinite);
    return {
      n: signals.length,
      nEval: evaluated.length,
      wr: evaluated.length ? (100 * wins) / evaluated.length : null,
      ev: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    };
  }

  const is = sliceStats(best.thr, t0, split);
  const oos = sliceStats(best.thr, split + 1, t1);

  return {
    sym,
    bars: rows.length,
    daysEff,
    conf: {
      min: confs.length ? Math.min(...confs) : null,
      max: confs.length ? Math.max(...confs) : null,
      mean: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
    },
    bands: {
      lt45_pct: (100 * nLt45) / n,
      b45_75_pct: (100 * n45) / n,
      ge75_pct: (100 * nGe75) / n,
      nLt45,
      n45,
      nGe75,
    },
    eligible: elig,
    ctxSkip,
    sweeps,
    bestThr: best.thr,
    is,
    oos,
    splitIso: new Date(split).toISOString(),
  };
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('-180d.csv'));
  const results = [];
  for (const f of files) {
    const rows = parseCsv(path.join(DIR, f));
    const sym = rows[0]?.symbol ?? f;
    console.error('analyze', sym, 'rows', rows.length);
    if (!rows.length) continue;
    const t0 = Math.min(...rows.map((r) => Number(r.openTime)));
    const t1 = Math.max(...rows.map((r) => Number(r.openTime))) + HORIZON_H * 3_600_000;
    const klines = await fetch1h(sym, t0 - ATR_N * 3_600_000, t1);
    console.error('  klines', klines.length);
    results.push(analyzeCoin(sym, rows, klines));
  }
  const out = path.join(DIR, 'SWEEP_SUMMARY.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  console.error('wrote', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

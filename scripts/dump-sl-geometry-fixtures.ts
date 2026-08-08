/**
 * Dump 1H kline fixtures for computeCounterTrendSL regression cases.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import { computeCounterTrendSL } from '../services/v41/reversalDetector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MS_1H = 3_600_000;
const OUT_DIR = path.resolve(__dirname, '../services/v41/__tests__/fixtures');

const CASES = [
  { id: '2026-02-03T20', timestamp: 1770148800000, side: 'LONG' as const, entry: 1.176 },
  { id: '2026-03-12T08', timestamp: 1773302400000, side: 'SHORT' as const, entry: 1.322 },
  { id: '2026-07-15T12', timestamp: 1784116800000, side: 'SHORT' as const, entry: 2.076 },
  { id: '2026-07-18T08', timestamp: 1784361600000, side: 'LONG' as const, entry: 1.904 },
];

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
    url.searchParams.set('symbol', 'NEARUSDT');
    url.searchParams.set('interval', '1h');
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', '1500');
    await new Promise((r) => setTimeout(r, 150));
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const batch = (await res.json()) as (string | number)[][];
    if (!batch.length) break;
    for (const row of batch) out.push(toKlineV41(row));
    const next = Number(batch[batch.length - 1]![0]) + MS_1H;
    if (next <= cursor) break;
    cursor = next;
    if (batch.length < 1500) break;
  }
  const by = new Map<number, KlineV41>();
  for (const k of out) by.set(k.openTime, k);
  return [...by.values()].sort((a, b) => a.openTime - b.openTime);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const minTs = Math.min(...CASES.map((c) => c.timestamp));
  const maxTs = Math.max(...CASES.map((c) => c.timestamp));
  const all = await fetchKlines(minTs - 80 * MS_1H, maxTs + MS_1H);
  const index = [];
  for (const c of CASES) {
    const win = all.filter((k) => k.openTime <= c.timestamp).slice(-80);
    const sl = computeCounterTrendSL({
      klines1H: win,
      direction: c.side,
      entryPrice: c.entry,
    });
    const ok =
      c.side === 'LONG' ? Number.isFinite(sl) && sl < c.entry : Number.isFinite(sl) && sl > c.entry;
    const file = `sl-geometry-${c.id.replace(/:/g, '')}.json`;
    fs.writeFileSync(
      path.join(OUT_DIR, file),
      JSON.stringify({ meta: { ...c, sl_after_fix: sl, side_ok: ok }, klines1H: win }, null, 2),
    );
    index.push({ ...c, file, sl_after_fix: sl, side_ok: ok });
    console.log(c.id, 'n=', win.length, 'sl=', sl, 'ok=', ok);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'sl-geometry-cases.json'), JSON.stringify(index, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

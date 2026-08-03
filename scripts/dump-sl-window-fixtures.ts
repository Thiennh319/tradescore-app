/**
 * Dump 1H fixtures for former NO_SL cases — window through 4H close (open+3h).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINANCE_BASE_URL } from '../constants/scoring';
import type { KlineV41 } from '../services/v41/indicators';
import {
  computeCounterTrendSL,
  sliceKlines1HForFourHEntry,
} from '../services/v41/reversalDetector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MS_1H = 3_600_000;
const OUT_DIR = path.resolve(__dirname, '../services/v41/__tests__/fixtures');

/** Former NO_SL after entryPrice-fix; window-at-open bug. */
const CASES = [
  { id: '2026-02-05T16', timestamp: 1770307200000, side: 'LONG' as const, entry: 1.016 },
  { id: '2026-03-03T00', timestamp: 1772496000000, side: 'SHORT' as const, entry: 1.419 },
  { id: '2026-03-15T00', timestamp: 1773532800000, side: 'SHORT' as const, entry: 1.355 },
  { id: '2026-05-06T12', timestamp: 1778068800000, side: 'SHORT' as const, entry: 1.509 },
  { id: '2026-07-27T12', timestamp: 1785153600000, side: 'LONG' as const, entry: 1.771 },
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
  const all = await fetchKlines(minTs - 80 * MS_1H, maxTs + 4 * MS_1H);
  const index = [];
  for (const c of CASES) {
    const winOpen = all.filter((k) => k.openTime <= c.timestamp).slice(-80);
    const winThru = sliceKlines1HForFourHEntry(all, c.timestamp).slice(-80);
    const slOpen = computeCounterTrendSL({
      klines1H: winOpen,
      direction: c.side,
      entryPrice: c.entry,
    });
    const slThru = computeCounterTrendSL({
      klines1H: all,
      direction: c.side,
      entryPrice: c.entry,
      fourHOpenTime: c.timestamp,
    });
    const ok =
      c.side === 'LONG'
        ? Number.isFinite(slThru) && slThru < c.entry
        : Number.isFinite(slThru) && slThru > c.entry;
    const file = `sl-window-${c.id.replace(/:/g, '')}.json`;
    fs.writeFileSync(
      path.join(OUT_DIR, file),
      JSON.stringify(
        {
          meta: {
            ...c,
            sl_at_open_window: slOpen,
            sl_thru_4h_window: slThru,
            side_ok: ok,
          },
          klines1H: winThru,
        },
        null,
        2,
      ),
    );
    index.push({
      ...c,
      file,
      sl_at_open_window: slOpen,
      sl_thru_4h_window: slThru,
      side_ok: ok,
    });
    console.log(
      c.id,
      'n_open=',
      winOpen.length,
      'n_thru=',
      winThru.length,
      'slOpen=',
      slOpen,
      'slThru=',
      slThru,
      'ok=',
      ok,
    );
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'sl-window-cases.json'),
    JSON.stringify(index, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

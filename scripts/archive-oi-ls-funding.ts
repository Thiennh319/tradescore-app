/**
 * Forward archive collector — multi-symbol OI / L/S / funding (1h).
 *
 * Symbols: NEARUSDT, BTCUSDT, SOLUSDT, BNBUSDT
 * - Raw fetch to Binance public Futures endpoints (same URLs as before).
 * - One CSV per symbol under data/market-archive/{symbol_lower}_1h.csv
 * - Per-symbol isolation: one symbol failing must not abort the others
 * - Heal: merge last ~24h of OI/LS hist when available
 *
 * Run: npx tsx scripts/archive-oi-ls-funding.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BINANCE_BASE = 'https://fapi.binance.com';
const SYMBOLS = ['NEARUSDT', 'BTCUSDT', 'SOLUSDT', 'BNBUSDT'] as const;
export type ArchiveSymbol = (typeof SYMBOLS)[number];

const MS_1H = 3_600_000;
const FETCH_GAP_MS = 200;
const HEAL_HOURS = 24;
const SOURCE_FORWARD = 'forward_archive';
const SOURCE_HEAL = 'api_heal_24h';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = path.resolve(__dirname, '../data/market-archive');

const CSV_HEADER =
  'timestamp,timestamp_iso,symbol,oi,ls_top_ratio,ls_global_ratio,funding_rate,source,status,error,collected_at';

type RowStatus = 'ok' | 'partial' | 'error';

type ArchiveRow = {
  timestamp: number;
  timestamp_iso: string;
  symbol: string;
  oi: number | null;
  ls_top_ratio: number | null;
  ls_global_ratio: number | null;
  funding_rate: number | null;
  source: string;
  status: RowStatus;
  error: string;
  collected_at: number;
};

export type SymbolArchiveResult = {
  symbol: string;
  changed: boolean;
  rowsWritten: number;
  currentHour: number;
  error?: string;
};

function csvPathForSymbol(symbol: string): string {
  return path.join(ARCHIVE_DIR, `${symbol.toLowerCase()}_1h.csv`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function floorHourUtc(ms: number): number {
  return Math.floor(ms / MS_1H) * MS_1H;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function cellNum(n: number | null): string {
  return n == null || !Number.isFinite(n) ? '' : String(n);
}

function rowToCsv(r: ArchiveRow): string {
  return [
    r.timestamp,
    r.timestamp_iso,
    r.symbol,
    cellNum(r.oi),
    cellNum(r.ls_top_ratio),
    cellNum(r.ls_global_ratio),
    cellNum(r.funding_rate),
    r.source,
    r.status,
    csvEscape(r.error),
    r.collected_at,
  ].join(',');
}

function parseCsv(text: string, fallbackSymbol: string): ArchiveRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  const out: ArchiveRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (cols.length < 11) continue;
    const timestamp = Number(cols[0]);
    if (!Number.isFinite(timestamp)) continue;
    out.push({
      timestamp,
      timestamp_iso: cols[1] ?? new Date(timestamp).toISOString(),
      symbol: cols[2] || fallbackSymbol,
      oi: cols[3] === '' ? null : Number(cols[3]),
      ls_top_ratio: cols[4] === '' ? null : Number(cols[4]),
      ls_global_ratio: cols[5] === '' ? null : Number(cols[5]),
      funding_rate: cols[6] === '' ? null : Number(cols[6]),
      source: cols[7] || SOURCE_FORWARD,
      status: (cols[8] as RowStatus) || 'error',
      error: cols[9] ?? '',
      collected_at: Number(cols[10]) || Date.now(),
    });
  }
  return out;
}

/** Minimal CSV split supporting quoted fields. */
function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function loadExisting(csvPath: string, symbol: string): Map<number, ArchiveRow> {
  const map = new Map<number, ArchiveRow>();
  if (!fs.existsSync(csvPath)) return map;
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'), symbol);
  for (const r of rows) map.set(r.timestamp, r);
  return map;
}

function writeAll(csvPath: string, rows: Map<number, ArchiveRow>): void {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const sorted = [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
  const body = sorted.map(rowToCsv).join('\n');
  fs.writeFileSync(csvPath, `${CSV_HEADER}\n${body}${sorted.length ? '\n' : ''}`, 'utf8');
}

async function fetchJson(
  urlPath: string,
  params: Record<string, string | number>,
): Promise<{ ok: boolean; status: number; json: unknown; err: string }> {
  const u = new URL(BINANCE_BASE + urlPath);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  await sleep(FETCH_GAP_MS);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(u.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, json: null, err: `non-json HTTP ${res.status}` };
    }
    if (!res.ok) {
      const msg =
        typeof json === 'object' && json && 'msg' in json
          ? String((json as { msg: unknown }).msg)
          : `HTTP ${res.status}`;
      return { ok: false, status: res.status, json, err: msg };
    }
    return { ok: true, status: res.status, json, err: '' };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: null,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

async function fetchOiHistRecent(
  symbol: string,
  limit = 30,
): Promise<{ points: { timestamp: number; oi: number }[]; err: string }> {
  const r = await fetchJson('/futures/data/openInterestHist', {
    symbol,
    period: '1h',
    limit,
  });
  if (!r.ok || !Array.isArray(r.json)) {
    return { points: [], err: r.err || 'oi hist failed' };
  }
  const points = (r.json as { timestamp: number; sumOpenInterest: string }[])
    .map((p) => ({
      timestamp: floorHourUtc(Number(p.timestamp)),
      oi: Number(p.sumOpenInterest),
    }))
    .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.oi));
  return { points, err: '' };
}

async function fetchLsHistRecent(
  symbol: string,
  limit = 30,
): Promise<{ points: { timestamp: number; ratio: number }[]; err: string }> {
  const r = await fetchJson('/futures/data/topLongShortAccountRatio', {
    symbol,
    period: '1h',
    limit,
  });
  if (!r.ok || !Array.isArray(r.json)) {
    return { points: [], err: r.err || 'ls hist failed' };
  }
  const points = (r.json as { timestamp: string; longShortRatio: string }[])
    .map((p) => ({
      timestamp: floorHourUtc(Number(p.timestamp)),
      ratio: Number(p.longShortRatio),
    }))
    .filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.ratio) && p.ratio > 0);
  return { points, err: '' };
}

async function fetchLatestFunding(
  symbol: string,
): Promise<{ rate: number | null; err: string }> {
  const r = await fetchJson('/fapi/v1/fundingRate', {
    symbol,
    limit: 1,
  });
  if (!r.ok || !Array.isArray(r.json) || r.json.length === 0) {
    return { rate: null, err: r.err || 'funding failed' };
  }
  const rate = Number((r.json[0] as { fundingRate: string }).fundingRate);
  return {
    rate: Number.isFinite(rate) ? rate : null,
    err: Number.isFinite(rate) ? '' : 'funding NaN',
  };
}

function deriveStatus(row: Pick<ArchiveRow, 'oi' | 'ls_top_ratio' | 'funding_rate'>): {
  status: RowStatus;
  error: string;
} {
  const missing: string[] = [];
  if (row.oi == null) missing.push('oi');
  if (row.ls_top_ratio == null) missing.push('ls');
  if (row.funding_rate == null) missing.push('funding');
  if (missing.length === 0) return { status: 'ok', error: '' };
  if (missing.length === 3) return { status: 'error', error: `missing:${missing.join('|')}` };
  return { status: 'partial', error: `missing:${missing.join('|')}` };
}

function upsert(
  map: Map<number, ArchiveRow>,
  next: ArchiveRow,
  preferIncomingWhenBetter: boolean,
): boolean {
  const prev = map.get(next.timestamp);
  if (!prev) {
    map.set(next.timestamp, next);
    return true;
  }
  if (!preferIncomingWhenBetter) return false;

  // Prefer filling nulls; keep better status ranking ok > partial > error
  const rank = (s: RowStatus) => (s === 'ok' ? 2 : s === 'partial' ? 1 : 0);
  const merged: ArchiveRow = {
    ...prev,
    oi: next.oi ?? prev.oi,
    ls_top_ratio: next.ls_top_ratio ?? prev.ls_top_ratio,
    ls_global_ratio: next.ls_global_ratio ?? prev.ls_global_ratio,
    funding_rate: next.funding_rate ?? prev.funding_rate,
    collected_at: Math.max(prev.collected_at, next.collected_at),
    source: prev.source === SOURCE_FORWARD ? prev.source : next.source,
  };
  const d = deriveStatus(merged);
  merged.status = d.status;
  merged.error = d.error;
  if (
    merged.oi !== prev.oi ||
    merged.ls_top_ratio !== prev.ls_top_ratio ||
    merged.funding_rate !== prev.funding_rate ||
    rank(merged.status) > rank(prev.status)
  ) {
    map.set(next.timestamp, merged);
    return true;
  }
  return false;
}

/** Collect + upsert for a single symbol. Throws only on unexpected fatal I/O. */
export async function runArchiveCollectorForSymbol(
  symbol: string,
): Promise<SymbolArchiveResult> {
  const csvPath = csvPathForSymbol(symbol);
  const collectedAt = Date.now();
  const currentHour = floorHourUtc(collectedAt);
  const existing = loadExisting(csvPath, symbol);
  const beforeSize = existing.size;
  let changed = false;

  const [oiHist, lsHist, funding] = await Promise.all([
    fetchOiHistRecent(symbol, HEAL_HOURS + 2),
    fetchLsHistRecent(symbol, HEAL_HOURS + 2),
    fetchLatestFunding(symbol),
  ]);

  const oiByTs = new Map(oiHist.points.map((p) => [p.timestamp, p.oi]));
  const lsByTs = new Map(lsHist.points.map((p) => [p.timestamp, p.ratio]));

  const healStart = currentHour - HEAL_HOURS * MS_1H;
  for (let ts = healStart; ts <= currentHour; ts += MS_1H) {
    const oi = oiByTs.get(ts) ?? null;
    const ls = lsByTs.get(ts) ?? null;
    const isCurrent = ts === currentHour;
    const fundingRate = isCurrent ? funding.rate : (existing.get(ts)?.funding_rate ?? null);

    // Skip hours with no new data at all (don't invent empty error rows for ancient hours)
    if (oi == null && ls == null && !isCurrent) continue;

    const errs: string[] = [];
    if (oiHist.err && oi == null) errs.push(`oi:${oiHist.err}`);
    if (lsHist.err && ls == null) errs.push(`ls:${lsHist.err}`);
    if (isCurrent && funding.err && funding.rate == null) errs.push(`funding:${funding.err}`);

    const base: ArchiveRow = {
      timestamp: ts,
      timestamp_iso: new Date(ts).toISOString(),
      symbol,
      oi,
      ls_top_ratio: ls,
      ls_global_ratio: null, // app uses top→global copy; leave null until explicit global fetch
      funding_rate: fundingRate,
      source: isCurrent ? SOURCE_FORWARD : SOURCE_HEAL,
      status: 'error',
      error: '',
      collected_at: collectedAt,
    };
    const d = deriveStatus(base);
    base.status = d.status;
    base.error = [d.error, ...errs].filter(Boolean).join(';');

    if (upsert(existing, base, true)) changed = true;
  }

  // Always ensure current hour row exists even if all fetches failed
  if (!existing.has(currentHour)) {
    const fail: ArchiveRow = {
      timestamp: currentHour,
      timestamp_iso: new Date(currentHour).toISOString(),
      symbol,
      oi: null,
      ls_top_ratio: null,
      ls_global_ratio: null,
      funding_rate: funding.rate,
      source: SOURCE_FORWARD,
      status: 'error',
      error: [oiHist.err && `oi:${oiHist.err}`, lsHist.err && `ls:${lsHist.err}`, funding.err && `funding:${funding.err}`]
        .filter(Boolean)
        .join(';') || 'all_failed',
      collected_at: collectedAt,
    };
    const d = deriveStatus(fail);
    fail.status = d.status;
    if (!fail.error) fail.error = d.error;
    existing.set(currentHour, fail);
    changed = true;
  }

  if (changed || existing.size !== beforeSize || !fs.existsSync(csvPath)) {
    writeAll(csvPath, existing);
    changed = true;
  }

  console.log(
    `[archive] symbol=${symbol} hour=${new Date(currentHour).toISOString()} rows=${existing.size} changed=${changed} oiPts=${oiHist.points.length} lsPts=${lsHist.points.length}`,
  );
  return { symbol, changed, rowsWritten: existing.size, currentHour };
}

/**
 * Run all configured symbols sequentially (rate-limit friendly).
 * Each symbol is try/caught independently.
 */
export async function runArchiveCollector(
  symbols: readonly string[] = SYMBOLS,
): Promise<{
  changed: boolean;
  results: SymbolArchiveResult[];
}> {
  const results: SymbolArchiveResult[] = [];
  let anyChanged = false;

  for (const symbol of symbols) {
    try {
      const r = await runArchiveCollectorForSymbol(symbol);
      results.push(r);
      if (r.changed) anyChanged = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[archive] symbol=${symbol} fatal (isolated):`, e);
      results.push({
        symbol,
        changed: false,
        rowsWritten: 0,
        currentHour: floorHourUtc(Date.now()),
        error: msg,
      });
      // Best-effort gap marker for this symbol only
      try {
        const collectedAt = Date.now();
        const currentHour = floorHourUtc(collectedAt);
        const csvPath = csvPathForSymbol(symbol);
        const existing = loadExisting(csvPath, symbol);
        existing.set(currentHour, {
          timestamp: currentHour,
          timestamp_iso: new Date(currentHour).toISOString(),
          symbol,
          oi: null,
          ls_top_ratio: null,
          ls_global_ratio: null,
          funding_rate: null,
          source: SOURCE_FORWARD,
          status: 'error',
          error: msg,
          collected_at: collectedAt,
        });
        writeAll(csvPath, existing);
        anyChanged = true;
        results[results.length - 1]!.changed = true;
        results[results.length - 1]!.rowsWritten = existing.size;
      } catch {
        // leave as-is; other symbols continue
      }
    }
  }

  return { changed: anyChanged, results };
}

async function main(): Promise<void> {
  try {
    const { results } = await runArchiveCollector();
    for (const r of results) {
      if (r.error) {
        console.warn(`[archive] ${r.symbol} ended with error: ${r.error}`);
      }
    }
    // Exit 0 even on partial data so Actions stays green; gaps are in CSV status.
    process.exitCode = 0;
  } catch (e) {
    console.error('[archive] fatal (all symbols)', e);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  void main();
}

export { SYMBOLS, csvPathForSymbol, ARCHIVE_DIR };

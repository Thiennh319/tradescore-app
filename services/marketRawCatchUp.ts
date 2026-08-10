import { BINANCE_BASE_URL, TRADE_SYMBOLS, type AppTradeSymbol } from '../constants/scoring';
import { binancePublicFetch } from './binanceApi';
import { persistGetJson, persistSetJson } from './persistStorage';
import { formatJournalJsonlDateVn } from './journalJsonlExport';
import {
  appendDiskJsonlViaBridge,
  isDiskJsonlBridgeAvailable,
} from './journalJsonlBridge';

export const MARKET_RAW_CURSOR_KEY = '@tradescore/market_raw_cursor_v1';
export const MARKET_RAW_FIRST_BACKFILL_DAYS = 14;
export const MARKET_RAW_INTERVAL = '1h' as const;

export type MarketRawKind = 'klines' | 'oi_hist' | 'funding' | 'ls_ratio';

export type MarketRawCursor = {
  /** `${symbol}|${kind}|${interval}` → last included timestamp ms */
  byKey: Record<string, number>;
};

export type MarketRawRecord = {
  v: 1;
  kind: MarketRawKind;
  symbol: AppTradeSymbol;
  interval: typeof MARKET_RAW_INTERVAL;
  ts: number;
  fetchedAt: number;
  payload: Record<string, unknown>;
};

export function marketRawCursorKey(
  symbol: string,
  kind: MarketRawKind,
  interval: string = MARKET_RAW_INTERVAL,
): string {
  return `${symbol}|${kind}|${interval}`;
}

export function dedupeKeyForRecord(rec: MarketRawRecord): string {
  return `${rec.symbol}|${rec.kind}|${rec.ts}`;
}

export function filterNewMarketRawRecords(
  records: readonly MarketRawRecord[],
  cursor: MarketRawCursor | null | undefined,
): MarketRawRecord[] {
  const byKey = cursor?.byKey ?? {};
  const seen = new Set<string>();
  const out: MarketRawRecord[] = [];
  for (const rec of records) {
    const ck = marketRawCursorKey(rec.symbol, rec.kind, rec.interval);
    const last = byKey[ck] ?? 0;
    if (rec.ts <= last) continue;
    const dk = dedupeKeyForRecord(rec);
    if (seen.has(dk)) continue;
    seen.add(dk);
    out.push(rec);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function mergeMarketRawCursor(
  cursor: MarketRawCursor | null | undefined,
  records: readonly MarketRawRecord[],
): MarketRawCursor {
  const byKey = { ...(cursor?.byKey ?? {}) };
  for (const rec of records) {
    const ck = marketRawCursorKey(rec.symbol, rec.kind, rec.interval);
    byKey[ck] = Math.max(byKey[ck] ?? 0, rec.ts);
  }
  return { byKey };
}

export function resolveCatchUpStartMs(
  cursor: MarketRawCursor | null | undefined,
  symbol: string,
  kind: MarketRawKind,
  nowMs: number,
  firstBackfillDays = MARKET_RAW_FIRST_BACKFILL_DAYS,
): number {
  const ck = marketRawCursorKey(symbol, kind);
  const last = cursor?.byKey?.[ck];
  if (last != null && Number.isFinite(last) && last > 0) {
    return last + 1;
  }
  return nowMs - firstBackfillDays * 24 * 60 * 60 * 1000;
}

function buildUrl(path: string, params: Record<string, string | number>): string {
  const url = new URL(path, BINANCE_BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function fetchJsonArray(path: string, params: Record<string, string | number>): Promise<unknown[]> {
  const res = await binancePublicFetch(buildUrl(path, params));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path}`);
  }
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) {
    throw new Error(`Expected array from ${path}`);
  }
  return json;
}

function mapKlines(
  symbol: AppTradeSymbol,
  rows: unknown[],
  fetchedAt: number,
): MarketRawRecord[] {
  const out: MarketRawRecord[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const openTime = Number(row[0]);
    const closeTime = Number(row[6] ?? openTime + 3_600_000 - 1);
    if (!Number.isFinite(openTime)) continue;
    // Drop still-open candle
    if (closeTime >= fetchedAt) continue;
    out.push({
      v: 1,
      kind: 'klines',
      symbol,
      interval: MARKET_RAW_INTERVAL,
      ts: openTime,
      fetchedAt,
      payload: {
        openTime,
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
        closeTime,
      },
    });
  }
  return out;
}

function mapOiHist(symbol: AppTradeSymbol, rows: unknown[], fetchedAt: number): MarketRawRecord[] {
  const out: MarketRawRecord[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const o = row as { timestamp?: number; sumOpenInterest?: string };
    const ts = Number(o.timestamp);
    if (!Number.isFinite(ts)) continue;
    out.push({
      v: 1,
      kind: 'oi_hist',
      symbol,
      interval: MARKET_RAW_INTERVAL,
      ts,
      fetchedAt,
      payload: {
        timestamp: ts,
        sumOpenInterest: o.sumOpenInterest,
      },
    });
  }
  return out;
}

function mapFunding(symbol: AppTradeSymbol, rows: unknown[], fetchedAt: number): MarketRawRecord[] {
  const out: MarketRawRecord[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const o = row as { fundingTime?: number; fundingRate?: string; markPrice?: string };
    const ts = Number(o.fundingTime);
    if (!Number.isFinite(ts)) continue;
    out.push({
      v: 1,
      kind: 'funding',
      symbol,
      interval: MARKET_RAW_INTERVAL,
      ts,
      fetchedAt,
      payload: {
        fundingTime: ts,
        fundingRate: o.fundingRate,
        markPrice: o.markPrice,
      },
    });
  }
  return out;
}

function mapLs(symbol: AppTradeSymbol, rows: unknown[], fetchedAt: number): MarketRawRecord[] {
  const out: MarketRawRecord[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const o = row as {
      timestamp?: string | number;
      longShortRatio?: string;
      longAccount?: string;
      shortAccount?: string;
    };
    const ts = Number(o.timestamp);
    if (!Number.isFinite(ts)) continue;
    out.push({
      v: 1,
      kind: 'ls_ratio',
      symbol,
      interval: MARKET_RAW_INTERVAL,
      ts,
      fetchedAt,
      payload: {
        timestamp: ts,
        longShortRatio: o.longShortRatio,
        longAccount: o.longAccount,
        shortAccount: o.shortAccount,
      },
    });
  }
  return out;
}

async function fetchKindForSymbol(
  symbol: AppTradeSymbol,
  kind: MarketRawKind,
  startTime: number,
  endTime: number,
  fetchedAt: number,
): Promise<MarketRawRecord[]> {
  const limit = 500;
  switch (kind) {
    case 'klines': {
      const rows = await fetchJsonArray('/fapi/v1/klines', {
        symbol,
        interval: MARKET_RAW_INTERVAL,
        startTime,
        endTime,
        limit,
      });
      return mapKlines(symbol, rows, fetchedAt);
    }
    case 'oi_hist': {
      const rows = await fetchJsonArray('/futures/data/openInterestHist', {
        symbol,
        period: MARKET_RAW_INTERVAL,
        startTime,
        endTime,
        limit,
      });
      return mapOiHist(symbol, rows, fetchedAt);
    }
    case 'funding': {
      const rows = await fetchJsonArray('/fapi/v1/fundingRate', {
        symbol,
        startTime,
        endTime,
        limit,
      });
      return mapFunding(symbol, rows, fetchedAt);
    }
    case 'ls_ratio': {
      const rows = await fetchJsonArray('/futures/data/topLongShortAccountRatio', {
        symbol,
        period: MARKET_RAW_INTERVAL,
        startTime,
        endTime,
        limit,
      });
      return mapLs(symbol, rows, fetchedAt);
    }
    default:
      return [];
  }
}

const KINDS: MarketRawKind[] = ['klines', 'oi_hist', 'funding', 'ls_ratio'];

export async function loadMarketRawCursor(): Promise<MarketRawCursor> {
  const stored = await persistGetJson<MarketRawCursor>(MARKET_RAW_CURSOR_KEY);
  if (stored?.byKey && typeof stored.byKey === 'object') return { byKey: stored.byKey };
  return { byKey: {} };
}

export async function saveMarketRawCursor(cursor: MarketRawCursor): Promise<void> {
  await persistSetJson(MARKET_RAW_CURSOR_KEY, cursor);
}

/**
 * Fetch catch-up rows for all TRADE_SYMBOLS (sequential per symbol, kinds sequential).
 * Does not write disk / cursor.
 */
export async function collectMarketRawCatchUpRecords(
  cursor: MarketRawCursor,
  nowMs = Date.now(),
  symbols: readonly AppTradeSymbol[] = TRADE_SYMBOLS,
): Promise<{ records: MarketRawRecord[]; errors: string[] }> {
  const fetchedAt = nowMs;
  const endTime = nowMs;
  const all: MarketRawRecord[] = [];
  const errors: string[] = [];

  for (const symbol of symbols) {
    for (const kind of KINDS) {
      const startTime = resolveCatchUpStartMs(cursor, symbol, kind, nowMs);
      try {
        const rows = await fetchKindForSymbol(symbol, kind, startTime, endTime, fetchedAt);
        all.push(...rows);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${symbol}|${kind}: ${msg}`);
        console.warn('[MarketRaw]', symbol, kind, msg);
        if (/418|451|banned|Eligibility|restricted location/i.test(msg)) {
          return { records: filterNewMarketRawRecords(all, cursor), errors };
        }
      }
    }
  }

  return { records: filterNewMarketRawRecords(all, cursor), errors };
}

export async function runMarketRawCatchUpExport(): Promise<{
  exported: number;
  skipped: boolean;
  reason?: string;
  errors: string[];
}> {
  const cursor = await loadMarketRawCursor();
  const { records, errors } = await collectMarketRawCatchUpRecords(cursor);

  if (records.length === 0) {
    console.log('[MarketRaw] No new rows — skip', errors.length ? `(errors: ${errors.length})` : '');
    return { exported: 0, skipped: true, reason: 'NO_PENDING', errors };
  }

  if (!isDiskJsonlBridgeAvailable()) {
    console.warn(
      `[MarketRaw] ${records.length} pending but no WebView2 bridge (open via TradeScore-Web.exe)`,
    );
    return { exported: 0, skipped: true, reason: 'NO_WEBVIEW_BRIDGE', errors };
  }

  const date = formatJournalJsonlDateVn(new Date());
  const lines = records.map((r) => JSON.stringify(r));
  const result = await appendDiskJsonlViaBridge({
    subdir: 'market-raw',
    filePrefix: 'market_raw',
    date,
    lines,
  });

  if (!result.ok) {
    console.warn('[MarketRaw] Disk append failed — cursor not updated:', result.error);
    return { exported: 0, skipped: true, reason: result.error ?? 'APPEND_FAILED', errors };
  }

  await saveMarketRawCursor(mergeMarketRawCursor(cursor, records));
  console.log(
    `[MarketRaw] Appended ${records.length} line(s) → data/market-raw/market_raw_${date}.jsonl`,
    result.path ? `(${result.path})` : '',
  );
  return { exported: records.length, skipped: false, errors };
}

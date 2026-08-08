/**
 * In-memory market snapshots published by V3/V4 Signal Board scan (Unified).
 * Consumers (Market Analysis, Locked Plan) reuse these instead of re-fetching Binance.
 */

import { SCAN_INTERVAL_MS } from '../constants/scanSchedule';
import type { AppTradeSymbol } from '../constants/scoring';
import type { AllMarketData } from './binanceApi';

/** Allow consumers to treat a scan as "same cycle" slightly past the 60s mark. */
export const SCAN_SNAPSHOT_FRESH_MS = SCAN_INTERVAL_MS + 15_000;

export interface ScanMarketSnapshot {
  symbol: AppTradeSymbol;
  market: AllMarketData;
  tickerPrice: number;
  change24h: number;
  btcChange24h: number;
  scannedAt: number;
}

const bySymbol = new Map<AppTradeSymbol, ScanMarketSnapshot>();
let lastBtcChange24h = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

export function publishScanMarketSnapshot(entry: ScanMarketSnapshot): void {
  bySymbol.set(entry.symbol, entry);
  lastBtcChange24h = entry.btcChange24h;
  notify();
}

export function getScanMarketSnapshot(
  symbol: AppTradeSymbol,
): ScanMarketSnapshot | null {
  return bySymbol.get(symbol) ?? null;
}

export function getLastPublishedBtcChange24h(): number {
  return lastBtcChange24h;
}

export function isScanMarketSnapshotFresh(
  snapshot: ScanMarketSnapshot | null | undefined,
  now = Date.now(),
  maxAgeMs = SCAN_SNAPSHOT_FRESH_MS,
): boolean {
  if (snapshot == null) return false;
  if (!(snapshot.tickerPrice > 0) || snapshot.market == null) return false;
  return now - snapshot.scannedAt <= maxAgeMs;
}

export function getFreshScanMarketSnapshot(
  symbol: AppTradeSymbol,
  now = Date.now(),
  maxAgeMs = SCAN_SNAPSHOT_FRESH_MS,
): ScanMarketSnapshot | null {
  const snap = getScanMarketSnapshot(symbol);
  return isScanMarketSnapshotFresh(snap, now, maxAgeMs) ? snap : null;
}

export function subscribeScanMarketSnapshots(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper */
export function __resetScanMarketSnapshotsForTests(): void {
  bySymbol.clear();
  lastBtcChange24h = 0;
  listeners.clear();
}

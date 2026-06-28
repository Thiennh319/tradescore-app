import type { AppTradeSymbol } from '../constants/scoring';
import type { SymbolBookSnapshot, WhaleRadarEvent } from './whaleRadarDetect';
import { storageGetItem, storageSetItem } from './storage';

const SNAPSHOT_KEY = '@tradescore/v1/whale-radar-snapshots';
const ALERTS_KEY = '@tradescore/v1/whale-radar-alerts';
const LAST_SCAN_KEY = '@tradescore/v1/whale-radar-last-scan';
const ALERT_LOCKS_KEY = '@tradescore/v1/whale-radar-alert-locks';
const ENABLED_KEY = '@tradescore/v1/whale-radar-enabled';
const SUMMARY_KEY = '@tradescore/v1/whale-radar-last-summary';

export interface WhaleRadarScanSummary {
  scannedAt: number;
  symbolCount: number;
  eventCount: number;
  wallCount: number;
  events: WhaleRadarEvent[];
}

type SnapshotMap = Partial<Record<AppTradeSymbol, SymbolBookSnapshot>>;
type AlertLocks = Record<string, number>;

/** In-memory mirror — cho buildWhaleEntryWalls đồng bộ sau mỗi lần quét radar. */
let snapshotsSync: SnapshotMap = {};

export function getWhaleRadarSnapshotsSync(): SnapshotMap {
  return snapshotsSync;
}

export function setWhaleRadarSnapshotsSync(map: SnapshotMap): void {
  snapshotsSync = { ...map };
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await storageGetItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadWhaleRadarSnapshots(): Promise<SnapshotMap> {
  const loaded = (await readJson<SnapshotMap>(SNAPSHOT_KEY)) ?? {};
  snapshotsSync = { ...loaded };
  return loaded;
}

export async function saveWhaleRadarSnapshot(snapshot: SymbolBookSnapshot): Promise<void> {
  const all = await loadWhaleRadarSnapshots();
  all[snapshot.symbol] = snapshot;
  snapshotsSync = { ...all };
  await storageSetItem(SNAPSHOT_KEY, JSON.stringify(all));
}

export async function getLastWhaleRadarScanAt(): Promise<number | null> {
  const raw = await storageGetItem(LAST_SCAN_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function setLastWhaleRadarScanAt(ts: number): Promise<void> {
  await storageSetItem(LAST_SCAN_KEY, String(ts));
}

export async function loadRecentWhaleRadarAlerts(): Promise<WhaleRadarEvent[]> {
  return (await readJson<WhaleRadarEvent[]>(ALERTS_KEY)) ?? [];
}

export async function appendWhaleRadarAlerts(events: WhaleRadarEvent[]): Promise<void> {
  if (events.length === 0) return;
  const prev = await loadRecentWhaleRadarAlerts();
  const next = [...events, ...prev].slice(0, 40);
  await storageSetItem(ALERTS_KEY, JSON.stringify(next));
}

export async function saveWhaleRadarScanSummary(summary: WhaleRadarScanSummary): Promise<void> {
  await storageSetItem(SUMMARY_KEY, JSON.stringify(summary));
}

export async function loadWhaleRadarScanSummary(): Promise<WhaleRadarScanSummary | null> {
  return readJson<WhaleRadarScanSummary>(SUMMARY_KEY);
}

export async function loadWhaleAlertLocks(): Promise<AlertLocks> {
  return (await readJson<AlertLocks>(ALERT_LOCKS_KEY)) ?? {};
}

export async function saveWhaleAlertLocks(locks: AlertLocks): Promise<void> {
  await storageSetItem(ALERT_LOCKS_KEY, JSON.stringify(locks));
}

export async function isWhaleRadarEnabled(): Promise<boolean> {
  const raw = await storageGetItem(ENABLED_KEY);
  if (raw === '0') return false;
  return true;
}

export async function setWhaleRadarEnabled(enabled: boolean): Promise<void> {
  await storageSetItem(ENABLED_KEY, enabled ? '1' : '0');
}

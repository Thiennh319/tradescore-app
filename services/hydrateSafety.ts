import type { AiTradeJournalEntry } from '../constants/aiJournal';
import { AI_JOURNAL_STORAGE_KEYS } from '../constants/aiJournal';
import type { StoredTradeJournalEntry } from '../store/useTradeStore';
import { LEGACY_STORAGE_KEYS as STORAGE_KEYS } from './appPersistence';
import { persistGetJson } from './persistStorage';
import {
  TRADE_SNAPSHOT_KEY,
  type TradeFullSnapshot,
  mergeTradeSnapshots,
} from './tradeSnapshot';
import { migrateTradeSnapshot } from './phase1Migration';

export interface DiskJournalCounts {
  legacy: number;
  ai: number;
  snapshotLegacy: number;
  snapshotAi: number;
}

export function maxDiskJournalCount(counts: DiskJournalCounts): number {
  return Math.max(counts.legacy, counts.ai, counts.snapshotLegacy, counts.snapshotAi);
}

export function maxMemoryJournalCount(
  tradeJournal: StoredTradeJournalEntry[],
  aiTradeJournal: AiTradeJournalEntry[],
): number {
  return Math.max(tradeJournal.length, aiTradeJournal.length);
}

/** Không ghi đè disk có journal bằng state rỗng (cold start đọc AsyncStorage thất bại). */
export function shouldPersistHydratedState(memoryMax: number, diskMax: number): boolean {
  if (diskMax > 0 && memoryMax === 0) {
    console.warn(
      `[hydrate] Bỏ qua persist — bộ nhớ rỗng nhưng disk còn ${diskMax} bản ghi journal`,
    );
    return false;
  }
  return true;
}

export async function readDiskJournalCounts(): Promise<DiskJournalCounts> {
  const [legacy, ai, snapshotRaw] = await Promise.all([
    persistGetJson<StoredTradeJournalEntry[]>(STORAGE_KEYS.journal),
    persistGetJson<AiTradeJournalEntry[]>(AI_JOURNAL_STORAGE_KEYS.TRADE_JOURNAL),
    persistGetJson<unknown>(TRADE_SNAPSHOT_KEY),
  ]);
  const snapshot = migrateTradeSnapshot(snapshotRaw);
  return {
    legacy: legacy?.length ?? 0,
    ai: ai?.length ?? 0,
    snapshotLegacy: snapshot?.tradeJournal?.length ?? 0,
    snapshotAi: snapshot?.aiTradeJournal?.length ?? 0,
  };
}

/** Phục hồi từ full snapshot khi các key rời bị đọc rỗng nhưng snapshot còn dữ liệu. */
export async function loadRecoverySnapshot(): Promise<TradeFullSnapshot | null> {
  const snapshotRaw = await persistGetJson<unknown>(TRADE_SNAPSHOT_KEY);
  const snapshot = migrateTradeSnapshot(snapshotRaw);
  if (!snapshot) return null;
  const count = Math.max(
    snapshot.tradeJournal?.length ?? 0,
    snapshot.aiTradeJournal?.length ?? 0,
  );
  return count > 0 ? snapshot : null;
}

export function mergeHydrateSnapshots(
  ...sources: Array<TradeFullSnapshot | null | undefined>
): TradeFullSnapshot | null {
  return mergeTradeSnapshots(...sources);
}

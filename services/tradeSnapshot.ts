import type {
  AiTradeJournalEntry,
  AccountHistoryPoint,
  DailySessionStats,
  LockedTradePlan,
} from '../constants/aiJournal';
import type { SkippedSetupEntry, AppSettings } from '../constants/scoring';
import { DEFAULT_SETTINGS } from '../constants/scoring';
import type { PsychologyChecklist, StoredTradeJournalEntry } from '../store/useTradeStore';
import { isWebPlatform } from '../utils/isWebPlatform';
import { persistGetJson, persistSetJson } from './persistStorage';
import { migrateTradeSnapshot } from './phase1Migration';
import { saveSnapshotToIndexedDb, loadSnapshotFromIndexedDb } from './webIndexedDbMirror';
import { publishSnapshotUpdate } from './webTabSync';
import { readBackupFile, writeBackupFile, restoreBackupFileHandle } from './webFileBackup';

export const TRADE_SNAPSHOT_KEY = '@tradescore/v7/full-snapshot';
export const TRADE_SNAPSHOT_VERSION = 1;
const WINDOW_NAME_PREFIX = 'TS1:';
const WINDOW_NAME_MAX_CHARS = 1_400_000;

export interface TradeFullSnapshot {
  version: number;
  savedAt: number;
  tradeJournal: StoredTradeJournalEntry[];
  aiTradeJournal: AiTradeJournalEntry[];
  dailyStats: DailySessionStats[];
  accountHistory: AccountHistoryPoint[];
  skippedSetups: SkippedSetupEntry[];
  settings: AppSettings;
  psychologyChecklist: PsychologyChecklist;
  /** Optional để tương thích snapshot cũ (v1 không có field này). */
  lockedPlan?: LockedTradePlan | null;
}

export function buildTradeSnapshot(input: {
  tradeJournal: StoredTradeJournalEntry[];
  aiTradeJournal: AiTradeJournalEntry[];
  dailyStats: DailySessionStats[];
  accountHistory: AccountHistoryPoint[];
  skippedSetups: SkippedSetupEntry[];
  settings: AppSettings;
  psychologyChecklist: PsychologyChecklist;
  lockedPlan?: LockedTradePlan | null;
}): TradeFullSnapshot {
  return {
    version: TRADE_SNAPSHOT_VERSION,
    savedAt: Date.now(),
    tradeJournal: input.tradeJournal,
    aiTradeJournal: input.aiTradeJournal,
    dailyStats: input.dailyStats,
    accountHistory: input.accountHistory,
    skippedSetups: input.skippedSetups,
    settings: input.settings,
    psychologyChecklist: input.psychologyChecklist,
    lockedPlan: input.lockedPlan ?? null,
  };
}

function pickLonger<T>(a: T[] | undefined, b: T[] | undefined): T[] {
  const left = a ?? [];
  const right = b ?? [];
  return right.length > left.length ? right : left;
}

/** Ưu tiên bản có nhiều dữ liệu hơn (phục hồi khi một khoá bị ghi đè rỗng). */
export function mergeTradeSnapshots(
  ...sources: Array<TradeFullSnapshot | null | undefined>
): TradeFullSnapshot | null {
  const valid = sources.filter((s): s is TradeFullSnapshot => s != null);
  if (valid.length === 0) return null;

  return valid.reduce<TradeFullSnapshot>((acc, cur) => ({
    version: TRADE_SNAPSHOT_VERSION,
    savedAt: Math.max(acc.savedAt, cur.savedAt),
    tradeJournal: pickLonger(acc.tradeJournal, cur.tradeJournal),
    aiTradeJournal: pickLonger(acc.aiTradeJournal, cur.aiTradeJournal),
    dailyStats: pickLonger(acc.dailyStats, cur.dailyStats),
    accountHistory: pickLonger(acc.accountHistory, cur.accountHistory),
    skippedSetups: pickLonger(acc.skippedSetups, cur.skippedSetups),
    settings: cur.savedAt >= acc.savedAt ? cur.settings : acc.settings,
    psychologyChecklist:
      cur.savedAt >= acc.savedAt ? cur.psychologyChecklist : acc.psychologyChecklist,
    lockedPlan: cur.savedAt >= acc.savedAt ? cur.lockedPlan ?? null : acc.lockedPlan ?? null,
  }));
}

export async function loadTradeSnapshot(): Promise<TradeFullSnapshot | null> {
  return loadAllSnapshotSources();
}

/** Gộp mọi nguồn: localStorage, window.name, IndexedDB, file backup. */
export async function loadAllSnapshotSources(): Promise<TradeFullSnapshot | null> {
  if (isWebPlatform()) {
    await restoreBackupFileHandle();
  }

  const [primary, indexedDb, fileBackup] = await Promise.all([
    persistGetJson<unknown>(TRADE_SNAPSHOT_KEY),
    loadSnapshotFromIndexedDb(),
    readBackupFile(),
  ]);
  return mergeTradeSnapshots(
    migrateTradeSnapshot(primary),
    readWindowNameSnapshot(),
    migrateTradeSnapshot(indexedDb),
    migrateTradeSnapshot(fileBackup),
  );
}

export async function saveTradeSnapshot(
  snapshot: TradeFullSnapshot,
  options?: { skipBroadcast?: boolean },
): Promise<void> {
  await persistSetJson(TRADE_SNAPSHOT_KEY, snapshot);
  mirrorSnapshotToWindowName(snapshot);

  if (isWebPlatform()) {
    await Promise.all([
      saveSnapshotToIndexedDb(snapshot),
      writeBackupFile(snapshot),
    ]);
    if (!options?.skipBroadcast) {
      publishSnapshotUpdate(snapshot);
    }
  }
}

export function readWindowNameSnapshot(): TradeFullSnapshot | null {
  if (typeof window === 'undefined') return null;
  const raw = window.name;
  if (!raw.startsWith(WINDOW_NAME_PREFIX)) return null;
  try {
    const json = decodeURIComponent(
      escape(atob(raw.slice(WINDOW_NAME_PREFIX.length))),
    );
    return migrateTradeSnapshot(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

/** Sao lưu vào window.name — giữ khi đổi port trong cùng tab trình duyệt. */
export function mirrorSnapshotToWindowName(snapshot: TradeFullSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(snapshot);
    if (json.length > WINDOW_NAME_MAX_CHARS) return;
    const encoded = btoa(unescape(encodeURIComponent(json)));
    window.name = `${WINDOW_NAME_PREFIX}${encoded}`;
  } catch {
    // ignore quota / encoding errors
  }
}

export function defaultSettingsFromSnapshot(
  snapshot: TradeFullSnapshot | null,
  fallback: AppSettings,
): AppSettings {
  if (!snapshot?.settings) return fallback;
  return { ...DEFAULT_SETTINGS, ...snapshot.settings };
}

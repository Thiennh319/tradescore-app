import { downloadTextFile } from './exportService';
import { migrateTradeSnapshot } from './phase1Migration';
import {
  buildTradeSnapshot,
  type TradeFullSnapshot,
} from './tradeSnapshot';

export const DATA_BACKUP_SCHEMA = 'tradescore-full-backup-v1';

export interface DataBackupBundle extends TradeFullSnapshot {
  schema: typeof DATA_BACKUP_SCHEMA;
  exportedAt: string;
}

export function buildDataBackupBundle(snapshot: TradeFullSnapshot): DataBackupBundle {
  return {
    ...snapshot,
    schema: DATA_BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
  };
}

export function parseDataBackupJson(raw: string): TradeFullSnapshot | null {
  try {
    const data = JSON.parse(raw) as unknown;
    return migrateTradeSnapshot(data);
  } catch {
    return null;
  }
}

export function downloadFullBackup(snapshot: TradeFullSnapshot): void {
  const bundle = buildDataBackupBundle(snapshot);
  const date = new Date().toISOString().slice(0, 10);
  downloadTextFile(`TradeScore-backup-${date}.json`, JSON.stringify(bundle, null, 2));
}

/** Web: chọn file JSON và parse — dùng cho khôi phục thủ công. */
export function pickJsonFileAndRead(): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve(await file.text());
      } catch {
        resolve(null);
      }
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    input.click();
  });
}

export async function pickAndParseBackupFile(): Promise<TradeFullSnapshot | null> {
  const raw = await pickJsonFileAndRead();
  if (!raw) return null;
  return parseDataBackupJson(raw);
}

export function snapshotFromStoreState(state: {
  tradeJournal: TradeFullSnapshot['tradeJournal'];
  aiTradeJournal: TradeFullSnapshot['aiTradeJournal'];
  dailyStats: TradeFullSnapshot['dailyStats'];
  accountHistory: TradeFullSnapshot['accountHistory'];
  skippedSetups: TradeFullSnapshot['skippedSetups'];
  settings: TradeFullSnapshot['settings'];
  psychologyChecklist: TradeFullSnapshot['psychologyChecklist'];
  lockedPlan: TradeFullSnapshot['lockedPlan'];
}): TradeFullSnapshot {
  return buildTradeSnapshot({
    tradeJournal: state.tradeJournal,
    aiTradeJournal: state.aiTradeJournal,
    dailyStats: state.dailyStats,
    accountHistory: state.accountHistory,
    skippedSetups: state.skippedSetups,
    settings: state.settings,
    psychologyChecklist: state.psychologyChecklist,
    lockedPlan: state.lockedPlan ?? null,
  });
}

import { Platform } from 'react-native';
import { uploadFiles, downloadFile } from './githubSync';
import { persistSetJson, persistGetJson, persistRemoveItem } from './persistStorage';
import { getDriveSyncStoreBridge } from './driveSyncStoreBridge';
import {
  loadPersistedSignalBoard,
  savePersistedSignalBoard,
  type PersistedSignalBoard,
} from './signalBoardPersist';
import {
  SyncActionType,
  SyncResult,
  PullResult,
  SyncState,
  SyncStatus,
  DRIVE_FILE_NAMES,
  SYNC_ACTION_FILE_MAP,
  DriveFileName,
  DriveFileWrapper,
} from '../types/driveSync';

let syncState: SyncState = {
  status: 'idle',
  lastSyncTime: null,
  pendingSync: false,
};

let pendingSyncFiles: Set<DriveFileName> = new Set();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let batchRetryTimer: ReturnType<typeof setTimeout> | null = null;

let lastLocalUpdateTime: number = Date.now();

let stagedSignalBoard: PersistedSignalBoard | null = null;

type SignalBoardMirrorListener = (board: PersistedSignalBoard) => void;
let signalBoardMirrorListeners: SignalBoardMirrorListener[] = [];

/** APK: stage kết quả quét trước khi upload lên Gist. */
export function stageSignalBoardForSync(board: PersistedSignalBoard): void {
  stagedSignalBoard = board;
  lastLocalUpdateTime = Date.now();
}

export function onSignalBoardMirrorApplied(listener: SignalBoardMirrorListener): () => void {
  signalBoardMirrorListeners.push(listener);
  return () => {
    signalBoardMirrorListeners = signalBoardMirrorListeners.filter((fn) => fn !== listener);
  };
}

function notifySignalBoardMirrorApplied(board: PersistedSignalBoard): void {
  signalBoardMirrorListeners.forEach((fn) => fn(board));
}

type PullMirrorListener = (result: PullResult) => void;
let pullMirrorListeners: PullMirrorListener[] = [];

/** Web: lắng nghe sau khi pull mirror xong (journal/capital/signal board). */
export function onPullMirrorComplete(listener: PullMirrorListener): () => void {
  pullMirrorListeners.push(listener);
  return () => {
    pullMirrorListeners = pullMirrorListeners.filter((fn) => fn !== listener);
  };
}

function notifyPullMirrorComplete(result: PullResult): void {
  pullMirrorListeners.forEach((fn) => fn(result));
}

type SyncStateListener = (state: SyncState) => void;
let stateListeners: SyncStateListener[] = [];

function updateSyncState(updates: Partial<SyncState>): void {
  syncState = { ...syncState, ...updates };
  stateListeners.forEach((fn) => fn(syncState));
}

export function onSyncStateChange(listener: SyncStateListener): () => void {
  stateListeners.push(listener);
  return () => {
    stateListeners = stateListeners.filter((fn) => fn !== listener);
  };
}

export function getSyncState(): SyncState {
  return syncState;
}

async function getLocalData(fileName: DriveFileName): Promise<unknown> {
  try {
    const bridge = getDriveSyncStoreBridge();
    if (bridge) {
      switch (fileName) {
        case DRIVE_FILE_NAMES.journal:
          return bridge.getJournal();
        case DRIVE_FILE_NAMES.positions:
          return bridge.getPositions();
        case DRIVE_FILE_NAMES.capital:
          return bridge.getCapital();
        case DRIVE_FILE_NAMES.signalBoard:
          return stagedSignalBoard ?? (await loadPersistedSignalBoard());
        default:
          return null;
      }
    }

    switch (fileName) {
      case DRIVE_FILE_NAMES.journal:
        return localJournalSnapshot;
      case DRIVE_FILE_NAMES.positions:
        return [];
      case DRIVE_FILE_NAMES.capital:
        return {};
      case DRIVE_FILE_NAMES.signalBoard:
        return stagedSignalBoard ?? (await loadPersistedSignalBoard());
      default:
        return null;
    }
  } catch (err) {
    console.error('[DriveSync] getLocalData error:', fileName, err);
    return null;
  }
}

function resolveDeviceId(): 'APK' | 'WEB' {
  const bridge = getDriveSyncStoreBridge();
  if (bridge) return bridge.getDeviceId();
  return Platform.OS === 'web' ? 'WEB' : 'APK';
}

function pendingUploadKey(fileName: DriveFileName): string {
  return `@drivesync/pending/${fileName}`;
}

async function loadPendingFileNames(): Promise<DriveFileName[]> {
  const pending: DriveFileName[] = [];
  for (const fileName of Object.values(DRIVE_FILE_NAMES)) {
    const stored = await persistGetJson<DriveFileWrapper<unknown>>(pendingUploadKey(fileName));
    if (stored) pending.push(fileName);
  }
  return pending;
}

async function clearPendingUploads(fileNames: DriveFileName[]): Promise<void> {
  await Promise.all(fileNames.map((fileName) => persistRemoveItem(pendingUploadKey(fileName))));
}

async function persistFailedBatch(
  payloads: Record<string, DriveFileWrapper<unknown>>,
): Promise<void> {
  await Promise.all(
    Object.entries(payloads).map(([fileName, wrapper]) =>
      persistSetJson(pendingUploadKey(fileName as DriveFileName), wrapper),
    ),
  );
}

function scheduleBatchRetry(delayMs = 60_000): void {
  if (batchRetryTimer) return;

  batchRetryTimer = setTimeout(() => {
    batchRetryTimer = null;
    void (async () => {
      const pending = await loadPendingFileNames();
      if (pending.length === 0) return;
      console.log(`[DriveSync] 🔁 Retry pending batch (${pending.length} files)...`);
      await syncFilesBatch(pending);
    })();
  }, delayMs);
}

type FilePayloadResult =
  | { kind: 'ready'; fileName: DriveFileName; content: string; wrapper: DriveFileWrapper<unknown> }
  | { kind: 'skip'; fileName: DriveFileName }
  | { kind: 'missing'; fileName: DriveFileName };

async function buildFilePayload(fileName: DriveFileName): Promise<FilePayloadResult> {
  const data = await getLocalData(fileName);

  if (data === null) {
    if (fileName === DRIVE_FILE_NAMES.signalBoard) {
      console.log('[DriveSync] Signal board chưa quét — bỏ qua upload');
      return { kind: 'skip', fileName };
    }
    console.warn('[DriveSync] No data for:', fileName);
    return { kind: 'missing', fileName };
  }

  const wrapper: DriveFileWrapper<unknown> = {
    version: '1.0.2',
    lastUpdated: new Date().toISOString(),
    deviceId: resolveDeviceId(),
    data,
  };

  return {
    kind: 'ready',
    fileName,
    content: JSON.stringify(wrapper),
    wrapper,
  };
}

async function syncFilesBatch(fileNames: DriveFileName[]): Promise<{
  synced: DriveFileName[];
  failed: DriveFileName[];
}> {
  const uniqueNames = [...new Set(fileNames)];
  const synced: DriveFileName[] = [];
  const failed: DriveFileName[] = [];
  const batch: Record<string, string> = {};
  const wrappers: Record<string, DriveFileWrapper<unknown>> = {};

  for (const fileName of uniqueNames) {
    const built = await buildFilePayload(fileName);
    if (built.kind === 'skip') {
      synced.push(fileName);
      continue;
    }
    if (built.kind === 'missing') {
      failed.push(fileName);
      continue;
    }
    batch[built.fileName] = built.content;
    wrappers[built.fileName] = built.wrapper;
  }

  if (Object.keys(batch).length === 0) {
    return { synced, failed };
  }

  const result = await uploadFiles(batch);

  if (result.success) {
    const uploaded = Object.keys(batch) as DriveFileName[];
    synced.push(...uploaded);
    await clearPendingUploads(uploaded);
    uploaded.forEach((fileName) => {
      console.log(`[DriveSync] ✅ Synced: ${fileName}`);
    });
    return { synced, failed };
  }

  console.error('[DriveSync] ❌ Batch upload failed:', result.error, result.message);
  try {
    await persistFailedBatch(wrappers);
    console.log(`[DriveSync] Persisted pending batch (${Object.keys(wrappers).length} files)`);
    scheduleBatchRetry();
  } catch (e) {
    console.error('[DriveSync] Failed to persist pending batch:', e);
  }

  failed.push(...(Object.keys(batch) as DriveFileName[]));
  return { synced, failed };
}

function canUploadToDrive(): boolean {
  const bridge = getDriveSyncStoreBridge();
  if (bridge) {
    return bridge.getDeviceId() === 'APK';
  }
  return true;
}

function isWebMirrorPull(): boolean {
  const bridge = getDriveSyncStoreBridge();
  if (bridge) {
    return bridge.getDeviceId() === 'WEB';
  }
  return Platform.OS === 'web';
}

export async function syncOnAction(actionType: SyncActionType): Promise<void> {
  if (!canUploadToDrive()) {
    console.log('[DriveSync] Web read-only — skip upload (APK là master)');
    return;
  }

  lastLocalUpdateTime = Date.now();

  const filesToSync = SYNC_ACTION_FILE_MAP[actionType];
  filesToSync.forEach((fileName) => pendingSyncFiles.add(fileName));

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    const files = [...pendingSyncFiles];
    pendingSyncFiles.clear();

    if (files.length === 0) return;

    updateSyncState({
      status: 'syncing',
      pendingSync: true,
    });

    const { synced, failed } = await syncFilesBatch(files);
    const now = new Date().toISOString();
    const allSuccess = failed.length === 0;

    updateSyncState({
      status: allSuccess ? 'success' : 'error',
      lastSyncTime: allSuccess ? now : syncState.lastSyncTime,
      pendingSync: pendingSyncFiles.size > 0,
    });

    if (allSuccess) {
      console.log(`[DriveSync] Action batch synced: ${synced.join(', ')}`);
    } else {
      console.warn(
        `[DriveSync] Action batch partial fail: ok=${synced.join(', ') || 'none'}, fail=${failed.join(', ')}`,
      );
    }
  }, 30_000);

  console.log(
    `[DriveSync] 🕐 Scheduled batch sync in 30s: ${filesToSync.join(', ')} (action: ${actionType})`,
  );
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function checkHasNewData(): boolean {
  if (!syncState.lastSyncTime) return true;

  const lastSync = new Date(syncState.lastSyncTime).getTime();

  return lastLocalUpdateTime > lastSync;
}

export async function syncAll(): Promise<SyncResult> {
  if (!canUploadToDrive()) {
    console.log('[DriveSync] Web read-only — skip full upload (APK là master)');
    return {
      success: true,
      filessynced: [],
      filesFailed: [],
      timestamp: new Date().toISOString(),
    };
  }

  const pendingFromDisk = await loadPendingFileNames();
  const allFiles = [
    ...new Set([...Object.values(DRIVE_FILE_NAMES), ...pendingFromDisk]),
  ] as DriveFileName[];

  updateSyncState({
    status: 'syncing',
    pendingSync: true,
  });

  console.log('[DriveSync] 🔄 Starting full sync...');

  try {
    const { synced, failed } = await syncFilesBatch(allFiles);

    const now = new Date().toISOString();
    const allSuccess = failed.length === 0;

    updateSyncState({
      status: allSuccess ? 'success' : 'error',
      lastSyncTime: allSuccess ? now : syncState.lastSyncTime,
      pendingSync: pendingSyncFiles.size > 0 || debounceTimer != null,
    });

    console.log(
      `[DriveSync] Full sync done: ✅ ${synced.length} / ❌ ${failed.length}`,
    );

    return {
      success: allSuccess,
      filessynced: synced,
      filesFailed: failed,
      timestamp: now,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[DriveSync] syncAll error:', err);

    updateSyncState({
      status: 'error',
      pendingSync: false,
    });

    return {
      success: false,
      filessynced: [],
      filesFailed: allFiles,
      timestamp: new Date().toISOString(),
      error: message,
    };
  }
}

export function schedule12hSync(): void {
  if (!canUploadToDrive()) {
    console.log('[DriveSync] Web dùng pull định kỳ từ APK — bỏ qua scheduler upload 12h');
    return;
  }

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  const TWELVE_HOURS = 12 * 60 * 60 * 1000;

  schedulerInterval = setInterval(async () => {
    console.log('[DriveSync] ⏰ 12h scheduler triggered');

    const hasNew = checkHasNewData();

    if (hasNew) {
      console.log('[DriveSync] Data mới tìm thấy — bắt đầu sync');
      await syncAll();
    } else {
      console.log('[DriveSync] Không có data mới — bỏ qua');
    }
  }, TWELVE_HOURS);

  console.log('[DriveSync] ✅ 12h scheduler started');
}

export function stopScheduler(): void {
  stopWebPullFromApk();
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[DriveSync] 🛑 Scheduler stopped');
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (batchRetryTimer) {
    clearTimeout(batchRetryTimer);
    batchRetryTimer = null;
  }
  pendingSyncFiles.clear();
}

export const WEB_PULL_INTERVAL_MS = 60_000;

let webPullInterval: ReturnType<typeof setInterval> | null = null;

/** Web: pull từ Gist định kỳ để mirror APK (master). */
export function scheduleWebPullFromApk(): void {
  if (!isWebMirrorPull()) return;

  if (webPullInterval) {
    clearInterval(webPullInterval);
  }

  webPullInterval = setInterval(() => {
    console.log('[DriveSync] 🔄 Web periodic pull (APK master)...');
    void pullFromDrive();
  }, WEB_PULL_INTERVAL_MS);

  console.log(`[DriveSync] ✅ Web pull scheduler started (${WEB_PULL_INTERVAL_MS / 1000}s)`);
}

export function stopWebPullFromApk(): void {
  if (webPullInterval) {
    clearInterval(webPullInterval);
    webPullInterval = null;
    console.log('[DriveSync] 🛑 Web pull scheduler stopped');
  }
}

function mergeJournalEntries(
  local: unknown[],
  remote: unknown[],
): { merged: unknown[]; count: number } {
  const localMap = new Map(
    local.map((entry) => [(entry as { id: string }).id, entry]),
  );

  let mergedCount = 0;

  remote.forEach((remoteEntry) => {
    const id = (remoteEntry as { id: string }).id;
    const localEntry = localMap.get(id);

    if (!localEntry) {
      localMap.set(id, remoteEntry);
      mergedCount++;
    }
  });

  return {
    merged: Array.from(localMap.values()),
    count: mergedCount,
  };
}

let localJournalSnapshot: unknown[] = [];

async function applyToLocalStore(
  fileName: DriveFileName,
  data: unknown,
  meta?: import('./driveSyncStoreBridge').DriveSyncMeta,
): Promise<number> {
  try {
    const bridge = getDriveSyncStoreBridge();

    switch (fileName) {
      case DRIVE_FILE_NAMES.journal: {
        if (isWebMirrorPull() && bridge) {
          const count = await bridge.applyJournalMirrorFromApk(data as unknown[], meta);
          if (count > 0) {
            console.log(`[DriveSync] Journal mirror APK: ${count} thay đổi`);
          }
          return count;
        }

        const localEntries = bridge
          ? (bridge.getJournal() as unknown[])
          : (((await getLocalData(DRIVE_FILE_NAMES.journal)) ?? []) as unknown[]);

        const { merged, count } = mergeJournalEntries(localEntries, data as unknown[]);

        if (count > 0) {
          localJournalSnapshot = merged;
          console.log(`[DriveSync] Journal: merged ${count} new entries`);
        }
        return count;
      }

      case DRIVE_FILE_NAMES.positions: {
        if (isWebMirrorPull() && bridge) {
          const count = await bridge.applyPositionsMirrorFromApk(data, meta);
          if (count > 0) {
            console.log(`[DriveSync] Positions mirror APK: ${count} thay đổi`);
          }
          return count;
        }
        console.log('[DriveSync] Positions: synced from Gist (APK only)');
        return 0;
      }

      case DRIVE_FILE_NAMES.capital: {
        if (isWebMirrorPull() && bridge) {
          const updated = await bridge.applyCapitalMirrorFromApk(data, meta);
          if (updated) {
            console.log('[DriveSync] Capital mirror APK: updated');
            return 1;
          }
          return 0;
        }
        console.log('[DriveSync] Capital: checked from Gist');
        return 0;
      }

      case DRIVE_FILE_NAMES.signalBoard: {
        if (!isWebMirrorPull()) {
          console.log('[DriveSync] Signal board: APK-only upload');
          return 0;
        }
        const remoteBoard = data as PersistedSignalBoard;
        if (!remoteBoard?.rows?.length || !remoteBoard.scannedAt) {
          return 0;
        }
        if (meta?.deviceId && meta.deviceId !== 'APK') {
          return 0;
        }
        const localBoard = await loadPersistedSignalBoard();
        if (localBoard && localBoard.scannedAt >= remoteBoard.scannedAt) {
          return 0;
        }
        await savePersistedSignalBoard(
          remoteBoard.timeframe,
          remoteBoard.rows,
          remoteBoard.scannedAt,
        );
        notifySignalBoardMirrorApplied(remoteBoard);
        console.log(
          `[DriveSync] Signal board mirror APK: ${remoteBoard.rows.length} rows @ ${remoteBoard.scannedAt}`,
        );
        return 1;
      }

      default:
        return 0;
    }
  } catch (err) {
    console.error('[DriveSync] applyToLocalStore error:', fileName, err);
    return 0;
  }
}

export async function pullFromDrive(): Promise<PullResult> {
  console.log('[DriveSync] 📥 Pulling from GitHub Gist...');

  updateSyncState({ status: 'syncing' });

  const result: PullResult = {
    success: false,
    journalMerged: 0,
    positionsMerged: 0,
    capitalUpdated: false,
    signalBoardUpdated: false,
    timestamp: new Date().toISOString(),
  };

  type PullFileOutcome = 'parsed' | 'not_found' | 'network_fail' | 'parse_failed';
  const fileOutcomes: PullFileOutcome[] = [];

  const isNotFound = (downloadResult: { success: boolean; error?: string }): boolean =>
    !downloadResult.success && downloadResult.error === 'NOT_FOUND';

  const isNetworkFailure = (downloadResult: {
    success: boolean;
    error?: string;
  }): boolean => !downloadResult.success && !isNotFound(downloadResult);

  try {
    const [journalResult, positionsResult, capitalResult, signalBoardResult] = await Promise.all([
      downloadFile(DRIVE_FILE_NAMES.journal),
      downloadFile(DRIVE_FILE_NAMES.positions),
      downloadFile(DRIVE_FILE_NAMES.capital),
      downloadFile(DRIVE_FILE_NAMES.signalBoard),
    ]);

    const downloadResults = [journalResult, positionsResult, capitalResult, signalBoardResult];

    if (journalResult.success && journalResult.data) {
      try {
        const wrapper: DriveFileWrapper<unknown[]> = JSON.parse(journalResult.data);

        const count = await applyToLocalStore(DRIVE_FILE_NAMES.journal, wrapper.data, {
          lastUpdated: wrapper.lastUpdated,
          deviceId: wrapper.deviceId,
        });
        result.journalMerged = count;
        fileOutcomes.push('parsed');
      } catch (parseErr) {
        console.error('[DriveSync] Journal parse error:', parseErr);
        fileOutcomes.push('parse_failed');
      }
    } else if (isNotFound(journalResult)) {
      fileOutcomes.push('not_found');
    } else if (isNetworkFailure(journalResult)) {
      fileOutcomes.push('network_fail');
    }

    if (positionsResult.success && positionsResult.data) {
      try {
        const wrapper: DriveFileWrapper<unknown[]> = JSON.parse(positionsResult.data);

        const count = await applyToLocalStore(DRIVE_FILE_NAMES.positions, wrapper.data, {
          lastUpdated: wrapper.lastUpdated,
          deviceId: wrapper.deviceId,
        });
        result.positionsMerged = count;
        fileOutcomes.push('parsed');
      } catch (parseErr) {
        console.error('[DriveSync] Positions parse error:', parseErr);
        fileOutcomes.push('parse_failed');
      }
    } else if (isNotFound(positionsResult)) {
      fileOutcomes.push('not_found');
    } else if (isNetworkFailure(positionsResult)) {
      fileOutcomes.push('network_fail');
    }

    if (capitalResult.success && capitalResult.data) {
      try {
        const wrapper: DriveFileWrapper<unknown> = JSON.parse(capitalResult.data);

        const count = await applyToLocalStore(DRIVE_FILE_NAMES.capital, wrapper.data, {
          lastUpdated: wrapper.lastUpdated,
          deviceId: wrapper.deviceId,
        });
        result.capitalUpdated = count > 0;
        fileOutcomes.push('parsed');
      } catch (parseErr) {
        console.error('[DriveSync] Capital parse error:', parseErr);
        fileOutcomes.push('parse_failed');
      }
    } else if (isNotFound(capitalResult)) {
      fileOutcomes.push('not_found');
    } else if (isNetworkFailure(capitalResult)) {
      fileOutcomes.push('network_fail');
    }

    if (signalBoardResult.success && signalBoardResult.data) {
      try {
        const wrapper: DriveFileWrapper<PersistedSignalBoard> = JSON.parse(signalBoardResult.data);
        const count = await applyToLocalStore(DRIVE_FILE_NAMES.signalBoard, wrapper.data, {
          lastUpdated: wrapper.lastUpdated,
          deviceId: wrapper.deviceId,
        });
        result.signalBoardUpdated = count > 0;
        if (count > 0) {
          fileOutcomes.push('parsed');
        } else {
          fileOutcomes.push('not_found');
        }
      } catch (parseErr) {
        console.error('[DriveSync] Signal board parse error:', parseErr);
        fileOutcomes.push('parse_failed');
      }
    } else if (isNotFound(signalBoardResult)) {
      fileOutcomes.push('not_found');
    } else if (isNetworkFailure(signalBoardResult)) {
      fileOutcomes.push('network_fail');
    }

    const allNotFound =
      downloadResults.length > 0 && downloadResults.every(isNotFound);
    const anyParsed = fileOutcomes.includes('parsed');
    const allNetworkFail =
      downloadResults.length > 0 && downloadResults.every(isNetworkFailure);
    const onlyNotFoundOrParseFailed =
      fileOutcomes.length > 0 &&
      fileOutcomes.every((o) => o === 'not_found' || o === 'parse_failed');

    if (allNotFound || anyParsed || onlyNotFoundOrParseFailed) {
      result.success = true;

      updateSyncState({
        status: 'success',
        lastSyncTime: result.timestamp,
      });
    } else if (allNetworkFail) {
      result.success = false;
      result.error = 'Network unavailable';

      updateSyncState({ status: 'offline' });
    } else {
      result.success = false;
      result.error = 'Pull incomplete';

      updateSyncState({ status: 'error' });
    }

    console.log(
      `[DriveSync] Pull done: journal +${result.journalMerged}, positions +${result.positionsMerged}, capital ${result.capitalUpdated ? 'updated' : 'unchanged'}, signalBoard ${result.signalBoardUpdated ? 'updated' : 'unchanged'}`,
    );

    notifyPullMirrorComplete(result);

    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[DriveSync] pullFromDrive error:', err);

    updateSyncState({ status: 'offline' });

    return {
      ...result,
      success: false,
      error: message,
    };
  }
}

/** @internal seed local journal for pull/merge tests */
export function seedLocalJournalForTest(entries: unknown[]): void {
  localJournalSnapshot = entries;
}

/** Alias — sync qua GitHub Gist (không còn Google Drive). */
export const pullFromGist = pullFromDrive;

/** Web: chỉ kéo signal board từ Gist — không ghi đè journal/lệnh chờ. */
export async function pullSignalBoardMirrorFromApk(): Promise<boolean> {
  if (!isWebMirrorPull()) return false;

  const signalBoardResult = await downloadFile(DRIVE_FILE_NAMES.signalBoard);
  if (!signalBoardResult.success || !signalBoardResult.data) return false;

  try {
    const wrapper: DriveFileWrapper<PersistedSignalBoard> = JSON.parse(signalBoardResult.data);
    const count = await applyToLocalStore(DRIVE_FILE_NAMES.signalBoard, wrapper.data, {
      lastUpdated: wrapper.lastUpdated,
      deviceId: wrapper.deviceId,
    });
    return count > 0;
  } catch (err) {
    console.error('[DriveSync] pullSignalBoardMirrorFromApk error:', err);
    return false;
  }
}

import { Platform } from 'react-native';
import { uploadFile, downloadFile } from './googleDriveService';
import { getDriveSyncStoreBridge } from './driveSyncStoreBridge';
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

let debounceTimers: Map<DriveFileName, ReturnType<typeof setTimeout>> = new Map();

let lastLocalUpdateTime: number = Date.now();

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

async function syncFile(fileName: DriveFileName): Promise<boolean> {
  try {
    const data = await getLocalData(fileName);

    if (data === null) {
      console.warn('[DriveSync] No data for:', fileName);
      return false;
    }

    const wrapper: DriveFileWrapper<unknown> = {
      version: '1.0.2',
      lastUpdated: new Date().toISOString(),
      deviceId: resolveDeviceId(),
      data,
    };

    const result = await uploadFile(fileName, JSON.stringify(wrapper));

    if (result.success) {
      console.log(`[DriveSync] ✅ Synced: ${fileName}`);
      return true;
    }

    console.error(`[DriveSync] ❌ Failed: ${fileName}`, result.error);
    return false;
  } catch (err) {
    console.error('[DriveSync] syncFile error:', fileName, err);
    return false;
  }
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

  filesToSync.forEach((fileName) => {
    const existingTimer = debounceTimers.get(fileName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      debounceTimers.delete(fileName);

      updateSyncState({
        status: 'syncing',
        pendingSync: true,
      });

      const success = await syncFile(fileName);

      if (success) {
        const now = new Date().toISOString();
        updateSyncState({
          status: 'success',
          lastSyncTime: now,
          pendingSync: debounceTimers.size > 0,
        });

        try {
          // React Native:
          // await AsyncStorage.setItem('lastSyncTime', now)
          // Web:
          // localStorage.setItem('lastSyncTime', now)
        } catch {
          // ignore persist errors
        }
      } else {
        updateSyncState({
          status: 'error',
          pendingSync: debounceTimers.size > 0,
        });
      }
    }, 30 * 1000);

    debounceTimers.set(fileName, timer);

    console.log(
      `[DriveSync] 🕐 Scheduled sync in 30s: ${fileName} (action: ${actionType})`,
    );
  });
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

  const allFiles = Object.values(DRIVE_FILE_NAMES);
  const filesSynced: DriveFileName[] = [];
  const filesFailed: DriveFileName[] = [];

  updateSyncState({
    status: 'syncing',
    pendingSync: true,
  });

  console.log('[DriveSync] 🔄 Starting full sync...');

  try {
    const results = await Promise.all(
      allFiles.map(async (fileName) => {
        const success = await syncFile(fileName);
        return { fileName, success };
      }),
    );

    results.forEach(({ fileName, success }) => {
      if (success) {
        filesSynced.push(fileName as DriveFileName);
      } else {
        filesFailed.push(fileName as DriveFileName);
      }
    });

    const now = new Date().toISOString();
    const allSuccess = filesFailed.length === 0;

    updateSyncState({
      status: allSuccess ? 'success' : 'error',
      lastSyncTime: allSuccess ? now : syncState.lastSyncTime,
      pendingSync: false,
    });

    if (allSuccess) {
      try {
        // React Native:
        // await AsyncStorage.setItem('lastSyncTime', now)
        // Web:
        // localStorage.setItem('lastSyncTime', now)
      } catch {
        // ignore persist errors
      }
    }

    console.log(
      `[DriveSync] Full sync done: ✅ ${filesSynced.length} / ❌ ${filesFailed.length}`,
    );

    return {
      success: allSuccess,
      filessynced: filesSynced,
      filesFailed,
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
      filessynced: filesSynced,
      filesFailed: allFiles as DriveFileName[],
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
}

export const WEB_PULL_INTERVAL_MS = 60_000;

let webPullInterval: ReturnType<typeof setInterval> | null = null;

/** Web: pull từ Drive định kỳ để mirror APK (master). */
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
        console.log('[DriveSync] Positions: synced from Drive (APK only)');
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
        console.log('[DriveSync] Capital: checked from Drive');
        return 0;
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
  console.log('[DriveSync] 📥 Pulling from Drive...');

  updateSyncState({ status: 'syncing' });

  const result: PullResult = {
    success: false,
    journalMerged: 0,
    positionsMerged: 0,
    capitalUpdated: false,
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
    const [journalResult, positionsResult, capitalResult] = await Promise.all([
      downloadFile(DRIVE_FILE_NAMES.journal),
      downloadFile(DRIVE_FILE_NAMES.positions),
      downloadFile(DRIVE_FILE_NAMES.capital),
    ]);

    const downloadResults = [journalResult, positionsResult, capitalResult];

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
      `[DriveSync] Pull done: journal +${result.journalMerged}, positions +${result.positionsMerged}, capital ${result.capitalUpdated ? 'updated' : 'unchanged'}`,
    );

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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../githubSync', () => ({
  uploadFile: vi.fn(),
  uploadFiles: vi.fn(),
  downloadFile: vi.fn(),
}));

import { uploadFiles, downloadFile } from '../githubSync';
import { clearDriveSyncStoreBridge } from '../driveSyncStoreBridge';

beforeEach(async () => {
  clearDriveSyncStoreBridge();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.resetModules();
  // Default: Gist file missing → empty-push guard allows empty upload (new user).
  // Individual tests may override (e.g. pullFromDrive sequences).
  vi.mocked(downloadFile).mockResolvedValue({
    success: false,
    error: 'NOT_FOUND',
  });
});

afterEach(async () => {
  try {
    const mod = await import('../driveSyncService');
    mod.stopScheduler();
  } catch {
    // module may be reset
  }
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

async function loadDriveSyncService() {
  return import('../driveSyncService');
}

describe('driveSyncService', () => {
  it('debounce: 3 action liên tiếp chỉ sync 1 lần', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: true,
      data: 'gist-id',
    });

    const { syncOnAction } = await loadDriveSyncService();

    syncOnAction('JOURNAL_ENTRY_ADDED');
    syncOnAction('JOURNAL_ENTRY_ADDED');
    syncOnAction('JOURNAL_ENTRY_ADDED');

    await vi.advanceTimersByTimeAsync(30 * 1000);
    await Promise.resolve();

    expect(uploadFiles).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('ORDER_PLACED sync cả positions và journal trong 1 batch', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: true,
      data: 'gist-id',
    });

    const { syncOnAction } = await loadDriveSyncService();

    syncOnAction('ORDER_PLACED');

    await vi.advanceTimersByTimeAsync(30000);

    expect(uploadFiles).toHaveBeenCalledTimes(1);
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0] ?? {};
    expect(Object.keys(batch)).toContain('tradescore_positions.json');
    expect(Object.keys(batch)).toContain('tradescore_journal.json');
  });

  it('syncState chuyển sang success sau khi sync', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: true,
      data: 'gist-id',
    });

    const { syncOnAction, getSyncState } = await loadDriveSyncService();

    syncOnAction('CAPITAL_UPDATED');

    expect(getSyncState().status).toBe('idle');

    await vi.advanceTimersByTimeAsync(30000);

    expect(getSyncState().status).toBe('success');
    expect(getSyncState().lastSyncTime).not.toBeNull();
  });

  it('syncState chuyển error khi upload thất bại', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: false,
      error: 'NETWORK_ERROR',
    });

    const { syncOnAction, getSyncState } = await loadDriveSyncService();

    syncOnAction('CAPITAL_UPDATED');

    await vi.advanceTimersByTimeAsync(30000);

    expect(getSyncState().status).toBe('error');
  });

  it('syncAll upload đúng 4 file (signal board skip khi chưa quét)', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: true,
      data: 'gist-id',
    });
    // New user / empty Gist — empty-push guard must allow empty upload
    vi.mocked(downloadFile).mockResolvedValue({
      success: false,
      error: 'NOT_FOUND',
    });

    const { syncAll } = await loadDriveSyncService();
    const result = await syncAll();

    expect(result.success).toBe(true);
    expect(result.filessynced).toHaveLength(5);
    expect(result.filesFailed).toHaveLength(0);
    expect(uploadFiles).toHaveBeenCalledTimes(1);
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0] ?? {};
    expect(Object.keys(batch)).toHaveLength(4);
    expect(Object.keys(batch)).toContain('tradescore_v41_sessions.json');
  });

  it('schedule12hSync skip khi không có data mới', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: true,
      data: 'gist-id',
    });

    const { syncAll, schedule12hSync, stopScheduler } = await loadDriveSyncService();

    await syncAll();
    vi.mocked(uploadFiles).mockClear();

    schedule12hSync();

    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);

    expect(uploadFiles).toHaveBeenCalledTimes(0);

    stopScheduler();
  });

  it('schedule12hSync sync khi có data mới', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: true,
      data: 'gist-id',
    });

    const { syncAll, syncOnAction, schedule12hSync, stopScheduler } =
      await loadDriveSyncService();

    await syncAll();
    vi.mocked(uploadFiles).mockClear();

    syncOnAction('JOURNAL_ENTRY_ADDED');

    schedule12hSync();

    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);

    expect(uploadFiles).toHaveBeenCalled();

    stopScheduler();
  });

  it('syncAll báo lỗi khi batch upload fail', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({
      success: false,
      error: 'UPLOAD_FAILED',
    });

    const { syncAll } = await loadDriveSyncService();
    const result = await syncAll();

    expect(result.success).toBe(false);
    expect(result.filesFailed.length).toBeGreaterThan(0);
    expect(uploadFiles).toHaveBeenCalledTimes(1);
  });

  it('pullFromDrive merge journal từ Drive', async () => {
    const driveJournal = {
      version: '1.0.2',
      lastUpdated: new Date().toISOString(),
      deviceId: 'APK',
      data: [
        { id: 'entry_1', pnl: 1.5 },
        { id: 'entry_2', pnl: -0.5 },
        { id: 'entry_3', pnl: 2.0 },
        { id: 'entry_4', pnl: 0.8 },
        { id: 'entry_5', pnl: -1.0 },
      ],
    };

    vi.mocked(downloadFile)
      .mockResolvedValueOnce({
        success: true,
        data: JSON.stringify(driveJournal),
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      });

    const { pullFromDrive } = await loadDriveSyncService();
    const result = await pullFromDrive();

    expect(result.success).toBe(true);
    expect(result.journalMerged).toBe(5);
  });

  it('APK version thắng khi conflict', async () => {
    const driveData = {
      version: '1.0.2',
      lastUpdated: new Date().toISOString(),
      deviceId: 'WEB',
      data: [
        { id: 'entry_1', pnl: 1.0 },
        { id: 'entry_2', pnl: 0.5 },
      ],
    };

    vi.mocked(downloadFile)
      .mockResolvedValueOnce({
        success: true,
        data: JSON.stringify(driveData),
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      });

    const { pullFromDrive, seedLocalJournalForTest } = await loadDriveSyncService();
    seedLocalJournalForTest([{ id: 'entry_1', pnl: 2.0 }]);

    const result = await pullFromDrive();

    expect(result.success).toBe(true);
    expect(result.journalMerged).toBe(1);
  });

  it('pullFromDrive không crash khi offline', async () => {
    vi.mocked(downloadFile)
      .mockResolvedValueOnce({
        success: false,
        error: 'NETWORK_ERROR',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NETWORK_ERROR',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NETWORK_ERROR',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NETWORK_ERROR',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NETWORK_ERROR',
      });

    const { pullFromDrive, getSyncState } = await loadDriveSyncService();
    const result = await pullFromDrive();

    expect(result.success).toBe(false);
    expect(getSyncState().status).toBe('offline');
    expect(result.journalMerged).toBe(0);
  });

  it('pullFromDrive xử lý JSON parse error', async () => {
    vi.mocked(downloadFile)
      .mockResolvedValueOnce({
        success: true,
        data: 'INVALID_JSON{{{{',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'NOT_FOUND',
      });

    const { pullFromDrive, getSyncState } = await loadDriveSyncService();
    const result = await pullFromDrive();

    expect(result.success).toBe(true);
    expect(getSyncState().status).toBe('success');
    expect(result.journalMerged).toBe(0);
  });
});

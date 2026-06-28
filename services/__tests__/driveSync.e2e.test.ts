import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearDriveSyncStoreBridge } from '../driveSyncStoreBridge';

const mockFetch = vi.fn();
global.fetch = mockFetch;

let syncOnAction: typeof import('../driveSyncService').syncOnAction;
let syncAll: typeof import('../driveSyncService').syncAll;
let pullFromDrive: typeof import('../driveSyncService').pullFromDrive;
let getSyncState: typeof import('../driveSyncService').getSyncState;
let schedule12hSync: typeof import('../driveSyncService').schedule12hSync;
let stopScheduler: typeof import('../driveSyncService').stopScheduler;
let seedLocalJournalForTest: typeof import('../driveSyncService').seedLocalJournalForTest;

async function loadDriveSyncService() {
  return import('../driveSyncService');
}

export function mockAuthToken() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      access_token: 'test_token_e2e',
      expires_in: 3600,
    }),
  });
}

export function mockFileNotFound() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ files: [] }),
  });
}

export function mockUploadSuccess(fileId: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id: fileId }),
  });
}

export function mockDownloadSuccess(content: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    text: async () => content,
  });
}

export function mockFileFound(fileId: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      files: [{ id: fileId }],
    }),
  });
}

export function makeWrapper<T>(data: T, deviceId: 'APK' | 'WEB' = 'APK') {
  return {
    version: '1.0.2',
    lastUpdated: new Date().toISOString(),
    deviceId,
    data,
  };
}

type PullJournalMock =
  | { kind: 'found'; content: string }
  | { kind: 'invalid_json' }
  | { kind: 'not_found' };

function installPullFetchMock(options: {
  journal?: PullJournalMock;
  networkDown?: boolean;
}) {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        json: async () => ({
          access_token: 'test_token_e2e',
          expires_in: 3600,
        }),
      };
    }

    if (options.networkDown) {
      if (url.includes('/files?')) {
        const fileId = url.includes('tradescore_journal.json')
          ? 'journal_id'
          : url.includes('tradescore_positions.json')
            ? 'positions_id'
            : 'capital_id';

        return {
          ok: true,
          json: async () => ({ files: [{ id: fileId }] }),
        };
      }

      if (url.includes('alt=media')) {
        throw new Error('Network unavailable');
      }

      throw new Error('Network unavailable');
    }

    if (url.includes('/files?')) {
      if (
        url.includes('tradescore_journal.json') &&
        (options.journal?.kind === 'found' || options.journal?.kind === 'invalid_json')
      ) {
        return {
          ok: true,
          json: async () => ({ files: [{ id: 'journal_id' }] }),
        };
      }

      return {
        ok: true,
        json: async () => ({ files: [] }),
      };
    }

    if (url.includes('alt=media') && url.includes('journal_id')) {
      if (options.journal?.kind === 'found') {
        return {
          ok: true,
          text: async () => options.journal.content,
        };
      }

      if (options.journal?.kind === 'invalid_json') {
        return {
          ok: true,
          text: async () => 'INVALID_JSON{{{',
        };
      }
    }

    throw new Error(`Unexpected fetch in pull mock: ${url}`);
  });
}

beforeEach(async () => {
  clearDriveSyncStoreBridge();
  mockFetch.mockReset();
  vi.useFakeTimers();
  vi.resetModules();
  global.fetch = mockFetch;

  const mod = await loadDriveSyncService();
  syncOnAction = mod.syncOnAction;
  syncAll = mod.syncAll;
  pullFromDrive = mod.pullFromDrive;
  getSyncState = mod.getSyncState;
  schedule12hSync = mod.schedule12hSync;
  stopScheduler = mod.stopScheduler;
  seedLocalJournalForTest = mod.seedLocalJournalForTest;
});

afterEach(async () => {
  vi.useRealTimers();
  try {
    const mod = await loadDriveSyncService();
    mod.stopScheduler();
  } catch {
    // module may be reset
  }
});

describe('E2E 1: APK → Drive', () => {
  it('APK đặt lệnh → syncOnAction → upload Drive', async () => {
    // Mock positions upload
    mockAuthToken();
    mockFileNotFound();
    mockUploadSuccess('positions_id');

    // Mock journal upload
    mockAuthToken();
    mockFileNotFound();
    mockUploadSuccess('journal_id');

    // APK đặt lệnh
    syncOnAction('ORDER_PLACED');

    // Advance 30s debounce
    await vi.advanceTimersByTimeAsync(30000);

    // Assert sync thành công
    expect(getSyncState().status).toBe('success');
    expect(getSyncState().lastSyncTime).not.toBeNull();
  });

  it('CAPITAL_UPDATED chỉ sync 1 file capital', async () => {
    mockAuthToken();
    mockFileNotFound();
    mockUploadSuccess('capital_id');

    syncOnAction('CAPITAL_UPDATED');

    await vi.advanceTimersByTimeAsync(30000);

    // Chỉ upload 1 file (capital)
    // Auth + findFile + upload = 3 calls
    const uploadCalls = mockFetch.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('upload'),
    );
    expect(uploadCalls).toHaveLength(1);
    expect(getSyncState().status).toBe('success');
  });

  it('Nhiều action liên tiếp chỉ sync 1 lần', async () => {
    // Chỉ cần mock 1 lần vì debounce
    mockAuthToken();
    mockFileNotFound();
    mockUploadSuccess('journal_id');

    // 3 action liên tiếp trong 10s
    syncOnAction('JOURNAL_ENTRY_ADDED');
    await vi.advanceTimersByTimeAsync(5000);
    syncOnAction('JOURNAL_ENTRY_ADDED');
    await vi.advanceTimersByTimeAsync(5000);
    syncOnAction('JOURNAL_ENTRY_ADDED');

    // Advance thêm 30s để trigger sync
    await vi.advanceTimersByTimeAsync(30000);

    // Upload chỉ được gọi 1 lần
    const uploadCalls = mockFetch.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('upload'),
    );
    expect(uploadCalls).toHaveLength(1);
  });

  it('Upload fail → syncState = error', async () => {
    mockAuthToken();
    mockFileNotFound();
    // Mock upload thất bại
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server error',
    });

    syncOnAction('CAPITAL_UPDATED');

    await vi.advanceTimersByTimeAsync(30000);

    expect(getSyncState().status).toBe('error');
  });
});

describe('E2E 2: Drive → Web app', () => {
  it('Web app pull → merge journal từ Drive', async () => {
    const journalData = makeWrapper([
      { id: 'trade_001', pnl: 1.5, outcome: 'WIN' },
      { id: 'trade_002', pnl: -0.8, outcome: 'LOSS' },
      { id: 'trade_003', pnl: 2.0, outcome: 'WIN' },
    ]);

    installPullFetchMock({
      journal: { kind: 'found', content: JSON.stringify(journalData) },
    });

    const result = await pullFromDrive();

    expect(result.success).toBe(true);
    expect(result.journalMerged).toBe(3);
    expect(getSyncState().status).toBe('success');
  });

  it('Web app pull → tất cả NOT_FOUND → success (lần đầu chạy)', async () => {
    installPullFetchMock({
      journal: { kind: 'not_found' },
    });

    const result = await pullFromDrive();

    // NOT_FOUND không phải lỗi
    // → success = true, không có gì để merge
    expect(result.success).toBe(true);
    expect(result.journalMerged).toBe(0);
    expect(result.positionsMerged).toBe(0);
    expect(result.capitalUpdated).toBe(false);
    // Status không phải offline
    expect(getSyncState().status).toBe('success');
  });

  it('Web app pull → JSON lỗi → không crash', async () => {
    installPullFetchMock({
      journal: { kind: 'invalid_json' },
    });

    // Không crash dù JSON lỗi
    const result = await pullFromDrive();

    expect(result.success).toBe(true);
    expect(result.journalMerged).toBe(0);
  });

  it('Web app pull → network down → offline', async () => {
    installPullFetchMock({ networkDown: true });

    const result = await pullFromDrive();

    expect(result.success).toBe(false);
    expect(getSyncState().status).toBe('offline');
    // Không crash
    expect(result.journalMerged).toBe(0);
  });

  it('APK version thắng khi conflict', async () => {
    // Drive có entry_1 từ WEB
    // Local (APK) có entry_1 từ APK
    // → giữ APK version

    const driveData = makeWrapper(
      [
        { id: 'entry_1', pnl: 1.0 }, // conflict
        { id: 'entry_2', pnl: 0.5 }, // mới
      ],
      'WEB', // deviceId = WEB
    );

    seedLocalJournalForTest([{ id: 'entry_1', pnl: 2.0 }]);

    installPullFetchMock({
      journal: { kind: 'found', content: JSON.stringify(driveData) },
    });

    const result = await pullFromDrive();

    expect(result.success).toBe(true);
    // Chỉ entry_2 được merge
    // entry_1 đã có local → không override
    expect(result.journalMerged).toBe(1);
  });
});

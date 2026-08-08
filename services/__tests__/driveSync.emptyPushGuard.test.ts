/**
 * Task V3V4-SYNC-3b — Empty-push guard (post smoke confirmation).
 * Mock Gist only — không đụng production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../githubSync', () => ({
  uploadFile: vi.fn(),
  uploadFiles: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('../persistStorage', () => ({
  persistGetJson: vi.fn(async () => null),
  persistSetJson: vi.fn(async () => undefined),
  persistRemoveItem: vi.fn(async () => undefined),
}));

vi.mock('../signalBoardPersist', () => ({
  loadPersistedSignalBoard: vi.fn(async () => null),
  savePersistedSignalBoard: vi.fn(async () => undefined),
}));

import { uploadFiles, downloadFile } from '../githubSync';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  const { clearDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
  clearDriveSyncStoreBridge();
});

afterEach(async () => {
  try {
    const mod = await import('../driveSyncService');
    mod.stopScheduler();
  } catch {
    // ignore
  }
});

function wrap(data: unknown) {
  return JSON.stringify({
    version: '1.0.2',
    lastUpdated: '2026-08-07T09:00:00.000Z',
    deviceId: 'APK',
    data,
  });
}

describe('V3V4-SYNC-3b empty-push guard', () => {
  it('local empty + Gist has N journal → NO push, restore N into local', async () => {
    const remoteJournal = [
      { id: 'aj_1', symbol: 'NEARUSDT' },
      { id: 'aj_2', symbol: 'BTCUSDT' },
      { id: 'aj_3', symbol: 'ETHUSDT' },
    ];
    let localJournal: unknown[] = [];
    const applyJournal = vi.fn(async (remote: unknown[]) => {
      localJournal = [...remote];
      return remote.length;
    });

    vi.mocked(downloadFile).mockImplementation(async (name: string) => {
      if (name === 'tradescore_journal.json') {
        return { success: true, data: wrap(remoteJournal) };
      }
      return { success: false, error: 'NOT_FOUND' };
    });
    vi.mocked(uploadFiles).mockResolvedValue({ success: true, data: 'gist' });

    const { registerDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal: () => localJournal,
      getPositions: () => ({
        currentOpenTrade: null,
        openTrades: [],
        lockedPlan: null,
      }),
      getCapital: () => ({ milestoneJournal: [] }),
      applyJournalMirrorFromApk: applyJournal,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: async () => false,
      getV41Sessions: () => [],
      applyV41SessionsMirrorFromApk: async () => 0,
    });

    const { syncOnAction } = await import('../driveSyncService');
    // sync only journal via action
    vi.useFakeTimers();
    syncOnAction('JOURNAL_ENTRY_ADDED');
    await vi.advanceTimersByTimeAsync(30_000);
    vi.useRealTimers();

    expect(applyJournal).toHaveBeenCalled();
    expect(localJournal).toHaveLength(3);
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0];
    // journal must NOT be in upload batch
    expect(batch?.['tradescore_journal.json']).toBeUndefined();
  });

  it('both local and Gist empty → allow empty push (new user)', async () => {
    vi.mocked(downloadFile).mockResolvedValue({ success: false, error: 'NOT_FOUND' });
    vi.mocked(uploadFiles).mockResolvedValue({ success: true, data: 'gist' });

    const { registerDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal: () => [],
      getPositions: () => ({
        currentOpenTrade: null,
        openTrades: [],
        lockedPlan: null,
      }),
      getCapital: () => ({ milestoneJournal: [] }),
      applyJournalMirrorFromApk: async () => 0,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: async () => false,
      getV41Sessions: () => [],
    });

    const { syncAll } = await import('../driveSyncService');
    await syncAll();

    expect(uploadFiles).toHaveBeenCalled();
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0] ?? {};
    expect(Object.keys(batch)).toContain('tradescore_journal.json');
    expect(JSON.parse(batch['tradescore_journal.json'] as string).data).toEqual([]);
  });

  it('local has entries → push normally even if Gist fuller (no empty guard)', async () => {
    vi.mocked(downloadFile).mockResolvedValue({
      success: true,
      data: wrap([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    });
    vi.mocked(uploadFiles).mockResolvedValue({ success: true, data: 'gist' });

    const { registerDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal: () => [{ id: 'a' }, { id: 'b' }],
      getPositions: () => ({
        currentOpenTrade: null,
        openTrades: [],
        lockedPlan: null,
      }),
      getCapital: () => ({ milestoneJournal: [] }),
      applyJournalMirrorFromApk: async () => 0,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: async () => false,
      getV41Sessions: () => [],
    });

    vi.useFakeTimers();
    const { syncOnAction } = await import('../driveSyncService');
    syncOnAction('JOURNAL_ENTRY_ADDED');
    await vi.advanceTimersByTimeAsync(30_000);
    vi.useRealTimers();

    expect(uploadFiles).toHaveBeenCalled();
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0] ?? {};
    expect(JSON.parse(batch['tradescore_journal.json'] as string).data).toHaveLength(2);
  });

  it('post-guard: empty local does not wipe mock Gist that has data', async () => {
    const mockGist: Record<string, string> = {
      'tradescore_journal.json': wrap([{ id: 'keep-me' }]),
      'tradescore_positions.json': wrap({
        currentOpenTrade: { id: 'o1' },
        openTrades: [{ id: 'o1' }],
        lockedPlan: null,
      }),
      'tradescore_capital.json': wrap({
        currentCapital: 100,
        milestoneJournal: [{ t: 1 }],
      }),
      'tradescore_v41_sessions.json': wrap([{ id: 'v1', status: 'Running' }]),
    };

    let localJournal: unknown[] = [];
    let localPositions: unknown = {
      currentOpenTrade: null,
      openTrades: [],
      lockedPlan: null,
    };
    let localCapital: unknown = { milestoneJournal: [] };
    let localV41: unknown[] = [];

    vi.mocked(downloadFile).mockImplementation(async (name: string) => {
      const data = mockGist[name];
      if (!data) return { success: false, error: 'NOT_FOUND' };
      return { success: true, data };
    });
    vi.mocked(uploadFiles).mockImplementation(async (batch) => {
      for (const [k, v] of Object.entries(batch)) mockGist[k] = v as string;
      return { success: true, data: 'gist' };
    });

    const { registerDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal: () => localJournal,
      getPositions: () => localPositions,
      getCapital: () => localCapital,
      applyJournalMirrorFromApk: async (remote) => {
        localJournal = [...(remote as unknown[])];
        return localJournal.length;
      },
      applyPositionsMirrorFromApk: async (remote) => {
        localPositions = remote;
        return 1;
      },
      applyCapitalMirrorFromApk: async (remote) => {
        localCapital = remote;
        return true;
      },
      getV41Sessions: () => localV41,
      applyV41SessionsMirrorFromApk: async (remote) => {
        localV41 = [...(remote as unknown[])];
        return 1;
      },
    });

    const { syncAll } = await import('../driveSyncService');
    await syncAll();

    expect(JSON.parse(mockGist['tradescore_journal.json']).data).toHaveLength(1);
    expect(JSON.parse(mockGist['tradescore_journal.json']).data[0].id).toBe('keep-me');
    expect(localJournal).toHaveLength(1);
    expect(localV41).toHaveLength(1);
    expect((localPositions as { openTrades: unknown[] }).openTrades).toHaveLength(1);
    expect((localCapital as { milestoneJournal: unknown[] }).milestoneJournal).toHaveLength(1);
  });

  it('V3V4-SYNC-3c: capital helpers — milestone or non-default balances', async () => {
    const {
      isLocalDrivePayloadEmpty,
      remoteDrivePayloadHasData,
    } = await import('../driveSyncService');
    const capital = 'tradescore_capital.json' as const;

    expect(
      isLocalDrivePayloadEmpty(capital, {
        currentCapital: 34,
        initialCapital: 34,
        lastMilestoneCapital: 34,
        milestoneJournal: [],
      }),
    ).toBe(true);
    expect(isLocalDrivePayloadEmpty(capital, { milestoneJournal: [] })).toBe(true);
    expect(
      isLocalDrivePayloadEmpty(capital, {
        currentCapital: 100,
        initialCapital: 34,
        lastMilestoneCapital: 34,
        milestoneJournal: [],
      }),
    ).toBe(false);

    expect(
      remoteDrivePayloadHasData(capital, {
        currentCapital: 34,
        initialCapital: 34,
        lastMilestoneCapital: 34,
        milestoneJournal: [],
      }),
    ).toBe(false);
    expect(
      remoteDrivePayloadHasData(capital, {
        currentCapital: 34,
        initialCapital: 34,
        lastMilestoneCapital: 34,
        milestoneJournal: ['hit'],
      }),
    ).toBe(true);
    expect(
      remoteDrivePayloadHasData(capital, {
        currentCapital: 100,
        initialCapital: 34,
        lastMilestoneCapital: 34,
        milestoneJournal: [],
      }),
    ).toBe(true);
    expect(
      remoteDrivePayloadHasData(capital, {
        currentCapital: 34,
        initialCapital: 50,
        lastMilestoneCapital: 34,
        milestoneJournal: [],
      }),
    ).toBe(true);
  });

  it('V3V4-SYNC-3c: local default + Gist capital 100 (no milestone) → block + restore', async () => {
    const remoteCapital = {
      currentCapital: 100,
      initialCapital: 34,
      lastMilestoneCapital: 34,
      updatedAt: 1,
      milestoneJournal: [] as string[],
    };
    let localCapital: unknown = {
      currentCapital: 34,
      initialCapital: 34,
      lastMilestoneCapital: 34,
      milestoneJournal: [],
    };
    const applyCapital = vi.fn(async (remote: unknown) => {
      localCapital = remote;
      return true;
    });

    vi.mocked(downloadFile).mockImplementation(async (name: string) => {
      if (name === 'tradescore_capital.json') {
        return { success: true, data: wrap(remoteCapital) };
      }
      return { success: false, error: 'NOT_FOUND' };
    });
    vi.mocked(uploadFiles).mockResolvedValue({ success: true, data: 'gist' });

    const { registerDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal: () => [{ id: 'keep' }],
      getPositions: () => ({
        currentOpenTrade: { id: 'o' },
        openTrades: [{ id: 'o' }],
        lockedPlan: null,
      }),
      getCapital: () => localCapital,
      applyJournalMirrorFromApk: async () => 0,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: applyCapital,
      getV41Sessions: () => [{ id: 'v' }],
    });

    vi.useFakeTimers();
    const { syncOnAction } = await import('../driveSyncService');
    syncOnAction('CAPITAL_UPDATED');
    await vi.advanceTimersByTimeAsync(30_000);
    vi.useRealTimers();

    expect(applyCapital).toHaveBeenCalled();
    expect((localCapital as { currentCapital: number }).currentCapital).toBe(100);
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0];
    expect(batch?.['tradescore_capital.json']).toBeUndefined();
  });

  it('V3V4-SYNC-3c: local default + Gist capital also default → allow empty/default push', async () => {
    vi.mocked(downloadFile).mockImplementation(async (name: string) => {
      if (name === 'tradescore_capital.json') {
        return {
          success: true,
          data: wrap({
            currentCapital: 34,
            initialCapital: 34,
            lastMilestoneCapital: 34,
            milestoneJournal: [],
          }),
        };
      }
      return { success: false, error: 'NOT_FOUND' };
    });
    vi.mocked(uploadFiles).mockResolvedValue({ success: true, data: 'gist' });

    const { registerDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal: () => [{ id: 'x' }],
      getPositions: () => ({
        currentOpenTrade: { id: 'o' },
        openTrades: [{ id: 'o' }],
        lockedPlan: null,
      }),
      getCapital: () => ({
        currentCapital: 34,
        initialCapital: 34,
        lastMilestoneCapital: 34,
        milestoneJournal: [],
      }),
      applyJournalMirrorFromApk: async () => 0,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: async () => false,
      getV41Sessions: () => [{ id: 'v' }],
    });

    vi.useFakeTimers();
    const { syncOnAction } = await import('../driveSyncService');
    syncOnAction('CAPITAL_UPDATED');
    await vi.advanceTimersByTimeAsync(30_000);
    vi.useRealTimers();

    expect(uploadFiles).toHaveBeenCalled();
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0] ?? {};
    expect(JSON.parse(batch['tradescore_capital.json'] as string).data.currentCapital).toBe(34);
  });
});

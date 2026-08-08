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

import { uploadFiles, downloadFile } from '../githubSync';
import { persistSetJson } from '../persistStorage';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.resetModules();
  // After resetModules, clear bridge on the *fresh* module instance.
  const { clearDriveSyncStoreBridge } = await import('../driveSyncStoreBridge');
  clearDriveSyncStoreBridge();
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
    // ignore
  }
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

async function loadBridge() {
  return import('../driveSyncStoreBridge');
}

async function loadDriveSyncService() {
  return import('../driveSyncService');
}

describe('Drive sync — V41 sessions (APK master / Web mirror)', () => {
  it('V41_SESSION_UPDATED schedules tradescore_v41_sessions.json upload', async () => {
    vi.mocked(uploadFiles).mockResolvedValue({ success: true, data: 'gist-id' });

    const { registerDriveSyncStoreBridge } = await loadBridge();
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal: () => [],
      getPositions: () => ({}),
      getCapital: () => ({}),
      applyJournalMirrorFromApk: async () => 0,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: async () => false,
      getV41Sessions: () => [
        {
          id: 'v41-1',
          symbol: 'NEARUSDT',
          status: 'Running',
          action: 'SHORT',
          entry: 1.665,
        },
      ],
    });

    const { syncOnAction } = await loadDriveSyncService();
    syncOnAction('V41_SESSION_UPDATED');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(uploadFiles).toHaveBeenCalledTimes(1);
    const batch = vi.mocked(uploadFiles).mock.calls[0]?.[0] ?? {};
    expect(Object.keys(batch)).toContain('tradescore_v41_sessions.json');
    const wrapper = JSON.parse(batch['tradescore_v41_sessions.json'] as string);
    expect(wrapper.deviceId).toBe('APK');
    expect(wrapper.data[0].id).toBe('v41-1');
    expect(wrapper.data[0].status).toBe('Running');
  });

  it('Web pull applies V41 mirror including Closed sessions', async () => {
    const applyMirror = vi.fn(async (remote: unknown[]) => remote.length);
    const { registerDriveSyncStoreBridge } = await loadBridge();
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'WEB',
      getJournal: () => [],
      getPositions: () => ({}),
      getCapital: () => ({}),
      applyJournalMirrorFromApk: async () => 0,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: async () => false,
      getV41Sessions: () => [],
      applyV41SessionsMirrorFromApk: applyMirror,
    });

    vi.mocked(downloadFile).mockImplementation(async (name: string) => {
      if (name === 'tradescore_v41_sessions.json') {
        return {
          success: true,
          data: JSON.stringify({
            version: '1.0.2',
            lastUpdated: '2026-08-07T00:00:00.000Z',
            deviceId: 'APK',
            data: [
              { id: 'a', symbol: 'NEARUSDT', status: 'Running', action: 'SHORT', entry: 1.6, openedAt: 1 },
              { id: 'b', symbol: 'BTCUSDT', status: 'Closed', action: 'LONG', entry: 65000, openedAt: 2 },
            ],
          }),
        };
      }
      return { success: false, error: 'NOT_FOUND' };
    });

    const { pullFromDrive } = await loadDriveSyncService();
    const result = await pullFromDrive();
    expect(result.success).toBe(true);
    expect(result.v41SessionsUpdated).toBe(true);
    expect(applyMirror).toHaveBeenCalledTimes(1);
    const remote = applyMirror.mock.calls[0]?.[0] as unknown[];
    expect(remote).toHaveLength(2);
    expect((remote[1] as { status: string }).status).toBe('Closed');
  });

  it('mergeDriveSyncStoreBridge keeps journal handlers when adding V41', async () => {
    const getJournal = vi.fn(() => [{ id: 'j1' }]);
    const { registerDriveSyncStoreBridge, mergeDriveSyncStoreBridge } = await loadBridge();
    registerDriveSyncStoreBridge({
      getDeviceId: () => 'APK',
      getJournal,
      getPositions: () => ({}),
      getCapital: () => ({}),
      applyJournalMirrorFromApk: async () => 0,
      applyPositionsMirrorFromApk: async () => 0,
      applyCapitalMirrorFromApk: async () => false,
    });
    mergeDriveSyncStoreBridge({
      getV41Sessions: () => [{ id: 's1' }],
    });

    vi.mocked(uploadFiles).mockResolvedValue({ success: true, data: 'gist-id' });
    const { syncOnAction } = await loadDriveSyncService();
    syncOnAction('JOURNAL_ENTRY_ADDED');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getJournal).toHaveBeenCalled();
    expect(uploadFiles).toHaveBeenCalled();
  });
});

describe('useV41TradeSessionStore persist + Closed history', () => {
  it('endSession keeps Closed session and triggers sync action on APK path via store sync', async () => {
    vi.resetModules();
    const syncOnAction = vi.fn(async () => undefined);
    vi.doMock('../driveSyncService', () => ({ syncOnAction }));
    vi.doMock('../persistStorage', () => ({
      persistGetJson: vi.fn(async () => null),
      persistSetJson: persistSetJson,
      persistRemoveItem: vi.fn(async () => undefined),
    }));

    const { useV41TradeSessionStore } = await import('../../store/useV41TradeSessionStore');
    useV41TradeSessionStore.setState({ sessions: [], hydrated: true });

    const created = useV41TradeSessionStore.getState().createSession({
      symbol: 'NEARUSDT',
      action: 'SHORT',
      entry: 1.665,
      stop: 1.7,
      tp: 1.6,
      triggerType: 'Breakout Confirmed',
    });
    expect(created).not.toBeNull();
    expect(syncOnAction).toHaveBeenCalledWith('V41_SESSION_UPDATED');

    syncOnAction.mockClear();
    useV41TradeSessionStore.getState().endSession(created!.id);
    const sessions = useV41TradeSessionStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('Closed');
    expect(syncOnAction).toHaveBeenCalledWith('V41_SESSION_UPDATED');
  });
});

/**
 * @vitest-environment jsdom
 */
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { initialDriveSyncState, useDriveSyncLifecycle } from './useDriveSyncLifecycle';
import type { SyncState } from '../types/driveSync';

const pullFromDriveMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    success: true,
    journalMerged: 3,
    positionsMerged: 1,
    capitalUpdated: false,
    timestamp: new Date().toISOString(),
  }),
);

const unsubscribeMock = vi.hoisted(() => vi.fn());
const onSyncStateChangeMock = vi.hoisted(() =>
  vi.fn((listener: (state: SyncState) => void) => {
    listener({
      status: 'idle',
      lastSyncTime: null,
      pendingSync: false,
    });
    return unsubscribeMock;
  }),
);

const getSyncStateMock = vi.hoisted(() =>
  vi.fn(() => ({
    status: 'idle' as const,
    lastSyncTime: null,
    pendingSync: false,
  })),
);

const schedule12hSyncMock = vi.hoisted(() => vi.fn());
const scheduleWebPullFromApkMock = vi.hoisted(() => vi.fn());
const stopSchedulerMock = vi.hoisted(() => vi.fn());
const stopWebPullFromApkMock = vi.hoisted(() => vi.fn());

vi.mock('../services/driveSyncService', () => ({
  pullFromDrive: pullFromDriveMock,
  onSyncStateChange: onSyncStateChangeMock,
  getSyncState: getSyncStateMock,
  schedule12hSync: schedule12hSyncMock,
  scheduleWebPullFromApk: scheduleWebPullFromApkMock,
  stopScheduler: stopSchedulerMock,
  stopWebPullFromApk: stopWebPullFromApkMock,
}));

vi.mock('../store/useTradeStore', () => ({
  useTradeStore: (selector: (state: { hydrated: boolean }) => unknown) =>
    selector({ hydrated: true }),
}));

vi.mock('react-native', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-native')>();
  return {
    ...mod,
    Platform: {
      ...mod.Platform,
      OS: 'web',
    },
  };
});

function DriveSyncHost() {
  const [syncState, setSyncState] = useState<SyncState>(initialDriveSyncState);
  useDriveSyncLifecycle(setSyncState);

  return <div data-testid="drive-sync-host">{syncState.status}</div>;
}

describe('useDriveSyncLifecycle (Web app)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullFromDriveMock.mockResolvedValue({
      success: true,
      journalMerged: 3,
      positionsMerged: 1,
      capitalUpdated: false,
      timestamp: new Date().toISOString(),
    });
    onSyncStateChangeMock.mockImplementation((listener: (state: SyncState) => void) => {
      listener({
        status: 'idle',
        lastSyncTime: null,
        pendingSync: false,
      });
      return unsubscribeMock;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('Web app gọi pullFromDrive khi mount (sau hydrate)', async () => {
    render(<DriveSyncHost />);

    await waitFor(() => {
      expect(pullFromDriveMock).toHaveBeenCalledTimes(1);
    });

    expect(scheduleWebPullFromApkMock).toHaveBeenCalledTimes(1);
    expect(schedule12hSyncMock).not.toHaveBeenCalled();
    expect(onSyncStateChangeMock).toHaveBeenCalledTimes(1);
  });

  it('Web app cleanup khi unmount', async () => {
    const { unmount } = render(<DriveSyncHost />);

    await waitFor(() => {
      expect(pullFromDriveMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(stopSchedulerMock).toHaveBeenCalledTimes(1);
    expect(stopWebPullFromApkMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('pullFromDrive fail không crash app', async () => {
    pullFromDriveMock.mockResolvedValueOnce({
      success: false,
      journalMerged: 0,
      positionsMerged: 0,
      capitalUpdated: false,
      timestamp: new Date().toISOString(),
      error: 'Network unavailable',
    });

    const { getByTestId } = render(<DriveSyncHost />);

    await waitFor(() => {
      expect(pullFromDriveMock).toHaveBeenCalledTimes(1);
    });

    expect(getByTestId('drive-sync-host')).toBeTruthy();
    expect(scheduleWebPullFromApkMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { getSyncConfig, SyncStatusBadge } from './SyncStatusBadge';

describe('SyncStatusBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('hiển thị "Đang sync..." khi syncing', () => {
    render(
      <SyncStatusBadge
        syncState={{
          status: 'syncing',
          lastSyncTime: null,
          pendingSync: true,
        }}
      />,
    );

    expect(screen.getByText('Đang sync...')).toBeTruthy();
    expect(getSyncConfig('syncing', null).color).toBe('#F59E0B');
  });

  it('hiển thị thời gian khi success', () => {
    render(
      <SyncStatusBadge
        syncState={{
          status: 'success',
          lastSyncTime: '2026-06-20T10:30:00.000Z',
          pendingSync: false,
        }}
      />,
    );

    expect(screen.getByText('Sync: 17:30')).toBeTruthy();
  });

  it('hiển thị Offline khi offline', () => {
    render(
      <SyncStatusBadge
        syncState={{
          status: 'offline',
          lastSyncTime: null,
          pendingSync: false,
        }}
      />,
    );

    expect(screen.getByText('Offline')).toBeTruthy();
    expect(getSyncConfig('offline', null).color).toBe('#6B7280');
  });

  it('hiển thị dot khi pendingSync = true', () => {
    render(
      <SyncStatusBadge
        syncState={{
          status: 'idle',
          lastSyncTime: null,
          pendingSync: true,
        }}
      />,
    );

    expect(screen.getByTestId('sync-pending-dot')).toBeTruthy();
  });
});

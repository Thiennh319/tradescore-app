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

  it('hiển thị "Đang sync..." khi syncing (APK)', () => {
    render(
      <SyncStatusBadge
        webMirror={false}
        syncState={{
          status: 'syncing',
          lastSyncTime: null,
          pendingSync: true,
        }}
      />,
    );

    expect(screen.getByText('Đang sync...')).toBeTruthy();
    expect(getSyncConfig('syncing', null, false).color).toBe('#F59E0B');
  });

  it('hiển thị thời gian khi success', () => {
    render(
      <SyncStatusBadge
        webMirror={false}
        syncState={{
          status: 'success',
          lastSyncTime: '2026-06-20T10:30:00.000Z',
          pendingSync: false,
        }}
      />,
    );

    expect(screen.getByText('Sync: 17:30')).toBeTruthy();
  });

  it('hiển thị "Đang tải..." khi syncing (Web)', () => {
    render(
      <SyncStatusBadge
        webMirror
        syncState={{
          status: 'syncing',
          lastSyncTime: null,
          pendingSync: true,
        }}
      />,
    );

    expect(screen.getByText('Đang tải...')).toBeTruthy();
  });

  it('hiển thị Offline khi offline', () => {
    render(
      <SyncStatusBadge
        webMirror={false}
        syncState={{
          status: 'offline',
          lastSyncTime: null,
          pendingSync: false,
        }}
      />,
    );

    expect(screen.getByText('Offline')).toBeTruthy();
    expect(getSyncConfig('offline', null, false).color).toBe('#6B7280');
  });

  it('hiển thị Cập nhật lúc khi success (Web)', () => {
    render(
      <SyncStatusBadge
        webMirror
        syncState={{
          status: 'success',
          lastSyncTime: '2026-06-20T10:30:00.000Z',
          pendingSync: false,
        }}
      />,
    );

    expect(screen.getByText('Cập nhật lúc 17:30')).toBeTruthy();
  });

  it('hiển thị Lỗi kết nối khi offline (Web)', () => {
    render(
      <SyncStatusBadge
        webMirror
        syncState={{
          status: 'offline',
          lastSyncTime: null,
          pendingSync: false,
        }}
      />,
    );

    expect(screen.getByText('Lỗi kết nối')).toBeTruthy();
    expect(getSyncConfig('offline', null, true).color).toBe('#EF4444');
  });

  it('hiển thị Sync thất bại khi error (APK)', () => {
    render(
      <SyncStatusBadge
        webMirror={false}
        syncState={{
          status: 'error',
          lastSyncTime: null,
          pendingSync: false,
        }}
      />,
    );

    expect(screen.getByText('Sync thất bại')).toBeTruthy();
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

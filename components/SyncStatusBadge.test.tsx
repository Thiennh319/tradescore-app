/**

 * @vitest-environment jsdom

 */

import { describe, expect, it, afterEach } from 'vitest';

import { cleanup, render, screen } from '@testing-library/react';

import { getSyncConfig, SyncStatusBadge } from './SyncStatusBadge';

  it('hiển thị "Đang sync..." khi syncing', () => {

describe('SyncStatusBadge', () => {
  afterEach(() => {

    cleanup();

  });



  it('hiển thị "Đang sync..." khi syncing (APK)', () => {
    expect(getSyncConfig('syncing', null).color).toBe('#F59E0B');
    render(

  it('hiển thị thời gian khi success', () => {

        webMirror={false}

    expect(screen.getByText('Đang sync...')).toBeTruthy();

    expect(getSyncConfig('syncing', null, false).color).toBe('#F59E0B');

  });



  it('hiển thị "Đang tải..." khi syncing (Web)', () => {

  it('hiển thị Offline khi offline', () => {

      <SyncStatusBadge



    expect(screen.getByText('Đang tải...')).toBeTruthy();

  });


    expect(screen.getByText('Offline')).toBeTruthy();
    expect(getSyncConfig('offline', null).color).toBe('#6B7280');

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

});


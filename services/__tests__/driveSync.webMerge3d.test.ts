/**
 * V3V4-SYNC-3d — Web journal / V41 merge (not REPLACE).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../driveSyncService', () => ({
  syncOnAction: vi.fn(async () => undefined),
}));

vi.mock('../persistStorage', () => ({
  persistGetJson: vi.fn(async () => null),
  persistSetJson: vi.fn(async () => undefined),
  persistRemoveItem: vi.fn(async () => undefined),
}));

vi.mock('../webFileBackup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../webFileBackup')>();
  return {
    ...actual,
    writeBackupFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../webIndexedDbMirror', () => ({
  saveSnapshotToIndexedDb: vi.fn().mockResolvedValue(undefined),
  loadSnapshotFromIndexedDb: vi.fn().mockResolvedValue(null),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

describe('V3V4-SYNC-3d store merge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('useTradeStore applies journal via mergeByIdRemoteWins (not raw remote replace)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../store/useTradeStore.ts'),
      'utf8',
    );
    expect(src).toMatch(/mergeByIdRemoteWins\(local, remote\)/);
    expect(src).toMatch(/applyJournalPersist\(merged/);
    expect(src).not.toMatch(/applyJournalPersist\(remote,/);
  });

  it('mergeSessionsFromRemote keeps Closed local-only; updates shared from remote', async () => {
    const { useV41TradeSessionStore } = await import('../../store/useV41TradeSessionStore');

    useV41TradeSessionStore.setState({
      sessions: [
        {
          id: 'closed-local',
          symbol: 'BTCUSDT',
          action: 'LONG',
          status: 'Closed',
          entry: 1,
          openedAt: 1,
        } as never,
        {
          id: 'running',
          symbol: 'NEARUSDT',
          action: 'SHORT',
          status: 'Running',
          entry: 1.6,
          openedAt: 2,
          current: 1.6,
        } as never,
      ],
      hydrated: true,
    });

    const n = await useV41TradeSessionStore.getState().mergeSessionsFromRemote([
      {
        id: 'running',
        symbol: 'NEARUSDT',
        action: 'SHORT',
        status: 'Running',
        entry: 1.665,
        openedAt: 2,
        current: 1.64,
      } as never,
      {
        id: 'new-pending',
        symbol: 'ETHUSDT',
        action: 'LONG',
        status: 'Pending',
        entry: 3000,
        openedAt: 3,
      } as never,
    ]);

    expect(n).toBeGreaterThan(0);
    const sessions = useV41TradeSessionStore.getState().sessions;
    expect(sessions.map((s) => s.id).sort()).toEqual([
      'closed-local',
      'new-pending',
      'running',
    ]);
    expect(sessions.find((s) => s.id === 'running')!.entry).toBe(1.665);
    expect(sessions.find((s) => s.id === 'closed-local')!.status).toBe('Closed');
  });

  it('mergeSessionsFromRemote with empty remote does not wipe local sessions', async () => {
    const { useV41TradeSessionStore } = await import('../../store/useV41TradeSessionStore');
    useV41TradeSessionStore.setState({
      sessions: [
        {
          id: 'keep',
          symbol: 'BTCUSDT',
          action: 'LONG',
          status: 'Closed',
          entry: 1,
          openedAt: 1,
        } as never,
      ],
      hydrated: true,
    });
    const n = await useV41TradeSessionStore.getState().mergeSessionsFromRemote([]);
    expect(n).toBe(0);
    expect(useV41TradeSessionStore.getState().sessions).toHaveLength(1);
  });
});
